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

## Persona

Erfahrene Senior-Produktperson, die sich hands-on Richtung KI-Builder entwickelt. Setzt eigene Tools mit Claude Code und Anthropic API um. Will die Entwicklungsrichtung der KI für strategische Positionierung verstehen. **Nicht Teil der Persona:** Backlog-Pflege, Tickets, Stakeholder-Kommunikation, Sprint-Mechanik.

## Akzeptanzkriterien Baustein 2 (Score)

- CLI-Befehl `node score.js` liest das neueste articles-*.json ein
- Jeder Artikel wird per Claude API (claude-sonnet-4-6) bewertet
- Relevanzprofil: Capability-Sprünge bei Modellen, hands-on Tooling/Pattern (SDKs, MCP, Eval, Prompting), Architektur-Erkenntnisse zu agentischen Systemen, strategische Marktverschiebungen
- Niedrige Relevanz: generische "KI verändert Branche"-Artikel, reine VC-Meldungen, Show-HN ohne Differenzierung, Marketing ohne neue Capability
- Antwort als strukturierter JSON: score (1-5), begründung (1 Satz)
- Rate Limiting: maximal 5 parallele Requests, Retry bei 429
- Ergebnis wird als scored-YYYY-MM-DD.json gespeichert (alle Artikel >= 3 gespeichert)

## Akzeptanzkriterien Baustein 3 (Deliver)

- CLI-Befehl `node deliver.js` liest das neueste scored-*.json ein
- Nur Artikel mit Score >= 4 werden verwendet
- Themen-Dedup: Bei gleichen Themen nur den stärkeren Artikel behalten
- Maximal 5 Artikel pro Issue; bei Gleichstand bevorzugt Lab-Quellen (anthropic, openai, deepmind)
- Jeder Artikel wird per Claude API aufbereitet in genau drei Blöcken (gesamt max. 120 Wörter):
  1. **Was ist neu** (max. 3 Sätze): nüchtern, kein Marketing, keine Titel-Wiederholung
  2. **Was es für die KI-Richtung heisst** (1–2 Sätze): Strömung dahinter
  3. **Build-Anker** (1–2 Sätze): konkret, ein Abend mit Claude Code – keine Backlog/Sprint-Anwendungen
- Überblick am Anfang: max. 4 Sätze, Trend des Tages, keine PO-/Stakeholder-Sprache
- Issue-Titel: `KI Daily – YYYY-MM-DD`
- Leerer Tag (kein Artikel >= 4): **kein Issue**, nur Log-Ausgabe
- Speichert als summary-YYYY-MM-DD.md
- Tonalität: Deutsch, Schweizer Hochdeutsch, direkt

## Schedule

Mo–Fr, 06:00 UTC (= 08:00 CEST / 07:00 CET). Wochenende deaktiviert (für spätere Weekly/Monthly-Synthesis reserviert).
