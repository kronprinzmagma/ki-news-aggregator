# Next Task

## Offene Punkte (Priorität absteigend)

### 1. Eval-Goldstandard weiter wachsen lassen

Stand 11.06.: 34 Einträge (17 via erstem feedback-loop-Lauf promotet). Ziel: ~50 mit breiterer Score-Verteilung (aktuell 21× Score 5, nur 1× Score 2 – Mittelfeld-Urteile fehlen). Wächst automatisch über `feedback-loop.yml` (sonntags); beim Lesen auch mal „Thema nicht relevant" bei Mittelmass setzen, nicht nur Extreme markieren.

### 2. Scoring-Prompt-Kalibrierung beobachten

Prompt am 11.06. gegen die Feedback-Outlier kalibriert (Pearson 0.48 → 0.75, Acc@±1 91%). Nach den nächsten ~10 Goldstandard-Zugängen prüfen, ob die Werte halten (kein Overfitting auf das 34er-Set). Bekannter Rest-Ausreisser: CRDT-Artikel (Dev-Tool ohne KI-Kern wird trotz Regel mit 4 bewertet).

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
- ✅ Embeddings-Dedup-Eval ausgewertet (CI-Lauf 11.06.): Heuristik gewinnt klar, kein Umbau – Details in `evals/EVALS.md`
- ✅ Scoring-Prompt gegen Feedback-Goldstandard kalibriert (Pearson 0.48 → 0.75)

## Bewusst zurückgestellt

- **API-Keys aus `.env`**: Verschiebung in `~/.zprofile` oder macOS Keychain – vom User zurückgestellt
- **Monthly Digest**: Phase 6, noch nicht priorisiert (Weekly deckt Mustererkennung weitgehend ab)
- **Watchdog-Zuverlässigkeit**: GitHub-Schedule-Problem bekannt; keine zuverlässige Lösung ohne externen Cron-Dienst (z.B. cron-job.org)
- **Personalisierung (Score-Bias aus Feedback)**: erst ab genügend Feedback-Datenpunkten; bis dahin nur Report via `scripts/feedback-stats.js`
