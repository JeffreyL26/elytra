import { and, eq, like } from "drizzle-orm";
import { db } from "@/db/client";
import {
  brokerResponseStats,
  optOutProcesses,
  processEvents,
  users,
  verification,
} from "@/db/schema";

// Konto-Loeschung (Multi-Tenant Schritt 5). HARTE Loeschung aller
// personenbezogenen Daten + eng begrenzter, echt anonymer Empirie-Extrakt.
//
// Ablauf in EINER Transaktion:
//   1. Empirie-Extrakt ziehen: pro email_classified-Event der Prozesse des
//      Users EIN broker_response_stats-Datensatz (nur Broker/Kategorie/
//      Confidence/Modell/Monat -- kein Personenbezug, siehe Schema-Kommentar).
//   2. verification-Zeilen des Users entfernen (kein FK moeglich: Better Auth
//      adressiert per identifier; der traegt bei E-Mail-Flows die Adresse).
//   3. User loeschen -> Cascade raeumt customer_profiles, opt_out_processes,
//      darueber process_mails + process_events, sowie session + account.
//
// BEWUSST KEIN Guard gegen "aktive Prozesse" (anders als Profil-DELETE, das
// mit 409 processes_active ablehnt): Konto-Loeschung ist ein Betroffenenrecht
// und darf nicht an laufenden Vorgaengen scheitern. Laufende Prozesse werden
// durch den Cascade beendet -- das Mandat erlischt mit dem Konto.

export interface AccountDeletionResult {
  deleted: boolean;
  statsExtracted: number;
}

// Rundet auf den Monatsersten (UTC) -- date-Spalte erwartet "YYYY-MM-DD".
function toMonth(timestamp: Date): string {
  return `${timestamp.toISOString().slice(0, 7)}-01`;
}

export async function deleteAccount(userId: string): Promise<AccountDeletionResult> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) {
      return { deleted: false, statsExtracted: 0 };
    }

    // 1. Empirie-Extrakt VOR der Loeschung: alle Klassifikations-Events der
    // Prozesse dieses Users. Nur die anonymen Felder verlassen die Transaktion
    // in Richtung broker_response_stats.
    const classified = await tx
      .select({
        brokerId: optOutProcesses.brokerId,
        payload: processEvents.payload,
        createdAt: processEvents.createdAt,
      })
      .from(processEvents)
      .innerJoin(optOutProcesses, eq(processEvents.processId, optOutProcesses.id))
      .where(
        and(eq(optOutProcesses.userId, userId), eq(processEvents.eventType, "email_classified")),
      );

    const stats = classified.flatMap((event) => {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const category = payload.category;
      // Ohne Kategorie ist der Datensatz empirisch wertlos -- ueberspringen.
      if (typeof category !== "string") {
        return [];
      }
      return [
        {
          brokerId: event.brokerId,
          category,
          confidence: typeof payload.confidence === "number" ? payload.confidence : null,
          model: typeof payload.model === "string" ? payload.model : null,
          promptVersion: typeof payload.promptVersion === "string" ? payload.promptVersion : null,
          respondedMonth: toMonth(event.createdAt),
        },
      ];
    });
    if (stats.length > 0) {
      await tx.insert(brokerResponseStats).values(stats);
    }

    // 2. verification aufraeumen (identifier-basiert, traegt die E-Mail).
    await tx.delete(verification).where(like(verification.identifier, `%${user.email}%`));

    // 3. Harte Loeschung; die FK-Kette (siehe Migration 0007) raeumt den Rest.
    await tx.delete(users).where(eq(users.id, userId));

    return { deleted: true, statsExtracted: stats.length };
  });
}
