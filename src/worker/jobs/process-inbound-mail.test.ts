import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Anthropic-SDK mocken (kein echter API-Call). matchInbound + DB sind real.
const { messagesCreate } = vi.hoisted(() => ({ messagesCreate: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: messagesCreate };
  },
}));

import { eq } from "drizzle-orm";
import { dummyBrokers } from "@/data/dummy-brokers";
import { db, sql } from "@/db/client";
import { brokers, optOutProcesses, processEvents, processMails, users } from "@/db/schema";
import { createId, createProcessToken } from "@/lib/ids";
import { CLASSIFY_MODEL } from "@/lib/llm/classify-inbound";
import { processInboundMail } from "@/worker/jobs/process-inbound-mail";

const REPLY_DOMAIN = "reply.jba-team.com";

let brokerId: string;
const createdUserIds: string[] = [];
const createdMailIds: string[] = [];

function mockClassification(
  category: string,
  confidence: number,
  reasoning = "synthetische Begruendung",
) {
  messagesCreate.mockResolvedValue({
    content: [
      {
        type: "tool_use",
        name: "classify_email",
        input: { category, confidence, reasoning },
      },
    ],
  });
}

async function createProcess(token: string): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `inbound-test-${createId()}@example.com` })
    .returning();
  createdUserIds.push(user.id);
  const [proc] = await db
    .insert(optOutProcesses)
    .values({ userId: user.id, brokerId, processToken: token, status: "contacted" })
    .returning();
  return proc.id;
}

async function insertInbound(toAddress: string, subject = "Antwort"): Promise<string> {
  const [mail] = await db
    .insert(processMails)
    .values({
      direction: "inbound",
      providerMessageId: `inbound-${createId()}`,
      fromAddress: "support@broker.example",
      toAddress,
      subject,
      bodyText: "Wir haben Ihre Daten geloescht.",
      receivedAt: new Date(),
    })
    .returning({ id: processMails.id });
  createdMailIds.push(mail.id);
  return mail.id;
}

beforeAll(async () => {
  const emailDummy = dummyBrokers.find((b) => b.slug === "dummy-broker-email");
  if (!emailDummy) {
    throw new Error("Fixture dummy-broker-email fehlt");
  }
  const [broker] = await db
    .insert(brokers)
    .values(emailDummy)
    .onConflictDoUpdate({ target: brokers.slug, set: { isDummy: true } })
    .returning();
  brokerId = broker.id;
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  if (createdMailIds.length > 0) {
    await db.delete(processMails).where(inArray(processMails.id, createdMailIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(optOutProcesses).where(inArray(optOutProcesses.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  await sql.end();
});

describe("processInboundMail", () => {
  it("Stufe-1-Match + success: setzt process_id, loggt Events, Status=success", async () => {
    const token = createProcessToken();
    const processId = await createProcess(token);
    const mailId = await insertInbound(`proc-${token}@${REPLY_DOMAIN}`, "Re: Loeschung");
    mockClassification("success", 0.95, "Loeschung bestaetigt");

    await processInboundMail(mailId);

    const [mail] = await db.select().from(processMails).where(eq(processMails.id, mailId));
    expect(mail.processId).toBe(processId);

    const events = await db
      .select()
      .from(processEvents)
      .where(eq(processEvents.processId, processId));
    const types = events.map((e) => e.eventType);
    expect(types).toContain("mail_received");
    expect(types).toContain("email_classified");
    expect(types).toContain("status_changed");

    const classified = events.find((e) => e.eventType === "email_classified");
    expect(classified?.payload).toMatchObject({
      mailId,
      category: "success",
      confidence: 0.95,
      reasoning: "Loeschung bestaetigt",
      model: CLASSIFY_MODEL,
      needsManualReview: false,
    });

    const [proc] = await db.select().from(optOutProcesses).where(eq(optOutProcesses.id, processId));
    expect(proc.status).toBe("success");
  });

  it("Klassifikation no_data_held: Terminal-Status no_data_held", async () => {
    const token = createProcessToken();
    const processId = await createProcess(token);
    const mailId = await insertInbound(`proc-${token}@${REPLY_DOMAIN}`, "AW: Auskunft");
    mockClassification("no_data_held", 0.9, "Broker haelt keine Daten zur Person");

    await processInboundMail(mailId);

    const [proc] = await db.select().from(optOutProcesses).where(eq(optOutProcesses.id, processId));
    expect(proc.status).toBe("no_data_held");

    const events = await db
      .select()
      .from(processEvents)
      .where(eq(processEvents.processId, processId));
    const classified = events.find((e) => e.eventType === "email_classified");
    expect(classified?.payload).toMatchObject({
      category: "no_data_held",
      attachments: [],
    });
  });

  it("Stufe 4 (kein Match): Mail bleibt unzugeordnet, kein LLM-Call", async () => {
    const mailId = await insertInbound("fremde-adresse@nirgendwo.example", "Irgendwas");

    await processInboundMail(mailId);

    const [mail] = await db.select().from(processMails).where(eq(processMails.id, mailId));
    expect(mail.processId).toBeNull();
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("LLM-Fehler: error-Event + Status=manual_review, kein Throw", async () => {
    const token = createProcessToken();
    const processId = await createProcess(token);
    const mailId = await insertInbound(`proc-${token}@${REPLY_DOMAIN}`);
    messagesCreate.mockRejectedValue(new Error("rate limited"));

    await expect(processInboundMail(mailId)).resolves.toBeUndefined();

    const events = await db
      .select()
      .from(processEvents)
      .where(eq(processEvents.processId, processId));
    const types = events.map((e) => e.eventType);
    expect(types).toContain("mail_received");
    const errorEvent = events.find((e) => e.eventType === "error");
    expect(errorEvent?.payload).toMatchObject({
      stage: "classify",
      errorMessage: "rate limited",
      errorName: "Error",
    });

    const [proc] = await db.select().from(optOutProcesses).where(eq(optOutProcesses.id, processId));
    expect(proc.status).toBe("manual_review");
  });
});
