import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    // Externe Dienste optional auf env-Ebene; Required-Check am Point-of-Use,
    // damit Web/Worker/Skripte ohne noch fehlende Secrets booten koennen.
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    POSTMARK_SERVER_TOKEN: z.string().min(1).optional(),
    MAIL_FROM_ADDRESS: z.string().email().optional(),
    MAIL_FROM_DOMAIN: z.string().min(1).optional(),
    REPLY_DOMAIN: z.string().min(1).optional(),
    POSTMARK_INBOUND_WEBHOOK_USERNAME: z.string().min(1).optional(),
    POSTMARK_INBOUND_WEBHOOK_PASSWORD: z.string().min(1).optional(),
    // Absender-Strategie fuer Broker-Anfragen (siehe lib/mail/broker-from.ts):
    //   "self"      = From ist SELF_EMAIL/MAIL_FROM_ADDRESS, Token im Reply-To
    //   "tokenized" = From traegt den Token (proc-<token>@REPLY_DOMAIN)
    // Default bewusst "self": tokenized setzt eine in Postmark VERIFIZIERTE
    // Sending-Domain voraus, sonst bounct jeder Versand.
    MAIL_BROKER_FROM_MODE: z.enum(["self", "tokenized"]).default("self"),
    // Better Auth (Multi-Tenant Schritt 2). Optional auf env-Ebene; der harte
    // Bedarf sitzt am Point-of-Use (src/lib/auth.ts wirft ohne Secret).
    // BETTER_AUTH_SECRET: Signiergeheimnis fuer Sessions/Tokens (>=32 Zeichen
    // empfohlen). BETTER_AUTH_URL: oeffentliche Basis-URL fuer Verify-Links.
    BETTER_AUTH_SECRET: z.string().min(1).optional(),
    BETTER_AUTH_URL: z.string().url().optional(),
    // Customer-Message-Stream (Reputationstrennung: NIE der Broker-Stream).
    // Verifizierungs-/Kundenmails laufen hierueber. Fehlt der Stream, loggt der
    // Adapter nur laut, statt auf den Broker-Stream auszuweichen (bewusste
    // Entscheidung, siehe src/lib/mail/send-customer.ts).
    // POSTMARK_CUSTOMER_STREAM: Message-Stream-ID des Customer-Streams.
    // MAIL_CUSTOMER_FROM_ADDRESS: From-Adresse fuer Kundenmails (getrennt von
    // MAIL_FROM_ADDRESS=removals@, das dem Broker-Stream gehoert).
    POSTMARK_CUSTOMER_STREAM: z.string().min(1).optional(),
    MAIL_CUSTOMER_FROM_ADDRESS: z.string().email().optional(),
    // Self-Request-Testprofil (Phase 3b.4.5): nur lokal in .env befuellt,
    // ausschliesslich vom Seed-Script db:seed:self gelesen. Keine echten
    // personenbezogenen Daten im Repo.
    SELF_NAME: z.string().min(1).optional(),
    SELF_STREET: z.string().min(1).optional(),
    SELF_POSTAL_CODE: z.string().min(1).optional(),
    SELF_CITY: z.string().min(1).optional(),
    // SELF_EMAIL: Absenderadresse (From) des Self-Requests. NICHT zwingend eine
    // Adresse, unter der Broker die Person kennen.
    SELF_EMAIL: z.string().email().optional(),
    // SELF_IDENTITY_EMAILS: kommaseparierte Identifikationsadressen fuers
    // customer_profile (unter denen reale Broker die Person finden). Fallback
    // auf SELF_EMAIL, wenn nicht gesetzt.
    SELF_IDENTITY_EMAILS: z.string().min(1).optional(),
    // Retention-Fenster fuer raw_payload-Verdichtung in Tagen (Default 90 im
    // Retention-Modul). TODO[legal-review]: Policy-/Rechtsentscheidung.
    RETENTION_DAYS: z.coerce.number().int().min(1).optional(),
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    POSTMARK_SERVER_TOKEN: process.env.POSTMARK_SERVER_TOKEN,
    MAIL_FROM_ADDRESS: process.env.MAIL_FROM_ADDRESS,
    MAIL_FROM_DOMAIN: process.env.MAIL_FROM_DOMAIN,
    REPLY_DOMAIN: process.env.REPLY_DOMAIN,
    POSTMARK_INBOUND_WEBHOOK_USERNAME: process.env.POSTMARK_INBOUND_WEBHOOK_USERNAME,
    POSTMARK_INBOUND_WEBHOOK_PASSWORD: process.env.POSTMARK_INBOUND_WEBHOOK_PASSWORD,
    MAIL_BROKER_FROM_MODE: process.env.MAIL_BROKER_FROM_MODE,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    POSTMARK_CUSTOMER_STREAM: process.env.POSTMARK_CUSTOMER_STREAM,
    MAIL_CUSTOMER_FROM_ADDRESS: process.env.MAIL_CUSTOMER_FROM_ADDRESS,
    SELF_NAME: process.env.SELF_NAME,
    SELF_STREET: process.env.SELF_STREET,
    SELF_POSTAL_CODE: process.env.SELF_POSTAL_CODE,
    SELF_CITY: process.env.SELF_CITY,
    SELF_EMAIL: process.env.SELF_EMAIL,
    SELF_IDENTITY_EMAILS: process.env.SELF_IDENTITY_EMAILS,
    RETENTION_DAYS: process.env.RETENTION_DAYS,
  },
  emptyStringAsUndefined: true,
});
