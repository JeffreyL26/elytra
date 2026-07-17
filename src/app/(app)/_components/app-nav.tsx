"use client";

// App-Nav: schlank, ohne Scroll-Choreografie. Zeigt je nach Session-Zustand
// (kommt serverseitig aus dem Layout) die eingeloggten Links oder den
// Anmelden-Link. Abmelden ruft Better Auths sign-out und laedt den
// Server-Zustand neu (router.refresh -> Layout liest die Session erneut).

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/app/_shared/wordmark";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  return (
    <Link
      href={href}
      className="app-nav__link"
      aria-current={pathname === href ? "page" : undefined}
    >
      {label}
    </Link>
  );
}

export function AppNav({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
    } finally {
      setSigningOut(false);
      router.push("/anmelden");
      router.refresh();
    }
  }

  return (
    <header className="app-nav">
      <div className="app-nav__inner">
        <Link href="/" aria-label="GoKognito, Startseite">
          <Wordmark />
        </Link>
        <nav className="app-nav__links" aria-label="Kontobereich">
          {signedIn ? (
            <>
              <NavLink href="/profil" label="Profil" />
              <NavLink href="/konto" label="Konto" />
              <button
                type="button"
                className="app-btn app-btn--ghost app-btn--small"
                onClick={signOut}
                disabled={signingOut}
              >
                {signingOut ? "Wird abgemeldet …" : "Abmelden"}
              </button>
            </>
          ) : (
            <>
              <NavLink href="/anmelden" label="Anmelden" />
              <Link href="/registrieren" className="app-btn app-btn--primary app-btn--small">
                Registrieren
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
