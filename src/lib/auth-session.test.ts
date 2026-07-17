import { eq, like } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

// Customer-Mail mocken (kein echter Postmark-Call bei Signup-Verify-Mail).
vi.mock("@/lib/mail/send-customer", () => ({
  sendCustomerMail: async () => ({ delivered: false, stream: null }),
  missingCustomerStreamEnv: () => [],
  warnIfCustomerStreamMissing: () => {},
}));

import { db, sql } from "@/db/client";
import { session, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getSessionUserId, getVerifiedSessionUserId } from "@/lib/auth-session";

const TEST_DOMAIN = "sessiontest.local";
const STRONG = "Sicher1!Passw0rt";
let counter = 0;
function uniqueEmail(): string {
  counter += 1;
  return `sess-${Date.now()}-${counter}@${TEST_DOMAIN}`;
}

function cookieHeaderFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function signUp(email: string): Promise<{ userId: string; headers: Headers }> {
  const res = await auth.api.signUpEmail({
    body: { email, password: STRONG, name: "Test" },
    asResponse: true,
  });
  const headers = new Headers({ cookie: cookieHeaderFrom(res) });
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!row) {
    throw new Error("Signup hat keinen User angelegt");
  }
  return { userId: row.id, headers };
}

afterAll(async () => {
  await db.delete(users).where(like(users.email, `%@${TEST_DOMAIN}`));
  await sql.end();
});

describe("getSessionUserId", () => {
  it("liefert bei gueltiger Session die korrekte userId", async () => {
    const { userId, headers } = await signUp(uniqueEmail());
    await expect(getSessionUserId(headers)).resolves.toBe(userId);
  });

  it("liefert null (kein Fehler), wenn gar keine Session vorhanden ist", async () => {
    await expect(getSessionUserId(new Headers())).resolves.toBeNull();
  });

  it("liefert null bei gefaelschtem/ungueltigem Session-Cookie (kein userId-Leak)", async () => {
    const headers = new Headers({ cookie: "better-auth.session_token=forged.invalid.token" });
    await expect(getSessionUserId(headers)).resolves.toBeNull();
  });

  it("liefert null bei abgelaufener Session (kein userId-Leak)", async () => {
    const { userId, headers } = await signUp(uniqueEmail());
    // Session serverseitig in die Vergangenheit setzen -> muss abgelehnt werden.
    await db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(session.userId, userId));
    await expect(getSessionUserId(headers)).resolves.toBeNull();
  });
});

describe("getVerifiedSessionUserId (Gate gegen SSoT emailVerifiedAt)", () => {
  it("blockiert (null), solange emailVerifiedAt null ist", async () => {
    const { headers } = await signUp(uniqueEmail());
    await expect(getVerifiedSessionUserId(headers)).resolves.toBeNull();
  });

  it("prueft die SSoT emailVerifiedAt, NICHT das email_verified-Boolean", async () => {
    const { userId, headers } = await signUp(uniqueEmail());
    // Divergenz erzwingen: Boolean true, aber Timestamp weiterhin null.
    // Das Gate MUSS trotzdem blockieren (liest den Timestamp, nicht das Boolean).
    await db
      .update(users)
      .set({ emailVerified: true, emailVerifiedAt: null })
      .where(eq(users.id, userId));
    await expect(getVerifiedSessionUserId(headers)).resolves.toBeNull();
  });

  it("gibt die userId frei, sobald emailVerifiedAt gesetzt ist", async () => {
    const { userId, headers } = await signUp(uniqueEmail());
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
    await expect(getVerifiedSessionUserId(headers)).resolves.toBe(userId);
  });

  it("liefert null ohne Session", async () => {
    await expect(getVerifiedSessionUserId(new Headers())).resolves.toBeNull();
  });
});
