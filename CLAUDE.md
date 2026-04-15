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

## Akzeptanzkriterien Baustein 2 (Score)

- CLI-Befehl `node score.js` liest das neueste articles-*.json ein
- Jeder Artikel wird per Claude API (claude-sonnet-4-6) bewertet
- Prompt enthält Relevanzprofil: KI-Produktentwicklung, Agentic Coding, API-Design, Datengetriebene Entscheidungslogik
- Antwort als strukturierter JSON: score (1-5), begründung (1 Satz)
- Rate Limiting: maximal 5 parallele Requests, Retry bei 429
- Ergebnis wird als scored-YYYY-MM-DD.json gespeichert
- Artikel mit Score < 3 werden aussortiert

## Akzeptanzkriterien Baustein 3 (Deliver)

- CLI-Befehl `node deliver.js` liest das neueste scored-*.json ein
- Die Top-Artikel (Score >= 4) werden per Claude API einzeln aufbereitet mit folgendem Prompt-Profil:

  "Der Leser ist ein erfahrener Product Owner / Product Manager im Schweizer Digital-Umfeld. Er ist kein Entwickler. Er will verstehen:
  1. Was ist die Kernaussage? (1-2 Sätze, kein Tech-Jargon)
  2. Was bedeutet das für meine Arbeit als PO? (1-2 Sätze, konkreter Bezug zu Produktentwicklung, Teamführung oder Stakeholder-Kommunikation)
  3. Projektidee: Was könnte man damit konkret machen? (1 Satz, umsetzbar)

  Schreib direkt und knapp, wie eine Slack-Nachricht an einen Kollegen. Kein Marketing, keine Floskeln, kein 'könnte interessant sein'."

- Artikel mit Score 3 werden nur als Link-Liste aufgeführt
- Am Anfang ein Überblick in 2-3 Sätzen: Was waren die wichtigsten Themen und was sollte ein PO davon mitnehmen?
- Speichert als summary-YYYY-MM-DD.md
- Tonalität: Deutsch, Schweizer Hochdeutsch, direkt
