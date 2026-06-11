# Next Task

## Offene Punkte (Priorität absteigend)

### 1. Embeddings-Dedup-Eval auswerten

`evals/embedding_dedup_eval.js` existiert (A/B Heuristik vs. OpenAI-Embeddings über lokale `articles-*.json`). Einmal lokal laufen lassen (`OPENAI_API_KEY` nötig), Disagreements von Hand labeln. Nur bei klarem Embeddings-Vorteil Produktions-Umbau erwägen.

### 2. Eval-Goldstandard wachsen lassen

Aktuell ~17 Einträge, Ziel: ~40. Wächst jetzt automatisch über `feedback-loop.yml` (sonntags) – es braucht nur fleissiges Häkchen-Setzen beim Lesen. Die MAE-1.5-Schwelle erst ab ~30 Einträgen als hartes Gate ernst nehmen (bei n=17 statistisch instabil).

### 3. Audio-Stimme final wählen

Optional: Stimmen-Samples vergleichen, Default (`AUDIO_VOICE`, aktuell `onyx`) bestätigen oder wechseln.

### 4. PR-Mechanismus: process_adjustments → Pull Request

Bewusst zurückgestellt: Auto-PRs mit Prompt-Änderungen ohne Eval-Gate riskieren stillen Qualitäts-Drift. Sinnvoller als Vorschlags-Issue mit angehängtem Eval-Resultat – setzt einen belastbaren Goldstandard (Punkt 2) voraus.

---

## Erledigt (Juni 2026, Review-Session)

- ✅ Harter Gate „Volltext nicht verfügbar" (`thin_content_filtered` im run-summary)
- ✅ Weekly-Audio (`generateWeeklyAudio`, `feed-weekly.xml`, Player im Archiv)
- ✅ Feedback-Loop automatisiert (`feedback-loop.yml` + `eval-regression`-Issue)
- ✅ Stats-Seite im Pages-Archiv (`scripts/export-stats.js` → `stats.html`)
- ✅ `run_eval.py`-Drift obsolet: `run_eval.js` nutzt denselben Pfad wie `score.js`

## Bewusst zurückgestellt

- **API-Keys aus `.env`**: Verschiebung in `~/.zprofile` oder macOS Keychain – vom User zurückgestellt
- **Monthly Digest**: Phase 6, noch nicht priorisiert (Weekly deckt Mustererkennung weitgehend ab)
- **Watchdog-Zuverlässigkeit**: GitHub-Schedule-Problem bekannt; keine zuverlässige Lösung ohne externen Cron-Dienst (z.B. cron-job.org)
- **Personalisierung (Score-Bias aus Feedback)**: erst ab genügend Feedback-Datenpunkten; bis dahin nur Report via `scripts/feedback-stats.js`
