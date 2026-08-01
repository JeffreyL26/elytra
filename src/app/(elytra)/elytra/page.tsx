import Link from "next/link";
import { processStatusEnum } from "@/db/schema";
import {
  ATTENTION_OVERDUE_DAYS,
  ATTENTION_STALE_DAYS,
  type AttentionReason,
  getAttentionProcesses,
} from "@/lib/attention-processes";
import type { ProcessStatus } from "@/lib/customer-status";
import { getProcessesByStatus } from "@/lib/elytra-reads";

// Prozessliste. Standardansicht = aufmerksamkeitsbeduerftig (die
// attention-processes-Logik, ein Abfragepfad); optional gefiltert auf einen
// konkreten Status.
//
// PII-ARM: Die Liste zeigt Broker, Status, Token und Zeitpunkte -- keinen
// Mail-Volltext und keine Kundendaten.

const ATTENTION_LABELS: Record<AttentionReason, string> = {
  failed: "Versand fehlgeschlagen",
  manual_review: "Manuelle Prüfung",
  stale_in_progress: `Hängt (>${ATTENTION_STALE_DAYS} Tage in Bearbeitung)`,
  overdue_contacted: `Überfällig (>${ATTENTION_OVERDUE_DAYS} Tage ohne Antwort)`,
};

const TAG_CLASS: Record<AttentionReason, string> = {
  failed: "ely-tag ely-tag--failed",
  manual_review: "ely-tag ely-tag--review",
  stale_in_progress: "ely-tag ely-tag--stale",
  overdue_contacted: "ely-tag ely-tag--stale",
};

function fmt(date: Date | null): string {
  return date ? date.toISOString().slice(0, 16).replace("T", " ") : "—";
}

function daysSince(date: Date | null, now: Date): string {
  if (!date) {
    return "—";
  }
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  return `${days} T`;
}

export default async function ElytraListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const validStatus = processStatusEnum.enumValues.find((s) => s === status) as
    | ProcessStatus
    | undefined;
  const now = new Date();

  const attention = validStatus ? [] : await getAttentionProcesses(now);
  const filtered = validStatus ? await getProcessesByStatus(validStatus) : [];

  return (
    <>
      <h1 className="ely-title">Vorgänge</h1>
      <p className="ely-lead">
        Standardansicht: Vorgänge, die Aufmerksamkeit brauchen — fehlgeschlagen, in manueller
        Prüfung, seit über {ATTENTION_STALE_DAYS} Tagen in Bearbeitung oder seit über{" "}
        {ATTENTION_OVERDUE_DAYS} Tagen ohne Antwort.
      </p>

      <nav className="ely-filter" aria-label="Statusfilter">
        <Link
          href="/elytra"
          className="ely-filter__link"
          aria-current={validStatus ? undefined : "page"}
        >
          Aufmerksamkeit
        </Link>
        {processStatusEnum.enumValues.map((s) => (
          <Link
            key={s}
            href={`/elytra?status=${s}`}
            className="ely-filter__link"
            aria-current={validStatus === s ? "page" : undefined}
          >
            {s}
          </Link>
        ))}
      </nav>

      <div className="ely-table-wrap">
        <table className="ely-table">
          <thead>
            <tr>
              <th scope="col">Broker</th>
              <th scope="col">Status</th>
              {!validStatus && <th scope="col">Grund</th>}
              <th scope="col">Token</th>
              <th scope="col">Typ</th>
              <th scope="col">{validStatus ? "Kontaktiert" : "Wartet seit"}</th>
              <th scope="col">{validStatus ? "Aktualisiert" : "Dauer"}</th>
              <th scope="col">
                <span className="sr-only">Aktion</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {!validStatus &&
              attention.map((p) => (
                <tr key={p.processId}>
                  <td>
                    {p.brokerName}
                    <div className="ely-mono">{p.brokerSlug}</div>
                  </td>
                  <td>
                    <span className="ely-tag">{p.status}</span>
                  </td>
                  <td>
                    <span className={TAG_CLASS[p.attentionReason]}>
                      {ATTENTION_LABELS[p.attentionReason]}
                    </span>
                    {p.reason && <div className="ely-mono">{p.reason}</div>}
                  </td>
                  <td className="ely-mono">{p.processToken}</td>
                  <td className="ely-mono">{p.isSelfRequest ? "self" : "kunde"}</td>
                  <td className="ely-mono">{fmt(p.waitingSince)}</td>
                  <td className="ely-mono">{daysSince(p.waitingSince, now)}</td>
                  <td>
                    <Link href={`/elytra/${p.processId}`}>Öffnen</Link>
                  </td>
                </tr>
              ))}
            {validStatus &&
              filtered.map((p) => (
                <tr key={p.processId}>
                  <td>
                    {p.brokerName}
                    <div className="ely-mono">{p.brokerSlug}</div>
                  </td>
                  <td>
                    <span className="ely-tag">{p.status}</span>
                  </td>
                  <td className="ely-mono">{p.processToken}</td>
                  <td className="ely-mono">{p.isSelfRequest ? "self" : "kunde"}</td>
                  <td className="ely-mono">{fmt(p.lastContactedAt)}</td>
                  <td className="ely-mono">{fmt(p.updatedAt)}</td>
                  <td>
                    <Link href={`/elytra/${p.processId}`}>Öffnen</Link>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {((validStatus && filtered.length === 0) || (!validStatus && attention.length === 0)) && (
          <p className="ely-empty">
            {validStatus
              ? `Kein Vorgang mit Status ${validStatus}.`
              : "Kein Vorgang braucht gerade Aufmerksamkeit."}
          </p>
        )}
      </div>
    </>
  );
}
