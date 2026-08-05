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
  Wechseln stehen jeweils drei echte Vereine mit Land, Liga, Vereinsstärke
  und voraussichtlicher Kaderrolle zur Auswahl - jede Angebotskarte nennt
  eindeutig, wo genau man spielen würde.
- **Internationale Wechsel mit echtem Risiko**: Angebote kommen nicht nur aus
  der Heimatliga - schon beim Sprung in den Profifußball ist ein
  Auslandswechsel möglich, mit wachsender Bekanntheit/Gesamtstärke werden
  Angebote aus dem Ausland häufiger. Auslandsangebote sind klar als solche
  markiert (Flagge, Land, "Auslandswechsel"), und die Ziel-Liga wird bei
  Zusage zur neuen aktiven Liga - inklusive eigenem Auf-/Abstieg ab diesem
  Zeitpunkt. Andere Länder werden dabei erst beim ersten Angebot "erzeugt"
  und bleiben danach stabil (keine überraschenden Stärke-Sprünge zwischen
  Angebot und Zusage). Ein Sprung in eine angesehenere Liga (nach
  UEFA-Länderkoeffizient) verstärkt den Trainingsumfeld-Effekt zusätzlich.
  Aber nicht jeder Auslandswechsel gelingt sofort: Sprache, Kultur und
  Spielsystem können zu echten Eingewöhnungsschwierigkeiten führen (Moral-
  und Formdämpfer), während mentalitätsstarke Spieler manchmal sofort
  durchstarten - bei bestehender Partnerschaft entscheidet zusätzlich der
  Umzug mit, ob der Partner Rückhalt gibt oder selbst zu kämpfen hat.
- **Lebendige Wechselmechanik**: Schon eine solide Saison reicht, damit
  Scouts aufmerksam werden (bei starker/überragender Saison fast sicher);
  wer über längere Zeit kaum spielt, gerät in eine sichtbare Bankphase -
  kann sich aber per Entscheidung zurückkämpfen oder einen Neuanfang bei
  einem anderen Verein wagen. Rollenwechsel im Kader (Stammspieler ↔ Bank)
  werden im Karriereverlauf klar vermerkt. Wer aktiv einen Wechsel sucht
  (z. B. per Wechselwunsch oder nach einem eskalierten Trainerkonflikt),
  bekommt schon in der nächsten Saison mit sehr hoher Wahrscheinlichkeit ein
  passendes Angebot - das hat Vorrang vor der allgemeinen Bankdruck-Logik,
  damit ein geäußerter Wechselwunsch nicht folgenlos bleibt. Die
  Vereinsstärke der Angebote folgt außerdem
  einer nachvollziehbaren Kurve, die sich direkt an der Saison-Bilanz
  orientiert (überragende Saison → deutlich stärkere Vereine als eine solide
  Saison), und der Einladungstext nennt konkret die Zahlen der vorherigen
  Saison, damit klar wird, warum sich gerade jetzt wer meldet.
- **Echte Aufstiegschancen**: "Die große Chance" gibt dir als Rotations-
  oder Bankspieler die Möglichkeit, dich in einem wichtigen Spiel in die
  Stammelf zu spielen - mit spürbarem, mehrere Saisons anhaltendem Effekt.
  Dazu individuelle Auszeichnungen (Torschützenkönig, Spieler der Saison,
  Talent der Saison) als eigene Titel, und eine Nationalmannschaftskarriere
  mit echten Länderspiel-Einsätzen, die sich zur Kapitänsbinde der
  Nationalelf steigern kann. Eine Einladung gibt es realistischerweise fast
  nur für Erstliga-Spieler (Liga-2 nur bei einer wirklich außergewöhnlichen
  Saison); gelungene Länderspiele wirken sich zusätzlich zu Bekanntheit und
  Caps auch auf Attribute und Führungsstärke aus - der Nationalmannschafts-
  Impact bleibt also nicht mehr folgenlos.
- **Realistische Wachstumskurve zur Gesamtstärke**: Attribute nähern sich
  über die Karriere hinweg dem individuellen Potenzial an (schnell in der
  Jugend, spürbar auch noch in den Prime-Jahren, danach altersbedingter
  Abbau) - ein durchschnittliches Talent pendelt sich als solider Profi ein,
  ein gut gewürfeltes Potenzial mit konsequenten Entscheidungen kann
  tatsächlich Weltklasse-Niveau (80+) erreichen, der seltene
  "Wunderkind"-Bonus bei der Potenzial-Vergabe sogar Ikonen-Niveau (90+).
  Die Gesamtstärke wird dabei FUT-artig in Stufen eingeordnet (Amateur bis
  Ikone, siehe Dashboard-Badge) - Top-Bewertungen bleiben bewusst selten und
  müssen sich über die Karriere erarbeitet werden.
- **Echtheitsgetreuer Auf- und Abstieg mit echtem Impact**: Am Ende jeder
  Saison wird die komplette Tabelle von Liga 1 und Liga 2 simuliert - die
  schwächsten Vereine aus Liga 1 steigen ab, die stärksten aus Liga 2 steigen
  auf (Anzahl je nach Land). Betrifft es den eigenen Verein, zieht der
  Spieler automatisch mit - inklusive spürbarer Konsequenzen: Aufstieg gibt
  einen Moral-/Bekanntheitsschub, und wer dabei eine starke individuelle
  Saison zeigt, wird für größere Vereine interessant. Steigt der Verein trotz
  starker eigener Leistung ab, bleibt das nicht unbemerkt - Vereine bieten
  dann gezielt einen "Rettungsanker" weg vom sinkenden Schiff an.
- **Sofortiges Feedback**: Jede Entscheidung zeigt direkt im Anschluss, was
  sie bewirkt hat - Ergebnistext, die Gesamtstärke vorher/nachher (der
  direkte fußballerische Impact) sowie alle Attribut-, Charakter- und
  Stat-Änderungen - bevor es weitergeht. Der Attribut-Effekt einer Wahl fällt
  bewusst deutlicher aus als reines Saisonwachstum, damit sich Entscheidungen
  sofort spürbar auf die Gesamtstärke auswirken.
- **Gesamtstärke im Mittelpunkt**: Die Gesamtstärke (1-99) wird - ähnlich wie
  bei FIFA Ultimate Team - in klar erkennbare Stufen eingeordnet (Amateur,
  Ausbaufähig, Solide, Star, Weltklasse, Ikone) mit eigener Farbgebung und
  einem Trendpfeil, der die Entwicklung seit der letzten Saison zeigt. Ein
  Wechsel zu einem deutlich stärkeren Verein bringt sofort ein besseres
  Trainingsumfeld mit: kleiner sofortiger Attributschub plus beschleunigtes
  Wachstum für die nächsten Saisons.
- **Charakter & Ruf (Gedächtnis für Entscheidungen)**: Vier Werte -
  Arbeitsmoral, Disziplin, Medienimage, Führungsstärke - merken sich, wie du
  dich über die Karriere hinweg verhältst, und sind im Dashboard sichtbar.
  Sie wirken sich messbar aus: hohe Arbeitsmoral beschleunigt das
  Attributwachstum spürbar, niedrige Disziplin kostet Konstanz und mehr
  Karten, ein gutes Medienimage verstärkt den Bekanntheitsgewinn, hohe
  Führungsstärke hält die Kabine zusammen. Extremwerte schalten eigene
  Folge-Events frei (Vorbildfunktion, Reißleine des Vereins,
  Sponsoren-Ansturm, Medien-Vertrauenskrise, Mannschaftsrat) und fließen in
  Legacy-Score und Achievements ein.
- **Gehaltssystem**: Der Vertrag zahlt jede Saison ein Grundgehalt plus
  Leistungsboni (Tore, Vorlagen, starke Bewertungen, Titel) aufs Vermögen
  ein. Das Grundgehalt bei einem Vereinswechsel richtet sich spürbar sowohl
  nach der eigenen Bekanntheit als auch nach der Zahlkraft/Stärke des neuen
  Vereins - zwei Erstligisten unterschiedlicher Größe zahlen entsprechend
  unterschiedlich. Gehaltsverhandlungen (hart pokern, moderat nachfragen,
  Vertragsverlängerung mit Fokus auf hohes Gehalt oder auf dem
  Beziehungskonto verzichten), Vereinswechsel und Aufstiege wirken sich
  direkt auf die Höhe aus. Jedes Vereinsangebot zeigt das voraussichtliche
  Gehalt schon vor der Entscheidung an, damit Angebote wirklich vergleichbar
  sind - kein Rätselraten mehr.
- **Mehrfaktorielles Scoring inkl. Transferhistorie**: Am Saisonende gibt es
  eine Saison-Bilanz (sportliche Leistung inkl. Tore/Vorlagen, Titel,
  Entwicklung, Disziplin, Auf-/Abstieg) mit Punktzahl und Einordnung. Am
  Karriereende wird der Legacy-Score in all seine Faktoren aufgeschlüsselt
  (Tore, Vorlagen, Titel, Länderspiele, Vermögen, Vereinstreue, Familie,
  Verletzungshistorie, ...), es gibt eine Reihe positiver wie negativer
  **Erfolge/Achievements** (z. B. "Torjäger", "Vereinstreue",
  "Verletzungsanfällig", "Vielwechsler") sowie eine vollständige
  **Transferhistorie**: jeder Wechsel mit Alter, altem/neuem Verein, Land,
  Liga, Gehalt und der eigenen Saison-Bilanz (inkl. Tore/Vorlagen) zum
  Zeitpunkt des Wechsels. Neu erreichte Erfolge werden nicht erst am
  Karriereende erwähnt, sondern direkt in dem Saisonrückblick angezeigt, in
  dem sie erreicht wurden - kontextualisiert mit Beschreibung.
- **Mehrjährige Geschichten (Storylines)**: Manche Entscheidungen stoßen eine
  Ereignis-Reihe an, die sich über mehrere Saisons fortsetzt und garantiert
  (nicht zufällig) weitergeht, sobald das nächste Kapitel fällig ist - inkl.
  Fortschrittsanzeige ("Kapitel 2/3") im Feedback und einem eigenen
  Dashboard-Panel "Laufende Geschichten". Aktuell: eine Rivalität mit einem
  neuen Konkurrenten um den Stammplatz, der lange Weg zurück nach einer
  schweren Verletzung, der Aufstieg zur Vereinsikone bei langer Vereinstreue,
  ein eskalierender Zoff mit dem Trainer und ein wachsender Marken-Deal -
  jede mit mehreren Ausgängen, je nachdem wie du dich entscheidest.
- **Lebensereignisse**: Neben dem Sport können ab 18 eigene Beziehungen
  entstehen - erste Liebe, Beziehungskrisen (mit Trennungsrisiko), Verlobung,
  Hochzeit (groß & öffentlich oder klein & privat), Nachwuchs und Ärger mit
  den Schwiegereltern. Partnernamen werden aus einem gemischten Namenspool
  gezogen, nicht nur männlich klingende Namen. Eine stabile Partnerschaft
  bleibt nicht folgenlos: sie gibt spürbaren Rückhalt für die sportliche
  Leistung (Ehe > Verlobung > Beziehung). Dazu karrierephasen-passende
  Zufallsereignisse mit positiven wie negativen Ausgängen (Skandal,
  Erbschaft, Steuerprobleme, Fan-Liebling, Mentorenrolle im Alter,
  Trainerschein, Testimonial-Spiel, ...). Über 60 Events insgesamt,
  inklusive vieler fußballspezifischer Momente (Trainerwechsel,
  Taktikumstellung, Stadtderby, Pokal-Kraftakt, Hattrick-Chance,
  Sportgericht, Spieler des Monats, Torjägerrennen, U-Nationalmannschaft,
  Standardsituationen, ...) - auch Defensivaktionen kommen vor (rettender
  Tackle, Kopfballduell in der eigenen Box, Abwehrchef-Rolle), inklusive der
  dort naturgemäß höheren Verletzungsgefahr; dazu ein Event für
  Zufalls-Verletzungen aus harmlosen Zusammenprallen. Die Anzahl Ereignisse
  pro Saison ist bewusst
  knapp gehalten (3-5) und schwankt leicht, damit jede einzelne Entscheidung
  mehr Gewicht für die Karriere hat - kürzlich gezogene Events werden für
  einige Saisons unwahrscheinlicher, damit sich weniger wiederholt.
  Event-Texte werden zudem erst unmittelbar vor der Anzeige mit dem dann
  aktuellen Spielerstand erzeugt - ein Vereinswechsel mitten in der Saison
  zeigt in späteren Events also korrekt den neuen Verein.
- **Vollständige Karriere**: von der Jugend (14) über Durchbruch, Etablierung
  und Veteranenjahre bis zum Karriereende.
- **Echte Konsequenzen**: Entscheidungen wirken sich auf Attribute, Moral,
  Fitness, Vereinsbeziehung, Bekanntheit, Gehalt und Vermögen aus -
  inklusive Risiko/Ertrags-Abwägungen mit Erfolgs-/Misserfolgschance.
- **Automatische Saison-Simulation**: Spiele, Tore, Vorlagen, Bewertungen,
  Tabellenplatz und Titel werden auf Basis der Attribute, Vereinsstärke, Moral
  und Fitness simuliert.
- **Alterung & Entwicklung**: Attribute wachsen in der Jugend/Frühkarriere und
  bauen im höheren Alter wieder ab - abhängig vom individuellen Potenzial
  jedes Spielers.
- **Karriereende & Vermächtnis**: Legacy-Score mit Faktoren-Aufschlüsselung,
  Achievement-Badges, ein Karriere-Titel (z. B. "Publikumsliebling",
  "Weltklasse-Legende") und ein Ausblick auf den Karriereweg danach
  (Trainer, TV-Experte, Jugendarbeit, ...).
- **Sharepic für soziale Medien**: Am Karriereende wird automatisch eine
  Spielerkarte im FUT-Stil erzeugt (Name, Position, Land, Gesamtstärke mit
  Tier-Farbe, Karriere-Titel, Kernstats wie Spiele/Tore/Vorlagen/Titel/
  Länderspiele/Legacy-Score sowie die wichtigsten Erfolge) - direkt als Bild
  herunterladbar, in einem neuen Tab zum Speichern zu öffnen oder mit
  passendem Beschreibungstext für Social Media zu kopieren (auf Geräten mit
  nativer Teilen-Funktion zusätzlich direkt teilbar). Rein clientseitig via
  Canvas gezeichnet, keine externen Dienste.

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
    events.ts           ~100 Entscheidungs-Events + 5 mehrjährige Storylines
    labels.ts           Deutsche Labels/Formatierung (auch für Feedback-Texte)
    shareCard.ts         Canvas-Zeichenlogik für das Karriereende-Sharepic
    data.ts, storage.ts Namenspools, localStorage-Persistenz
  ui/                  React-Komponenten für die einzelnen Bildschirme
  App.tsx              Zustandsautomat, der Bildschirme und Spiellogik verbindet
  app.css              Styling (Dark Theme)
```
