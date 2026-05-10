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

- [ ] Modellversionen korrekt: `claude-haiku-4-5-20251001` für Score, `claude-sonnet-4-6` für Deliver und Weekly
- [ ] Quellenliste vollständig (aktuell 11 aktive Adapter + NewsAPI inaktiv)
- [ ] Score-Schwelle korrekt: `>= 4` ins Issue, `>= 3` in scored-JSON
- [ ] Weekly-Digest-Abschnitt vorhanden und aktuell
- [ ] Schedule korrekt: Daily 05:30 UTC, Weekly 08:00 UTC sonntags
- [ ] Tagesübergreifende Dedup erwähnt (letzte 3 Issues)
- [ ] Review-Schlaufe + Rewrite-Loop beschrieben
- [ ] Keine veralteten „geplant"-Markierungen für bereits implementierte Features

### ROADMAP.md

- [ ] Alle implementierten Features als `[x]` markiert
- [ ] Keine Feature als offen markiert, die bereits live ist
- [ ] Offene Punkte (`[ ]`) entsprechen tatsächlich noch nicht implementierten Features

### .context/current-state.md

- [ ] Datum aktuell (`Stand: YYYY-MM-DD`)
- [ ] Watchdog korrekt beschrieben (gleich unzuverlässig wie Haupt-Schedule)
- [ ] Neue Features/Änderungen dieser Session eingetragen
- [ ] Offene Punkte (nächste Session) aktuell

### PROJECT.md

- [ ] Modellversionen korrekt (vollständige Version mit Datum)
- [ ] Schedule-Zeiten korrekt

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
