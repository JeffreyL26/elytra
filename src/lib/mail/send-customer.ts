import * as postmark from "postmark";
import { env } from "@/lib/env";

// Customer-Message-Stream-Adapter (Reputationstrennung, Multi-Tenant Schritt 2).
//
// HARTE INVARIANTE: Kundenmails (E-Mail-Verifizierung, spaeter Warteliste/
// Double-Opt-In) laufen AUSSCHLIESSLICH ueber den Postmark-Customer-Stream --
// NIEMALS ueber den Broker-Stream (den Default-Outbound-Stream aus send.ts).
// Deshalb setzt dieser Adapter MessageStream explizit; ohne konfigurierten
// Stream wird NICHT gesendet, sondern laut geloggt. Ein Ausweichen auf den
// Broker-Stream ist bewusst unmoeglich gemacht.

export interface SendCustomerMailInput {
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
}

export interface SendCustomerMailResult {
  // true = real ueber Postmark versendet. false = Log-Modus (Stream/Config
  // fehlt); die Mail ging NICHT raus.
  delivered: boolean;
  // Der genutzte Message-Stream (real) bzw. null (Log-Modus).
  stream: string | null;
}

// Alle drei Werte werden fuer echten Versand gebraucht. Fehlt einer, laeuft der
// Log-Modus. Getrennt gehalten, damit die Preflight-Warnung genau benennen kann,
// was fehlt.
function customerStreamConfig(): {
  token: string;
  stream: string;
  from: string;
} | null {
  const token = env.POSTMARK_SERVER_TOKEN;
  const stream = env.POSTMARK_CUSTOMER_STREAM;
  const from = env.MAIL_CUSTOMER_FROM_ADDRESS;
  if (!token || !stream || !from) {
    return null;
  }
  return { token, stream, from };
}

// Namen der fehlenden Env-Variablen (fuer Preflight-/Warn-Ausgaben). Leeres
// Array = alles konfiguriert.
export function missingCustomerStreamEnv(): string[] {
  const missing: string[] = [];
  if (!env.POSTMARK_SERVER_TOKEN) missing.push("POSTMARK_SERVER_TOKEN");
  if (!env.POSTMARK_CUSTOMER_STREAM) missing.push("POSTMARK_CUSTOMER_STREAM");
  if (!env.MAIL_CUSTOMER_FROM_ADDRESS) missing.push("MAIL_CUSTOMER_FROM_ADDRESS");
  return missing;
}

// EINMALIGE, deutliche Warnung beim Hochfahren (vom Web-Startup-Preflight
// assertRuntimeEnv("web") aufgerufen), damit
// der Uebergangszustand "Customer-Stream noch nicht provisioniert" sichtbar ist
// und nicht pro Mail versteckt aufschlaegt. Kein process.exit -- der Log-Modus
// ist ein bewusst tolerierter Zwischenzustand, kein Fatal.
export function warnIfCustomerStreamMissing(): void {
  const missing = missingCustomerStreamEnv();
  if (missing.length > 0) {
    console.warn(
      `WARN: Customer-Message-Stream nicht konfiguriert (${missing.join(", ")} fehlt) — ` +
        `Kunden-/Verifizierungsmails werden NICHT versendet, sondern nur geloggt. ` +
        `Reputationstrennung: es wird NIE auf den Broker-Stream ausgewichen. ` +
        `Aktivierung ist ein reiner Config-Schritt (siehe .env.example).`,
    );
  }
}

// Versendet eine Kundenmail ueber den Customer-Stream, oder loggt laut, wenn der
// Stream nicht konfiguriert ist. Der Rueckgabewert macht fuer den Aufrufer
// (und Tests) sichtbar, ob real versendet wurde -- der Verifizierungs-ZUSTAND
// haengt aber NICHT hieran (er haengt am Token/emailVerifiedAt), damit der Flow
// auch im Log-Modus vollstaendig funktioniert.
export async function sendCustomerMail(
  input: SendCustomerMailInput,
): Promise<SendCustomerMailResult> {
  const config = customerStreamConfig();

  if (!config) {
    // Unuebersehbarer Log-Fallback -- kein stilles No-op. Der Body wird NICHT
    // geloggt (kann Verify-Links/PII enthalten), nur Empfaenger + Betreff.
    console.warn(
      `WARN: Customer-Stream nicht konfiguriert — Mail NICHT versendet, würde an ${input.to} gehen ` +
        `(Betreff: "${input.subject}"). Fehlend: ${missingCustomerStreamEnv().join(", ")}.`,
    );
    return { delivered: false, stream: null };
  }

  const client = new postmark.ServerClient(config.token);
  await client.sendEmail({
    From: config.from,
    To: input.to,
    Subject: input.subject,
    TextBody: input.textBody,
    HtmlBody: input.htmlBody,
    // Die entscheidende Zeile: expliziter Customer-Stream, nie der Broker-Stream.
    MessageStream: config.stream,
  });

  return { delivered: true, stream: config.stream };
}
