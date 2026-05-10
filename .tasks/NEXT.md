# Next Task

## Offene Punkte (Priorität absteigend)

### 1. Harter Gate: „Volltext nicht verfügbar"

Artikel, deren `raw_text` den String „Volltext nicht verfügbar" enthält, sollen **nicht** ins Issue kommen – unabhängig vom Score.

**Scope:**
- `deliver.js`: Nach Score-Filter und vor Dedup prüfen ob `raw_text` den Hinweis enthält
- Gefilterte Artikel im `run-summary.json` protokollieren
- Kein Issue-Abbruch, nur Ausschluss des Artikels

**Akzeptanzkriterien:**
- Artikel mit „Volltext nicht verfügbar" erscheinen nie im GitHub Issue
- Ausschluss wird in `run-summary-YYYY-MM-DD.json` unter `thin_content_filtered` geloggt

---

### 2. PR-Mechanismus: process_adjustments → Pull Request

`process_adjustments` aus `run-summary-YYYY-MM-DD.json` automatisch als GitHub Pull Request öffnen.

**Scope:**
- `deliver.js` oder neues `pr.js`: Nach Delivery prüfen ob `process_adjustments` nicht leer
- Pull Request mit Diff erstellen (z.B. Prompt-Anpassungen)
- Nur wenn Änderungen vorhanden; kein leerer PR

---

### 3. Eval-Goldstandard ausbauen

Aktuell 8 Einträge in `evals/goldstandard.json`, Ziel: ~40.

**Scope:**
- `evals/run_eval.py` Prompt mit `score.js` synchronisieren (bekannter Drift)
- Goldstandard-Einträge via `npm run eval:review` ergänzen

---

## Bewusst zurückgestellt

- **API-Keys aus `.env`**: Verschiebung in `~/.zprofile` oder macOS Keychain – vom User zurückgestellt
- **Monthly Digest**: Phase 6, noch nicht priorisiert
- **Watchdog-Zuverlässigkeit**: GitHub-Schedule-Problem bekannt; keine zuverlässige Lösung ohne externen Cron-Dienst (z.B. cron-job.org)
