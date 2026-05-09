# Working Map

Diese Datei ist eine knappe Orientierung für die aktuelle Arbeit. Keine vollständige Projektinventur.

## Immer relevant für den aktuellen Stand

- `.context/current-state.md`: Aktueller Arbeitsstand, Entscheidungen, offene Punkte. Zuerst lesen.
- `.tasks/NEXT.md`: Nächster empfohlener Arbeitsschritt mit Scope und Akzeptanzkriterien. Danach lesen.

## Schedule / GitHub Actions

- `.github/workflows/daily-news.yml`: Hauptworkflow für Daily-News. Aktuell auf täglich `30 5 * * *` geändert.
- `.github/workflows/watchdog.yml`: Fallback, der den Hauptworkflow nachtriggert, falls er am UTC-Tag nicht gelaufen ist. Aktuell auf täglich `0 7 * * *` geändert.

Nicht erneut breit analysieren:

- `.github/workflows/close-old-issues.yml`: Für die aktuelle Eval-/Schedule-Arbeit nicht relevant, ausser es geht um Issue-Hygiene.
- `.github/workflows/eval.yml`: Nur relevant, wenn Eval-CI oder Artefakt-Upload geändert werden soll.

## Scoring / Delivery

- `score.js`: Produktionsprompt und Scoring-Logik. Wichtig für Prompt-Sync mit `evals/run_eval.py`.
- `deliver.js`: Issue-Format, Score-Schwelle, Dedup, GitHub-Issue-Erstellung und Claude-only Review-Schlaufe. Enthält Feedback-Checkboxen pro Artikel, Erhaltungslogik für bereits gesetzte Häkchen bei Issue-Updates und advisory Review-Ergebnisse in der Run-Summary.

Nicht erneut vollständig lesen:

- Adapter in `adapters/`: Nur lesen, wenn Quellenlogik, Feed-Probleme oder Artikelqualität untersucht werden.
- `adapters/latentspace.js`: Relevant bei dünnen Latent-Space-Teasern; lädt jetzt bei kurzen Feed-Texten die Artikelseite nach.
- `adapters/willison.js`: Relevant bei dünnen Simon-Willison-Teasern; lädt jetzt bei kurzen Feed-Texten die Artikelseite nach.

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
- `REVIEW.md`: Untracked; nicht Teil der aktuellen Änderungen.
- `.git/`: Keine destruktiven Git-Befehle.
