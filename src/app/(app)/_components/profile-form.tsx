"use client";

// Profilformular gegen die BESTEHENDEN Endpunkte (POST/PUT /api/profile).
// Client-Validierung spiegelt customerProfileSchema (dasselbe Zod-Schema wie
// der Server -- eine Validierungswahrheit, zweimal genutzt); das GATE bleibt
// der Server. Bei unverifizierter E-Mail ist das Formular sichtbar, aber das
// Speichern geblockt -- mit Erklaerung statt rohem 403.

import { useId, useState } from "react";
import type { PostalAddress } from "@/db/schema";
import { customerProfileSchema } from "@/lib/customer-profile-schema";

export interface ProfileFormData {
  firstName: string;
  lastName: string;
  emailAddresses: string[];
  phoneNumbers: string[];
  postalAddresses: PostalAddress[];
  dateOfBirth: string;
}

const EMPTY_ADDRESS: PostalAddress = { street: "", postalCode: "", city: "", country: "DE" };

function toPayload(data: ProfileFormData) {
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    emailAddresses: data.emailAddresses.filter((e) => e.trim() !== ""),
    phoneNumbers:
      data.phoneNumbers.filter((p) => p.trim() !== "").length > 0
        ? data.phoneNumbers.filter((p) => p.trim() !== "")
        : null,
    postalAddresses: data.postalAddresses,
    dateOfBirth: data.dateOfBirth.trim() === "" ? null : data.dateOfBirth,
  };
}

// Zod-Pfade (z. B. "postalAddresses.0.street") auf Feld-Botschaften mappen.
const FIELD_LABELS: Record<string, string> = {
  firstName: "Vorname",
  lastName: "Nachname",
  emailAddresses: "E-Mail-Adressen",
  phoneNumbers: "Telefonnummern",
  "postalAddresses.street": "Straße",
  "postalAddresses.postalCode": "Postleitzahl",
  "postalAddresses.city": "Ort",
  "postalAddresses.country": "Land",
  dateOfBirth: "Geburtsdatum",
};
function describeFields(paths: string[]): string {
  const labels = [
    ...new Set(
      paths.map((p) => {
        const normalized = p.replace(/\.\d+/g, "");
        return FIELD_LABELS[normalized] ?? normalized;
      }),
    ),
  ];
  return labels.join(", ");
}

export function ProfileForm({
  verified,
  initialProfile,
}: {
  verified: boolean;
  initialProfile: ProfileFormData | null;
}) {
  const ids = {
    firstName: useId(),
    lastName: useId(),
    phone: useId(),
    dob: useId(),
    street: useId(),
    postalCode: useId(),
    city: useId(),
    country: useId(),
    status: useId(),
  };

  const exists = initialProfile !== null;
  const [data, setData] = useState<ProfileFormData>(
    initialProfile ?? {
      firstName: "",
      lastName: "",
      emailAddresses: [""],
      phoneNumbers: [],
      postalAddresses: [EMPTY_ADDRESS],
      dateOfBirth: "",
    },
  );
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const address = data.postalAddresses[0] ?? EMPTY_ADDRESS;
  function setAddress(patch: Partial<PostalAddress>) {
    setData((d) => ({ ...d, postalAddresses: [{ ...address, ...patch }] }));
  }
  function setEmail(index: number, value: string) {
    setData((d) => {
      const emails = [...d.emailAddresses];
      emails[index] = value;
      return { ...d, emailAddresses: emails };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    // Client-Spiegel der Server-Validierung: gleiche Zod-Wahrheit, frueheres
    // Feedback. Das serverseitige 400 bleibt der eigentliche Waechter.
    const parsed = customerProfileSchema.safeParse(toPayload(data));
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join("."));
      setMessage({
        kind: "error",
        text: `Bitte prüfen Sie folgende Angaben: ${describeFields(fields)}.`,
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/profile", {
        method: exists ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (res.ok) {
        setMessage({ kind: "success", text: "Ihr Profil wurde gespeichert." });
        setSubmitting(false);
        return;
      }
      const body = await res.json().catch(() => null);
      const code: string | undefined = body?.error?.code;
      if (code === "email_not_verified") {
        setMessage({
          kind: "error",
          text: "Ihre E-Mail-Adresse ist noch nicht bestätigt — Profildaten können erst danach gespeichert werden.",
        });
      } else if (code === "validation_failed") {
        setMessage({
          kind: "error",
          text: `Bitte prüfen Sie folgende Angaben: ${describeFields(body?.error?.fields ?? [])}.`,
        });
      } else if (res.status === 401) {
        setMessage({
          kind: "error",
          text: "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
        });
      } else {
        setMessage({
          kind: "error",
          text: "Speichern fehlgeschlagen. Bitte versuchen Sie es erneut.",
        });
      }
      setSubmitting(false);
    } catch {
      setMessage({
        kind: "error",
        text: "Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung.",
      });
      setSubmitting(false);
    }
  }

  return (
    <form className="app-card app-form" onSubmit={submit} noValidate>
      {!verified && (
        <p className="app-alert app-alert--info">
          Ihre E-Mail-Adresse ist noch nicht bestätigt. Sie können das Formular bereits ausfüllen —
          <strong> gespeichert werden kann erst nach der Bestätigung</strong>. Den Link finden Sie
          in Ihrer Bestätigungs-E-Mail.
        </p>
      )}
      {message && (
        <p
          className={`app-alert app-alert--${message.kind}`}
          id={ids.status}
          role={message.kind === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}

      <div className="app-field-row">
        <div className="app-field">
          <label className="app-field__label" htmlFor={ids.firstName}>
            Vorname
          </label>
          <input
            className="app-input"
            id={ids.firstName}
            autoComplete="given-name"
            required
            value={data.firstName}
            onChange={(e) => setData((d) => ({ ...d, firstName: e.target.value }))}
          />
        </div>
        <div className="app-field">
          <label className="app-field__label" htmlFor={ids.lastName}>
            Nachname
          </label>
          <input
            className="app-input"
            id={ids.lastName}
            autoComplete="family-name"
            required
            value={data.lastName}
            onChange={(e) => setData((d) => ({ ...d, lastName: e.target.value }))}
          />
        </div>
      </div>

      <fieldset className="app-fieldset">
        <legend>E-Mail-Adressen</legend>
        <p className="app-field__hint">
          Adressen, unter denen Data-Broker Sie kennen könnten — mindestens eine.
        </p>
        {data.emailAddresses.map((email, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: editierbare String-Liste ohne natuerliche ID; Inputs sind controlled (value aus dem State), Re-Zuordnung nach Entfernen ist deshalb korrekt
          <div className="app-list-row" key={index}>
            <label className="sr-only" htmlFor={`profile-email-${index}`}>
              E-Mail-Adresse {index + 1}
            </label>
            <input
              className="app-input"
              id={`profile-email-${index}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(index, e.target.value)}
            />
            {data.emailAddresses.length > 1 && (
              <button
                type="button"
                className="app-btn app-btn--ghost app-btn--small"
                onClick={() =>
                  setData((d) => ({
                    ...d,
                    emailAddresses: d.emailAddresses.filter((_, i) => i !== index),
                  }))
                }
                aria-label={`E-Mail-Adresse ${index + 1} entfernen`}
              >
                Entfernen
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="app-btn app-btn--ghost app-btn--small"
          onClick={() => setData((d) => ({ ...d, emailAddresses: [...d.emailAddresses, ""] }))}
        >
          + Weitere E-Mail-Adresse
        </button>
      </fieldset>

      <fieldset className="app-fieldset">
        <legend>Postanschrift</legend>
        <div className="app-field">
          <label className="app-field__label" htmlFor={ids.street}>
            Straße und Hausnummer
          </label>
          <input
            className="app-input"
            id={ids.street}
            autoComplete="street-address"
            required
            value={address.street}
            onChange={(e) => setAddress({ street: e.target.value })}
          />
        </div>
        <div className="app-field-row">
          <div className="app-field">
            <label className="app-field__label" htmlFor={ids.postalCode}>
              Postleitzahl
            </label>
            <input
              className="app-input"
              id={ids.postalCode}
              autoComplete="postal-code"
              required
              value={address.postalCode}
              onChange={(e) => setAddress({ postalCode: e.target.value })}
            />
          </div>
          <div className="app-field">
            <label className="app-field__label" htmlFor={ids.city}>
              Ort
            </label>
            <input
              className="app-input"
              id={ids.city}
              autoComplete="address-level2"
              required
              value={address.city}
              onChange={(e) => setAddress({ city: e.target.value })}
            />
          </div>
        </div>
        <div className="app-field">
          <label className="app-field__label" htmlFor={ids.country}>
            Land
          </label>
          <input
            className="app-input"
            id={ids.country}
            autoComplete="country"
            required
            maxLength={2}
            value={address.country}
            onChange={(e) => setAddress({ country: e.target.value.toUpperCase() })}
          />
          <p className="app-field__hint">Ländercode, zwei Buchstaben (z. B. DE, AT, CH).</p>
        </div>
      </fieldset>

      <div className="app-field-row">
        <div className="app-field">
          <label className="app-field__label" htmlFor={ids.phone}>
            Telefonnummer (optional)
          </label>
          <input
            className="app-input"
            id={ids.phone}
            type="tel"
            autoComplete="tel"
            value={data.phoneNumbers[0] ?? ""}
            onChange={(e) =>
              setData((d) => ({
                ...d,
                phoneNumbers: e.target.value.trim() === "" ? [] : [e.target.value],
              }))
            }
          />
        </div>
        <div className="app-field">
          <label className="app-field__label" htmlFor={ids.dob}>
            Geburtsdatum (optional)
          </label>
          <input
            className="app-input"
            id={ids.dob}
            type="date"
            autoComplete="bday"
            value={data.dateOfBirth}
            onChange={(e) => setData((d) => ({ ...d, dateOfBirth: e.target.value }))}
          />
          <p className="app-field__hint">Hilft, Sie bei Brokern eindeutig zu identifizieren.</p>
        </div>
      </div>

      <div className="app-form__foot">
        <button
          type="submit"
          className="app-btn app-btn--primary"
          disabled={submitting || !verified}
          title={!verified ? "Erst nach E-Mail-Bestätigung möglich" : undefined}
        >
          {submitting ? "Wird gespeichert …" : exists ? "Änderungen speichern" : "Profil anlegen"}
        </button>
        {!verified && <span className="app-form__alt">Speichern erst nach Bestätigung.</span>}
      </div>
    </form>
  );
}
