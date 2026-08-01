# Broker-Runde 01.08.2026 — erste Runde im tokenized-Modus (OFFEN)

Erste echte Runde, bei der die **From-Adresse den Prozess-Token trägt**
(`MAIL_BROKER_FROM_MODE=tokenized`, siehe `src/lib/mail/broker-from.ts`).
Alle vier Vorgänge sind **Self-Requests** — Gate G1 (Fremdvertretung) bleibt
unberührt.

**Status: offen.** Fristende für alle vier: **01.09.2026**
(ein Monat nach Zugang, Art. 12 Abs. 3 DSGVO).

## Zweck der Runde

1. **Zustellbarkeit des neuen Absenders** bei echten Firmen-Mailservern prüfen.
   Bewiesen war bis dahin nur Gmail (Loopback-Test 01.08.), nicht
   Unternehmens-Infrastruktur mit strengen Filtern.
2. **Klassifikations-Empirie** sammeln.
3. Herausfinden, **welche Broker postalisch statt per Mail antworten**.

## Versand

| Broker | Empfänger | Token | Prozess-ID | Postmark-MessageId |
|---|---|---|---|---|
| sovendus | `service@sovendus.com` | `mux1ia9b4xrwrf2p` | `qphrtmi0s31ykmqaho8d1eeo` | `fcef3ddc-87bf-4d44-9ba7-d9519292cf11` |
| kaspr | `privacy@kaspr.io` | `dg9h0o1jim8xixk9` | `fc4n43p6bb5blarg3g385ulk` | `25df2624-3748-44a0-bcde-8be64c4aea26` |
| da-dastelefonbuch | `datenschutz@dtme.de` | `p24fafyb5xotclfg` | `worrqx5xs3cqshbrl30qct8i` | `5989e268-c9b2-43ed-b175-31c54845efd5` |
| da-meinestadt-de | `datenschutz@meinestadt.de` | `vqbmjumy2lqx9rwk` | `zqndi70gkhcyivosjpzmaspk` | `bd8363ab-1d06-4643-bc9c-716e0afe8deb` |

Absender jeweils `Jeffrey Lehmann <proc-<TOKEN>@reply.jba-team.com>`, kein
Reply-To (Token steckt in der From-Adresse). Sprache: sovendus/dastelefonbuch/
meinestadt DE, kaspr EN.

Kein Bounce, kein Deferred/Blocked beim Versand — Postmark hat alle vier
angenommen.

## Bisherige Beobachtungen

### sovendus — Eingangsbestätigung (in_progress)

Antwort binnen Minuten, `matchStage 1` (Token aus der To-Adresse),
klassifiziert als `in_progress`.

Zwei Befunde:

- **Erster Zustellbeleg außerhalb von Gmail.** Der Mailserver von Sovendus hat
  die tokenisierte From-Adresse angenommen *und* darauf geantwortet. Damit ist
  Zweck (1) der Runde für mindestens einen echten Firmen-Mailserver erfüllt.
- **Die Adressentscheidung war richtig.** Geantwortet hat `service@sovendus.com`
  — die Adresse aus Policy und Impressum. Die Alternative
  `data-protection@sovendus.com` (nur bei datenanfragen.de dokumentiert) wurde
  nicht gebraucht.

Inhaltlich ist es ein **Autoresponder ohne Sachaussage** („Gerne helfen wir
Ihnen weiter […] Aufgrund von erhöhtem Anfragevolumen kann es derzeit zu
Verzögerungen kommen"). Derselbe Fall wie die ABIS-Fixture
(`src/lib/llm/__fixtures__/abis-ticket-ack.ts`): sieht wie Fortschritt aus, ist
keiner. `in_progress` kennt keine Frist — der Vorgang wird nach
`ATTENTION_STALE_DAYS` (14 Tage) in ELYTRAs Aufmerksamkeitsliste als
`stale_in_progress` auftauchen. **Das ist der erwartete Weg, nicht ein Fehler.**

### kaspr, da-dastelefonbuch, da-meinestadt-de

Noch keine Reaktion (Stand Versandtag).

---

## Auswertungsrahmen — DREI Fälle, nicht zwei

Beim Dokumentieren der Ergebnisse **unbedingt** zwischen drei Ausgängen
unterscheiden. Die naheliegende Zweiteilung („geantwortet / nicht geantwortet")
wirft (b) und (c) zusammen und würde zu einer falschen Portfolio-Entscheidung
führen.

### (a) Antwort per E-Mail

Die Pipeline verarbeitet sie normal: Inbound-Webhook → Token-Matching →
LLM-Klassifikation → Statusübergang. Kategorie wie üblich (`success`,
`no_data_held`, `blacklisted`, `in_progress`, `rejected`, `unrelated`).

**Kein Handlungsbedarf**, außer bei `manual_review`.

### (b) Antwort per BRIEF an die Kundenanschrift

**Ausschlusskandidat** nach dem Portfolio-Kriterium: nicht automatisierbar und
nicht verifizierbar — der Brief geht an die Anschrift der betroffenen Person,
der Dienst sieht ihn nie. Genau so haben ABIS (21.07.) und Deutsche Post Adress
(22.07.) geantwortet; beide wurden daraufhin am 01.08. aus dem Portfolio
entfernt.

Vorgehen: Vorgang **manuell über ELYTRA abschließen** (`/elytra` →
Vorgang öffnen → *Manuell abschließen*), Erkenntnisquelle `self_document`
(bei Self-Requests sind wir selbst Adressat) bzw. `customer_report`
(bei Kundenvorgängen). Anschließend Broker aus `real-brokers-data.ts` entfernen
und im Sektions-Kommentar vermerken.

### (c) Keine Reaktion bis Fristende

→ `no_response`. **KEIN Ausschlussgrund.** Der Broker bleibt im Portfolio.

Schweigen ist kein Beleg dafür, dass der Kanal nicht funktioniert — es kann
Ignoranz sein, aber genauso **veraltete Kontaktdaten** (siehe Quellenvorbehalt
am Sektions-Kommentar der DE-Welle: bei Sovendus war die von datenanfragen.de
übernommene Postanschrift falsch). Vor jeder Eskalation deshalb erst die
Adresse gegen die **aktuelle** Policy/das Impressum des Brokers prüfen, nicht
gegen die Quelle.

Fristüberschreitung ist ein **eigenes Thema** (Eskalationslogik, Phase 3c) und
keine Portfolio-Entscheidung.

---

## Nachtrag beim Abschluss der Runde

Wenn alle vier Vorgänge einen Endzustand erreicht haben, hier ergänzen:

- Antwortzeiten je Broker
- Verteilung über die drei Fälle (a)/(b)/(c)
- Ob die Klassifikation in allen Fällen getroffen hat (Kalibrierungsbedarf?)
- Ob ein Broker die tokenisierte Absenderadresse **abgelehnt** hat (Bounce,
  Spam-Ordner, „Absender unbekannt") — das wäre der wichtigste Befund für den
  tokenized-Modus und stünde einer breiten Runde entgegen
