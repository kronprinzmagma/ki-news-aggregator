# Current State

Stand: 2026-05-09 (Abend)

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

## Offene Punkte (nächste Session)

- Harter Gate: Artikel mit "Volltext nicht verfügbar" kommen nicht ins Issue
- PR-Mechanismus: `process_adjustments` → automatischer Pull Request
- eval-Goldstandard ausbauen (aktuell 8 Einträge, Ziel: 40)
- `evals/run_eval.py` Prompt mit `score.js` synchronisieren

## Bekannte Schwächen

- `"AI is breaking two vulnerability cultures"` (jefftk.com): raw_text dünn, Artikel kommt trotzdem ins Issue mit Disclaimer
- Review-Schlaufe kostet ~1 Sonnet-Call extra pro Run (~$0.02)
- Cluster-Bonus in score.js kann gelegentlich schwache Artikel hochheben
