import { describe, expect, it } from "vitest";
import {
  assertPasswordPolicy,
  MIN_PASSWORD_LENGTH,
  PasswordPolicyError,
  validatePasswordPolicy,
} from "@/lib/auth-password-policy";

// Ein Passwort, das ALLE Regeln erfuellt: 12+ Zeichen, Gross, Klein, Zahl,
// Sonderzeichen. Basis fuer die "genau eine Regel verletzt"-Faelle.
const VALID = "Sicher1!Passw0rt";

describe("validatePasswordPolicy", () => {
  it("akzeptiert ein Passwort, das alle Regeln erfuellt", () => {
    expect(validatePasswordPolicy(VALID)).toEqual([]);
  });

  // Jede Regel EINZELN verletzt -- damit der Guard pro Regel scharf bleibt und
  // ein spaeteres Lockern genau einer Regel sofort auffaellt.
  it("lehnt zu kurze Passwoerter ab (< 12 Zeichen)", () => {
    // 11 Zeichen, sonst regelkonform.
    expect(validatePasswordPolicy("Sicher1!Pa0")).toContain("too_short");
    expect("Sicher1!Pa0".length).toBe(MIN_PASSWORD_LENGTH - 1);
  });

  it("lehnt fehlenden Grossbuchstaben ab", () => {
    expect(validatePasswordPolicy("sicher1!passw0rt")).toEqual(["missing_uppercase"]);
  });

  it("lehnt fehlenden Kleinbuchstaben ab", () => {
    expect(validatePasswordPolicy("SICHER1!PASSW0RT")).toEqual(["missing_lowercase"]);
  });

  it("lehnt fehlende Ziffer ab", () => {
    expect(validatePasswordPolicy("Sicher!!Passwort")).toEqual(["missing_digit"]);
  });

  it("lehnt fehlendes Sonderzeichen ab", () => {
    expect(validatePasswordPolicy("Sicher12Passw0rt")).toEqual(["missing_special"]);
  });

  it("sammelt mehrere Verletzungen gleichzeitig", () => {
    // "abc": zu kurz, kein Gross, keine Zahl, kein Sonderzeichen.
    expect(validatePasswordPolicy("abc").sort()).toEqual(
      ["missing_digit", "missing_special", "missing_uppercase", "too_short"].sort(),
    );
  });
});

describe("assertPasswordPolicy", () => {
  it("wirft nicht bei gueltigem Passwort", () => {
    expect(() => assertPasswordPolicy(VALID)).not.toThrow();
  });

  it("wirft PasswordPolicyError mit den verletzten Regeln", () => {
    try {
      assertPasswordPolicy("abc");
      throw new Error("sollte geworfen haben");
    } catch (error) {
      expect(error).toBeInstanceOf(PasswordPolicyError);
      expect((error as PasswordPolicyError).violations).toContain("too_short");
    }
  });

  it("nennt das Passwort selbst NICHT in der Fehlermeldung", () => {
    const secret = "geheim";
    try {
      assertPasswordPolicy(secret);
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
