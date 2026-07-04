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
    // Self-Request-Testprofil (Phase 3b.4.5): nur lokal in .env befuellt,
    // ausschliesslich vom Seed-Script db:seed:self gelesen. Keine echten
    // personenbezogenen Daten im Repo.
    SELF_NAME: z.string().min(1).optional(),
    SELF_STREET: z.string().min(1).optional(),
    SELF_POSTAL_CODE: z.string().min(1).optional(),
    SELF_CITY: z.string().min(1).optional(),
    SELF_EMAIL: z.string().email().optional(),
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
    SELF_NAME: process.env.SELF_NAME,
    SELF_STREET: process.env.SELF_STREET,
    SELF_POSTAL_CODE: process.env.SELF_POSTAL_CODE,
    SELF_CITY: process.env.SELF_CITY,
    SELF_EMAIL: process.env.SELF_EMAIL,
  },
  emptyStringAsUndefined: true,
});
