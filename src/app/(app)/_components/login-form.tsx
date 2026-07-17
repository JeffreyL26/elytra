"use client";

// Login gegen Better Auths sign-in. Unverifizierte Konten duerfen sich
// anmelden (requireEmailVerification: false ist gewollt) -- den Hinweis auf
// die fehlende Verifizierung zeigt die Profilseite.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push("/profil");
        router.refresh();
        return;
      }
      if (res.status === 401) {
        // Bewusst nicht unterscheiden, ob die E-Mail existiert (api-contract 1.2).
        setError("E-Mail-Adresse oder Passwort ist falsch.");
      } else if (res.status === 429) {
        setError("Zu viele Versuche. Bitte warten Sie einen Moment.");
      } else {
        setError("Die Anmeldung ist fehlgeschlagen. Bitte versuchen Sie es erneut.");
      }
      setSubmitting(false);
    } catch {
      setError("Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung.");
      setSubmitting(false);
    }
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="app-form__foot">
        <button
          type="submit"
          className="app-btn app-btn--primary"
          disabled={submitting || email.length === 0 || password.length === 0}
        >
          {submitting ? "Wird angemeldet …" : "Anmelden"}
        </button>
        <p className="app-form__alt">
          Noch kein Konto? <Link href="/registrieren">Registrieren</Link>
        </p>
      </div>
    </form>
  );
}
