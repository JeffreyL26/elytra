import type { brokers } from "@/db/schema";

type NewBroker = typeof brokers.$inferInsert;

// Alle Eintraege sind is_dummy: true und nutzen reservierte .example-Domains,
// damit Tests und der ELYTRA-Test-Modus niemals echte Adressen kontaktieren.
export const dummyBrokers: NewBroker[] = [
  {
    slug: "dummy-broker-email",
    name: "Dummy Broker (E-Mail)",
    country: "DE",
    websiteUrl: "https://dummy-broker-email.example",
    optOutMethod: "email",
    optOutEmail: "optout@dummy-broker-email.example",
    language: "de",
    responsivenessTier: "unknown",
    requiresAuthorizationAttachment: false,
    isDummy: true,
    notes: "Test-Broker fuer den reinen E-Mail-Opt-Out-Flow.",
  },
  {
    slug: "dummy-broker-form",
    name: "Dummy Broker (Formular)",
    country: "DE",
    websiteUrl: "https://dummy-broker-form.example",
    optOutMethod: "form",
    optOutFormUrl: "https://dummy-broker-form.example/opt-out",
    language: "de",
    responsivenessTier: "unknown",
    requiresAuthorizationAttachment: false,
    isDummy: true,
    notes: "Test-Broker fuer den Formular-Opt-Out-Flow.",
  },
  {
    slug: "dummy-broker-mixed",
    name: "Dummy Broker (Gemischt)",
    country: "DE",
    websiteUrl: "https://dummy-broker-mixed.example",
    optOutMethod: "mixed",
    optOutEmail: "optout@dummy-broker-mixed.example",
    optOutFormUrl: "https://dummy-broker-mixed.example/opt-out",
    language: "de",
    responsivenessTier: "unknown",
    requiresAuthorizationAttachment: false,
    isDummy: true,
    notes: "Test-Broker fuer den gemischten Opt-Out-Flow (E-Mail + Formular).",
  },
];
