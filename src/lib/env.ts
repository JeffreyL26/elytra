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
  },
  emptyStringAsUndefined: true,
});
