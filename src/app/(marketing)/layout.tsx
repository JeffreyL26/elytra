import type { Metadata } from "next";
import { Instrument_Sans, Newsreader, Space_Mono } from "next/font/google";
import "./marketing.css";

// Fonts self-hosted ueber next/font (Download zur Build-Zeit, Auslieferung vom
// eigenen Server). Bewusst KEIN Google-Fonts-CDN zur Laufzeit -- DSGVO-Linie
// des Projekts (LG Muenchen I, 3 O 17493/20).
const serif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GoKognito | Werden Sie unsichtbar für Datenhändler",
  description:
    "GoKognito setzt Ihr Recht auf Löschung durch: automatisiert, DSGVO-konform und dauerhaft. Wir entfernen Ihre persönlichen Daten aus den Datenbanken von Data-Brokern.",
};

export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`site ${serif.variable} ${sans.variable} ${mono.variable}`} data-theme="dark">
      {children}
    </div>
  );
}
