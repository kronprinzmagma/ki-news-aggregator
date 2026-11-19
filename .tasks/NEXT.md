
## Aktueller redaktioneller Massstab – 2026-10-08

Nicht-technischer Produktleser: höchstens fünf persönlich relevante Daily-Nachrichten; normalerweise je 150–220 Wörter (maximal 300), mit Hintergrund, nachvollziehbarer Bedeutung und praktischem Hinweis. Die Nachricht muss ohne Nachlesen der Originalquelle verständlich sein; keine Pflichtübung und kein Auffüllen dünner Quellen. `lib/editorial.js` prüft Auswahl, Textstruktur und vollständige Review-Abdeckung. Review anhand des Originaltexts mit Quellentreue, erneut nach Rewrite; ungültige/abgeschnittene Antworten stoppen Publikation. Technische Plugin-/Infrastrukturmeldungen allein sind kein Topthema; Cluster-Bonus entfällt. Weekly: drei erklärende Themen mit je etwa 150–200 Wörtern, insgesamt etwa 650–800, höchstens 900 Wörter. `scripts/refresh-issue-audio.js` aktualisiert die Vertonung nach Issue-Änderungen. Ältere Aussagen zu Mengenlimit, advisory Review, Entwickler-Projekten und Cluster-Bonus sind überholt.

Der historische Goldstandard mit 38 Nutzerlabels bleibt unverändert. CI nutzt jetzt `evals/pm-baseline.json` mit 16 explizit redaktionellen Kalibrierungsfällen. Offen bleibt eine unabhängige Bestätigung durch neue Nutzerbewertungen. Die anschliessende Betriebsnachprüfung ergänzt das Weekly-Originalquellen-Gate und die automatische Erholung von Quellenwarnungen. VentureBeat und unzuverlässige GitHub-Schedules bleiben dokumentierte Betriebsgrenzen.

# Next Task

## Offene Punkte (Priorität absteigend)

### 1. Unabhängige Leserbewertungen sammeln

38 historische Nutzerlabels bleiben unverändert. Der neue CI-Datensatz enthält 16 explizit redaktionell kalibrierte Fälle für die nichttechnische Produktperspektive. Neue echte Leserbewertungen zu Auswahl und Verständlichkeit sammeln und beide Referenzen getrennt halten; den Kalibrierungssatz nicht als unabhängigen Nutzernachweis ausgeben.

### 2. Betriebsgrenzen beobachten

VentureBeat liefert weiterhin HTTP 429. Keinen veralteten Ersatzfeed als funktionierende Nachrichtenquelle ausgeben. a16z nutzt die kanonische Newsletter-Domain; Quellenwarnungen werden nach Erholung geschlossen. Der Yannic-Feed ist erreichbar, enthält aber ältere Einträge. GitHub-Schedules bleiben verspätungsanfällig; ein garantierter Versandzeitpunkt braucht einen unabhängig betriebenen Trigger.

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
