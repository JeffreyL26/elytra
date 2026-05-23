# InkogniGO — Projekt-Kontext für Claude Code

## Über das Projekt

InkogniGO ist ein automatisierter Opt-Out-Service für DSGVO-basierte Datenlöschanfragen bei Data-Brokern. Zielmarkt: EU, primär Deutschland.

**Ablauf:**
Kunden registrieren sich auf der Website, geben eine Vertretungs-Vollmacht ab, hinterlegen ihre persönlichen Daten und buchen einen Plan. Das Backend versendet automatisiert Opt-Out-Anfragen an Data-Broker (per E-Mail oder durch Formular-Automation), klassifiziert eingehende Antworten mittels LLM und aktualisiert den Status pro Prozess. Ein internes Admin-UI ("ELYTRA") dient der Überwachung und manuellen Eingriffen.

## Tech Stack (final entschieden)

- **Runtime:** Node.js 20+, **pnpm** als Package Manager
- **Sprache:** TypeScript, strict mode
- **Framework:** Next.js 16 (App Router) — beherbergt sowohl Public-Website als auch ELYTRA hinter Auth. Hinweis: v16 hat Breaking Changes ggü. älteren Versionen; bei Next-spezifischem Code ggf. `node_modules/next/dist/docs/` konsultieren.
- **Datenbank:** PostgreSQL 16 (lokal via Docker Compose)
- **ORM:** Drizzle ORM (TypeScript-native, lightweight, keine extra Engine)
- **ID-Generierung:** cuid2 (URL-safe, kollisionsfest, nicht ratebar)
- **Env-Validierung:** zod + `@t3-oss/env-nextjs`
- **Linter/Formatter:** Biome (ersetzt ESLint + Prettier)

**Später (nicht in Phase 1):**
- Queue: pg-boss (Job-Queue in Postgres, kein Redis nötig)
- Auth: better-auth
- Mail outbound: AWS SES
- Mail inbound: Postmark Inbound Webhooks
- LLM: Claude API (Haiku für Klassifikation)
- Browser-Automation: Playwright
- Billing: Stripe
- Hosting: Hetzner Cloud VPS

## Architektur-Prinzipien

1. **Monolith first.** Eine Codebasis, eine Deploy-Einheit. Modular trennen statt verteilen.
2. **TypeScript überall.** Typen aus `db/schema` werden direkt in Frontend und Worker importiert.
3. **Postgres als Single Source of Truth.** Auch Queue und Worker-State leben in der DB.
4. **Klare Schichten:** `db/` (Schema, Migrations) ← `lib/` (Domain-Logik, pure Funktionen) ← `app/` (Routes, API, UI).
5. **Dummy-Modus first-class.** Broker tragen ein `is_dummy`-Flag. Tests und ELYTRA-Test-Modus arbeiten ausschließlich gegen Dummy-Broker. Kein Outbound an echte Adressen vor expliziter Freigabe.
6. **Eindeutige Prozess-Tokens für Reply-Tracking.** Outbound-Mails tragen einen unverwechselbaren Token im Reply-To-Header (z. B. `reply+<process_token>@inkognigo.de`). Eingehende Antworten werden darüber dem Prozess zugeordnet — kein fragiles Subject-Parsing.
7. **Append-only Event-Log.** Jede relevante Zustandsänderung wird als unveränderliches Event protokolliert. Status-Spalten werden daraus abgeleitet.

## Projektstruktur

```
inkognigo/
├── src/
│   ├── app/                      # Next.js App Router (Phase 1: leer / Smoke-Test-Route)
│   │   └── api/
│   │       └── brokers/
│   │           └── route.ts      # GET /api/brokers (Smoke-Test)
│   ├── db/
│   │   ├── schema/
│   │   │   ├── index.ts          # Re-Exports aller Schemas
│   │   │   ├── users.ts
│   │   │   ├── customer-profiles.ts
│   │   │   ├── brokers.ts
│   │   │   ├── opt-out-processes.ts
│   │   │   └── process-events.ts
│   │   ├── migrations/           # Drizzle-generiert
│   │   ├── client.ts             # DB-Connection + Drizzle-Instance
│   │   └── seed.ts               # Seed-Script (Dummy-Broker)
│   ├── lib/
│   │   ├── env.ts                # zod-validierte env vars
│   │   └── ids.ts                # cuid2-Wrapper
│   └── data/
│       └── dummy-brokers.ts      # Statische Dummy-Broker-Definitionen
├── docker-compose.yml            # nur Postgres
├── drizzle.config.ts
├── biome.json
├── tsconfig.json
├── package.json
├── .env.example
├── .gitignore
├── README.md
└── CLAUDE.md
```

## Konventionen

- **Dateinamen:** kebab-case (`customer-profiles.ts`).
- **TypeScript:** strict, kein `any`, kein non-null-assertion ohne kurzen Kommentar.
- **DB-Spalten:** snake_case. Drizzle mapped via Schema auf camelCase im TS-Code.
- **IDs:** cuid2-Strings (`text("id").primaryKey().$defaultFn(() => createId())`).
- **Imports:** absolute Pfade über `@/*` (siehe `tsconfig.json paths`).
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- **Eine PR/Commit = eine logische Änderung.** Keine Mega-Commits.
- **Tests:** in Phase 1 noch nicht. Ab Phase 2 für Domain-Logik (`lib/`) mit vitest.

## Datenmodell — Phase 1

Vollständig in Phase 1 anzulegen, auch wenn manche Felder erst später befüllt werden.

### `users`
Auth-/Kontodaten. Bewusst minimal — PII liegt in `customer_profiles`.
- `id` cuid2 PK
- `email` text unique not null
- `email_verified_at` timestamp nullable
- `created_at`, `updated_at` timestamps with default `now()`

### `customer_profiles`
Personenbezogene Daten, die im Namen des Kunden an Broker übermittelt werden.
- `id` cuid2 PK
- `user_id` references `users.id` on delete cascade, unique (1:1)
- `first_name`, `last_name` text
- `email_addresses` jsonb — Array von Strings (Kunde kann mehrere haben)
- `phone_numbers` jsonb — Array von Strings
- `postal_addresses` jsonb — Array von Objekten `{ street, postal_code, city, country }`
- `date_of_birth` date nullable
- `created_at`, `updated_at`

> Hinweis: PII-Felder unverschlüsselt in Phase 1. Application-Level-Encryption (pgcrypto oder externer KMS) ist Phase 2+ und wird vor dem ersten echten Kunden eingebaut.

### `brokers`
Portfolio der Data-Broker. Pflege manuell, später ggf. Admin-UI.
- `id` cuid2 PK
- `slug` text unique not null (z. B. `acxiom`, `dummy-broker-1`)
- `name` text not null
- `country` text (ISO 3166-1 alpha-2)
- `website_url` text
- `opt_out_method` enum `'email' | 'form' | 'mixed'`
- `opt_out_email` text nullable
- `opt_out_form_url` text nullable
- `is_dummy` boolean default false
- `is_active` boolean default true
- `notes` text nullable
- `created_at`, `updated_at`

### `opt_out_processes`
Ein Prozess = ein User × ein Broker. Eindeutig pro Kombination.
- `id` cuid2 PK
- `user_id` references `users.id`
- `broker_id` references `brokers.id`
- `process_token` text unique not null — zufällig generiert, für Reply-Tracking (z. B. cuid2 oder nanoid)
- `status` enum `'pending' | 'contacted' | 'in_progress' | 'success' | 'blacklisted' | 'no_response' | 'manual_review' | 'failed'`, default `'pending'`
- `last_contacted_at` timestamp nullable
- `next_action_at` timestamp nullable — für recurring resends
- `created_at`, `updated_at`
- unique index auf (`user_id`, `broker_id`)

### `process_events`
Append-only Event-Log pro Prozess. Quelle der Wahrheit für die Historie.
- `id` cuid2 PK
- `process_id` references `opt_out_processes.id` on delete cascade
- `event_type` enum: `'process_created' | 'mail_sent' | 'mail_received' | 'status_changed' | 'manual_intervention' | 'error'`
- `payload` jsonb — strukturierte Daten je nach Event-Typ
- `created_at` timestamp
- Index auf (`process_id`, `created_at`)

## Aktuelle Phase: Phase 1 — Foundation

**Ziel:** Sauberes Projektgerüst + vollständig migriertes Datenmodell + Seed-Daten + ein laufender Smoke-Test (`GET /api/brokers` liefert die Dummy-Broker).

### Aufgabenliste (in Reihenfolge abarbeiten)

1. **Repo & Tooling**
   - [ ] `pnpm create next-app@latest inkognigo` mit TypeScript, App Router, ohne Tailwind (Phase 5), ohne ESLint (Biome ersetzt das), ohne `src/`-Frage → manuell strukturieren
   - [ ] `biome.json` mit sinnvollen Defaults; `pnpm format` und `pnpm lint` Scripts ergänzen
   - [ ] `tsconfig.json` mit `"@/*": ["./src/*"]` Path-Alias
   - [ ] `.gitignore` und `.env.example` anlegen

2. **Datenbank-Setup**
   - [ ] `docker-compose.yml` mit Postgres 16, exposed Port 5432, named volume
   - [ ] `pnpm add drizzle-orm postgres` und `pnpm add -D drizzle-kit`
   - [ ] `drizzle.config.ts` konfigurieren
   - [ ] `src/db/client.ts` mit Connection + Drizzle-Instance
   - [ ] `src/lib/env.ts` mit zod-Schema für `DATABASE_URL` etc.
   - [ ] `src/lib/ids.ts` mit cuid2-Wrapper

3. **Schema-Implementierung**
   - [ ] `src/db/schema/users.ts`
   - [ ] `src/db/schema/customer-profiles.ts`
   - [ ] `src/db/schema/brokers.ts`
   - [ ] `src/db/schema/opt-out-processes.ts`
   - [ ] `src/db/schema/process-events.ts`
   - [ ] `src/db/schema/index.ts` (Re-Exports)
   - [ ] `pnpm db:generate` ausführen (erzeugt SQL-Migrations)
   - [ ] `pnpm db:migrate` ausführen (auf lokale DB anwenden)

4. **Seed-Daten**
   - [ ] `src/data/dummy-brokers.ts` mit 3 Einträgen (mind. 1 `email`, 1 `form`, 1 `mixed`), alle `is_dummy: true`
   - [ ] `src/db/seed.ts` Script, das die Dummy-Broker idempotent einträgt
   - [ ] `pnpm db:seed` als package.json-Script

5. **Smoke-Test**
   - [ ] `src/app/api/brokers/route.ts` mit `GET`-Handler, der alle Broker zurückgibt
   - [ ] `pnpm dev` starten, `curl http://localhost:3000/api/brokers` → JSON mit Dummies
   - [ ] Ergebnis manuell verifizieren

6. **Doku**
   - [ ] `README.md` mit Setup-Anleitung (Voraussetzungen, `pnpm install`, `pnpm db:up`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`)

### Was Phase 1 NICHT enthält
Auth, Anmeldung, UI-Seiten, Worker, Mail, LLM, Browser-Automation, Stripe, Landing Page, ELYTRA, Verschlüsselung. Disziplin: nicht abgleiten.

## Häufige Commands

```bash
# Setup
pnpm install

# Datenbank
pnpm db:up                       # docker compose up -d postgres
pnpm db:down                     # docker compose down
pnpm db:generate                 # drizzle-kit generate
pnpm db:migrate                  # drizzle-kit migrate
pnpm db:seed                     # tsx src/db/seed.ts
pnpm db:studio                   # drizzle-kit studio (GUI auf localhost:4983)

# Dev
pnpm dev                         # next dev

# Quality
pnpm typecheck                   # tsc --noEmit
pnpm lint                        # biome check
pnpm format                      # biome format --write
```

## Wichtige Design-Entscheidungen — Why

- **Drizzle statt Prisma:** Kein separater Engine-Prozess, kein zweiter Build-Step, deutlich schnellere Cold-Starts, native TypeScript-Typen ohne Generation. Bei der Solo-Entwicklung mit Claude Code spart das spürbar Zeit.
- **cuid2 statt uuid v4 oder serial:** URL-safe (keine Bindestriche), kollisionsfest, nicht ratebar (wichtig für `process_token`), kürzer als uuid.
- **JSONB für Mehrfach-PII (Mails/Adressen/Telefone):** Pro Kunde realistisch 2–3 Mails, 1–2 Adressen. Eigene Tabellen wären Overkill und machen Reads aufwendiger. Wenn später spezifische Queries gebraucht werden ("alle Kunden in PLZ-Bereich X"), refactorn — bis dahin nicht.
- **`process_token` für Reply-Tracking:** Subject-basiertes Tracking ist fragil (Broker kürzen/ändern Subjects, weiterleiten verliert Header). Plus-Tagging im Reply-To (`reply+TOKEN@domain`) wird auch nach Forwards meist erhalten. Robust und unsichtbar für den Empfänger.
- **Append-only `process_events`:** Volle Historie für ELYTRA-Timeline, einfacheres Debugging, Audit-fähig. Status auf der Prozess-Tabelle ist Denormalisierung für Performance, kann aus Events rekonstruiert werden.
- **Biome statt ESLint+Prettier:** Ein Tool, eine Config, ~10x schneller, deckt für unseren Stack alles ab.

## Was Claude bei der Arbeit beachten soll

- **Frage nach, wenn etwas unklar ist.** Lieber eine Klärungsfrage als eine versteckte Annahme.
- **Keine neuen Libraries ohne Rücksprache.** Stack ist bewusst kompakt gehalten.
- **Halte dich an Phase 1.** Wenn Drang aufkommt, "schnell mal Auth einzubauen" — nicht. Erst Foundation steht, dann nächste Phase.
- **Selbsterklärender Code > Kommentare.** Kommentare nur für "Warum", nicht "Was".
- **Inkrementell committen.** Eine Aufgabe = ein Commit.
- **Drizzle-Schema-Änderungen immer mit `db:generate` + `db:migrate` festschreiben.** Niemals direkt am SQL pfuschen.
