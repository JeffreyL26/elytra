// Mail-Text-Entwurf für DSGVO-Löschanfragen.
// Best-Effort-Formulierung auf Basis von Art. 17/21/15 DSGVO.
// FINALE rechtliche Prüfung durch Anwalt erfolgt vor Launch
// (siehe Roadmap-Punkt 11: Anwalts-Termin).

import type { brokers, customerProfiles, PostalAddress } from "@/db/schema";
import { SERVICE_NAME } from "@/lib/branding";

type CustomerProfile = typeof customerProfiles.$inferSelect;
type Broker = typeof brokers.$inferSelect;

// Das Template kennt nur, was es fuer den Text braucht. From-/Reply-To-
// Adressen werden NICHT hier konstruiert, sondern in der Send-Funktion
// (Aufgabe 5) aus env + token gebildet.
export type OptOutRecipient = Pick<
  CustomerProfile,
  "firstName" | "lastName" | "dateOfBirth" | "emailAddresses" | "phoneNumbers" | "postalAddresses"
>;
export type OptOutBroker = Pick<Broker, "name">;

export type Locale = "de" | "en";

// Sprachen, fuer die reviewte Templates existieren. brokers.language erlaubt
// auch fr/es -- die fallen BEWUSST auf EN zurueck, bis reviewte Templates
// existieren. TODO[legal-review]: FR/ES-Templates sind Rechtsinhalt und
// gehoeren unter denselben Anwalts-Vorbehalt wie die DE/EN-Fassungen.
export const TEMPLATE_LOCALES = ["de", "en"] as const;

// Broker-Sprache (ISO 639-1, brokers.language) -> Template-Locale. Der
// EN-Fallback ist kein stiller Pfad mehr: er wird geloggt (mit Broker-Kontext,
// wenn der Aufrufer ihn mitgibt), damit ein FR-Broker nicht unbemerkt
// englischen Text bekommt.
export function toTemplateLocale(language: string, context?: { brokerSlug?: string }): Locale {
  if ((TEMPLATE_LOCALES as readonly string[]).includes(language)) {
    return language as Locale;
  }
  console.warn(
    `[template-locale] ${context?.brokerSlug ?? "(broker unbekannt)"}: Sprache '${language}' hat kein reviewtes Template — EN-Fallback.`,
  );
  return "en";
}

export interface OptOutMail {
  subject: string;
  textBody: string;
  htmlBody: string;
}

type IdentificationLabels = {
  name: string;
  dateOfBirth: string;
  address: string;
  emails: string;
  phones: string;
  formatDate: (isoDate: string) => string;
};

// Klarname der betroffenen Person aus dem Profil. EXPORTIERT, weil derselbe
// Name auch als Display-Name der Absenderadresse dient (broker-from.ts):
// INVARIANTE -- Absender-Name und Name im Mailtext stammen aus DERSELBEN
// Quelle (customer_profiles). Zwei Quellen wuerden auseinanderfallen, sobald
// das Profil geaendert wird, und der Empfaenger saehe im Absender einen
// anderen Namen als im Schreiben.
// Liefert null, wenn kein Name hinterlegt ist -- der Aufrufer entscheidet
// ueber den Ersatz (Text: "—", Absender: gar kein Display-Name).
export function formatProfileName(profile: OptOutRecipient): string | null {
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  return name || null;
}

function formatName(profile: OptOutRecipient): string {
  return formatProfileName(profile) ?? "—";
}

function formatEmails(emails: string[] | null): string {
  return emails && emails.length > 0 ? emails.join(", ") : "—";
}

function formatAddresses(addresses: PostalAddress[] | null): string {
  if (!addresses || addresses.length === 0) {
    return "—";
  }
  return addresses.map((a) => `${a.street}, ${a.postalCode} ${a.city}, ${a.country}`).join("; ");
}

// date-Spalte liefert "YYYY-MM-DD"; deutsche Darstellung TT.MM.JJJJ.
function formatDateDe(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

// Baut den Identifikationsblock. dateOfBirth und phoneNumbers erscheinen nur,
// wenn befuellt -- keine leeren "Geburtsdatum: —"-Zeilen.
function formatIdentification(profile: OptOutRecipient, labels: IdentificationLabels): string {
  const lines = [`${labels.name}: ${formatName(profile)}`];
  if (profile.dateOfBirth) {
    lines.push(`${labels.dateOfBirth}: ${labels.formatDate(profile.dateOfBirth)}`);
  }
  lines.push(`${labels.address}: ${formatAddresses(profile.postalAddresses)}`);
  lines.push(`${labels.emails}: ${formatEmails(profile.emailAddresses)}`);
  if (profile.phoneNumbers && profile.phoneNumbers.length > 0) {
    lines.push(`${labels.phones}: ${profile.phoneNumbers.join(", ")}`);
  }
  return lines.join("\n");
}

// Wandelt den Text-Body in ein simples HTML-Fragment (HTML-escaped, Absaetze
// als <p>, Zeilenumbrueche als <br>). Bewusst ohne Styling.
function textToHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>\n")}</p>`)
    .join("\n");
}

const DE_LABELS: IdentificationLabels = {
  name: "Name",
  dateOfBirth: "Geburtsdatum",
  address: "Anschrift",
  emails: "E-Mail-Adressen",
  phones: "Telefonnummern",
  formatDate: formatDateDe,
};

const EN_LABELS: IdentificationLabels = {
  name: "Name",
  dateOfBirth: "Date of birth",
  address: "Address",
  emails: "Email addresses",
  phones: "Phone numbers",
  // ISO-Datum (YYYY-MM-DD) -- eindeutig, keine Locale-Verwechslung.
  formatDate: (isoDate) => isoDate,
};

// TODO[legal-review]: Vor Versand an reale Broker muss dieser Absatz
// von einem Datenschutzanwalt geprüft werden. Aktueller Text ist auf
// Art. 12 Abs. 2 DSGVO basierte Eigenkonstruktion, kein zitierter
// Mustertext. Gilt fuer BEIDE Varianten (Vertretung + Self).
const ART_12_2_PARAGRAPH_DE =
  "Wir weisen darauf hin, dass diese E-Mail gemäß Art. 12 Abs. 2 DSGVO einen zulässigen Kommunikationsweg für die Geltendmachung der Betroffenenrechte unserer Auftraggeberin / unseres Auftraggebers darstellt. Ein Verweis auf ein Online-Formular oder einen anderen Kanal stellt keine Erfüllung der vorliegenden Anfrage dar.";

const ART_12_2_PARAGRAPH_EN =
  "We hereby note that, pursuant to Article 12(2) GDPR, this email constitutes a valid communication channel for the exercise of our client's data subject rights. A referral to an online form or another channel does not constitute fulfilment of this request.";

const ART_12_2_SELF_DE =
  "Ich weise darauf hin, dass diese E-Mail gemäß Art. 12 Abs. 2 DSGVO einen zulässigen Kommunikationsweg für die Geltendmachung meiner Betroffenenrechte darstellt. Ein Verweis auf ein Online-Formular oder einen anderen Kanal stellt keine Erfüllung der vorliegenden Anfrage dar.";

const ART_12_2_SELF_EN =
  "I hereby note that, pursuant to Article 12(2) GDPR, this email constitutes a valid communication channel for the exercise of my data subject rights. A referral to an online form or another channel does not constitute fulfilment of this request.";

function buildGerman(profile: OptOutRecipient, broker: OptOutBroker, token: string): OptOutMail {
  const subject = `[Ref: ${token}] Datenlöschanfrage gemäß Art. 17 DSGVO`;

  const textBody = `Sehr geehrte Damen und Herren,

wir wenden uns im Auftrag und in Vollmacht der nachfolgend genannten betroffenen Person an Sie. Eine schriftliche Vollmacht zur Wahrnehmung ihrer Betroffenenrechte liegt uns vor und wird Ihnen auf Wunsch vorgelegt.

Betroffene Person:
${formatIdentification(profile, DE_LABELS)}

Namens und im Auftrag der betroffenen Person fordern wir Sie auf, sämtliche zu dieser Person bei ${broker.name} gespeicherten personenbezogenen Daten gemäß Art. 17 DSGVO (Recht auf Löschung) unverzüglich und vollständig zu löschen. Soweit die Verarbeitung auf Art. 6 Abs. 1 lit. f DSGVO gestützt wird, ergibt sich die Löschpflicht spätestens aus Art. 17 Abs. 1 lit. c DSGVO in Verbindung mit dem nachstehend erklärten Widerspruch.

Soweit Sie personenbezogene Daten der betroffenen Person zu Zwecken der Direktwerbung verarbeiten, legen wir hiermit zugleich gemäß Art. 21 Abs. 2 DSGVO Widerspruch gegen diese Verarbeitung ein.

${ART_12_2_PARAGRAPH_DE}

Wir bitten Sie ferner um Auskunft nach Art. 15 DSGVO darüber, welche personenbezogenen Daten der betroffenen Person bei Ihnen verarbeitet wurden und an welche Empfänger oder Kategorien von Empfängern diese Daten offengelegt wurden.

Darüber hinaus bitten wir Sie, die betroffene Person in eine interne Sperrliste aufzunehmen, um eine erneute Erhebung und Speicherung ihrer Daten über Dritt- oder Fremdquellen künftig zu verhindern.

Bitte bestätigen Sie uns die vollständige Löschung der Daten sowie die Aufnahme in die Sperrliste schriftlich. Nach Art. 12 Abs. 3 DSGVO haben Sie uns hierüber unverzüglich, in jedem Fall aber innerhalb eines Monats nach Eingang dieses Antrags, zu unterrichten.

Für Rückfragen antworten Sie bitte direkt auf diese E-Mail; unsere Antwortadresse enthält ein Aktenzeichen zur Zuordnung.

Mit freundlichen Grüßen
${SERVICE_NAME}
– im Auftrag der betroffenen Person –

Aktenzeichen: ${token}`;

  return { subject, textBody, htmlBody: textToHtml(textBody) };
}

function buildEnglish(profile: OptOutRecipient, broker: OptOutBroker, token: string): OptOutMail {
  const subject = `[Ref: ${token}] Data erasure request pursuant to Art. 17 GDPR`;

  const textBody = `Dear Sir or Madam,

we are contacting you on behalf of and under power of attorney for the data subject named below. A written authorisation to exercise their data subject rights is on file and can be provided upon request.

Data subject:
${formatIdentification(profile, EN_LABELS)}

On behalf of the data subject, we hereby request that you erase all personal data stored about this person at ${broker.name} without undue delay and in full, pursuant to Art. 17 GDPR (right to erasure). Insofar as the processing is based on Art. 6(1)(f) GDPR, the obligation to erase follows at the latest from Art. 17(1)(c) GDPR in conjunction with the objection declared below.

Insofar as you process the data subject's personal data for direct marketing purposes, we hereby also object to such processing pursuant to Art. 21(2) GDPR.

${ART_12_2_PARAGRAPH_EN}

We further request information pursuant to Art. 15 GDPR regarding which personal data of the data subject have been processed by you and to which recipients or categories of recipients such data have been disclosed.

In addition, we ask you to add the data subject to an internal suppression list in order to prevent their data from being collected and stored again via third-party or external sources in the future.

Please confirm in writing the complete erasure of the data as well as the addition to the suppression list. Pursuant to Art. 12(3) GDPR, you are required to inform us about the action taken without undue delay and in any event within one month of receipt of this request.

For any questions, please reply directly to this email; our reply address contains a reference code for case assignment.

Kind regards
${SERVICE_NAME}
– on behalf of the data subject –

Reference: ${token}`;

  return { subject, textBody, htmlBody: textToHtml(textBody) };
}

// Self-Variante (Ich-Form): Betroffener ist selbst Absender, keine Vollmacht,
// keine Service-Signatur (SERVICE_NAME darf hier NICHT auftauchen -- eine
// Selbst-Anfrage kommt von einer Privatperson). Wording orientiert an der real versendeten
// (und beantworteten) Yasni-Anfrage vom 16.06.2026, um die Vergleichbarkeit
// des automatisierten Versands zu maximieren.
function buildGermanSelf(profile: OptOutRecipient, token: string): OptOutMail {
  const subject = `[Ref: ${token}] Auskunfts- und Löschersuchen gemäß Art. 15, 17, 21 DSGVO`;
  const name = formatName(profile);

  const textBody = `Sehr geehrte Damen und Herren,

ich, ${name}, mache hiermit als betroffene Person meine Rechte nach der Datenschutz-Grundverordnung (DSGVO) Ihnen gegenüber geltend.

Zu meiner Identifikation:
${formatIdentification(profile, DE_LABELS)}

1. Auskunft (Art. 15 Abs. 1 DSGVO)

Ich ersuche Sie um Auskunft darüber, ob personenbezogene Daten zu meiner Person von Ihnen verarbeitet werden, sowie — soweit dies der Fall ist — um Auskunft über:
a) die Verarbeitungszwecke (Art. 15 Abs. 1 lit. a DSGVO),
b) die Kategorien personenbezogener Daten, die verarbeitet werden (Art. 15 Abs. 1 lit. b DSGVO),
c) die Empfänger oder Kategorien von Empfängern, gegenüber denen die personenbezogenen Daten offengelegt worden sind oder noch offengelegt werden (Art. 15 Abs. 1 lit. c DSGVO),
d) die geplante Dauer der Speicherung bzw. die Kriterien für die Festlegung dieser Dauer (Art. 15 Abs. 1 lit. d DSGVO),
e) alle verfügbaren Informationen über die Herkunft der Daten, soweit diese nicht bei mir selbst erhoben wurden (Art. 15 Abs. 1 lit. g DSGVO).

2. Löschung (Art. 17 Abs. 1 DSGVO)

Soweit Sie personenbezogene Daten zu meiner Person verarbeiten, fordere ich Sie auf, diese gemäß Art. 17 Abs. 1 DSGVO unverzüglich und vollständig zu löschen. Soweit die Verarbeitung auf Art. 6 Abs. 1 lit. f DSGVO gestützt wird, ergibt sich die Löschpflicht spätestens aus Art. 17 Abs. 1 lit. c DSGVO in Verbindung mit dem unter Ziffer 3 erklärten Widerspruch.

3. Widerspruch gegen Direktwerbung (Art. 21 Abs. 2 DSGVO)

Soweit personenbezogene Daten zu meiner Person zu Zwecken der Direktwerbung verarbeitet werden, lege ich hiermit gemäß Art. 21 Abs. 2 DSGVO Widerspruch gegen diese Verarbeitung ein. Nach Art. 21 Abs. 3 DSGVO dürfen meine personenbezogenen Daten danach nicht mehr für Zwecke der Direktwerbung verarbeitet werden.

${ART_12_2_SELF_DE}

Nach Art. 12 Abs. 3 DSGVO haben Sie mich über die aufgrund dieses Antrags getroffenen Maßnahmen unverzüglich, in jedem Fall aber innerhalb eines Monats nach Eingang dieses Antrags, zu unterrichten.

Für Rückfragen antworten Sie bitte direkt auf diese E-Mail; die Antwortadresse enthält ein Aktenzeichen zur Zuordnung.

Mit freundlichen Grüßen
${name}

Aktenzeichen: ${token}`;

  return { subject, textBody, htmlBody: textToHtml(textBody) };
}

function buildEnglishSelf(profile: OptOutRecipient, token: string): OptOutMail {
  const subject = `[Ref: ${token}] Access and erasure request pursuant to Art. 15, 17, 21 GDPR`;
  const name = formatName(profile);

  const textBody = `Dear Sir or Madam,

I, ${name}, hereby exercise my rights as a data subject under the General Data Protection Regulation (GDPR) vis-à-vis your organisation.

For identification purposes:
${formatIdentification(profile, EN_LABELS)}

1. Access request (Art. 15(1) GDPR)

I request information as to whether personal data concerning me are processed by you and, where that is the case, access to the following information:
a) the purposes of the processing (Art. 15(1)(a) GDPR),
b) the categories of personal data concerned (Art. 15(1)(b) GDPR),
c) the recipients or categories of recipients to whom the personal data have been or will be disclosed (Art. 15(1)(c) GDPR),
d) the envisaged period for which the personal data will be stored, or the criteria used to determine that period (Art. 15(1)(d) GDPR),
e) any available information as to the source of the data, where the personal data are not collected from me (Art. 15(1)(g) GDPR).

2. Erasure (Art. 17(1) GDPR)

Insofar as you process personal data concerning me, I request that you erase such data without undue delay and in full pursuant to Art. 17(1) GDPR. Insofar as the processing is based on Art. 6(1)(f) GDPR, the obligation to erase follows at the latest from Art. 17(1)(c) GDPR in conjunction with the objection declared under section 3.

3. Objection to direct marketing (Art. 21(2) GDPR)

Insofar as personal data concerning me are processed for direct marketing purposes, I hereby object to such processing pursuant to Art. 21(2) GDPR. Pursuant to Art. 21(3) GDPR, my personal data may no longer be processed for direct marketing purposes thereafter.

${ART_12_2_SELF_EN}

Pursuant to Art. 12(3) GDPR, you are required to inform me about the action taken on this request without undue delay and in any event within one month of its receipt.

For any questions, please reply directly to this email; the reply address contains a reference code for case assignment.

Kind regards
${name}

Reference: ${token}`;

  return { subject, textBody, htmlBody: textToHtml(textBody) };
}

export function buildOptOutRequest(
  profile: OptOutRecipient,
  broker: OptOutBroker,
  token: string,
  locale: Locale = "de",
  // true = Selbst-Anfrage (Ich-Form, ohne Vollmacht/Service-Signatur).
  // Bewusst nur das Flag statt des Prozess-Objekts: das Template kennt nur,
  // was es fuer den Text braucht.
  isSelfRequest = false,
): OptOutMail {
  if (isSelfRequest) {
    return locale === "en" ? buildEnglishSelf(profile, token) : buildGermanSelf(profile, token);
  }
  return locale === "en"
    ? buildEnglish(profile, broker, token)
    : buildGerman(profile, broker, token);
}
