# Next Task

## Nächster sinnvoller Arbeitsschritt

Die neue Claude-only Review-Schlaufe an einem echten oder lokalen Run prüfen und danach Feedback aus Daily-Issues maschinenlesbar machen.

## Scope

- Prüfen, ob `run-summary-YYYY-MM-DD.json` die Review-Ergebnisse sauber enthält.
- Sicherstellen, dass die Review-Schlaufe keine Issue-Erstellung blockiert, wenn Claude-JSON fehlschlägt.
- Script oder Workflow-Konzept erstellen, das gesetzte Issue-Checkboxen aus Daily-Issues auslesen kann.
- Aus `Besonders wertvoll` und `Später weiterverfolgen` strukturierte Feedbackdaten ableiten.

## Out of Scope

- Keine OpenAI/ChatGPT-Anbindung ohne separate API-Key-/Kostenentscheidung.
- Keine automatische Code-, Prompt- oder Auswahlregeländerung aus Review-Empfehlungen.
- Keine Änderungen an `.github/workflows/daily-news.yml` oder `.github/workflows/watchdog.yml`.
- Kein Refactoring der Adapter.
- Kein Weekly-/Monthly-Digest implementieren.
- Keine breite Repo-Analyse.

## Akzeptanzkriterien

- Review-Schlaufe bewertet final ausgewählte Artikel und bis zu zwei ausgeschlossene Beispiele je niedriger Score-Stufe 1, 2 und 3.
- Run-Summary enthält `review.mode = advisory`, `selected_articles`, `low_score_samples` und `process_adjustments`.
- Fehler in der Review-Schlaufe werden als `review.error` gespeichert und brechen Delivery nicht ab.
- Daily-Issue-Checkboxen können aus bestehenden Issues maschinenlesbar extrahiert werden.

## Verifikation

- `node --check deliver.js`
- Falls ein API-Lauf gewünscht ist: mit einem konkreten `RUN_DATE` lokal oder via GitHub Actions ausführen.
- Wenn GitHub-Zugriff genutzt wird: erst read-only prüfen, keine Issue-Mutation ohne ausdrücklichen Auftrag.
- Für Checkbox-Erhaltung kann ein lokaler Markdown-Fixture-Test reichen.

## Maximale Dateien für diesen Schritt

Lesen:

- `.context/current-state.md`
- `.tasks/NEXT.md`
- `deliver.js`
- ein konkretes `run-summary-YYYY-MM-DD.json`, falls vorhanden

Ändern:

- neu zu erstellendes Feedback-Auslese-Script
- `PROJECT.md` oder `CLAUDE.md`, falls Bedienung dokumentiert werden muss

Optional ändern:

- `deliver.js`, nur bei einem konkreten Review- oder Checkbox-Bug.

## Arbeitsregel für künftige Sessions

Nach maximal 5 explorativen Tool-Calls stoppen und einen knappen Plan liefern, wenn der nächste Schritt nicht eindeutig ist.
