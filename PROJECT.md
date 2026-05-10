# ki-news-aggregator – Projektübersicht

## Zweck

Täglicher KI-News-Aggregator für den persönlichen Gebrauch. Holt Artikel aus mehreren Quellen, bewertet sie automatisch auf Relevanz und liefert ein kompaktes Daily-Issue auf GitHub.

Der Zweck ist ein persönlicher PM-/Produkt-Intelligence-Feed: wichtige KI-Entwicklungen früh erkennen, ihre Bedeutung für Produktstrategie, AI-Adoption, Build-vs-Buy, Kosten, Risiken und Nutzererwartungen verstehen und daraus konkrete Denk- oder Prototyp-Impulse ableiten. Kein Dashboard, kein Frontend, kein Team-Tool.

## Persona

Product Owner / Product Manager mit technischer Hands-on-Ambition. Will wichtige KI-Entwicklungen früh verstehen: was ändert sich für Produktstrategie, AI-Adoption, Build-vs-Buy, Kosten, Risiken, Nutzererwartungen und eigene Prototypen? Baut eigene Tools mit Claude Code und Anthropic API, aber der Primärfilter ist nicht "kann ich daraus ein Mini-Tool bauen?", sondern "ändert das meine Produkt- oder Markt-Sicht?"

**Explizit nicht im Scope:** Backlog-Pflege, Sprint-Mechanik, Ticket-Optimierung, generische Stakeholder-Kommunikation, Jira-/Linear-Integrationen.

## Architektur

```
ingest.js → articles-YYYY-MM-DD.json
score.js  → scored-YYYY-MM-DD.json
deliver.js → summary-YYYY-MM-DD.md + GitHub Issue
```

**Ingest** (`ingest.js`): Lädt Artikel aus allen aktiven Adaptern parallel, normalisiert auf einheitliches Schema, dedupliziert per URL, filtert Artikel älter als 3 Tage.

**Score** (`score.js`): Liest `articles-YYYY-MM-DD.json` für das aktuelle Laufdatum (`RUN_DATE` oder heutiges UTC-Datum), bewertet jeden Artikel via Claude API mit Score 1–5 und einer Begründung. Maximal 5 parallele Requests, Retry bei 429. Speichert alle Artikel mit Score >= 3.

**Textqualität**: Dünne Feed-Einträge werden angereichert. Latent Space, Simon Willison, Interconnects, Last Week in AI und Ahead of AI laden bei kurzen Teasern die Artikelseite nach. Simon Willison fetcht zusätzlich externe Links wenn der Seitentext unter 2500 Zeichen bleibt.

**Deliver** (`deliver.js`): Liest `scored-YYYY-MM-DD.json` für dasselbe Laufdatum, filtert auf Score >= 4, dedupliziert Themen-Cluster, bereitet jeden Artikel in drei Blöcken auf, erstellt GitHub Issue.

**Review-Schlaufe + Rewrite-Loop** (`deliver.js`): Nach der Aufbereitung bewertet Claude jeden Artikel auf 4 Ebenen (Produkt-Relevanz, Technische Substanz, Lernwert, Aufbereitungsqualität) – inkl. der geschriebenen drei Blöcke. Artikel mit `needs_rewrite=true` werden sofort mit konkretem `rewrite_hint` neu aufbereitet, bevor sie ins Issue gehen. Zusätzlich werden bis zu zwei ausgeschlossene Beispiele je Score-Stufe 1/2/3 geprüft. Ergebnis und `process_adjustments` landen in `run-summary-YYYY-MM-DD.json`.

**Adapter** (`adapters/`): Jeder Adapter ist ein eigenes Modul mit `fetchArticles()`-Export. Liefert Array von `{ titel, url, datum, quelle, rohtext }`. Fehler einzelner Adapter brechen den Gesamtlauf nicht ab.

**GitHub Actions** (`.github/workflows/daily-news.yml`): Cron `30 5 * * *` → täglich 05:30 UTC (= 07:30 CEST / 06:30 CET). Ein Tag ohne relevante Artikel erzeugt weiterhin kein Issue.

**Weekly Digest** (`.github/workflows/weekly-digest.yml`): Cron `0 8 * * 0` → sonntags 08:00 UTC. `weekly.js` aggregiert alle Artikel der letzten 7 Daily-Issues (URL-Dedup), teilt sie in Pflicht (Score 5, immer dabei) und Optional (Score 4, Claude wählt 1–2) auf, und erstellt per Claude Sonnet ein wöchentliches Synthese-Issue: Einleitung, Top-Entwicklungen mit dreistufiger Aufbereitung (was passiert / Implikation / kritische Einordnung), Strömungen der Woche, Wochenimpuls.

## Was guten Output ausmacht

- **Kein künstliches Mengenlimit** – Relevanz gewinnt, typisch 3–5 Artikel pro Issue
- **Nur Score >= 4** – kein Rauschen, kein "weitere Artikel"-Abschnitt
- **Pro Artikel genau drei Blöcke:**
  1. Was ist neu (max. 3 Sätze, nüchtern, keine Halluzinationen)
  2. Was es für die KI-Richtung heisst (1–2 Sätze, Strömung dahinter)
  3. Build-Anker: aktiver Imperativsatz, konkret genug für einen Abend mit Claude Code
- **Feedback im Issue:** Pro Artikel Checkboxen für `Besonders wertvoll` und `Später weiterverfolgen`
- **Keine Redundanz:** Wenn zwei Artikel denselben Trend beschreiben, gewinnt der stärkere
- **Keine künstliche Quellenquote:** Wenn die fünf relevantesten Artikel aus derselben Quelle kommen, ist das okay – Relevanz gewinnt.
- **Leerer Tag = kein Issue** – ein Tag ohne relevante News ist kein Fehler

## Constraints

| Constraint | Detail |
|---|---|
| Runtime | Node.js, keine Frameworks, ESM |
| LLM-Modell Scoring | Claude Haiku (kostensensitiv, viele Artikel pro Tag) |
| LLM-Modell Deliver | Claude Sonnet (höhere Qualität, wenige Aufrufe) |
| Delivery-Channel | Ausschliesslich GitHub Issues im gleichen Repo |
| Secrets | `ANTHROPIC_API_KEY` und `GH_PAT` via `.env` lokal / GitHub Secrets in CI |
| Datenhaltung | Keine Datenbank – JSON-Files im Repo-Root als Zwischenergebnisse |
| Modellversion | `claude-haiku-4-5-20251001` für Score, `claude-sonnet-4-6` für Deliver und Weekly |
| Laufdatum | `RUN_DATE=YYYY-MM-DD` in CI; lokal fällt der Lauf auf das aktuelle UTC-Datum zurück |
