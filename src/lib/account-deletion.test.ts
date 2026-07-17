import { eq, getTableColumns, inArray, like } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

// Customer-Mail mocken (Signup loest Verify-Mail aus -> kein echter Postmark-Call).
vi.mock("@/lib/mail/send-customer", () => ({
  sendCustomerMail: async () => ({ delivered: false, stream: null }),
  missingCustomerStreamEnv: () => [],
  warnIfCustomerStreamMissing: () => {},
}));

import { DELETE } from "@/app/api/account/route";
import { db, sql } from "@/db/client";
import {
  account,
  brokerResponseStats,
  brokers,
  customerProfiles,
  optOutProcesses,
  processEvents,
  processMails,
  session,
  users,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { getSessionUserId } from "@/lib/auth-session";

const DOMAIN = "deletetest.local";
const STRONG = "Sicher1!Passw0rt";
let counter = 0;
function uniqueEmail(): string {
  counter += 1;
  return `del-${Date.now()}-${counter}@${DOMAIN}`;
}

function makeDeleteRequest(cookie: string | null, body?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) {
    headers.cookie = cookie;
  }
  return new Request("http://localhost/api/account", {
    method: "DELETE",
    headers,
    body: JSON.stringify(body ?? {}),
  });
}

async function signUp(email: string): Promise<{ userId: string; cookie: string }> {
  const res = await auth.api.signUpEmail({
    body: { email, password: STRONG, name: "T" },
    asResponse: true,
  });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!row) {
    throw new Error("Signup ohne User");
  }
  return { userId: row.id, cookie };
}

// Legt die volle Datenlage eines aktiven Kunden an: Profil, 2 Prozesse gegen
// 2 Dummy-Broker, je eine Inbound-Mail + email_classified-Event.
async function seedFullUser(): Promise<{
  userId: string;
  cookie: string;
  brokerIds: string[];
}> {
  const { userId, cookie } = await signUp(uniqueEmail());
  await db.insert(customerProfiles).values({
    userId,
    firstName: "Max",
    lastName: "Mustermann",
    emailAddresses: ["max@example.org"],
    postalAddresses: [
      { street: "Musterstr. 1", postalCode: "12345", city: "Musterstadt", country: "DE" },
    ],
  });

  const brokerIds: string[] = [];
  const categories = ["success", "no_data_held"] as const;
  for (const [i, category] of categories.entries()) {
    const [broker] = await db
      .insert(brokers)
      .values({
        slug: `delete-test-${userId.slice(0, 8)}-${i}`,
        name: `Delete Test Broker ${i}`,
        optOutMethod: "email",
        isDummy: true,
      })
      .returning({ id: brokers.id });
    brokerIds.push(broker.id);

    const [proc] = await db
      .insert(optOutProcesses)
      .values({ userId, brokerId: broker.id, status: "contacted" })
      .returning({ id: optOutProcesses.id });

    const [mail] = await db
      .insert(processMails)
      .values({
        processId: proc.id,
        direction: "inbound",
        providerMessageId: `delete-test-${userId.slice(0, 8)}-${i}`,
        fromAddress: "broker@example.com",
        toAddress: "proc-x@reply.example.com",
        subject: "Antwort",
        bodyText: "Antworttext",
      })
      .returning({ id: processMails.id });

    await db.insert(processEvents).values({
      processId: proc.id,
      eventType: "email_classified",
      payload: {
        mailId: mail.id,
        category,
        confidence: 0.9,
        model: "claude-haiku-4-5-20251001",
        promptVersion: "v1",
      },
    });
  }
  return { userId, cookie, brokerIds };
}

afterAll(async () => {
  // Erst User (cascade raeumt deren Prozesse, die auf die Test-Broker zeigen),
  // dann Broker (cascade raeumt broker_response_stats).
  await db.delete(users).where(like(users.email, `%@${DOMAIN}`));
  await db.delete(brokers).where(like(brokers.slug, "delete-test-%"));
  await sql.end();
});

describe("DELETE /api/account — volle Loeschkette", () => {
  it("loescht User samt Profil/Prozessen/Mails/Events/Session und extrahiert die Empirie", async () => {
    const { userId, cookie, brokerIds } = await seedFullUser();

    const res = await DELETE(makeDeleteRequest(cookie, { password: STRONG }));
    expect(res.status).toBe(204);

    // JEDE personenbezogene Zeile einzeln weg:
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
    expect(
      await db.select().from(customerProfiles).where(eq(customerProfiles.userId, userId)),
    ).toHaveLength(0);
    expect(
      await db.select().from(optOutProcesses).where(eq(optOutProcesses.userId, userId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(processMails)
        .where(like(processMails.providerMessageId, `delete-test-${userId.slice(0, 8)}-%`)),
    ).toHaveLength(0);
    // Events hingen an den Prozessen -- ueber die Broker-Prozess-Kette prueft
    // sie keine Query mehr direkt; die leere Prozessliste oben plus FK-Cascade
    // deckt sie ab. Zusaetzlich: keine Events mehr, die auf die (geloeschten)
    // Prozesse zeigen, laesst sich global nicht ohne processId pruefen --
    // deshalb der Session/Account-Check als letzte personenbezogene Spur:
    expect(await db.select().from(session).where(eq(session.userId, userId))).toHaveLength(0);
    expect(await db.select().from(account).where(eq(account.userId, userId))).toHaveLength(0);

    // Session danach ungueltig:
    await expect(getSessionUserId(new Headers({ cookie }))).resolves.toBeNull();

    // Empirie-Extrakt: genau 2 Zeilen (eine pro klassifizierter Mail), korrekt
    // befuellt, Monat gerundet.
    const stats = await db
      .select()
      .from(brokerResponseStats)
      .where(inArray(brokerResponseStats.brokerId, brokerIds));
    expect(stats).toHaveLength(2);
    expect(stats.map((s) => s.category).sort()).toEqual(["no_data_held", "success"]);
    const expectedMonth = `${new Date().toISOString().slice(0, 7)}-01`;
    for (const s of stats) {
      expect(s.confidence).toBeCloseTo(0.9);
      expect(s.model).toBe("claude-haiku-4-5-20251001");
      expect(s.promptVersion).toBe("v1");
      expect(s.respondedMonth).toBe(expectedMonth);
    }
  });

  it("Events der Prozesse sind nach der Loeschung weg (direkter Beleg)", async () => {
    const { cookie, userId } = await seedFullUser();
    const procIds = (
      await db
        .select({ id: optOutProcesses.id })
        .from(optOutProcesses)
        .where(eq(optOutProcesses.userId, userId))
    ).map((p) => p.id);
    expect(procIds).toHaveLength(2);

    const res = await DELETE(makeDeleteRequest(cookie, { password: STRONG }));
    expect(res.status).toBe(204);

    expect(
      await db.select().from(processEvents).where(inArray(processEvents.processId, procIds)),
    ).toHaveLength(0);
  });
});

describe("DELETE /api/account — Guards", () => {
  it("falsches Passwort -> 403, NICHTS geloescht", async () => {
    const { userId, cookie } = await seedFullUser();

    const res = await DELETE(makeDeleteRequest(cookie, { password: "Falsch1!Falsch0rt" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("invalid_password");

    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(1);
    expect(
      await db.select().from(optOutProcesses).where(eq(optOutProcesses.userId, userId)),
    ).toHaveLength(2);
  });

  it("fehlendes Passwort -> 400, nichts geloescht", async () => {
    const { userId, cookie } = await signUp(uniqueEmail());
    const res = await DELETE(makeDeleteRequest(cookie, {}));
    expect(res.status).toBe(400);
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(1);
  });

  it("ohne Session -> 401", async () => {
    const res = await DELETE(makeDeleteRequest(null, { password: STRONG }));
    expect(res.status).toBe(401);
  });

  it("UNVERIFIZIERTES Konto kann sich loeschen (bewusste Verify-Gate-Ausnahme)", async () => {
    // signUp verifiziert nie -> emailVerifiedAt bleibt null.
    const { userId, cookie } = await signUp(uniqueEmail());
    const res = await DELETE(makeDeleteRequest(cookie, { password: STRONG }));
    expect(res.status).toBe(204);
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
  });

  it("Mandantentrennung: Loeschung von A laesst B vollstaendig unangetastet", async () => {
    const a = await signUp(uniqueEmail());
    const b = await seedFullUser();

    const res = await DELETE(makeDeleteRequest(a.cookie, { password: STRONG }));
    expect(res.status).toBe(204);

    // B existiert samt Prozessen weiter; nur A ist weg.
    expect(await db.select().from(users).where(eq(users.id, a.userId))).toHaveLength(0);
    expect(await db.select().from(users).where(eq(users.id, b.userId))).toHaveLength(1);
    expect(
      await db.select().from(optOutProcesses).where(eq(optOutProcesses.userId, b.userId)),
    ).toHaveLength(2);
  });
});

describe("Anonymitaets-Guard (strukturell gegen das Drizzle-Schema)", () => {
  it("broker_response_stats enthaelt EXAKT die erlaubten Spalten — kein Personenbezug", async () => {
    const columnNames = Object.values(getTableColumns(brokerResponseStats))
      .map((c) => c.name)
      .sort();
    // Exakte Allowlist: JEDE spaetere Spaltenergaenzung muss hier bewusst
    // freigegeben werden. Verboten bleiben insbesondere: user_id, process_id,
    // process_mail_id, token, created_at/updated_at (Zeitpunkt feiner als
    // Monat), subject/body/reasoning (Freitext).
    expect(columnNames).toEqual([
      "broker_id",
      "category",
      "confidence",
      "id",
      "model",
      "prompt_version",
      "responded_month",
    ]);
  });
});
