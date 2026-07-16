import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, sql } from "@/db/client";
import { brokers, optOutProcesses, processEvents, processMails, users } from "@/db/schema";
import { getAttentionProcesses } from "@/lib/attention-processes";
import { createId, createProcessToken } from "@/lib/ids";

const BROKER_SLUG = `test-attention-${createId().slice(0, 8)}`;

let brokerId: string;
const userIds: string[] = [];
let failedProcessId: string;
let reviewProcessId: string;
let contactedProcessId: string;

async function createProcess(status: "failed" | "manual_review" | "contacted"): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `attention-${createId()}@example.org` })
    .returning({ id: users.id });
  userIds.push(user.id);
  const [proc] = await db
    .insert(optOutProcesses)
    .values({ userId: user.id, brokerId, processToken: createProcessToken(), status })
    .returning({ id: optOutProcesses.id });
  return proc.id;
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

  it("zeigt Prozesse in anderen Status NICHT", async () => {
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

  it("sortiert nach reason gruppiert (Triage-Reihenfolge)", async () => {
    const all = await getAttentionProcesses();
    const reasons = all.map((p) => p.reason ?? "zz_unbekannt");
    expect([...reasons].sort((a, b) => a.localeCompare(b))).toEqual(reasons);
  });
});
