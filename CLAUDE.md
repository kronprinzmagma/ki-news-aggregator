# ki-news-aggregator

CLI-Tool, das täglich KI-relevante Artikel aus mehreren Quellen aggregiert, per Claude API auf Relevanz scored und als kompaktes GitHub-Issue ausgibt.

## Architektur

Drei Bausteine, sequenziell:

1. **Ingest** – Artikel aus heterogenen Quellen holen und in ein einheitliches JSON-Schema normalisieren (titel, url, datum, quelle, rohtext)
2. **Score** – Jeden Artikel per Claude API bewerten (Relevanz-Score 1-5, Einzeiler-Begründung), strukturierter JSON-Output
3. **Deliver** – Top-Artikel als Markdown-Summary speichern und als GitHub Issue veröffentlichen

## Stack

- Node.js, keine Frameworks
- Claude API via REST: `claude-haiku-4-5-20251001` fürs Scoring (System-Prompt mit Prompt Caching), `claude-sonnet-4-6` fürs Delivering und Weekly
- Geteilte Module in `lib/`: `claude` (Retry, Caching), `github`, `http` (SSRF-Schutz), `config` (Modelle, Schwellwerte, Stopwords), `text-utils`, `topic-overlap` (vereinheitlichte Heuristik), `schema` (Zod), `store` (SQLite), `issue-format` (versionierte HTML-Kommentar-Metadaten), `env`, `date`
- Adapter-Basis in `adapters/_base.js`: HTTP-GET, RSS-/Atom-Parsing, Content-Extraktion, Enrichment
- SQLite-Persistenz (`better-sqlite3`, lokale `ki-news.db`) für Cross-Day-Dedup und Run-Historie; JSON-Files (`articles-*.json`, `scored-*.json`, `run-summary-*.json`) bleiben als Audit-Artefakte

## Quellen (Baustein 1)

- RSS/Atom-Feeds: Simon Willison, Latent Space, Anthropic News, Hacker News, Last Week in AI, VentureBeat, Hugging Face, Ahead of AI, Interconnects, The Batch, Yannic Kilcher
- NewsAPI-Adapter existiert, ist aber aktuell nicht im Haupt-Ingest aktiviert

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

- CLI-Befehl `node score.js` liest `articles-YYYY-MM-DD.json` für `RUN_DATE` oder das heutige UTC-Datum ein
- Jeder Artikel wird per Claude API (`claude-haiku-4-5-20251001`) bewertet
- Relevanzprofil: Capability-Sprünge bei Modellen, hands-on Tooling/Pattern (SDKs, MCP, Eval, Prompting), Architektur-Erkenntnisse zu agentischen Systemen, strategische Marktverschiebungen
- Niedrige Relevanz: generische "KI verändert Branche"-Artikel, reine VC-Meldungen, Show-HN ohne Differenzierung, Marketing ohne neue Capability
- Antwort als strukturierter JSON: score (1-5), begründung (1 Satz)
- Rate Limiting: maximal 5 parallele Requests, Retry bei 429
- Ergebnis wird als scored-YYYY-MM-DD.json gespeichert (alle Artikel >= 3 gespeichert)

## Akzeptanzkriterien Baustein 3 (Deliver)

- CLI-Befehl `node deliver.js` liest `scored-YYYY-MM-DD.json` für dasselbe Laufdatum ein
- Nur Artikel mit Score >= 4 werden verwendet
- Themen-Dedup: Bei gleichen Themen nur den stärkeren Artikel behalten
- Kein künstliches Mengenlimit; bei Gleichstand bevorzugt Lab-Quellen (anthropic, openai, deepmind)
- Jeder Artikel wird per Claude API aufbereitet in genau drei Blöcken (gesamt max. 120 Wörter):
  1. **Was ist neu** (max. 3 Sätze): nüchtern, kein Marketing, keine Titel-Wiederholung
  2. **Was es für die KI-Richtung heisst** (1–2 Sätze): Strömung dahinter
  3. **Build-Anker** (1–2 Sätze): konkret, ein Abend mit Claude Code – keine Backlog/Sprint-Anwendungen
- Jeder Artikel enthält im Issue zwei Feedback-Checkboxen: `Besonders wertvoll` und `Später weiterverfolgen`
- Überblick am Anfang: max. 4 Sätze, Trend des Tages, keine PO-/Stakeholder-Sprache
- Issue-Titel: `KI Daily – YYYY-MM-DD`
- Leerer Tag (kein Artikel >= 4): **kein Issue**, nur Log-Ausgabe
- Tagesübergreifende Dedup: Artikel, die bereits in einem der letzten 3 Issues erschienen sind, werden vor der Selektion gefiltert. Quelle ist primär die SQLite-DB (`ki-news.db`, Tabelle `issue_articles`); fällt zurück auf das Parsen der letzten GitHub-Issues, wenn die DB leer ist.
- Issue-Body enthält pro Artikel einen versionierten HTML-Kommentar-Marker `<!-- ki-news-meta: {...} -->`. Weekly und Cross-Day-Dedup lesen primär aus diesen Markern, fallen auf das `Score X/5 · [...](...)`-Regex zurück (Backwards Compatibility).
- Speichert als summary-YYYY-MM-DD.md
- Schreibt zusätzlich `run-summary-YYYY-MM-DD.json` als Debug-/Audit-Artefakt
- Führt eine Claude-only Review-Schlaufe aus: ausgewählte Issue-Artikel plus bis zu zwei ausgeschlossene Beispiele je niedriger Score-Stufe 1, 2 und 3 werden auf 4 Ebenen geprüft (Produkt-Relevanz, Technische Substanz, Lernwert, Aufbereitungsqualität) – inkl. Bewertung der geschriebenen drei Blöcke
- Rewrite-Loop: Artikel mit `needs_rewrite=true` werden sofort mit konkretem `rewrite_hint` neu aufbereitet, bevor sie ins Issue gehen
- Ergebnis und `process_adjustments` landen in `run-summary-YYYY-MM-DD.json`
- Tonalität: Deutsch, Schweizer Hochdeutsch, direkt

## Weekly Digest (`weekly.js`)

- CLI-Befehl `node weekly.js` erstellt ein wöchentliches Synthese-Issue
- Holt die letzten 7 KI-Daily-Issues per GitHub API, parst alle Artikel, URL-Dedup über Tage
- Score-5-Artikel kommen immer ins Issue (Pflicht); Claude wählt zusätzlich 1–2 Score-4-Artikel
- Pro Artikel drei Blöcke: Was passiert ist (faktisch) / Was das bedeutet / Kritische Einordnung
- Zusätzlich: Einleitung, Strömungen der Woche, Wochenimpuls
- Issue-Titel: `KI Weekly – KW XX (YYYY-MM-DD – YYYY-MM-DD)`

## Schedule

**Daily:** 05:30 UTC täglich (`daily-news.yml`), Wochenende eingeschlossen.
**Weekly:** 08:00 UTC sonntags (`weekly-digest.yml`), nach dem Daily.

Das Laufdatum kommt in GitHub Actions aus `RUN_DATE=YYYY-MM-DD`. Lokal wird das aktuelle UTC-Datum verwendet. Die Pipeline fällt bewusst nicht auf alte `articles-*` oder `scored-*` Dateien zurück, damit kein Daily-Issue aus veralteten Daten entsteht.

## Dokumentations-Pflicht nach jeder Änderung

Nach jeder Session, die Code oder Konfiguration ändert: `.context/doc-check.md` vollständig abarbeiten, bevor „alles aktualisiert" gesagt wird. Diese Checkliste definiert für jede Doku-Datei, welche Fakten mit dem Code übereinstimmen müssen.
