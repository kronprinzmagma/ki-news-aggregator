# ki-news-aggregator – Projektübersicht

## Zweck

Täglicher KI-News-Aggregator für den persönlichen Gebrauch. Holt Artikel aus mehreren Quellen, bewertet sie automatisch auf Relevanz und liefert ein kompaktes Daily-Issue auf GitHub. Kein Dashboard, kein Frontend, kein Team-Tool – ein persönliches Frühwarnsystem für relevante KI-Entwicklungen.

## Persona

Solo-Entwickler, der sich hands-on Richtung KI-Builder entwickelt. Baut eigene Tools mit Claude Code und Anthropic API. Will verstehen, wohin sich das KI-Feld bewegt – für die eigene strategische Positionierung und als Input für konkrete Abendprojekte.

**Explizit nicht im Scope:** PO-Prozesse, Backlog-Pflege, Stakeholder-Kommunikation, Sprint-Mechanik, Jira-/Linear-Integrationen.

## Architektur

```
ingest.js → articles-YYYY-MM-DD.json
score.js  → scored-YYYY-MM-DD.json
deliver.js → summary-YYYY-MM-DD.md + GitHub Issue
```

**Ingest** (`ingest.js`): Lädt Artikel aus allen aktiven Adaptern parallel, normalisiert auf einheitliches Schema, dedupliziert per URL, filtert Artikel älter als 3 Tage.

**Score** (`score.js`): Bewertet jeden Artikel via Claude API mit Score 1–5 und einer Begründung. Maximal 5 parallele Requests, Retry bei 429. Speichert alle Artikel mit Score >= 3.

**Deliver** (`deliver.js`): Liest scored-*.json, filtert auf Score >= 4, dedupliziert Themen-Cluster, wählt max. 5 Artikel (Lab-Quellen bevorzugt bei Gleichstand), bereitet jeden Artikel in drei Blöcken auf, erstellt GitHub Issue.

**Adapter** (`adapters/`): Jeder Adapter ist ein eigenes Modul mit `fetchArticles()`-Export. Liefert Array von `{ titel, url, datum, quelle, rohtext }`. Fehler einzelner Adapter brechen den Gesamtlauf nicht ab.

**GitHub Actions** (`.github/workflows/daily-news.yml`): Cron `0 16 * * 1-5` → Mo–Fr 16:00 UTC (= 18:00 CEST / 17:00 CET). Wochenende deaktiviert.

## Was guten Output ausmacht

- **Max. 5 Artikel pro Issue** – Qualität vor Vollständigkeit
- **Nur Score >= 4** – kein Rauschen, kein "weitere Artikel"-Abschnitt
- **Pro Artikel genau drei Blöcke:**
  1. Was ist neu (max. 3 Sätze, nüchtern)
  2. Was es für die KI-Richtung heisst (1–2 Sätze)
  3. Build-Anker: eine konkrete Idee für ein Abendprojekt mit Claude Code (technisch, solo umsetzbar)
- **Keine Redundanz:** Wenn zwei Artikel denselben Trend beschreiben, gewinnt der stärkere
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
| Modellversion | `claude-haiku-4-5` für Score, `claude-sonnet-4-6` für Deliver |
