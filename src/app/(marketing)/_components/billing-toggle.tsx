"use client";

// Monatlich/Jaehrlich-Umschalter der Preissektion. Die Preiskarten selbst sind
// Server-Markup (Monatspreise stehen ohne JS im HTML); dieser Toggle
// aktualisiert die per data-Attribut hinterlegten Werte im DOM -- exakt das
// Verhalten des statischen Prototyps.

import gsap from "gsap";
import { useEffect, useRef, useState } from "react";

type BillingMode = "monthly" | "yearly";

export function BillingToggle() {
  const [mode, setMode] = useState<BillingMode>("monthly");
  const mounted = useRef(false);

  useEffect(() => {
    // Initial steht der Monatspreis schon im Server-HTML -- nichts zu tun.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    for (const el of document.querySelectorAll<HTMLElement>(".price-card__amount")) {
      const next = el.dataset[mode];
      if (!next || el.textContent === next) {
        continue;
      }
      if (reduceMotion) {
        el.textContent = next;
        continue;
      }
      gsap
        .timeline()
        .to(el, { y: -10, autoAlpha: 0, duration: 0.18, ease: "power2.in" })
        .add(() => {
          el.textContent = next;
        })
        .fromTo(el, { y: 12 }, { y: 0, autoAlpha: 1, duration: 0.3, ease: "power3.out" });
    }
    for (const el of document.querySelectorAll<HTMLElement>(".price-card__billing")) {
      const note = mode === "yearly" ? el.dataset.yearlyNote : el.dataset.monthlyNote;
      if (note) {
        el.textContent = note;
      }
    }
  }, [mode]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: fieldset braechte UA-Styles mit; div+role="group" ist valides WAI-ARIA
    <div className="billing-toggle" role="group" aria-label="Abrechnungszeitraum" data-reveal>
      <button
        type="button"
        className={mode === "monthly" ? "billing-toggle__btn is-active" : "billing-toggle__btn"}
        aria-pressed={mode === "monthly"}
        onClick={() => setMode("monthly")}
      >
        Monatlich
      </button>
      <button
        type="button"
        className={mode === "yearly" ? "billing-toggle__btn is-active" : "billing-toggle__btn"}
        aria-pressed={mode === "yearly"}
        onClick={() => setMode("yearly")}
      >
        Jährlich <span className="billing-toggle__save">2 Monate geschenkt</span>
      </button>
    </div>
  );
}
