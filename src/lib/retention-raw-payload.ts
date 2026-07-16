import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { optOutProcesses, processEvents, processMails } from "@/db/schema";
import { env } from "@/lib/env";

// Retention fuer process_mails.raw_payload: Das JSONB enthaelt Base64-Anhaenge
// und Volltext (HTML/Text) eingehender Mails -- unverschluesselte PII, die wir
// nicht dauerhaft brauchen. Nach Ablauf des Fensters wird das Feld auf einen
// minimalen Audit-/Re-Klassifikations-Extrakt eingedampft. Zeilen werden NIE
// geloescht, nur das raw_payload-Feld verdichtet; body_text/body_html-Spalten
// bleiben unberuehrt.
//
// TODO[legal-review]: Das Retention-Fenster (Default 90 Tage) ist letztlich
// eine Policy-/Rechtsentscheidung (Speicherbegrenzung Art. 5 Abs. 1 lit. e
// DSGVO vs. Nachweisinteresse), KEIN technischer Default. Vor Produktivbetrieb
// mit Anwalt festziehen.
export const DEFAULT_RETENTION_DAYS = 90;

export function resolveRetentionDays(): number {
  return env.RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS;
}

// Sicherheits-Ausschluesse (werden in der Query erzwungen):
//   (a) Mail juenger als das Fenster -> nicht anfassen.
//   (b) Prozess in manual_review -> nicht anfassen (ein Mensch braucht dort
//       evtl. den Rohtext).
//   (c) Mails ohne Prozess (process_id NULL, Matching-Stufe 4) -> nicht
//       anfassen. Das ist die "unzugeordnet"-Queue fuer ELYTRA -- dieselbe
//       Mensch-schaut-Logik wie (b). Der Inner Join unten schliesst sie aus.
//   (d) Bereits verdichtete Zeilen (Marker retentionApplied) -> idempotent
//       ueberspringen.

interface ClassificationExtract {
  category: string | null;
  confidence: number | null;
  model: string | null;
  promptVersion: string | null;
  reasoning: string | null;
}

// Minimaler Extrakt: was Audit + eine etwaige Re-Klassifikation braucht.
// Base64-Anhaenge und Volltext (TextBody/HtmlBody) fallen weg; von den
// Anhaengen bleiben nur Metadaten.
export function buildRetentionExtract(
  rawPayload: Record<string, unknown>,
  classification: ClassificationExtract | null,
): Record<string, unknown> {
  const attachments = Array.isArray(rawPayload.Attachments)
    ? rawPayload.Attachments.map((attachment) => {
        const a = attachment as Record<string, unknown>;
        return {
          name: typeof a.Name === "string" ? a.Name : null,
          contentType: typeof a.ContentType === "string" ? a.ContentType : null,
          contentLength: typeof a.ContentLength === "number" ? a.ContentLength : null,
        };
      })
    : [];

  return {
    retentionApplied: true,
    retentionAppliedAt: new Date().toISOString(),
    providerMessageId: rawPayload.MessageID ?? null,
    from: rawPayload.From ?? null,
    to: rawPayload.To ?? null,
    subject: rawPayload.Subject ?? null,
    date: rawPayload.Date ?? null,
    attachments,
    classification,
  };
}

export interface RetentionCandidate {
  mailId: string;
  processId: string;
  ageDays: number;
}

export interface RetentionRunResult {
  days: number;
  candidates: RetentionCandidate[];
  appliedCount: number;
}

// Findet verdichtbare Zeilen und verdichtet sie bei apply=true. Bei
// apply=false (Dry-Run) wird ausschliesslich gelesen.
export async function runRetention(options: {
  days: number;
  apply: boolean;
}): Promise<RetentionRunResult> {
  const cutoff = new Date(Date.now() - options.days * 86_400_000);

  const rows = await db
    .select({
      mailId: processMails.id,
      processId: optOutProcesses.id,
      rawPayload: processMails.rawPayload,
      effectiveAt: sql<string>`coalesce(${processMails.receivedAt}, ${processMails.createdAt})`,
    })
    .from(processMails)
    .innerJoin(optOutProcesses, eq(processMails.processId, optOutProcesses.id))
    .where(
      and(
        isNotNull(processMails.rawPayload),
        ne(optOutProcesses.status, "manual_review"),
        // Date im rohen sql-Fragment wird von postgres-js nicht serialisiert
        // -> ISO-String mit explizitem Cast.
        sql`coalesce(${processMails.receivedAt}, ${processMails.createdAt}) < ${cutoff.toISOString()}::timestamptz`,
        sql`(${processMails.rawPayload} ->> 'retentionApplied') IS DISTINCT FROM 'true'`,
      ),
    )
    .orderBy(processMails.createdAt);

  const now = Date.now();
  const candidates: RetentionCandidate[] = rows.map((row) => ({
    mailId: row.mailId,
    processId: row.processId,
    ageDays: Math.floor((now - new Date(row.effectiveAt).getTime()) / 86_400_000),
  }));

  if (!options.apply) {
    return { days: options.days, candidates, appliedCount: 0 };
  }

  let appliedCount = 0;
  for (const row of rows) {
    // rawPayload ist durch isNotNull in der Query garantiert.
    if (!row.rawPayload) {
      continue;
    }

    // Juengste Klassifikation dieser Mail (falls vorhanden) in den Extrakt
    // uebernehmen -- Kernbegruendung inklusive.
    const [event] = await db
      .select({ payload: processEvents.payload })
      .from(processEvents)
      .where(
        and(
          eq(processEvents.processId, row.processId),
          eq(processEvents.eventType, "email_classified"),
          sql`${processEvents.payload} ->> 'mailId' = ${row.mailId}`,
        ),
      )
      .orderBy(desc(processEvents.createdAt))
      .limit(1);

    let classification: ClassificationExtract | null = null;
    if (event?.payload && typeof event.payload === "object") {
      const p = event.payload as Record<string, unknown>;
      classification = {
        category: typeof p.category === "string" ? p.category : null,
        confidence: typeof p.confidence === "number" ? p.confidence : null,
        model: typeof p.model === "string" ? p.model : null,
        promptVersion: typeof p.promptVersion === "string" ? p.promptVersion : null,
        reasoning: typeof p.reasoning === "string" ? p.reasoning : null,
      };
    }

    await db
      .update(processMails)
      .set({ rawPayload: buildRetentionExtract(row.rawPayload, classification) })
      .where(eq(processMails.id, row.mailId));
    appliedCount++;
  }

  return { days: options.days, candidates, appliedCount };
}
