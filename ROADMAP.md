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
- [x] Code Review 2026-05-09: CR-02 bis IN-04 umgesetzt (Socket-Timeouts, Redirect-Fixes, Entity-Decoding, Retry-After in deliver.js, Adapter-Robustheit)
- [x] Security Review 2026-05-10: CR-01 NEWSAPI-Key als Header, CR-02 SSRF-Schutz (`isSafeUrl()`) in allen Adaptern, CR-03 Prompt-Injection via XML-Tags, CR-04 GitHub-Issue-Sanitisierung; WR-01–10 und IN-01/03/04 vollständig gefixt
- [ ] Idee: API-Keys aus `.env` im Projektordner herausziehen → Shell-Profil (`~/.zprofile`) oder macOS Keychain; `.env` löschen. Hintergrund: Keys liegen aktuell als Klartext im Projektverzeichnis, auch wenn nicht in Git.

---

## Phase 5 – Selbstoptimierung

Ziel: Die Pipeline verbessert ihren Output eigenständig durch Review-gesteuerte Rewrites und Adapter-Anreicherung.

- [x] Review-Schlaufe bewertet geschriebenen Output (drei Blöcke) auf 4 Ebenen und gibt `rewrite_hint`
- [x] Rewrite-Loop: Artikel mit `needs_rewrite=true` werden sofort mit Review-Feedback neu aufbereitet
- [x] Artikel-Enrichment in allen relevanten Adaptern: interconnects, lastweekinai, aheadofai, willison (inkl. externer Link-Fetch)
- [x] Prompt-Verbesserungen: Halluzinations-Schutz, Build-Anker-Validierung, Thin-Input-Markierung
- [x] Tagesübergreifende URL-Dedup: Artikel aus den letzten 3 Issues werden vor Selektion gefiltert
- [ ] Harter Gate: Artikel mit `"Volltext nicht verfügbar"` kommen nicht ins Issue
- [ ] PR-Mechanismus: process_adjustments aus Run-Summary → automatischer Pull Request mit Prompt-/Parameter-Änderungen

---

## Phase 6 – Autonomie

Ziel: Das Tool arbeitet vollständig selbstständig und liefert auch Langzeit-Kontext.

- [x] Wöchentlicher Digest (Sonntag 08:00 UTC): Top-Entwicklungen, Strömungen, Wochenimpuls – als separates GitHub Issue (`weekly.js` + `weekly-digest.yml`)
- [ ] Monthly Digest (1. des Monats): Längerfristige Mustererkennung über 4 Wochen

---

## Phase 7 – Architektur-Refactor

Ziel: Code-Duplikation eliminieren, Re-Parsing der Issue-Markdowns durch persistente Datenbasis ersetzen, neue Adapter in ~10 Zeilen umsetzbar machen, Scoring-Kosten via Prompt Caching senken. Verhalten der Daily-/Weekly-Pipeline bleibt identisch.

- [x] `lib/`-Module: env, date, config, claude, github, http, text-utils, topic-overlap, schema, store, issue-format – eliminiert Triplet-Duplikate aus score/deliver/weekly
- [x] Adapter-Basis (`adapters/_base.js`) mit gemeinsamem HTTP/SSRF-Schutz, RSS-/Atom-Parser, Entity-Decoding und Content-Extraktion; alle 11 aktiven Adapter darauf umgestellt. Bugfix nebenbei: `huggingface.js` nutzte fälschlich `parseAtom`, obwohl der Feed RSS ist – seit dem stillen Format-Wechsel kamen 0 Artikel.
- [x] Topic-Overlap-Heuristik vereinheitlicht (vier fast-identische Token-Overlap-Funktionen → `lib/topic-overlap.js` mit `applyEventDedup` / `applyClusterBonus` / `dedupByTopic` / `findRelated`)
- [x] HTTP-Stack mit Prompt Caching auf dem Score-System-Prompt via `cache_control: ephemeral`
- [x] SQLite-Store (`lib/store.js`, `better-sqlite3`) mit `articles`, `scores`, `issues`, `issue_articles`; Cross-Day-Dedup liest aus DB statt aus Issue-Markdown
- [x] Versioniertes Issue-Format: pro Artikel HTML-Kommentar mit strukturierten Metadaten; Weekly liest primär daraus, Regex bleibt Fallback
- [x] Zod-Schema-Validierung beim Lesen von `articles-*.json` und `scored-*.json` (`lib/schema.js`)

---

## Phase 8 – Portfolio-Härtung

Ziel: Das Projekt für externe Leser (Recruiter, Hiring Manager, Builder-Community) sichtbar und lesbar machen, dabei zwei echte Engineering-Verbesserungen mitnehmen (Structured Outputs, Cost-Log) und EU-AI-Act-Disclosure-Pflicht ab 02.08.2026 erfüllen.

- [x] AI-Disclaimer im Issue-Header (EU AI Act Art. 50(4)): sichtbarer "🤖 KI-generiert"-Hinweis
- [x] "Warum diese 14 Quellen"-Block im README: bewusste Kuratierung als Statement, nicht Quellen-Maximierung
- [x] Mermaid-Architekturdiagramm im README: Pipeline-Flow von Ingest → Score → Deliver inkl. Review-Loop
- [x] Sample-Issue als `samples/example-daily.md` committen + im README verlinken
- [x] Cost-Log pro Run: `lib/claude.js` aggregiert `usage` (inkl. `cache_read_input_tokens`), persistiert in `run-summary-*.json` mit Kostenrechnung
- [x] Structured Outputs in `score.js`: Migration auf Anthropic-natives JSON-Schema via `tool_use` (eliminiert Regex-Strip + JSON.parse-Defensive)
- [x] Structured Outputs im Review-Pass von `deliver.js`: analog `tool_use` für das Review-JSON
- [x] Deliver-Eval: neues Eval in `evals/` mit LLM-as-Judge auf Faithfulness der 3-Block-Writeups + Marketing-Sprech-Detection
- [x] Cache-Hit-Regression untersucht: Haiku 4.5 hat ein Cache-Minimum von >2226 Tokens; Score-System-Prompt liegt knapp darunter. Akzeptiert – Batch API (-50%) kompensiert fehlende Cache-Hits mehr als ausreichend.

---

## Phase 9 – Differenzierung

Ziel: Über reine Funktionalität hinaus die Eigenarten dieses Projekts sichtbar machen – kuratierte Quellen, Review-Schlaufe als Asset, Build-Anker-Sammlung über Monate, operative Hygiene bei wachsender Quellenzahl.

- [x] A6: GitHub Pages-Archiv aller `summary-*.md`-Dateien (durchsuchbares Output-Archiv ohne Issue-API-Limits)
- [x] B4: Banned-Phrases-Detektion inline in Daily-Pipeline (deterministischer Regex aus Deliver-Prompt-Verboten, Treffer in `run-summary-*.json`)
- [x] B3: Review-Schlaufe sichtbar im Issue-Footer (`<details>` mit Rewrite-Count und Top-Prozess-Empfehlungen)
- [x] B1: Build-Anker als separate Markdown-Files unter `build-anchors/YYYY-MM-DD-slug.md` mit Frontmatter (durchsuchbarer Katalog von Abend-Projekten mit Claude Code)
- [x] A7: Adapter-Health-Metriken in SQLite + Auto-Issue bei stillen Adaptern (3 Tage 0 Artikel)

---

## Phase 10 – Cost-Optimierung

Ziel: Tageskosten von ~$0.36 auf ~$0.25 senken, ohne Qualitätsverlust. Strukturelles Defizit angreifen: bislang gingen alle Artikel ans LLM, auch die mit strukturell feststehender Bewertung oder bereits publizierte.

- [x] Pre-Filter: `quelle=hackernews-show` und `truncated=true` bekommen Auto-Score 2 ohne LLM-Call (Show-HN ist im Prompt eh deprioritisiert, truncated-Artikel sind zu dünn für sinnvolle Bewertung)
- [x] Pre-Dedup: Cross-Day-Dedup vor dem Scoring statt erst vor Deliver – bereits publizierte URLs gehen gar nicht ans LLM
- [x] Anthropic Batch API für Score: 50% Rabatt, asynchron (typisch <30min für 30-80 Calls). Default ON, `SCORE_USE_BATCH=false` als Escape-Hatch.
- [x] Feedback-Loop: vier Checkboxen pro Artikel (wertvoll/weiterverfolgen/schlecht-aufbereitet/irrelevant) + `scripts/promote-feedback.js` baut Goldstandard passiv aus Lese-Klicks auf

Effektive Cost-Reduktion (Smoke-Test 2026-05-22): Score von $0.23 auf $0.05 (-78%), Total von $0.36 auf $0.25 pro Run → ~CHF 7.50/Monat statt CHF 11.

---

## Phase 11 – Audio-Ausgabe (Konsum-Kanal)

Ziel: Nicht die Aufbereitung kippt bei täglichen Digests (die fängt die Review-Schlaufe ab), sondern der Konsum – ein Textblock wird morgens übersprungen, Audio unterwegs ist oft der einzige Slot, der durchkommt. Daher die fertigen Inhalte zusätzlich als Audio anhörbar machen.

- [x] Daily-Audio: `lib/tts.js` (OpenAI `gpt-4o-mini-tts`, Chunking, Retry) + `lib/audio.js` (Claude-Sprechfassung → TTS → Release-Asset). Optional via `OPENAI_API_KEY`, fehlertolerant (No-Op ohne Key).
- [x] Hosting via GitHub Release-Asset (`podcast`-Tag, `daily-YYYY-MM-DD.mp3`); `lib/github.js` mit `getOrCreateRelease` / `uploadReleaseAsset` / `deleteReleaseAsset`.
- [x] Podcast-RSS-Feed (`_site/feed-daily.xml`) + `<audio>`-Player auf den Daily-Detailseiten in `scripts/build-archive.js`; Feed im Index verlinkt.
- [x] `🎧 Audio-Version`-Link im Daily-Issue; Audio-Metadaten in `run-summary-*.json`.
- [ ] Weekly-Audio nach gleichem Muster (eigener Feed `feed-weekly.xml`)
- [ ] Stimmen-Samples vergleichen und Default-Stimme final wählen (aktuell `onyx`)
- [ ] Optional: Dialog-Stil (zwei Stimmen, NotebookLM-artig) evaluieren, falls Vorlese-Stil zu trocken

---

## Erledigte Punkte

- [x] Persona geschärft: PM/PO mit Hands-on-Ambition, aber ohne Backlog-/Sprint-/Stakeholder-Rauschen
- [x] Neues Output-Schema: drei Blöcke pro Artikel (Was ist neu / Produktrelevanz / Projektanker), max. 120 Wörter
- [x] Feedback-Checkboxen pro Daily-Artikel: besonders wertvoll / später weiterverfolgen
- [x] Claude-only Review-Schlaufe in `deliver.js`: ausgewählte Artikel + bis zu zwei ausgeschlossene Beispiele je Score 1/2/3, advisory in Run-Summary
- [x] Latent-Space- und Simon-Willison-Adapter reichern dünne Feed-Texte aus der Artikelseite an
- [x] Leerer Tag erzeugt kein Issue
- [x] Issue-Titel vereinheitlicht auf `KI Daily – YYYY-MM-DD`
- [x] Themen-Dedup über Titel-Wort-Overlap
- [x] Daily-Schedule läuft täglich um 05:30 UTC; leere Tage erzeugen kein Issue
- [x] Anthropic-News-Adapter vorhanden und aktiv
- [x] Laufdatum gehärtet: Score und Deliver verwenden nur noch Dateien desselben Run-Datums, kein Fallback auf alte Artefakte
- [x] Weekly-Bugfix (2026-05-24): Upsert-Logik entfernt – jeder Lauf erstellt ein neues Issue. `weekRange()` berechnet bei Nicht-Sonntag die letzte abgeschlossene Woche, damit manuelle Trigger am Montag nicht die laufende Woche beschreiben.
- [x] Datengetriebene Pipeline-Verbesserungen (2026-05-25): Adapter-Enrichment für Anthropic/HuggingFace/TheBatch, Golem als 15. Quelle, Unicode-Tokenizer-Fix in Topic-Dedup, Stopwords gegen Buzzword-Overlap, Score-Anker im Prompt. MAE gegen Goldstandard 1.18 → 0.77 (-35%).
- [x] Batch-Hang-Fallback (2026-06-02): `claudeBatch` erkennt hängende Batches (succeeded=0 nach 10 min) via `BatchStuckError`, bricht serverseitig ab und fällt auf Sync-Modus (5 parallele Requests) zurück statt zu failen.
- [x] GitHub Issue Body-Limit (2026-06-02): `deliver.js` kürzt Issue-Body vor API-Call auf max. 65.000 Zeichen (letzter vollständiger Artikel-Trenner) — verhindert HTTP 422 bei Tagen mit vielen Score-4-Artikeln.
