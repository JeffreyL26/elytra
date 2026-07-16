# Spec: Multi-Tenant-Profilmodell (RDG-neutraler Teil)

**Stand 14.07.2026 · Ablage-Vorschlag: `docs/specs/multi-tenant-profile.md`**

## Ausgangsbefund (wichtig, ändert den Zuschnitt)

Das Datenmodell ist **bereits mehrmandantenfähig**. Der Code kennt keine „Single-User"-Annahme im Schema:

- `users` (id, email, emailVerifiedAt) — beliebig viele Zeilen möglich.
- `customer_profiles` — 1:1 an `users` (`userId` unique, `onDelete: cascade`), hält firstName/lastName/emailAddresses/phoneNumbers/postalAddresses/dateOfBirth.
- `opt_out_processes` — n pro User, unique auf `(userId, brokerId)`; `send-opt-out-mail.ts` liest das Profil bereits über `customerProfiles.userId = proc.userId`.

**Es fehlt kein Modell-Umbau.** Es fehlt genau eines: der Weg, wie ein *anderer Mensch als du* zu einem `user` + `customer_profile` kommt. Aktuell gibt es dafür nur `seed-self-profile.ts`, das aus `SELF_*`-Env genau ein Profil (deines) schreibt.

Diese Spec beschreibt die **RDG-neutrale Schicht**: Konto + Profil + Datenverwaltung. Sie hält bewusst an der Grenze zur Vertretung an (siehe § 5).

## 1. Was RDG-neutral ist (jetzt baubar)

Ein Mensch braucht — unabhängig davon, ob wir am Ende für ihn handeln dürfen — immer:

1. ein **Konto** (E-Mail + Passwort, verifizierte E-Mail),
2. ein **Profil** mit seinen Identifikationsdaten (die Daten, nach denen Broker suchen),
3. die Möglichkeit, diese Daten **einzusehen, zu ändern, zu löschen** (Selbstbestimmung — das ist bei einem Datenschutzdienst nicht optional, sondern Kern der Glaubwürdigkeit),
4. **Mandantentrennung** auf jeder Leseoperation (User A darf nie Prozesse/Profil von User B sehen).

Nichts davon berührt die Frage, ob wir *im Namen* des Kunden Anfragen versenden dürfen. Es ist reine Konto-/Datenverwaltung.

## 2. Was zu bauen ist

### 2.1 Auth (E-Mail + Passwort)
- Registrierung: E-Mail + Passwort. Passwort-Policy aus Lastenheft FPW-3.2.1: ≥ 12 Zeichen, Groß-/Kleinbuchstabe, Zahl, Sonderzeichen. Serverseitig erzwingen, nicht nur im Frontend.
- E-Mail-Verifizierung: Token-Mail über den **Customer-Message-Stream** (nicht den Broker-Stream — Reputationstrennung). `users.emailVerifiedAt` setzen. Bis dahin kein Profil-Anlegen/kein Versand.
- Passwort-Hashing: argon2id oder bcrypt. Kein Eigenbau.
- Empfehlung Bibliothek: **Better Auth** (Drizzle-Adapter, passt zum Stack) — hält Sessions, Verifizierung, Reset ab. Alternative Auth.js. Entscheidung bewusst offen; die Spec setzt nur E-Mail+Passwort+Verifizierung voraus.

### 2.2 Profil-Verwaltung (self-service, ersetzt den Env-Weg)
- CRUD auf `customer_profiles` für den **eingeloggten** User — immer geankert an `session.userId`, nie an einer ID aus dem Request-Body.
- Dieselbe Struktur wie heute: firstName/lastName, emailAddresses[], phoneNumbers[], postalAddresses[], dateOfBirth.
- **Validierung** an einer Stelle (Zod-Schema), von API und Seed geteilt — damit ein self-service angelegtes Profil dieselben Invarianten erfüllt wie das Env-Profil (mindestens: eine E-Mail, ein vollständiger PostalAddress, Name).
- `readSelfProfileEnv()` + `seed-self-profile.ts` bleiben als **Dev-/Test-Werkzeug** erhalten (dein eigener Testlauf), werden aber nicht mehr der einzige Schreibweg.

### 2.3 Mandantentrennung (die eine Sache, die man nicht verbocken darf)
- **Jede** Query, die Profil/Prozesse/Mails liest, filtert zwingend auf `session.userId`. Kein Endpunkt akzeptiert eine `userId` aus dem Request.
- Ein zentraler Daten-Zugriffs-Layer (z. B. `getProcessesForUser(session.userId)`) statt verstreuter `db.select()`-Aufrufe in Routen — damit die Trennung an einer prüfbaren Stelle sitzt.
- Test-Invariante: User A ruft Ressource von User B ab → 404 (nicht 403; Existenz nicht verraten).

### 2.4 Konto-Löschung (DSGVO an uns selbst)
- `onDelete: cascade` ist im Schema bereits gesetzt — User löschen räumt Profil + Prozesse ab. Es fehlt der **Auslöser**: ein Self-Service-„Konto löschen", das genau das tut, plus Behandlung der `process_mails` (die hängen an Prozessen, nicht am User — Cascade-Pfad prüfen!).
- Das ist der Prozess, der später auch Betroffenenanfragen *gegen GoKognito* bedient (Roadmap Phase D). Jetzt schlank, aber vorhanden.

## 3. Was sich am bestehenden Code ändert

- `send-opt-out-mail.ts`: **nichts** — liest schon pro `userId`. (Das ist der Beweis, dass das Modell trägt.)
- `opt_out_processes` Unique-Constraint `(userId, brokerId)`: bleibt vorerst. Kollidiert mit Recurring (3b.8) — aber das ist eine separate, bereits vermerkte Entscheidung, nicht Teil dieser Spec.
- Neuer Daten-Zugriffs-Layer als Pflichteinstieg für alle User-gebundenen Reads.

## 4. Reihenfolge (Vorschlag)

1. Zod-Profil-Schema extrahieren (aus dem, was `seed-self-profile.ts` implizit validiert) → geteilt von Seed + künftiger API.
2. Auth-Bibliothek einziehen, Registrierung + Verifizierung + Session (noch ohne UI, testbar über den Server).
3. Daten-Zugriffs-Layer `*ForUser(userId)` + Mandantentrennungs-Tests.
4. Profil-CRUD-Endpunkte (server-seitig, an Session geankert).
5. Konto-Löschung.

Jeder Schritt ist für sich testbar und pusht grün. Kein Schritt braucht den Anwalt.

## 5. HARTE GRENZE — hier hält die Spec an (RDG-abhängig)

Alles Folgende wird **nicht** Teil dieser Arbeit, bis die RDG-Einschätzung vorliegt (Gate G1):

- **Vollmacht-Flow** (Erteilung, Speicherung, Nachweis, Widerruf).
- **`isSelfRequest = false`** in Produktion — der Vertretungs-Pfad, der die „im Auftrag und in Vollmacht von …"-Templates auslöst.
- **Automatischer Versand für fremde User** — solange G1 offen ist, versendet der Trigger nur für dein Self-Profil.
- Alles, was den Kunden gegenüber Brokern *vertritt*.

Das Konto-/Profilmodell aus dieser Spec darf gebaut und getestet werden; es erzeugt für fremde User **nur Datensätze, keine Aussendung**. Der Übergang von „Profil existiert" zu „wir handeln für diese Person" bleibt hinter dem Gate.

**Warum die Grenze genau hier verläuft:** Ein Konto anlegen und Daten verwalten ist Datenverarbeitung mit Einwilligung — unstrittig. Im fremden Namen rechtsverbindliche Anfragen versenden ist der Akt, an dem die RDG-Frage hängt. Die Spec baut alles bis zur Grenze und keinen Schritt darüber.

## 6. Test-Muster (damit der Kern nicht driftet)

- Registrierung mit schwachem Passwort → abgelehnt (Policy serverseitig).
- Unverifizierte E-Mail → kein Profil-Schreibzugriff.
- User A liest Profil/Prozess/Mail von User B → 404.
- Profil-Validierung: API-angelegtes Profil erfüllt dieselben Zod-Invarianten wie das Env-Seed-Profil.
- Konto-Löschung → Profil + Prozesse + Mails weg (Cascade verifiziert).
- Bestehende Self-Request-Pipeline läuft unverändert weiter (Regressions-Guard).
