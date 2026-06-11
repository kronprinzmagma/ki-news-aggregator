# Dokumentations-Checkliste

Diese Checkliste muss am Ende jeder Session, die Code oder Konfiguration ändert, vollständig abgearbeitet werden. Erst danach darf „alles aktualisiert" gesagt werden.

## Schritt 1 – Welche Dateien wurden geändert?

```
git diff --name-only HEAD~1..HEAD
```

Für jede geänderte Datei: Welche der unten stehenden Doku-Punkte sind davon betroffen?

---

## Schritt 2 – Checkliste je Doku-Datei

### CLAUDE.md (wichtigste Datei – wird von neuen Sessions als erstes gelesen)

- [ ] Modellversionen korrekt: `claude-haiku-4-5-20251001` für Score, `claude-sonnet-4-6` für Deliver, Review, Weekly und Audio-Skript
- [ ] Quellenliste vollständig (aktuell **15 aktive Adapter** + NewsAPI inaktiv)
- [ ] Score-Schwelle korrekt: `>= 4` ins Issue; scored-JSON enthält alle erfolgreich bewerteten Artikel
- [ ] Weekly-Digest-Abschnitt vorhanden und aktuell (themen-zentriert, 3 Themen, optional Audio)
- [ ] Schedule korrekt: Daily 05:30 UTC, Weekly 08:00 UTC sonntags, Feedback-Loop 10:00 UTC sonntags
- [ ] Tagesübergreifende Dedup korrekt: **7 Tage Lookback** (`CROSS_DAY_DEDUP_LOOKBACK`), Issue des laufenden Tages ausgeschlossen
- [ ] Review-Schlaufe (**5 Ebenen**, inkl. `comprehension_nontechnical`) + Rewrite-Loop beschrieben
- [ ] Volltext-Gate (`thin_content_filtered`) erwähnt
- [ ] lib/-Modulliste aktuell (inkl. `url`, `concurrency`)
- [ ] Keine veralteten „geplant"-Markierungen für bereits implementierte Features

### README.md

- [ ] Review-Loop-Dimensionen: **fünf** (nicht vier)
- [ ] Feedback-Checkbox-Labels: `Besonders wertvoll` / `Später weiterverfolgen` / `Zu kompliziert erklärt` / `Thema nicht relevant`
- [ ] Promote-Logik: `wertvoll → 5` (zu_kompliziert blockiert NICHT, nur `poor_writeup`-Flag); `irrelevant UND NICHT wertvoll → 1`
- [ ] Workflow-Liste vollständig (inkl. test.yml, feedback-loop.yml, audio-backfill.yml)
- [ ] ENV-Variablen-Block aktuell (`KI_NEWS_DB`, `PAGES_URL`, `NEWSAPI_KEY`, `SCORE_USE_BATCH`, `RUN_DATE`)
- [ ] Quellen-Tabelle und Mermaid-Diagramm konsistent mit aktiven Adaptern

### evals/EVALS.md

- [ ] Promote-Tabelle stimmt mit `decidePromotion` in `scripts/promote-feedback.js` überein
- [ ] Automatisierung beschrieben (feedback-loop.yml, eval-regression-Issue)
- [ ] CI-Status der Evals korrekt (Scoring-Eval in CI, Deliver-Eval nur lokal, Embedding-Dedup-Eval manuell)

### ROADMAP.md

- [ ] Alle implementierten Features als `[x]` markiert
- [ ] Keine Feature als offen markiert, die bereits live ist
- [ ] Offene Punkte (`[ ]`) entsprechen tatsächlich noch nicht implementierten Features

### .context/current-state.md

- [ ] Datum aktuell (`Stand: YYYY-MM-DD`)
- [ ] Watchdog korrekt beschrieben (gleich unzuverlässig wie Haupt-Schedule)
- [ ] Neue Features/Änderungen dieser Session eingetragen
- [ ] Überholte Abschnitte als „(überholt)" markiert statt stillschweigend widersprüchlich
- [ ] Offene Punkte (nächste Session) aktuell

### PROJECT.md

- [ ] Modellversionen korrekt (vollständige Version mit Datum)
- [ ] Schedule-Zeiten korrekt
- [ ] Datenhaltung korrekt (SQLite + JSON-Audit-Artefakte, nicht „keine Datenbank")
- [ ] Review-Ebenen (5) und Checkbox-Anzahl (4) korrekt

### .context/working-map.md

- [ ] Dateipfade zu existierenden Dateien (keine veralteten Referenzen)
- [ ] REVIEW.md Status korrekt (tracked, alle Findings [FIXED])
- [ ] Watchdog-Beschreibung korrekt (nicht als verlässlicher Fallback beschrieben)

### .tasks/NEXT.md

- [ ] Keine bereits erledigten Tasks als offen markiert
- [ ] Offene Punkte entsprechen current-state.md > Offene Punkte

---

## Schritt 3 – Abschluss

```
git status        # nichts uncommitted
git log -1        # letzter Commit enthält alle Doc-Updates
```

Nur wenn alle Checkboxen oben abgehakt und git clean: → „alles aktualisiert"
