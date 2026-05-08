# Roadmap

## Phase 1 – Qualität

Ziel: Der tägliche Output ist dicht, produktrelevant und ohne Verwaltungs-/Tooling-Rauschen.

- [x] Scoring-Prompt auf Maker-Persona anpassen: Kriterium "Gibt das eine konkrete technische Idee für ein eigenes Projekt?" als primären Relevanz-Treiber
- [x] Schwellenwert-Logik: Nur Score >= 4 erscheint im Issue, Score 1–3 wird komplett verworfen (auch nicht als Link-Liste)
- [x] Redundanz-Filter: Zwei Artikel zum gleichen Trend → nur stärkster erscheint, kein Doppel-Entry im Issue
- [x] PM-Relevanz wieder als Primärfilter: Produktstrategie, Marktbewegung, Build-vs-Buy und eigene Prototypen schlagen reine Mini-Tool-Bastelbarkeit
- [x] Keine künstliche Quellenquote: Relevanz gewinnt, auch wenn mehrere Top-Artikel aus derselben Quelle kommen

---

## Phase 2 – Quellen

Ziel: Breitere und gezieltere Abdeckung der relevanten KI-Communitys.

- [x] Adapter: **The Batch / deeplearning.ai** – `adapters/thebatch.js`, community-maintained Feed via `Olshansk/rss-feeds`
- [x] Adapter: **Ahead of AI** (Sebastian Raschka) – `adapters/aheadofai.js`
- [x] Adapter: **Interconnects** (Nathan Lambert) – `adapters/interconnects.js`
- [x] Adapter: **Yannic Kilcher** – `adapters/yannickilcher.js`, YouTube Atom-Feed
- [x] HN-Adapter: Show-HN-Einträge als `hackernews-show` markiert, Scoring-Prompt deprioritisiert diese Quelle explizit

---

## Phase 3 – Output-Format

Ziel: Saubereres Issue-Format, keine abgeschnittenen Texte, automatische Hygiene.

- [x] Token-Limit-Bug in `deliver.js` beheben: max_tokens für Überblick und Artikel auf 400 erhöht
- [x] Issue-Template vereinfachen: Überblick-Block direkt nach Titel, ohne `## Überblick` / `## Artikel` Headings
- [x] Automatisches Schliessen alter Issues nach 7 Tagen via `close-old-issues.yml` (läuft täglich 07:30 UTC)

---

## Phase 4 – Robustheit (Code Review)

Ziel: Bekannte Schwachstellen aus Code Review 2026-05-08 beheben.

- [x] CR-03/CR-04: Defensives API-Response-Parsing + `.catch()` auf `main()` in allen drei Hauptdateien
- [x] WR-01: JSON-Parse mit try/catch in `score.js` und `deliver.js`
- [x] WR-02: Socket-Timeout in 6 Adaptern nachgezogen (willison, latentspace, aheadofai, lastweekinai, interconnects, yannickilcher)
- [x] WR-03: Redirect-Loop-Schutz in `venturebeat.js` und `huggingface.js`
- [x] WR-04/05/06/07/08 + IN-01/02/03: Kleinere Fixes (env-Parser, Redirect-Codes, Retry-After, Floskel-Satz, Dedup-Konsistenz, stopWords, Actions-Versionen)
- [ ] Idee: API-Keys aus `.env` im Projektordner herausziehen → Shell-Profil (`~/.zprofile`) oder macOS Keychain; `.env` löschen. Hintergrund: Keys liegen aktuell als Klartext im Projektverzeichnis, auch wenn nicht in Git.

---

## Phase 5 – Autonomie

Ziel: Das Tool arbeitet vollständig selbstständig und liefert auch Langzeit-Kontext.

- [ ] Wöchentliches Meta-Issue (Sa oder Mo): Trend-Zusammenfassung über die Woche, welche Themen haben dominiert, was hat sich verschoben
- [ ] Monthly Digest (1. des Monats): Längerfristige Mustererkennung über 4 Wochen

---

## Erledigte Punkte

- [x] Persona geschärft: PM/PO mit Hands-on-Ambition, aber ohne Backlog-/Sprint-/Stakeholder-Rauschen
- [x] Neues Output-Schema: drei Blöcke pro Artikel (Was ist neu / Produktrelevanz / Projektanker), max. 120 Wörter
- [x] Leerer Tag erzeugt kein Issue
- [x] Issue-Titel vereinheitlicht auf `KI Daily – YYYY-MM-DD`
- [x] Themen-Dedup über Titel-Wort-Overlap
- [x] Schedule auf Mo–Fr 06:00 UTC begrenzt, Wochenende deaktiviert
- [x] Anthropic-News-Adapter vorhanden und aktiv
- [x] Laufdatum gehärtet: Score und Deliver verwenden nur noch Dateien desselben Run-Datums, kein Fallback auf alte Artefakte
