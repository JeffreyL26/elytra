"use client";

// Registrierungsformular. Die Passwort-Policy wird CLIENT-seitig live
// gespiegelt (Erfuellungs-Anzeige pro Regel, gleiche pure Funktion wie der
// Server), aber die WAHRHEIT bleibt die serverseitige Pruefung im
// Better-Auth-sign-up-Hook -- Client-Validierung ist UX, nie das Gate.

import Link from "next/link";
import { useId, useState } from "react";
import {
  MIN_PASSWORD_LENGTH,
  type PasswordPolicyViolation,
  validatePasswordPolicy,
} from "@/lib/auth-password-policy";

const RULE_LABELS: Record<PasswordPolicyViolation, string> = {
  too_short: `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`,
  missing_uppercase: "Ein Großbuchstabe",
  missing_lowercase: "Ein Kleinbuchstabe",
  missing_digit: "Eine Zahl",
  missing_special: "Ein Sonderzeichen",
};
const ALL_RULES = Object.keys(RULE_LABELS) as PasswordPolicyViolation[];

type Phase = "form" | "submitting" | "done";

export function RegisterForm({ mailDeliveryActive }: { mailDeliveryActive: boolean }) {
  const emailId = useId();
  const passwordId = useId();
  const policyId = useId();
  const errorId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);

  const violations = validatePasswordPolicy(password);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPhase("submitting");
    try {
      const res = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          // users.name ist ein Better-Auth-Pflichtfeld, fachlich ungenutzt
          // (der echte Name lebt im Profil) -- Local-Part als Platzhalter.
          name: email.split("@")[0] ?? "Konto",
          // Nach Klick auf den Verify-Link landet man auf unserer Landing-Seite.
          callbackURL: "/verifizieren",
        }),
      });
      if (res.ok) {
        setPhase("done");
        return;
      }
      const body = await res.json().catch(() => null);
      const code: string | undefined = body?.code;
      if (code === "WEAK_PASSWORD") {
        setError("Das Passwort erfüllt die Anforderungen nicht (siehe Liste unten).");
      } else if (code === "USER_ALREADY_EXISTS" || res.status === 422) {
        setError("Diese E-Mail-Adresse ist bereits registriert. Sie können sich anmelden.");
      } else if (res.status === 429) {
        setError("Zu viele Versuche. Bitte warten Sie einen Moment.");
      } else {
        setError("Die Registrierung ist fehlgeschlagen. Bitte versuchen Sie es erneut.");
      }
      setPhase("form");
    } catch {
      setError("Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung.");
      setPhase("form");
    }
  }

  if (phase === "done") {
    return (
      <div className="app-card">
        <h2 className="app-card__title">Konto erstellt</h2>
        <div className="app-form">
          {mailDeliveryActive ? (
            <p className="app-alert app-alert--success">
              Wir haben eine Bestätigungs-E-Mail an <strong>{email}</strong> gesendet. Bitte öffnen
              Sie den Link darin, um Ihre Adresse zu verifizieren.
            </p>
          ) : (
            // EHRLICHER Zwischenzustand: der Mail-Adapter laeuft im Log-Modus
            // (Customer-Stream noch nicht konfiguriert) -- es ging KEINE Mail
            // raus, und das sagen wir auch so.
            <p className="app-alert app-alert--info">
              Ihr Konto wurde erstellt. Der Versand von Bestätigungs-E-Mails ist derzeit noch nicht
              aktiv — Sie erhalten deshalb <strong>keine</strong> E-Mail, und Ihre Adresse kann im
              Moment nicht verifiziert werden. Sie können sich bereits anmelden; das Speichern von
              Profildaten wird freigeschaltet, sobald die Verifizierung verfügbar ist.
            </p>
          )}
          <p className="app-form__alt">
            <Link href="/profil">Weiter zum Profil</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <form className="app-card app-form" onSubmit={submit} noValidate>
      {error && (
        <p className="app-alert app-alert--error" id={errorId} role="alert">
          {error}
        </p>
      )}
      <div className="app-field">
        <label className="app-field__label" htmlFor={emailId}>
          E-Mail-Adresse
        </label>
        <input
          className="app-input"
          id={emailId}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      <div className="app-field">
        <label className="app-field__label" htmlFor={passwordId}>
          Passwort
        </label>
        <input
          className="app-input"
          id={passwordId}
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={policyId}
        />
        <ul className="app-policy" id={policyId} aria-label="Passwort-Anforderungen">
          {ALL_RULES.map((rule) => {
            const met = password.length > 0 && !violations.includes(rule);
            return (
              <li key={rule} className={`app-policy__rule${met ? " is-met" : ""}`}>
                {RULE_LABELS[rule]}
                <span className="sr-only">{met ? " – erfüllt" : " – noch nicht erfüllt"}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="app-form__foot">
        <button
          type="submit"
          className="app-btn app-btn--primary"
          disabled={phase === "submitting" || violations.length > 0 || email.length === 0}
        >
          {phase === "submitting" ? "Konto wird erstellt …" : "Konto erstellen"}
        </button>
        <p className="app-form__alt">
          Bereits registriert? <Link href="/anmelden">Anmelden</Link>
        </p>
      </div>
    </form>
  );
}
