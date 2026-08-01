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
    // Parallelitaet gedeckelt: Jede Testdatei importiert db/client.ts und
    // oeffnet damit einen eigenen postgres-Pool. Bei voller Parallelitaet
    // (24+ Dateien) kippten Suiten sporadisch schon beim Laden -- mal mit
    // Windows-Dateisystemfehlern, mal mit DB-Contention, jedes Mal an einer
    // anderen Datei. Das maskierte echte Fehlschlaege. Vier gleichzeitige
    // Worker halten die Laufzeit praktisch gleich und den Lauf reproduzierbar.
    maxWorkers: 4,
    env: {
      ANTHROPIC_API_KEY: "test-anthropic-key",
      POSTMARK_SERVER_TOKEN: "test-postmark-server-token",
      MAIL_FROM_ADDRESS: "removals@jba-team.com",
      MAIL_FROM_DOMAIN: "jba-team.com",
      REPLY_DOMAIN: "reply.jba-team.com",
      // Better Auth braucht ein Secret + baseURL. Deterministische Test-Werte;
      // es wird nie ein echter externer Auth-Call gemacht. Der Customer-Stream
      // ist BEWUSST NICHT gesetzt -> Verify-Mail laeuft im Log-Modus (kein
      // echter Postmark-Call, kein Broker-Stream-Missbrauch).
      BETTER_AUTH_SECRET: "test-better-auth-secret-value-32chars-min",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
  },
});
