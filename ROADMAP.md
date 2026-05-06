# Roadmap

## Phase 1 – Qualität

Ziel: Der tägliche Output ist dicht, relevant und ohne PO-/Verwaltungs-Rauschen.

- [ ] Scoring-Prompt auf Maker-Persona anpassen: Kriterium "Gibt das eine konkrete technische Idee für ein eigenes Projekt?" als primären Relevanz-Treiber
- [ ] Schwellenwert-Logik: Nur Score >= 4 erscheint im Issue, Score 1–3 wird komplett verworfen (auch nicht als Link-Liste)
- [ ] Redundanz-Filter: Zwei Artikel zum gleichen Trend → nur stärkster erscheint, kein Doppel-Entry im Issue

---

## Phase 2 – Quellen

Ziel: Breitere und gezieltere Abdeckung der relevanten KI-Communitys.

- [x] Adapter: **The Batch / deeplearning.ai** – `adapters/thebatch.js`
- [x] Adapter: **Ahead of AI** (Sebastian Raschka) – `adapters/aheadofai.js`
- [x] Adapter: **Interconnects** (Nathan Lambert) – `adapters/interconnects.js`
- [x] Adapter: **Yannic Kilcher** – `adapters/yannickilcher.js`, YouTube Atom-Feed
- [x] HN-Adapter: Show-HN-Einträge als `hackernews-show` markiert, Scoring-Prompt deprioritisiert diese Quelle explizit

---

## Phase 3 – Output-Format

Ziel: Saubereres Issue-Format, keine abgeschnittenen Texte, automatische Hygiene.

- [ ] Token-Limit-Bug in `deliver.js` beheben: Überblicks-Block bricht bei langen Zusammenfassungen ab (max_tokens zu tief gesetzt)
- [ ] Issue-Template vereinfachen: Überblick-Block als ersten Abschnitt ohne zusätzliche Heading-Ebene
- [ ] Automatisches Schliessen alter Issues nach 7 Tagen via GitHub Actions (separater Workflow)

---

## Phase 4 – Autonomie

Ziel: Das Tool arbeitet vollständig selbstständig und liefert auch Langzeit-Kontext.

- [ ] Wöchentliches Meta-Issue (Sa oder Mo): Trend-Zusammenfassung über die Woche, welche Themen haben dominiert, was hat sich verschoben
- [ ] Monthly Digest (1. des Monats): Längerfristige Mustererkennung über 4 Wochen

---

## Erledigte Punkte

- [x] Persona-Wechsel: weg vom PO-Fokus, hin zu hands-on KI-Builder
- [x] Neues Output-Schema: drei Blöcke pro Artikel (Was ist neu / KI-Richtung / Build-Anker), max. 120 Wörter
- [x] Leerer Tag erzeugt kein Issue
- [x] Issue-Titel vereinheitlicht auf `KI Daily – YYYY-MM-DD`
- [x] Themen-Dedup über Titel-Wort-Overlap
- [x] Schedule auf Mo–Fr 06:00 UTC begrenzt, Wochenende deaktiviert
- [x] Anthropic-News-Adapter vorhanden und aktiv
