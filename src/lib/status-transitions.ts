import type { ProcessStatus } from "@/lib/customer-status";

// Uebergangsmatrix fuer process_status (Befund vom 14.07.2026: terminale Status
// waren ungeschuetzt -- eine zweite, widersprechende Broker-Antwort hat
// no_data_held kommentarlos mit success ueberschrieben).
//
// Haltung: Ein Broker, der sich widerspricht, ist kein Fall fuer Automatik.
// Es gibt bewusst KEINE Rangordnung terminaler Status ("success schlaegt
// no_data_held" o. ae.) -- jede Abweichung von einem bereits erreichten
// Terminalstatus eskaliert an einen Menschen. Lieber eine Review zu viel als
// ein still verfaelschtes Endergebnis.
//
// manual_review ist bewusst NICHT terminal: eine spaetere klaerende Mail muss
// den Vorgang nach Regel (a) wieder frei setzen koennen.

// Vollstaendige Terminalitaets-Klassifikation. Record<ProcessStatus, ...>
// erzwingt Exhaustivitaet: waechst process_status, bricht hier der Compile.
const TERMINALITY: Record<ProcessStatus, "terminal" | "non_terminal"> = {
  pending: "non_terminal",
  contacted: "non_terminal",
  in_progress: "non_terminal",
  // Interne Zwischenzustaende -- ein neuer Eingang darf sie frei ueberschreiben.
  manual_review: "non_terminal",
  failed: "non_terminal",
  no_response: "non_terminal",
  // Terminal: ein erreichtes Endergebnis gegenueber dem Broker.
  success: "terminal",
  no_data_held: "terminal",
  blacklisted: "terminal",
};

export const TERMINAL_STATES: ReadonlySet<ProcessStatus> = new Set(
  (Object.entries(TERMINALITY) as [ProcessStatus, "terminal" | "non_terminal"][])
    .filter(([, terminality]) => terminality === "terminal")
    .map(([status]) => status),
);

export function isTerminal(status: ProcessStatus): boolean {
  return TERMINAL_STATES.has(status);
}

// set      = uebernehmen (Freigabe-Verhalten wie bisher)
// confirm  = Terminalstatus bestaetigt, kein Wechsel, kein Event
// conflict = Terminalstatus widersprochen -> manual_review, Mensch entscheidet
export type TransitionKind = "set" | "confirm" | "conflict";

export interface Transition {
  next: ProcessStatus;
  kind: TransitionKind;
}

// Aufrufkontext. Die Konfliktregel schuetzt terminale Status gegen AUTOMATIK --
// gegen eine zweite, widersprechende Broker-Antwort, die niemand geprueft hat.
// Sie ist kein Schutz gegen den Menschen: ein Sachbearbeiter, der einen Vorgang
// bewusst abschliesst, ist genau die Instanz, an die "conflict" eskaliert. Er
// muss deshalb auch auf einem terminalen Status setzen duerfen -- sonst waere
// ein einmal eskalierter Konflikt nie aufloesbar.
//
// Default ist "classification": jeder bestehende Aufrufer (Inbound-Job) behaelt
// sein Verhalten unveraendert.
export type TransitionContext = "classification" | "manual";

export function resolveTransition(
  current: ProcessStatus | null,
  incoming: ProcessStatus,
  context: TransitionContext = "classification",
): Transition {
  // (0) Manueller Sachbearbeiter-Eingriff: setzt immer, auch auf terminalem
  // Status. Der Audit-Trail (reason=resolved_manual + Begruendung +
  // Erkenntnisquelle + Admin-userId) macht nachvollziehbar, dass ein Mensch
  // entschieden hat.
  if (context === "manual") {
    return { next: incoming, kind: "set" };
  }
  // (a) Noch kein Status oder nicht-terminal -> uebernehmen.
  if (current === null || !isTerminal(current)) {
    return { next: incoming, kind: "set" };
  }
  // (b) Terminal und deckungsgleich -> bestaetigt, kein Wechsel.
  if (incoming === current) {
    return { next: current, kind: "confirm" };
  }
  // (c) Terminal und abweichend -> Widerspruch, streng eskalieren.
  return { next: "manual_review", kind: "conflict" };
}
