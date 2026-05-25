import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { optOutProcesses, processEvents, processMails, type processStatusEnum } from "@/db/schema";
import {
  type Classification,
  classifyInbound,
  type InboundCategory,
} from "@/lib/llm/classify-inbound";
import { matchInbound } from "@/lib/mail/match-inbound";

export interface ProcessInboundMailPayload {
  processMailId: string;
}

type ProcessStatus = (typeof processStatusEnum.enumValues)[number];

// Mapping LLM-Kategorie -> Prozess-Status. null = Status bleibt unveraendert.
const STATUS_MAP: Record<InboundCategory, ProcessStatus | null> = {
  success: "success",
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

// Schreibt status_changed + UPDATE nur, wenn sich der Status wirklich aendert.
async function setStatus(
  processId: string,
  oldStatus: ProcessStatus | null,
  newStatus: ProcessStatus,
  reason: string,
): Promise<void> {
  if (oldStatus === newStatus) {
    return;
  }
  await db.insert(processEvents).values({
    processId,
    eventType: "status_changed",
    payload: { from: oldStatus, to: newStatus, reason },
  });
  await db
    .update(optOutProcesses)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(optOutProcesses.id, processId));
}

// Verarbeitet eine eingegangene Mail: Matching -> (Klassifikation) ->
// Status-Update, alles als process_events protokolliert. LLM-API-Fehler werden
// abgefangen (Prozess -> manual_review, kein Throw, damit pg-boss nicht retryt).
// DB-Fehler propagieren bewusst (transient -> pg-boss-Retry).
export async function processInboundMail(processMailId: string): Promise<void> {
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
    return;
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

  let classification: Classification;
  try {
    classification = await classifyInbound({
      subject: mail.subject,
      textBody: mail.bodyText,
      fromAddress: mail.fromAddress,
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
    return;
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
    },
  });

  const targetStatus = resolveStatus(classification);
  if (targetStatus) {
    const reason = classification.needsManualReview
      ? "low_confidence"
      : `classified_${classification.category}`;
    await setStatus(processId, oldStatus, targetStatus, reason);
  }
}
