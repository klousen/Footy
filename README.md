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
  dargestellt ausschließlich als **Städte-/Stadtteilnamen** (keine
  Vereinsnamen/-logos). Spielen mehrere Vereine aus derselben Stadt in einer
  Liga, wird nach Möglichkeit der echte Stadtteil verwendet (z. B.
  "London-Fulham", "Rom-Testaccio"); nur wenn sich zwei Vereine buchstäblich
  ein Stadion teilen (z. B. Inter/Milan im San Siro), wird ersatzweise
  nummeriert. Die Zuordnung ist bestmöglich recherchiert, bei kleineren
  zweiten Ligen aber eine Annäherung und kein Echtzeit-Datenfeed.
- **Drei Vereine machen ein Angebot**: Der Karrierestart und jeder spätere
  Vereinswechsel läuft sichtbar über konkrete Angebote - beim Karrierestart
  bieten drei Vereine (schwach/mittel/stark gestaffelt) einen
  Jugendakademie-Platz an; beim Sprung in den Profifußball und bei späteren
  Wechseln stehen jeweils drei echte Vereine mit Liga, Vereinsstärke und
  voraussichtlicher Kaderrolle zur Auswahl.
- **Lebendige Wechselmechanik**: Bei starker Form melden sich immer wieder
  neue Vereine (mit Cooldown, damit es nicht inflationär wird); wer über
  längere Zeit kaum spielt, gerät in eine sichtbare Bankphase - kann sich
  aber per Entscheidung zurückkämpfen oder einen Neuanfang bei einem anderen
  Verein wagen. Rollenwechsel im Kader (Stammspieler ↔ Bank) werden im
  Karriereverlauf klar vermerkt.
- **Echtheitsgetreuer Auf- und Abstieg**: Am Ende jeder Saison wird die
  komplette Tabelle von Liga 1 und Liga 2 simuliert - die schwächsten Vereine
  aus Liga 1 steigen ab, die stärksten aus Liga 2 steigen auf (Anzahl je nach
  Land). Betrifft es den eigenen Verein, zieht der Spieler automatisch mit.
- **Sofortiges Feedback**: Jede Entscheidung zeigt direkt im Anschluss, was
  sie bewirkt hat - Ergebnistext plus konkrete Attribut-/Stat-Änderungen -
  bevor es weitergeht.
- **Vollständige Karriere**: von der Jugend (14) über Durchbruch, Etablierung
  und Veteranenjahre bis zum Karriereende.
- **Mehrere Entscheidungen pro Saison**: Training, Alltag/Lifestyle, Medien,
  Sponsoring, Vertragsverhandlungen, Verletzungsmanagement, entscheidende
  Spielmomente und Nationalmannschaft.
- **Echte Konsequenzen**: Entscheidungen wirken sich auf Attribute, Moral,
  Fitness, Vereinsbeziehung, Bekanntheit und Vermögen aus - inklusive
  Risiko/Ertrags-Abwägungen mit Erfolgs-/Misserfolgschance.
- **Automatische Saison-Simulation**: Spiele, Tore, Vorlagen, Bewertungen,
  Tabellenplatz und Titel werden auf Basis der Attribute, Vereinsstärke, Moral
  und Fitness simuliert.
- **Alterung & Entwicklung**: Attribute wachsen in der Jugend/Frühkarriere und
  bauen im höheren Alter wieder ab - abhängig vom individuellen Potenzial
  jedes Spielers.
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
    careerEngine.ts     Spieler-Erstellung, Alterung, Verträge, Transfers,
                         Karriereende
    events.ts           ~35 Entscheidungs-Events über alle Karrierephasen
    labels.ts           Deutsche Labels/Formatierung (auch für Feedback-Texte)
    data.ts, storage.ts Namenspools, localStorage-Persistenz
  ui/                  React-Komponenten für die einzelnen Bildschirme
  App.tsx              Zustandsautomat, der Bildschirme und Spiellogik verbindet
  app.css              Styling (Dark Theme)
```
