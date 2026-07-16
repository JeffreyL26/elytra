import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { optOutProcesses, processEvents, processMails, type processStatusEnum } from "@/db/schema";
import {
  type Classification,
  classifyInbound,
  type InboundCategory,
} from "@/lib/llm/classify-inbound";
import { extractAttachmentTexts } from "@/lib/mail/extract-attachment-text";
import { matchInbound } from "@/lib/mail/match-inbound";
import { resolveTransition } from "@/lib/status-transitions";

export interface ProcessInboundMailPayload {
  processMailId: string;
}

// Schlanke Zusammenfassung fuer das Worker-Log (eine Zeile pro Mail).
export interface ProcessInboundResult {
  messageId: string | null;
  matchStage: 1 | 2 | 3 | 4;
  category: InboundCategory | null;
  confidence: number | null;
}

type ProcessStatus = (typeof processStatusEnum.enumValues)[number];

// Mapping LLM-Kategorie -> Prozess-Status. null = Status bleibt unveraendert.
const STATUS_MAP: Record<InboundCategory, ProcessStatus | null> = {
  success: "success",
  no_data_held: "no_data_held",
  blacklisted: "blacklisted",
  in_progress: "in_progress",
  rejected: "failed",
  unrelated: null,
};

// Override-Reihenfolge: needsManualReview schlaegt das Kategorie-Mapping.
function resolveStatus(classification: Classification): ProcessStatus | null {
  if (classification.needsManualReview) {
    return "manual_review";
  }
  return STATUS_MAP[classification.category];
}

// Statuswechsel laeuft ausschliesslich ueber die Uebergangsmatrix
// (resolveTransition). Drei Ausgaenge:
//   set      -> uebernehmen, status_changed mit der Aufrufer-reason
//   confirm  -> Terminalstatus bestaetigt: kein Event, kein UPDATE (kein
//               Event-Spam). Die Mail bleibt gespeichert und klassifiziert.
//   conflict -> Terminalstatus widersprochen: manual_review statt incoming,
//               das Event haelt from/attempted/reason fest, damit ein Mensch
//               von-wo-nach-wo rekonstruieren kann.
// Die widersprechende Mail selbst wird NIE verworfen -- manual_review heisst
// "Mensch schaut", nicht "Information wegwerfen".
async function setStatus(
  processId: string,
  oldStatus: ProcessStatus | null,
  targetStatus: ProcessStatus,
  reason: string,
): Promise<void> {
  const { next, kind } = resolveTransition(oldStatus, targetStatus);

  if (kind === "confirm" || oldStatus === next) {
    return;
  }

  const payload =
    kind === "conflict"
      ? {
          from: oldStatus,
          to: next,
          attempted: targetStatus,
          reason: "conflict_terminal",
          // Provenienz: aus welchem Aufrufpfad kam der widersprechende Wert?
          // Haelt "LLM unsicher" von "Broker widerspricht sich" unterscheidbar.
          source: reason,
        }
      : { from: oldStatus, to: next, reason };

  await db.insert(processEvents).values({
    processId,
    eventType: "status_changed",
    payload,
  });
  await db
    .update(optOutProcesses)
    .set({ status: next, updatedAt: new Date() })
    .where(eq(optOutProcesses.id, processId));
}

// Verarbeitet eine eingegangene Mail: Matching -> (Klassifikation) ->
// Status-Update, alles als process_events protokolliert. LLM-API-Fehler werden
// abgefangen (Prozess -> manual_review, kein Throw, damit pg-boss nicht retryt).
// DB-Fehler propagieren bewusst (transient -> pg-boss-Retry).
export async function processInboundMail(processMailId: string): Promise<ProcessInboundResult> {
  const [mail] = await db
    .select()
    .from(processMails)
    .where(eq(processMails.id, processMailId))
    .limit(1);
  if (!mail) {
    throw new Error(`process_mail ${processMailId} not found`);
  }

  const match = await matchInbound(mail);

  // Stufe 4: kein Prozess. Mail bleibt unzugeordnet (process_id = NULL) und
  // damit in der ELYTRA-"unzugeordnet"-Queue. Kein Event/Status moeglich
  // (process_events.process_id ist NOT NULL), kein LLM-Call.
  if (!match.processId) {
    return {
      messageId: mail.providerMessageId,
      matchStage: match.matchStage,
      category: null,
      confidence: null,
    };
  }
  const processId = match.processId;

  await db.update(processMails).set({ processId }).where(eq(processMails.id, processMailId));

  await db.insert(processEvents).values({
    processId,
    eventType: "mail_received",
    payload: {
      mailId: processMailId,
      matchStage: match.matchStage,
      confidence: match.confidence,
    },
  });

  const [proc] = await db
    .select({ status: optOutProcesses.status })
    .from(optOutProcesses)
    .where(eq(optOutProcesses.id, processId))
    .limit(1);
  const oldStatus = proc?.status ?? null;

  // Anhang-Texte (z. B. PDF-Datenauskunft) fliessen mit in die Klassifikation
  // -- die Substanz einer Antwort kann vollstaendig im Anhang stecken.
  const attachments = await extractAttachmentTexts(mail.rawPayload);

  let classification: Classification;
  try {
    classification = await classifyInbound({
      subject: mail.subject,
      textBody: mail.bodyText,
      fromAddress: mail.fromAddress,
      attachments,
    });
  } catch (error) {
    // API-Fehler sind selten durch Retry behebbar (Rate-Limit, Key, Down) ->
    // manuelle Sachbearbeitung statt Retry-Storm gegen Anthropic.
    await db.insert(processEvents).values({
      processId,
      eventType: "error",
      payload: {
        stage: "classify",
        errorMessage: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : "UnknownError",
        mailId: processMailId,
      },
    });
    await setStatus(processId, oldStatus, "manual_review", "classify_error");
    return {
      messageId: mail.providerMessageId,
      matchStage: match.matchStage,
      category: null,
      confidence: null,
    };
  }

  await db.insert(processEvents).values({
    processId,
    eventType: "email_classified",
    payload: {
      mailId: processMailId,
      category: classification.category,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
      model: classification.model,
      promptVersion: classification.promptVersion,
      needsManualReview: classification.needsManualReview,
      // Audit: welche Anhaenge sahen wir, und kam ihr Text beim LLM an?
      attachments: attachments.map(({ name, text, note }) => ({
        name,
        extracted: text !== null,
        ...(note ? { note } : {}),
      })),
    },
  });

  const targetStatus = resolveStatus(classification);
  if (targetStatus) {
    const reason = classification.needsManualReview
      ? "low_confidence"
      : `classified_${classification.category}`;
    await setStatus(processId, oldStatus, targetStatus, reason);
  }

  return {
    messageId: mail.providerMessageId,
    matchStage: match.matchStage,
    category: classification.category,
    confidence: classification.confidence,
  };
}
