import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// .env in process.env laden (Nodes eingebautes loadEnvFile), damit der
// Integrationstest DATABASE_URL gegen die lokale DB bekommt. Mail-/Postmark-
// Werte sind deterministische Test-Defaults -- echtes Postmark wird nie
// aufgerufen (Dummy-Pfad bzw. SDK-Mock).
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
      POSTMARK_SERVER_TOKEN: "test-postmark-server-token",
      MAIL_FROM_ADDRESS: "removals@jba-team.com",
      MAIL_FROM_DOMAIN: "jba-team.com",
      REPLY_DOMAIN: "reply.jba-team.com",
    },
  },
});
