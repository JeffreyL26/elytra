# GoKognito

Automatisierter Opt-Out-Service für DSGVO-basierte Datenlöschanfragen bei
Data-Brokern. Dieses Repository enthält den Monolithen (Next.js) inklusive
Public-Website und internem Admin-UI (ELYTRA) sowie das Datenmodell.

> Aktueller Stand: **Phase 2 — Mail-Pipeline** abgeschlossen (Worker via
> pg-boss, Outbound-Versand via SES im Dummy-Modus, Postmark-Inbound-Webhook,
> vier-stufiges Reply-Matching, LLM-Klassifikation).

## Voraussetzungen

- **Node.js 20+**
- **pnpm** (z. B. via `corepack enable`)
- **Docker Desktop** (für die lokale PostgreSQL-Instanz)

## Erst-Setup

```bash
pnpm install
cp .env.example .env        # Windows: copy .env.example .env
```

Die `.env` enthält die `DATABASE_URL`; die Default-Werte passen zur
lokalen Docker-Postgres-Konfiguration aus `docker-compose.yml`.

## Datenbank

```bash
pnpm db:up         # Postgres-Container starten (docker compose)
pnpm db:migrate    # Migrationen auf die DB anwenden
pnpm db:seed       # Dummy-Broker idempotent einspielen
```

Weitere DB-Befehle:

```bash
pnpm db:generate   # SQL-Migration aus dem Drizzle-Schema generieren
pnpm db:studio     # Drizzle Studio (GUI) auf localhost:4983
pnpm db:down       # Container stoppen
```

## Entwicklung

Zwei Prozesse, je ein Terminal:

```bash
pnpm dev           # Next.js Dev-Server auf localhost:3000 (Web + Webhooks)
pnpm worker        # Worker-Prozess (Mail-Versand, Inbound-Verarbeitung)
```

## Verifizieren

```bash
curl http://localhost:3000/api/brokers
```

Die Antwort listet die drei eingeseedeten Dummy-Broker als JSON — damit ist
belegt, dass DB, Drizzle und Next.js zusammenspielen.

## Phase 2 — Mail-Pipeline

Phase 2 ergänzt den Worker (pg-boss), den Outbound-Mail-Versand (AWS SES,
Dummy-Modus über `broker.is_dummy`), den Postmark-Inbound-Webhook, das
vier-stufige Reply-Matching und die LLM-Klassifikation (Claude). Dafür werden
zusätzliche `.env`-Variablen gebraucht (siehe `.env.example`):

- `ANTHROPIC_API_KEY` — für die LLM-Klassifikation
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — SES (nur für echten Versand; im Dummy-Modus ungenutzt)
- `MAIL_FROM_ADDRESS`, `MAIL_FROM_DOMAIN`, `REPLY_DOMAIN` — Absender und Reply-To-Token-Domain
- `POSTMARK_INBOUND_WEBHOOK_USERNAME`, `POSTMARK_INBOUND_WEBHOOK_PASSWORD` — HTTP-Basic-Auth des Inbound-Webhooks

### Phase 2 Smoke-Test

Durchläuft die komplette Pipeline lokal in einem Prozess gegen einen
Dummy-Broker (kein echter SES-/Postmark-Verkehr):

```bash
pnpm e2e
```

Der Test legt User + Profil + Prozess an, verschickt die Opt-Out-Mail
(Dummy-Modus), simuliert die Broker-Antwort per POST an den Inbound-Webhook,
verarbeitet sie (Matching → Klassifikation → Status) und gibt am Ende den
Prozess-Status und den Event-Verlauf aus. Anschließend werden die Testdaten
wieder entfernt.

Voraussetzungen: Postgres läuft (`pnpm db:up`, `pnpm db:migrate`, `pnpm db:seed`)
und `.env` enthält `MAIL_FROM_ADDRESS`, `REPLY_DOMAIN` sowie die
`POSTMARK_INBOUND_WEBHOOK_*`-Werte. Ist `ANTHROPIC_API_KEY` gesetzt, wird real
klassifiziert; andernfalls greift das Sicherheitsnetz (Klassifikations-Fehler →
`manual_review`).

## Projektstruktur

Unit-/Integrationstests liegen als `*.test.ts` neben dem jeweiligen Code.

```
gokognito/
├── src/
│   ├── app/                                  # Next.js App Router (Web-Prozess)
│   │   ├── (marketing)/                      # Öffentliche Website (eigenes Segment)
│   │   │   ├── layout.tsx                    # Fonts (next/font, self-hosted) + .site-Wrapper
│   │   │   ├── marketing.css                 # Design-System der Landing-Page
│   │   │   ├── page.tsx                      # Landing-Page (Server Component)
│   │   │   ├── _components/                  # Client Components NUR der Website (private folder)
│   │   │   │   ├── hero-scene.tsx            # three.js-Partikelszene
│   │   │   │   ├── scroll-choreography.tsx   # GSAP/ScrollTrigger + Lenis
│   │   │   │   ├── nav.tsx, faq.tsx, …       # Nav, FAQ, Akte, Billing-Toggle, Wordmark
│   │   │   │   └── runtime.ts                # Handle zwischen Szene und Choreographie
│   │   │   └── _content/
│   │   │       └── placeholders.ts           # TODO[content]: Reichweitenzahl + Preise
│   │   └── api/
│   │       ├── brokers/route.ts              # GET /api/brokers (Smoke-Test)
│   │       └── webhooks/
│   │           └── postmark-inbound/
│   │               └── route.ts              # Postmark Inbound-Webhook
│   ├── db/
│   │   ├── schema/
│   │   │   ├── index.ts                      # Re-Exports aller Schemas
│   │   │   ├── users.ts
│   │   │   ├── customer-profiles.ts
│   │   │   ├── brokers.ts
│   │   │   ├── opt-out-processes.ts
│   │   │   ├── process-events.ts
│   │   │   └── process-mails.ts              # Outbound/Inbound-Mails pro Prozess
│   │   ├── migrations/                       # Drizzle-generiert
│   │   ├── client.ts                         # exports { sql, db }
│   │   └── seed.ts                           # Seed-Script (Dummy-Broker)
│   ├── lib/
│   │   ├── env.ts                            # zod-validierte env vars
│   │   ├── ids.ts                            # cuid2 (createId + createProcessToken)
│   │   ├── branding.ts                       # SERVICE_NAME
│   │   ├── mail/
│   │   │   ├── send.ts                       # SES-Wrapper (Dummy-Modus first)
│   │   │   ├── match-inbound.ts              # Vier-stufiges Reply-Matching
│   │   │   └── templates/
│   │   │       └── opt-out-request.ts        # DSGVO-Mail-Template (DE/EN)
│   │   └── llm/
│   │       └── classify-inbound.ts           # LLM-Klassifikation (Claude Tool-Use)
│   ├── worker/                               # Worker-Prozess (pnpm worker)
│   │   ├── index.ts                          # Entry-Point + Queue-Registrierung
│   │   ├── queue.ts                          # pg-boss-Instanz (Worker)
│   │   ├── producer.ts                       # send-only enqueue (Web-Prozess)
│   │   └── jobs/
│   │       ├── send-opt-out-mail.ts
│   │       └── process-inbound-mail.ts
│   ├── scripts/
│   │   └── e2e-smoke.ts                       # End-to-End-Smoke (pnpm e2e)
│   └── data/
│       └── dummy-brokers.ts                  # Statische Dummy-Broker-Definitionen
├── tools/
│   └── branding/                             # Logo-Render-Vorlage (NICHT im Next-Build)
├── docker-compose.yml                        # nur Postgres
├── drizzle.config.ts
├── biome.json
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

### Trennung Marketing ↔ App

Die öffentliche Website und der (noch nicht existierende) eingeloggte
App-/Dashboard-Bereich sind bewusst getrennt. Diese Trennung bitte erhalten:

- **`src/app/(marketing)/` = öffentliche Website**, eigenes Route-Segment mit
  eigenem `layout.tsx`. Alles Website-Spezifische liegt **innerhalb** dieses
  Segments: `page.tsx`, `marketing.css`, die Fonts, `_components/` (Client
  Components) und `_content/` (Platzhalter). Der App-/Dashboard-Bereich
  bekommt später ein eigenes Segment (z. B. `src/app/(app)/`) mit eigenem
  Layout und eigenen `_components`/`_content` — **nicht** in `(marketing)`
  einhängen und nicht dessen Layout wiederverwenden.
- **`(marketing)/_components/` = Client Components nur der Website**
  (three.js, GSAP, Lenis). Der führende Unterstrich macht den Ordner zu einem
  Next.js *private folder*: er wird nicht geroutet, `/marketing/_components/…`
  liefert 404. Nichts davon gehört in App-Views; umgekehrt gehört keine
  App-/Domänenlogik hier hinein. Geteilter Code lebt in `src/lib/`. Kein Code
  außerhalb von `(marketing)` importiert aus `_components/` oder `_content/` —
  die Pfeilrichtung zeigt nur nach innen, nie von außen hinein.
- **`(marketing)/_content/placeholders.ts` = Content-Platzhalter der
  Website**, alle mit `TODO[content]` markiert: die Reichweitenzahl
  („über 180 Datenhändler") und sämtliche Preise sind **unverifizierte
  Platzhalter** aus dem Design-Prototyp (die Roadmap nennt abweichend
  49 € / 8 €; bei der Reichweitenangabe hängt § 5 UWG dran). Vor Launch
  verifizieren, Werte nur dort ändern — nicht an den Verwendungsstellen
  hartcodieren.
- **Tote Links:** Nav-/Footer-/Plan-CTAs zeigen bis zum Launch auf `href="#"`
  und tragen `data-placeholder-link`. Der Anchor-Handler in
  `_components/scroll-choreography.tsx` macht `#`-Links bewusst inert. Echte
  Anker (`#preise`, `#funktionsweise`) haben das Attribut nicht — daran lässt
  sich erkennen, was noch nicht verdrahtet ist.
- **`marketing.css` ist ein globales Stylesheet**, kein CSS-Modul. Next lädt es
  nur für Routen unter `(marketing)` — ein direkter Aufruf einer anderen Route
  bekommt es nicht. Aber: Bei **Client-Navigation** von der Website in einen
  anderen Bereich bleibt das Stylesheet im Dokument, und seine Selektoren (`*`,
  `body`, `a`, `ul`, `button`, `:root`-Tokens) sind ungescoped — sie wirken
  dann dort mit (gemessen: `body` bekommt den Ink-Hintergrund, `ul` verliert
  die Punkte, Links die Unterstreichung). Solange es nur die Website gibt, ist
  das folgenlos. **Vor dem ersten App-View entscheiden**, ob `marketing.css`
  aufs Segment gescopt wird (Wrapper-Klasse statt `body`/Element-Selektoren
  bzw. CSS-Modul) oder bewusst global als Basis für beide Bereiche dient.
  Die Font-Variablen sind bereits gescopt: sie hängen am `.site`-Wrapper des
  Marketing-Layouts, nicht an `:root`.

## Quality

```bash
pnpm typecheck     # tsc --noEmit
pnpm lint          # biome check
pnpm format        # biome format --write
```
