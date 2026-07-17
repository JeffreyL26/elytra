// Passwort-Policy aus dem Lastenheft (FPW-3.2.1). SERVERSEITIG erzwungen --
// nicht als Better-Auth-Default (das kennt nur minPasswordLength), sondern als
// eigene, vollstaendig getestete Regel, eingehaengt im sign-up-Hook
// (src/lib/auth.ts). Jede Regel ist einzeln pruefbar, damit ein Regressions-
// Test pro Regel scharf bleibt.

export const MIN_PASSWORD_LENGTH = 12;

export type PasswordPolicyViolation =
  | "too_short"
  | "missing_uppercase"
  | "missing_lowercase"
  | "missing_digit"
  | "missing_special";

// Sonderzeichen = alles, was kein ASCII-Buchstabe und keine Ziffer ist. Bewusst
// weit gefasst (Symbole, Satzzeichen, Whitespace zaehlen), damit die Regel den
// Nutzer nicht in eine kleine Zeichenmenge zwingt.
const SPECIAL_CHAR = /[^A-Za-z0-9]/;

// Liefert ALLE verletzten Regeln (nicht nur die erste) -- so kann ein Aufrufer
// vollstaendig zurueckmelden und ein Test jede Regel isoliert treffen.
export function validatePasswordPolicy(password: string): PasswordPolicyViolation[] {
  const violations: PasswordPolicyViolation[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) {
    violations.push("too_short");
  }
  if (!/[A-Z]/.test(password)) {
    violations.push("missing_uppercase");
  }
  if (!/[a-z]/.test(password)) {
    violations.push("missing_lowercase");
  }
  if (!/[0-9]/.test(password)) {
    violations.push("missing_digit");
  }
  if (!SPECIAL_CHAR.test(password)) {
    violations.push("missing_special");
  }
  return violations;
}

export class PasswordPolicyError extends Error {
  readonly violations: PasswordPolicyViolation[];
  constructor(violations: PasswordPolicyViolation[]) {
    super(
      `Passwort erfuellt die Policy nicht (mind. ${MIN_PASSWORD_LENGTH} Zeichen, Gross-/Kleinbuchstabe, Zahl, Sonderzeichen): ${violations.join(", ")}`,
    );
    this.name = "PasswordPolicyError";
    this.violations = violations;
  }
}

// Wirft PasswordPolicyError, wenn irgendeine Regel verletzt ist. Das Passwort
// selbst wird NIE in die Message aufgenommen (PII-/Secret-Disziplin).
export function assertPasswordPolicy(password: string): void {
  const violations = validatePasswordPolicy(password);
  if (violations.length > 0) {
    throw new PasswordPolicyError(violations);
  }
}
