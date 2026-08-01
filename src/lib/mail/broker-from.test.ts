import { describe, expect, it } from "vitest";
import { SERVICE_NAME } from "@/lib/branding";
import {
  buildBrokerEnvelope,
  resolveBrokerFromMode,
  SERVICE_DISPLAY_NAME,
} from "@/lib/mail/broker-from";

const TOKEN = "test1234abcd5678";
const REPLY_DOMAIN = "reply.jba-team.com";
const SELF_FROM = "jeffrey@jba-team.com";
const SELF_NAME = "Jeffrey Lehmann";
const TOKEN_ADDRESS = `proc-${TOKEN}@${REPLY_DOMAIN}`;

const base = {
  processToken: TOKEN,
  replyDomain: REPLY_DOMAIN,
  selfModeFrom: SELF_FROM,
  isSelfRequest: true,
  selfDisplayName: SELF_NAME,
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
    expect(envelope.fromHeader).toBe(`${SELF_NAME} <${TOKEN_ADDRESS}>`);
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

// Der Absender folgt derselben Logik wie der Mailtext: Ich-Form -> Mensch,
// Vertretung -> Dienst. Faellt das auseinander, sieht ein Ich-Form-Schreiben
// nach aussen aus wie ein Dritter, der fuer eine Person handelt -- und nimmt
// damit die noch offene RDG-Frage (Gate G1) vorweg.
describe("buildBrokerEnvelope — Display-Name folgt isSelfRequest", () => {
  it("Self-Request: Klarname der betroffenen Person, NICHT die Marke", () => {
    const envelope = buildBrokerEnvelope({ ...base, mode: "tokenized", isSelfRequest: true });
    expect(envelope.fromHeader).toBe(`${SELF_NAME} <${TOKEN_ADDRESS}>`);
    expect(envelope.fromHeader).not.toContain(SERVICE_NAME);
  });

  it("Vertretung (hinter G1): Dienst-Name als Absender", () => {
    const envelope = buildBrokerEnvelope({ ...base, mode: "tokenized", isSelfRequest: false });
    expect(envelope.fromHeader).toBe(`${SERVICE_DISPLAY_NAME} <${TOKEN_ADDRESS}>`);
    expect(envelope.fromHeader).toContain(SERVICE_NAME);
    expect(envelope.fromHeader).not.toContain(SELF_NAME);
  });

  // Lieber gar kein Name als der falsche: der Markenname wuerde die Ich-Form
  // des Textes konterkarieren.
  it.each([
    [undefined],
    [null],
    [""],
    ["   "],
  ])("Self-Request ohne SELF_NAME (%s): nackte Adresse, kein Marken-Fallback", (name) => {
    const envelope = buildBrokerEnvelope({
      ...base,
      mode: "tokenized",
      isSelfRequest: true,
      selfDisplayName: name as string | null | undefined,
    });
    expect(envelope.fromHeader).toBe(TOKEN_ADDRESS);
    expect(envelope.fromHeader).not.toContain(SERVICE_NAME);
  });

  it("im self-Modus ist der Display-Name irrelevant (From bleibt die Self-Adresse)", () => {
    for (const isSelfRequest of [true, false]) {
      const envelope = buildBrokerEnvelope({ ...base, mode: "self", isSelfRequest });
      expect(envelope.fromHeader).toBe(SELF_FROM);
    }
  });
});
