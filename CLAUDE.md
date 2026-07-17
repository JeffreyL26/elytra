# GoKognito — Projekt-Kontext für Claude Code

## Über das Projekt

GoKognito ist ein automatisierter Opt-Out-Service für DSGVO-basierte Datenlöschanfragen bei Data-Brokern. Zielmarkt: EU, primär Deutschland.

**Ablauf:**
Kunden registrieren sich auf der Website, geben eine Vertretungs-Vollmacht ab, hinterlegen ihre persönlichen Daten und buchen einen Plan. Das Backend versendet automatisiert Opt-Out-Anfragen an Data-Broker (per E-Mail oder durch Formular-Automation), klassifiziert eingehende Antworten mittels LLM und aktualisiert den Status pro Prozess. Ein internes Admin-UI ("ELYTRA") dient der Überwachung und manuellen Eingriffen.

## Tech Stack

**Foundation (Phase 1, im Repo):**
- **Runtime:** Node.js 20+, **pnpm** als Package Manager
- **Sprache:** TypeScript, strict mode
- **Framework:** Next.js 16 (App Router, Turbopack stable) — beherbergt Public-Website + ELYTRA hinter Auth
- **Datenbank:** PostgreSQL 16 (lokal via Docker Compose)
- **ORM:** Drizzle ORM
- **ID-Generierung:** cuid2 (URL-safe, kollisionsfest, nicht ratebar)
- **Env-Validierung:** zod + `@t3-oss/env-nextjs`
- **Linter/Formatter:** Biome

**Phase 2 (Mail-Pipeline, Worker, LLM — wird in Phase 2 hinzugefügt):**
- **Queue:** pg-boss (Job-Queue in Postgres, kein Redis nötig)
- **Worker-Runtime:** eigener Node-Prozess (`pnpm worker`), separat vom Web-Server
- **Mail outbound:** Postmark Transactional API (Phase-3b-Wechsel; siehe Update unten)
- **Mail inbound:** Postmark Inbound Webhooks auf Wildcard-Subdomain
- **LLM:** Anthropic Claude API (`claude-haiku-4-5-20251001` für Klassifikation)
- **Mail-Templates:** TypeScript-Funktionen in `src/lib/mail/templates/`

**Spätere Phasen (Phase 3+):**
- Auth: better-auth
- Browser-Automation: Playwright (Phase 3)
- Billing: Stripe (Phase 6)
- Hosting: Hetzner Cloud VPS (Production-Deploy in Phase 7)

## Architektur-Prinzipien

1. **Monolith first.** Eine Codebasis, eine Deploy-Einheit. Modular trennen statt verteilen.
2. **TypeScript überall.** Typen aus `db/schema` werden direkt in Frontend und Worker importiert.
3. **Postgres als Single Source of Truth.** Auch Queue (pg-boss) und Worker-State leben in der DB.
4. **Klare Schichten:** `db/` (Schema, Migrations) ← `lib/` (Domain-Logik, pure Funktionen) ← `app/` (Routes, API, UI) / `worker/` (Job-Runner).
5. **Web und Worker als getrennte Prozesse.** Next.js (Web) und Worker (`src/worker/`) sind eigenständige Node-Prozesse, die sich nur DB und Library-Code teilen. Browser-Automation, LLM-Calls und Long-Running-Jobs blockieren so nie den Web-Server.
6. **Dummy-Modus first-class.** Broker tragen ein `is_dummy`-Flag. Tests und ELYTRA-Test-Modus arbeiten ausschließlich gegen Dummy-Broker. Kein Outbound an echte Adressen vor expliziter Freigabe.
7. **Eindeutige Prozess-Tokens für Reply-Tracking.** Outbound-Mails tragen einen 16-Zeichen-cuid2-Token in einer Wildcard-Subdomain-Adresse (`proc-<TOKEN>@reply.jba-team.com`). Antworten werden über vier-stufiges Matching zugeordnet (siehe Phase-2-Block).
8. **Append-only Event-Log.** Jede relevante Zustandsänderung wird als unveränderliches `process_event` protokolliert. Status-Spalten sind Denormalisierung für Performance — können aus Events rekonstruiert werden.
9. **LLM-Klassifikation mit Audit-Trail.** Jede LLM-Klassifikation wird vollständig geloggt (Mail-Inhalt, Modell-Version, Prompt-Version, Output, Confidence). Bei Confidence < 0.7 wird der Prozess auf `manual_review` gesetzt.
10. **Domain-Referenzen niemals hartcodiert.** Alle Mail-Domains, From-Adressen, Reply-Subdomains, Webhook-URLs leben in `.env`-Variablen — damit ein Rebrand (Domain-Wechsel) kostenlos bleibt.

## Projektstruktur

Unit-/Integrationstests liegen als `*.test.ts` neben dem jeweiligen Code und
sind im Baum ausgelassen. Generierte Drizzle-Migrations (`src/db/migrations/`)
ebenso. Stand verifiziert gegen `git ls-files`.

```
gokognito/
├── src/
│   ├── app/                                  # Next.js App Router (Web-Prozess)
│   │   ├── (marketing)/                      # Öffentliche Website (Route-Segment)
│   │   │   ├── _components/                   # Client Components, segment-privat
│   │   │   │   ├── akte-reveal.tsx
│   │   │   │   ├── billing-toggle.tsx
│   │   │   │   ├── faq.tsx
│   │   │   │   ├── hero-scene.tsx
│   │   │   │   ├── nav.tsx
│   │   │   │   ├── runtime.ts
│   │   │   │   ├── scroll-choreography.tsx
│   │   │   │   └── wordmark.tsx
│   │   │   ├── _content/
│   │   │   │   └── placeholders.ts            # Landing-Copy-Platzhalter
│   │   │   ├── layout.tsx                     # Marketing-Layout (Fonts, .site-Wrapper)
│   │   │   ├── marketing.css
│   │   │   └── page.tsx                       # Landing Page
│   │   ├── api/
│   │   │   ├── brokers/route.ts               # GET /api/brokers (Smoke-Test)
│   │   │   └── webhooks/
│   │   │       └── postmark-inbound/route.ts  # Postmark Inbound-Webhook
│   │   ├── icon.svg
│   │   └── layout.tsx                         # Root-Layout
│   ├── db/
│   │   ├── schema/                            # index re-exportiert alle Tabellen
│   │   │   ├── users.ts
│   │   │   ├── customer-profiles.ts
│   │   │   ├── brokers.ts
│   │   │   ├── opt-out-processes.ts
│   │   │   ├── process-events.ts
│   │   │   └── process-mails.ts
│   │   ├── migrations/                        # Drizzle-generiert
│   │   ├── client.ts                          # exports { sql, db }
│   │   ├── real-brokers-data.ts               # Reale Broker-Stammdaten (46, DB-frei testbar)
│   │   ├── seed.ts                            # Dummy-Broker-Seed
│   │   ├── seed-real-brokers.ts               # Real-Broker-Seed (idempotent, slug-Upsert ohne Delete)
│   │   ├── seed-self-profile.ts               # Self-Profil aus SELF_*-Env
│   │   ├── seed-loopback-broker.ts            # Loopback-Test-Broker
│   │   └── self-profile-env.ts                # readSelfProfileEnv()
│   ├── lib/
│   │   ├── env.ts                             # zod-validierte env vars
│   │   ├── ids.ts                             # cuid2 (createId + createProcessToken)
│   │   ├── branding.ts                        # SERVICE_NAME
│   │   ├── user-data-access.ts                # Mandantengetrennter Daten-Zugriffslayer (*ForUser)
│   │   ├── customer-profile-schema.ts         # Geteiltes Zod-Profil-Schema (API + Seed)
│   │   ├── customer-status.ts                 # Kundensicht-Projektion aus process_status
│   │   ├── status-transitions.ts              # Transitions-Matrix (schützt Terminal-Status)
│   │   ├── attention-processes.ts             # Triage-Query (manual_review u. ä.)
│   │   ├── retention-raw-payload.ts           # PII-Compaction nach Retention-Fenster
│   │   ├── mail/
│   │   │   ├── send.ts                        # Postmark-Wrapper (Dummy-Modus first)
│   │   │   ├── parse-inbound.ts               # Postmark-Payload normalisieren
│   │   │   ├── match-inbound.ts               # Vier-stufiges Reply-Matching
│   │   │   ├── extract-attachment-text.ts     # PDF-Textextraktion (pdf-parse)
│   │   │   └── templates/
│   │   │       └── opt-out-request.ts         # DSGVO-Mail-Template (DE/EN)
│   │   └── llm/
│   │       ├── classify-inbound.ts            # LLM-Klassifikation (Claude Tool-Use)
│   │       └── __fixtures__/                  # Reale Broker-Antworten als Test-Fixtures
│   ├── worker/                                # Worker-Prozess (pnpm worker)
│   │   ├── index.ts                           # Entry-Point + Queue-Registrierung
│   │   ├── queue.ts                           # pg-boss-Instanz (Worker)
│   │   ├── producer.ts                        # send-only enqueue (Web-Prozess)
│   │   ├── preflight.ts                       # Versand-Preflight-Checks
│   │   └── jobs/
│   │       ├── send-opt-out-mail.ts
│   │       └── process-inbound-mail.ts
│   ├── scripts/
│   │   ├── e2e-smoke.ts                       # End-to-End-Smoke (pnpm e2e)
│   │   ├── trigger-real-send.ts               # Realer Versand (Dry-Run-Default, JA-Bestätigung)
│   │   ├── retention-raw-payload.ts           # Retention-CLI (raw_payload compaction)
│   │   ├── list-attention-processes.ts        # Triage-CLI (read-only)
│   │   └── test-classify-real-response.ts     # Klassifikation gegen reale Antwort prüfen
│   └── data/
│       └── dummy-brokers.ts                   # Statische Dummy-Broker-Definitionen
├── docs/
│   ├── specs/                                 # api-contract.md, multi-tenant-profile.md
│   └── real-broker-responses/                 # Dokumentierte reale Antworten (z. B. Yasni)
├── tools/
│   └── branding/                              # Icons (SVG), Wordmark, README
├── docker-compose.yml                         # nur Postgres
├── drizzle.config.ts
├── next.config.ts
├── biome.json
├── tsconfig.json
├── vitest.config.ts
├── package.json
├── .env.example
├── .gitignore
├── README.md
└── CLAUDE.md
```

### Trennung Marketing ↔ App (verbindlich)

Die öffentliche Website und der eingeloggte App-/Dashboard-Bereich sind
getrennt. Diese Trennung nicht aufheben — auch nicht „nebenbei" beim Bauen
eines App-Views:

- **`src/app/(marketing)/` = öffentliche Website**, eigenes Route-Segment mit
  eigenem `layout.tsx` (Fonts, `.site`-Wrapper). Alles Website-Spezifische
  liegt **innerhalb** dieses Segments — auch die Client Components und die
  Platzhalter (siehe nächste Punkte). Der App-/Dashboard-Bereich bekommt ein
  **eigenes** Segment (z. B. `src/app/(app)/`) mit eigenem Layout und eigenen
  `_components`/`_content`. Nicht in `(marketing)` einhängen, dessen Layout
  nicht wiederverwenden.
- **`(marketing)/_components/` = Client Components nur der Website**
  (three.js, GSAP, Lenis). Der Unterstrich macht den Ordner zu einem
  Next.js *private folder* — nicht geroutet, egal wie er heißt. Nichts davon
  in App-Views verwenden; umgekehrt keine App-/Domänenlogik dort ablegen.
  Geteilter Code gehört nach `src/lib/`. Kein Import von außerhalb von
  `(marketing)` in `_components/` oder `_content/` hinein — die Richtung zeigt
  nur nach innen.
- **`(marketing)/_content/placeholders.ts`** hält alle Content-Platzhalter der
  Website (`TODO[content]`): die Reichweitenzahl („über 180 Datenhändler",
  § 5 UWG) und sämtliche Preise sind **unverifiziert** und weichen von der
  Roadmap ab (dort 49 € / 8 €). Nicht raten, nicht „korrigieren", nicht an den
  Verwendungsstellen hartcodieren — nur dort ändern.
- **Tote Links sind Absicht:** Nav-/Footer-/Plan-CTAs zeigen bis zum Launch auf
  `href="#"` und tragen `data-placeholder-link`; der Anchor-Handler in
  `_components/scroll-choreography.tsx` macht sie bewusst inert. Echte Anker
  (`#preise`, `#funktionsweise`) haben das Attribut nicht.
- **`marketing.css` ist global, nicht gescopt.** Next lädt es nur für
  `(marketing)`-Routen, aber bei Client-Navigation bleibt es im Dokument und
  seine ungescopten Selektoren (`*`, `body`, `a`, `ul`, `button`, `:root`)
  wirken dann auch in anderen Bereichen. **Vor dem ersten App-View entscheiden**
  (scopen vs. bewusst global) — Details und Messung: `README.md` → „Trennung
  Marketing ↔ App".
- **Markenname in Marketing-Copy:** dort steht „GoKognito" bewusst als Literal,
  nicht als `SERVICE_NAME`. Die Nie-hartcodieren-Regel unten zielt auf
  Mail-Templates und Domain-/Absenderlogik, nicht auf Prosa. Kein Refactor.

## Konventionen

- **Dateinamen:** kebab-case (`customer-profiles.ts`).
- **TypeScript:** strict, kein `any`, kein non-null-assertion ohne kurzen Kommentar.
- **DB-Spalten:** snake_case. Drizzle mapped via Schema auf camelCase im TS-Code.
- **IDs:** cuid2-Strings (`text("id").primaryKey().$defaultFn(() => createId())`).
- **Imports:** absolute Pfade über `@/*` (siehe `tsconfig.json paths`).
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- **Eine PR/Commit = eine logische Änderung.** Keine Mega-Commits.
- **Tests:** in Phase 1 noch nicht. Ab Phase 2 für Domain-Logik (`lib/`) mit vitest.

## Datenmodell

### Phase 1 (im Repo, abgeschlossen)

#### `users`
Auth-/Kontodaten. Bewusst minimal — PII liegt in `customer_profiles`.
- `id` cuid2 PK
- `email` text unique not null
- `email_verified_at` timestamptz nullable
- `created_at`, `updated_at` timestamptz with default `now()`

#### `customer_profiles`
Personenbezogene Daten, die im Namen des Kunden an Broker übermittelt werden.
- `id` cuid2 PK
- `user_id` references `users.id` on delete cascade, unique (1:1)
- `first_name`, `last_name` text
- `email_addresses` jsonb — Array von Strings
- `phone_numbers` jsonb — Array von Strings
- `postal_addresses` jsonb — Array von Objekten `{ street, postalCode, city, country }` (JSON-Keys camelCase, da TS-direktnah)
- `date_of_birth` date nullable
- `created_at`, `updated_at` timestamptz

> Hinweis: PII-Felder unverschlüsselt. Application-Level-Encryption (pgcrypto oder KMS) wird vor dem ersten echten Kunden eingebaut.

#### `brokers`
Portfolio der Data-Broker.
- `id` cuid2 PK
- `slug` text unique not null
- `name` text not null
- `country` text (ISO 3166-1 alpha-2)
- `website_url` text
- `opt_out_method` enum `'email' | 'form' | 'mixed'`, not null
- `opt_out_email` text nullable
- `opt_out_form_url` text nullable
- `is_dummy` boolean default false, not null
- `is_active` boolean default true, not null
- `notes` text nullable
- `created_at`, `updated_at` timestamptz

#### `opt_out_processes`
Ein Prozess = ein User × ein Broker.
- `id` cuid2 PK
- `user_id` references `users.id`
- `broker_id` references `brokers.id`
- `process_token` text unique not null — **16 Zeichen cuid2** (in Phase 2 angepasst, siehe unten)
- `status` enum `process_status` (`'pending' | 'contacted' | 'in_progress' | 'success' | 'blacklisted' | 'no_response' | 'manual_review' | 'failed' | 'no_data_held'`), default `'pending'`
  - `no_data_held` (Phase 3b.4.6): Broker bestätigt, dass keine (relevanten) Daten zur Person vorliegen. Terminal-Status wie `success`, aber eine **Momentaufnahme** — Recurring-Re-Checks (Phase 3b.8) dürfen auch Terminal-Status über `next_action_at` wieder aufgreifen.
- `last_contacted_at`, `next_action_at` timestamptz nullable
- `created_at`, `updated_at` timestamptz
- unique index auf (`user_id`, `broker_id`)

#### `process_events`
Append-only Event-Log.
- `id` cuid2 PK
- `process_id` references `opt_out_processes.id` on delete cascade
- `event_type` enum (siehe unten — wird in Phase 2 erweitert)
- `payload` jsonb
- `created_at` timestamptz
- Index auf (`process_id`, `created_at`)

### Phase 2 — Änderungen am bestehenden Schema

1. **`opt_out_processes.process_token` auf 16 Zeichen reduzieren.** Der cuid2-Wrapper in `src/lib/ids.ts` bekommt eine zweite exportierte Funktion `createProcessToken()` mit `length: 16`. Bestehende Dummies in Seeds bekommen neue, kürzere Tokens. Migration nötig (Spalte bleibt `text unique`, aber neue Default-Funktion auf Application-Ebene).

2. **`process_events.event_type` enum erweitern** um `'email_classified'`. Drizzle-Migration generiert das automatisch.

### Phase 2 — Neue Tabelle: `process_mails`

Speichert alle Outbound- und Inbound-Mails pro Prozess. Quelle der Wahrheit für Reply-Matching (Stufe 3) und Audit.

- `id` cuid2 PK
- `process_id` references `opt_out_processes.id` on delete cascade
- `direction` enum `mail_direction` (`'outbound' | 'inbound'`), not null
- `provider_message_id` text — SES/Postmark Message-ID (eindeutig, indexiert)
- `from_address` text not null
- `to_address` text not null
- `subject` text
- `body_text` text
- `body_html` text nullable
- `headers` jsonb — wichtige Header (Message-ID, In-Reply-To, References) für Stufe-3-Matching
- `raw_payload` jsonb nullable — komplettes Postmark-Webhook-Payload bei Inbound, für Debugging
- `sent_at` timestamptz nullable (für outbound)
- `received_at` timestamptz nullable (für inbound)
- `created_at` timestamptz default `now()`
- Index auf (`process_id`, `direction`, `created_at`)
- Index auf `provider_message_id`

## Phase 1 — Foundation (Abgeschlossen)

Foundation komplett: Datenmodell, Migrations, Seed, Smoke-Test, Doku, Quality-Gates grün, alle Hygiene-Refactorings (Biome-Ignore für Migrations, sauberer Seed-Shutdown) committed. End-to-End-Smoke-Test (`pnpm dev` + `curl /api/brokers`) liefert die Dummy-Broker als JSON mit `timestamptz`-Timestamps.

### Wichtige Erkenntnisse aus Phase 1 für künftige Sessions

- **DB-Client ist sauber exportiert**: `src/db/client.ts` exportiert sowohl `sql` (postgres-Client) als auch `db` (Drizzle-Instance). Skripte sollten `await sql.end()` aufrufen für sauberes Connection-Shutdown — `process.exit(0)` ist als Pattern nicht mehr nötig.
- **Biome ignoriert generierte Migrations** (`!src/db/migrations/`): nie formatieren, nie linten. Drizzle besitzt diese Dateien.
- **Line Endings sind LF-erzwungen** via `.gitattributes` (`* text=auto eol=lf`). Auf Windows-Entwicklungs-Maschinen wichtig.
- **Domain ist `jba-team.com`** (Development). Brand-Domain GoKognito folgt vor Launch; alle Domain-Referenzen liegen in `.env`, Wechsel ist eine env-Änderung.

## Aktuelle Phase: Phase 2 — Worker, Mail-Pipeline, LLM-Klassifikation

**Ziel:** Funktionierende End-to-End-Mail-Pipeline gegen Dummy-Broker. Outbound-Mail wird vom Worker via SES (Dummy-Modus zu Beginn) verschickt, eingehende Mail über Postmark-Inbound-Webhook entgegengenommen, durch vier-stufiges Token-Matching dem richtigen Prozess zugeordnet, durch Claude Haiku klassifiziert, und der Prozess-Status entsprechend aktualisiert. Alles vollständig in `process_events` und `process_mails` geloggt.

### Externe Services (vor Phase 2 vorbereitet)

- **AWS-Account**: existiert, Region `eu-central-1` Frankfurt. SES-Production-Access-Antrag läuft (Wartezeit ~24h).
  - **Update (Phase 3b):** SES-Production-Access **abgelehnt**. Outbound läuft jetzt über Postmark (siehe Aufgabe-5-Update). AWS-Account bleibt erhalten für später, wird in Phase 2 aber nicht mehr benötigt.
- **Postmark**: Account existiert, Sender-/Inbound-Domain wird in Phase 2 verifiziert (nicht vor SES, da DNS-Records gemeinsam gesetzt werden).
  - **Update (Phase 3b):** Postmark deckt jetzt **Outbound + Inbound** ab. Server-Token in `.env` als `POSTMARK_SERVER_TOKEN`.
- **Anthropic API**: Account existiert, API-Key vorhanden (in `.env` als `ANTHROPIC_API_KEY`).
- **Cloudflare**: Domain `jba-team.com` registriert, DNS-Management aktiv, Email Routing für Account-Mails konfiguriert (`management@jba-team.com` → Gmail).

### Architektur-Entscheidungen (verbindlich)

1. **Worker-Strategie:** separater Node-Prozess, gestartet via `pnpm worker`. Web (Next.js) und Worker teilen `src/db/` + `src/lib/`, sonst getrennt. Lokale Entwicklung: zwei Terminals (`pnpm dev` + `pnpm worker`).
2. **Job-Queue:** pg-boss, läuft in Postgres. pg-boss legt eigene Schemata an (`pgboss.*`) — nicht mit Drizzle-Migrations vermischen.
3. **Token-Format:** `proc-<cuid2-16chars>@reply.jba-team.com` als Reply-To. From-Adresse konstant: `removals@jba-team.com`. Subject enthält Token zusätzlich als `[Ref: TOKEN]` für Stufe-2-Fallback.
4. **Inbound-Matching (4 Stufen):**
   1. Token aus To-Header parsen (Hauptweg, deckt ~98 % ab)
   2. Token aus Subject parsen (`[Ref: TOKEN]`)
   3. `In-Reply-To` / `References` Header → match auf `process_mails.provider_message_id` der gesendeten Outbound-Mail
   4. Fallback: Status `manual_review`, sichtbar in ELYTRA (Phase 5)
5. **Mail-Templates:** TypeScript-Funktionen in `src/lib/mail/templates/`, Signatur `(profile, broker, processToken, locale: 'de' | 'en') => { subject, textBody, htmlBody }`. Snapshot-Tests mit vitest.
6. **LLM-Klassifikation:** `claude-haiku-4-5-20251001` via offizielles `@anthropic-ai/sdk`. Strukturierter Output via Tool-Use (garantiertes JSON). Kategorien: `success`, `no_data_held`, `blacklisted`, `in_progress`, `rejected`, `unrelated`. Bei `confidence < 0.7` → automatisch `manual_review`. PDF-Anhänge werden textextrahiert (`extract-attachment-text.ts`, pdf-parse, kein OCR) und fließen markiert in den Klassifikations-Prompt ein — die Substanz einer Antwort kann vollständig im Anhang stecken (realer Fall: Yasni, siehe `docs/real-broker-responses/`). Modell-Version + Prompt-Version werden im Event-Payload mit geloggt.

### Aufgabenliste Phase 2 (in Reihenfolge abarbeiten)

1. **Env + ID-Wrapper-Erweiterung**
   - [ ] `src/lib/env.ts` erweitern: `ANTHROPIC_API_KEY`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_DOMAIN`, `REPLY_DOMAIN`, `POSTMARK_INBOUND_WEBHOOK_SECRET`
   - [ ] `.env.example` analog aktualisieren — **niemals echte Werte committen**
   - [ ] `src/lib/ids.ts`: zusätzliche Funktion `createProcessToken()` mit cuid2-Länge 16

2. **Schema-Erweiterung + Migration**
   - [ ] `src/db/schema/process-mails.ts` neu
   - [ ] `process_events.event_type` enum um `'email_classified'` erweitern
   - [ ] `process_mails`-Schema in `src/db/schema/index.ts` re-exportieren
   - [ ] `pnpm db:generate` → Migration prüfen → `pnpm db:migrate`
   - [ ] Seed-Anpassung: bestehende Dummies neu seeden mit gekürzten Tokens

3. **Worker-Skeleton**
   - [ ] `pnpm add pg-boss`
   - [ ] `src/worker/queue.ts`: pg-boss-Instanz, lädt Connection aus `env.DATABASE_URL`
   - [ ] `src/worker/index.ts`: Worker Entry-Point, startet pg-boss, registriert Job-Handler, läuft auf Dauer
   - [ ] `pnpm worker` Script in package.json
   - [ ] Smoke-Test: Dummy-Job (`hello-world`) enqueuen, Worker konsumiert, Logs erscheinen, Job wird in `pgboss.job` als completed markiert

4. **Mail-Template (Deutsch, DSGVO Art. 17/21)**
   - [ ] `src/lib/mail/templates/opt-out-request.ts` mit Funktion `buildOptOutRequest(profile, broker, token, locale='de')`
   - [ ] Subject-Format: `[Ref: <TOKEN>] Datenlöschanfrage gemäß Art. 17 DSGVO`
   - [ ] Text-Body: rechtssichere Formulierung (Verweis auf Vollmacht, Art. 17 DSGVO Löschung, Art. 21 Widerspruch, Antwortfrist von 30 Tagen)
   - [ ] vitest-Snapshot-Test für eine Beispiel-Kombination Profile×Broker

5. **Outbound-Mail (SES, Dummy-Modus first)**
   - [ ] `pnpm add @aws-sdk/client-ses`
   - [ ] `src/lib/mail/send.ts`: `sendMail({ from, to, replyTo, subject, textBody, htmlBody })` → Promise mit Message-ID
   - [ ] **Dummy-Modus:** wenn `broker.is_dummy === true`, kein echter SES-Call, sondern nur Log + Fake-Message-ID. Vor SES-Production-Access: ALLE Broker dummy. Production-Switch über Broker-Flag, nicht über Code-Pfad.
   - [ ] **Message-ID-Header bewusst selbst setzen** (deshalb `SendRawEmail` statt `SendEmail`): Format `<proc-<token>-<rand>@MAIL_FROM_DOMAIN>`, gespeichert als `process_mails.provider_message_id`. Grund: Nur so greift das Stufe-3-Reply-Matching (`In-Reply-To`/`References`, Aufgabe 7) in Production — bei `SendEmail` vergäbe SES eine eigene, nicht referenzierbare Message-ID. Die SES-API-Response-ID landet zusätzlich in `raw_payload` (Bounce-Tracking). **Nicht wegrefactoren.**
   - [ ] Job `src/worker/jobs/send-opt-out-mail.ts`: Input `{ processId }` → lädt Process+User+Broker, baut Mail, schickt via `sendMail`, schreibt Eintrag in `process_mails`, schreibt `mail_sent` Event, updated `opt_out_processes.last_contacted_at` und `status='contacted'`

   **Update (Phase 3b — SES → Postmark):** AWS-SES-Production-Access wurde abgelehnt. Outbound läuft jetzt über **Postmark** (`postmark` SDK, `new ServerClient(env.POSTMARK_SERVER_TOKEN).sendEmail({…})`). `SendRawEmail` ist damit hinfällig — der Custom-`Message-ID`-Header geht per `Headers: [{ Name: "Message-ID", Value: messageId }]` in den `sendEmail`-Call (Postmark akzeptiert/leitet ihn unverändert weiter). Die Postmark-API-`MessageID` landet zum Bounce-Tracking in `process_mails.headers` als `X-Postmark-MessageId` (nicht mehr in `raw_payload`); Schlüssel fürs Reply-Matching bleibt unser selbstgesetzter `Message-ID`-Header in `provider_message_id`.

6. **Inbound-Webhook (Postmark)**
   - [ ] `src/app/api/webhooks/postmark-inbound/route.ts`: POST-Handler
   - [ ] Signature-Verifizierung gegen `POSTMARK_INBOUND_WEBHOOK_SECRET` (HTTP Basic Auth, Postmark-Standard)
   - [ ] Payload validieren mit zod
   - [ ] In `process_mails` mit `direction='inbound'`, `provider_message_id`, `raw_payload` speichern
   - [ ] Job `process-inbound-mail` mit der `process_mails.id` enqueuen
   - [ ] HTTP 200 zurück (Postmark hört sonst nicht auf zu retryn)

7. **Inbound-Matching**
   - [ ] `src/lib/mail/match-inbound.ts`: `matchInbound(mail) → { processId, matchStage }` mit den vier Stufen
   - [ ] Tests mit vitest für alle vier Stufen + den Fallback

8. **LLM-Klassifikation**
   - [ ] `pnpm add @anthropic-ai/sdk`
   - [ ] `src/lib/llm/classify-inbound.ts`: nutzt Tool-Use für strukturierten Output
   - [ ] System-Prompt: Kategorien definieren, Beispiele aus dem deutschen Sprachraum
   - [ ] Confidence-Threshold-Logik
   - [ ] Tests mit vitest gegen 3–5 synthetische Beispiel-Antworten (eine pro Kategorie)

9. **Inbound-Job zusammenstecken**
   - [ ] Job `src/worker/jobs/process-inbound-mail.ts`: lädt Mail aus `process_mails`, läuft durch Matching → Klassifikation → Status-Update auf `opt_out_processes`, schreibt Events (`mail_received`, `email_classified`, ggf. `status_changed`)
   - [ ] Bei Match-Stufe 4 oder Confidence < 0.7: `status='manual_review'`

10. **End-to-End Smoke-Test**
    - [ ] Script `src/scripts/e2e-smoke.ts` (kein API-Endpoint, nur lokal): Erstellt Test-User + Test-Profile + Test-Process gegen Dummy-Broker, triggert `send-opt-out-mail`-Job, simuliert eine Inbound-Mail via direktem POST auf den Webhook-Endpoint, prüft am Ende Status + Events
    - [ ] In README einen "Phase 2 Smoke-Test"-Abschnitt ergänzen

### Was Phase 2 NICHT enthält

Auth, Anmeldung, UI-Seiten, Customer-Dashboard, ELYTRA, Browser-Automation (Playwright), Recurring Resends per Cron, Landing Page, Stripe, Production-Deploy, PII-Verschlüsselung. Browser-Automation kommt in Phase 3, ELYTRA in Phase 5. Disziplin.

### Was vor Phase 2 noch von außerhalb gebraucht wird

- **SES Production-Access** (User): nach Antrag warten, Status in AWS Console prüfen. Phase 2 ist bis Aufgabe 5 ohne SES baubar (Dummy-Modus).
- **DNS-Records für SES + Postmark** (User + Claude Code gemeinsam): wenn SES freigeschaltet, müssen DKIM-Records (SES) und MX/SPF/DMARC (Postmark Inbound) in Cloudflare gesetzt werden. Dies passiert nach Aufgabe 5 oder 6, je nach Reihenfolge.

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

# Dev (zwei Terminals parallel)
pnpm dev                         # next dev (Web)
pnpm worker                      # Worker-Prozess (ab Phase 2)

# Quality
pnpm typecheck                   # tsc --noEmit
pnpm lint                        # biome check
pnpm format                      # biome format --write
```

## Wichtige Design-Entscheidungen — Why

**Foundation (Phase 1):**
- **Drizzle statt Prisma:** Kein separater Engine-Prozess, kein zweiter Build-Step, native TypeScript-Typen ohne Generation.
- **cuid2 statt uuid v4 oder serial:** URL-safe, kollisionsfest, nicht ratebar (wichtig für `process_token`), kürzer als uuid.
- **JSONB für Mehrfach-PII (Mails/Adressen/Telefone):** Pro Kunde realistisch 2–3 Mails, 1–2 Adressen. Eigene Tabellen wären Overkill.
- **Append-only `process_events`:** Volle Historie für ELYTRA-Timeline, einfacheres Debugging, Audit-fähig.
- **Biome statt ESLint+Prettier:** Ein Tool, eine Config, ~10x schneller.
- **`timestamptz` statt `timestamp`:** Postgres-Default für Webapps. Vermeidet Sommerzeit-/TZ-Bugs, kostet nichts.

**Phase 2:**
- **Worker als separater Prozess statt in Next.js:** Browser-Automation (kommt Phase 3) braucht 100–300 MB RAM und blockiert den Event-Loop minutenlang. Auch LLM-Calls dauern 1–5 s. Web-Server muss schlank bleiben. Trennung schafft saubere Skalierung und unabhängige Resilience.
- **pg-boss statt Redis/BullMQ:** Wir haben Postgres bereits. Eine zusätzliche Infrastruktur-Komponente (Redis) für ein Solo-Projekt mit überschaubarem Job-Volumen ist Overhead ohne Gegenwert. pg-boss erfüllt alle Anforderungen (Retry, Scheduling, Concurrency).
- **Wildcard-Subdomain statt Plus-Tagging:** Plus-Tags werden von 5–15 % der Mail-Systeme gestrippt. Wildcard-MX auf eigener Subdomain ist 100 % robust und kostet einmalig 5 Min DNS-Konfiguration.
- **16-Zeichen-cuid2-Token:** 36^16 ≈ 8×10^24 Möglichkeiten, kollisionsfest auf jeder relevanten Skala. Standard-cuid2 mit 24 Zeichen wäre overkill und macht Reply-Adressen unnötig lang.
- **Mail-Templates als TS-Funktionen statt Markdown/DB:** Rechtliche Texte gehören unter Code-Review. Git als Versions- und Audit-Geschichte. Kein UI nötig, kein A/B-Testing-Bedarf.
- **LLM-Klassifikation direkt in Phase 2 statt später:** Ohne Klassifikation würde der gesamte Inbound-Loop nur in `manual_review` münden — ELYTRA müsste dafür gebaut werden, bevor die Pipeline überhaupt sinnvoll funktioniert. Bei ~150 Zeilen Code lohnt das Nachrüsten nicht.
- **Confidence-Threshold 0.7:** Liberal genug, dass die meisten klaren Fälle automatisch durchgehen; streng genug, dass mehrdeutige Mails (wo der Sachbearbeiter wertvoller ist als der LLM) manuell landen. Kann später aus Real-World-Daten kalibriert werden.

**Phase 3b:**
- **Postmark statt AWS SES für Outbound:** AWS-SES-Production-Access wurde abgelehnt. Postmark übernimmt jetzt **beide** Richtungen (Outbound + Inbound) — vereinfacht Domain-/DNS-Setup (eine Verifikation statt zwei) und reduziert Vendor-Sprawl. Custom-`Message-ID`-Header bleibt unsere Verantwortung (`Headers`-Param in `sendEmail`), damit Stufe-3-Matching weiter funktioniert; Postmarks API-MessageID wandert nur als Bounce-Tracking-Schlüssel in `process_mails.headers`.

## Was Claude bei der Arbeit beachten soll

- **Frage nach, wenn etwas unklar ist.** Lieber eine Klärungsfrage als eine versteckte Annahme.
- **Keine neuen Libraries ohne Rücksprache.** Stack ist bewusst kompakt gehalten.
- **Halte dich an die aktuelle Phase.** Phase 2 ist Worker + Mail + LLM. Keine Auth, kein UI, kein Playwright in Phase 2.
- **Selbsterklärender Code > Kommentare.** Kommentare nur für "Warum", nicht "Was".
- **Inkrementell committen.** Eine Aufgabe = ein Commit. Conventional Commits.
- **Drizzle-Schema-Änderungen immer mit `db:generate` + `db:migrate` festschreiben.** Niemals direkt am SQL pfuschen.
- **Stopp und reviewen lassen** nach folgenden Phase-2-Aufgaben: Schema-Erweiterung (Aufgabe 2, vor `db:migrate`), Worker-Skeleton-Smoke-Test (Aufgabe 3), Mail-Template-Snapshot-Test (Aufgabe 4), End-to-End-Test (Aufgabe 10). Bei allem anderen autonom durchziehen.
- **Domain-Referenzen und Secrets immer aus `env`.** Niemals `jba-team.com` oder `removals@jba-team.com` im Code hartcodieren — wenn die Domain wechselt, soll das eine `.env`-Änderung sein.
- **Trennung Marketing ↔ App respektieren** (siehe Abschnitt unter „Projektstruktur"): Website lebt vollständig in `src/app/(marketing)/` (inkl. `_components/` und `_content/`), der App-Bereich bekommt ein eigenes Segment. Content-Platzhalter (Reichweitenzahl, Preise) stehen mit `TODO[content]` in `src/app/(marketing)/_content/placeholders.ts` und sind unverifiziert — nicht eigenmächtig ändern.
- **Dummy-Modus respektieren.** `broker.is_dummy === true` heißt: kein echter SES-Call. Auch in lokaler Entwicklung, auch beim Smoke-Test. Production-Mails fließen erst nach explizitem Setzen von `is_dummy: false` auf einem Broker — der Code soll diesen Flag bedingungslos respektieren.
- **Postmark-Webhook-Signature verifizieren** ist Pflicht, kein Optional. Wenn der Endpoint öffentlich ist, kann jeder ihn aufrufen.
