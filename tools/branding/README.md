# Branding-Tools (nicht Teil des Next-Builds)

`wordmark.html` ist die Render-Vorlage fuer Logo-Exporte (Wordmark + Icon,
Cream/Ink, transparenter Hintergrund). Sie laeuft als eigenstaendige HTML-Datei
im Browser; die Google-Fonts-Referenz darin ist nur fuer den lokalen
Export-Vorgang gedacht und landet nie im ausgelieferten Produkt.

Export via Headless-Chrome, z. B.:

```
chrome --headless=new --default-background-color=00000000 \
  --window-size=2000,560 --screenshot=wordmark.png wordmark.html
```

Farbvarianten steuert `document.body.className` (`ink`, `icon`, `icon ink`) --
per Query-Parameter (`?c=ink`, `?m=icon`) oder DevTools setzen.

WICHTIG: Die Wordmark-Geometrie (Schluesselloch-"o", 0.54em Ink-Box, 0.01em
Grundlinien-Ueberhang) muss mit `src/components/marketing/wordmark.tsx` und
`marketing.css` synchron bleiben. Aenderst du eines, zieh die anderen nach und
exportiere neu.

`GoKognito_Icon_*.svg` sind die fertigen Icon-Exporte (verlustfrei skalierbar).
