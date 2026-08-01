// Reale Broker-Antwort (ABIS GmbH, 20.07.2026) auf die DE-Selbstrunde vom
// 16.07.2026 -- ein Ticketsystem-Eingangsbestaetiger.
//
// WARUM DIESE FIXTURE ERHALTEN BLEIBT, obwohl ABIS als postalisch antwortender
// Broker dauerhaft aus dem Portfolio entfernt wurde (siehe Sektions-Kommentar in
// real-brokers-data.ts): Sie ist das einzige Exemplar eines
// Ticketsystem-Autoresponders und damit der Grenzfall zwischen zwei Kategorien:
//   * in_progress  -- "Anfrage erhalten und in Bearbeitung"
//   * unrelated    -- "reine Eingangsbestaetigung ohne Bezug"
// Die Mail vergibt eine Ticketnummer, hat also einen Bezug zur Anfrage, sagt
// aber inhaltlich NICHTS zur Sache. Sie sieht wie Fortschritt aus und ist
// keiner. Fuer den Vorgang ist das gefaehrlich, weil in_progress im Datenmodell
// keine Frist kennt -- ein Vorgang kann darauf unbemerkt parken (deshalb das
// Staleness-Kriterium in attention-processes.ts).
//
// HERKUNFT: Der Ticket-Ack hat die Pipeline nie erreicht (Befund 01.08.2026:
// keine Inbound-Mail der Runde in process_mails, ABIS blieb auf 'contacted').
// Grund: Broker antworten auf From (SELF_EMAIL), das Prozess-Token sitzt aber
// nur im Reply-To. Der Text stammt daher aus dem Postfach, nicht aus der DB.
//
// ANONYMISIERUNG: keine noetig am Inhalt -- die Mail enthaelt ausschliesslich
// Broker-Textbausteine und oeffentliche Firmenkontaktdaten (Impressumsangaben),
// keinerlei Daten der betroffenen Person. Die Ticketnummer ist bewusst erhalten:
// sie ist der Kern des Falls (Vorgangsnummer statt Sachaussage).

export const abisTicketAckSubject =
  "AW: [Ref: eca7iolgetc2bi2y] Auskunfts- und Löschersuchen gemäß Art. 15, 17, 21 DSGVO";

export const abisTicketAckFrom = "datenschutz@abis-online.de";

export const abisTicketAckBody = `Sehr geehrte Damen und Herren,

Ihre Nachricht ist bei uns eingegangen und wird unter der Ticketnummer ABISPRIVACY-110 geführt.
Bitte beziehen Sie sich bei Rückfragen stets auf diese Nummer.

Mit freundlichen Grüßen

ABIS Datenschutzmanagement

ABIS GmbH | Lyoner Straße 20 | 60528 Frankfurt
Fon: +49(69)792009-0 | Fax +49 69 792009-20
datenschutz@abis-online.de | www.abis-online.de`;
