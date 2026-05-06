#!/usr/bin/env python3
"""
Eval-Runner für ki-news-aggregator.

Lädt Artikel aus goldstandard.json, bewertet sie mit derselben Scoring-Logik
wie score.js (gleicher Prompt, gleiches Modell) und vergleicht das Ergebnis
mit den manuell vergebenen Human-Scores.

Metriken:
  MAE           – mittlere absolute Abweichung zwischen Model- und Human-Score
  Pearson-r     – lineare Korrelation (1.0 = perfekt, 0 = kein Zusammenhang)
  Accuracy @±1  – Anteil Artikel, bei dem Model-Score maximal 1 Punkt abweicht

Verwendung:
  ANTHROPIC_API_KEY=sk-... python evals/run_eval.py
"""

import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path

# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------

SCRIPT_DIR   = Path(__file__).parent
GOLD_FILE    = SCRIPT_DIR / "goldstandard.json"
RESULTS_DIR  = SCRIPT_DIR / "results"

MODEL        = "claude-haiku-4-5-20251001"
MAX_TOKENS   = 200
CONCURRENCY  = 5
MAX_RETRIES  = 3
RETRY_DELAY  = 2  # Sekunden, wird pro Retry-Stufe multipliziert

# ---------------------------------------------------------------------------
# Scoring-Prompt – 1:1 identisch mit score.js, damit das Eval die echte
# Produktions-Logik misst und nicht eine abweichende Variante.
# ---------------------------------------------------------------------------

PROMPT_TEMPLATE = """\
Du bewertest Artikel für einen Solo-Entwickler, der konkrete technische Abendprojekte sucht. \
Primäre Frage: Liefert dieser Artikel eine konkrete Idee, die ich als Einzelperson an einem \
Abend mit Claude Code technisch umsetzen oder ausprobieren kann?

Score 4–5 – technisch umsetzbar, direkt verwertbar:
- Neue Modell-Capabilities mit konkreter API (Tool Use, Reasoning, Kontext-Erweiterung)
- SDKs, Frameworks, MCP-Server, Eval-Tools, die man direkt einsetzen kann
- Architektur-Erkenntnisse zu Agenten-Systemen mit praktischem Muster
- Strategische Verschiebungen (Pricing, OSS-Releases), die eigene Projekte direkt betreffen

Score 1–2 – kein technischer Mehrwert für eigene Projekte:
- Verwaltungs- oder Prozess-Tools (Ticket-Systeme, Sprint-Planung, Stakeholder-Reporting)
- Generische "KI verändert Branche XY"-Artikel ohne technische Substanz
- Reine VC-/Funding-Meldungen ohne Produktdetail
- Marketing-Posts ohne neue Capability
- Quelle "hackernews-show": Show-HN-Selbstpromotion ohne klare technische Differenzierung \
→ maximal Score 2, ausser der Inhalt ist technisch aussergewöhnlich

Die Begründung benennt den konkreten Mehrwert für ein Maker-Projekt (ein Satz).

Antworte NUR mit JSON (kein Markdown, kein Code-Block): {{"score": <1-5>, "begründung": "<ein Satz>"}}

Titel: {titel}
Quelle: {quelle}
Text: {rohtext}\
"""

# ---------------------------------------------------------------------------
# API-Aufruf
# ---------------------------------------------------------------------------

def _call_api(article: dict, api_key: str, retries: int = 0) -> tuple[int, str]:
    """Schickt einen Artikel an die Claude API, gibt (score, begründung) zurück."""
    rohtext = (article.get("rohtext") or "")[:1500]
    prompt  = PROMPT_TEMPLATE.format(
        titel   = article.get("titel", ""),
        quelle  = article.get("quelle", ""),
        rohtext = rohtext,
    )
    payload = json.dumps({
        "model":      MODEL,
        "max_tokens": MAX_TOKENS,
        "messages":   [{"role": "user", "content": prompt}],
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data    = payload,
        headers = {
            "Content-Type":      "application/json",
            "x-api-key":         api_key,
            "anthropic-version": "2023-06-01",
        },
        method = "POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            text = body["content"][0]["text"]
            # Markdown-Code-Block entfernen, falls Modell ihn trotzdem hinzufügt
            text = text.replace("```json", "").replace("```", "").strip()
            result = json.loads(text)
            return int(result["score"]), result.get("begründung", "")
    except urllib.error.HTTPError as exc:
        if exc.code == 429 and retries < MAX_RETRIES:
            delay = RETRY_DELAY * (retries + 1)
            print(f"  429 Rate Limit – warte {delay}s (Retry {retries + 1}/{MAX_RETRIES})",
                  flush=True)
            time.sleep(delay)
            return _call_api(article, api_key, retries + 1)
        body_text = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API Fehler HTTP {exc.code}: {body_text}") from exc


def score_article(item: tuple) -> dict:
    """Wrapper für ThreadPoolExecutor: nimmt (index, article, api_key), gibt Result-Dict zurück."""
    idx, article, api_key = item
    try:
        model_score, begründung = _call_api(article, api_key)
        print(f"  [{idx}] Score {model_score} (Human: {article['human_score']}) – {article['titel'][:70]}",
              flush=True)
        return {
            "titel":        article["titel"],
            "url":          article.get("url", ""),
            "quelle":       article.get("quelle", ""),
            "human_score":  article["human_score"],
            "model_score":  model_score,
            "begründung":   begründung,
            "diff":         model_score - article["human_score"],
            "error":        None,
        }
    except Exception as exc:  # noqa: BLE001
        print(f"  [{idx}] FEHLER: {exc}", flush=True)
        return {
            "titel":       article.get("titel", ""),
            "url":         article.get("url", ""),
            "quelle":      article.get("quelle", ""),
            "human_score": article["human_score"],
            "model_score": None,
            "begründung":  None,
            "diff":        None,
            "error":       str(exc),
        }

# ---------------------------------------------------------------------------
# Metriken
# ---------------------------------------------------------------------------

def compute_mae(pairs: list[tuple[int, int]]) -> float:
    return sum(abs(h - m) for h, m in pairs) / len(pairs)


def compute_pearson(pairs: list[tuple[int, int]]) -> float | None:
    n = len(pairs)
    if n < 2:
        return None
    xs = [h for h, _ in pairs]
    ys = [m for _, m in pairs]
    mx, my = sum(xs) / n, sum(ys) / n
    num   = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    denom = math.sqrt(
        sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys)
    )
    return round(num / denom, 4) if denom else 0.0


def compute_accuracy_at_1(pairs: list[tuple[int, int]]) -> float:
    return sum(1 for h, m in pairs if abs(h - m) <= 1) / len(pairs)

# ---------------------------------------------------------------------------
# Hauptprogramm
# ---------------------------------------------------------------------------

def main() -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY nicht gesetzt.", file=sys.stderr)
        sys.exit(1)

    if not GOLD_FILE.exists():
        print(f"ERROR: {GOLD_FILE} nicht gefunden.", file=sys.stderr)
        sys.exit(1)

    articles = json.loads(GOLD_FILE.read_text(encoding="utf-8"))
    if not articles:
        print("ERROR: goldstandard.json ist leer.", file=sys.stderr)
        sys.exit(1)

    print(f"Eval gestartet – {len(articles)} Artikel, Modell: {MODEL}")
    print("-" * 60)

    # Concurrent Scoring
    items = [(i + 1, a, api_key) for i, a in enumerate(articles)]
    results = [None] * len(items)
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        future_to_idx = {pool.submit(score_article, item): item[0] - 1 for item in items}
        for future in as_completed(future_to_idx):
            results[future_to_idx[future]] = future.result()

    # Nur erfolgreich bewertete Artikel für Metriken verwenden
    scored = [r for r in results if r["model_score"] is not None]
    failed = len(results) - len(scored)
    pairs  = [(r["human_score"], r["model_score"]) for r in scored]

    # Metriken
    mae         = round(compute_mae(pairs), 3)         if pairs else None
    pearson     = compute_pearson(pairs)               if pairs else None
    accuracy_1  = round(compute_accuracy_at_1(pairs), 3) if pairs else None

    # Score-Verteilung
    from collections import Counter
    human_dist = dict(sorted(Counter(r["human_score"] for r in results).items()))
    model_dist = dict(sorted(Counter(r["model_score"] for r in scored).items()))

    # Report speichern
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    today      = date.today().isoformat()
    out_file   = RESULTS_DIR / f"{today}.json"
    report     = {
        "date":          today,
        "model":         MODEL,
        "n_total":       len(articles),
        "n_scored":      len(scored),
        "n_failed":      failed,
        "metrics": {
            "mae":          mae,
            "pearson_r":    pearson,
            "accuracy_at_1": accuracy_1,
        },
        "score_distribution": {
            "human": human_dist,
            "model": model_dist,
        },
        "details": results,
    }
    out_file.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    # Stdout-Summary
    print()
    print("=" * 60)
    print(f"  EVAL RESULTS  –  {today}")
    print("=" * 60)
    print(f"  Artikel gesamt:        {len(articles)}")
    print(f"  Erfolgreich bewertet:  {len(scored)}")
    if failed:
        print(f"  Fehler:                {failed}")
    print()
    print(f"  MAE (Ø Abweichung):    {mae}")
    print(f"  Pearson-r:             {pearson}")
    print(f"  Accuracy @±1:          {accuracy_1 * 100:.1f}%" if accuracy_1 is not None else "  Accuracy @±1:          –")
    print()
    print(f"  Human-Score Verteilung:  {human_dist}")
    print(f"  Model-Score Verteilung:  {model_dist}")
    print()
    print(f"  Report gespeichert: {out_file}")
    print("=" * 60)

    # Exit-Code 1 wenn MAE > 1.5 (grobe Richtlinie)
    if mae is not None and mae > 1.5:
        print(f"\nWARNING: MAE {mae} überschreitet Schwelle 1.5 – Scoring-Prompt prüfen.")
        sys.exit(1)


if __name__ == "__main__":
    main()
