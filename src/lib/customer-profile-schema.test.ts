import { describe, expect, it } from "vitest";
import { splitName } from "@/db/self-profile-env";
import { customerProfileSchema, parseCustomerProfile } from "@/lib/customer-profile-schema";

// Gueltiges Basis-Profil; die Einzeltests entfernen/verfaelschen daraus jeweils
// genau eine Pflichtangabe.
const validProfile = {
  firstName: "Max",
  lastName: "Mustermann",
  emailAddresses: ["max.mustermann@example.org"],
  postalAddresses: [
    { street: "Musterstraße 1", postalCode: "12345", city: "Musterstadt", country: "DE" },
  ],
};

function expectInvalid(input: unknown): void {
  expect(customerProfileSchema.safeParse(input).success).toBe(false);
}

describe("customerProfileSchema", () => {
  it("akzeptiert ein gueltiges Minimal-Profil", () => {
    expect(customerProfileSchema.safeParse(validProfile).success).toBe(true);
  });

  it("akzeptiert optionale Felder (phoneNumbers, dateOfBirth)", () => {
    const result = customerProfileSchema.safeParse({
      ...validProfile,
      phoneNumbers: ["+49 30 1234567"],
      dateOfBirth: "1985-03-14",
    });
    expect(result.success).toBe(true);
  });

  it("akzeptiert null fuer die optionalen Felder (nullable DB-Spalten)", () => {
    const result = customerProfileSchema.safeParse({
      ...validProfile,
      phoneNumbers: null,
      dateOfBirth: null,
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ["firstName fehlt", { ...validProfile, firstName: undefined }],
    ["firstName leer", { ...validProfile, firstName: "   " }],
    ["lastName fehlt (Mononym)", { ...validProfile, lastName: undefined }],
    ["lastName leer (Mononym)", { ...validProfile, lastName: "  " }],
    ["emailAddresses fehlt", { ...validProfile, emailAddresses: undefined }],
    ["emailAddresses leer", { ...validProfile, emailAddresses: [] }],
    ["postalAddresses fehlt", { ...validProfile, postalAddresses: undefined }],
    ["postalAddresses leer", { ...validProfile, postalAddresses: [] }],
  ])("wirft, wenn %s", (_name, input) => {
    expectInvalid(input);
  });

  it.each([
    ["street", { street: "", postalCode: "12345", city: "Musterstadt", country: "DE" }],
    [
      "postalCode",
      { street: "Musterstraße 1", postalCode: "", city: "Musterstadt", country: "DE" },
    ],
    ["city", { street: "Musterstraße 1", postalCode: "12345", city: "", country: "DE" }],
  ])("wirft bei unvollstaendiger Anschrift (%s fehlt)", (_field, address) => {
    expectInvalid({ ...validProfile, postalAddresses: [address] });
  });

  it.each([
    ["ALL (kein alpha-2)", "ALL"],
    ["kleingeschrieben", "de"],
    ["ausgeschrieben", "Deutschland"],
    ["leer", ""],
  ])("wirft bei ungueltigem country: %s", (_name, country) => {
    expectInvalid({
      ...validProfile,
      postalAddresses: [
        { street: "Musterstraße 1", postalCode: "12345", city: "Musterstadt", country },
      ],
    });
  });

  it.each([
    ["ohne @", "keine-mail"],
    ["ohne Domain", "max@"],
    ["leer", ""],
  ])("wirft bei ungueltiger E-Mail: %s", (_name, email) => {
    expectInvalid({ ...validProfile, emailAddresses: [email] });
  });

  it("wirft, wenn EINE von mehreren E-Mails ungueltig ist", () => {
    expectInvalid({
      ...validProfile,
      emailAddresses: ["gueltig@example.org", "kaputt"],
    });
  });

  it("wirft bei ungueltigem dateOfBirth-Format", () => {
    expectInvalid({ ...validProfile, dateOfBirth: "14.03.1985" });
  });
});

describe("parseCustomerProfile", () => {
  it("liefert das geparste Profil bei gueltiger Eingabe", () => {
    expect(parseCustomerProfile(validProfile, "Test")).toMatchObject({
      firstName: "Max",
      lastName: "Mustermann",
    });
  });

  it("benennt fehlende Felder im Fehler, ohne Werte zu leaken", () => {
    let message = "";
    try {
      parseCustomerProfile({ ...validProfile, lastName: "", emailAddresses: [] }, "Test-Kontext");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("Test-Kontext");
    expect(message).toContain("lastName");
    expect(message).toContain("emailAddresses");
    // Keine PII in der Meldung.
    expect(message).not.toContain("max.mustermann@example.org");
    expect(message).not.toContain("Musterstraße");
  });
});

describe("splitName (Self-Seed)", () => {
  it("trennt Vor- und Nachnamen", () => {
    expect(splitName("Max Mustermann")).toEqual({ firstName: "Max", lastName: "Mustermann" });
  });

  it("schlaegt Mehrfach-Nachnamen dem lastName zu", () => {
    expect(splitName("Erika von der Musterfrau")).toEqual({
      firstName: "Erika",
      lastName: "von der Musterfrau",
    });
  });

  it("bricht bei Ein-Wort-SELF_NAME sauber ab (Mononym), ohne den Wert zu leaken", () => {
    let message = "";
    try {
      splitName("Cher");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("SELF_NAME");
    expect(message).toContain("Mononyme");
    expect(message).not.toContain("Cher");
  });
});
