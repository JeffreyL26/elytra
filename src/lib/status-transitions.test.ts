import { describe, expect, it } from "vitest";
import { processStatusEnum } from "@/db/schema";
import type { ProcessStatus } from "@/lib/customer-status";
import { isTerminal, resolveTransition, TERMINAL_STATES } from "@/lib/status-transitions";

const NON_TERMINAL: ProcessStatus[] = [
  "pending",
  "contacted",
  "in_progress",
  "manual_review",
  "failed",
  "no_response",
];
const TERMINAL: ProcessStatus[] = ["success", "no_data_held", "blacklisted"];

describe("TERMINAL_STATES", () => {
  it("enthaelt genau success, no_data_held, blacklisted", () => {
    expect([...TERMINAL_STATES].sort()).toEqual(["blacklisted", "no_data_held", "success"]);
  });

  it("haelt manual_review NICHT-terminal (klaerende Mail muss frei setzen koennen)", () => {
    expect(isTerminal("manual_review")).toBe(false);
  });

  // Exhaustivitaet: jeder Enum-Wert ist klassifiziert, keiner faellt durch.
  it("klassifiziert jeden process_status-Wert als terminal oder nicht-terminal", () => {
    const classified = [...TERMINAL, ...NON_TERMINAL].sort();
    expect([...processStatusEnum.enumValues].sort()).toEqual(classified);
  });
});

describe("resolveTransition — Regel (a): kein/nicht-terminaler Status", () => {
  it("uebernimmt jeden eingehenden Status, wenn current null ist", () => {
    for (const incoming of processStatusEnum.enumValues) {
      expect(resolveTransition(null, incoming)).toEqual({ next: incoming, kind: "set" });
    }
  });

  it.each(NON_TERMINAL)("uebernimmt aus nicht-terminalem current=%s jeden Eingang", (current) => {
    for (const incoming of processStatusEnum.enumValues) {
      expect(resolveTransition(current, incoming)).toEqual({ next: incoming, kind: "set" });
    }
  });
});

describe("resolveTransition — Regel (b): terminal + gleich", () => {
  it.each(TERMINAL)("bestaetigt %s ohne Wechsel", (status) => {
    expect(resolveTransition(status, status)).toEqual({ next: status, kind: "confirm" });
  });
});

describe("resolveTransition — Regel (c): terminal + abweichend", () => {
  it.each(TERMINAL)("eskaliert jeden abweichenden Eingang aus current=%s", (current) => {
    for (const incoming of processStatusEnum.enumValues) {
      if (incoming === current) continue;
      expect(resolveTransition(current, incoming)).toEqual({
        next: "manual_review",
        kind: "conflict",
      });
    }
  });

  // Die realen Faelle, die den Befund ausgeloest haben.
  it("no_data_held -> success ist ein Konflikt (realer Loopback-Fall vom 14.07.)", () => {
    expect(resolveTransition("no_data_held", "success")).toEqual({
      next: "manual_review",
      kind: "conflict",
    });
  });

  it("success -> no_data_held ist ein Konflikt", () => {
    expect(resolveTransition("success", "no_data_held")).toEqual({
      next: "manual_review",
      kind: "conflict",
    });
  });

  it("blacklisted -> success ist ein Konflikt", () => {
    expect(resolveTransition("blacklisted", "success")).toEqual({
      next: "manual_review",
      kind: "conflict",
    });
  });

  it("eskaliert auch auf nicht-terminale Eingaenge (keine Rangordnung)", () => {
    expect(resolveTransition("success", "in_progress")).toEqual({
      next: "manual_review",
      kind: "conflict",
    });
  });
});

describe("resolveTransition — Vollstaendigkeit der Matrix", () => {
  // Jede Kombination current x incoming liefert ein definiertes Ergebnis.
  it("behandelt jedes Paar aus (current|null) x incoming", () => {
    const currents: (ProcessStatus | null)[] = [null, ...processStatusEnum.enumValues];
    for (const current of currents) {
      for (const incoming of processStatusEnum.enumValues) {
        const result = resolveTransition(current, incoming);
        expect(["set", "confirm", "conflict"]).toContain(result.kind);
        expect(processStatusEnum.enumValues).toContain(result.next);
      }
    }
  });

  it("liefert bei kind=conflict immer manual_review als next", () => {
    const currents: (ProcessStatus | null)[] = [null, ...processStatusEnum.enumValues];
    for (const current of currents) {
      for (const incoming of processStatusEnum.enumValues) {
        const result = resolveTransition(current, incoming);
        if (result.kind === "conflict") {
          expect(result.next).toBe("manual_review");
        }
      }
    }
  });
});
