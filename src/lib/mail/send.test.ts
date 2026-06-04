import { beforeEach, describe, expect, it, vi } from "vitest";

// Postmark-SDK mocken, bevor send.ts es importiert (vitest hoistet vi.mock).
// ServerClient als Klasse, da send.ts ihn mit `new` aufruft.
const mocks = vi.hoisted(() => {
  const sendEmail = vi.fn();
  const construct = vi.fn();
  class ServerClient {
    sendEmail = sendEmail;
    constructor(token: unknown) {
      construct(token);
    }
  }
  return { sendEmail, construct, ServerClient };
});

vi.mock("postmark", () => ({
  ServerClient: mocks.ServerClient,
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
  it("Dummy-Pfad: kein Postmark-Call, strukturierte Message-ID, [DUMMY]-Log", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await sendMail({ ...baseInput, dummy: true });

    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(result.messageId).toMatch(MESSAGE_ID_PATTERN);
    expect(result.providerResponseId).toBeNull();
    expect(logSpy).toHaveBeenCalledWith(
      `[DUMMY] would send to ${baseInput.to}: ${baseInput.subject}`,
    );

    logSpy.mockRestore();
  });

  it("Real-Pfad: Postmark.sendEmail mit Custom-Message-ID-Header, API-ID durchgereicht", async () => {
    mocks.sendEmail.mockResolvedValue({
      MessageID: "postmark-msg-id-123",
      To: baseInput.to,
      SubmittedAt: "2026-05-25T00:00:00Z",
      ErrorCode: 0,
      Message: "OK",
    });

    const result = await sendMail({ ...baseInput, dummy: false });

    expect(mocks.construct).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(result.messageId).toMatch(MESSAGE_ID_PATTERN);
    expect(result.providerResponseId).toBe("postmark-msg-id-123");

    // Der Custom-Message-ID-Header muss explizit mitgesendet werden, damit der
    // Broker ihn in In-Reply-To reflektiert (Stufe-3-Matching).
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        From: baseInput.from,
        To: baseInput.to,
        ReplyTo: baseInput.replyTo,
        Subject: baseInput.subject,
        TextBody: baseInput.textBody,
        HtmlBody: baseInput.htmlBody,
        Headers: expect.arrayContaining([
          expect.objectContaining({ Name: "Message-ID", Value: result.messageId }),
        ]),
      }),
    );
  });
});
