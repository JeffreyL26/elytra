import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, sql } from "@/db/client";
import { brokers, optOutProcesses, processEvents, processMails, users } from "@/db/schema";
import {
  ATTENTION_OVERDUE_DAYS,
  ATTENTION_STALE_DAYS,
  getAttentionProcesses,
} from "@/lib/attention-processes";
import { createId, createProcessToken } from "@/lib/ids";

const BROKER_SLUG = `test-attention-${createId().slice(0, 8)}`;

let brokerId: string;
const userIds: string[] = [];
let failedProcessId: string;
let reviewProcessId: string;
let contactedProcessId: string;
let staleInProgressId: string;
let freshInProgressId: string;
let overdueContactedId: string;

type TestStatus = "failed" | "manual_review" | "contacted" | "in_progress";

async function createProcess(
  status: TestStatus,
  fields: { lastContactedAt?: Date } = {},
): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `attention-${createId()}@example.org` })
    .returning({ id: users.id });
  userIds.push(user.id);
  const [proc] = await db
    .insert(optOutProcesses)
    .values({
      userId: user.id,
      brokerId,
      processToken: createProcessToken(),
      status,
      ...fields,
    })
    .returning({ id: optOutProcesses.id });
  return proc.id;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

beforeAll(async () => {
  const [broker] = await db
    .insert(brokers)
    .values({
      slug: BROKER_SLUG,
      name: "Attention Test Broker",
      optOutMethod: "email",
      optOutEmail: "privacy@attention.example",
      isDummy: true,
      isActive: false,
    })
    .returning({ id: brokers.id });
  brokerId = broker.id;

  failedProcessId = await createProcess("failed");
  reviewProcessId = await createProcess("manual_review");
  contactedProcessId = await createProcess("contacted");

  await db.insert(processEvents).values({
    processId: failedProcessId,
    eventType: "status_changed",
    payload: { from: "contacted", to: "failed", reason: "classified_rejected" },
  });
  // Outbound-Zeile mit vorbereiteten Bounce-Infos in headers.
  await db.insert(processMails).values({
    processId: failedProcessId,
    direction: "outbound",
    providerMessageId: `attention-out-${createId()}`,
    fromAddress: "self@example.org",
    toAddress: "privacy@attention.example",
    subject: "Anfrage",
    headers: { bounceType: "HardBounce", bouncedAt: "2026-07-15T10:00:00Z" },
    sentAt: new Date(),
  });

  // Der conflict_terminal-Fall aus der Uebergangsmatrix.
  await db.insert(processEvents).values({
    processId: reviewProcessId,
    eventType: "status_changed",
    payload: {
      from: "no_data_held",
      to: "manual_review",
      attempted: "success",
      reason: "conflict_terminal",
      source: "classified_success",
    },
  });

  // Der ABIS-Fall: ein Ticket-Ack setzte in_progress und danach passierte
  // nichts mehr. Der Statuswechsel liegt bewusst vor der Staleness-Frist.
  staleInProgressId = await createProcess("in_progress");
  await db.insert(processEvents).values({
    processId: staleInProgressId,
    eventType: "status_changed",
    payload: { from: "contacted", to: "in_progress", reason: "classified_in_progress" },
    createdAt: daysAgo(ATTENTION_STALE_DAYS + 6),
  });

  // Gegenprobe: gerade erst in Bearbeitung gegangen -> noch kein Fall fuer die Liste.
  freshInProgressId = await createProcess("in_progress");
  await db.insert(processEvents).values({
    processId: freshInProgressId,
    eventType: "status_changed",
    payload: { from: "contacted", to: "in_progress", reason: "classified_in_progress" },
    createdAt: daysAgo(1),
  });

  // Kontaktiert, aber die Monatsfrist ist ueberschritten.
  overdueContactedId = await createProcess("contacted", {
    lastContactedAt: daysAgo(ATTENTION_OVERDUE_DAYS + 5),
  });
});

afterAll(async () => {
  await db.delete(optOutProcesses).where(inArray(optOutProcesses.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
  await db.delete(brokers).where(eq(brokers.id, brokerId));
  await sql.end();
});

describe("getAttentionProcesses", () => {
  it("listet failed- und manual_review-Prozesse mit korrektem reason", async () => {
    const all = await getAttentionProcesses();
    const ours = all.filter((p) => p.brokerSlug === BROKER_SLUG);

    const failed = ours.find((p) => p.processId === failedProcessId);
    expect(failed?.status).toBe("failed");
    expect(failed?.reason).toBe("classified_rejected");
    expect(failed?.statusChangedAt).toBeInstanceOf(Date);

    const review = ours.find((p) => p.processId === reviewProcessId);
    expect(review?.status).toBe("manual_review");
    expect(review?.reason).toBe("conflict_terminal");
  });

  it("zeigt frisch kontaktierte Prozesse NICHT (Frist laeuft noch)", async () => {
    const all = await getAttentionProcesses();
    expect(all.map((p) => p.processId)).not.toContain(contactedProcessId);
  });

  it("liefert bei conflict_terminal from/attempted/source aus dem Payload", async () => {
    const all = await getAttentionProcesses();
    const review = all.find((p) => p.processId === reviewProcessId);
    expect(review?.conflict).toEqual({
      from: "no_data_held",
      attempted: "success",
      source: "classified_success",
    });
  });

  it("liefert bei failed die Bounce-Infos aus der Outbound-Zeile, falls vorhanden", async () => {
    const all = await getAttentionProcesses();
    const failed = all.find((p) => p.processId === failedProcessId);
    expect(failed?.bounce).toEqual({
      bounceType: "HardBounce",
      bouncedAt: "2026-07-15T10:00:00Z",
    });
    // Der review-Prozess (nicht failed) traegt keine Bounce-Infos.
    const review = all.find((p) => p.processId === reviewProcessId);
    expect(review?.bounce).toBeNull();
  });

  it("sortiert nach Aufmerksamkeitsgrund (Triage-Reihenfolge)", async () => {
    const all = await getAttentionProcesses();
    const ORDER = ["failed", "manual_review", "stale_in_progress", "overdue_contacted"];
    const ranks = all.map((p) => ORDER.indexOf(p.attentionReason));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });
});

// Die Luecke, durch die der ABIS-Vorgang unbemerkt parkte: ein Ticket-Ack setzt
// in_progress, und in_progress kennt im Datenmodell keine Frist.
describe("Staleness-Kriterium", () => {
  it("listet einen ueberfaelligen in_progress-Vorgang als stale_in_progress", async () => {
    const all = await getAttentionProcesses();
    const stale = all.find((p) => p.processId === staleInProgressId);
    expect(stale?.attentionReason).toBe("stale_in_progress");
    expect(stale?.status).toBe("in_progress");
    expect(stale?.waitingSince).toBeInstanceOf(Date);
  });

  it("listet einen frischen in_progress-Vorgang NICHT", async () => {
    const all = await getAttentionProcesses();
    expect(all.map((p) => p.processId)).not.toContain(freshInProgressId);
  });

  it("listet einen ueberfaellig kontaktierten Vorgang als overdue_contacted", async () => {
    const all = await getAttentionProcesses();
    const overdue = all.find((p) => p.processId === overdueContactedId);
    expect(overdue?.attentionReason).toBe("overdue_contacted");
    expect(overdue?.status).toBe("contacted");
  });

  it("die Frist ist stichtagsabhaengig: mit frueherem 'now' faellt der stale-Vorgang raus", async () => {
    // 'now' um zwei Wochen zurueckgedreht -> der Vorgang war damals frisch.
    const earlier = new Date(Date.now() - (ATTENTION_STALE_DAYS + 5) * 86_400_000);
    const all = await getAttentionProcesses(earlier);
    expect(all.map((p) => p.processId)).not.toContain(staleInProgressId);
  });
});
