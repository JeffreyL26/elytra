import { afterEach, describe, expect, it, vi } from "vitest";
import { dummyBrokers } from "@/data/dummy-brokers";
import { SERVICE_NAME } from "@/lib/branding";
import {
  buildOptOutRequest,
  type OptOutRecipient,
  toTemplateLocale,
} from "@/lib/mail/templates/opt-out-request";

// Variante ohne optionale Felder (dateOfBirth/phoneNumbers leer).
const profileMinimal: OptOutRecipient = {
  firstName: "Erika",
  lastName: "Mustermann",
  dateOfBirth: null,
  emailAddresses: ["erika.mustermann@example.com", "e.mustermann@example.org"],
  phoneNumbers: null,
  postalAddresses: [
    {
      street: "Musterstraße 12",
      postalCode: "10115",
      city: "Berlin",
      country: "DE",
    },
  ],
};

// Variante mit befuelltem Geburtsdatum und Telefonnummern.
const profileFull: OptOutRecipient = {
  ...profileMinimal,
  dateOfBirth: "1985-03-14",
  phoneNumbers: ["+49 30 1234567", "+49 170 9876543"],
};

// Einer der Dummy-Broker (dummy-broker-email) als realistische Kombination.
const broker = dummyBrokers[0];

// Fester Token, damit der Snapshot stabil bleibt (nicht zufaellig generiert).
const TOKEN = "test1234abcd5678";

describe("buildOptOutRequest", () => {
  it("erzeugt die deutsche Loeschanfrage ohne optionale Felder", () => {
    expect(buildOptOutRequest(profileMinimal, broker, TOKEN, "de")).toMatchSnapshot();
  });

  it("erzeugt die deutsche Loeschanfrage mit Geburtsdatum und Telefon", () => {
    expect(buildOptOutRequest(profileFull, broker, TOKEN, "de")).toMatchSnapshot();
  });

  it("erzeugt die englische Loeschanfrage ohne optionale Felder", () => {
    expect(buildOptOutRequest(profileMinimal, broker, TOKEN, "en")).toMatchSnapshot();
  });

  it("erzeugt die englische Loeschanfrage mit Geburtsdatum und Telefon", () => {
    expect(buildOptOutRequest(profileFull, broker, TOKEN, "en")).toMatchSnapshot();
  });

  it("erzeugt die deutsche Selbst-Anfrage ohne optionale Felder", () => {
    expect(buildOptOutRequest(profileMinimal, broker, TOKEN, "de", true)).toMatchSnapshot();
  });

  it("erzeugt die deutsche Selbst-Anfrage mit Geburtsdatum und Telefon", () => {
    expect(buildOptOutRequest(profileFull, broker, TOKEN, "de", true)).toMatchSnapshot();
  });

  it("erzeugt die englische Selbst-Anfrage ohne optionale Felder", () => {
    expect(buildOptOutRequest(profileMinimal, broker, TOKEN, "en", true)).toMatchSnapshot();
  });

  it("erzeugt die englische Selbst-Anfrage mit Geburtsdatum und Telefon", () => {
    expect(buildOptOutRequest(profileFull, broker, TOKEN, "en", true)).toMatchSnapshot();
  });

  // Eine Selbst-Anfrage kommt von einer Privatperson -- keine Brand-Fusszeile,
  // kein Service-Name darf aus dem Basis-Template durchsickern.
  it.each([
    "de",
    "en",
  ] as const)("Selbst-Anfrage (%s) enthaelt den Service-Namen nicht", (locale) => {
    const mail = buildOptOutRequest(profileFull, broker, TOKEN, locale, true);
    expect(mail.subject).not.toContain(SERVICE_NAME);
    expect(mail.textBody).not.toContain(SERVICE_NAME);
    expect(mail.htmlBody).not.toContain(SERVICE_NAME);
  });
});

describe("toTemplateLocale", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["de", "en"] as const)("laesst %s ohne Warnung durch", (language) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(toTemplateLocale(language, { brokerSlug: "irgendein-broker" })).toBe(language);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(["fr", "es"])("loggt den EN-Fallback fuer %s mit Broker-Kontext", (language) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(toTemplateLocale(language, { brokerSlug: "kompass" })).toBe("en");
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0]?.[0] as string;
    expect(message).toContain("kompass");
    expect(message).toContain(language);
    expect(message).toContain("EN-Fallback");
  });

  it("loggt den Fallback auch ohne Broker-Kontext (mit Platzhalter)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(toTemplateLocale("fr")).toBe("en");
    expect(warn.mock.calls[0]?.[0]).toContain("(broker unbekannt)");
  });
});

// ---------------------------------------------------------------------------
// INVARIANTE (dauerhaft, nicht nur Absicherung einer einzelnen Aenderung):
// Text- und HTML-Fassung muessen INHALTLICH IDENTISCH sein.
//
// Warum das ein Pflichttest ist und kein Nice-to-have: Die Anfrage ist ein
// rechtsverbindliches Dokument. Ein Empfaenger, der den Plaintext-Teil liest,
// muss exakt denselben Anspruch sehen wie einer, dessen Client HTML rendert.
// Liefen die Fassungen auseinander, waere im Streitfall unklar, WAS eigentlich
// zugestellt wurde -- ein Satz, der nur in einer der beiden Fassungen steht,
// ist praktisch nicht zustellbar bewiesen.
//
// Der Test darf NICHT geloescht oder aufgeweicht werden, wenn er bricht:
// Ein Bruch heisst, dass jemand Inhalt nur in einer Fassung geaendert hat.
// Rein strukturelle HTML-Aenderungen (Tags, Attribute, Styles) lassen ihn
// gruen -- er vergleicht ausschliesslich den Textinhalt.
function stripHtml(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, "") // Metadaten sind kein Inhalt
    .replace(/<[^>]+>/g, " ") // Tags raus, Wortgrenzen erhalten
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

describe("Text- und HTML-Fassung sind inhaltlich identisch", () => {
  const cases = [
    ["DE Vertretung", profileFull, "de" as const, false],
    ["EN Vertretung", profileFull, "en" as const, false],
    ["DE Self", profileFull, "de" as const, true],
    ["EN Self", profileFull, "en" as const, true],
    ["DE Self ohne optionale Felder", profileMinimal, "de" as const, true],
  ] as const;

  it.each(cases)("%s: getaggter HTML-Text == Plaintext", (_label, profile, locale, isSelf) => {
    const mail = buildOptOutRequest(profile, broker, TOKEN, locale, isSelf);
    expect(stripHtml(mail.htmlBody)).toBe(normalizeText(mail.textBody));
  });

  it.each(
    cases,
  )("%s: HTML ist ein vollstaendiges Dokument mit DOCTYPE", (_l, p, locale, isSelf) => {
    const mail = buildOptOutRequest(p, broker, TOKEN, locale, isSelf);
    expect(mail.htmlBody.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(mail.htmlBody).toContain(`<html lang="${locale}">`);
  });

  // Newsletter-Merkmale wuerden bei einem Rechtsdokument Misstrauen erzeugen
  // und die Spam-Bewertung verschlechtern.
  it.each(
    cases,
  )("%s: keine Bilder, Webfonts, externen Styles oder Skripte", (_l, p, lo, isSelf) => {
    const html = buildOptOutRequest(p, broker, TOKEN, lo, isSelf).htmlBody;
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/@import|https?:\/\/fonts\./i);
    // Kein <style>-Block: Outlook und einige Webclients strippen head-Styles,
    // deshalb liegen alle Angaben inline am Element.
    expect(html).not.toMatch(/<style\b/i);
  });

  it("Absatz-Elemente tragen Inline-Margins (Outlook setzt <p> auf margin:0)", () => {
    const html = buildOptOutRequest(profileFull, broker, TOKEN, "de", true).htmlBody;
    for (const tag of ["<p ", "<h2 ", "<ol ", "<li ", "<table "]) {
      const index = html.indexOf(tag);
      expect(index, `${tag} fehlt im HTML`).toBeGreaterThan(-1);
      // Jedes vorkommende Struktur-Element hat ein style-Attribut mit margin.
      const openingTag = html.slice(index, html.indexOf(">", index));
      expect(openingTag, `${tag} ohne style=`).toContain("style=");
      expect(openingTag, `${tag} ohne margin`).toContain("margin:");
    }
  });

  it("gliedert die Anspruchsgrundlagen als Ueberschriften und a)-e) als Liste", () => {
    const html = buildOptOutRequest(profileFull, broker, TOKEN, "de", true).htmlBody;
    expect((html.match(/<h2\b/g) ?? []).length).toBe(3);
    expect((html.match(/<li\b/g) ?? []).length).toBe(5);
    // Die Marker bleiben woertlich erhalten -- sonst liefe die HTML-Fassung
    // inhaltlich vom Plaintext weg (siehe Invariante oben).
    expect(html).toContain("a) die Verarbeitungszwecke");
  });
});
