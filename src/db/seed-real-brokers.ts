import { eq } from "drizzle-orm";
import { db, sql } from "@/db/client";
import { brokers } from "@/db/schema";

type NewBroker = typeof brokers.$inferInsert;

// Gemeinsame Defaults aller realen Broker. opt_out_method ist fuer ALLE
// 'email' -- auch die als "mixed" kategorisierten sind technisch per Mail
// erreichbar (Form nur bevorzugt). responsiveness_tier startet 'unknown' und
// wird spaeter vom Worker gepflegt.
const COMMON = {
  optOutMethod: "email",
  isDummy: false,
  responsivenessTier: "unknown",
  requiresAuthorizationAttachment: false,
} as const satisfies Partial<NewBroker>;

// 25 reale Data-Broker: 3 aktiv (erster E2E-Test), 22 inaktiv vorgeseedet.
// Inaktiv gegliedert: 8 E-Mail-Kanal, 7 Mixed (Form bevorzugt, E-Mail als
// Fallback), 4 Tier 1 (E-Mail-Kanal oeffentlich dokumentiert, hohe Konfidenz),
// 3 Tier 2 (Kontaktpunkt verifiziert, Verifikation potenziell an die
// Betroffenen-Adresse gebunden -- Fall-B-Test-Kandidaten).
const realBrokers: NewBroker[] = [
  // --- Aktiv fuer ersten E2E-Test (is_active: true) ---
  {
    ...COMMON,
    slug: "yasni",
    name: "Yasni GmbH",
    country: "DE",
    websiteUrl: "https://www.yasni.de",
    optOutEmail: "datenschutz@yasni.de",
    language: "de",
    isActive: true,
  },
  {
    ...COMMON,
    slug: "sharethis",
    name: "ShareThis, Inc.",
    country: "US",
    websiteUrl: "https://sharethis.com",
    optOutEmail: "privacy@sharethis.com",
    language: "en",
    isActive: true,
  },
  {
    ...COMMON,
    slug: "snov-io",
    name: "Snovio OU",
    country: "EE",
    websiteUrl: "https://snov.io",
    optOutEmail: "snovio_dpo@snov.io",
    language: "en",
    isActive: true,
  },

  // --- Inaktiv vorgeseedet, Email-Kategorie (is_active: false) ---
  {
    ...COMMON,
    slug: "definitive-healthcare",
    name: "Definitive Healthcare, LLC",
    country: "US",
    websiteUrl: "https://www.definitivehc.com",
    optOutEmail: "privacy@definitivehc.com",
    language: "en",
    isActive: false,
  },
  {
    ...COMMON,
    slug: "terminus",
    name: "Terminus Software, Inc.",
    country: "US",
    websiteUrl: "https://terminus.com",
    optOutEmail: "privacy@terminus.com",
    language: "en",
    isActive: false,
  },
  {
    ...COMMON,
    slug: "winr-data",
    name: "WINR Data",
    country: "US",
    websiteUrl: "https://www.winrdata.com",
    optOutEmail: "privacy@winrdata.com",
    language: "en",
    isActive: false,
  },
  {
    ...COMMON,
    slug: "affinity-answers",
    name: "Affinity Answers Corporation",
    country: "US",
    websiteUrl: "https://www.affinityanswers.com",
    optOutEmail: "dataprivacy@affinityanswers.com",
    language: "en",
    isActive: false,
  },
  {
    ...COMMON,
    slug: "apollo-io",
    name: "Apollo.io (ZenLeads, Inc.)",
    country: "US",
    websiteUrl: "https://www.apollo.io",
    optOutEmail: "apollo@lionheartsquared.eu",
    language: "en",
    isActive: false,
  },
  {
    ...COMMON,
    slug: "demyst",
    name: "Demyst Data, Ltd",
    country: "US",
    websiteUrl: "https://demyst.com",
    optOutEmail: "privacy@demystdata.com",
    language: "en",
    isActive: false,
  },
  {
    ...COMMON,
    slug: "findem",
    name: "Findem, Inc.",
    country: "US",
    websiteUrl: "https://www.findem.ai",
    optOutEmail: "privacy@findem.ai",
    language: "en",
    isActive: false,
  },
  {
    ...COMMON,
    slug: "pipl",
    name: "Pipl, Inc.",
    country: "US",
    websiteUrl: "https://pipl.com",
    optOutEmail: "privacy@pipl.com",
    language: "en",
    isActive: false,
  },

  // --- Inaktiv vorgeseedet, Mixed-Kategorie (E-Mail funktioniert, Form bevorzugt) ---
  {
    ...COMMON,
    slug: "ekata",
    name: "Ekata, Inc. (Mastercard)",
    country: "US",
    websiteUrl: "https://ekata.com",
    optOutEmail: "ekataprivacyanddataprotection@mastercard.com",
    language: "en",
    isActive: false,
    notes: "Mixed: My Data Portal als bevorzugter Weg, E-Mail funktioniert",
  },
  {
    ...COMMON,
    slug: "crunchbase",
    name: "Crunchbase, Inc.",
    country: "US",
    websiteUrl: "https://www.crunchbase.com",
    optOutEmail: "privacy@crunchbase.com",
    language: "en",
    isActive: false,
    notes: "Mixed: Privacy Request Form als Alternative",
  },
  {
    ...COMMON,
    slug: "maxmind",
    name: "MaxMind, Inc.",
    country: "US",
    websiteUrl: "https://www.maxmind.com",
    optOutEmail: "privacy@maxmind.com",
    language: "en",
    isActive: false,
    notes: "Mixed: Web-Form primärer Weg laut Privacy Policy",
  },
  {
    ...COMMON,
    slug: "clay",
    name: "Clay Software, Inc.",
    country: "US",
    websiteUrl: "https://www.clay.com",
    optOutEmail: "privacy@clay.com",
    language: "en",
    isActive: false,
    notes: "Mixed: Privacy Request Form als Alternative",
  },
  {
    ...COMMON,
    slug: "id5",
    name: "ID5 Technology",
    country: "US",
    websiteUrl: "https://id5.io",
    optOutEmail: "privacy@id5.io",
    language: "en",
    isActive: false,
    notes: "Mixed: Preference Center / GPC primärer Weg, E-Mail für Appeals",
  },
  {
    ...COMMON,
    slug: "m1-data",
    name: "M1 Data & Analytics",
    country: "US",
    websiteUrl: "https://m1-data.com",
    optOutEmail: "service@m1-data.com",
    language: "en",
    isActive: false,
    notes: "Mixed: Web-Formulare primärer Weg",
  },
  {
    ...COMMON,
    slug: "sheerid",
    name: "SheerID, Inc.",
    country: "US",
    websiteUrl: "https://www.sheerid.com",
    optOutEmail: "privacy@sheerid.com",
    language: "en",
    isActive: false,
    notes: "Mixed: DPO Greg Damon, Mail-Adresse auf Website verschleiert",
  },

  // --- Tier 1: E-Mail-Kanal öffentlich dokumentiert, hohe Konfidenz ---
  {
    ...COMMON,
    slug: "dealfront",
    name: "Dealfront Group GmbH",
    country: "DE",
    websiteUrl: "https://www.dealfront.com",
    optOutEmail: "privacy@dealfront.com",
    language: "de",
    isActive: false,
    notes:
      "E-Mail-Kanal explizit dokumentiert, 30-Tage-Antwortzusage; Konzern-DPO dpo@dealfront.com; DE/FI-Gruppe, betreibt eigenen Crawler (haelt Daten ueber DE-Personen)",
  },
  {
    ...COMMON,
    slug: "cognism",
    name: "Cognism Ltd",
    country: "GB",
    websiteUrl: "https://www.cognism.com",
    optOutEmail: "compliance@cognism.com",
    language: "en",
    isActive: false,
    notes:
      "Mixed: Opt-out-Form (cognism.com/data-opt-out) parallel; DPO compliance@cognism.com; UK-GDPR (Aufsicht ICO), nicht EU-DSGVO",
  },
  {
    ...COMMON,
    slug: "lusha",
    name: "Lusha Systems Ltd",
    country: "IL",
    websiteUrl: "https://www.lusha.com",
    optOutEmail: "privacy@lusha.com",
    language: "en",
    isActive: false,
    notes:
      "Mixed: Privacy Team fuehrt Loeschung per E-Mail durch; Formular-Weg (OneTrust) mit Verifikation an Betroffenen-Adresse; Joint Controller US/IL",
  },
  {
    ...COMMON,
    slug: "revoptimal",
    name: "RevOptimal, LLC",
    country: "US",
    websiteUrl: "https://revoptimal.com",
    optOutEmail: "privacy@revoptimal.com",
    language: "en",
    isActive: false,
    notes: "DSAR-Form parallel; EU-Vertreter (Art. 27): Superset, revoptimal.com@supersetreps.com",
  },

  // --- Tier 2: Kontaktpunkt verifiziert, aber Verifikation potenziell an die
  // geharvestete Betroffenen-Adresse gebunden (Fall B, Formular-bevorzugt).
  // Bewusst inaktive Test-Kandidaten: spaeter pruefen, ob der Bevollmaechtigten-
  // E-Mail-Weg akzeptiert wird oder Bestaetigung im Kundenpostfach erzwungen wird. ---
  {
    ...COMMON,
    slug: "liveintent",
    name: "LiveIntent, Inc.",
    country: "US",
    websiteUrl: "https://www.liveintent.com",
    optOutEmail: "privacy@liveintent.com",
    language: "en",
    isActive: false,
    notes:
      "Fall B: Verifikations-Link geht laut Policy an die hinterlegte Betroffenen-Adresse; Primaerweg Privacy-Portal, E-Mail fuer Appeals. Test-Kandidat: Bevollmaechtigten-Weg pruefen",
  },
  {
    ...COMMON,
    slug: "uplead",
    name: "UpLead LLC",
    country: "US",
    websiteUrl: "https://www.uplead.com",
    optOutEmail: "privacy@uplead.com",
    language: "en",
    isActive: false,
    notes:
      "Fall B: GDPR-Requests via EU-Vertreter EDPO (Formular); Opt-out verlangt Ownership-Bestaetigung per Mail/SMS an Betroffenen-Adresse. Test-Kandidat",
  },
  {
    ...COMMON,
    slug: "rocketreach",
    name: "RocketReach LLC",
    country: "US",
    websiteUrl: "https://rocketreach.co",
    optOutEmail: "privacy@rocketreach.co",
    language: "en",
    isActive: false,
    notes:
      "Fall B + schwacher EU-Nexus: kein Art.-27-Vertreter, LU-DPA konnte Beschwerde mangels EU-Praesenz nicht durchsetzen (noyb-kritisiert); Verifikations-Mail nur bei Profil-Match. Guter Test-Kandidat fuer Phase-3c-Eskalationslogik",
  },
];

// Idempotent: pro Broker auf slug pruefen, dann update statt insert.
// responsiveness_tier und last_response_at sind worker-verwaltete
// Laufzeitfelder -- beim Update bewusst NICHT ueberschrieben, damit ein
// Re-Seed keinen real beobachteten Antwort-Status zuruecksetzt.
async function seedRealBrokers() {
  let insertedCount = 0;
  let updatedCount = 0;

  for (const broker of realBrokers) {
    const existing = await db
      .select({ id: brokers.id })
      .from(brokers)
      .where(eq(brokers.slug, broker.slug))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(brokers)
        .set({
          name: broker.name,
          country: broker.country,
          websiteUrl: broker.websiteUrl,
          optOutMethod: broker.optOutMethod,
          optOutEmail: broker.optOutEmail,
          optOutFormUrl: broker.optOutFormUrl ?? null,
          language: broker.language,
          requiresAuthorizationAttachment: broker.requiresAuthorizationAttachment,
          isDummy: broker.isDummy,
          isActive: broker.isActive,
          notes: broker.notes ?? null,
          updatedAt: new Date(),
        })
        .where(eq(brokers.slug, broker.slug));
      updatedCount++;
      console.log(`  ~ ${broker.slug} (aktualisiert)`);
    } else {
      await db.insert(brokers).values(broker);
      insertedCount++;
      console.log(`  + ${broker.slug} (neu)`);
    }
  }

  console.log(
    `Real-Broker-Seed abgeschlossen: ${insertedCount} neu, ${updatedCount} aktualisiert, ${realBrokers.length} gesamt.`,
  );
}

seedRealBrokers()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error("Real-Broker-Seed fehlgeschlagen:", error);
    await sql.end();
    process.exit(1);
  });
