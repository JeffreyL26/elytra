import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { brokers, optOutProcesses, processEvents, processMails } from "@/db/schema";
import type { ProcessStatus } from "@/lib/customer-status";

// ADMIN-/OPS-SICHT: Dieses Modul liest BEWUSST tenant-uebergreifend (alle
// User), fuer Triage der Review-Queue und Auswertung laufender Runden. Es
// umgeht den mandantengetrennten *ForUser-Layer (user-data-access.ts) mit
// Absicht -- und darf deshalb NIEMALS als kundenseitiger Endpunkt exponiert
// oder aus Kunden-Routen aufgerufen werden. Nur CLI/ELYTRA.

export interface AttentionProcess {
  processId: string;
  brokerSlug: string;
  brokerName: string;
  status: ProcessStatus;
  isSelfRequest: boolean;
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

export async function getAttentionProcesses(): Promise<AttentionProcess[]> {
  const rows = await db
    .select({
      processId: optOutProcesses.id,
      status: optOutProcesses.status,
      isSelfRequest: optOutProcesses.isSelfRequest,
      brokerSlug: brokers.slug,
      brokerName: brokers.name,
    })
    .from(optOutProcesses)
    .innerJoin(brokers, eq(optOutProcesses.brokerId, brokers.id))
    .where(inArray(optOutProcesses.status, ["failed", "manual_review"]));

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

  // Nach reason gruppiert (alphabetisch, unbekannte ans Ende), innerhalb
  // dessen nach Broker -- Triage-Reihenfolge.
  result.sort((a, b) => {
    const ra = a.reason ?? "zz_unbekannt";
    const rb = b.reason ?? "zz_unbekannt";
    return ra.localeCompare(rb) || a.brokerSlug.localeCompare(b.brokerSlug);
  });
  return result;
}
