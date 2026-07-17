// Zentrale Platzhalter-Werte der Marketing-Landing-Page.
//
// TODO[content]: vor Launch verifizieren -- reale Portfoliogroesse, finales
// Preismodell (Roadmap nennt abweichend 49 Euro / 8 Euro), Paragraph 5 UWG bei
// der Reichweitenangabe. Diese Werte stammen 1:1 aus dem statischen
// Landing-Page-Prototyp und sind NICHT verifiziert. Nicht stillschweigend
// uebernehmen, nicht an Ort und Stelle "korrigieren" -- nur hier aendern,
// damit alle Verwendungen konsistent bleiben.
//
// Bewusst NICHT hier: der Markenname. Die Marketing-Copy schreibt "GoKognito"
// als Literal im Fliesstext, nicht via SERVICE_NAME aus lib/branding.ts --
// eine Konstante wuerde Saetze zerhacken ("{SERVICE_NAME} ist der
// Widerspruch."), und die Copy ist ohnehin deutschsprachiger Prosatext, der
// bei einem Rebrand redaktionell durchgesehen werden muss. Die
// Nie-hartcodieren-Regel aus CLAUDE.md zielt auf Mail-Templates und
// Domain-/Absenderlogik, nicht auf Landing-Page-Prosa. Kein Refactor noetig.

// Reichweitenangabe (Zahl in "ueber N Datenhaendler"). Paragraph-5-UWG-
// relevant: darf erst live gehen, wenn das Broker-Register die Zahl
// tatsaechlich hergibt. Nur die Ziffer, damit Saetze sie flektieren koennen
// ("Über 180 ...", "an über 180 ...").
export const BROKER_COUNT_CLAIM = "180";

// Preisplaene. Monatspreis als Anzeigwert, Jahrespreis nach dem Muster
// "10 Monate zahlen, 12 bekommen" (Anzeige als Monats-Aequivalent).
// Alle Werte sind Strings, weil sie exakt so gerendert werden (Komma-Format).
export const PLANS = {
  basis: {
    name: "Basis",
    monthly: "7,99",
    yearlyPerMonth: "6,66",
    yearlyNote: "79,90 € einmal jährlich statt 95,88 €",
  },
  komplett: {
    name: "Komplett",
    monthly: "12,99",
    yearlyPerMonth: "10,83",
    yearlyNote: "129,90 € einmal jährlich statt 155,88 €",
  },
  familie: {
    name: "Familie",
    monthly: "19,99",
    yearlyPerMonth: "16,66",
    yearlyNote: "199,90 € einmal jährlich statt 239,88 €",
  },
} as const;

// Ankerpreis fuer CTA-Mikrotexte ("Ab 7,99 Euro im Monat").
export const PRICE_ANCHOR = PLANS.basis.monthly;

// Navigations- und Footer-Links, die auf kuenftige Unterseiten zeigen.
// Konvention: href bleibt "#", jedes Element traegt data-placeholder-link.
// Der Anchor-Handler in ScrollChoreography macht "#"-Links bewusst inert
// (kein Sprung an den Seitenanfang). Beim Verdrahten der echten Routen:
// href ersetzen und data-placeholder-link entfernen.
export const PLACEHOLDER_HREF = "#";
