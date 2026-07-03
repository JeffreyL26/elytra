import { afterEach, describe, expect, it, vi } from "vitest";

// env mocken, bevor preflight es importiert -- wir steuern ANTHROPIC_API_KEY.
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { ANTHROPIC_API_KEY: undefined as string | undefined },
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

import { assertWorkerEnv } from "@/worker/preflight";

describe("assertWorkerEnv", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("beendet den Prozess (exit 1), wenn ANTHROPIC_API_KEY fehlt", () => {
    mockEnv.ANTHROPIC_API_KEY = undefined;
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => assertWorkerEnv()).toThrow("exit 1");
    expect(exit).toHaveBeenCalledWith(1);
    // Meldung nennt den fehlenden Key, aber niemals einen Wert.
    expect(error).toHaveBeenCalledWith(expect.stringContaining("ANTHROPIC_API_KEY"));
  });

  it("laesst den Start durch, wenn ANTHROPIC_API_KEY gesetzt ist", () => {
    mockEnv.ANTHROPIC_API_KEY = "sk-ant-test";
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    assertWorkerEnv();
    expect(exit).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Preflight OK: Anthropic-Key vorhanden");
  });
});
