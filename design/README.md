# Visual Pass — Karriere-Präsentation (Prototyp)

Statischer UI-Prototyp für die visuelle Überarbeitung der Karriere-Präsentation
(Dashboard, Timeline, EventCard, Karriereende). **Reine Visualisierung** —
keine Engine-/Gameplay-Änderung, keine neuen Entscheidungen, keine neue
Narrative-Logik. Alle gezeigten Werte sind erfundene Beispieldaten einer
fiktiven Karriere ("Jonas Reiter"), nur die DatenFORM ist an das echte Modell
angelehnt (`seasonHistory`, `transferDecisions`, `CareerPhenotype`, ...).

## Ansehen

`career-visual-pass-prototype.html` ist eine einzelne, selbstständige HTML-Datei
(Fonts inline als Base64, kein Build nötig) — einfach im Browser öffnen, oder
über den in der Session veröffentlichten Artifact-Link.

## Designrichtung

Übernimmt das bestehende "Matchday Dossier"-Designsystem der App 1:1
(`src/app.css`: Tannengrün + Old-Gold, Barlow Condensed, JetBrains Mono,
4px-Grundraster, Rahmenlinien statt Schatten, dunkle Spielfeld-Textur) und
erweitert es NUR um das, was kartenbasierte Darstellung zusätzlich braucht:

- größerer Karten-Radius (`--radius-card`) für Player Card / Offer Cards /
  Timeline-Panel — fühlt sich mehr nach "Karte" an als das dichte
  Datenblatt-Raster der bestehenden Screens
- prozedural generierte Vereins-"Wappen" (CSS-`clip-path`-Schild + Initialen,
  Farbe aus derselben bereits kontrastgeprüften Kategorial-Palette wie
  `OverallScoreChart.tsx`) — das Spiel zeigt bewusst keine echten Vereine/Logos
  (`ClubState.city` ist nur ein Stadtname), ein generiertes Wappen passt dazu
  besser als ein Icon-Font-Symbol
- Marker-Farben für die neue horizontale Timeline

## Die vier Ansichten

1. **Dashboard** — Player Card als Hero (Wappen, Vereinsfarbe, OVR groß,
   Trend, Tier, Status-Badges "Heimkehrer"/"Stammspieler"/"Kapitän",
   Mini-Formkurve), darunter eine abgesetzte "Storyline"-Ribbon
   (`describeCareerMomentum`-Äquivalent), dann erst die dichteren
   Stat-/Attribut-/Vertrags-Blöcke — bewusst gestaffelt, nicht alles auf
   einer Ebene.
2. **Karriere-Timeline** — horizontale Alters-Achse (14–35) mit farbcodierten
   Event-Markern (Transfer, Titel/Aufstieg, Verletzung, Nationalmannschaft,
   Krise, Comeback, Heimkehr) und Vereins-Farbbändern; Tippen auf einen
   Marker zeigt Kontext. Entspricht inhaltlich `player.log` /
   `player.seasonHistory` / `player.transferDecisions`, nur als Zeitstrahl
   statt als Liste (die bestehende `Timeline.tsx` bleibt als reine Log-Liste
   unverändert nutzbar — dies ist ein zusätzliches, visuelles Format).
3. **EventCard** — bestehendes Angebots-Kartenformat (`OfferCardData`) um
   Wappen und drei kleine visuelle Indikatoren (Gehalt/Prestige/
   Einsatzchance als Balken) ergänzt; Entscheidung löst eine kurze
   Wappen-Übergangsanimation, animierte Delta-Chips und optional einen
   Storyline-/Achievement-Toast aus.
4. **Karriereende** — kombiniert Player Card, die volle Timeline (mit
   markiertem Karriereende), Phänotyp-Headline + Zitat, Trophäenschrank,
   prägende Momente und die bestehende Statistik — der beabsichtigte
   visuelle Höhepunkt.

## Nicht Teil dieses Passes

- Keine Änderung an OVR-/Potential-/Development-/Performance-/Transfer-/
  Event-/Narrative-/Legacy-/Einsatzzeit-Logik.
- Keine Integration in `src/ui/*.tsx` — das ist bewusst ein separater,
  nachgelagerter Schritt, sobald die Bildsprache abgenommen ist.
