# Eval-System – Dokumentation

## Was gemessen wird und warum

Der Aggregator bewertet täglich KI-News-Artikel mit einem Score von 1–5. Dieser Score entscheidet, welche Artikel im täglichen GitHub-Issue landen. Wenn der Scoring-Prompt schlecht kalibriert ist, entstehen zwei Probleme:

- **False positives:** Irrelevante Artikel (Funding-Meldungen, Marketing) kommen durch
- **False negatives:** Gute technische Artikel werden aussortiert

Das Eval misst, wie gut das Modell mit den eigenen Urteilen übereinstimmt, die manuell auf einem Goldstandard vergeben wurden.

---

## Wie der Goldstandard entstanden ist

`goldstandard.json` enthält aktuell nur einen kleinen Seed-Satz. Der frühere Zielwert von 40 Artikeln ist bewusst noch offen, weil der Prozess und die Bewertungslogik nochmals grundlegend angepasst wurden. Der Goldstandard sollte erst wieder ausgebaut werden, wenn ein paar Daily-Runs mit dem neuen Maker-Fokus stabil sind.

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

## Resultate interpretieren

Die JSON-Reports in `evals/results/` enthalten neben den aggregierten Metriken auch die Einzel-Bewertungen pro Artikel (`details`-Array). Wenn der MAE schlecht ist, lohnt es sich, die Ausreisser (`diff` > 2 oder < -2) manuell anzuschauen – sie zeigen oft systematische Schwächen im Prompt (z.B. zu grosszügig bei Show-HN, zu streng bei strategischen Meldungen).
