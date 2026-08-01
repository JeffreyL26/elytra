import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { brokers, optOutProcesses, processEvents, processMails } from "@/db/schema";
import type { ProcessStatus } from "@/lib/customer-status";

// ADMIN-/OPS-SICHT: Dieses Modul liest BEWUSST tenant-uebergreifend (alle
// User), fuer Triage der Review-Queue und Auswertung laufender Runden. Es
// umgeht den mandantengetrennten *ForUser-Layer (user-data-access.ts) mit
// Absicht -- und darf deshalb NIEMALS als kundenseitiger Endpunkt exponiert
// oder aus Kunden-Routen aufgerufen werden. Nur CLI/ELYTRA.

// Ab wann gilt ein in_progress-Vorgang als haengend? in_progress kennt im
// Datenmodell keine Frist -- ein Ticketsystem-Ack ("Ihre Anfrage wird unter
// ABISPRIVACY-110 gefuehrt", siehe Fixture) setzt den Status und danach passiert
// womoeglich nie wieder etwas. Genau durch diese Luecke parken Vorgaenge
// unbemerkt. 14 Tage sind bewusst kuerzer als die 30-Tage-Antwortfrist der
// DSGVO: wer nach zwei Wochen nur eine Vorgangsnummer hat, sollte nachfassen
// koennen, bevor die Frist ablaeuft.
export const ATTENTION_STALE_DAYS = 14;

// Ab wann gilt ein kontaktierter Vorgang als ueberfaellig? Art. 12 Abs. 3 DSGVO
// gibt dem Verantwortlichen einen Monat -- danach ist Schweigen kein
// Normalzustand mehr.
export const ATTENTION_OVERDUE_DAYS = 30;

// Warum steht der Vorgang auf der Liste? Steuert die Triage-Reihenfolge und die
// Anzeige in ELYTRA.
export type AttentionReason =
  | "failed"
  | "manual_review"
  | "stale_in_progress"
  | "overdue_contacted";

export interface AttentionProcess {
  processId: string;
  brokerSlug: string;
  brokerName: string;
  status: ProcessStatus;
  isSelfRequest: boolean;
  processToken: string;
  // Warum der Vorgang Aufmerksamkeit braucht (unabhaengig vom reason-Payload
  // des letzten Events).
  attentionReason: AttentionReason;
  // Seit wann er in diesem Zustand haengt (Grundlage der Faelligkeitsrechnung).
  waitingSince: Date | null;
  createdAt: Date;
  // Zeitpunkt des juengsten status_changed-Events; null, wenn der Status nie
  // ueber ein Event gesetzt wurde (z. B. direkt geseedet).
  statusChangedAt: Date | null;
  // payload.reason des juengsten status_changed-Events.
  reason: string | null;
  // Nur bei reason=conflict_terminal: von-wo, versucht-was, aus welchem Pfad.
  conflict: { from: string | null; attempted: string | null; source: string | null } | null;
  // Nur bei status=failed, falls die Outbound-Zeile Bounce-Infos traegt.
  // Quelle heute: headers.bounceType/bouncedAt -- siehe TODO[bounce] in
  // getAttentionProcesses(), Bounce-Handling existiert noch nicht.
  bounce: { bounceType: string | null; bouncedAt: string | null } | null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function daysAgo(days: number, now: Date): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export async function getAttentionProcesses(now: Date = new Date()): Promise<AttentionProcess[]> {
  // EIN Abfragepfad fuer alle vier Aufmerksamkeitsgruende: failed und
  // manual_review sind immer dabei, in_progress und contacted nur, wenn sie zu
  // lange still sind (Fristpruefung unten, weil sie am juengsten Ereignis
  // haengt und nicht am Status allein).
  const rows = await db
    .select({
      processId: optOutProcesses.id,
      status: optOutProcesses.status,
      isSelfRequest: optOutProcesses.isSelfRequest,
      processToken: optOutProcesses.processToken,
      lastContactedAt: optOutProcesses.lastContactedAt,
      createdAt: optOutProcesses.createdAt,
      brokerSlug: brokers.slug,
      brokerName: brokers.name,
    })
    .from(optOutProcesses)
    .innerJoin(brokers, eq(optOutProcesses.brokerId, brokers.id))
    .where(
      inArray(optOutProcesses.status, ["failed", "manual_review", "in_progress", "contacted"]),
    );

  const staleBefore = daysAgo(ATTENTION_STALE_DAYS, now);
  const overdueBefore = daysAgo(ATTENTION_OVERDUE_DAYS, now);

  const result: AttentionProcess[] = [];
  for (const row of rows) {
    const [lastChange] = await db
      .select({ payload: processEvents.payload, createdAt: processEvents.createdAt })
      .from(processEvents)
      .where(
        and(
          eq(processEvents.processId, row.processId),
          eq(processEvents.eventType, "status_changed"),
        ),
      )
      .orderBy(desc(processEvents.createdAt))
      .limit(1);

    const payload = (lastChange?.payload ?? {}) as Record<string, unknown>;
    const reason = str(payload.reason);

    // Faelligkeit: seit wann haengt der Vorgang? Fuer contacted ist der
    // Versandzeitpunkt die ehrlichere Basis als das Event, fuer in_progress der
    // letzte Statuswechsel. Fallback jeweils auf createdAt.
    const waitingSince =
      row.status === "contacted"
        ? (row.lastContactedAt ?? lastChange?.createdAt ?? row.createdAt)
        : (lastChange?.createdAt ?? row.createdAt);

    let attentionReason: AttentionReason;
    if (row.status === "failed") {
      attentionReason = "failed";
    } else if (row.status === "manual_review") {
      attentionReason = "manual_review";
    } else if (row.status === "in_progress") {
      // Ein Ticket-Ack sieht wie Fortschritt aus. Nach der Frist ist er keiner.
      if (waitingSince >= staleBefore) {
        continue;
      }
      attentionReason = "stale_in_progress";
    } else {
      // contacted: erst nach ueberschrittener Monatsfrist auffaellig.
      if (waitingSince >= overdueBefore) {
        continue;
      }
      attentionReason = "overdue_contacted";
    }

    // TODO[bounce]: Bounce-Handling ist noch nicht real gebaut -- diese Stelle
    // liest ERSATZWEISE aus process_mails.headers (dorthin schreibt heute
    // niemand Bounce-Infos; das Feld bleibt in der Praxis leer).
    //
    // Geplante Architektur, sobald gebaut:
    //   - nullable Spalten bounced_at / bounce_type auf den Outbound-Zeilen
    //     (KEIN dritter Wert im mail_direction-Enum -- ein Bounce ist eine
    //     Eigenschaft der gesendeten Mail, keine eigene Richtung),
    //   - mail_bounced-Event in process_events,
    //   - Postmark-Bounce-Webhook als Ausloeser.
    // Dann liest diese CLI die Spalten statt der headers.
    //
    // Sinnvoll baubar, sobald der erste echte Bounce auftritt -- spaetestens
    // vor der Beta.
    let bounce: AttentionProcess["bounce"] = null;
    if (row.status === "failed") {
      const [outbound] = await db
        .select({ headers: processMails.headers })
        .from(processMails)
        .where(
          and(eq(processMails.processId, row.processId), eq(processMails.direction, "outbound")),
        )
        .orderBy(desc(processMails.createdAt))
        .limit(1);
      const headers = (outbound?.headers ?? {}) as Record<string, unknown>;
      const bounceType = str(headers.bounceType);
      const bouncedAt = str(headers.bouncedAt);
      if (bounceType || bouncedAt) {
        bounce = { bounceType, bouncedAt };
      }
    }

    result.push({
      processId: row.processId,
      brokerSlug: row.brokerSlug,
      brokerName: row.brokerName,
      status: row.status,
      isSelfRequest: row.isSelfRequest,
      processToken: row.processToken,
      attentionReason,
      waitingSince,
      createdAt: row.createdAt,
      statusChangedAt: lastChange?.createdAt ?? null,
      reason,
      conflict:
        reason === "conflict_terminal"
          ? {
              from: str(payload.from),
              attempted: str(payload.attempted),
              source: str(payload.source),
            }
          : null,
      bounce,
    });
  }

  // Triage-Reihenfolge: erst was kaputt ist, dann was eine Entscheidung
  // braucht, dann was nur still ist. Innerhalb einer Gruppe der aelteste
  // Vorgang zuerst -- er wartet am laengsten.
  const ORDER: Record<AttentionReason, number> = {
    failed: 0,
    manual_review: 1,
    stale_in_progress: 2,
    overdue_contacted: 3,
  };
  result.sort((a, b) => {
    const byReason = ORDER[a.attentionReason] - ORDER[b.attentionReason];
    if (byReason !== 0) {
      return byReason;
    }
    const aw = a.waitingSince?.getTime() ?? 0;
    const bw = b.waitingSince?.getTime() ?? 0;
    return aw - bw || a.brokerSlug.localeCompare(b.brokerSlug);
  });
  return result;
}
