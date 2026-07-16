import { describe, expect, it } from "vitest";
import { processStatusEnum } from "@/db/schema";
import {
  CUSTOMER_STATUS_LABELS,
  type CustomerStatus,
  type ProcessStatus,
  toCustomerStatus,
} from "@/lib/customer-status";

describe("toCustomerStatus", () => {
  // Exhaustivitaet zur Laufzeit: der never-Check im default faengt fehlende
  // Faelle bereits beim Compile ab, dieser Test sichert zusaetzlich, dass
  // KEIN Enum-Wert wirft oder etwas Unbekanntes liefert.
  it("bildet jeden process_status-Wert auf einen CustomerStatus ab", () => {
    const known = new Set<CustomerStatus>(Object.keys(CUSTOMER_STATUS_LABELS) as CustomerStatus[]);
    for (const status of processStatusEnum.enumValues) {
      const mapped = toCustomerStatus(status);
      expect(known.has(mapped), `${status} -> ${mapped} ist kein CustomerStatus`).toBe(true);
    }
  });

  it("deckt alle 9 process_status-Werte ab", () => {
    expect(processStatusEnum.enumValues).toHaveLength(9);
  });

  it.each([
    ["pending", "in_vorbereitung"],
    ["contacted", "kontaktiert"],
    ["in_progress", "in_pruefung"],
    ["manual_review", "in_pruefung"],
    ["failed", "in_pruefung"],
    ["success", "geloescht"],
    ["no_data_held", "verified_clean"],
    ["blacklisted", "werbesperre"],
    ["no_response", "keine_rueckmeldung"],
  ] as const)("mappt %s -> %s", (status, expected) => {
    expect(toCustomerStatus(status)).toBe(expected);
  });

  // Semantisch kritisch: no_data_held ist KEINE bestaetigte Loeschung.
  // "Verified Clean" ist ein eigener Produktwert -- die Differenz darf in der
  // Projektion nicht verlorengehen.
  it("haelt no_data_held und success getrennt (verified_clean != geloescht)", () => {
    expect(toCustomerStatus("no_data_held")).toBe("verified_clean");
    expect(toCustomerStatus("success")).toBe("geloescht");
    expect(toCustomerStatus("no_data_held")).not.toBe(toCustomerStatus("success"));
  });

  // Semantisch kritisch: Sperrliste heisst Daten bleiben, nur keine Werbung
  // mehr -- das darf nie als Loeschung angezeigt werden.
  it("haelt blacklisted und success getrennt (werbesperre != geloescht)", () => {
    expect(toCustomerStatus("blacklisted")).toBe("werbesperre");
    expect(toCustomerStatus("success")).toBe("geloescht");
    expect(toCustomerStatus("blacklisted")).not.toBe(toCustomerStatus("success"));
  });
});

describe("CUSTOMER_STATUS_LABELS", () => {
  it("hat fuer jeden CustomerStatus ein nicht-leeres Label", () => {
    for (const [status, label] of Object.entries(CUSTOMER_STATUS_LABELS)) {
      expect(label.length, `${status} braucht ein Label`).toBeGreaterThan(0);
    }
  });

  // eskaliert ist reserviert: kein process_status bildet (noch) darauf ab.
  it("enthaelt eskaliert als reservierten Wert ohne interne Quelle", () => {
    expect(CUSTOMER_STATUS_LABELS.eskaliert).toBe("Eskaliert");
    const mapped = processStatusEnum.enumValues.map((s: ProcessStatus) => toCustomerStatus(s));
    expect(mapped).not.toContain("eskaliert");
  });
});
