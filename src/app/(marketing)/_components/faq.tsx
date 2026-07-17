"use client";

// Akkordeon-Verhalten der FAQ. Die <details>-Inhalte kommen serverseitig
// gerendert als children (SEO/No-JS: ohne Skript funktioniert das native
// <details>-Verhalten); dieser Wrapper ersetzt es nach Hydration durch die
// animierte Variante mit Exklusiv-Oeffnung.

import gsap from "gsap";
import { useEffect, useRef } from "react";

export function Faq({ children }: { children: React.ReactNode }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = listRef.current;
    if (!root) {
      return;
    }

    const items = Array.from(root.querySelectorAll<HTMLElement>(".faq__item"));
    const cleanups: (() => void)[] = [];

    const closeItem = (item: HTMLElement) => {
      const answer = item.querySelector(".faq__a");
      item.classList.remove("is-open");
      gsap.to(answer, {
        height: 0,
        duration: 0.55,
        ease: "power3.inOut",
        onComplete: () => item.removeAttribute("open"),
      });
    };

    for (const item of items) {
      const summary = item.querySelector<HTMLElement>(".faq__q");
      const answer = item.querySelector<HTMLElement>(".faq__a");
      if (!summary || !answer) {
        continue;
      }
      gsap.set(answer, { height: 0 });

      const onClick = (e: Event) => {
        e.preventDefault();
        if (item.classList.contains("is-open")) {
          closeItem(item);
          return;
        }
        for (const other of items) {
          if (other !== item && other.classList.contains("is-open")) {
            closeItem(other);
          }
        }
        item.setAttribute("open", "");
        item.classList.add("is-open");
        gsap.set(answer, { height: 0 });
        gsap.to(answer, { height: "auto", duration: 0.65, ease: "power3.inOut" });
      };
      summary.addEventListener("click", onClick);
      cleanups.push(() => summary.removeEventListener("click", onClick));
    }

    return () => {
      for (const dispose of cleanups) {
        dispose();
      }
      for (const item of items) {
        const answer = item.querySelector(".faq__a");
        if (answer) {
          gsap.set(answer, { clearProps: "height" });
        }
        item.classList.remove("is-open");
        item.removeAttribute("open");
      }
    };
  }, []);

  return (
    <div ref={listRef} className="faq__list">
      {children}
    </div>
  );
}
