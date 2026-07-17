"use client";

// Schwaerzungs-Choreographie der "Akte": Balken laufen zeilenweise ueber die
// Werte, der Verkaufs-Tag dimmt, der "Geloescht"-Stempel landet, die Karte
// ruckt kurz. Arbeitet auf dem serverseitig gerenderten #akte-Markup.

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect } from "react";

export function AkteReveal() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // CSS zeigt in diesem Fall den Endzustand (Balken sichtbar, Stempel da)
      return;
    }
    const akte = document.getElementById("akte");
    if (!akte) {
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: akte, start: "top 68%", once: true },
      });
      tl.to(akte.querySelectorAll(".akte__bar"), {
        scaleX: 1,
        duration: 0.45,
        stagger: 0.22,
        ease: "power2.inOut",
      });
      tl.to("#akte-tag", { opacity: 0.25, duration: 0.4 }, "-=0.2");
      tl.fromTo(
        "#akte-stamp",
        { opacity: 0, scale: 2.4, rotation: -20 },
        { opacity: 1, scale: 1, rotation: -8, duration: 0.5, ease: "power4.in" },
      );
      tl.to(akte, { x: 3, y: -2, duration: 0.07, yoyo: true, repeat: 3, ease: "none" }, "-=0.05");
    });

    return () => ctx.revert();
  }, []);

  return null;
}
