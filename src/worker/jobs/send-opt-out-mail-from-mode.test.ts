import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// env + Postmark-Versand mocken, bevor der Job sie importiert: so laesst sich
// der From-Modus umschalten, ohne die echte .env anzufassen, und es geht
// garantiert nichts raus.
const { mockEnv, sendMailMock } = vi.hoisted(() => ({
  mockEnv: {
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    SELF_EMAIL: "jeffrey@jba-team.com" as string | undefined,
    MAIL_FROM_ADDRESS: "removals@jba-team.com" as string | undefined,
    REPLY_DOMAIN: "reply.jba-team.com" as string | undefined,
    MAIL_BROKER_FROM_MODE: "self" as "self" | "tokenized",
  },
  sendMailMock: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: mockEnv }));
vi.mock("@/lib/mail/send", () => ({ sendMail: sendMailMock }));

import { db, sql } from "@/db/client";
import { brokers, customerProfiles, optOutProcesses, processMails, users } from "@/db/schema";
import { createId } from "@/lib/ids";
import { sendOptOutMail } from "@/worker/jobs/send-opt-out-mail";

const SLUG = `dummy-frommode-${createId().slice(0, 8)}`;
const userIds: string[] = [];
let brokerId: string;

// opt_out_processes ist unique auf (user_id, broker_id) -- fuer jeden Prozess
// gegen denselben Broker braucht es deshalb einen eigenen User samt Profil.
async function newProcess(): Promise<{ id: string; token: string }> {
  const [user] = await db
    .insert(users)
    .values({ email: `frommode-${createId()}@example.org` })
    .returning({ id: users.id });
  userIds.push(user.id);
  await db.insert(customerProfiles).values({
    userId: user.id,
    firstName: "Test",
    lastName: "Person",
    emailAddresses: ["test.person@example.org"],
    postalAddresses: [{ street: "Teststr. 1", postalCode: "10115", city: "Berlin", country: "DE" }],
  });
  const [proc] = await db
    .insert(optOutProcesses)
    .values({ userId: user.id, brokerId, isSelfRequest: true })
    .returning({ id: optOutProcesses.id, token: optOutProcesses.processToken });
  return proc;
}

beforeAll(async () => {
  const [broker] = await db
    .insert(brokers)
    .values({
      slug: SLUG,
      name: "From-Mode Dummy",
      optOutMethod: "email",
      optOutEmail: "privacy@frommode.example",
      language: "de",
      isDummy: true,
      isActive: false,
    })
    .returning({ id: brokers.id });
  brokerId = broker.id;
});

beforeEach(() => {
  vi.clearAllMocks();
  // provider_message_id ist unique -> pro Aufruf eine eigene ID.
  sendMailMock.mockImplementation(async () => ({
    messageId: `<mock-${createId()}@jba-team.com>`,
    providerResponseId: null,
  }));
  mockEnv.MAIL_BROKER_FROM_MODE = "self";
  mockEnv.REPLY_DOMAIN = "reply.jba-team.com";
});

afterAll(async () => {
  if (userIds.length > 0) {
    // Cascade auf users raeumt Prozesse, Mails, Events und Profile mit ab.
    await db.delete(users).where(inArray(users.id, userIds));
  }
  await db.delete(brokers).where(eq(brokers.id, brokerId));
  await sql.end();
});

describe("sendOptOutMail — From-Modus wirkt bis in den Versand", () => {
  it("self-Modus: From = SELF_EMAIL, Token im Reply-To (bisheriges Verhalten)", async () => {
    const proc = await newProcess();
    await sendOptOutMail(proc.id);

    const input = sendMailMock.mock.calls[0][0];
    expect(input.from).toBe("jeffrey@jba-team.com");
    expect(input.replyTo).toBe(`proc-${proc.token}@reply.jba-team.com`);
  });

  it("tokenized-Modus: From traegt den Token, Reply-To entfaellt", async () => {
    mockEnv.MAIL_BROKER_FROM_MODE = "tokenized";
    const proc = await newProcess();
    await sendOptOutMail(proc.id);

    const input = sendMailMock.mock.calls[0][0];
    expect(input.from).toBe(
      `GoKognito Datenschutzanfragen <proc-${proc.token}@reply.jba-team.com>`,
    );
    expect(input.replyTo).toBeNull();
    // Die Adresse, an die Broker antworten, ist jetzt die getokente.
    expect(input.from).not.toContain("jeffrey@jba-team.com");
  });

  it("tokenized-Modus: process_mails haelt die reine Adresse ohne Display-Name", async () => {
    mockEnv.MAIL_BROKER_FROM_MODE = "tokenized";
    const proc = await newProcess();
    await sendOptOutMail(proc.id);

    const [row] = await db
      .select({ fromAddress: processMails.fromAddress })
      .from(processMails)
      .where(eq(processMails.processId, proc.id));
    expect(row.fromAddress).toBe(`proc-${proc.token}@reply.jba-team.com`);
    expect(row.fromAddress).not.toContain("<");
  });

  it("der Mailtext bleibt in beiden Modi identisch (nur der Envelope aendert sich)", async () => {
    const selfProc = await newProcess();
    await sendOptOutMail(selfProc.id);
    const selfBody = sendMailMock.mock.calls[0][0].textBody;

    vi.clearAllMocks();
    sendMailMock.mockImplementation(async () => ({
      messageId: `<mock-${createId()}@jba-team.com>`,
      providerResponseId: null,
    }));
    mockEnv.MAIL_BROKER_FROM_MODE = "tokenized";
    const tokenProc = await newProcess();
    await sendOptOutMail(tokenProc.id);
    const tokenBody = sendMailMock.mock.calls[0][0].textBody;

    // Token unterscheidet sich pro Prozess -- fuer den Vergleich normalisieren.
    expect(tokenBody.replaceAll(tokenProc.token, "TOKEN")).toBe(
      selfBody.replaceAll(selfProc.token, "TOKEN"),
    );
    // Die Identifikations-/Kontaktadressen im Text stammen aus dem Profil
    // (customer_profiles.email_addresses), NICHT aus SELF_EMAIL -- der
    // Modus-Wechsel laesst sie unberuehrt.
    expect(tokenBody).toContain("test.person@example.org");
    // Und der Envelope-Absender taucht im Text bewusst nicht auf.
    expect(tokenBody).not.toContain("jeffrey@jba-team.com");
  });
});
