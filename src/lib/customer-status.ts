import type { processStatusEnum } from "@/db/schema";

// Kunden-Status-Projektion (Lastenheft-Festlegung).
//
// INVARIANTE: Der Kundenstatus wird NIEMALS gespeichert. Er ist eine reine
// Projektion aus opt_out_processes.status -- Anzeige-Vokabular fuer das
// Dashboard, KEINE Steuerungslogik. Es gibt bewusst keine Spalte, keinen
// Event und keinen Schreibpfad dafuer:
//   - Single Source of Truth bleibt process_status (rekonstruierbar aus
//     process_events).
//   - Ein persistierter Zweitstatus koennte divergieren; eine Projektion
//     kann das per Konstruktion nicht.
//   - Aenderungen am Kunden-Wording sind damit ein reiner Frontend-Deploy,
//     ohne Migration und ohne Backfill.
// Wer hier Verhalten aufhaengen will (Retry, Eskalation, Fristen), nutzt
// process_status -- nicht diesen Typ.
//
// TODO[nachweis]: Sobald aus diesen Status Kundenberichte/Nachweise generiert
// werden, muss die Herkunft des Ergebnisses mitgefuehrt werden. Ein per ELYTRA
// manuell gesetzter Status traegt im letzten status_changed-Event
// reason=resolved_manual plus knowledgeSource (self_document |
// customer_report | other, siehe manual-resolution.ts). Ein ueber
// knowledgeSource=customer_report gesetztes Ergebnis beruht auf einer
// Kundenmeldung -- wir haben es NICHT selbst geprueft (bei Kundenvorgaengen
// geht die Broker-Antwort an die Kundenanschrift, nie an uns). Es darf deshalb
// NIEMALS wie eine von uns verifizierte Broker-Antwort dargestellt werden.
// Diese Projektion allein kann das nicht unterscheiden: sie sieht nur den
// Status. Die Darstellung selbst ist bewusst noch nicht gebaut.

export type ProcessStatus = (typeof processStatusEnum.enumValues)[number];

export type CustomerStatus =
  | "in_vorbereitung"
  | "kontaktiert"
  | "in_pruefung"
  | "geloescht"
  | "verified_clean"
  | "werbesperre"
  | "keine_rueckmeldung"
  // Reserviert fuer die Eskalationslogik (Phase 3c): aktuell bildet KEIN
  // process_status hierauf ab -- es gibt noch keine interne Quelle dafuer.
  | "eskaliert";

// Exhaustiver Switch: Der never-Check im default erzwingt einen Compile-
// Fehler, sobald process_status um einen Wert erweitert wird, ohne ihn hier
// abzubilden.
export function toCustomerStatus(status: ProcessStatus): CustomerStatus {
  switch (status) {
    case "pending":
      return "in_vorbereitung";
    case "contacted":
      return "kontaktiert";
    // Alle drei sind fuer den Kunden dasselbe: "wir sind dran". failed und
    // manual_review sind interne Zustaende (Sachbearbeitung/Retry) und
    // duerfen nach aussen nicht als Endergebnis erscheinen.
    case "in_progress":
    case "manual_review":
    case "failed":
      return "in_pruefung";
    case "success":
      return "geloescht";
    // Bewusst NICHT geloescht: "Broker hielt keine Daten" ist ein eigener,
    // verkaufbarer Wert -- und keine bestaetigte Loeschung.
    case "no_data_held":
      return "verified_clean";
    // Bewusst NICHT geloescht: Sperrliste heisst, die Daten bleiben, werden
    // aber nicht mehr fuer Werbung genutzt.
    case "blacklisted":
      return "werbesperre";
    case "no_response":
      return "keine_rueckmeldung";
    default: {
      const exhaustive: never = status;
      throw new Error(`Unbekannter ProcessStatus: ${String(exhaustive)}`);
    }
  }
}

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  in_vorbereitung: "In Vorbereitung",
  kontaktiert: "Kontaktiert",
  in_pruefung: "In Prüfung",
  geloescht: "Gelöscht",
  verified_clean: "Verified Clean",
  werbesperre: "Werbesperre aktiv",
  keine_rueckmeldung: "Keine Rückmeldung",
  eskaliert: "Eskaliert",
};
