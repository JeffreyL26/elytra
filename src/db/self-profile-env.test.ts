import { beforeEach, describe, expect, it, vi } from "vitest";

// env mocken, bevor self-profile-env es importiert.
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {} as Record<string, string | undefined>,
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

import { readSelfProfileEnv } from "@/db/self-profile-env";

const ALL_KEYS = [
  "SELF_NAME",
  "SELF_STREET",
  "SELF_POSTAL_CODE",
  "SELF_CITY",
  "SELF_EMAIL",
  "SELF_IDENTITY_EMAILS",
];

function setAll(): void {
  mockEnv.SELF_NAME = "Max Mustermann";
  mockEnv.SELF_STREET = "Musterstraße 1";
  mockEnv.SELF_POSTAL_CODE = "12345";
  mockEnv.SELF_CITY = "Musterstadt";
  mockEnv.SELF_EMAIL = "absender@example.org";
}

beforeEach(() => {
  for (const key of ALL_KEYS) {
    delete mockEnv[key];
  }
});

describe("readSelfProfileEnv", () => {
  it("wirft mit der Liste ALLER fehlenden Variablen, wenn nichts gesetzt ist", () => {
    expect(() => readSelfProfileEnv()).toThrow(
      /SELF_NAME, SELF_STREET, SELF_POSTAL_CODE, SELF_CITY, SELF_EMAIL/,
    );
  });

  it("nennt bei teilweise gesetzten Variablen nur die fehlenden (kein Teil-Seed)", () => {
    setAll();
    delete mockEnv.SELF_STREET;
    delete mockEnv.SELF_EMAIL;
    let message = "";
    try {
      readSelfProfileEnv();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("SELF_STREET, SELF_EMAIL");
    expect(message).not.toContain("SELF_NAME,");
  });

  it("liefert das Profil und faellt fuer identityEmails auf SELF_EMAIL zurueck", () => {
    setAll();
    expect(readSelfProfileEnv()).toEqual({
      name: "Max Mustermann",
      street: "Musterstraße 1",
      postalCode: "12345",
      city: "Musterstadt",
      senderEmail: "absender@example.org",
      identityEmails: ["absender@example.org"],
    });
  });

  it("parst SELF_IDENTITY_EMAILS (kommasepariert, getrimmt) und trennt sie von senderEmail", () => {
    setAll();
    mockEnv.SELF_IDENTITY_EMAILS = "alt1@example.org, alt2@example.net ,  alt3@example.com";
    const result = readSelfProfileEnv();
    expect(result.senderEmail).toBe("absender@example.org");
    expect(result.identityEmails).toEqual([
      "alt1@example.org",
      "alt2@example.net",
      "alt3@example.com",
    ]);
  });

  it("faellt auf SELF_EMAIL zurueck, wenn SELF_IDENTITY_EMAILS nur Leerzeichen/Kommata enthaelt", () => {
    setAll();
    mockEnv.SELF_IDENTITY_EMAILS = " , ,";
    expect(readSelfProfileEnv().identityEmails).toEqual(["absender@example.org"]);
  });
});
