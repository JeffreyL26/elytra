import { describe, expect, it } from "vitest";
import { SERVICE_NAME } from "@/lib/branding";
import {
  buildBrokerEnvelope,
  resolveBrokerFromMode,
  TOKENIZED_DISPLAY_NAME,
} from "@/lib/mail/broker-from";

const TOKEN = "test1234abcd5678";
const REPLY_DOMAIN = "reply.jba-team.com";
const SELF_FROM = "jeffrey@jba-team.com";
const TOKEN_ADDRESS = `proc-${TOKEN}@${REPLY_DOMAIN}`;

const base = {
  processToken: TOKEN,
  replyDomain: REPLY_DOMAIN,
  selfModeFrom: SELF_FROM,
};

describe("resolveBrokerFromMode", () => {
  it("erkennt 'tokenized'", () => {
    expect(resolveBrokerFromMode("tokenized")).toBe("tokenized");
  });

  // Ein Tippfehler in der .env darf NIE dazu fuehren, dass ueber eine
  // (moeglicherweise unverifizierte) Domain gesendet wird.
  it.each([
    ["self"],
    ["Tokenized"],
    ["tokenised"],
    [""],
    [undefined],
    [null],
  ])("faellt bei %s auf 'self' zurueck", (raw) => {
    expect(resolveBrokerFromMode(raw as string | undefined | null)).toBe("self");
  });
});

describe("buildBrokerEnvelope — self-Modus (Default, aktuelles Verhalten)", () => {
  const envelope = buildBrokerEnvelope({ ...base, mode: "self" });

  it("From ist die Self-Adresse, unveraendert", () => {
    expect(envelope.fromHeader).toBe(SELF_FROM);
    expect(envelope.fromAddress).toBe(SELF_FROM);
  });

  it("Reply-To traegt den Token", () => {
    expect(envelope.replyTo).toBe(TOKEN_ADDRESS);
  });
});

describe("buildBrokerEnvelope — tokenized-Modus", () => {
  const envelope = buildBrokerEnvelope({ ...base, mode: "tokenized" });

  it("From traegt den Token samt sprechendem Display-Name", () => {
    expect(envelope.fromHeader).toBe(`${TOKENIZED_DISPLAY_NAME} <${TOKEN_ADDRESS}>`);
    expect(envelope.fromHeader).toContain(SERVICE_NAME);
  });

  it("liefert die reine Adresse getrennt vom Header-Wert", () => {
    expect(envelope.fromAddress).toBe(TOKEN_ADDRESS);
    expect(envelope.fromAddress).not.toContain("<");
  });

  // Der Kern des Fixes: die Adresse, an die Broker antworten (From), ist
  // dieselbe, die Stufe-1-Matching erkennt.
  it("die From-Adresse ist tokenisiert und damit inbound-matchbar", () => {
    expect(envelope.fromAddress).toMatch(/^proc-[a-z0-9]{16}@/);
  });

  it("setzt KEIN Reply-To (waere redundant zur From-Adresse)", () => {
    expect(envelope.replyTo).toBeNull();
  });

  it("verwendet NICHT die Self-Adresse als From", () => {
    expect(envelope.fromHeader).not.toContain(SELF_FROM);
  });
});
