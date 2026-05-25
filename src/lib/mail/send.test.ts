import { beforeEach, describe, expect, it, vi } from "vitest";

// SES-SDK mocken, bevor send.ts es importiert (vitest hoistet vi.mock).
// SESClient/SendEmailCommand als Klassen, da send.ts sie mit `new` aufruft.
const mocks = vi.hoisted(() => {
  const sesSend = vi.fn();
  const construct = vi.fn();
  class SESClient {
    send = sesSend;
    constructor(config: unknown) {
      construct(config);
    }
  }
  class SendEmailCommand {
    constructor(public input: unknown) {}
  }
  return { sesSend, construct, SESClient, SendEmailCommand };
});

vi.mock("@aws-sdk/client-ses", () => ({
  SESClient: mocks.SESClient,
  SendEmailCommand: mocks.SendEmailCommand,
}));

import { sendMail } from "@/lib/mail/send";

const baseInput = {
  from: "removals@example.com",
  to: "optout@broker.example",
  replyTo: "proc-test1234abcd5678@reply.example",
  subject: "[Ref: test1234abcd5678] Datenlöschanfrage",
  textBody: "Body text",
  htmlBody: "<p>Body text</p>",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendMail", () => {
  it("Dummy-Pfad: kein SES-Call, Fake-Message-ID, [DUMMY]-Log", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await sendMail({ ...baseInput, dummy: true });

    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.sesSend).not.toHaveBeenCalled();
    expect(result.messageId).toMatch(/^dummy-/);
    expect(logSpy).toHaveBeenCalledWith(
      `[DUMMY] would send to ${baseInput.to}: ${baseInput.subject}`,
    );

    logSpy.mockRestore();
  });

  it("Real-Pfad: SES wird aufgerufen, Message-ID wird durchgereicht", async () => {
    mocks.sesSend.mockResolvedValue({ MessageId: "ses-msg-123" });

    const result = await sendMail({ ...baseInput, dummy: false });

    expect(mocks.construct).toHaveBeenCalledTimes(1);
    expect(mocks.sesSend).toHaveBeenCalledTimes(1);
    expect(result.messageId).toBe("ses-msg-123");
  });
});
