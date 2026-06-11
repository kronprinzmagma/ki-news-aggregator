# Eval-System – Dokumentation

Zwei Evals laufen unabhängig voneinander auf unterschiedlichen Pipeline-Stufen:

| Eval | Datei | Pipeline-Stufe | Frage |
|---|---|---|---|
| Scoring-Eval | `run_eval.js` | Score-Stufe | Stimmen Modell-Scores mit menschlich vergebenen Goldstandard-Scores überein? |
| Deliver-Eval | `deliver_eval.js` | Deliver-Stufe | Sind die geschriebenen 3-Block-Aufbereitungen faktentreu zum Source-Text und stilistisch sauber? |

---

## Scoring-Eval (`run_eval.js`)

Der Aggregator bewertet täglich KI-News-Artikel mit einem Score von 1–5. Dieser Score entscheidet, welche Artikel im täglichen GitHub-Issue landen. Wenn der Scoring-Prompt schlecht kalibriert ist, entstehen zwei Probleme:

- **False positives:** Irrelevante Artikel (Funding-Meldungen, Marketing) kommen durch
- **False negatives:** Gute technische Artikel werden aussortiert

Das Eval misst, wie gut das Modell mit den eigenen Urteilen übereinstimmt, die manuell auf einem Goldstandard vergeben wurden.

`run_eval.js` importiert denselben Scoring-Pfad aus `lib/scoring.js` wie `score.js`: Prompt, Tool-Schema, Input-Truncation und deterministische Prefilter bleiben dadurch gekoppelt. `run_eval.py` existiert nur noch als Kompatibilitaets-Wrapper fuer alte lokale Befehle.

---

## Wie der Goldstandard wächst

Der Goldstandard wird **nicht manuell gepflegt**. Er wächst passiv aus den Feedback-Häkchen, die der Leser beim normalen Lesen der Daily-Issues setzt:

```
Lesen → 3-Sekunden-Klick im Issue → wöchentlich Promote-Script → goldstandard.json wächst
```

Jeder Artikel im Daily-Issue hat vier Feedback-Checkboxen:
- **Besonders wertvoll** — positives Signal zur Relevanz
- **Später weiterverfolgen** — schwaches positives Signal (wird NICHT promoted)
- **Zu kompliziert erklärt** (früher „Schlecht aufbereitet") — Signal für die Deliver-Stufe (Verständlichkeit/Writeup-Qualität)
- **Thema nicht relevant** (früher „Irrelevanter Inhalt") — negatives Signal zur Relevanz

> Hinweis: Die negativen Labels wurden trennscharf umbenannt, damit „Aufbereitung schlecht" und „Thema irrelevant" sauber getrennte Signale sind. `scripts/promote-feedback.js` matcht beide Varianten (alt + neu), historische Issues bleiben gültig.

`scripts/promote-feedback.js` liest alle Daily-Issues via GitHub-API, extrahiert die Checkbox-Zustände pro Artikel und wendet folgende Promote-Logik an:

| Gesetzte Häkchen | Aktion |
|---|---|
| `wertvoll` (unabhängig von `zu_kompliziert`) | → Goldstandard `human_score = 5`; ein gleichzeitiges `zu_kompliziert` blockiert NICHT mehr, sondern wird als `poor_writeup`-Flag vermerkt (Signal für die Deliver-Stufe) |
| `irrelevant` UND nicht `wertvoll` | → Goldstandard `human_score = 1` |
| `weiterverfolgen` allein | Kein Promote (zu weiches Signal) |
| `wertvoll` UND `irrelevant` | Kein Promote (widersprüchlich) |

Dedupliziert wird per URL gegen bestehende Goldstandard-Einträge. Idempotent — das Script kann jederzeit erneut laufen.

```bash
GH_PAT=ghp_... node scripts/promote-feedback.js [--dry-run]
```

**Bewertungs-Aufwand: ~3 Sekunden pro markiertem Artikel beim normalen Lesen.** Keine Goldstandard-Pflege-Sessions.

### Automatisierter Feedback-Loop (`feedback-loop.yml`)

Seit Juni 2026 läuft das Promote-Script automatisch: sonntags 10:00 UTC führt `feedback-loop.yml` `promote-feedback.js` aus, committet einen gewachsenen Goldstandard (der Push triggert via Pfad-Trigger automatisch das Scoring-Eval in `eval.yml`) und schreibt die Quellen-Feedback-Statistik (`scripts/feedback-stats.js`) in die Job-Summary. Fällt das Eval unter den Schwellwert (MAE > 1.5, Exit 1), öffnet `eval.yml` automatisch ein Issue mit Label `eval-regression`.

## Aktueller Goldstandard-Stand

`goldstandard.json` enthält die bisher promoteten Einträge plus den ursprünglichen Seed-Satz. Schema eines Eintrags:

**Bewertungskriterium:** Liefert dieser Artikel eine konkrete Idee, die ich als Einzelperson an einem Abend mit Claude Code technisch umsetzen oder ausprobieren kann?

**Score-Skala:**
| Score | Bedeutung |
|---|---|
| 5 | Direkt umsetzbar, klarer technischer Mehrwert |
| 4 | Relevant, mit konkretem Anknüpfungspunkt |
| 3 | Interessant, aber eher konzeptuell |
| 2 | Wenig Substanz für eigene Projekte |
| 1 | Kein technischer Mehrwert (Funding, Marketing, Verwaltung) |

**Schema eines Goldstandard-Eintrags:**
```json
{
  "titel": "Artikeltitel",
  "url": "https://...",
  "datum": "2025-10-15T00:00:00.000Z",
  "quelle": "anthropic",
  "rohtext": "Erster Absatz oder Beschreibung...",
  "human_score": 4
}
```

---

## Was die Metriken bedeuten

### MAE – Mean Absolute Error (Mittlere absolute Abweichung)

Gibt an, um wie viele Score-Punkte das Modell im Schnitt daneben liegt.

- **MAE 0.0** – perfekte Übereinstimmung (unrealistisch)
- **MAE 0.5** – sehr gut, Modell liegt meistens genau richtig oder einen halben Punkt daneben
- **MAE 1.0** – akzeptabel, im Schnitt ein Punkt Abweichung
- **MAE > 1.5** – problematisch, Prompt-Überarbeitung nötig

**Beispiel:** Human-Score 4, Model-Score 3 → Abweichung 1. Über alle Artikel gemittelt ergibt das den MAE.

---

### Pearson-r – Korrelationskoeffizient

Misst, ob Modell und Mensch in die **gleiche Richtung** tendieren – unabhängig davon, ob die absoluten Werte übereinstimmen.

- **r = 1.0** – perfekte positive Korrelation: Wenn der Mensch einen hohen Score gibt, tut es das Modell auch
- **r = 0.7–0.9** – gute Übereinstimmung in der Tendenz
- **r = 0.5–0.7** – mässig, Modell erkennt Richtung, aber mit Abweichungen
- **r < 0.5** – schwach, Modell und Mensch sind kaum einig

**Warum wichtig:** Ein Modell könnte alle Scores um +1 verschieben (schlechter MAE), aber trotzdem perfekt in der Reihenfolge liegen (Pearson r ≈ 1.0). Das wäre ein Kalibrierproblem, kein Verständnisproblem.

---

### Accuracy @±1 – Toleranz-Genauigkeit

Anteil der Artikel, bei denen der Model-Score **maximal einen Punkt** vom Human-Score abweicht.

- **100%** – Modell liegt bei jedem Artikel innerhalb einer Score-Stufe
- **85–95%** – sehr gut für einen 5-Punkte-Score
- **70–85%** – akzeptabel
- **< 70%** – Scoring-Prompt prüfen

**Warum ±1 Toleranz:** In der Praxis ist der Unterschied zwischen Score 4 und 5 (oder 2 und 3) oft subjektiv. Entscheidend ist die Grenze 3/4, also ob ein Artikel ins Issue kommt oder nicht. Eine Abweichung von ±1 ist deshalb vertretbar.

---

## Wann ein Eval laufen sollte

- Bei jeder Änderung an `score.js` (Prompt, Modell, Parameter) → via GitHub Actions automatisch
- Nach grösseren Quellenänderungen (neue Adapter können das Score-Spektrum verschieben)
- Wenn das Daily-Issue sich qualitativ verändert (zu viel Rauschen, zu wenige Artikel)

Solange der Goldstandard klein ist, dient das Eval vor allem als Smoke-Test für API-Aufruf, JSON-Parsing und grobe Prompt-Richtung. Belastbare Qualitätsmetriken entstehen erst wieder mit einem breiteren Set über alle Score-Stufen und Quellentypen.

## Goldstandard per Review-Oberfläche pflegen

Die Datei `goldstandard.json` muss nicht von Hand editiert werden. Für die manuelle Bewertung gibt es eine lokale Browser-Oberfläche:

```bash
npm run eval:review
```

Danach im Browser `http://localhost:8787` öffnen.

Empfohlener Ablauf:

1. **Review-Stapel erstellen** klicken. Die Oberfläche wählt bis zu 12 noch unbewertete Artikel aus den neuesten Runs aus.
2. Artikel lesen: Titel, Quelle, Datum, Textauszug und optional den Original-Link.
3. **Daily-Score für diese Aufbereitung** mit den Buttons **1–5** vergeben oder direkt die Tastaturzahlen **1–5** verwenden. Dieser Score bewertet nur Titel und Textauszug, also den Input, den das Scoring-Modell wirklich sieht.
4. Optional ein **Problem markieren**, wenn der Originalartikel eigentlich relevant wirkt, aber die Aufbereitung zu dünn oder kaputt ist.
5. Die Bewertung wird sofort in `evals/goldstandard.json` gespeichert und der nächste Artikel wird geöffnet.
6. Unsichere Artikel mit **Überspringen** auslassen; lieber wenige gute Urteile als viele halbherzige.

Für den Start reichen 10–15 echte Artikel. Besonders wertvoll sind Grenzfälle rund um Score 3/4, weil dort entschieden wird, ob ein Artikel ins Daily-Issue kommt.

## Resultate interpretieren

Die JSON-Reports in `evals/results/` enthalten neben den aggregierten Metriken auch die Einzel-Bewertungen pro Artikel (`details`-Array). Wenn der MAE schlecht ist, lohnt es sich, die Ausreisser (`diff` > 2 oder < -2) manuell anzuschauen – sie zeigen oft systematische Schwächen im Prompt (z.B. zu grosszügig bei Show-HN, zu streng bei strategischen Meldungen).

---

## Deliver-Eval (`deliver_eval.js`)

Während das Scoring-Eval prüft, ob die richtigen Artikel ausgewählt werden, prüft das Deliver-Eval, ob die *geschriebenen* 3-Block-Aufbereitungen die Qualitätsmessdaten halten, die der Deliver-Prompt verlangt.

### Was es misst

**1. Faithfulness (LLM-as-Judge, Claude Haiku 4.5).** Für jeden Artikel-Writeup im letzten Daily-Issue wird der Source-Text aus der SQLite-Datenbank geladen und beides an einen Judge geschickt. Der Judge sucht nach Behauptungen im Writeup, die im Source-Text nicht belegbar sind — erfundene Modellnamen, Zahlen, Partnerschaften, behauptete Benchmarks ohne Beleg. Output: `faithfulness_score` (1–5) + Liste der konkreten Halluzinationen.

**2. Stil (LLM-as-Judge, gleiche Call).** Der Judge prüft, ob der Writeup PO-/Sprint-/Stakeholder-Sprache, generische "KI verändert X"-Sätze oder Hedging-Phrasen ("könnte man", "liesse sich") enthält. Output: `style_score` (1–5) + Liste konkreter Stil-Verstösse.

**3. Banned Phrases (deterministische Regex, kein LLM).** Der Deliver-Prompt verbietet explizit eine kurze Liste von Schablonen ("Build-vs-Buy verschiebt sich", "Effizienz wird zur Differenzierung", "der Engpass verschiebt sich") und Marketing-Anglizismen ("Headroom", "Harness", "Mikroturn", "Distributions-Engineering", "class-leading"). Diese werden regex-basiert in jedem Writeup gesucht — ein Hit ist immer ein Bug.

### Verwendung

```bash
ANTHROPIC_API_KEY=sk-... node evals/deliver_eval.js [--last N]
```

Default: letzte 3 `summary-*.md`-Files. Output:
- Konsolen-Aggregat (Faithfulness Ø + Floor, Style Ø + Floor, Counts mit Halluzinationen / Stil-Problemen / Banned-Phrases)
- Detail-Report in `evals/results/deliver-eval-YYYY-MM-DD.json`

Wenn die ausgewaehlten Summaries keine `ki-news-meta`-Writeups liefern, bricht das Eval ab. Ein gruener Lauf mit null Coverage waere sonst kein Qualitaetssignal.

### Wann der Eval läuft

Aktuell on-demand. Sinnvolle Trigger:
- Nach jeder Änderung am Deliver- oder Rewrite-Prompt (Regression-Check)
- Vor jedem grösseren Release zur Doku der Output-Qualität
- Wenn der Banned-Phrase-Count über mehrere Tage > 0 ist (Prompt-Lücke)

### Grenzen

Der Judge nutzt dasselbe Modell-Familie (Claude) wie der Writer — das ist kein Cross-Provider-Setup wie bei richtigen RAG-Evals. Faithfulness-Scores sind also Indikator, nicht Beweis. Banned-Phrases sind dagegen deterministisch und damit verlässlich.

Das Deliver-Eval läuft bewusst **nicht** in CI: es braucht die lokale SQLite-DB (`ki-news.db`) für die Source-Texte, die in den CI-Runnern nur als Cache des Daily-Workflows existiert. On-demand lokal ausführen.

---

## Embeddings-Dedup-Eval (`embedding_dedup_eval.js`)

Experiment, kein Produktions-Pfad: lässt die Token-Overlap-Heuristik aus `lib/topic-overlap.js` (Schwelle 3 gemeinsame Schlüsselwörter) gegen Embeddings-Cosine-Similarity (OpenAI `text-embedding-3-small`) antreten — als A/B über alle lokalen `articles-*.json`-Tagesdateien.

```bash
OPENAI_API_KEY=sk-... node evals/embedding_dedup_eval.js [--threshold 0.82]
```

Output: Übereinstimmungs-Zählung plus die Disagreement-Paare mit Titeln (nur-Heuristik = mögliche False Positives, nur-Embeddings = mögliche Misses), als Konsole und `evals/results/embedding-dedup-*.json`. Es gibt bewusst kein automatisches Gewinner-Urteil — die Disagreements werden von Hand gelabelt. Erst bei klarem Embeddings-Vorteil lohnt sich ein Produktions-Umbau. Kosten pro Lauf: unter einem Rappen.
