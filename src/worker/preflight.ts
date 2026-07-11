import { env } from "@/lib/env";

// Fail-Fast beim Worker-Start: kritische Env-Werte, die der Worker zur
// Laufzeit unbedingt braucht, werden hier EINMAL beim Hochfahren geprueft --
// statt erst Tage nach dem Versand mitten in der Klassifikation einer echten
// Broker-Antwort aufzuschlagen. Der Key-Wert selbst wird NIE geloggt.
export function assertWorkerEnv(): void {
  const missing: string[] = [];

  // Jede eingehende Broker-Antwort wird LLM-klassifiziert -- ohne Key kann der
  // Worker seine Kernaufgabe nicht erfuellen. env.ts haelt den Key bewusst
  // optional (Web-Prozess/Outbound brauchen ihn nicht); der harte Check lebt
  // hier am tatsaechlichen Bedarfsort.
  if (!env.ANTHROPIC_API_KEY) {
    missing.push("ANTHROPIC_API_KEY");
  }

  // Self-Sends nutzen SELF_EMAIL als From-Adresse. Solange Self-Mode der
  // aktive Versandpfad ist (Phase 3b.5), hart geprueft -- ein Send-Job ohne
  // SELF_EMAIL wuerde sonst erst zur Laufzeit scheitern. Beim Wechsel auf
  // produktiven Vertretungs-Mode ggf. lockern.
  if (!env.SELF_EMAIL) {
    missing.push("SELF_EMAIL");
  }

  // Bewusst NICHT hart geprueft: POSTMARK_SERVER_TOKEN wird nur fuer echten
  // Outbound gebraucht (broker.is_dummy === false). Solange Dummy-Modus gilt,
  // wuerde ein harter Check den Worker grundlos am Start hindern; der
  // Point-of-Use-Check in send.ts deckt den Real-Pfad ab. Wenn echter Versand
  // scharfgeschaltet wird, gehoert das Token hier ergaenzt.

  if (missing.length > 0) {
    console.error(
      `FATAL: ${missing.join(", ")} fehlt — der Worker klassifiziert Inbound-Mails und versendet Self-Requests; ohne diese Werte kann er nicht sicher laufen. Werte in .env setzen.`,
    );
    process.exit(1);
  }

  console.log("Preflight OK: ANTHROPIC_API_KEY + SELF_EMAIL vorhanden");
}
