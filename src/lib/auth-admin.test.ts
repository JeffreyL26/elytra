import { eq, like } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mail/send-customer", () => ({
  sendCustomerMail: async () => ({ delivered: false, stream: null }),
  missingCustomerStreamEnv: () => [],
  warnIfCustomerStreamMissing: () => {},
}));

import { db, sql } from "@/db/client";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { requireAdminSession } from "@/lib/auth-session";
import { customerProfileSchema } from "@/lib/customer-profile-schema";

const DOMAIN = "admintest.local";
const STRONG = "Sicher1!Passw0rt";
let counter = 0;
function uniqueEmail(): string {
  counter += 1;
  return `admin-${Date.now()}-${counter}@${DOMAIN}`;
}

async function signUp(): Promise<{ userId: string; headers: Headers }> {
  const email = uniqueEmail();
  const res = await auth.api.signUpEmail({
    body: { email, password: STRONG, name: "T" },
    asResponse: true,
  });
  const headers = new Headers({
    cookie: res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  });
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!row) {
    throw new Error("Signup ohne User");
  }
  return { userId: row.id, headers };
}

async function verify(userId: string) {
  await db
    .update(users)
    .set({ emailVerified: true, emailVerifiedAt: new Date() })
    .where(eq(users.id, userId));
}

afterAll(async () => {
  await db.delete(users).where(like(users.email, `%@${DOMAIN}`));
  await sql.end();
});

describe("requireAdminSession", () => {
  it("ohne Session -> null (Aufrufer antwortet 404)", async () => {
    await expect(requireAdminSession(new Headers())).resolves.toBeNull();
  });

  it("verifizierter Nicht-Admin -> null (kein Zugang, keine Existenz-Preisgabe)", async () => {
    const { userId, headers } = await signUp();
    await verify(userId);
    await expect(requireAdminSession(headers)).resolves.toBeNull();
  });

  it("Admin, aber unverifizierte E-Mail -> null (Admin setzt Verifizierung voraus)", async () => {
    const { userId, headers } = await signUp();
    await db.update(users).set({ isAdmin: true }).where(eq(users.id, userId));
    await expect(requireAdminSession(headers)).resolves.toBeNull();
  });

  it("verifizierter Admin -> userId", async () => {
    const { userId, headers } = await signUp();
    await verify(userId);
    await db.update(users).set({ isAdmin: true }).where(eq(users.id, userId));
    await expect(requireAdminSession(headers)).resolves.toBe(userId);
  });

  it("Default ist kein Admin (frisch registriertes Konto)", async () => {
    const { userId } = await signUp();
    const [row] = await db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    expect(row.isAdmin).toBe(false);
  });
});

describe("is_admin hat KEINEN API-Schreibpfad", () => {
  // Das Profil-CRUD ist der einzige user-gebundene Schreibendpunkt. Sein
  // Zod-Schema muss is_admin verwerfen -- sonst koennte sich ein Kunde per
  // Profil-PUT selbst zum Admin machen.
  it("customerProfileSchema verwirft isAdmin/is_admin aus dem Body", () => {
    const parsed = customerProfileSchema.parse({
      firstName: "Max",
      lastName: "Mustermann",
      emailAddresses: ["max@example.org"],
      postalAddresses: [
        { street: "Musterstr. 1", postalCode: "12345", city: "Musterstadt", country: "DE" },
      ],
      isAdmin: true,
      is_admin: true,
    });
    expect(parsed).not.toHaveProperty("isAdmin");
    expect(parsed).not.toHaveProperty("is_admin");
  });

  it("das Schema kennt keinen Admin-Schluessel", () => {
    expect(Object.keys(customerProfileSchema.shape)).not.toContain("isAdmin");
    expect(Object.keys(customerProfileSchema.shape)).not.toContain("is_admin");
  });
});
