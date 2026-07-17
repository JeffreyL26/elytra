import { eq, like } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

// Customer-Mail mocken, um den Verifizierungs-Token aus dem Mail-Body zu ziehen
// (der Log-Fallback selbst ist in send-customer.test.ts unit-getestet). Kein
// echter Postmark-Call. vi.hoisted, damit die Capture-Liste im mock-Factory
// verfuegbar ist.
const { sentMails } = vi.hoisted(() => ({
  sentMails: [] as Array<{ to: string; subject: string; textBody: string; htmlBody: string }>,
}));

vi.mock("@/lib/mail/send-customer", () => ({
  sendCustomerMail: async (input: {
    to: string;
    subject: string;
    textBody: string;
    htmlBody: string;
  }) => {
    sentMails.push(input);
    return { delivered: false, stream: null };
  },
  missingCustomerStreamEnv: () => [],
  warnIfCustomerStreamMissing: () => {},
}));

import { db, sql } from "@/db/client";
import { customerProfiles, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getSessionUserId, getVerifiedSessionUserId } from "@/lib/auth-session";

const TEST_DOMAIN = "authtest.local";
// Ein Passwort, das ALLE Policy-Regeln erfuellt.
const STRONG = "Sicher1!Passw0rt";
let counter = 0;
function uniqueEmail(): string {
  counter += 1;
  return `auth-${Date.now()}-${counter}@${TEST_DOMAIN}`;
}

// set-cookie einer Better-Auth-Response in einen cookie-Request-Header wandeln.
function cookieHeaderFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function signUpWithSession(
  email: string,
  password = STRONG,
): Promise<{ userId: string; headers: Headers }> {
  const res = await auth.api.signUpEmail({
    body: { email, password, name: "Test" },
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
  // Alle Testnutzer entfernen; Cascade raeumt account/session/customer_profile.
  await db.delete(users).where(like(users.email, `%@${TEST_DOMAIN}`));
  await sql.end();
});

describe("Passwort-Policy im Sign-Up (serverseitig erzwungen)", () => {
  // Jede Regel EINZELN verletzt -> Registrierung muss scheitern.
  const weak: Array<[string, string]> = [
    ["zu kurz", "Sicher1!Pa0"],
    ["kein Grossbuchstabe", "sicher1!passw0rt"],
    ["kein Kleinbuchstabe", "SICHER1!PASSW0RT"],
    ["keine Ziffer", "Sicher!!Passwort"],
    ["kein Sonderzeichen", "Sicher12Passw0rt"],
  ];

  for (const [label, password] of weak) {
    it(`lehnt Registrierung ab: ${label}`, async () => {
      await expect(
        auth.api.signUpEmail({ body: { email: uniqueEmail(), password, name: "Test" } }),
      ).rejects.toThrow();
    });
  }

  it("akzeptiert ein Policy-konformes Passwort", async () => {
    const { userId } = await signUpWithSession(uniqueEmail());
    expect(userId).toBeTruthy();
  });
});

describe("Registrierung + Login + Session-Abruf", () => {
  it("legt Session an; getSessionUserId liefert die korrekte userId", async () => {
    const email = uniqueEmail();
    const { userId, headers } = await signUpWithSession(email);
    await expect(getSessionUserId(headers)).resolves.toBe(userId);
  });

  it("Login erzeugt eine gueltige Session fuer getSession", async () => {
    const email = uniqueEmail();
    const { userId } = await signUpWithSession(email);
    const res = await auth.api.signInEmail({
      body: { email, password: STRONG },
      asResponse: true,
    });
    const headers = new Headers({ cookie: cookieHeaderFrom(res) });
    await expect(getSessionUserId(headers)).resolves.toBe(userId);
  });

  it("ohne Session liefert getSessionUserId null", async () => {
    await expect(getSessionUserId(new Headers())).resolves.toBeNull();
  });
});

describe("Verifizierungs-Gate (emailVerifiedAt als Single Source of Truth)", () => {
  it("unverifizierter User: Login ok, aber kein Profil-Schreibzugriff", async () => {
    const { userId, headers } = await signUpWithSession(uniqueEmail());
    // Login erlaubt -> Lese-Identitaet vorhanden.
    await expect(getSessionUserId(headers)).resolves.toBe(userId);
    // Schreib-Gate blockiert, solange emailVerifiedAt null ist.
    await expect(getVerifiedSessionUserId(headers)).resolves.toBeNull();
  });

  it("nach Verifizierung sind emailVerifiedAt UND email_verified konsistent gesetzt", async () => {
    const email = uniqueEmail();
    const { userId, headers } = await signUpWithSession(email);

    // Token aus der (gemockten) Verifizierungsmail ziehen.
    const mail = sentMails.find((m) => m.to === email);
    if (!mail) {
      throw new Error("keine Verifizierungsmail erfasst");
    }
    const token = /token=([^&\s"]+)/.exec(mail.textBody)?.[1];
    if (!token) {
      throw new Error("kein Token in der Verifizierungsmail");
    }

    await auth.api.verifyEmail({ query: { token } });

    const [row] = await db
      .select({ emailVerified: users.emailVerified, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // Beide Felder konsistent: Boolean true UND Timestamp gesetzt.
    expect(row.emailVerified).toBe(true);
    expect(row.emailVerifiedAt).not.toBeNull();

    // Und jetzt greift das Schreib-Gate.
    await expect(getVerifiedSessionUserId(headers)).resolves.toBe(userId);
  });
});

describe("Bestehende Relation intakt (Regressions-Guard)", () => {
  it("ein User hat genau ein customer_profile; Cascade beim Loeschen raeumt es ab", async () => {
    const { userId } = await signUpWithSession(uniqueEmail());

    await db.insert(customerProfiles).values({
      userId,
      firstName: "Max",
      lastName: "Mustermann",
      emailAddresses: ["max@example.org"],
      postalAddresses: [
        { street: "Musterstr. 1", postalCode: "12345", city: "Musterstadt", country: "DE" },
      ],
    });

    const before = await db
      .select({ id: customerProfiles.id })
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, userId));
    expect(before).toHaveLength(1);

    // Konto loeschen -> Cascade entfernt das Profil (onDelete: cascade).
    await db.delete(users).where(eq(users.id, userId));

    const after = await db
      .select({ id: customerProfiles.id })
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, userId));
    expect(after).toHaveLength(0);
  });
});
