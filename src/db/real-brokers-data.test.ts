import { describe, expect, it } from "vitest";
import { realBrokers } from "@/db/real-brokers-data";
import {
  buildOptOutRequest,
  type OptOutRecipient,
  toTemplateLocale,
} from "@/lib/mail/templates/opt-out-request";

const waveBrokers = realBrokers.filter((b) => b.slug.startsWith("da-"));

// EU-Welle 2 (eigene Recherche 07/2026) -- kein gemeinsames Slug-Praefix,
// daher explizite Liste.
const EU_WAVE_2_SLUGS = ["kaspr", "databyte", "hunter-io", "kompass", "herold", "sovendus"];
const euWave2Brokers = realBrokers.filter((b) => EU_WAVE_2_SLUGS.includes(b.slug));

const profile: OptOutRecipient = {
  firstName: "Max",
  lastName: "Mustermann",
  dateOfBirth: null,
  emailAddresses: ["max.mustermann@example.org"],
  phoneNumbers: null,
  postalAddresses: [
    { street: "Musterstraße 1", postalCode: "12345", city: "Musterstadt", country: "DE" },
  ],
};

const TOKEN = "test1234abcd5678";

describe("Broker-Stammdaten Integritaet", () => {
  it("hat ausschliesslich gueltige country-Codes (ISO-3166-1-alpha-2 oder leer)", () => {
    const invalid = realBrokers
      .filter((b) => b.country != null && !/^[A-Z]{2}$/.test(b.country))
      .map((b) => `${b.slug}="${b.country}"`);
    expect(invalid).toEqual([]);
  });
});

describe("EU-Welle 2 Broker-Stammdaten", () => {
  it("umfasst genau 6 Eintraege", () => {
    expect(euWave2Brokers.map((b) => b.slug).sort()).toEqual([...EU_WAVE_2_SLUGS].sort());
  });

  // Guard gegen versehentliche Aktivierung ueber den Seed.
  it("hat KEINEN aktiven Broker in der Welle (alle isActive: false)", () => {
    for (const broker of euWave2Brokers) {
      expect(broker.isActive, `${broker.slug} muss inaktiv sein`).toBe(false);
    }
  });
});

describe("DE-Welle (da-*) Broker-Stammdaten", () => {
  it("umfasst genau 18 Eintraege", () => {
    expect(waveBrokers).toHaveLength(18);
  });

  // Guard gegen versehentliche Aktivierung ueber den Seed.
  it("hat KEINEN aktiven Broker in der Welle (alle isActive: false)", () => {
    for (const broker of waveBrokers) {
      expect(broker.isActive, `${broker.slug} muss inaktiv sein`).toBe(false);
    }
  });

  it("rendert fuer einen da-* Broker mit language 'de' das deutsche Template", () => {
    const deWaveBroker = waveBrokers.find((b) => b.language === "de");
    if (!deWaveBroker) {
      throw new Error("Fixture-Erwartung verletzt: kein da-* Broker mit language 'de'");
    }
    // language traegt einen DB-Default -> im Insert-Typ optional; hier per
    // .find bereits auf "de" eingegrenzt.
    const language = deWaveBroker.language ?? "de";
    const mail = buildOptOutRequest(
      profile,
      { name: deWaveBroker.name },
      TOKEN,
      toTemplateLocale(language),
    );
    expect(mail.subject).toContain("Datenlöschanfrage gemäß Art. 17 DSGVO");
    expect(mail.textBody).toContain("Sehr geehrte Damen und Herren");
    expect(mail.textBody).toContain(deWaveBroker.name);
  });
});
