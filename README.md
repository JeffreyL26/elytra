# InkogniGO

Automatisierter Opt-Out-Service für DSGVO-basierte Datenlöschanfragen bei
Data-Brokern. Dieses Repository enthält den Monolithen (Next.js) inklusive
Public-Website und internem Admin-UI (ELYTRA) sowie das Datenmodell.

> Aktueller Stand: **Phase 1 — Foundation** (Projektgerüst, Datenmodell,
> Seed-Daten, Smoke-Test).

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

```bash
pnpm dev           # Next.js Dev-Server auf localhost:3000
```

## Verifizieren

```bash
curl http://localhost:3000/api/brokers
```

Die Antwort listet die drei eingeseedeten Dummy-Broker als JSON — damit ist
belegt, dass DB, Drizzle und Next.js zusammenspielen.

## Projektstruktur

```
inkognigo/
├── src/
│   ├── app/                      # Next.js App Router
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
└── package.json
```

## Quality

```bash
pnpm typecheck     # tsc --noEmit
pnpm lint          # biome check
pnpm format        # biome format --write
```
