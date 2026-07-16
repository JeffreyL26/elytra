import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, sql } from "@/db/client";
import { brokers, optOutProcesses, processEvents, processMails, users } from "@/db/schema";
import { createId, createProcessToken } from "@/lib/ids";
import { runRetention } from "@/lib/retention-raw-payload";

// Eigener Broker-Slug gegen Parallel-Kollisionen mit anderen Test-Dateien.
const BROKER_SLUG = `test-retention-${createId().slice(0, 8)}`;
const RETENTION_DAYS = 90;
const OLD = new Date(Date.now() - 120 * 86_400_000);
const YOUNG = new Date(Date.now() - 5 * 86_400_000);

let brokerId: string;
let userId: string;
let reviewUserId: string;
let contactedProcessId: string;
let reviewProcessId: string;
let oldMailId: string;
let youngMailId: string;
let reviewMailId: string;

function fullRawPayload(messageId: string): Record<string, unknown> {
  return {
    MessageID: messageId,
    From: "support@broker.example",
    To: "proc-token@reply.example",
    Subject: "Antwort auf Loeschanfrage",
    Date: "Mon, 01 Jun 2026 12:00:00 +0000",
    TextBody: "Vertraulicher Volltext mit PII",
    HtmlBody: "<p>Vertraulicher Volltext mit PII</p>",
    Attachments: [
      {
        Name: "auskunft.pdf",
        ContentType: "application/pdf",
        ContentLength: 12345,
        Content: "QkFTRTY0LUlOSEFMVC1NSVQtUElJ",
      },
    ],
  };
}

async function insertInbound(
  processId: string,
  receivedAt: Date,
  messageId: string,
): Promise<string> {
  const [mail] = await db
    .insert(processMails)
    .values({
      processId,
      direction: "inbound",
      providerMessageId: messageId,
      fromAddress: "support@broker.example",
      toAddress: "proc-token@reply.example",
      subject: "Antwort",
      bodyText: "Body",
      rawPayload: fullRawPayload(messageId),
      receivedAt,
    })
    .returning({ id: processMails.id });
  return mail.id;
}

beforeAll(async () => {
  const [broker] = await db
    .insert(brokers)
    .values({
      slug: BROKER_SLUG,
      name: "Retention Test Broker",
      optOutMethod: "email",
      optOutEmail: "privacy@retention.example",
      isDummy: true,
      isActive: false,
    })
    .returning({ id: brokers.id });
  brokerId = broker.id;

  const [user] = await db
    .insert(users)
    .values({ email: `retention-${createId()}@example.org` })
    .returning({ id: users.id });
  userId = user.id;

  const [contacted] = await db
    .insert(optOutProcesses)
    .values({ userId, brokerId, processToken: createProcessToken(), status: "contacted" })
    .returning({ id: optOutProcesses.id });
  contactedProcessId = contacted.id;

  // Eigener User: unique (userId, brokerId) erlaubt nur einen Prozess pro Paar.
  const [reviewUser] = await db
    .insert(users)
    .values({ email: `retention-review-${createId()}@example.org` })
    .returning({ id: users.id });
  reviewUserId = reviewUser.id;

  const [review] = await db
    .insert(optOutProcesses)
    .values({
      userId: reviewUserId,
      brokerId,
      processToken: createProcessToken(),
      status: "manual_review",
    })
    .returning({ id: optOutProcesses.id });
  reviewProcessId = review.id;

  oldMailId = await insertInbound(contactedProcessId, OLD, `retention-old-${createId()}`);
  youngMailId = await insertInbound(contactedProcessId, YOUNG, `retention-young-${createId()}`);
  reviewMailId = await insertInbound(reviewProcessId, OLD, `retention-review-${createId()}`);

  // Klassifikations-Event zur alten Mail -- der Extrakt soll es uebernehmen.
  await db.insert(processEvents).values({
    processId: contactedProcessId,
    eventType: "email_classified",
    payload: {
      mailId: oldMailId,
      category: "no_data_held",
      confidence: 0.95,
      model: "claude-haiku-4-5-20251001",
      promptVersion: "2026-07-04",
      reasoning: "Broker haelt keine Daten zur Person",
    },
  });
});

afterAll(async () => {
  await db
    .delete(optOutProcesses)
    .where(inArray(optOutProcesses.id, [contactedProcessId, reviewProcessId]));
  await db.delete(users).where(inArray(users.id, [userId, reviewUserId]));
  await db.delete(brokers).where(eq(brokers.id, brokerId));
  await sql.end();
});

// Bewusst serieller Ablauf (ein describe, Reihenfolge traegt Semantik):
// dry-run -> apply -> idempotenter Zweitlauf arbeiten auf demselben Bestand.
describe("runRetention", () => {
  it("Dry-Run: listet nur die alte Nicht-Review-Mail und schreibt NICHTS", async () => {
    const result = await runRetention({ days: RETENTION_DAYS, apply: false });

    const ourCandidates = result.candidates.filter((c) =>
      [oldMailId, youngMailId, reviewMailId].includes(c.mailId),
    );
    expect(ourCandidates.map((c) => c.mailId)).toEqual([oldMailId]);
    expect(ourCandidates[0]?.ageDays).toBeGreaterThanOrEqual(119);
    expect(result.appliedCount).toBe(0);

    const [mail] = await db.select().from(processMails).where(eq(processMails.id, oldMailId));
    expect(mail.rawPayload?.TextBody).toBe("Vertraulicher Volltext mit PII");
  });

  it("Apply: verdichtet, behaelt den Extrakt und entfernt Base64 + Volltext", async () => {
    const result = await runRetention({ days: RETENTION_DAYS, apply: true });
    const ours = result.candidates.filter((c) => c.mailId === oldMailId);
    expect(ours).toHaveLength(1);

    const [mail] = await db.select().from(processMails).where(eq(processMails.id, oldMailId));
    const payload = mail.rawPayload as Record<string, unknown>;

    // Extrakt vorhanden.
    expect(payload.retentionApplied).toBe(true);
    expect(payload.providerMessageId).toContain("retention-old-");
    expect(payload.from).toBe("support@broker.example");
    expect(payload.subject).toBe("Antwort auf Loeschanfrage");
    expect(payload.classification).toMatchObject({
      category: "no_data_held",
      confidence: 0.95,
      promptVersion: "2026-07-04",
      reasoning: "Broker haelt keine Daten zur Person",
    });
    // Anhang-Metadaten bleiben, Content faellt weg.
    expect(payload.attachments).toEqual([
      { name: "auskunft.pdf", contentType: "application/pdf", contentLength: 12345 },
    ]);
    expect(JSON.stringify(payload)).not.toContain("QkFTRTY0");
    // Volltext weg.
    expect(payload.TextBody).toBeUndefined();
    expect(payload.HtmlBody).toBeUndefined();
  });

  it("Idempotent: zweiter Apply-Lauf findet 0 eigene Kandidaten", async () => {
    const result = await runRetention({ days: RETENTION_DAYS, apply: true });
    const ours = result.candidates.filter((c) =>
      [oldMailId, youngMailId, reviewMailId].includes(c.mailId),
    );
    expect(ours).toEqual([]);
  });

  it("ueberspringt junge Mails (Fenster nicht abgelaufen)", async () => {
    const [mail] = await db.select().from(processMails).where(eq(processMails.id, youngMailId));
    expect(mail.rawPayload?.TextBody).toBe("Vertraulicher Volltext mit PII");
  });

  it("ueberspringt Mails an Prozessen in manual_review (Mensch braucht Rohtext)", async () => {
    const [mail] = await db.select().from(processMails).where(eq(processMails.id, reviewMailId));
    expect(mail.rawPayload?.TextBody).toBe("Vertraulicher Volltext mit PII");
    expect(mail.rawPayload?.retentionApplied).toBeUndefined();
  });
});
