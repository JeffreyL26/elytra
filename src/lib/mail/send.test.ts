import { beforeEach, describe, expect, it, vi } from "vitest";

// SES-SDK mocken, bevor send.ts es importiert (vitest hoistet vi.mock).
// SESClient/SendRawEmailCommand als Klassen, da send.ts sie mit `new` aufruft.
const mocks = vi.hoisted(() => {
  const sesSend = vi.fn();
  const construct = vi.fn();
  const rawCommand = vi.fn();
  class SESClient {
    send = sesSend;
    constructor(config: unknown) {
      construct(config);
    }
  }
  class SendRawEmailCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
      rawCommand(input);
    }
  }
  return { sesSend, construct, rawCommand, SESClient, SendRawEmailCommand };
});

vi.mock("@aws-sdk/client-ses", () => ({
  SESClient: mocks.SESClient,
  SendRawEmailCommand: mocks.SendRawEmailCommand,
}));

import { sendMail } from "@/lib/mail/send";

const MESSAGE_ID_PATTERN = /^<proc-[a-z0-9]+-[a-z0-9]+@.+>$/;

const baseInput = {
  from: "removals@example.com",
  to: "optout@broker.example",
  replyTo: "proc-test1234abcd5678@reply.example",
  subject: "[Ref: test1234abcd5678] Datenlöschanfrage",
  textBody: "Body text",
  htmlBody: "<p>Body text</p>",
  processToken: "test1234abcd5678",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendMail", () => {
  it("Dummy-Pfad: kein SES-Call, strukturierte Message-ID, [DUMMY]-Log", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await sendMail({ ...baseInput, dummy: true });

    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.sesSend).not.toHaveBeenCalled();
    expect(result.messageId).toMatch(MESSAGE_ID_PATTERN);
    expect(result.providerResponseId).toBeNull();
    expect(logSpy).toHaveBeenCalledWith(
      `[DUMMY] would send to ${baseInput.to}: ${baseInput.subject}`,
    );

    logSpy.mockRestore();
  });

  it("Real-Pfad: SendRawEmail mit Custom-Message-ID-Header, API-ID durchgereicht", async () => {
    mocks.sesSend.mockResolvedValue({ MessageId: "ses-api-id-123" });

    const result = await sendMail({ ...baseInput, dummy: false });

    expect(mocks.construct).toHaveBeenCalledTimes(1);
    expect(mocks.sesSend).toHaveBeenCalledTimes(1);
    expect(result.messageId).toMatch(MESSAGE_ID_PATTERN);
    expect(result.providerResponseId).toBe("ses-api-id-123");

    // Der Custom-Message-ID-Header muss in der gesendeten Roh-Mail stehen.
    const commandInput = mocks.rawCommand.mock.calls[0]?.[0] as {
      RawMessage: { Data: Uint8Array };
    };
    const rawText = Buffer.from(commandInput.RawMessage.Data).toString("utf8");
    expect(rawText).toContain(`Message-ID: ${result.messageId}`);
  });
});
