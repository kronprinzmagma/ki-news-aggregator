# Current State

Stand: 2026-05-09

## Woran gerade gearbeitet wird

Das Projekt wird so weiterentwickelt, dass der tägliche KI-News-Aggregator weniger blinde Flecken hat und künftige Arbeitssessions weniger Kontext rekonstruieren müssen.

Aktueller Fokus:

- Daily-News auch am Wochenende laufen lassen.
- Eval-Goldstandard für Scoring-Qualität praktikabel pflegen.
- Tokenverbrauch künftiger Codex-/Claude-Code-Sessions reduzieren.

## Bereits implementiert/geändert

- `.github/workflows/daily-news.yml`: Daily-Workflow von Mo-Fr auf täglich umgestellt (`30 5 * * *`).
- `.github/workflows/watchdog.yml`: Watchdog ebenfalls auf täglich umgestellt (`0 7 * * *`), damit der Fallback auch am Wochenende greift.
- `PROJECT.md`, `CLAUDE.md`, `ROADMAP.md`: Schedule-Doku aktualisiert. Daily läuft täglich; leere Tage erzeugen weiterhin kein Issue; Weekly/Monthly bleibt separates Format.
- `package.json`: Script `npm run eval:review` ergänzt.
- `evals/review-ui/`: Lokale Browser-Oberfläche für manuelle Goldstandard-Bewertungen erstellt.
- `evals/review-ui/`: Review-Oberfläche trennt jetzt Daily-Score für die sichtbare Aufbereitung (`human_score`) und optionales Problem-Label (`input_quality`).
- `evals/EVALS.md`: Anleitung zur Review-Oberfläche ergänzt.
- `deliver.js`: Daily-Issues enthalten pro Artikel zwei Feedback-Checkboxen: `Besonders wertvoll` und `Später weiterverfolgen`. Beim Aktualisieren bestehender Issues werden vorhandene Häkchen pro Artikel-URL erhalten.
- `deliver.js`: Claude-only Review-Schlaufe ergänzt. Sie bewertet advisory die final ausgewählten Artikel plus bis zu zwei ausgeschlossene Beispiele je niedriger Score-Stufe 1, 2 und 3 und speichert Ergebnisse/Prozessempfehlungen in `run-summary-YYYY-MM-DD.json`.
- Lokaler sicherer Testrun mit `RUN_DATE=2026-04-10` in `/tmp/ki-news-deliver-test.MWkcuG`: Delivery lief ohne GitHub-Mutation (`GH_PAT` leer), Review-Schlaufe schrieb strukturierte Ergebnisse ohne Fehler. Testdatensatz hatte 6 ausgewählte Artikel und nur Score-3-Ausschlüsse, daher 2 Low-Score-Samples.
- `adapters/latentspace.js`: Dünne Feed-Teaser werden jetzt per Artikelseite auf bis zu 4000 Zeichen angereichert. Der konkrete GPT-Realtime/Translate/Whisper-Beispielartikel liefert im Adaptertest jetzt 4000 Zeichen statt nur Titel + Einzeiler.
- `adapters/willison.js`: Kurze Feed-Einträge werden nach Möglichkeit aus der Artikelseite angereichert.
- `score.js` und `deliver.js`: Scoring-/Aufbereitungs-Prompts erhalten jetzt bis zu 2500 Zeichen Rohtext statt 1500.

Der manuelle GitHub-Actions-Run für Samstag, 2026-05-09, wurde bereits über `workflow_dispatch` gestartet:

- URL: `https://github.com/kronprinzmagma/ki-news-aggregator/actions/runs/25597534827`
- Letzter bekannter Status in dieser Session: `in_progress`
- Branch: `main`

## Aktuell relevante Dateien

- `.github/workflows/daily-news.yml`
- `.github/workflows/watchdog.yml`
- `score.js`
- `deliver.js`
- `evals/run_eval.py`
- `evals/goldstandard.json`
- `evals/EVALS.md`
- `evals/review-ui/server.js`
- `evals/review-ui/index.html`
- `evals/review-ui/app.js`
- `evals/review-ui/styles.css`
- `package.json`
- `PROJECT.md`
- `CLAUDE.md`
- `ROADMAP.md`

## Annahmen

- Daily-Issues sollen künftig auch Samstag und Sonntag normal laufen.
- Ein leerer Tag bleibt ein erwartetes Ergebnis: kein relevantes Material bedeutet kein Issue.
- Weekly- und Monthly-Zusammenfassungen sind zusätzliche Formate, kein Ersatz für Daily.
- Der Goldstandard soll aus echten `articles-*.json` Runs entstehen, nicht aus erfundenen Beispielen.
- Die Review-Oberfläche soll Nicht-Entwickler-tauglich sein: Browser öffnen, Artikel bewerten, fertig.

## Getroffene Entscheidungen

- Keine strengere Weekend-Schwelle eingeführt. Wochenendartikel nutzen dieselbe Daily-Logik wie Werktage.
- Watchdog wurde zusammen mit dem Daily-Schedule auf täglich umgestellt.
- `AGENTS.md` wurde nicht neu erstellt, weil es im Repo nicht existierte und der aktuelle Token-Sparzweck mit `.context/` und `.tasks/` abgedeckt ist.
- Eval-Goldstandard soll schrittweise entstehen, zuerst ca. 10-15 echte Artikel.
- Die Review-UI speichert Scores direkt in `evals/goldstandard.json`.
- `human_score` bewertet den Input, den die Pipeline sieht.
- Nutzerfeedback soll künftig primär im echten Daily-Issue entstehen, weil dort der natürliche Lesekontext liegt.
- Automatische Review-Empfehlungen dürfen zunächst nicht selbst Code, Prompt oder Auswahlregeln verändern. Sie werden sichtbar gemacht und später bewusst übernommen.

## Offene Punkte

- `evals/goldstandard.json` enthält teils noch generische Platzhalter und teils bereits manuelle Bewertungen. Die Platzhalter sollten durch echte bewertete Artikel ersetzt oder entfernt werden.
- `evals/run_eval.py` verwendet aktuell nicht denselben Prompt wie `score.js`, obwohl der Kommentar behauptet, die Logik sei 1:1 identisch.
- Eine Decision-Metrik fehlt noch: Human `>= 4` vs. Model `>= 4`, also ob ein Artikel ins Issue gehört.
- Ein Script zum Auslesen der neuen Issue-Checkboxen existiert noch nicht.
- Eine OpenAI/ChatGPT-Anbindung als zweite unabhängige Review-Instanz ist noch nicht implementiert.
- Die Claude-only Review-Schlaufe beeinflusst die Artikelauswahl noch nicht; sie schreibt nur Empfehlungen in die Run-Summary.
- Review-Empfehlungen dürfen als Arbeitsinput für kontrollierte Folgeänderungen genutzt werden. Erste übernommene Änderung: bessere Ingest-Textbasis für Latent Space und Simon Willison.
- Der neue tägliche Schedule ist lokal geändert, aber in dieser Session wurde kein Commit/Push erstellt.
- Der manuell gestartete GitHub-Actions-Run wurde nicht bis zum Abschluss beobachtet.

## Risiken und bekannte Unsicherheiten

- GitHub-Actions-Schedules laufen nur aus dem Stand des Default-Branches. Die Schedule-Änderung wirkt erst nach Push/Merge auf `main`.
- Die lokale Review-UI lädt aktuell alle vorhandenen `articles-*.json`; bei sehr vielen Artefakten kann später Pagination oder Archivierung sinnvoll werden.
- Der Review-Stapel ist heuristisch. Er soll Arbeit reduzieren, ersetzt aber keine bewusste Auswahl schwieriger Grenzfälle.
- `REVIEW.md` ist untracked und wurde in dieser Session nicht bearbeitet. Nicht ungefragt löschen, committen oder als eigene Änderung behandeln.
