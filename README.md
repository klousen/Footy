# Footy Karriere ⚽

Eine textbasierte Fußball-Karriere-Simulation im Browser. Du übernimmst einen
Spieler mit 14 Jahren in der Jugendakademie eines fiktiven Vereins und triffst
über die gesamte Karriere hinweg echte Entscheidungen - bis zum Karriereende
im höheren Alter.

## Was das Spiel bietet

- **Vollständige Karriere**: von der Jugend (14) über Durchbruch, Etablierung
  und Veteranenjahre bis zum Karriereende.
- **Mehrere Entscheidungen pro Saison**: Training, Alltag/Lifestyle, Medien,
  Sponsoring, Transfers, Vertragsverhandlungen, Verletzungsmanagement,
  entscheidende Spielmomente und Nationalmannschaft.
- **Echte Konsequenzen**: Entscheidungen wirken sich auf Attribute, Moral,
  Fitness, Vereinsbeziehung, Bekanntheit und Vermögen aus - inklusive
  Risiko/Ertrags-Abwägungen mit Erfolgs-/Misserfolgschance.
- **Automatische Saison-Simulation**: Spiele, Tore, Vorlagen, Bewertungen,
  Tabellenplatz und Titel werden auf Basis der Attribute, Vereinsstärke, Moral
  und Fitness simuliert.
- **Alterung & Entwicklung**: Attribute wachsen in der Jugend/Frühkarriere und
  bauen im höheren Alter wieder ab - abhängig vom individuellen Potenzial
  jedes Spielers.
- **Transfers & Verträge**: Vereinswechsel, Beförderungen und Abstiege
  basierend auf Leistung, Bekanntheit und Vereinsbeziehung.
- **Karriereende & Vermächtnis**: Am Ende gibt es einen Legacy-Score, einen
  Karriere-Titel (z. B. "Publikumsliebling", "Weltklasse-Legende") und einen
  Ausblick auf den Karriereweg danach (Trainer, TV-Experte, Jugendarbeit, ...).

Alle Namen, Vereine und Ligen sind frei erfunden.

## Entwicklung

```bash
npm install
npm run dev       # Entwicklungsserver
npm run build     # Produktions-Build
npm run lint       # oxlint
```

Der Spielstand wird automatisch im `localStorage` des Browsers gespeichert.

## Projektstruktur

```
src/
  engine/     Spiellogik: Typen, Datenpools, Events, Karriere-Engine, Storage
  ui/         React-Komponenten für die einzelnen Bildschirme
  App.tsx     Zustandsautomat, der Bildschirme und Spiellogik verbindet
  app.css     Styling (Dark Theme)
```
