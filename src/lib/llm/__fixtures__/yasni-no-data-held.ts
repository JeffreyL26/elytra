// Anonymisierte reale Broker-Antwort (Yasni, Juni 2026). Erster realer
// Datenpunkt der Pipeline; Kontext und Timeline in
// docs/real-broker-responses/2026-06-yasni.md.
//
// Anonymisierung: Name -> Max Mustermann, private E-Mail ->
// betroffene.person@example.org, Sachbearbeiterin -> "Sachbearbeiter/in".
// Yasni als Firma bleibt genannt (oeffentliche Fakten).

export const yasniNoDataHeldSubject =
  "AW: Auskunfts- und Löschersuchen gemäß Art. 15, 17, 21 DSGVO";

export const yasniNoDataHeldFrom = "info@yasni.com";

// Kurzer Mail-Body -- die Substanz steckt im PDF-Anhang.
export const yasniNoDataHeldBody = `Sehr geehrte Damen und Herren,

anbei erhalten Sie unsere Antwort auf Ihr Ersuchen als PDF-Dokument.

Mit freundlichen Grüßen
Sachbearbeiter/in
Yasni GmbH`;

// Sinngemaess anonymisierter Kerntext der PDF-Datenauskunft (gekuerzt).
export const yasniNoDataHeldPdfText = `Auskunft gemäß Art. 15 DSGVO sowie Stellungnahme zu Ihrem Lösch- und Widerspruchsersuchen (Art. 17, 21 DSGVO)

Sehr geehrte Damen und Herren,

Sie haben uns als Vertreter der betroffenen Person Max Mustermann um Auskunft über die Verarbeitung personenbezogener Daten sowie um deren Löschung ersucht.

Wir haben Ihre Anfrage geprüft. Zu der von Ihnen vertretenen Person liegen in unserem Dienst keine Suchergebnisse und kein Exposé vor. Eine Person "Max Mustermann" ist in unserem Suchindex nicht auffindbar.

Im Rahmen der Bearbeitung Ihres Ersuchens verarbeiten wir folgende Daten: den mitgeteilten Namen der betroffenen Person, die IP-Adresse des Absenders sowie die Daten dieser Korrespondenz. Diese Verarbeitung erfolgt ausschließlich zur Beantwortung und Dokumentation Ihres Ersuchens (Art. 6 Abs. 1 lit. c und f DSGVO) und die Daten werden nach Ablauf der gesetzlichen Fristen gelöscht.

Weitere personenbezogene Daten zu der betroffenen Person werden von uns nicht verarbeitet. Ihr Ersuchen betrachten wir damit als vollständig beantwortet.

Mit freundlichen Grüßen
Sachbearbeiter/in
Yasni GmbH`;
