# ki-news-aggregator

CLI-Tool das täglich KI-relevante Artikel aus mehreren Quellen aggregiert, per Claude API auf Relevanz scored und als kompaktes Markdown-Summary ausgibt.

## Architektur

Drei Bausteine, sequenziell:

1. **Ingest** – Artikel aus heterogenen Quellen holen und in ein einheitliches JSON-Schema normalisieren (titel, url, datum, quelle, rohtext)
2. **Score** – Jeden Artikel per Claude API bewerten (Relevanz-Score 1-5, Einzeiler-Begründung), strukturierter JSON-Output
3. **Deliver** – Top-Artikel als Markdown-Summary ausgeben

## Stack

- Node.js, keine Frameworks
- Claude API (claude-sonnet-4-6) via REST
- Keine Datenbank – JSON-Files für Zwischenergebnisse

## Quellen (Baustein 1)

- RSS/Atom-Feed: Simon Willison's Blog (XML parsen)
- REST-API mit API-Key: NewsAPI.org (Developer-Tier)
- Dritte Quelle nach Bedarf

## Akzeptanzkriterien Baustein 1 (Ingest)

- CLI-Befehl `node ingest.js` holt Artikel aus mindestens 2 Quellen
- Jede Quelle hat einen eigenen Adapter (eigenes Modul)
- Alle Adapter liefern dasselbe JSON-Schema zurück
- Duplikate werden per URL erkannt und gefiltert
- Ergebnis wird als JSON-File gespeichert (z.B. articles-2025-04-08.json)
- Fehler einzelner Quellen brechen nicht den ganzen Lauf ab
