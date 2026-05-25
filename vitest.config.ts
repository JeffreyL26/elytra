import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// .env in process.env laden (Nodes eingebautes loadEnvFile), damit der
// Integrationstest DATABASE_URL gegen die lokale DB bekommt. Mail-/AWS-Werte
// sind deterministische Test-Defaults -- echtes SES wird nie aufgerufen
// (Dummy-Pfad bzw. SDK-Mock).
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${resolve(import.meta.dirname, "src")}/` }],
  },
  test: {
    environment: "node",
    env: {
      ANTHROPIC_API_KEY: "test-anthropic-key",
      MAIL_FROM_ADDRESS: "removals@jba-team.com",
      MAIL_FROM_DOMAIN: "jba-team.com",
      REPLY_DOMAIN: "reply.jba-team.com",
      AWS_REGION: "eu-central-1",
      AWS_ACCESS_KEY_ID: "test-access-key-id",
      AWS_SECRET_ACCESS_KEY: "test-secret-access-key",
    },
  },
});
