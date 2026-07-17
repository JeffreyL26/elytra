import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env mocken, bevor runtime-env (und das mitgenutzte send-customer) es
// importieren -- so steuern wir die Env-Werte deterministisch.
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    ANTHROPIC_API_KEY: undefined as string | undefined,
    SELF_EMAIL: undefined as string | undefined,
    BETTER_AUTH_SECRET: undefined as string | undefined,
    BETTER_AUTH_URL: undefined as string | undefined,
    POSTMARK_SERVER_TOKEN: undefined as string | undefined,
    POSTMARK_CUSTOMER_STREAM: undefined as string | undefined,
    MAIL_CUSTOMER_FROM_ADDRESS: undefined as string | undefined,
  },
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

import { assertRuntimeEnv, RuntimeEnvError } from "@/lib/runtime-env";

beforeEach(() => {
  // Default: alle relevanten Werte gesetzt (vollstaendige Env).
  mockEnv.ANTHROPIC_API_KEY = "sk-ant-test";
  mockEnv.SELF_EMAIL = "self@example.org";
  mockEnv.BETTER_AUTH_SECRET = "secret-mind-32-zeichen-xxxxxxxxxxxx";
  mockEnv.BETTER_AUTH_URL = "http://localhost:3000";
  mockEnv.POSTMARK_SERVER_TOKEN = "pm-token";
  mockEnv.POSTMARK_CUSTOMER_STREAM = "customer-stream";
  mockEnv.MAIL_CUSTOMER_FROM_ADDRESS = "no-reply@example.org";
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("assertRuntimeEnv('web')", () => {
  it("wirft mit ALLEN fehlenden web-Pflichtwerten auf einmal", () => {
    mockEnv.BETTER_AUTH_SECRET = undefined;
    mockEnv.BETTER_AUTH_URL = undefined;
    vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      assertRuntimeEnv("web");
      throw new Error("sollte geworfen haben");
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeEnvError);
      expect((error as RuntimeEnvError).missing).toEqual(["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"]);
      // Message nennt die Namen, aber nie einen Wert.
      expect((error as RuntimeEnvError).message).toContain("BETTER_AUTH_SECRET");
      expect((error as RuntimeEnvError).message).toContain("BETTER_AUTH_URL");
    }
  });

  it("fehlende Customer-Mail-Vars -> nur WARN, KEIN Throw", () => {
    mockEnv.POSTMARK_CUSTOMER_STREAM = undefined;
    mockEnv.MAIL_CUSTOMER_FROM_ADDRESS = undefined;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => assertRuntimeEnv("web")).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it("vollstaendige Env -> gruen (kein Throw, keine Customer-WARN)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertRuntimeEnv("web")).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("assertRuntimeEnv('worker')", () => {
  it("wirft mit allen fehlenden worker-Pflichtwerten auf einmal", () => {
    mockEnv.ANTHROPIC_API_KEY = undefined;
    mockEnv.SELF_EMAIL = undefined;

    try {
      assertRuntimeEnv("worker");
      throw new Error("sollte geworfen haben");
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeEnvError);
      expect((error as RuntimeEnvError).missing).toEqual(["ANTHROPIC_API_KEY", "SELF_EMAIL"]);
    }
  });

  it("POSTMARK_SERVER_TOKEN ist fuer den Worker NICHT hart-required (Dummy-Modus)", () => {
    mockEnv.POSTMARK_SERVER_TOKEN = undefined;
    expect(() => assertRuntimeEnv("worker")).not.toThrow();
  });

  it("vollstaendige Env -> gruen", () => {
    expect(() => assertRuntimeEnv("worker")).not.toThrow();
  });
});
