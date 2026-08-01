import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { optOutProcesses, processEvents } from "@/db/schema";
import type { ProcessStatus } from "@/lib/customer-status";
import {
  MANUAL_KNOWLEDGE_SOURCES,
  MANUAL_RESOLUTION_REASON,
  MANUAL_TERMINAL_STATUSES,
  type ManualKnowledgeSource,
  type ManualTerminalStatus,
} from "@/lib/manual-resolution-contract";
import { resolveTransition } from "@/lib/status-transitions";

// MANUELLER PROZESSABSCHLUSS (ELYTRA). Der automatisierte Service ist der
// Default; dies ist der dokumentierte Ausnahmepfad, wenn etwas ausserhalb des
// Mailkanals passiert oder ein Vorgang haengt.
//
// ROLLENKLARSTELLUNG (bestimmt die Erkenntnisquelle): Postalische Antworten
// gehen an die ANSCHRIFT DES KUNDEN -- der Sachbearbeiter sieht den Brief nie.
// Manueller Abschluss ist deshalb zweierlei:
//   (a) bei Self-Requests: eigene Feststellung (wir sind selbst Adressat),
//   (b) bei Kundenvorgaengen: Dokumentation einer KUNDENMELDUNG, keine eigene
//       Pruefung.
// Deshalb ist die Erkenntnisquelle ein PFLICHTFELD und ein SEPARATES Feld im
// Event-Payload -- nicht in den reason gemischt: reason sagt, WIE der Status
// zustande kam (resolved_manual), knowledgeSource sagt, WORAUF er beruht.

// Konstanten/Typen liegen im DB-freien Vertrag (manual-resolution-contract.ts),
// damit die Client-Komponente sie nutzen kann, ohne den postgres-Client ins
// Browser-Bundle zu ziehen. Hier re-exportiert fuer Server-Aufrufer.
export {
  MANUAL_KNOWLEDGE_SOURCES,
  MANUAL_RESOLUTION_REASON,
  MANUAL_TERMINAL_STATUSES,
  type ManualKnowledgeSource,
  type ManualTerminalStatus,
};

export interface ManualResolutionInput {
  processId: string;
  targetStatus: ManualTerminalStatus;
  // Freitext, Pflicht. Was wurde festgestellt bzw. was hat der Kunde berichtet?
  note: string;
  knowledgeSource: ManualKnowledgeSource;
  // userId des handelnden Admins -- der Audit-Trail muss zeigen, dass ein
  // MENSCH entschieden hat, nicht die Klassifikation.
  adminUserId: string;
}

export type ManualResolutionError =
  | "process_not_found"
  | "invalid_status"
  | "note_required"
  | "invalid_knowledge_source";

export type ManualResolutionResult =
  | { ok: true; from: ProcessStatus; to: ManualTerminalStatus }
  | { ok: false; error: ManualResolutionError };

export async function resolveProcessManually(
  input: ManualResolutionInput,
): Promise<ManualResolutionResult> {
  if (!MANUAL_TERMINAL_STATUSES.includes(input.targetStatus)) {
    return { ok: false, error: "invalid_status" };
  }
  if (input.note.trim() === "") {
    return { ok: false, error: "note_required" };
  }
  if (!MANUAL_KNOWLEDGE_SOURCES.includes(input.knowledgeSource)) {
    return { ok: false, error: "invalid_knowledge_source" };
  }

  const [proc] = await db
    .select({ id: optOutProcesses.id, status: optOutProcesses.status })
    .from(optOutProcesses)
    .where(eq(optOutProcesses.id, input.processId))
    .limit(1);
  if (!proc) {
    return { ok: false, error: "process_not_found" };
  }

  // Der Wechsel laeuft ueber die Uebergangsmatrix, NICHT daran vorbei -- im
  // manuellen Kontext, der auch auf terminalem Status setzen darf (und damit
  // einen eskalierten conflict_terminal-Fall aufloest).
  const { next } = resolveTransition(proc.status, input.targetStatus, "manual");

  await db.insert(processEvents).values({
    processId: proc.id,
    eventType: "status_changed",
    payload: {
      from: proc.status,
      to: next,
      reason: MANUAL_RESOLUTION_REASON,
      knowledgeSource: input.knowledgeSource,
      note: input.note.trim(),
      adminUserId: input.adminUserId,
    },
  });
  await db
    .update(optOutProcesses)
    .set({ status: next, updatedAt: new Date() })
    .where(eq(optOutProcesses.id, proc.id));

  return { ok: true, from: proc.status, to: next as ManualTerminalStatus };
}
