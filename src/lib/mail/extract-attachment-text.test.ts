import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import {
  extractAttachmentTexts,
  MAX_ATTACHMENT_TEXT_CHARS,
} from "@/lib/mail/extract-attachment-text";

// Test-PDFs werden zur Laufzeit mit pdf-lib erzeugt -- kein Binary im Repo.
async function makePdfBase64(lines: string[]): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage();
  let y = page.getHeight() - 40;
  for (const line of lines) {
    if (y < 40) {
      page = doc.addPage();
      y = page.getHeight() - 40;
    }
    page.drawText(line, { x: 40, y, size: 10, font });
    y -= 14;
  }
  return doc.saveAsBase64();
}

function payloadWith(
  attachments: Array<{ Name: string; ContentType: string; Content: string }>,
): Record<string, unknown> {
  return {
    MessageID: "test-extract",
    Attachments: attachments.map((a) => ({ ...a, ContentLength: a.Content.length })),
  };
}

let smallPdfBase64: string;

beforeAll(async () => {
  smallPdfBase64 = await makePdfBase64([
    "Auskunft gemaess Art. 15 DSGVO",
    "Zu der betroffenen Person liegen keine Suchergebnisse vor.",
  ]);
});

describe("extractAttachmentTexts", () => {
  it("extrahiert Text aus einem PDF-Anhang", async () => {
    const result = await extractAttachmentTexts(
      payloadWith([
        { Name: "auskunft.pdf", ContentType: "application/pdf", Content: smallPdfBase64 },
      ]),
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("auskunft.pdf");
    expect(result[0].text).toContain("keine Suchergebnisse");
    expect(result[0].note).toBeUndefined();
  });

  it("akzeptiert ContentType mit Parametern", async () => {
    const result = await extractAttachmentTexts(
      payloadWith([
        {
          Name: "auskunft.pdf",
          ContentType: 'application/PDF; name="auskunft.pdf"',
          Content: smallPdfBase64,
        },
      ]),
    );
    expect(result[0].text).toContain("Auskunft");
  });

  it("markiert Nicht-PDF-Anhaenge als nicht extrahierbar", async () => {
    const result = await extractAttachmentTexts(
      payloadWith([
        { Name: "logo.png", ContentType: "image/png", Content: "aWNoIGJpbiBrZWluIFBERg==" },
      ]),
    );
    expect(result).toEqual([
      { name: "logo.png", text: null, note: "nicht extrahierbar (image/png)" },
    ]);
  });

  it("markiert kaputte PDF-Daten als Extraktion fehlgeschlagen", async () => {
    const result = await extractAttachmentTexts(
      payloadWith([
        {
          Name: "kaputt.pdf",
          ContentType: "application/pdf",
          Content: Buffer.from("das ist kein pdf").toString("base64"),
        },
      ]),
    );
    expect(result).toEqual([{ name: "kaputt.pdf", text: null, note: "Extraktion fehlgeschlagen" }]);
  });

  it("kappt langen Text und vermerkt die Kuerzung", async () => {
    // ~80 Zeichen pro Zeile x 250 Zeilen > 15.000 Zeichen extrahierter Text.
    const line = "Lorem ipsum dolor sit amet consectetur adipisci elit sed diam nonumy eirmod XY";
    const bigPdf = await makePdfBase64(Array.from({ length: 250 }, () => line));

    const result = await extractAttachmentTexts(
      payloadWith([{ Name: "gross.pdf", ContentType: "application/pdf", Content: bigPdf }]),
    );
    expect(result[0].text).toHaveLength(MAX_ATTACHMENT_TEXT_CHARS);
    expect(result[0].note).toBe(`gekuerzt auf ${MAX_ATTACHMENT_TEXT_CHARS} Zeichen`);
  });

  it("verarbeitet mehrere Anhaenge unabhaengig voneinander", async () => {
    const result = await extractAttachmentTexts(
      payloadWith([
        { Name: "auskunft.pdf", ContentType: "application/pdf", Content: smallPdfBase64 },
        { Name: "scan.png", ContentType: "image/png", Content: "eA==" },
      ]),
    );
    expect(result.map((r) => r.text !== null)).toEqual([true, false]);
  });

  it("liefert leeres Array ohne Attachments-Feld oder bei null", async () => {
    expect(await extractAttachmentTexts({ MessageID: "x" })).toEqual([]);
    expect(await extractAttachmentTexts(null)).toEqual([]);
  });
});
