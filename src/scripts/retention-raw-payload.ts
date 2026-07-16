// Retention-CLI fuer process_mails.raw_payload (PII-Verdichtung).
//
//   Dry-Run (Default, KEINE Schreibvorgaenge):
//     pnpm tsx --env-file=.env src/scripts/retention-raw-payload.ts
//
//   Echter Lauf:
//     pnpm tsx --env-file=.env src/scripts/retention-raw-payload.ts --apply
//
// Fenster: RETENTION_DAYS aus .env, Default 90 Tage (TODO[legal-review] --
// Policy-Entscheidung, siehe src/lib/retention-raw-payload.ts).
//
// Konsolenausgabe enthaelt bewusst KEINE PII -- nur IDs, Zaehler und Alter.

import { sql } from "@/db/client";
import { resolveRetentionDays, runRetention } from "@/lib/retention-raw-payload";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const days = resolveRetentionDays();

  console.log(
    `Retention raw_payload: Fenster=${days} Tage, Modus=${apply ? "APPLY" : "DRY-RUN (keine Schreibvorgaenge)"}`,
  );

  const result = await runRetention({ days, apply });

  console.log(`Kandidaten: ${result.candidates.length}`);
  for (const candidate of result.candidates) {
    console.log(
      `  mail=${candidate.mailId} process=${candidate.processId} alter=${candidate.ageDays}d`,
    );
  }

  if (apply) {
    console.log(`Verdichtet: ${result.appliedCount}`);
  } else if (result.candidates.length > 0) {
    console.log("Dry-Run — nichts geschrieben. Echter Lauf mit --apply.");
  }
}

main()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error("Retention fehlgeschlagen:", error);
    await sql.end();
    process.exit(1);
  });
