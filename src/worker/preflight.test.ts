import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env mocken, bevor preflight es importiert -- wir steuern die Env-Werte.
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    ANTHROPIC_API_KEY: undefined as string | undefined,
    SELF_EMAIL: undefined as string | undefined,
  },
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

import { assertWorkerEnv } from "@/worker/preflight";

beforeEach(() => {
  mockEnv.ANTHROPIC_API_KEY = "sk-ant-test";
  mockEnv.SELF_EMAIL = "self@example.org";
});

afterEach(() => {
  vi.restoreAllMocks();
});

function spyExitThrowing() {
  return vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`exit ${code}`);
  }) as never);
}

describe("assertWorkerEnv", () => {
  it("beendet den Prozess (exit 1), wenn ANTHROPIC_API_KEY fehlt", () => {
    mockEnv.ANTHROPIC_API_KEY = undefined;
    const exit = spyExitThrowing();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => assertWorkerEnv()).toThrow("exit 1");
    expect(exit).toHaveBeenCalledWith(1);
    // Meldung nennt den fehlenden Key, aber niemals einen Wert.
    expect(error).toHaveBeenCalledWith(expect.stringContaining("ANTHROPIC_API_KEY"));
  });

  it("beendet den Prozess (exit 1), wenn SELF_EMAIL fehlt", () => {
    mockEnv.SELF_EMAIL = undefined;
    const exit = spyExitThrowing();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => assertWorkerEnv()).toThrow("exit 1");
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("SELF_EMAIL"));
  });

  it("nennt bei mehreren fehlenden Werten alle in einer Meldung", () => {
    mockEnv.ANTHROPIC_API_KEY = undefined;
    mockEnv.SELF_EMAIL = undefined;
    spyExitThrowing();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => assertWorkerEnv()).toThrow("exit 1");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("ANTHROPIC_API_KEY, SELF_EMAIL"));
  });

  it("laesst den Start durch, wenn alle Werte gesetzt sind", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    assertWorkerEnv();
    expect(exit).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Preflight OK: ANTHROPIC_API_KEY + SELF_EMAIL vorhanden");
  });
});
