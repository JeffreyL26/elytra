import Link from "next/link";
import { notFound } from "next/navigation";
import { getProcessDetail } from "@/lib/elytra-reads";
import { isTerminal } from "@/lib/status-transitions";
import { ResolveForm } from "../../_components/resolve-form";

// Detailansicht eines Vorgangs: Stammdaten, Event-Verlauf inkl.
// Klassifikationen -- und der manuelle Abschluss.
//
// PII-ARM: kein Mail-Volltext (siehe getProcessDetail). Aus den
// Klassifikations-Events werden gezielt Kategorie/Confidence/Modell gezeigt,
// nicht der komplette Payload.

function fmt(date: Date | null): string {
  return date ? date.toISOString().slice(0, 19).replace("T", " ") : "—";
}

// Ausgewaehlte Payload-Schluessel je Event-Typ, damit der Verlauf lesbar bleibt
// und nicht versehentlich Rohdaten zeigt.
function describe(eventType: string, payload: Record<string, unknown>): string {
  const val = (key: string): string | null => {
    const v = payload[key];
    return v === undefined || v === null ? null : String(v);
  };
  const parts: string[] = [];
  if (eventType === "email_classified") {
    parts.push(`Kategorie: ${val("category") ?? "—"}`);
    parts.push(`Confidence: ${val("confidence") ?? "—"}`);
    if (val("needsManualReview") === "true") parts.push("→ manuelle Prüfung");
    if (val("model")) parts.push(`Modell: ${val("model")}`);
    if (val("promptVersion")) parts.push(`Prompt: ${val("promptVersion")}`);
  } else if (eventType === "status_changed") {
    parts.push(`${val("from") ?? "—"} → ${val("to") ?? "—"}`);
    if (val("reason")) parts.push(`Grund: ${val("reason")}`);
    if (val("attempted")) parts.push(`versucht: ${val("attempted")}`);
    if (val("source")) parts.push(`Quelle: ${val("source")}`);
    // Manueller Eingriff: Erkenntnisquelle + Begruendung + wer.
    if (val("knowledgeSource")) parts.push(`Erkenntnisquelle: ${val("knowledgeSource")}`);
    if (val("note")) parts.push(`Notiz: ${val("note")}`);
    if (val("adminUserId")) parts.push(`Bearbeiter: ${val("adminUserId")}`);
  } else if (eventType === "mail_sent") {
    parts.push(`an: ${val("to") ?? "—"}`);
    if (val("dummy") === "true") parts.push("(Dummy)");
  } else if (eventType === "mail_received") {
    parts.push(`Match-Stufe: ${val("matchStage") ?? "—"}`);
  } else if (eventType === "error") {
    parts.push(`${val("stage") ?? "—"}: ${val("errorMessage") ?? "—"}`);
  }
  return parts.join(" · ");
}

export default async function ElytraDetailPage({
  params,
}: {
  params: Promise<{ processId: string }>;
}) {
  const { processId } = await params;
  const detail = await getProcessDetail(processId);
  if (!detail) {
    notFound();
  }

  return (
    <>
      <Link href="/elytra" className="ely-back">
        ← Zurück zur Liste
      </Link>
      <h1 className="ely-title">{detail.brokerName}</h1>
      <p className="ely-lead">
        Vorgang {detail.processId} · {detail.isSelfRequest ? "Self-Request" : "Kundenvorgang"}
      </p>

      <div className="ely-grid">
        <div>
          <section className="ely-panel">
            <h2 className="ely-panel__title">Vorgang</h2>
            <dl className="ely-dl">
              <dt>Broker</dt>
              <dd>
                {detail.brokerName} <span className="ely-mono">({detail.brokerSlug})</span>
              </dd>
              <dt>Status</dt>
              <dd>
                <span className={isTerminal(detail.status) ? "ely-tag ely-tag--done" : "ely-tag"}>
                  {detail.status}
                </span>
              </dd>
              <dt>Token</dt>
              <dd className="ely-mono">{detail.processToken}</dd>
              <dt>Typ</dt>
              <dd>{detail.isSelfRequest ? "Self-Request" : "Kundenvorgang"}</dd>
              <dt>Angelegt</dt>
              <dd className="ely-mono">{fmt(detail.createdAt)}</dd>
              <dt>Kontaktiert</dt>
              <dd className="ely-mono">{fmt(detail.lastContactedAt)}</dd>
              <dt>Aktualisiert</dt>
              <dd className="ely-mono">{fmt(detail.updatedAt)}</dd>
            </dl>
          </section>

          <section className="ely-panel">
            <h2 className="ely-panel__title">Verlauf ({detail.events.length})</h2>
            <div className="ely-events">
              {detail.events.length === 0 && <p className="ely-hint">Keine Ereignisse.</p>}
              {detail.events.map((e) => (
                <div className="ely-event" key={e.id}>
                  <div className="ely-event__head">
                    <span className="ely-event__type">{e.eventType}</span>
                    <span className="ely-event__time">{fmt(e.createdAt)}</span>
                  </div>
                  <div className="ely-event__body">{describe(e.eventType, e.payload)}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <ResolveForm
          processId={detail.processId}
          currentStatus={detail.status}
          isSelfRequest={detail.isSelfRequest}
          isCurrentlyTerminal={isTerminal(detail.status)}
        />
      </div>
    </>
  );
}
