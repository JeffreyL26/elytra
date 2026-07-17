import { eq, inArray, like } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

// Customer-Mail mocken (Signup loest Verify-Mail aus -> kein echter Postmark-Call).
vi.mock("@/lib/mail/send-customer", () => ({
  sendCustomerMail: async () => ({ delivered: false, stream: null }),
  missingCustomerStreamEnv: () => [],
  warnIfCustomerStreamMissing: () => {},
}));

import { DELETE, GET, POST, PUT } from "@/app/api/profile/route";
import { db, sql } from "@/db/client";
import { brokers, optOutProcesses, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getProfileForUser } from "@/lib/user-data-access";

const DOMAIN = "profiletest.local";
const STRONG = "Sicher1!Passw0rt";
let counter = 0;
function uniqueEmail(): string {
  counter += 1;
  return `prof-${Date.now()}-${counter}@${DOMAIN}`;
}

const validProfile = {
  firstName: "Max",
  lastName: "Mustermann",
  emailAddresses: ["max@example.org"],
  postalAddresses: [
    { street: "Musterstr. 1", postalCode: "12345", city: "Musterstadt", country: "DE" },
  ],
};

function makeRequest(method: string, cookie: string | null, body?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) {
    headers.cookie = cookie;
  }
  return new Request("http://localhost/api/profile", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
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

async function signUpVerified(): Promise<{ userId: string; cookie: string }> {
  const { userId, cookie } = await signUp(uniqueEmail());
  await db
    .update(users)
    .set({ emailVerified: true, emailVerifiedAt: new Date() })
    .where(eq(users.id, userId));
  return { userId, cookie };
}

afterAll(async () => {
  // opt_out_processes haengt OHNE Cascade an users -> erst Prozesse loeschen.
  const testUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, `%@${DOMAIN}`));
  const ids = testUsers.map((u) => u.id);
  if (ids.length > 0) {
    await db.delete(optOutProcesses).where(inArray(optOutProcesses.userId, ids));
  }
  await db.delete(brokers).where(like(brokers.slug, "profile-test-%"));
  await db.delete(users).where(like(users.email, `%@${DOMAIN}`)); // cascade raeumt Profile
  await sql.end();
});

describe("GET /api/profile", () => {
  it("ohne Session -> 401", async () => {
    const res = await GET(makeRequest("GET", null));
    expect(res.status).toBe(401);
  });

  it("mit Session, aber ohne Profil -> 404", async () => {
    const { cookie } = await signUpVerified();
    const res = await GET(makeRequest("GET", cookie));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/profile (Schreiben)", () => {
  it("verifizierter User: legt Profil an -> 201, Response ohne userId", async () => {
    const { cookie } = await signUpVerified();
    const res = await POST(makeRequest("POST", cookie, validProfile));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.firstName).toBe("Max");
    expect(body.userId).toBeUndefined();
    expect(body.id).toBeTruthy();
  });

  it("unverifizierter User: Schreiben blockiert -> 403 email_not_verified", async () => {
    const { cookie } = await signUp(uniqueEmail()); // NICHT verifiziert
    const res = await POST(makeRequest("POST", cookie, validProfile));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("email_not_verified");
  });

  it("ungueltiges Profil (Schema) -> 400 validation_failed mit Feldnamen", async () => {
    const { cookie } = await signUpVerified();
    const invalid = { ...validProfile, lastName: "" }; // Nachname Pflicht
    const res = await POST(makeRequest("POST", cookie, invalid));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.fields).toContain("lastName");
  });

  it("userId/id im Body werden IGNORIERT -> Profil gehoert der Session-userId", async () => {
    const { userId, cookie } = await signUpVerified();
    const res = await POST(
      makeRequest("POST", cookie, { ...validProfile, userId: "attacker-xyz", id: "hack-id" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    // Nicht die injizierte id.
    expect(body.id).not.toBe("hack-id");
    // Profil existiert fuer die Session-userId, NICHT fuer die injizierte.
    expect(await getProfileForUser(userId)).not.toBeNull();
    expect(await getProfileForUser("attacker-xyz")).toBeNull();
  });

  it("zweites Profil -> 409 profile_exists", async () => {
    const { cookie } = await signUpVerified();
    await POST(makeRequest("POST", cookie, validProfile));
    const res = await POST(makeRequest("POST", cookie, validProfile));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("profile_exists");
  });
});

describe("GET/PUT Roundtrip", () => {
  it("eigener Read + Update funktioniert", async () => {
    const { cookie } = await signUpVerified();
    await POST(makeRequest("POST", cookie, validProfile));

    const read = await GET(makeRequest("GET", cookie));
    expect(read.status).toBe(200);
    expect((await read.json()).lastName).toBe("Mustermann");

    const put = await PUT(makeRequest("PUT", cookie, { ...validProfile, lastName: "Neumann" }));
    expect(put.status).toBe(200);
    expect((await put.json()).lastName).toBe("Neumann");
  });

  it("PUT ohne existierendes Profil -> 404", async () => {
    const { cookie } = await signUpVerified();
    const res = await PUT(makeRequest("PUT", cookie, validProfile));
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/profile", () => {
  it("ohne aktive Prozesse -> 200, Profil weg", async () => {
    const { userId, cookie } = await signUpVerified();
    await POST(makeRequest("POST", cookie, validProfile));
    const res = await DELETE(makeRequest("DELETE", cookie));
    expect(res.status).toBe(200);
    expect(await getProfileForUser(userId)).toBeNull();
  });

  it("mit aktivem (nicht-terminalem) Prozess -> 409 processes_active", async () => {
    const { userId, cookie } = await signUpVerified();
    const [broker] = await db
      .insert(brokers)
      .values({
        slug: `profile-test-${userId.slice(0, 10)}`,
        name: "Test Broker",
        optOutMethod: "email",
        isDummy: true,
      })
      .returning({ id: brokers.id });
    await db.insert(optOutProcesses).values({ userId, brokerId: broker.id, status: "contacted" });

    const res = await DELETE(makeRequest("DELETE", cookie));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("processes_active");
  });
});
