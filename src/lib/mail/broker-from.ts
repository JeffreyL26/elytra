import { SERVICE_NAME } from "@/lib/branding";

// ABSENDER-STRATEGIE FUER BROKER-ANFRAGEN.
//
// BEFUND (01.08.2026, belegt durch zwei echte Antworten der 16.07.-Runde):
// Broker antworten an die FROM-Adresse und ignorieren Reply-To. Regis24 und
// ABIS antworteten beide an SELF_EMAIL, obwohl Reply-To auf
// proc-<token>@<REPLY_DOMAIN> zeigte -- Regis24 hatte den Token sogar im
// Betreff. SELF_EMAIL laeuft ueber Cloudflare Email Routing in ein privates
// Postfach und NICHT zu Postmark Inbound; keine dieser Antworten hat die
// Pipeline je erreicht. Das Token-Matching war nie das Problem, die
// Absenderadresse war schlicht nicht inbound-geroutet. Der Loopback-Test hat
// das verdeckt, weil ein Mensch in Gmail auf "Antworten" klickt und Gmail
// Reply-To respektiert -- Ticketsysteme tun das nicht.
//
// KONSEQUENZ: Im tokenized-Modus traegt die FROM-Adresse den Token, damit
// Antworten unabhaengig vom Reply-To-Verhalten in der Pipeline landen.
//
// WARUM proc-<token>@ UND NICHT datenschutz+<token>@ (geprueft 01.08.2026):
// Plus-Adressierung waere fuer einen Datenschutzbeauftragten lesbarer und wird
// von Postmark Inbound sauber unterstuetzt (der Suffix landet sogar fertig
// extrahiert im MailboxHash-Feld des Webhook-Payloads). Trotzdem bewusst
// dagegen entschieden: Ein Plus-Suffix ist ein KONVENTION, kein Adressbestandteil
// -- manche Mailserver und Ticketsysteme normalisieren die Adresse beim
// Antworten an "+" und schneiden alles danach ab. Dann kaeme die Antwort an
// datenschutz@<REPLY_DOMAIN> an, ohne jeden Token, und waere still nicht
// zuordenbar: exakt der Fehlermodus, den dieser Modus gerade behebt.
// Bei proc-<token>@ ist der Token Teil des MAILBOX-NAMENS und damit nicht
// abtrennbar -- es gibt nichts zu strippen. Wir tauschen Lesbarkeit gegen
// Robustheit, und die Robustheit ist hier belegt (Loopback-Test 01.08.:
// Antwort an die From-Adresse, fremder Absender, frei erfundener Betreff ohne
// Ref-Block -> matchStage 1). Fuer das Plus-Format existiert dieser Beleg nicht.
// Die Aussenwirkung traegt ohnehin ueberwiegend der Display-Name (siehe unten),
// nicht der Local Part.
//
// UMSCHALTUNG NUR PER ENV, Default bleibt "self": Solange die Sending-Domain
// (REPLY_DOMAIN) in Postmark nicht als Absender verifiziert ist, wuerde
// tokenized jeden Versand bouncen lassen. Der Code schaltet NICHT von sich aus
// um.

export const BROKER_FROM_MODES = ["self", "tokenized"] as const;
export type BrokerFromMode = (typeof BROKER_FROM_MODES)[number];

// Display-Name im tokenized-Modus. Ohne ihn sieht "proc-a1b2...@reply..." fuer
// einen Datenschutzbeauftragten wie Maschinen-Spam aus.
//
// WER als Absender erscheint, folgt derselben Logik wie der MAILTEXT:
//   * Self-Request (isSelfRequest=true): Der Text steht in der Ich-Form
//     ("ich, <Name>, mache meine Rechte geltend") -- also erscheint auch der
//     Mensch als Absender, nicht die Marke.
//   * Vertretung (isSelfRequest=false, hinter Gate G1): Der Text handelt im
//     Namen der betroffenen Person -- dort ist der Dienst der Absender.
// Ein Auseinanderfallen waere eine irrefuehrende Aussendarstellung: Ein
// Ich-Form-Schreiben, das sichtbar von einer Marke abgesendet wird, sieht nach
// aussen aus wie ein Dritter, der fuer eine Person handelt -- und wuerde damit
// genau die RDG-Frage vorwegnehmen, die hinter G1 noch offen ist.
export const SERVICE_DISPLAY_NAME = `${SERVICE_NAME} Datenschutzanfragen`;

export interface BrokerEnvelope {
  // Wert des From-Headers, im tokenized-Modus inkl. Display-Name.
  fromHeader: string;
  // Reine Adresse ohne Display-Name (fuer process_mails.from_address).
  fromAddress: string;
  // null = bewusst kein Reply-To (siehe Begruendung in buildBrokerEnvelope).
  replyTo: string | null;
  mode: BrokerFromMode;
}

export interface BrokerEnvelopeInput {
  mode: BrokerFromMode;
  processToken: string;
  replyDomain: string;
  // From-Adresse im self-Modus: SELF_EMAIL (Self-Request) bzw.
  // MAIL_FROM_ADDRESS (Vertretung). Im tokenized-Modus ungenutzt.
  selfModeFrom: string;
  // Derselbe Wert, der auch das Template steuert (Ich-Form vs. Vertretung) --
  // Envelope und Text duerfen nicht auseinanderfallen.
  isSelfRequest: boolean;
  // Klarname der betroffenen Person fuer den Display-Name im Self-Request.
  //
  // INVARIANTE: Dieser Name MUSS aus demselben customer_profile stammen, das
  // auch das Template rendert (formatProfileName aus templates/
  // opt-out-request.ts) -- NICHT aus env.SELF_NAME. Zwei Quellen fuer denselben
  // Namen fallen auseinander, sobald das Profil geaendert wird, ohne die Env
  // nachzuziehen; der Empfaenger saehe dann im Absender einen anderen Namen als
  // im Schreiben. env.SELF_NAME ist ausschliesslich Quelle fuer den Seed.
  //
  // Fehlt der Name, geht die Mail OHNE Display-Name raus (siehe
  // resolveDisplayName) -- niemals ersatzweise unter der Marke.
  selfDisplayName?: string | null;
}

// Unbekannte/fehlende Werte fallen auf "self" zurueck -- ein Tippfehler in der
// .env darf nicht dazu fuehren, dass ueber eine unverifizierte Domain gesendet
// wird.
export function resolveBrokerFromMode(raw: string | undefined | null): BrokerFromMode {
  return raw === "tokenized" ? "tokenized" : "self";
}

// RFC-5322-Display-Name: nur quoten, wenn noetig (Sonderzeichen der Spezifikation).
function formatDisplayName(name: string): string {
  return /^[A-Za-z0-9 äöüÄÖÜß.-]+$/.test(name) ? name : `"${name.replace(/["\\]/g, "\\$&")}"`;
}

// Wer erscheint als Absender? Siehe Begruendung an SERVICE_DISPLAY_NAME.
// null = kein Display-Name, nur die nackte Adresse. Das ist der bewusste
// Fallback fuer einen Self-Request ohne SELF_NAME: lieber gar kein Name als
// der Markenname -- der wuerde die Ich-Form des Textes konterkarieren.
function resolveDisplayName(input: BrokerEnvelopeInput): string | null {
  if (!input.isSelfRequest) {
    return SERVICE_DISPLAY_NAME;
  }
  const name = input.selfDisplayName?.trim();
  return name ? name : null;
}

export function buildBrokerEnvelope(input: BrokerEnvelopeInput): BrokerEnvelope {
  const tokenAddress = `proc-${input.processToken}@${input.replyDomain}`;

  if (input.mode === "tokenized") {
    const displayName = resolveDisplayName(input);
    return {
      fromHeader: displayName
        ? `${formatDisplayName(displayName)} <${tokenAddress}>`
        : tokenAddress,
      fromAddress: tokenAddress,
      // BEWUSST KEIN Reply-To: Es waere identisch zur From-Adresse und damit
      // reine Redundanz. Ein davon abweichendes Reply-To (etwa SELF_EMAIL)
      // waere sogar schaedlich -- es wuerde genau den Fehler wiederherstellen,
      // den dieser Modus behebt: Antworten landeten wieder in einem Postfach
      // ohne Inbound-Routing.
      replyTo: null,
      mode: "tokenized",
    };
  }

  return {
    fromHeader: input.selfModeFrom,
    fromAddress: input.selfModeFrom,
    replyTo: tokenAddress,
    mode: "self",
  };
}
