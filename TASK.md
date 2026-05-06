# Task: Scoring-Prompt auf Maker-Persona anpassen

**Phase:** 1 – Qualität  
**Status:** offen  
**Scope:** ausschliesslich `score.js`

---

## Ziel

Den Scoring-Prompt in `score.js` so umschreiben, dass er Artikel aus der Perspektive eines Solo-Entwicklers bewertet, der konkrete technische Abendprojekte sucht – nicht aus der Perspektive eines POs, der KI-Trends für sein Team einordnet.

---

## Akzeptanzkriterien

1. Der Prompt enthält als primäres Relevanzkriterium sinngemäss: „Liefert dieser Artikel eine konkrete Idee, die ich als Einzelperson an einem Abend mit Claude Code technisch umsetzen oder ausprobieren kann?"
2. Score 1–2 wird explizit vergeben für:
   - Reine Verwaltungs- oder Prozess-Tools (Ticket-Systeme, Sprint-Planung, Stakeholder-Reporting)
   - Generische „KI verändert Branche XY"-Artikel ohne technische Substanz
   - Reine VC-/Funding-Meldungen ohne Produktdetail
3. Score 4–5 wird nur vergeben für Artikel mit technisch umsetzbarem Inhalt:
   - Neue Modell-Capabilities mit konkreter API (Tool Use, Reasoning, Kontext-Erweiterung)
   - SDKs, Frameworks, MCP-Server, Eval-Tools, die man direkt einsetzen kann
   - Architektur-Erkenntnisse zu Agenten-Systemen mit praktischem Muster
   - Strategische Verschiebungen (Pricing, OSS-Releases), die eigene Projekte direkt betreffen
4. Die Begründung im JSON-Output bleibt ein einzelner Satz, der den konkreten Mehrwert für ein Maker-Projekt benennt
5. Kein anderes File wird verändert

---

## Nicht im Scope

- `deliver.js`, `ingest.js`, Adapter, Workflow – keine Änderungen
- Keine Änderung am JSON-Output-Schema (`score`, `begründung`)
- Keine Änderung am Modell oder an den Rate-Limiting-Parametern

---

## Commit

```
refactor: scoring prompt auf Maker-Persona anpassen
```

Atomarer Commit, nur `score.js`.
