"use client";

// Globale Scroll- und Motion-Choreographie der Landing-Page. 1:1-Port von
// ELYTRA Website/js/main.js (ohne FAQ/Akte/Billing-Toggle/Nav-Burger --
// die leben in eigenen Client-Components).
//
// Rendert nichts; arbeitet ueber Selektoren auf dem serverseitig gerenderten
// Markup. Alles laeuft in einem Effect mit vollstaendigem Cleanup
// (gsap.context.revert inkl. aller ScrollTrigger, Lenis.destroy, Listener,
// Split-Text-Restore) und ueberlebt so den StrictMode-Doppel-Mount.

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { useEffect } from "react";
import { onHeroUniforms, setLenis } from "./runtime";

// Woerter -> Buchstaben-Spans fuer die maskierten Reveals. Liefert die Chars
// plus eine Restore-Funktion (StrictMode/Unmount setzt den Originaltext
// zurueck, sonst wuerde der zweite Lauf bereits gesplittete Spans splitten).
function splitToChars(el: HTMLElement): { chars: HTMLElement[]; restore: () => void } {
  const original = el.textContent ?? "";
  el.textContent = "";
  const frag = document.createDocumentFragment();
  for (const token of original.split(/(\s+)/)) {
    if (/^\s+$/.test(token)) {
      frag.appendChild(document.createTextNode(" "));
      continue;
    }
    const word = document.createElement("span");
    word.className = "split-word";
    for (const ch of token) {
      const c = document.createElement("span");
      c.className = "split-char";
      c.textContent = ch;
      word.appendChild(c);
    }
    frag.appendChild(word);
  }
  el.appendChild(frag);
  return {
    chars: Array.from(el.querySelectorAll<HTMLElement>(".split-char")),
    restore: () => {
      el.textContent = original;
    },
  };
}

export function ScrollChoreography() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;

    const teardowns: (() => void)[] = [];
    const listen = (
      target: Window | Document | Element,
      type: string,
      handler: EventListenerOrEventListenerObject,
    ) => {
      target.addEventListener(type, handler);
      teardowns.push(() => target.removeEventListener(type, handler));
    };

    /* ---------- Smooth Scroll (Lenis) am GSAP-Ticker ---------- */
    let lenis: Lenis | null = null;
    if (!reduceMotion) {
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      setLenis(lenis);
      lenis.on("scroll", ScrollTrigger.update);
      const raf = (time: number) => lenis?.raf(time * 1000);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
      teardowns.push(() => {
        gsap.ticker.remove(raf);
        lenis?.destroy();
        setLenis(null);
        lenis = null;
      });
    }

    const ctx = gsap.context(() => {
      /* ---------- Preloader -> Hero-Intro ---------- */
      const preloader = document.getElementById("preloader");
      const heroIntro = () => {
        const tl = gsap.timeline({ defaults: { ease: "power4.out" } });

        // Partikel formen das Schluesselloch, sobald die Szene bereit ist
        tl.add(() => {
          const off = onHeroUniforms((u) => {
            gsap.to(u.uProgress, { value: 1, duration: 3.2, ease: "expo.out" });
          });
          teardowns.push(off);
        }, 0);

        for (const [i, line] of Array.from(
          document.querySelectorAll<HTMLElement>(".hero__title-line"),
        ).entries()) {
          const { chars, restore } = splitToChars(line);
          teardowns.push(restore);
          tl.from(
            chars,
            { yPercent: 140, duration: 1.1, stagger: 0.022, ease: "power4.out" },
            0.15 + i * 0.14,
          );
        }

        tl.from(
          "[data-hero-fade]",
          { y: 28, autoAlpha: 0, duration: 1, stagger: 0.12, ease: "power3.out" },
          0.75,
        );
        return tl;
      };

      if (reduceMotion) {
        preloader?.remove();
        const off = onHeroUniforms((u) => {
          u.uProgress.value = 1;
        });
        teardowns.push(off);
      } else if (preloader) {
        gsap
          .timeline()
          .from(".preloader__logo .wordmark", {
            yPercent: 135,
            duration: 0.9,
            ease: "power4.out",
            delay: 0.15,
          })
          .to(".preloader__line-fill", { scaleX: 1, duration: 0.9, ease: "power2.inOut" }, "-=0.4")
          .to(
            preloader,
            {
              yPercent: -100,
              duration: 0.9,
              ease: "power4.inOut",
              onComplete: () => preloader.remove(),
            },
            "+=0.1",
          )
          .add(heroIntro(), "-=0.55");
      }

      /* ---------- Hero-Scatter beim Scroll-out ---------- */
      if (!reduceMotion) {
        const off = onHeroUniforms((u) => {
          ctx.add(() => {
            gsap.to(u.uScatter, {
              value: 1.6,
              ease: "none",
              scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: 0.6 },
            });
            gsap.to(u.uOpacity, {
              value: 0,
              ease: "none",
              scrollTrigger: { trigger: "#hero", start: "40% top", end: "bottom top", scrub: 0.6 },
            });
          });
        });
        teardowns.push(off);
        gsap.to(".hero__content", {
          yPercent: -12,
          autoAlpha: 0.25,
          ease: "none",
          scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: 0.8 },
        });
      }

      /* ---------- Sektions-Titel: Buchstaben-Reveal ---------- */
      for (const el of document.querySelectorAll<HTMLElement>("[data-split]")) {
        const { chars, restore } = splitToChars(el);
        teardowns.push(restore);
        if (reduceMotion) {
          continue;
        }
        gsap.from(chars, {
          yPercent: 140,
          duration: 0.9,
          stagger: 0.016,
          ease: "power4.out",
          scrollTrigger: { trigger: el, start: "top 85%", once: true },
        });
      }

      /* ---------- Generische Reveals ---------- */
      if (!reduceMotion) {
        for (const el of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
          gsap.from(el, {
            y: 44,
            autoAlpha: 0,
            duration: 1.05,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 88%", once: true },
          });
        }
      }

      /* ---------- Brief: hebt sich in seine Neigung ---------- */
      const letter = document.getElementById("letter");
      if (letter && !reduceMotion) {
        gsap.from(letter, {
          y: 90,
          rotation: 2,
          autoAlpha: 0,
          duration: 1.3,
          ease: "power3.out",
          scrollTrigger: { trigger: letter, start: "top 82%", once: true },
        });
      }

      /* ---------- Dashboard-Mock ---------- */
      if (!reduceMotion) {
        gsap.from("#dash-bar-fill", {
          scaleX: 0,
          duration: 1.4,
          ease: "power3.inOut",
          scrollTrigger: { trigger: "#dash-bar-fill", start: "top 90%", once: true },
        });
        for (const [i, row] of Array.from(document.querySelectorAll(".dash__row")).entries()) {
          gsap.from(row, {
            x: 24,
            autoAlpha: 0,
            duration: 0.8,
            ease: "power3.out",
            delay: i * 0.1,
            scrollTrigger: { trigger: row, start: "top 92%", once: true },
          });
        }
        gsap.to(".pill--progress", {
          opacity: 0.45,
          repeat: -1,
          yoyo: true,
          duration: 1.1,
          ease: "sine.inOut",
        });
      }

      /* ---------- Nav: Scroll-Zustand + Theme ueber hellen Sektionen.
         Die Nav bleibt sichtbar -- ihr CTA ist der einzige persistente
         Pfad zu den Plaenen. ---------- */
      const nav = document.getElementById("nav");
      if (nav) {
        ScrollTrigger.create({
          start: 80,
          onUpdate: (self) => {
            nav.classList.toggle("is-scrolled", self.scroll() > 80);
          },
        });
        ScrollTrigger.create({
          start: 0,
          end: 81,
          onToggle: (self) => {
            if (self.isActive) {
              nav.classList.remove("is-scrolled");
            }
          },
        });
        for (const section of document.querySelectorAll('main [data-theme="light"]')) {
          ScrollTrigger.create({
            trigger: section,
            start: () => `top ${nav.offsetHeight / 2}px`,
            end: () => `bottom ${nav.offsetHeight / 2}px`,
            onToggle: (self) => nav.classList.toggle("is-light", self.isActive),
          });
        }
      }

      /* ---------- Scroll-Fortschrittsbalken ---------- */
      gsap.to("#scroll-progress", {
        scaleX: 1,
        ease: "none",
        scrollTrigger: {
          start: 0,
          end: () => document.documentElement.scrollHeight - window.innerHeight,
          scrub: 0.3,
        },
      });

      /* ---------- Sticky Mobile-CTA ---------- */
      const mobileCta = document.getElementById("mobile-cta");
      if (mobileCta) {
        const barState = { pastHero: false, overPricing: false, overCta: false };
        const updateBar = () => {
          const visible = barState.pastHero && !barState.overPricing && !barState.overCta;
          mobileCta.classList.toggle("is-visible", visible);
          mobileCta.setAttribute("aria-hidden", String(!visible));
        };
        ScrollTrigger.create({
          trigger: "#hero",
          start: "bottom 85%",
          end: "max",
          onToggle: (self) => {
            barState.pastHero = self.isActive;
            updateBar();
          },
        });
        ScrollTrigger.create({
          trigger: "#preise",
          start: "top 90%",
          end: "bottom 30%",
          onToggle: (self) => {
            barState.overPricing = self.isActive;
            updateBar();
          },
        });
        ScrollTrigger.create({
          trigger: ".cta",
          start: "top 90%",
          end: "bottom top",
          onToggle: (self) => {
            barState.overCta = self.isActive;
            updateBar();
          },
        });
      }

      /* ---------- CTA-Schluesselloch: langsame Drift ---------- */
      if (!reduceMotion) {
        gsap.to(".cta__keyhole", {
          y: -60,
          ease: "none",
          scrollTrigger: { trigger: ".cta", start: "top bottom", end: "bottom top", scrub: 1 },
        });
      }

      /* ---------- Magnetic Buttons + Tile-Tilt/Sheen ---------- */
      if (finePointer && !reduceMotion) {
        for (const el of document.querySelectorAll<HTMLElement>("[data-magnetic]")) {
          const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
          const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
          const move = (e: Event) => {
            const p = e as PointerEvent;
            const r = el.getBoundingClientRect();
            xTo((p.clientX - (r.left + r.width / 2)) * 0.22);
            yTo((p.clientY - (r.top + r.height / 2)) * 0.28);
          };
          const leave = () => {
            xTo(0);
            yTo(0);
          };
          listen(el, "pointermove", move);
          listen(el, "pointerleave", leave);
        }

        for (const el of document.querySelectorAll<HTMLElement>("[data-tilt]")) {
          const rx = gsap.quickTo(el, "rotationX", { duration: 0.6, ease: "power3.out" });
          const ry = gsap.quickTo(el, "rotationY", { duration: 0.6, ease: "power3.out" });
          gsap.set(el, { transformPerspective: 900 });
          const move = (e: Event) => {
            const p = e as PointerEvent;
            const r = el.getBoundingClientRect();
            const px = (p.clientX - r.left) / r.width;
            const py = (p.clientY - r.top) / r.height;
            ry((px - 0.5) * 5);
            rx((0.5 - py) * 5);
            el.style.setProperty("--mx", `${px * 100}%`);
            el.style.setProperty("--my", `${py * 100}%`);
          };
          const leave = () => {
            rx(0);
            ry(0);
          };
          listen(el, "pointermove", move);
          listen(el, "pointerleave", leave);
        }
      }

      /* ---------- Ambient Pointer-Glow ---------- */
      const glow = document.getElementById("pointer-glow");
      if (glow) {
        if (finePointer && !reduceMotion) {
          const gx = gsap.quickTo(glow, "x", { duration: 1.1, ease: "power3.out" });
          const gy = gsap.quickTo(glow, "y", { duration: 1.1, ease: "power3.out" });
          let glowVisible = false;
          const onMove = (e: Event) => {
            const p = e as PointerEvent;
            if (!glowVisible) {
              glowVisible = true;
              gsap.set(glow, { x: p.clientX, y: p.clientY });
              gsap.to(glow, { opacity: 1, duration: 1.2, ease: "power2.out" });
            }
            gx(p.clientX);
            gy(p.clientY);
          };
          listen(window, "pointermove", onMove);
        } else {
          glow.remove();
        }
      }
    });

    /* ---------- Anker-CTAs (Delegation). Platzhalter-Links (href="#")
       sind bewusst inert -- sonst spraengen sie an den Seitenanfang. ---------- */
    const onDocClick = (e: MouseEvent) => {
      const anchor = (e.target as Element | null)?.closest?.('a[href^="#"]');
      if (!anchor) {
        return;
      }
      e.preventDefault();
      const href = anchor.getAttribute("href") ?? "#";
      if (href.length < 2) {
        return;
      }
      const target = document.querySelector(href);
      if (!target) {
        return;
      }
      // Ein Anker-Tap im offenen Mobile-Menu schliesst es zuerst (Nav hoert zu)
      document.dispatchEvent(new CustomEvent("gokognito:close-mobile-menu"));
      if (lenis) {
        lenis.scrollTo(target as HTMLElement, { offset: -60, duration: 1.4 });
      } else {
        target.scrollIntoView({ behavior: "smooth" });
      }
    };
    document.addEventListener("click", onDocClick);
    teardowns.push(() => document.removeEventListener("click", onDocClick));

    /* ---------- Nach Font-/Asset-Settling neu messen ---------- */
    const onLoad = () => ScrollTrigger.refresh();
    if (document.readyState === "complete") {
      ScrollTrigger.refresh();
    } else {
      listen(window, "load", onLoad);
    }

    return () => {
      for (const dispose of teardowns.reverse()) {
        dispose();
      }
      ctx.revert();
    };
  }, []);

  return null;
}
