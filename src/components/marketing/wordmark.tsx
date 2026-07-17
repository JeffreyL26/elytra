// Text-Wordmark mit dem Schluesselloch-"o" als Inline-SVG -- bewusst KEIN
// Bild: skaliert scharf, erbt currentColor und bleibt fuer Screenreader ueber
// aria-Attribute der Aufrufer zugaenglich. Die SVG-Geometrie ist auf die
// Glyphen-Metrik des Newsreader-"o" gesetzt (0.54em Ink-Box, 0.01em
// Grundlinien-Ueberhang); Aenderungen hier muessen in
// tools/branding/wordmark.html nachgezogen werden.
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className ? `wordmark ${className}` : "wordmark"} aria-hidden="true">
      G
      <svg className="wordmark__o" viewBox="0 0 100 100" aria-hidden="true">
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M50 0a50 50 0 1 0 0.01 0ZM50 20a18 18 0 0 1 9 33.5L63 84H37l4-30.5A18 18 0 0 1 50 20Z"
        />
      </svg>
      Kognito
    </span>
  );
}
