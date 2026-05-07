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

**Deliver** (`deliver.js`): Liest `scored-YYYY-MM-DD.json` für dasselbe Laufdatum, filtert auf Score >= 4, dedupliziert Themen-Cluster, wählt max. 5 Artikel (Lab-Quellen bevorzugt bei Gleichstand), bereitet jeden Artikel in drei Blöcken auf, erstellt GitHub Issue.

**Adapter** (`adapters/`): Jeder Adapter ist ein eigenes Modul mit `fetchArticles()`-Export. Liefert Array von `{ titel, url, datum, quelle, rohtext }`. Fehler einzelner Adapter brechen den Gesamtlauf nicht ab.

**GitHub Actions** (`.github/workflows/daily-news.yml`): Cron `30 5 * * 1-5` → Mo–Fr 05:30 UTC (= 07:30 CEST / 06:30 CET). Wochenende deaktiviert.

## Was guten Output ausmacht

- **Max. 5 Artikel pro Issue** – Qualität vor Vollständigkeit
- **Nur Score >= 4** – kein Rauschen, kein "weitere Artikel"-Abschnitt
- **Pro Artikel genau drei Blöcke:**
  1. Was ist neu (max. 3 Sätze, nüchtern)
  2. Warum es produktrelevant ist (1–2 Sätze)
  3. Projektanker: eine konkrete Idee, um die Entwicklung selbst zu prüfen oder in einem Prototyp nutzbar zu machen
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
| Modellversion | `claude-haiku-4-5` für Score, `claude-sonnet-4-6` für Deliver |
| Laufdatum | `RUN_DATE=YYYY-MM-DD` in CI; lokal fällt der Lauf auf das aktuelle UTC-Datum zurück |
