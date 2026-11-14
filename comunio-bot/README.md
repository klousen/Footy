# Comunio-Bot

Analysiert einmal täglich Kader und Transfermarkt deiner Comunio-Liga, gleicht die Marktwerte mit den Prognosen von com-analytics.de und den Leistungsdaten von Understat ab und schickt dir Kauf- und Verkaufsempfehlungen per ntfy aufs Handy. Erst wenn du auf **✅** tippst, gibt der Bot das Gebot ab oder stellt den Spieler auf den Transfermarkt. Ziel ist ein möglichst hoher Kontostand.

## So entscheidet der Bot

Für jeden Spieler im Kader und auf dem Markt wird die erwartete Marktwertentwicklung geschätzt:

| Signal | Gewicht | Quelle |
|---|---|---|
| Prognose für morgen | 55 % | com-analytics.de (Spielerprofil) |
| Eigener Trend der letzten Tage | 20 % | tägliche Snapshots (anfangs 7-Tage-Änderung von com-analytics) |
| Einsatzzeit, xG+xA pro 90 | 15 % | Understat |
| Punkte am letzten Spieltag | 10 % | Comunio |

Dazu kommen Zu- oder Abschläge für die Empfehlung von com-analytics (Kaufen/Verkaufen) und für Verletzungen.

**Kaufen**, wenn der erwartete Wert nach dem Prognosezeitraum das Gebot um mindestens `MIN_EXPECTED_GAIN_PCT` übersteigt. Der Zeitraum ist mindestens so lang wie die Kauf-Sperre, weil ein gekaufter Spieler vorher nicht verkauft werden kann. Das Gebot liegt 2 bis 6 % über dem Angebotspreis, je stärker das Signal, desto höher.

**Verkaufen**, wenn ein Wertverlust von mehr als `SELL_THRESHOLD_PCT` erwartet wird.

**Feste Regeln**
- Nie mehr bieten als Kontostand minus offene Gebote minus Reserve. Comunio bucht Gebote erst bei Ausführung ab, deshalb werden offene Gebote mitgerechnet.
- Ist der Kontostand nach offenen Geboten negativ, schlägt der Bot Verkäufe vor, bis er ausgeglichen ist.
- Gekaufte Spieler sind `SELL_LOCK_DAYS` (Standard 3) Tage gesperrt und werden in dieser Zeit nie zum Verkauf vorgeschlagen.
- Mindestbesetzung je Position bleibt erhalten, die Kadergröße wird nicht überschritten.
- Keine verletzten Spieler kaufen, nichts kaufen, was com-analytics zum Verkauf empfiehlt.
- Vor jeder Ausführung prüft der Bot alles noch einmal frisch (Spieler noch da, Budget reicht, Sperre abgelaufen). Empfehlungen verfallen nach 20 Stunden.

## Einrichtung (ca. 20 Minuten)

1. **Repository anlegen**: Den Ordner in ein privates GitHub-Repository hochladen.
2. **Vercel**: Auf vercel.com „Add New Project“, Repository importieren, deployen.
3. **Redis**: Im Vercel-Projekt unter *Storage* über den Marketplace **Upstash Redis** hinzufügen (kostenloser Tarif reicht). Vercel setzt die Variablen automatisch.
4. **ntfy**: App „ntfy“ installieren (iOS/Android), mit **+** ein Thema abonnieren. Der Name sollte lang und zufällig sein, denn jeder, der ihn kennt, kann mitlesen.
5. **Umgebungsvariablen** in Vercel unter *Settings > Environment Variables* setzen (Vorlage: `.env.example`). Pflicht sind `COMUNIO_USERNAME`, `COMUNIO_PASSWORD`, `NTFY_TOPIC`, `APP_URL`, `SIGNING_SECRET`, `DASHBOARD_PASSWORD`, `CRON_SECRET`. Danach neu deployen.
6. **Community- und User-ID** (nur falls der erste Lauf meldet, dass sie fehlen): comunio.de im Browser öffnen, Entwicklertools (F12) > *Netzwerk*, Transfermarkt anklicken. In den Aufrufen an `api.comunio.de` steht `/communities/<ID>/users/<ID>/...`. Beide Zahlen als `COMUNIO_COMMUNITY_ID` und `COMUNIO_USER_ID` eintragen.
7. **Testen**: Dashboard öffnen (`APP_URL`), mit dem Passwort anmelden, **Testlauf (ohne Push)** drücken. Danach **Rohdaten** öffnen und prüfen, ob Marktwerte, Punkte und Kontostand plausibel sind (siehe unten).
8. **Scharf schalten**: **Jetzt analysieren** drücken. Die Push-Nachrichten sollten ankommen. Ab dann läuft der Bot täglich um 7:40 Uhr (Winterzeit; Vercel Hobby kann bis zu einer Stunde abweichen). Uhrzeit änderbar in `vercel.json` (UTC).

## Was du beim ersten Lauf prüfen solltest

Die Comunio-Schnittstelle ist nicht offiziell. Die Endpunkte stammen aus einem Projekt, das sie im August 2026 auf der spanischen Comunio-Version (gleiche Plattform) mitgeschnitten und mit echten Geboten getestet hat. Gegen comunio.de selbst ist der Code noch nicht gelaufen. Deshalb:

- **Rohdaten** ansehen: Heißen die Felder wie erwartet (`quotedPrice`/`quotedprice`, `lastPoints`, `credit`, `price` am Marktangebot, `purchaseInfo`)? Falls nicht, in `lib/comunio.ts` in `normalizePlayer` / `parseMarket` ergänzen.
- **Kaufdatum**: Liefert Comunio kein Kaufdatum (`purchaseInfo.date`), merkt sich der Bot selbst, seit wann ein Spieler im Kader ist. Spieler, die beim ersten Lauf schon da sind, gelten als nicht gesperrt.
- **Erstes Gebot** mit kleinem Betrag bestätigen und in der Comunio-App kontrollieren.
- **com-analytics-Zuordnung**: Der Bot nimmt an, dass com-analytics die Comunio-Spieler-IDs nutzt, und prüft den Namen. Spieler ohne Treffer stehen im Dashboard unter „Ohne com-analytics-Daten“. Abweichende IDs per `CA_ID_OVERRIDES` zuordnen (die ID steht in der URL `com-analytics.de/player/<ID>`).

## Hinweise

- Automatisiertes Bieten verstößt sehr wahrscheinlich gegen die Nutzungsbedingungen von Comunio. Im schlimmsten Fall droht eine Sperre des Accounts. Der Bot handelt nur nach deiner Bestätigung und ruft wenige Seiten pro Tag ab.
- Eingehende Kaufangebote anderer Manager für deine Spieler nimmst du weiterhin in der Comunio-App an. Der passende Endpunkt ist noch nicht mitgeschnitten.
- Die Gewichte sind ein begründeter Startpunkt, kein kalibriertes Modell. Nach einigen Wochen lohnt sich ein Blick in den Verlauf, welche Empfehlungen aufgegangen sind.

## Entwicklung

```bash
npm install
npm test          # Strategie, Parser, kompletter Lauf mit simulierten Antworten
npm run typecheck
npm run dev       # lokal, .env.local anlegen
```

Struktur: `lib/comunio.ts` (API-Client), `lib/comanalytics.ts`, `lib/understat.ts` (Datenquellen), `lib/strategy.ts` (Entscheidungslogik), `lib/pipeline.ts` (täglicher Lauf), `lib/execute.ts` (Ausführung nach Bestätigung), `lib/ntfy.ts` (Push mit Buttons), `app/` (Dashboard und API-Routen).
