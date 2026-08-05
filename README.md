# Footy Karriere ⚽

Eine textbasierte Fußball-Karriere-Simulation im Browser. Du übernimmst einen
Spieler mit 14 Jahren in der Jugendakademie eines fiktiven Vereins und triffst
über die gesamte Karriere hinweg echte Entscheidungen - bis zum Karriereende
im höheren Alter.

## Was das Spiel bietet

- **Länderwahl**: Zu Beginn wählst du eines der zehn UEFA-Länder mit dem
  höchsten Länderkoeffizienten (England, Italien, Spanien, Deutschland,
  Frankreich, Portugal, Belgien, Niederlande, Türkei, Polen).
- **Echte Liga-Pyramide**: Liga 1 und Liga 2 des gewählten Landes basieren auf
  einer Recherche der tatsächlich aktiven Vereine für die Saison 2026/27 -
  dargestellt ausschließlich als **Städtenamen** (keine Vereinsnamen/-logos).
  Spielen mehrere Vereine aus derselben Stadt in einer Liga, werden sie
  nummeriert (z. B. "Madrid I" / "Madrid II"). Die Zuordnung ist bestmöglich
  recherchiert, bei kleineren zweiten Ligen aber eine Annäherung und kein
  Echtzeit-Datenfeed.
- **Echtheitsgetreuer Auf- und Abstieg**: Am Ende jeder Saison wird die
  komplette Tabelle von Liga 1 und Liga 2 simuliert - die schwächsten Vereine
  aus Liga 1 steigen ab, die stärksten aus Liga 2 steigen auf (Anzahl je nach
  Land). Betrifft es den eigenen Verein, wechselt der Spieler automatisch die
  Liga-Ebene.
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
- **Transfers & Verträge**: Vereinswechsel innerhalb der echten Liga-Pyramide,
  basierend auf Leistung, Bekanntheit und Vereinsbeziehung.
- **Karriereende & Vermächtnis**: Am Ende gibt es einen Legacy-Score, einen
  Karriere-Titel (z. B. "Publikumsliebling", "Weltklasse-Legende") und einen
  Ausblick auf den Karriereweg danach (Trainer, TV-Experte, Jugendarbeit, ...).

Spielernamen sind frei erfunden. Länder, Ligen und die Anzahl/Herkunft der
Vereine je Liga sind real recherchiert (Saison 2026/27); dargestellt werden
ausschließlich Städtenamen, keine echten Vereinsnamen, -logos oder -marken.
Weitere Länder/Ligen lassen sich in `src/engine/leagues.ts` ergänzen.

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
  engine/
    types.ts          Datenmodelle (Player, Club, LeagueState, Events, ...)
    leagues.ts         Liga-Datenbank: 10 Länder, Liga-1/2-Städte 2026/27
    leagueEngine.ts     Liga-Aufbau, Saisontabellen, Auf-/Abstiegs-Logik
    careerEngine.ts     Spieler-Erstellung, Alterung, Verträge, Karriereende
    events.ts           ~35 Entscheidungs-Events über alle Karrierephasen
    data.ts, storage.ts Namenspools, localStorage-Persistenz
  ui/                  React-Komponenten für die einzelnen Bildschirme
  App.tsx              Zustandsautomat, der Bildschirme und Spiellogik verbindet
  app.css              Styling (Dark Theme)
```
