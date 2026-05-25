import { describe, expect, it } from "vitest";
import { dummyBrokers } from "@/data/dummy-brokers";
import { buildOptOutRequest, type OptOutRecipient } from "@/lib/mail/templates/opt-out-request";

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
});
