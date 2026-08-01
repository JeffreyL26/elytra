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
  // Bracketed Message-ID-Form -- exakt so, wie send.ts sie als Header setzt
  // und in provider_message_id ablegt.
  outboundMsgId = `<proc-${token}-${createId().slice(0, 8)}@jba-team.com>`;

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

  // REALER FALL statt Loopback (Befund 01.08.2026): Broker antworten an die
  // FROM-Adresse, nicht an Reply-To. Im tokenized-Modus ist die From-Adresse
  // proc-<token>@<REPLY_DOMAIN> -- die Antwort geht also genau dorthin.
  // Zusaetzlich weicht die Realitaet in zwei weiteren Punkten vom Loopback ab:
  // ein Ticketsystem stellt seine EIGENE Vorgangsnummer VOR unseren Ref-Block
  // (ABIS: "ABISPRIVACY-110"), und der Absender ist eine andere Adresse als
  // die, an die wir gesendet haben (Regis24 antwortete aus datenschutz@,
  // adressiert war eine andere Mailbox). Alle drei gleichzeitig:
  it("Realfall tokenized: Antwort an die From-Adresse, fremde Ticketnummer im Betreff, anderer Absender", async () => {
    const result = await matchInbound(
      makeInbound({
        // 1. Antwort geht an unsere tokenisierte From-Adresse.
        toAddress: `proc-${token}@${REPLY_DOMAIN}`,
        // 2. Ticketsystem-Nummer VOR unserem Ref-Block.
        subject: `AW: (ABISPRIVACY-110) [Ref: ${token}] Auskunfts- und Löschersuchen gemäß Art. 15, 17, 21 DSGVO`,
        // 3. Absender weicht von der Zieladresse des Versands ab.
        fromAddress: "ticket-system@abis-online.de",
      }),
    );
    // Stufe 1 greift: der Token steckt in der To-Adresse.
    expect(result).toEqual({ processId, matchStage: 1, confidence: "high" });
  });

  it("Realfall: fremde Ticketnummer vor dem Ref-Block bricht auch Stufe 2 nicht", async () => {
    const result = await matchInbound(
      makeInbound({
        // Kein Token in To -- z. B. ein Altvorgang aus dem self-Modus, bei dem
        // der Broker an SELF_EMAIL geantwortet und jemand die Mail
        // weitergeleitet hat.
        toAddress: "jeffrey@jba-team.com",
        subject: `AW: (ABISPRIVACY-110) [Ref: ${token}] Auskunfts- und Löschersuchen`,
        fromAddress: "ticket-system@abis-online.de",
      }),
    );
    expect(result).toEqual({ processId, matchStage: 2, confidence: "high" });
  });

  it("Realfall: Ticketsystem-Betreff OHNE unseren Ref-Block bleibt unzugeordnet", async () => {
    // Gegenprobe: nimmt ein Ticketsystem den Betreff komplett neu auf und die
    // Antwort geht an eine nicht-tokenisierte Adresse, ist Stufe 4 korrekt --
    // die Mail landet in der ELYTRA-Queue statt falsch zugeordnet zu werden.
    const result = await matchInbound(
      makeInbound({
        toAddress: "jeffrey@jba-team.com",
        subject: "[ABISPRIVACY-110] Ihre Datenschutzanfrage",
        fromAddress: "ticket-system@abis-online.de",
      }),
    );
    expect(result).toEqual({ processId: null, matchStage: 4, confidence: "low" });
  });

  it("Stufe 3: In-Reply-To zeigt auf bekannte Outbound-Message-ID", async () => {
    const result = await matchInbound(
      makeInbound({
        toAddress: "noreply@broker.example",
        subject: "Ihre Anfrage",
        headers: { "In-Reply-To": outboundMsgId },
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
          References: `<other-${createId()}@x> ${outboundMsgId} <another@y>`,
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
