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
// UMSCHALTUNG NUR PER ENV, Default bleibt "self": Solange die Sending-Domain
// (REPLY_DOMAIN) in Postmark nicht als Absender verifiziert ist, wuerde
// tokenized jeden Versand bouncen lassen. Der Code schaltet NICHT von sich aus
// um.

export const BROKER_FROM_MODES = ["self", "tokenized"] as const;
export type BrokerFromMode = (typeof BROKER_FROM_MODES)[number];

// Display-Name im tokenized-Modus. Ohne ihn sieht "proc-a1b2...@reply..." fuer
// einen Datenschutzbeauftragten wie Maschinen-Spam aus. Der Name kommt aus
// branding.ts -- bei einem Rebrand aendert sich nur dort etwas.
export const TOKENIZED_DISPLAY_NAME = `${SERVICE_NAME} Datenschutzanfragen`;

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

export function buildBrokerEnvelope(input: BrokerEnvelopeInput): BrokerEnvelope {
  const tokenAddress = `proc-${input.processToken}@${input.replyDomain}`;

  if (input.mode === "tokenized") {
    return {
      fromHeader: `${formatDisplayName(TOKENIZED_DISPLAY_NAME)} <${tokenAddress}>`,
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
