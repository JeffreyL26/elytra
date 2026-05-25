import { beforeEach, describe, expect, it, vi } from "vitest";

// Anthropic-SDK mocken, bevor classify-inbound es importiert. Kein echter
// API-Call -- wir testen Parsing, Threshold-Routing und Metadaten.
const { messagesCreate } = vi.hoisted(() => ({ messagesCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: messagesCreate };
  },
}));

import {
  CLASSIFY_MODEL,
  CLASSIFY_PROMPT_VERSION,
  classifyInbound,
  type InboundCategory,
} from "@/lib/llm/classify-inbound";

// Baut eine gemockte tool_use-Antwort wie sie der SDK liefern wuerde.
function mockToolUse(
  category: InboundCategory,
  confidence: number,
  reasoning = "synthetische Begruendung",
) {
  messagesCreate.mockResolvedValue({
    content: [
      {
        type: "tool_use",
        name: "classify_email",
        input: { category, confidence, reasoning },
      },
    ],
  });
}

const input = {
  subject: "Re: [Ref: test1234abcd5678] Datenlöschanfrage",
  textBody: "Beispieltext der Broker-Antwort.",
  fromAddress: "support@broker.example",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("classifyInbound", () => {
  it.each([
    ["success", 0.95],
    ["blacklisted", 0.9],
    ["in_progress", 0.85],
    ["rejected", 0.88],
    ["unrelated", 0.8],
  ] as const)("klassifiziert Kategorie %s mit hoher Confidence", async (category, confidence) => {
    mockToolUse(category, confidence);
    const result = await classifyInbound(input);
    expect(result.category).toBe(category);
    expect(result.confidence).toBe(confidence);
    expect(result.needsManualReview).toBe(false);
    expect(result.model).toBe(CLASSIFY_MODEL);
    expect(result.promptVersion).toBe(CLASSIFY_PROMPT_VERSION);
  });

  it("setzt needsManualReview bei Confidence < 0.7", async () => {
    mockToolUse("rejected", 0.5);
    const result = await classifyInbound(input);
    expect(result.category).toBe("rejected");
    expect(result.needsManualReview).toBe(true);
  });

  it("erzwingt Tool-Use beim Modell-Call", async () => {
    mockToolUse("success", 0.99);
    await classifyInbound(input);
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    const args = messagesCreate.mock.calls[0]?.[0];
    expect(args.model).toBe(CLASSIFY_MODEL);
    expect(args.tool_choice).toEqual({
      type: "tool",
      name: "classify_email",
    });
  });

  it("wirft, wenn keine tool_use-Antwort kommt", async () => {
    messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "kein Tool benutzt" }],
    });
    await expect(classifyInbound(input)).rejects.toThrow(/tool_use/);
  });
});
