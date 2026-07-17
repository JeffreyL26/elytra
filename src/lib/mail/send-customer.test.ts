import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Die Env wird pro Test frisch gesetzt/entfernt. env.ts liest aus process.env,
// aber @t3-oss cached den validierten Wert beim ersten Import -> deshalb testen
// wir die reine Config-Logik ueber die exportierten Helfer, die zur Laufzeit
// process.env spiegeln. Um echte Postmark-Calls sicher auszuschliessen, ist der
// Stream in der Test-Env NICHT gesetzt (Log-Modus).

describe("send-customer (Customer-Stream-Adapter)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.resetModules();
  });

  it("meldet fehlende Customer-Stream-Env (Log-Modus, kein Stream in Tests)", async () => {
    const { missingCustomerStreamEnv } = await import("@/lib/mail/send-customer");
    // In der Test-Env ist POSTMARK_CUSTOMER_STREAM + MAIL_CUSTOMER_FROM_ADDRESS
    // bewusst nicht gesetzt -> beide fehlen.
    const missing = missingCustomerStreamEnv();
    expect(missing).toContain("POSTMARK_CUSTOMER_STREAM");
    expect(missing).toContain("MAIL_CUSTOMER_FROM_ADDRESS");
  });

  it("sendet im Log-Modus NICHT und gibt delivered=false zurueck", async () => {
    const { sendCustomerMail } = await import("@/lib/mail/send-customer");
    const result = await sendCustomerMail({
      to: "kunde@example.org",
      subject: "Bitte bestätigen",
      textBody: "Link",
      htmlBody: "<p>Link</p>",
    });
    expect(result.delivered).toBe(false);
    expect(result.stream).toBeNull();
  });

  it("loggt im Log-Modus eine unuebersehbare WARN mit Empfaenger, aber ohne Body", async () => {
    const { sendCustomerMail } = await import("@/lib/mail/send-customer");
    await sendCustomerMail({
      to: "kunde@example.org",
      subject: "Bitte bestätigen",
      textBody: "GEHEIMER-VERIFY-LINK",
      htmlBody: "<p>GEHEIMER-VERIFY-LINK</p>",
    });
    expect(warnSpy).toHaveBeenCalled();
    const logged = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(logged).toContain("NICHT versendet");
    expect(logged).toContain("kunde@example.org");
    // Der Body (Verify-Link) darf NICHT geloggt werden.
    expect(logged).not.toContain("GEHEIMER-VERIFY-LINK");
  });

  it("warnIfCustomerStreamMissing warnt einmal deutlich", async () => {
    const { warnIfCustomerStreamMissing } = await import("@/lib/mail/send-customer");
    warnIfCustomerStreamMissing();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(String(warnSpy.mock.calls[0][0])).toContain(
      "Customer-Message-Stream nicht konfiguriert",
    );
  });
});
