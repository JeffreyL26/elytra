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

function formatName(profile: OptOutRecipient): string {
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  return name || "—";
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

function buildGerman(profile: OptOutRecipient, broker: OptOutBroker, token: string): OptOutMail {
  const subject = `[Ref: ${token}] Datenlöschanfrage gemäß Art. 17 DSGVO`;

  const textBody = `Sehr geehrte Damen und Herren,

wir wenden uns im Auftrag und in Vollmacht der nachfolgend genannten betroffenen Person an Sie. Eine schriftliche Vollmacht zur Wahrnehmung ihrer Betroffenenrechte liegt uns vor und wird Ihnen auf Wunsch vorgelegt.

Betroffene Person:
${formatIdentification(profile, DE_LABELS)}

Namens und im Auftrag der betroffenen Person fordern wir Sie auf, sämtliche zu dieser Person bei ${broker.name} gespeicherten personenbezogenen Daten gemäß Art. 17 DSGVO (Recht auf Löschung) unverzüglich und vollständig zu löschen.

Soweit Sie personenbezogene Daten der betroffenen Person zu Zwecken der Direktwerbung verarbeiten, legen wir hiermit zugleich gemäß Art. 21 Abs. 2 DSGVO Widerspruch gegen diese Verarbeitung ein.

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

On behalf of the data subject, we hereby request that you erase all personal data stored about this person at ${broker.name} without undue delay and in full, pursuant to Art. 17 GDPR (right to erasure).

Insofar as you process the data subject's personal data for direct marketing purposes, we hereby also object to such processing pursuant to Art. 21(2) GDPR.

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

export function buildOptOutRequest(
  profile: OptOutRecipient,
  broker: OptOutBroker,
  token: string,
  locale: Locale = "de",
): OptOutMail {
  return locale === "en"
    ? buildEnglish(profile, broker, token)
    : buildGerman(profile, broker, token);
}
