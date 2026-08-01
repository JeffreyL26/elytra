import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { brokers, optOutProcesses, processEvents } from "@/db/schema";
import type { ProcessStatus } from "@/lib/customer-status";

// ADMIN-/OPS-SICHT (ELYTRA). Liest wie attention-processes.ts BEWUSST
// tenant-uebergreifend und umgeht den *ForUser-Layer -- darf deshalb NIEMALS
// kundenseitig exponiert werden. Alle Aufrufer liegen hinter
// requireAdminSession().
//
// Die Aufmerksamkeitsliste selbst lebt weiterhin ausschliesslich in
// attention-processes.ts (ein Abfragepfad). Hier liegen nur die Sichten, die
// sie NICHT abdeckt: der Statusfilter und die Detailansicht eines Vorgangs.

export interface ElytraProcessRow {
  processId: string;
  brokerSlug: string;
  brokerName: string;
  status: ProcessStatus;
  isSelfRequest: boolean;
  processToken: string;
  lastContactedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getProcessesByStatus(status: ProcessStatus): Promise<ElytraProcessRow[]> {
  return db
    .select({
      processId: optOutProcesses.id,
      brokerSlug: brokers.slug,
      brokerName: brokers.name,
      status: optOutProcesses.status,
      isSelfRequest: optOutProcesses.isSelfRequest,
      processToken: optOutProcesses.processToken,
      lastContactedAt: optOutProcesses.lastContactedAt,
      createdAt: optOutProcesses.createdAt,
      updatedAt: optOutProcesses.updatedAt,
    })
    .from(optOutProcesses)
    .innerJoin(brokers, eq(optOutProcesses.brokerId, brokers.id))
    .where(eq(optOutProcesses.status, status))
    .orderBy(desc(optOutProcesses.updatedAt));
}

export interface ElytraEvent {
  id: string;
  eventType: string;
  createdAt: Date;
  // Payload bewusst als flaches Record durchgereicht -- die Detailansicht
  // zeigt nur ausgewaehlte Schluessel (siehe PII-Hinweis unten).
  payload: Record<string, unknown>;
}

export interface ElytraProcessDetail extends ElytraProcessRow {
  events: ElytraEvent[];
}

// Detailansicht eines Vorgangs inkl. Event-Verlauf (Klassifikationen,
// Statuswechsel, Fehler).
//
// PII-DISZIPLIN: Es werden bewusst KEINE Mail-Volltexte geladen. Die
// Sachbearbeitung braucht den Verlauf und die Klassifikation, nicht den
// Schriftverkehr -- und process_mails.body_text traegt Fremd-PII des
// Broker-Absenders (Retention-Thema, siehe retention-raw-payload.ts).
export async function getProcessDetail(processId: string): Promise<ElytraProcessDetail | null> {
  const [row] = await db
    .select({
      processId: optOutProcesses.id,
      brokerSlug: brokers.slug,
      brokerName: brokers.name,
      status: optOutProcesses.status,
      isSelfRequest: optOutProcesses.isSelfRequest,
      processToken: optOutProcesses.processToken,
      lastContactedAt: optOutProcesses.lastContactedAt,
      createdAt: optOutProcesses.createdAt,
      updatedAt: optOutProcesses.updatedAt,
    })
    .from(optOutProcesses)
    .innerJoin(brokers, eq(optOutProcesses.brokerId, brokers.id))
    .where(eq(optOutProcesses.id, processId))
    .limit(1);
  if (!row) {
    return null;
  }

  const events = await db
    .select({
      id: processEvents.id,
      eventType: processEvents.eventType,
      createdAt: processEvents.createdAt,
      payload: processEvents.payload,
    })
    .from(processEvents)
    .where(eq(processEvents.processId, processId))
    .orderBy(asc(processEvents.createdAt));

  return {
    ...row,
    events: events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      createdAt: e.createdAt,
      payload: (e.payload ?? {}) as Record<string, unknown>,
    })),
  };
}
