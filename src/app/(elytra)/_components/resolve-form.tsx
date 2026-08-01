"use client";

// Manueller Prozessabschluss. Drei Pflichtangaben: Terminalstatus, Begruendung,
// Erkenntnisquelle. Die Wahrheit ist auch hier der Server -- die Route
// validiert dieselben drei Felder erneut.

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  MANUAL_TERMINAL_STATUSES,
  type ManualKnowledgeSource,
  type ManualTerminalStatus,
} from "@/lib/manual-resolution-contract";

const STATUS_LABELS: Record<ManualTerminalStatus, string> = {
  success: "success — Löschung bestätigt",
  no_data_held: "no_data_held — keine Daten vorhanden",
  blacklisted: "blacklisted — Werbesperre gesetzt",
};

// Die Erkenntnisquelle sagt, WORAUF das Ergebnis beruht -- getrennt vom reason,
// der sagt, WIE es zustande kam (resolved_manual).
const SOURCE_OPTIONS: Array<{ value: ManualKnowledgeSource; label: string; hint: string }> = [
  {
    value: "self_document",
    label: "Eigene Feststellung (Beleg liegt uns vor)",
    hint: "Nur bei Self-Requests: wir sind selbst Adressat und haben die Antwort gesehen.",
  },
  {
    value: "customer_report",
    label: "Kundenmeldung",
    hint: "Der Kunde hat berichtet. Wir haben es NICHT selbst geprüft — bei Kundenvorgängen geht die Antwort an die Kundenanschrift.",
  },
  {
    value: "other",
    label: "Sonstiges (Begründung nötig)",
    hint: "Jede andere Erkenntnisquelle — in der Begründung benennen.",
  },
];

export function ResolveForm({
  processId,
  currentStatus,
  isSelfRequest,
  isCurrentlyTerminal,
}: {
  processId: string;
  currentStatus: string;
  isSelfRequest: boolean;
  isCurrentlyTerminal: boolean;
}) {
  const router = useRouter();
  const statusId = useId();
  const sourceId = useId();
  const noteId = useId();

  const [targetStatus, setTargetStatus] = useState<ManualTerminalStatus | "">("");
  const [knowledgeSource, setKnowledgeSource] = useState<ManualKnowledgeSource | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const complete = targetStatus !== "" && knowledgeSource !== "" && note.trim() !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/elytra/processes/${processId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetStatus, knowledgeSource, note }),
      });
      if (res.ok) {
        const body = await res.json();
        setMessage({
          kind: "success",
          text: `Status gesetzt: ${body.from} → ${body.to}. Der Eingriff ist im Verlauf dokumentiert.`,
        });
        setNote("");
        setTargetStatus("");
        setKnowledgeSource("");
        router.refresh();
      } else if (res.status === 404) {
        setMessage({ kind: "error", text: "Vorgang nicht gefunden oder kein Zugriff." });
      } else {
        const body = await res.json().catch(() => null);
        setMessage({
          kind: "error",
          text:
            body?.error?.code === "validation_failed"
              ? "Terminalstatus, Begründung und Erkenntnisquelle sind Pflicht."
              : "Der Abschluss ist fehlgeschlagen.",
        });
      }
    } catch {
      setMessage({ kind: "error", text: "Keine Verbindung zum Server." });
    }
    setSubmitting(false);
  }

  const selectedSource = SOURCE_OPTIONS.find((o) => o.value === knowledgeSource);

  return (
    <section className="ely-panel">
      <h2 className="ely-panel__title">Manuell abschließen</h2>
      <form className="ely-form" onSubmit={submit} noValidate>
        <p className="ely-hint">
          Aktueller Status: <strong>{currentStatus}</strong>. Der Abschluss setzt einen
          Terminalstatus und wird mit Begründung, Erkenntnisquelle und Bearbeiter im Verlauf
          protokolliert.
        </p>

        {isCurrentlyTerminal && (
          <p className="ely-alert ely-alert--warn">
            Dieser Vorgang steht bereits auf einem Terminalstatus. Ein manueller Abschluss
            überschreibt ihn bewusst — das ist der Weg, einen eskalierten Konflikt aufzulösen.
          </p>
        )}
        {!isSelfRequest && (
          <p className="ely-alert ely-alert--warn">
            Kundenvorgang: Die Broker-Antwort geht an die Anschrift des Kunden, nicht an uns. Ein
            Abschluss dokumentiert hier eine <strong>Kundenmeldung</strong> — keine eigene Prüfung.
          </p>
        )}
        {message && (
          <p
            className={`ely-alert ely-alert--${message.kind}`}
            role={message.kind === "error" ? "alert" : "status"}
          >
            {message.text}
          </p>
        )}

        <div className="ely-field">
          <label className="ely-label" htmlFor={statusId}>
            Terminalstatus
          </label>
          <select
            className="ely-select"
            id={statusId}
            required
            value={targetStatus}
            onChange={(e) => setTargetStatus(e.target.value as ManualTerminalStatus)}
          >
            <option value="">— bitte wählen —</option>
            {MANUAL_TERMINAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="ely-field">
          <label className="ely-label" htmlFor={sourceId}>
            Erkenntnisquelle
          </label>
          <select
            className="ely-select"
            id={sourceId}
            required
            value={knowledgeSource}
            onChange={(e) => setKnowledgeSource(e.target.value as ManualKnowledgeSource)}
          >
            <option value="">— bitte wählen —</option>
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {selectedSource && <p className="ely-hint">{selectedSource.hint}</p>}
        </div>

        <div className="ely-field">
          <label className="ely-label" htmlFor={noteId}>
            Begründung
          </label>
          <textarea
            className="ely-textarea"
            id={noteId}
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Was wurde festgestellt bzw. was hat der Kunde berichtet?"
          />
        </div>

        <button type="submit" className="ely-btn" disabled={submitting || !complete}>
          {submitting ? "Wird gesetzt …" : "Vorgang abschließen"}
        </button>
      </form>
    </section>
  );
}
