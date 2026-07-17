"use client";

// Navigation + Mobile-Menu. Scroll-Zustand (is-scrolled/is-light) setzt die
// ScrollChoreography per Klasse auf #nav; hier lebt nur der Burger-State.
//
// Platzhalter-Links: alle Menuepunkte zeigen auf kuenftige Unterseiten und
// tragen href="#" + data-placeholder-link (Konvention siehe
// ../_content/placeholders.ts). Funktionale Anker (#preise) sind echte CTAs.

import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import { PLACEHOLDER_HREF, PRICE_ANCHOR } from "../_content/placeholders";
import { getLenis } from "./runtime";
import { Wordmark } from "@/app/_shared/wordmark";

const NAV_ITEMS = ["Leistungen", "Funktionsweise", "Preise", "Über uns", "Kontakt"];

export function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Anker-Klicks (ScrollChoreography) schliessen ein offenes Mobile-Menu
  useEffect(() => {
    const close = () => setMenuOpen(false);
    document.addEventListener("gokognito:close-mobile-menu", close);
    return () => document.removeEventListener("gokognito:close-mobile-menu", close);
  }, []);

  // Lenis pausiert, solange das Menu offen ist; Link-Stagger beim Oeffnen
  useEffect(() => {
    const lenis = getLenis();
    if (menuOpen) {
      lenis?.stop();
      const links = menuRef.current?.querySelectorAll(".mobile-menu__link");
      if (links && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.from(links, {
          y: 40,
          autoAlpha: 0,
          stagger: 0.06,
          duration: 0.7,
          ease: "power3.out",
          delay: 0.1,
        });
      }
    } else {
      lenis?.start();
    }
    return () => {
      lenis?.start();
    };
  }, [menuOpen]);

  return (
    <>
      <header className="nav" id="nav">
        <div className="nav__inner">
          <a
            href={PLACEHOLDER_HREF}
            className="nav__logo"
            aria-label="GoKognito, Startseite"
            data-placeholder-link
            data-hover
          >
            <Wordmark />
          </a>
          <nav className="nav__links" aria-label="Hauptnavigation">
            {NAV_ITEMS.map((label) => (
              <a
                key={label}
                href={PLACEHOLDER_HREF}
                className="nav__link"
                data-placeholder-link
                data-hover
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="nav__actions">
            <a href={PLACEHOLDER_HREF} className="nav__login" data-placeholder-link data-hover>
              Anmelden
            </a>
            <a href="#preise" className="btn btn--small btn--solid" data-hover data-magnetic>
              Jetzt starten
            </a>
          </div>
          <button
            type="button"
            className={menuOpen ? "nav__burger is-open" : "nav__burger"}
            id="nav-burger"
            aria-label={menuOpen ? "Menü schließen" : "Menü öffnen"}
            aria-expanded={menuOpen}
            data-hover
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
          </button>
        </div>
      </header>

      <div
        ref={menuRef}
        className={menuOpen ? "mobile-menu is-open" : "mobile-menu"}
        id="mobile-menu"
        aria-hidden={!menuOpen}
      >
        <nav className="mobile-menu__links">
          {NAV_ITEMS.map((label) => (
            <a
              key={label}
              href={PLACEHOLDER_HREF}
              className="mobile-menu__link"
              data-placeholder-link
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="mobile-menu__footer">
          <a href="#preise" className="btn btn--solid">
            Jetzt starten · ab {PRICE_ANCHOR} €
          </a>
          <a href={PLACEHOLDER_HREF} className="mobile-menu__login" data-placeholder-link>
            Anmelden
          </a>
        </div>
      </div>
    </>
  );
}
