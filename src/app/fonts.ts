import { Instrument_Sans, Newsreader, Space_Mono } from "next/font/google";

// Brand-Fonts, geteilt von Marketing- und App-Segment. Self-hosted ueber
// next/font (Download zur Build-Zeit, Auslieferung vom eigenen Server) --
// bewusst KEIN Google-Fonts-CDN zur Laufzeit; DSGVO-Linie des Projekts
// (LG Muenchen I, 3 O 17493/20). Beide Layouts setzen die Variablen auf ihren
// Wrapper (.site bzw. .app), die Segment-CSS bauen daraus --serif/--sans/--mono.
export const serif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-serif",
  display: "swap",
});

export const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const mono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});
