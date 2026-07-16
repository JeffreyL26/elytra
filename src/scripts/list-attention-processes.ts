// READ-ONLY Ops-CLI: zeigt haengende Prozesse (failed / manual_review) fuer
// Triage. Keine Schreibvorgaenge.
//
//   pnpm tsx --env-file=.env src/scripts/list-attention-processes.ts [--json]
//
// ACHTUNG: tenant-uebergreifende ADMIN-Sicht (liest alle User, bewusst NICHT
// der *ForUser-Layer). Niemals als kundenseitiger Endpunkt exponieren --
// Details siehe src/lib/attention-processes.ts.

import { sql } from "@/db/client";
import { type AttentionProcess, getAttentionProcesses } from "@/lib/attention-processes";

function formatRow(p: AttentionProcess): string {
  const changedAt = p.statusChangedAt ? p.statusChangedAt.toISOString() : "-";
  const base = `  ${p.processId}  ${p.brokerSlug} (${p.brokerName})  status=${p.status}  self=${p.isSelfRequest}  geaendert=${changedAt}`;
  const extras: string[] = [];
  if (p.conflict) {
    extras.push(
      `konflikt: from=${p.conflict.from ?? "-"} attempted=${p.conflict.attempted ?? "-"} source=${p.conflict.source ?? "-"}`,
    );
  }
  if (p.bounce) {
    extras.push(
      `bounce: type=${p.bounce.bounceType ?? "-"} bouncedAt=${p.bounce.bouncedAt ?? "-"}`,
    );
  }
  return extras.length > 0 ? `${base}\n      ${extras.join("  |  ")}` : base;
}

async function main(): Promise<void> {
  const asJson = process.argv.includes("--json");
  const processes = await getAttentionProcesses();

  if (asJson) {
    console.log(JSON.stringify(processes, null, 2));
    return;
  }

  if (processes.length === 0) {
    console.log("Keine Prozesse in failed/manual_review. Nichts zu triagieren.");
    return;
  }

  console.log(`${processes.length} Prozess(e) brauchen Aufmerksamkeit:\n`);
  let currentReason: string | null | undefined;
  for (const p of processes) {
    if (p.reason !== currentReason) {
      currentReason = p.reason;
      console.log(`── reason: ${currentReason ?? "(kein status_changed-Event)"} ──`);
    }
    console.log(formatRow(p));
  }
}

main()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error("list-attention-processes fehlgeschlagen:", error);
    await sql.end();
    process.exit(1);
  });
