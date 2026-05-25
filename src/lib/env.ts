import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    // Phase 2: noch optional, da externe Dienste (SES-Production-Access,
    // Postmark) teils erst freigeschaltet werden. Pro Subsystem nachziehen,
    // sobald die Werte verfuegbar sind.
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    AWS_REGION: z.string().min(1).optional(),
    AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
    AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    MAIL_FROM_ADDRESS: z.string().email().optional(),
    MAIL_FROM_DOMAIN: z.string().min(1).optional(),
    REPLY_DOMAIN: z.string().min(1).optional(),
    POSTMARK_INBOUND_WEBHOOK_SECRET: z.string().min(1).optional(),
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    AWS_REGION: process.env.AWS_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    MAIL_FROM_ADDRESS: process.env.MAIL_FROM_ADDRESS,
    MAIL_FROM_DOMAIN: process.env.MAIL_FROM_DOMAIN,
    REPLY_DOMAIN: process.env.REPLY_DOMAIN,
    POSTMARK_INBOUND_WEBHOOK_SECRET: process.env.POSTMARK_INBOUND_WEBHOOK_SECRET,
  },
  emptyStringAsUndefined: true,
});
