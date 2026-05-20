# Working Map

Diese Datei ist eine knappe Orientierung für die aktuelle Arbeit. Keine vollständige Projektinventur.

## Immer relevant für den aktuellen Stand

- `.context/current-state.md`: Aktueller Arbeitsstand, Entscheidungen, offene Punkte. Zuerst lesen.
- `.tasks/NEXT.md`: Nächster empfohlener Arbeitsschritt mit Scope und Akzeptanzkriterien. Danach lesen.

## Schedule / GitHub Actions

- `.github/workflows/daily-news.yml`: Hauptworkflow für Daily-News. Aktuell auf täglich `30 5 * * *` geändert.
- `.github/workflows/watchdog.yml`: Theoretischer Fallback (07:00 UTC), nutzt aber dieselbe GitHub-Schedule-Mechanik – gleich unzuverlässig wie der Hauptworkflow. Kein verlässlicher Fallback.

Nicht erneut breit analysieren:

- `.github/workflows/close-old-issues.yml`: Für die aktuelle Eval-/Schedule-Arbeit nicht relevant, ausser es geht um Issue-Hygiene.
- `.github/workflows/eval.yml`: Nur relevant, wenn Eval-CI oder Artefakt-Upload geändert werden soll.

## Scoring / Delivery

- `score.js`: Produktionsprompt und Scoring-Logik. Wichtig für Prompt-Sync mit `evals/run_eval.py`. System-Prompt mit `cache_control` markiert (Prompt Caching).
- `deliver.js`: Issue-Format mit versionierten HTML-Kommentar-Metadaten pro Artikel, Score-Schwelle, Dedup, GitHub-Issue-Erstellung, Claude-only Review-Schlaufe inkl. Rewrite-Loop, Feedback-Checkboxen mit Erhalt der Häkchen bei Issue-Updates.

## Lib (Phase 7 – Architektur-Refactor)

- `lib/config.js`: Modelle, Repo-Slug, Score-Schwellen, Lab-Quellen, Stopwords. Zentrale Konstanten – nicht im Code verteilen.
- `lib/claude.js`: Anthropic-API-Helper mit Retry, Prompt Caching, `callClaude/claudeText/claudeJson`. Wird von score/deliver/weekly genutzt.
- `lib/github.js`: GitHub-API-Helper + `ghPath` für REPO_SLUG-relative Routen.
- `lib/http.js`: SSRF-sicherer GET-Helper für alle Adapter.
- `lib/topic-overlap.js`: Eine Token-Overlap-Implementierung für Event-Dedup, Cluster-Bonus, Themen-Dedup, Related-Links.
- `lib/store.js`: SQLite-Persistenz (`better-sqlite3`, DB-Datei `ki-news.db`, lokal generiert, nicht im Repo). Cross-Day-Dedup liest aus `issue_articles`.
- `lib/issue-format.js`: HTML-Kommentar-Metadaten (`<!-- ki-news-meta: {...} -->`) für robustes Re-Parsing. Weekly nutzt das zuerst, Regex-Fallback bleibt.
- `lib/schema.js`: Zod-Schemas; Validierung beim Lesen von `articles-*.json`/`scored-*.json`.
- `adapters/_base.js`: Gemeinsame Adapter-Basis (`httpGet`, `parseRss`, `parseAtom`, `extractArticleText`, `enrichFromUrl`). Neue Adapter brauchen ~10 LOC.

Nicht erneut vollständig lesen:

- Adapter in `adapters/`: Nur lesen, wenn Quellenlogik, Feed-Probleme oder Artikelqualität untersucht werden. Alle Adapter sind dünn (10–40 LOC) und delegieren an `_base.js`.

## Evals

- `evals/run_eval.py`: Eval-Runner. Aktuell bekannter Drift zum Produktionsprompt in `score.js`.
- `evals/goldstandard.json`: Goldstandard. Enthält aktuell noch drei generische Platzhalter.
- `evals/EVALS.md`: Eval-Doku; enthält jetzt Anleitung zur Review-Oberfläche.
- `evals/review-ui/server.js`: Lokaler HTTP-Server, liest `articles-*.json`, schreibt `evals/goldstandard.json`.
- `evals/review-ui/index.html`: UI-Struktur.
- `evals/review-ui/app.js`: Frontend-Logik, Filter, Review-Stapel, Bewertung per Button/Tastatur.
- `evals/review-ui/styles.css`: Styling der Review-Oberfläche.
- `package.json`: Enthält `npm run eval:review`.

Nur bei Bedarf lesen:

- `articles-*.json`: Nur konkrete Runs öffnen, wenn echte Goldstandard-Artikel bewertet oder Debug-Daten geprüft werden.
- `scored-*.json`: Nur relevant, wenn Modellscore-Auswahl oder Score-Verteilungen geprüft werden.
- `summary-*.md`: Nur relevant, wenn Output-Qualität der erzeugten Issues betrachtet wird.

## Projekt-Doku

- `PROJECT.md`: Projektüberblick und Schedule-Doku.
- `CLAUDE.md`: Arbeits-/Projektkontext für Claude-artige Sessions.
- `ROADMAP.md`: Offene Richtung, insbesondere Weekly/Monthly-Synthesis.

Nicht erneut lesen, wenn nur an Eval-UI oder Eval-Metriken gearbeitet wird, ausser Doku muss aktualisiert werden.

## Bewusst nicht anfassen

- `.env`: Enthält lokale Secrets. Nicht lesen, nicht zitieren, nicht committen.
- `REVIEW.md`: Tracked; enthält Code-Review-Findings aus 2026-05-08 bis 2026-05-10 – alle als [FIXED] markiert.
- `.git/`: Keine destruktiven Git-Befehle.
