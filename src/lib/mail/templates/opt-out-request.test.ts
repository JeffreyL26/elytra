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
