import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dummyBrokers } from "@/data/dummy-brokers";
import { db, sql } from "@/db/client";
import { brokers, optOutProcesses, processMails, users } from "@/db/schema";
import { createId, createProcessToken } from "@/lib/ids";
import { matchInbound, type ProcessMailRow } from "@/lib/mail/match-inbound";

const REPLY_DOMAIN = "reply.jba-team.com";

let userId: string;
let processId: string;
let token: string;
let outboundMsgId: string;

// Vollstaendige ProcessMailRow mit Defaults; matchInbound liest nur
// toAddress/subject/headers/rawPayload.
function makeInbound(overrides: Partial<ProcessMailRow>): ProcessMailRow {
  return {
    id: "inbound-test-id",
    processId: null,
    direction: "inbound",
    providerMessageId: "inbound-msg",
    fromAddress: "broker@broker.example",
    toAddress: "",
    subject: null,
    bodyText: null,
    bodyHtml: null,
    headers: null,
    rawPayload: null,
    sentAt: null,
    receivedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

beforeAll(async () => {
  token = createProcessToken();
  outboundMsgId = `outbound-msg-${createId()}@ses`;

  const emailDummy = dummyBrokers.find((b) => b.slug === "dummy-broker-email");
  if (!emailDummy) {
    throw new Error("Fixture dummy-broker-email fehlt");
  }
  const [broker] = await db
    .insert(brokers)
    .values(emailDummy)
    .onConflictDoUpdate({ target: brokers.slug, set: { isDummy: true } })
    .returning();

  const [user] = await db
    .insert(users)
    .values({ email: `match-test-${createId()}@example.com` })
    .returning();
  userId = user.id;

  const [proc] = await db
    .insert(optOutProcesses)
    .values({ userId, brokerId: broker.id, processToken: token })
    .returning();
  processId = proc.id;

  // Outbound-Mail mit bekannter provider_message_id fuer Stufe 3.
  await db.insert(processMails).values({
    processId,
    direction: "outbound",
    providerMessageId: outboundMsgId,
    fromAddress: "removals@jba-team.com",
    toAddress: "optout@broker.example",
    sentAt: new Date(),
  });
});

afterAll(async () => {
  // Prozess loeschen kaskadiert process_mails + process_events; dann User.
  await db.delete(optOutProcesses).where(eq(optOutProcesses.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
  await sql.end();
});

describe("matchInbound", () => {
  it("Stufe 1: Token im sauberen To-Header", async () => {
    const result = await matchInbound(makeInbound({ toAddress: `proc-${token}@${REPLY_DOMAIN}` }));
    expect(result).toEqual({
      processId,
      matchStage: 1,
      confidence: "high",
    });
  });

  it("Stufe 1: Token im ToFull-Array (nicht in toAddress)", async () => {
    const result = await matchInbound(
      makeInbound({
        toAddress: "support@broker.example",
        rawPayload: {
          ToFull: [{ Email: "support@broker.example" }, { Email: `proc-${token}@${REPLY_DOMAIN}` }],
        },
      }),
    );
    expect(result.matchStage).toBe(1);
    expect(result.processId).toBe(processId);
    expect(result.confidence).toBe("high");
  });

  it("Stufe 2: Subject mit 'Re: [Ref: ...]'", async () => {
    const result = await matchInbound(
      makeInbound({
        toAddress: "noreply@broker.example",
        subject: `Re: [Ref: ${token}] Datenlöschanfrage`,
      }),
    );
    expect(result).toEqual({ processId, matchStage: 2, confidence: "high" });
  });

  it("Stufe 2: Subject mit deutschem 'AW: [Ref: ...]'", async () => {
    const result = await matchInbound(
      makeInbound({
        toAddress: "noreply@broker.example",
        subject: `AW: [Ref: ${token}] Ihre Anfrage`,
      }),
    );
    expect(result.matchStage).toBe(2);
    expect(result.processId).toBe(processId);
  });

  it("Stufe 3: In-Reply-To zeigt auf bekannte Outbound-Message-ID", async () => {
    const result = await matchInbound(
      makeInbound({
        toAddress: "noreply@broker.example",
        subject: "Ihre Anfrage",
        headers: { "In-Reply-To": `<${outboundMsgId}>` },
      }),
    );
    expect(result).toEqual({ processId, matchStage: 3, confidence: "medium" });
  });

  it("Stufe 3: References enthaelt bekannte ID (In-Reply-To fehlt)", async () => {
    const result = await matchInbound(
      makeInbound({
        toAddress: "noreply@broker.example",
        subject: "Ihre Anfrage",
        headers: {
          References: `<other-${createId()}@x> <${outboundMsgId}> <another@y>`,
        },
      }),
    );
    expect(result.matchStage).toBe(3);
    expect(result.processId).toBe(processId);
    expect(result.confidence).toBe("medium");
  });

  it("Stufe 4: nichts matched (leere/unbekannte Felder, kein Crash)", async () => {
    const result = await matchInbound(makeInbound({ toAddress: "", subject: null, headers: null }));
    expect(result).toEqual({
      processId: null,
      matchStage: 4,
      confidence: "low",
    });
  });

  it("Edge: gueltiges Token-Format im To, aber Prozess existiert nicht -> Stufe 4", async () => {
    const result = await matchInbound(
      makeInbound({ toAddress: `proc-0000000000000000@${REPLY_DOMAIN}` }),
    );
    expect(result.matchStage).toBe(4);
    expect(result.processId).toBeNull();
  });

  it("Edge: kein To-Header -> faellt auf Stufe 2 durch (kein Crash)", async () => {
    const result = await matchInbound(
      makeInbound({
        toAddress: "",
        headers: null,
        rawPayload: null,
        subject: `Re: [Ref: ${token}] Datenlöschanfrage`,
      }),
    );
    expect(result.matchStage).toBe(2);
    expect(result.processId).toBe(processId);
  });
});
