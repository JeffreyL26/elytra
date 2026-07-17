import { env } from "@/lib/env";
import { warnIfCustomerStreamMissing } from "@/lib/mail/send-customer";

// Zentraler Startup-Preflight pro Einstiegspunkt. env.ts haelt bewusst viele
// optionale Vars mit verstreuten Point-of-Use-Checks -- die bleiben als zweite
// Verteidigungslinie. DIESE Funktion ergaenzt einen LAUTEN Check beim
// Prozessstart, der EINMAL sagt, was fuer den jeweiligen Kontext fehlt, statt
// dass ein fehlender Wert erst beim ersten echten Request kracht.

export type RuntimeContext = "web" | "worker";

export class RuntimeEnvError extends Error {
  readonly context: RuntimeContext;
  readonly missing: string[];
  constructor(context: RuntimeContext, missing: string[]) {
    super(
      `FATAL: Startup-Preflight (${context}) — folgende Pflicht-Env-Variablen fehlen: ${missing.join(", ")}. In .env setzen.`,
    );
    this.name = "RuntimeEnvError";
    this.context = context;
    this.missing = missing;
  }
}

// Pflicht-Env pro Kontext als [Name, Wert]-Paare, damit die Fehlermeldung ALLE
// fehlenden auf einmal nennen kann (nicht nur den ersten).
function requiredEnv(context: RuntimeContext): Array<readonly [string, string | undefined]> {
  if (context === "worker") {
    // Bewusst identisch zur frueheren assertWorkerEnv: der Worker klassifiziert
    // Inbound (ANTHROPIC_API_KEY) und versendet Self-Requests (SELF_EMAIL).
    // POSTMARK_SERVER_TOKEN ist ABSICHTLICH NICHT hart-required -- im
    // Dummy-Modus (broker.is_dummy) faellt kein echter Send an; der
    // Point-of-Use-Check in send.ts deckt den Real-Pfad ab.
    return [
      ["ANTHROPIC_API_KEY", env.ANTHROPIC_API_KEY],
      ["SELF_EMAIL", env.SELF_EMAIL],
    ];
  }
  // web: ohne Signiergeheimnis + Basis-URL kann Better Auth nicht sicher laufen.
  return [
    ["BETTER_AUTH_SECRET", env.BETTER_AUTH_SECRET],
    ["BETTER_AUTH_URL", env.BETTER_AUTH_URL],
  ];
}

// Wirft RuntimeEnvError (alle fehlenden Pflichtwerte auf einmal), wenn welche
// fehlen. Nicht-blockierende Dinge (Log-Modus bewusst erlaubt) werden nur
// gewarnt, nicht geworfen.
export function assertRuntimeEnv(context: RuntimeContext): void {
  const missing = requiredEnv(context)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new RuntimeEnvError(context, missing);
  }

  if (context === "web") {
    // Customer-Mail-Stream ist bewusst optional (Log-Modus, send-customer.ts):
    // fehlt er, wird laut GEWARNT, aber NICHT geworfen.
    warnIfCustomerStreamMissing();
  }

  console.log(`Preflight OK (${context}): Pflicht-Env vorhanden.`);
}
