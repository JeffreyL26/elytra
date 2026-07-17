"use client";

// Konto-Loeschung gegen DELETE /api/account. Der Endpunkt verlangt das
// aktuelle Passwort (Re-Authentifizierung) -- die Session allein reicht
// bewusst nicht. Die Warnung benennt ehrlich, dass laufende Anfragen mit
// beendet werden (kein 409-Block: Betroffenenrecht, das Mandat erlischt mit
// dem Konto).

import Link from "next/link";
import { useId, useState } from "react";

type Phase = "form" | "submitting" | "done";

export function DeleteAccountForm() {
  const passwordId = useId();
  const errorId = useId();

  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPhase("submitting");
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.status === 204) {
        setPhase("done");
        return;
      }
      const body = await res.json().catch(() => null);
      const code: string | undefined = body?.error?.code;
      if (code === "invalid_password") {
        setError("Das Passwort ist falsch. Ihr Konto wurde NICHT gelöscht.");
      } else if (res.status === 401) {
        setError("Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.");
      } else {
        setError("Die Löschung ist fehlgeschlagen. Ihr Konto besteht unverändert weiter.");
      }
      setPhase("form");
    } catch {
      setError("Keine Verbindung zum Server. Ihr Konto wurde nicht gelöscht.");
      setPhase("form");
    }
  }

  if (phase === "done") {
    return (
      <div className="app-card">
        <h2 className="app-card__title">Konto gelöscht</h2>
        <div className="app-form">
          <p className="app-alert app-alert--success">
            Ihr Konto und alle personenbezogenen Daten wurden dauerhaft gelöscht. Sie sind
            abgemeldet.
          </p>
          <p className="app-form__alt">
            <Link href="/">Zur Startseite</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <form className="app-card app-form" onSubmit={submit} noValidate>
      <h2 className="app-card__title">Konto endgültig löschen</h2>
      <section className="app-alert app-alert--error" aria-label="Warnung zur Löschung">
        <strong>Diese Aktion kann nicht rückgängig gemacht werden.</strong> Gelöscht werden Ihr
        Konto, Ihr Profil und der gesamte Verlauf Ihrer Anfragen.{" "}
        <strong>Laufende Löschanfragen an Data-Broker werden dabei beendet</strong> und nicht
        weiterverfolgt. Erhalten bleibt ausschließlich eine anonyme Statistik über das
        Antwortverhalten der Broker — ohne jeden Bezug zu Ihrer Person.
      </section>
      {error && (
        <p className="app-alert app-alert--error" id={errorId} role="alert">
          {error}
        </p>
      )}
      <div className="app-field">
        <label className="app-field__label" htmlFor={passwordId}>
          Zur Bestätigung: Ihr aktuelles Passwort
        </label>
        <input
          className="app-input"
          id={passwordId}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={error ? errorId : undefined}
        />
        <p className="app-field__hint">
          Die Passwort-Abfrage schützt Sie davor, dass eine fremde Person mit Zugriff auf Ihre
          Sitzung Ihr Konto löscht.
        </p>
      </div>
      <div className="app-form__foot">
        <button
          type="submit"
          className="app-btn app-btn--danger"
          disabled={phase === "submitting" || password.length === 0}
        >
          {phase === "submitting" ? "Wird gelöscht …" : "Konto unwiderruflich löschen"}
        </button>
        <p className="app-form__alt">
          <Link href="/profil">Abbrechen, zurück zum Profil</Link>
        </p>
      </div>
    </form>
  );
}
