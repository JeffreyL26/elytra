# Spec: API-Vertrag Website ↔ Backend (Design-Dokument, keine Implementierung)

**Stand 17.07.2026 · Ablage: `docs/specs/api-contract.md`**

Dieses Dokument definiert die HTTP-Endpunkte, die die Kunden-Website (Landing
+ späterer App-Bereich) vom Backend braucht — als Vertrag: Methode, Pfad,
Request-/Response-Felder, Auth-Anforderung, RDG-Einordnung. Es implementiert
nichts und ändert nichts an bestehendem Code. Grundlage sind
`docs/specs/multi-tenant-profile.md` (RDG-neutrale Schicht, Mandantentrennung)
und der bestehende Code (`src/lib/user-data-access.ts`,
`src/lib/customer-profile-schema.ts`, `src/db/schema/*`).

## 0. Konventionen (gelten für alle Endpunkte)

- **Format:** JSON (`application/json`), UTF-8. Zeitstempel ISO-8601 mit
  Zeitzone. IDs sind cuid2-Strings (`src/lib/ids.ts`).
- **Auth:** Session-Cookie (HttpOnly, SameSite=Lax, Secure), verwaltet von
  Better Auth (§ 1). `userId` stammt **ausschließlich aus der Session** —
  niemals aus Body, Query oder Header (Invariante aus
  `user-data-access.ts`, Regel 1).
- **Mandantentrennung:** Jeder Read user-gebundener Daten läuft über den
  bestehenden `*ForUser`-Layer (`getProfileForUser`, `getProcessesForUser`,
  `getProcessMailsForUser`). **Keine neuen Lesepfade.** Fremde oder
  nicht existierende Ressourcen antworten `404` (nie `403` — Existenz fremder
  Ressourcen wird nicht verraten; Regel 3).
- **Fehlerformat:**

  ```json
  { "error": { "code": "validation_failed", "message": "…", "fields": ["lastName"] } }
  ```

  `code` ist maschinenlesbar und stabil; `fields` nennt Feldnamen, **nie
  Feldwerte** (PII-Disziplin wie `parseCustomerProfile()`).
- **Statuscodes:** 200/201 Erfolg · 400 Validierung · 401 keine/ungültige
  Session · 404 nicht vorhanden oder fremd · 409 Konflikt (z. B. Profil
  existiert schon) · 429 Rate-Limit.
- **Rate-Limiting:** Pflicht auf allen unauthentifizierten Endpunkten
  (Registrierung, Login, Warteliste); Mechanik ist Implementierungsdetail.
- **RDG-Einordnung pro Endpunkt:**
  - *RDG-neutral* = reine Konto-/Datenverwaltung, vor der
    Vollmacht-/Vertretungsfrage baubar (Gate G1).
  - *Hinter G1* = setzt erteilte Vollmacht/Vertretung voraus oder liefert
    Daten, die erst durch sie entstehen.

---

## 1. Auth — RDG-neutral

Hängt an **Better Auth** (Empfehlung aus multi-tenant-profile.md § 2.1,
Drizzle-Adapter). Better Auth mountet einen eigenen Catch-all-Handler
(`/api/auth/[...all]`); die folgenden Einträge sind der **fachliche Vertrag**,
den die Konfiguration erfüllen muss — nicht notwendigerweise wörtliche Pfade.

Gemeinsame Anforderungen:

- Passwort-Policy serverseitig (Lastenheft FPW-3.2.1): ≥ 12 Zeichen,
  Groß-/Kleinbuchstabe, Zahl, Sonderzeichen.
- Verifizierungs-Mails laufen über den **Customer-Message-Stream** (nicht den
  Broker-Stream — Reputationstrennung, multi-tenant-profile.md § 2.1).
- `users.emailVerifiedAt` ist die einzige Wahrheit über den
  Verifizierungsstatus.

### 1.1 Registrierung

| | |
|---|---|
| Methode/Pfad | `POST /api/auth/register` (Better-Auth-Äquivalent: sign-up email) |
| Auth | keine |
| RDG | neutral |

Request: `email` (string, E-Mail), `password` (string, Policy s. o.).
Response `201`: `{ "user": { "id", "email", "emailVerifiedAt": null } }` +
Session-Cookie. Verifizierungs-Mail wird versendet. Fehler: `400`
(Policy/E-Mail-Format), `409` (`email_taken`), `429`.

### 1.2 Login

| | |
|---|---|
| Methode/Pfad | `POST /api/auth/login` (Better-Auth: sign-in email) |
| Auth | keine |
| RDG | neutral |

Request: `email`, `password`. Response `200`:
`{ "user": { "id", "email", "emailVerifiedAt" } }` + Session-Cookie.
Fehler: `401` (`invalid_credentials` — bewusst nicht unterscheiden, ob E-Mail
existiert), `429`.

### 1.3 E-Mail-Verifizierung

| | |
|---|---|
| Methode/Pfad | `GET /api/auth/verify-email?token=…` (Better-Auth: verify-email) |
| Auth | Token in der URL (aus der Mail), keine Session nötig |
| RDG | neutral |

Response: Redirect auf die App mit Erfolgs-/Fehlerstatus; setzt
`users.emailVerifiedAt`. Fehler: `400` (`token_invalid_or_expired`).
Unverifizierte Konten dürfen sich einloggen, aber **kein Profil anlegen und
nichts buchen** (multi-tenant-profile.md § 2.1).

### 1.4 Logout

| | |
|---|---|
| Methode/Pfad | `POST /api/auth/logout` (Better-Auth: sign-out) |
| Auth | Session |
| RDG | neutral |

Response `200`: `{}`; Session serverseitig invalidiert, Cookie gelöscht.

---

## 2. Profil-CRUD — RDG-neutral

Gegen `customer_profiles` (1:1 zu `users`, `userId` unique). **Validierung
ausschließlich über `customerProfileSchema` / `parseCustomerProfile()` aus
`src/lib/customer-profile-schema.ts`** — dieselbe Stelle wie der Seed; kein
zweiter Schreibweg mit eigenen Regeln (Invariante aus dem Modul-Kommentar).

Profilfelder im Request wie im Zod-Schema: `firstName`, `lastName`,
`emailAddresses[]` (min. 1), `postalAddresses[]` (min. 1; `street`,
`postalCode`, `city`, `country` ISO-3166-1-alpha-2), optional
`phoneNumbers[]`, `dateOfBirth` (`YYYY-MM-DD`, echtes Kalenderdatum,
1900..heute).

Response-Shape (alle Reads): die Profilfelder + `id`, `createdAt`,
`updatedAt`. **Ohne** `userId` (ergibt sich aus der Session, kein Grund, sie
zu spiegeln).

### 2.1 Profil lesen

| | |
|---|---|
| Methode/Pfad | `GET /api/profile` |
| Auth | Session |
| Lesepfad | `getProfileForUser(session.userId)` |
| RDG | neutral |

`200` mit Profil · `404`, wenn noch keines existiert.

### 2.2 Profil anlegen

| | |
|---|---|
| Methode/Pfad | `POST /api/profile` |
| Auth | Session **mit verifizierter E-Mail** |
| RDG | neutral |

`201` mit Profil · `400` Validierung · `403` (`email_not_verified`) ·
`409` (`profile_exists` — pro User genau eines; Änderungen über PUT).

### 2.3 Profil ändern

| | |
|---|---|
| Methode/Pfad | `PUT /api/profile` |
| Auth | Session mit verifizierter E-Mail |
| RDG | neutral |

Vollständiges Replace (kein PATCH: das Profil ist klein, Merge-Semantik wäre
nur eine zweite Validierungswahrheit). `200` mit Profil · `400` · `404`, wenn
keines existiert. Hinweis für später: Änderungen an Identifikationsdaten
können laufende Prozesse betreffen (Re-Check-Thema) — Verhalten wird mit dem
Vollmacht-Flow entschieden, nicht hier.

### 2.4 Profil löschen

| | |
|---|---|
| Methode/Pfad | `DELETE /api/profile` |
| Auth | Session |
| RDG | neutral |

`200`: `{}`. Löscht das `customer_profiles`-Row (Selbstbestimmung,
multi-tenant-profile.md § 1.3). **Offen (TODO[legal-review]):** Verhalten bei
laufenden Prozessen und Wechselwirkung mit Konto-Löschung/Retention — wird
zusammen mit G3 (Retention) entschieden; dieser Endpunkt löscht in v1 nur das
Profil und lehnt mit `409` (`processes_active`) ab, solange aktive Prozesse
existieren.

### 2.5 Konto-Löschung

| | |
|---|---|
| Methode/Pfad | `DELETE /api/account` |
| Auth | Session (**bewusst ohne** Verifizierungs-Pflicht) + aktuelles Passwort im Body |
| RDG | neutral (Betroffenenrecht) |

Request: `{ "password": "…" }` — Re-Authentifizierung gegen versehentliche
oder session-gestohlene Löschung. Response `204`, kein Body; Session danach
serverseitig ungültig (Cascade löscht die Session-Zeilen).

Bewusste Abweichungen von den übrigen Schreib-Endpunkten:

- **Kein Verify-Gate:** Wer sich mit Tippfehler-Adresse registriert hat, kann
  nie verifizieren — und muss sich trotzdem löschen können.
- **Kein 409 bei aktiven Prozessen** (anders als 2.4): Konto-Löschung ist ein
  Betroffenenrecht und darf nicht an laufenden Vorgängen scheitern. Laufende
  Prozesse werden durch die Löschung beendet (Mandat erlischt mit dem Konto).

Semantik: **harte Löschung** aller personenbezogenen Daten (User, Profil,
Prozesse, Mails, Events, Sessions, Credentials). Vor der Löschung wird pro
klassifizierter Broker-Antwort ein **echt anonymer** Empirie-Datensatz nach
`broker_response_stats` extrahiert (nur brokerId/Kategorie/Confidence/Modell/
Monat — keine IDs, Tokens, Freitexte oder Zeitpunkte feiner als Monat).
Fehler: `401` (keine Session), `403` (`invalid_password`), `400`.

---

## 3. Dashboard-Reads — hinter G1

Alle drei Endpunkte sind technisch reine Reads und laufen **zwingend** über
den bestehenden `*ForUser`-Layer aus `src/lib/user-data-access.ts` —
referenzierte Funktion pro Endpunkt, keine neuen Query-Pfade. Sie liegen
**hinter G1** in dem Sinn, dass Opt-Out-Prozesse erst durch die
Vollmacht/Beauftragung entstehen; vor G1 liefern sie leere Listen bzw. 404
und dürfen deshalb ohne Risiko mit ausgeliefert werden.

### 3.1 Dashboard-Profil

| | |
|---|---|
| Methode/Pfad | `GET /api/dashboard/profile` |
| Auth | Session |
| Lesepfad | `getProfileForUser(session.userId)` |
| RDG | hinter G1 (inhaltlich identisch mit 2.1; eigener Pfad nur, falls das Dashboard ein reduziertes Shape braucht — sonst entfällt er zugunsten von 2.1) |

### 3.2 Prozessliste

| | |
|---|---|
| Methode/Pfad | `GET /api/dashboard/processes` |
| Auth | Session |
| Lesepfad | `getProcessesForUser(session.userId)` |
| RDG | hinter G1 |

Response `200`:

```json
{ "processes": [ { "id", "brokerId", "status", "lastContactedAt", "nextActionAt", "createdAt", "updatedAt" } ] }
```

`status` ist das `process_status`-Enum aus `opt-out-processes.ts` (pending …
no_data_held). **Bewusst NICHT enthalten:** `processToken` (Reply-Routing-
Geheimnis, niemals clientseitig) und `isSelfRequest` (internes Betriebsdetail).
Broker-Anzeigenamen löst die API über die (nicht user-gebundene)
`brokers`-Tabelle auf und liefert sie als `broker: { "name", "country" }` mit —
das ist kein user-Datenpfad und verletzt den Layer nicht.

### 3.3 Mails eines Prozesses

| | |
|---|---|
| Methode/Pfad | `GET /api/dashboard/processes/{processId}/mails` |
| Auth | Session |
| Lesepfad | `getProcessMailsForUser(session.userId, processId)` |
| RDG | hinter G1 |

Response `200`:

```json
{ "mails": [ { "id", "direction", "subject", "sentAt", "receivedAt", "createdAt" } ] }
```

Fremde/unbekannte `processId` → `404` (der Layer liefert leer; der Endpunkt
unterscheidet nicht zwischen „fremd" und „gibt es nicht"). **Bewusst NICHT
enthalten:** `bodyText`/`bodyHtml`/`headers`/`rawPayload` (Fremd-PII des
Broker-Absenders, Retention-Thema) und `providerMessageId`/Adressfelder.
Ob Kunden Mail-Inhalte einsehen dürfen, ist eine Produkt-/Legal-Entscheidung
(TODO[legal-review]); bis dahin liefert der Vertrag nur Metadaten.

---

## 4. Warteliste — RDG-neutral, einziger Vor-G1-Kandidat

Der einzige Endpunkt, der ggf. **vor** Auth/G1 live geht (Landing-Page sammelt
Interessenten, solange Checkout/Vollmacht nicht existieren).

| | |
|---|---|
| Methode/Pfad | `POST /api/waitlist` |
| Auth | keine |
| RDG | neutral (reine Kontaktdaten-Erfassung mit Einwilligung) |

Request: `email` (string), `consent` (boolean, muss `true` sein — Häkchen
„GoKognito darf mich zum Start per E-Mail informieren"). Response `201`:
`{}` — **immer**, auch bei bereits eingetragener Adresse (kein
E-Mail-Enumeration-Orakel). Fehler: `400` (E-Mail-Format/`consent` fehlt),
`429`.

Anforderungen: Double-Opt-In-Bestätigungsmail über den Customer-Message-Stream;
Speicherung minimal (E-Mail, consent-Zeitstempel, Bestätigungsstatus) in einer
neuen Tabelle `waitlist_signups` — die einzige Schema-Ergänzung, die dieser
Vertrag voraussetzt. Kein Zusammenhang mit `users`.

---

## 5. Checkout & Vollmacht — Platzhalter

**Bewusst nicht ausdetailliert.** Buchung (Stripe), Vollmacht-Erteilung,
Prozess-Erzeugung und alles, was GoKognito *im Namen des Kunden handeln*
lässt, wird **erst nach der RDG-Einschätzung designt** (Gate G1; Grenze wie in
multi-tenant-profile.md § 5). Bis dahin gilt: Die Landing-Page verlinkt keine
Checkout-Endpunkte; „Plan wählen"-CTAs bleiben Platzhalter
(`data-placeholder-link`, siehe `src/content/placeholders.ts`).

---

## Anhang: Übersicht

| Endpunkt | Methode | Auth | RDG |
|---|---|---|---|
| `/api/auth/register` | POST | — | neutral |
| `/api/auth/login` | POST | — | neutral |
| `/api/auth/verify-email` | GET | Token | neutral |
| `/api/auth/logout` | POST | Session | neutral |
| `/api/profile` | GET | Session | neutral |
| `/api/profile` | POST | Session + verifiziert | neutral |
| `/api/profile` | PUT | Session + verifiziert | neutral |
| `/api/profile` | DELETE | Session | neutral |
| `/api/account` | DELETE | Session + Passwort | neutral (Betroffenenrecht) |
| `/api/dashboard/profile` | GET | Session | hinter G1 |
| `/api/dashboard/processes` | GET | Session | hinter G1 |
| `/api/dashboard/processes/{id}/mails` | GET | Session | hinter G1 |
| `/api/waitlist` | POST | — | neutral (Vor-G1-Kandidat) |
| Checkout/Vollmacht | — | — | Platzhalter, Design nach RDG-Einschätzung |
