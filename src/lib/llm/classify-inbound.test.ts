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
  yasniNoDataHeldBody,
  yasniNoDataHeldFrom,
  yasniNoDataHeldPdfText,
  yasniNoDataHeldSubject,
} from "@/lib/llm/__fixtures__/yasni-no-data-held";
import {
  buildUserContent,
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
    ["no_data_held", 0.92],
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

  it("Yasni-Fixture: Anhang-Text landet markiert im Prompt, Kategorie no_data_held", async () => {
    mockToolUse("no_data_held", 0.9, "Broker haelt keine Daten zur Person");
    const result = await classifyInbound({
      subject: yasniNoDataHeldSubject,
      textBody: yasniNoDataHeldBody,
      fromAddress: yasniNoDataHeldFrom,
      attachments: [{ name: "auskunft.pdf", text: yasniNoDataHeldPdfText }],
    });
    expect(result.category).toBe("no_data_held");
    expect(result.needsManualReview).toBe(false);

    const args = messagesCreate.mock.calls[0]?.[0];
    const content = args.messages[0].content as string;
    expect(content).toContain("[E-Mail-Body]");
    expect(content).toContain(yasniNoDataHeldBody);
    expect(content).toContain("[Anhang 1: auskunft.pdf]");
    expect(content).toContain("keine Suchergebnisse und kein Exposé");
  });

  it("fuehrt nicht extrahierbare Anhaenge mit Name und Note auf", () => {
    const content = buildUserContent({
      ...input,
      attachments: [
        { name: "auskunft.pdf", text: "Inhalt", note: "gekuerzt auf 15000 Zeichen" },
        { name: "scan.png", text: null, note: "nicht extrahierbar (image/png)" },
      ],
    });
    expect(content).toContain("[Anhang 1: auskunft.pdf — gekuerzt auf 15000 Zeichen]");
    expect(content).toContain("Inhalt");
    expect(content).toContain("[Anhang 2: scan.png — nicht extrahierbar (image/png)]");
  });

  it("wirft, wenn keine tool_use-Antwort kommt", async () => {
    messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "kein Tool benutzt" }],
    });
    await expect(classifyInbound(input)).rejects.toThrow(/tool_use/);
  });
});
