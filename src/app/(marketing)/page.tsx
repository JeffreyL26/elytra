// GoKognito Landing-Page -- 1:1-Port des statischen Prototyps
// (ELYTRA Website/index.html). Saemtliche Marketing-Copy ist Server-Markup
// und steht ohne JavaScript im HTML; Interaktivitaet liegt in den gezielt
// eingebundenen Client-Components (Nav, HeroScene, ScrollChoreography,
// AkteReveal, Faq, BillingToggle).

import { AkteReveal } from "./_components/akte-reveal";
import { BillingToggle } from "./_components/billing-toggle";
import { Faq } from "./_components/faq";
import { HeroScene } from "./_components/hero-scene";
import { Nav } from "./_components/nav";
import { ScrollChoreography } from "./_components/scroll-choreography";
import { Wordmark } from "@/app/_shared/wordmark";
import { BROKER_COUNT_CLAIM, PLACEHOLDER_HREF, PLANS, PRICE_ANCHOR } from "./_content/placeholders";

const ARROW = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
    <path
      d="M2 8h11M9 3.5 13.5 8 9 12.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function LandingPage() {
  return (
    <>
      {/* Preloader (ScrollChoreography animiert und entfernt ihn) */}
      <div className="preloader" id="preloader" aria-hidden="true">
        <div className="preloader__logo">
          <Wordmark className="wordmark--xl" />
        </div>
        <div className="preloader__line">
          <span className="preloader__line-fill" />
        </div>
      </div>

      {/* Ambient Pointer-Glow (nativer Cursor bleibt sichtbar) */}
      <div className="pointer-glow" id="pointer-glow" aria-hidden="true" />

      {/* Scroll-Fortschritt */}
      <div className="scroll-progress" id="scroll-progress" aria-hidden="true" />

      <Nav />

      <main>
        {/* ============ HERO ============ */}
        <section className="hero" data-theme="dark" id="hero">
          <HeroScene />
          <div className="hero__vignette" aria-hidden="true" />

          <div className="hero__content container">
            <p className="eyebrow hero__eyebrow" data-hero-fade>
              <span className="eyebrow__dot" />
              Automatisierter DSGVO-Löschservice
            </p>
            <h1 className="hero__title" id="hero-title">
              <span className="hero__title-line">Werden Sie unsichtbar</span>
              <span className="hero__title-line">für Datenhändler.</span>
            </h1>
            <p className="hero__sub" data-hero-fade>
              GoKognito setzt Ihr Recht auf Löschung durch: automatisiert, DSGVO-konform und
              dauerhaft. Wir finden Ihre persönlichen Daten bei Data-Brokern und lassen sie
              entfernen. Immer wieder.
            </p>
            <div className="hero__cta" data-hero-fade>
              <a href="#preise" className="btn btn--primary" data-hover data-magnetic>
                <span>Jetzt unsichtbar werden</span>
                {ARROW}
              </a>
              <a href="#funktionsweise" className="btn btn--ghost" data-hover data-magnetic>
                So funktioniert&apos;s
              </a>
            </div>
            <p className="hero__cta-note" data-hero-fade>
              Ab {PRICE_ANCHOR} € im Monat · 14 Tage Geld-zurück-Garantie · In 3 Minuten
              eingerichtet
            </p>
          </div>

          <div className="hero__bottom container" data-hero-fade>
            <div className="hero__scroll-hint">
              <span className="hero__scroll-line" />
              <span>Scrollen</span>
            </div>
            <p className="hero__note">
              Rechtssichere Vollmacht &nbsp;·&nbsp; Monatlich kündbar &nbsp;·&nbsp; Server in der EU
            </p>
          </div>
        </section>

        {/* ============ TRUST STRIP ============ */}
        <section className="trust" data-theme="dark" aria-label="Vertrauensmerkmale">
          <div className="container trust__row">
            <p className="trust__item" data-reveal>
              Über {BROKER_COUNT_CLAIM} Datenhändler im Register
            </p>
            <p className="trust__item" data-reveal>
              Recht auf Löschung, Art. 17 DSGVO
            </p>
            <p className="trust__item" data-reveal>
              Daten verschlüsselt auf EU-Servern
            </p>
            <p className="trust__item" data-reveal>
              Monatlich kündbar, 14 Tage Geld-zurück
            </p>
          </div>
        </section>

        {/* ============ INTRO STATEMENT ============ */}
        <section className="intro section" data-theme="light">
          <div className="container">
            <h2 className="intro__title" data-split>
              Es gibt einen Markt für Ihre Daten. Gefragt wurden Sie&nbsp;nie.
            </h2>
            <div className="intro__row">
              <p className="intro__note" data-reveal>
                Über {BROKER_COUNT_CLAIM} Datenhändler
                <br />
                in unserem Register.
                <br />
                Tendenz steigend.
              </p>
              <p className="intro__text" data-reveal>
                Adresshändler, Personensuchdienste, Marketing-Datenbanken: Ein weit verzweigtes
                Geflecht von Unternehmen sammelt, bündelt und verkauft persönliche Informationen.
                Vollkommen legal, solange niemand widerspricht.{" "}
                <em>GoKognito ist der Widerspruch.</em>
              </p>
            </div>
          </div>
        </section>

        {/* ============ AKTE / REDACTION ============ */}
        <section className="akte-section section" data-theme="light">
          <div className="container">
            <div className="akte-section__layout">
              <div className="akte-section__copy">
                <h2 className="akte-section__title" data-split>
                  Irgendwo liegt eine Akte über&nbsp;Sie.
                </h2>
                <p data-reveal>
                  Sie heißt „Profil&quot;, „Datensatz&quot; oder „Zielgruppen-Segment&quot;. Sie
                  kennt Ihre Anschrift, Ihre Kaufkraft, Ihre Lebensphase. Und sie steht zum Verkauf.
                  Die meisten Menschen erfahren nie, in wie vielen dieser Akten sie geführt werden.
                </p>
                <p data-reveal>
                  Unser Auftrag ist einfach zu beschreiben und mühsam zu erledigen:{" "}
                  <strong>Diese Akte verschwinden zu lassen. Bei jedem einzelnen Händler.</strong>
                </p>
              </div>

              <figure
                className="akte"
                id="akte"
                aria-label="Beispiel eines Datenhändler-Profils, das geschwärzt wird"
              >
                <div className="akte__head">
                  <span className="akte__id">Datensatz № B-2841</span>
                  <span className="akte__tag" id="akte-tag">
                    zum Verkauf angeboten
                  </span>
                </div>
                <dl className="akte__rows">
                  {(
                    [
                      ["Name", "Max Mustermann"],
                      ["Geburtsjahr", "1987"],
                      ["Anschrift", "Musterstraße 12, 10115 Berlin"],
                      ["E-Mail", "m.mustermann@beispiel.de"],
                      ["Kaufkraft", "überdurchschnittlich"],
                      ["Interessen", "Reisen, Finanzen, Fitness"],
                      ["Haushalt", "3 Personen, Eigentum"],
                    ] as const
                  ).map(([label, value]) => (
                    <div className="akte__row" key={label}>
                      <dt>{label}</dt>
                      <dd>
                        <span className="akte__value">
                          {value}
                          <span className="akte__bar" />
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
                <span className="akte__stamp" id="akte-stamp">
                  Gelöscht
                </span>
              </figure>
            </div>
          </div>
          <AkteReveal />
        </section>

        {/* ============ PROZESS / BRIEFE ============ */}
        <section className="work section" data-theme="dark" id="funktionsweise">
          <div className="container">
            <h2 className="work__title" data-split>
              Wir schreiben die Briefe, die niemand gern&nbsp;schreibt.
            </h2>
            <p className="work__sub" data-reveal>
              Und die Nachfassbriefe. Und, wenn es sein muss, die Beschwerden.
            </p>

            <div className="work__layout">
              <div className="work__steps">
                <article className="work__step" data-reveal>
                  <h3>Sie erteilen die Vollmacht.</h3>
                  <p>
                    Digital, in drei Minuten, jederzeit widerrufbar. Ab diesem Moment dürfen wir
                    Ihre Rechte aus der DSGVO in Ihrem Namen geltend machen.
                  </p>
                </article>
                <article className="work__step" data-reveal>
                  <h3>Wir stellen die Löschverlangen.</h3>
                  <p>
                    Juristisch präzise und individuell adressiert, mit gesetzlicher Frist, an jeden
                    relevanten Händler in unserem Register. Was für eine Person hunderte Stunden
                    Schreibarbeit wäre, läuft bei uns im Takt.
                  </p>
                </article>
                <article className="work__step" data-reveal>
                  <h3>Wir lesen jede Antwort.</h3>
                  <p>
                    Bestätigung, Rückfrage, Ausrede: Jede Antwort wird analysiert und klassifiziert.
                    Eindeutige Fälle laufen automatisch weiter, unklare landen bei einem Menschen.
                    Nicht umgekehrt.
                  </p>
                </article>
                <article className="work__step" data-reveal>
                  <h3>Wir bleiben dran.</h3>
                  <p>
                    Frist verstrichen? Wir mahnen. Daten wieder aufgetaucht? Wir fordern erneut.
                    Alle 90 Tage prüfen wir nach, denn gelöschte Daten haben die Angewohnheit,
                    wiederzukommen.
                  </p>
                </article>
              </div>

              <aside className="letter" id="letter" aria-label="Auszug aus einem Löschverlangen">
                <div className="letter__head">
                  <Wordmark className="letter__brand" />
                  <span className="letter__date">Berlin, 12. Juni 2026</span>
                </div>
                <p className="letter__subject">
                  Betreff: Löschung personenbezogener Daten gem.&nbsp;Art.&nbsp;17 DSGVO
                </p>
                <p className="letter__body">
                  Sehr geehrte Damen und Herren,
                  <br />
                  <br />
                  in Vertretung unseres Mandanten (Vollmacht anbei) fordern wir Sie auf, sämtliche
                  zu seiner Person gespeicherten Daten unverzüglich zu löschen, deren Weitergabe zu
                  unterlassen und uns die Löschung innerhalb der gesetzlichen Frist zu bestätigen.
                  <br />
                  <br />
                  Wir weisen darauf hin, dass wir den Vorgang dokumentieren und der zuständigen
                  Aufsichtsbehörde vorlegen werden, sollte eine Reaktion ausbleiben. …
                </p>
                <p className="letter__meta">
                  Az. GK-2026-04517 &nbsp;·&nbsp; Frist: 30 Tage &nbsp;·&nbsp; Zustellung
                  dokumentiert
                </p>
              </aside>
            </div>

            <div className="work__cta" data-reveal>
              <a href="#preise" className="btn btn--primary" data-hover data-magnetic>
                <span>Pläne ansehen</span>
                {ARROW}
              </a>
              <span className="work__cta-note">
                Ab {PRICE_ANCHOR} € im Monat. In drei Minuten eingerichtet.
              </span>
            </div>
          </div>
        </section>

        {/* ============ PREISE ============ */}
        <section className="pricing section" data-theme="light" id="preise">
          <div className="container">
            <div className="pricing__head">
              <h2 className="pricing__title" data-split>
                Der Preis der Unsichtbarkeit.
              </h2>
              <p className="pricing__lead" data-reveal>
                Keine Einrichtungsgebühr. Jederzeit kündbar. 14 Tage Geld-zurück-Garantie.
              </p>
            </div>

            <BillingToggle />

            <div className="pricing__grid">
              <article className="price-card" data-reveal data-tilt>
                <h3 className="price-card__name">{PLANS.basis.name}</h3>
                <p className="price-card__desc">Der Einstieg in ein unsichtbares Leben.</p>
                <p className="price-card__price">
                  <span
                    className="price-card__amount"
                    data-monthly={PLANS.basis.monthly}
                    data-yearly={PLANS.basis.yearlyPerMonth}
                  >
                    {PLANS.basis.monthly}
                  </span>
                  &nbsp;€<span className="price-card__per"> / Monat</span>
                </p>
                <p
                  className="price-card__billing"
                  data-monthly-note="Monatliche Zahlung, jederzeit kündbar"
                  data-yearly-note={PLANS.basis.yearlyNote}
                >
                  Monatliche Zahlung, jederzeit kündbar
                </p>
                <ul className="price-card__list">
                  <li>1 Person</li>
                  <li>Standard-Broker-Register</li>
                  <li>Löschverlangen nach Art. 17 DSGVO</li>
                  <li>Re-Check alle 90 Tage</li>
                  <li>Persönliches Dashboard</li>
                </ul>
                <a
                  href={PLACEHOLDER_HREF}
                  className="btn btn--ghost price-card__btn"
                  data-placeholder-link
                  data-hover
                  data-magnetic
                >
                  Basis wählen
                </a>
              </article>

              <article className="price-card price-card--featured" data-reveal data-tilt>
                <span className="price-card__badge">Meistgewählt</span>
                <h3 className="price-card__name">{PLANS.komplett.name}</h3>
                <p className="price-card__desc">Maximale Abdeckung, maximale Ruhe.</p>
                <p className="price-card__price">
                  <span
                    className="price-card__amount"
                    data-monthly={PLANS.komplett.monthly}
                    data-yearly={PLANS.komplett.yearlyPerMonth}
                  >
                    {PLANS.komplett.monthly}
                  </span>
                  &nbsp;€<span className="price-card__per"> / Monat</span>
                </p>
                <p
                  className="price-card__billing"
                  data-monthly-note="Monatliche Zahlung, jederzeit kündbar"
                  data-yearly-note={PLANS.komplett.yearlyNote}
                >
                  Monatliche Zahlung, jederzeit kündbar
                </p>
                <ul className="price-card__list">
                  <li>1 Person</li>
                  <li>Vollständiges Register inkl. Personensuchdienste</li>
                  <li>Priorisierte Bearbeitung &amp; Eskalation</li>
                  <li>Re-Check alle 90 Tage</li>
                  <li>Unterstützung bei Beschwerden an Aufsichtsbehörden</li>
                </ul>
                <a
                  href={PLACEHOLDER_HREF}
                  className="btn btn--cream price-card__btn"
                  data-placeholder-link
                  data-hover
                  data-magnetic
                >
                  Komplett wählen
                </a>
              </article>

              <article className="price-card price-card--ink" data-reveal data-tilt>
                <h3 className="price-card__name">{PLANS.familie.name}</h3>
                <p className="price-card__desc">Schutz für alle, die Ihnen wichtig sind.</p>
                <p className="price-card__price">
                  <span
                    className="price-card__amount"
                    data-monthly={PLANS.familie.monthly}
                    data-yearly={PLANS.familie.yearlyPerMonth}
                  >
                    {PLANS.familie.monthly}
                  </span>
                  &nbsp;€<span className="price-card__per"> / Monat</span>
                </p>
                <p
                  className="price-card__billing"
                  data-monthly-note="Monatliche Zahlung, jederzeit kündbar"
                  data-yearly-note={PLANS.familie.yearlyNote}
                >
                  Monatliche Zahlung, jederzeit kündbar
                </p>
                <ul className="price-card__list">
                  <li>Bis zu 4 Personen</li>
                  <li>Vollständiges Register inkl. Personensuchdienste</li>
                  <li>Alle Komplett-Leistungen</li>
                  <li>Gemeinsames Familien-Dashboard</li>
                  <li>Ein Vertrag, eine Rechnung</li>
                </ul>
                <a
                  href={PLACEHOLDER_HREF}
                  className="btn btn--ghost price-card__btn"
                  data-placeholder-link
                  data-hover
                  data-magnetic
                >
                  Familie wählen
                </a>
              </article>
            </div>
            <p className="pricing__note" data-reveal>
              Alle Preise inkl. MwSt. · Sie können jederzeit wechseln oder kündigen.
            </p>
          </div>
        </section>

        {/* ============ LEISTUNGEN / BENTO ============ */}
        <section className="features section" data-theme="light">
          <div className="container">
            <h2 className="features__title" data-split>
              Im Abo enthalten.
            </h2>

            <div className="bento">
              <article
                className="tile tile--log bento__item bento__item--wide"
                data-reveal
                data-tilt
              >
                <h3 className="tile__title">Jeder Schritt, protokolliert.</h3>
                <p className="tile__text">
                  Wann welches Verlangen zugestellt wurde, wer wann geantwortet hat, was daraus
                  folgte. Unveränderlich dokumentiert und jederzeit einsehbar.
                </p>
                <div className="log" aria-hidden="true">
                  <p>
                    <span className="log__time">12.06. &nbsp;09:41</span>
                    <span className="log__event">
                      Löschverlangen zugestellt · Personensuchdienst, DE
                    </span>
                  </p>
                  <p>
                    <span className="log__time">14.06. &nbsp;16:02</span>
                    <span className="log__event">Antwort eingegangen · wird geprüft</span>
                  </p>
                  <p>
                    <span className="log__time">14.06. &nbsp;16:03</span>
                    <span className="log__event">Löschung bestätigt · Vorgang abgeschlossen</span>
                  </p>
                  <p>
                    <span className="log__time">12.09. &nbsp;06:00</span>
                    <span className="log__event">Re-Check geplant · automatisch</span>
                  </p>
                </div>
              </article>

              <article
                className="tile tile--dark bento__item bento__item--tall"
                data-reveal
                data-tilt
              >
                <h3 className="tile__title">Ihr Dashboard.</h3>
                <p className="tile__text">
                  Der Status jedes Vorgangs: in Echtzeit, transparent, verständlich.
                </p>
                <div className="dash" aria-hidden="true">
                  <div className="dash__summary">
                    <span className="dash__count">31 von 38 Vorgängen abgeschlossen</span>
                    <div className="dash__bar">
                      <span id="dash-bar-fill" />
                    </div>
                  </div>
                  <div className="dash__row">
                    <div className="dash__info">
                      <span className="dash__name">Personensuchdienst · DE</span>
                      <span className="dash__meta">Anfrage 12.06.2026</span>
                    </div>
                    <span className="pill pill--done">Gelöscht</span>
                  </div>
                  <div className="dash__row">
                    <div className="dash__info">
                      <span className="dash__name">Adresshändler · EU</span>
                      <span className="dash__meta">Antwort wird geprüft</span>
                    </div>
                    <span className="pill pill--progress">In Bearbeitung</span>
                  </div>
                  <div className="dash__row">
                    <div className="dash__info">
                      <span className="dash__name">Marketing-Datenbank · DE</span>
                      <span className="dash__meta">Frist: noch 9 Tage</span>
                    </div>
                    <span className="pill pill--waiting">Frist läuft</span>
                  </div>
                  <div className="dash__row">
                    <div className="dash__info">
                      <span className="dash__name">Auskunftei · DE</span>
                      <span className="dash__meta">Re-Check geplant</span>
                    </div>
                    <span className="pill pill--done">Gelöscht</span>
                  </div>
                  <p className="dash__foot">
                    <span className="dash__live" />
                    Live · zuletzt aktualisiert vor 2 Minuten
                  </p>
                </div>
              </article>

              <article className="tile tile--light bento__item" data-reveal data-tilt>
                <p className="tile__big-num">
                  90<span>&nbsp;Tage</span>
                </p>
                <p className="tile__text">
                  Dann prüfen wir alles erneut und fordern nach, wo Ihre Daten wieder aufgetaucht
                  sind. Unsichtbar bleiben ist ein Abo, kein Projekt.
                </p>
              </article>

              <article className="tile tile--light bento__item" data-reveal data-tilt>
                <h3 className="tile__title">
                  Gelesen von Maschinen.
                  <br />
                  Entschieden von Menschen.
                </h3>
                <p className="tile__text">
                  Antworten werden maschinell klassifiziert. Sobald etwas nicht eindeutig ist,
                  entscheidet keine Statistik, sondern ein Mensch mit Sachverstand.
                </p>
              </article>

              <article
                className="tile tile--light bento__item bento__item--full"
                data-reveal
                data-tilt
              >
                <p className="tile__statement">
                  Ihre Daten liegen <em>verschlüsselt</em> auf Servern in der EU. Sie werden nicht
                  ausgewertet, nicht geteilt, nicht verkauft. Kündigen Sie, löschen wir auch bei
                  uns. Versprochen ist versprochen.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ============ GESETZ ============ */}
        <section className="law section" data-theme="dark">
          <div className="container container--narrow">
            <blockquote className="law__quote" data-reveal>
              <p>
                „Die betroffene Person hat das Recht, von dem Verantwortlichen zu verlangen, dass
                sie betreffende personenbezogene Daten unverzüglich gelöscht werden …&quot;
              </p>
              <cite>Artikel 17 Absatz 1, Datenschutz-Grundverordnung</cite>
            </blockquote>
            <p className="law__more" data-reveal>
              Ebenfalls auf unserer Seite: das Auskunftsrecht (Art. 15), das Widerspruchsrecht (Art.
              21) und die Monatsfrist, binnen derer reagiert werden muss (Art. 12). Wir zitieren sie
              täglich.
            </p>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <section className="faq section" data-theme="dark">
          <div className="container">
            <div className="faq__layout">
              <div className="faq__intro">
                <h2 className="faq__title" data-split>
                  Bleiben Fragen?
                </h2>
                <p className="faq__lead" data-reveal>
                  Hier die häufigsten. Für alles andere: Schreiben Sie uns. Es antworten Menschen,
                  keine Warteschleifen.
                </p>
                <a
                  href={PLACEHOLDER_HREF}
                  className="btn btn--ghost btn--on-dark"
                  data-placeholder-link
                  data-reveal
                  data-hover
                  data-magnetic
                >
                  Kontakt aufnehmen
                </a>
              </div>

              <Faq>
                <details className="faq__item" data-reveal>
                  <summary className="faq__q" data-hover>
                    Was ist ein Data-Broker?
                    <span className="faq__icon" />
                  </summary>
                  <div className="faq__a">
                    <p>
                      Data-Broker sind Unternehmen, deren Geschäftsmodell das Sammeln, Anreichern
                      und Weiterverkaufen personenbezogener Daten ist: Adresshändler,
                      Personensuchdienste oder Marketing-Datenbanken etwa. Die meisten Menschen
                      wissen nicht, in wie vielen dieser Datenbanken sie geführt werden.
                    </p>
                  </div>
                </details>
                <details className="faq__item" data-reveal>
                  <summary className="faq__q" data-hover>
                    Kann ich jederzeit kündigen?
                    <span className="faq__icon" />
                  </summary>
                  <div className="faq__a">
                    <p>
                      Ja. Monatliche Pläne enden zum Abrechnungsmonat, jährliche zum Laufzeitende,
                      ohne Kündigungsfrist-Tricks. Zusätzlich gilt eine 14-Tage-Geld-zurück-Garantie
                      ab Kauf: Wenn GoKognito nichts für Sie ist, erstatten wir den vollen Betrag.
                      Ihre bei uns hinterlegten Daten löschen wir nach der Kündigung ebenfalls.
                    </p>
                  </div>
                </details>
                <details className="faq__item" data-reveal>
                  <summary className="faq__q" data-hover>
                    Wie kann GoKognito in meinem Namen handeln?
                    <span className="faq__icon" />
                  </summary>
                  <div className="faq__a">
                    <p>
                      Bei der Registrierung erteilen Sie uns digital eine Vertretungs-Vollmacht.
                      Damit sind wir berechtigt, Ihre Rechte aus der DSGVO gegenüber Data-Brokern
                      geltend zu machen, insbesondere das Recht auf Löschung nach Art. 17. Die
                      Vollmacht können Sie jederzeit widerrufen.
                    </p>
                  </div>
                </details>
                <details className="faq__item" data-reveal>
                  <summary className="faq__q" data-hover>
                    Wie lange dauert es, bis meine Daten gelöscht sind?
                    <span className="faq__icon" />
                  </summary>
                  <div className="faq__a">
                    <p>
                      Unternehmen müssen nach Art. 12 DSGVO grundsätzlich binnen eines Monats
                      reagieren. Viele Broker antworten deutlich schneller. Erste Löschbestätigungen
                      treffen typischerweise innerhalb weniger Tage bis Wochen ein. Den Fortschritt
                      sehen Sie live in Ihrem Dashboard.
                    </p>
                  </div>
                </details>
                <details className="faq__item" data-reveal>
                  <summary className="faq__q" data-hover>
                    Was passiert, wenn ein Broker nicht reagiert?
                    <span className="faq__icon" />
                  </summary>
                  <div className="faq__a">
                    <p>
                      Dann haken wir nach, automatisch und mit Verweis auf die verstrichene Frist.
                      Bleibt der Broker weiterhin untätig, unterstützen wir Sie im Komplett- und
                      Familien-Plan dabei, eine Beschwerde bei der zuständigen
                      Datenschutz-Aufsichtsbehörde einzureichen.
                    </p>
                  </div>
                </details>
                <details className="faq__item" data-reveal>
                  <summary className="faq__q" data-hover>
                    Was macht GoKognito mit meinen Daten?
                    <span className="faq__icon" />
                  </summary>
                  <div className="faq__a">
                    <p>
                      Nur das Nötigste: Wir verwenden Ihre Angaben ausschließlich, um Ihre
                      Löschansprüche durchzusetzen. Ihre Daten liegen verschlüsselt auf Servern in
                      der EU, werden niemals verkauft und niemals zu Werbezwecken genutzt. Kündigen
                      Sie, löschen wir auch bei uns.
                    </p>
                  </div>
                </details>
              </Faq>
            </div>
          </div>
        </section>

        {/* ============ CTA ============ */}
        <section className="cta" data-theme="dark">
          <div className="cta__keyhole" aria-hidden="true">
            <svg viewBox="0 0 200 300" fill="none" aria-hidden="true">
              <circle cx="100" cy="100" r="62" stroke="currentColor" strokeWidth="1" />
              <path d="M74 268 L90 152 H110 L126 268 Z" stroke="currentColor" strokeWidth="1" />
            </svg>
          </div>
          <div className="container cta__inner">
            <h2 className="cta__title" data-split>
              Gehen Sie inkognito.
            </h2>
            <p className="cta__sub" data-reveal>
              In drei Minuten eingerichtet. Ab dann arbeiten wir, und Sie verschwinden Stück für
              Stück von den Listen der Datenhändler.
            </p>
            <div className="cta__actions" data-reveal>
              <a href="#preise" className="btn btn--primary btn--large" data-hover data-magnetic>
                <span>Jetzt starten</span>
                {ARROW}
              </a>
              <span className="cta__note">
                Ab {PRICE_ANCHOR} € im Monat · Keine Einrichtungsgebühr · 14 Tage Geld-zurück
              </span>
            </div>
          </div>
        </section>
      </main>

      {/* ============ FOOTER ============ */}
      <footer className="footer" data-theme="dark">
        <div className="container">
          <div className="footer__top">
            <div className="footer__brand">
              <span role="img" aria-label="GoKognito">
                <Wordmark className="wordmark--footer" />
              </span>
              <p className="footer__tagline">
                Ihr Recht auf Löschung.
                <br />
                Automatisiert durchgesetzt.
              </p>
            </div>
            <div className="footer__cols">
              {(
                [
                  ["Produkt", ["Leistungen", "Funktionsweise", "Preise", "Dashboard"]],
                  ["Unternehmen", ["Über uns", "Kontakt", "Presse", "Karriere"]],
                  ["Rechtliches", ["Impressum", "Datenschutz", "AGB", "Widerruf"]],
                ] as const
              ).map(([title, links]) => (
                <div className="footer__col" key={title}>
                  <p className="footer__col-title">{title}</p>
                  {links.map((label) => (
                    <a key={label} href={PLACEHOLDER_HREF} data-placeholder-link data-hover>
                      {label}
                    </a>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="footer__bottom">
            <p>© 2026 GoKognito. Alle Rechte vorbehalten.</p>
            <p className="footer__made">
              Privatsphäre ist kein Zustand. Sie ist eine Entscheidung.
            </p>
          </div>
        </div>
      </footer>

      {/* Sticky Mobile-CTA (erscheint nach dem Hero, weicht Preisen/CTA aus) */}
      <div className="mobile-cta" id="mobile-cta" aria-hidden="true">
        <a href="#preise" className="btn btn--primary">
          <span>Pläne ansehen · ab {PRICE_ANCHOR} €</span>
          {ARROW}
        </a>
      </div>

      <ScrollChoreography />
    </>
  );
}
