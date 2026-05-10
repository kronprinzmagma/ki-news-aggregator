# Current State

Stand: 2026-05-10

## Was das System heute tut

Täglicher KI-News-Aggregator: ingest → score → deliver → GitHub Issue.
Läuft täglich um 05:30 UTC via GitHub Actions (inkl. Wochenende).
Watchdog-Workflow um 07:00 UTC als Fallback falls Schedule nicht feuert.

## Review-Schlaufe mit Rewrite-Loop (neu, heute implementiert)

`deliver.js` führt nach der Aufbereitung automatisch eine Claude-Review durch:

1. Alle ausgewählten Artikel werden aus 4 Perspektiven bewertet:
   - Produkt-Relevanz, Technische Substanz, Lernwert, Aufbereitungsqualität
2. Zusätzlich werden die geschriebenen drei Blöcke (Was ist neu / Was es für die KI-Richtung heisst / Build-Anker) bewertet
3. Artikel mit `needs_rewrite=true` werden sofort mit `rewrite_hint` neu aufbereitet
4. Ergebnis (inkl. `process_adjustments`) landet in `run-summary-YYYY-MM-DD.json`

## Aktueller Stand der Adapter

Alle relevanten Adapter haben Artikel-Enrichment:
- hackernews, latentspace, willison, anthropic: schon länger
- interconnects, lastweekinai, aheadofai: heute hinzugefügt
- willison: fetcht zusätzlich externe Links wenn Seitentext < 2500 Zeichen

Adapter ohne Enrichment (nur RSS-Feed-Text): huggingface, thebatch, yannickilcher, venturebeat

## Weekly Digest (neu, heute implementiert)

`weekly.js` + `.github/workflows/weekly-digest.yml`:
- Läuft sonntags 08:00 UTC (nach dem Daily um 05:30 UTC)
- Holt die letzten 7 KI-Daily-Issues per GitHub API
- Parst alle Artikel, URL-Dedup über Tage
- Score-5-Artikel sind Pflicht – kommen immer ins Issue, keine Claude-seitige Selektion
- Claude wählt zusätzlich 1–2 Score-4-Artikel nach strategischer Bedeutung
- Synthetisiert per Claude Sonnet: Einleitung, Top-Entwicklungen (dreistufig: was passiert / Implikation / kritische Einordnung), Strömungen, Wochenimpuls
- Erstellt GitHub Issue `KI Weekly – KW XX (YYYY-MM-DD – YYYY-MM-DD)`

## Tagesübergreifende Dedup (neu, heute implementiert)

`deliver.js` filtert Artikel heraus, die bereits in einem der letzten 3 Issues erschienen sind:

- `fetchRecentlyPublishedUrls()` holt die letzten Issues via GitHub API
- Extrahiert Haupt-Artikel-URLs per Regex: `Score X/5 · [quelle](url)`
- Gefilterte URLs werden geloggt + in `run-summary.deliver.cross_day_dedup` protokolliert
- Fail-safe: bei API-Fehler oder fehlendem Token wird die Dedup übersprungen (kein Abbruch)

## Performance-Optimierungen 2026-05-10 (heute umgesetzt)

- `deliver.js`: Artikel-Aufbereitung parallel statt sequenziell (`Promise.all`) – ~4× schneller
- `deliver.js`: `raw_text` aus Review-Payload entfernt – ~2000 Input-Tokens/Run gespart
- `weekly.js`: `WEEKLY_PROMPT` von 7719 auf 1757 Zeichen gekürzt (-77%) – ~1500 Tokens/Run gespart

## Security Review 2026-05-10 (heute gefixt)

4 Criticals, 8 Warnings, 3 Infos – alle gefixt:
- **CR-01**: NEWSAPI-Key neu als `X-Api-Key` Header (nicht mehr Query-Parameter)
- **CR-02**: SSRF-Schutz via `isSafeUrl()` in allen Adaptern (blockiert http:, private IPs, Cloud-Metadata-Endpoints)
- **CR-03**: Prompt-Injection-Schutz: Artikel-Titel/-Text in `<artikel_titel>`/`<artikel_text>` XML-Tags gewrappt
- **CR-04**: `sanitizeMarkdown()` + `sanitizeUrl()` in deliver.js – alle externen Inhalte im Issue-Body sanitisiert
- **WR-01/02**: Statuscode-Prüfung + Redirect-Handling in 5 Adaptern nachgezogen
- **WR-03/04**: API-Error-Bodies in Logs auf 150/200 Zeichen gekürzt
- **WR-05**: 5 MB Response-Limit in allen Adaptern
- **WR-06**: `RUN_DATE` Regex-Validierung + `process.exit(1)` bei ungültigem Format
- **WR-07**: `applyFeedbackStates()` nutzt jetzt Regex statt String
- **WR-08**: Retry-Logik in `weekly.js` (max 2 Retries, exponentielles Backoff)
- **WR-09**: URL-Normalisierung in `ingest.js` (UTM-Parameter + Hash entfernt)
- **WR-10**: Score aus Issue-Body auf 1–5 geclampt in `weekly.js`

## Offene Punkte (nächste Session)

- Harter Gate: Artikel mit "Volltext nicht verfügbar" kommen nicht ins Issue
- PR-Mechanismus: `process_adjustments` → automatischer Pull Request
- eval-Goldstandard ausbauen (aktuell 8 Einträge, Ziel: 40)
- `evals/run_eval.py` Prompt mit `score.js` synchronisieren

## Bekannte Schwächen

- `"AI is breaking two vulnerability cultures"` (jefftk.com): raw_text dünn, Artikel kommt trotzdem ins Issue mit Disclaimer
- Review-Schlaufe kostet ~1 Sonnet-Call extra pro Run (~$0.02)
- Cluster-Bonus in score.js kann gelegentlich schwache Artikel hochheben
