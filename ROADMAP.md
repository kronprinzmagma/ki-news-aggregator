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
