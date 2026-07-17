import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { db } from "@/db/client";
import { account, session, users, verification } from "@/db/schema";
import { assertPasswordPolicy, PasswordPolicyError } from "@/lib/auth-password-policy";
import { SERVICE_NAME } from "@/lib/branding";
import { env } from "@/lib/env";
import { createId } from "@/lib/ids";
import { sendCustomerMail } from "@/lib/mail/send-customer";

// Better Auth serverseitig (Multi-Tenant Schritt 2). NUR die Auth-Schicht --
// keine UI. Methode: E-Mail + Passwort, keine Social Logins (schlicht nicht
// konfiguriert). Passwort-Hashing bleibt Better-Auth-Default = scrypt
// (Node-nativ, OWASP-empfohlen) -- bewusst NICHT ueberschrieben, kein Eigenbau.
//
// Die users-Tabelle wird adoptiert (Option A): schema.user zeigt auf die
// bestehende users-Tabelle; deren FK-Relationen (customer_profiles,
// opt_out_processes) bleiben unangetastet. IDs kommen ueber unsere createId,
// damit alle Tabellen dieselbe cuid2-Form tragen.

function buildVerificationEmail(url: string): {
  subject: string;
  textBody: string;
  htmlBody: string;
} {
  const subject = `${SERVICE_NAME}: E-Mail-Adresse bestätigen`;
  const textBody = [
    "Willkommen,",
    "",
    `bitte bestätige deine E-Mail-Adresse, um dein ${SERVICE_NAME}-Konto zu aktivieren:`,
    url,
    "",
    "Wenn du dich nicht registriert hast, ignoriere diese E-Mail.",
  ].join("\n");
  const htmlBody = `<p>Willkommen,</p><p>bitte bestätige deine E-Mail-Adresse, um dein ${SERVICE_NAME}-Konto zu aktivieren:</p><p><a href="${url}">${url}</a></p><p>Wenn du dich nicht registriert hast, ignoriere diese E-Mail.</p>`;
  return { subject, textBody, htmlBody };
}

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    // user -> bestehende users-Tabelle. session/account/verification neu.
    schema: { user: users, session, account, verification },
  }),
  // cuid2 fuer alle von Better Auth erzeugten IDs -- konsistent mit dem Rest
  // des Schemas (src/lib/ids.ts).
  advanced: {
    database: {
      generateId: () => createId(),
    },
  },
  emailAndPassword: {
    enabled: true,
    // BEWUSST false: Unverifizierte Konten DUERFEN sich einloggen
    // (api-contract.md 1.3). Der Verifizierungs-Gate sitzt am
    // Profil-SCHREIBzugriff (getVerifiedSessionUserId, prueft emailVerifiedAt),
    // nicht am Login.
    requireEmailVerification: false,
    // minPasswordLength als erste Better-Auth-Huerde; die vollstaendige Policy
    // (FPW-3.2.1) erzwingt der sign-up-Hook unten.
    minPasswordLength: 12,
    autoSignIn: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      const mail = buildVerificationEmail(url);
      // Ueber den Customer-Stream-Adapter: real oder (ohne Stream) laut geloggt.
      // Der Verifizierungs-ZUSTAND haengt am Token, nicht an diesem Versand.
      await sendCustomerMail({ to: user.email, ...mail });
    },
  },
  // emailVerifiedAt (timestamptz) ist die Single Source of Truth. Better Auth
  // kennt es als input:false-Zusatzfeld, damit der databaseHook es im SELBEN
  // Update setzen kann, in dem Better Auth email_verified=true schreibt.
  user: {
    additionalFields: {
      emailVerifiedAt: { type: "date", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      update: {
        // ATOMARER SYNC: sobald email_verified true wird, wird emailVerifiedAt
        // im gleichen UPDATE gesetzt. Es darf keinen Pfad geben, der nur eines
        // von beiden schreibt -- deshalb hier und nicht in einem separaten
        // Nachlauf-Write. Idempotent: nur setzen, wenn noch nicht gesetzt.
        before: async (data) => {
          const patch = data as { emailVerified?: boolean; emailVerifiedAt?: Date | null };
          if (patch.emailVerified === true && !patch.emailVerifiedAt) {
            return { data: { ...data, emailVerifiedAt: new Date() } };
          }
          return { data };
        },
      },
    },
  },
  hooks: {
    // Passwort-Policy (FPW-3.2.1) serverseitig im sign-up erzwingen -- vor der
    // Better-Auth-Kernlogik. Andere Endpunkte bleiben unberuehrt.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") {
        return;
      }
      const password = ctx.body?.password;
      if (typeof password !== "string") {
        // Fehlendes/ungueltiges Passwort behandelt Better Auth selbst.
        return;
      }
      try {
        assertPasswordPolicy(password);
      } catch (error) {
        if (error instanceof PasswordPolicyError) {
          throw new APIError("BAD_REQUEST", {
            code: "WEAK_PASSWORD",
            message: error.message,
          });
        }
        throw error;
      }
    }),
  },
});
