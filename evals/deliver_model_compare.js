#!/usr/bin/env node
/**
 * Modellvergleich für die Deliver-Stufe (vor jedem Modellwechsel laufen lassen).
 *
 * Nimmt öffentliche Artikel mit genug Volltext aus lokalen articles-*.json,
 * lässt sie mit dem aktuellen DELIVER_MODEL auswählen, aufbereiten und
 * reviewen (dieselben Produktionspfade wie deliver.js) und bewertet jede
 * Aufbereitung mit einem FESTEN Richter-Modell (Faithfulness/Stil wie
 * deliver_eval.js) plus den deterministischen Format- und Floskelprüfungen.
 *
 * Für einen Vergleich zweimal laufen lassen, z. B.:
 *   KI_NEWS_DELIVER_MODEL=claude-sonnet-4-6 node evals/deliver_model_compare.js articles-2026-05-20.json
 *   KI_NEWS_DELIVER_MODEL=claude-sonnet-5-5 node evals/deliver_model_compare.js articles-2026-05-20.json
 *
 * Optionen (Env): COMPARE_N (Anzahl Artikel, Default 6),
 * KI_NEWS_JUDGE_MODEL (Richter, Default claude-haiku-4-5-20251001 – bleibt
 * über beide Läufe gleich, damit nur das Kandidatenmodell variiert).
 * Ausgabe: evals/results/deliver-compare-<modell>-<datum>.json
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { requireEnv } from '../lib/env.js';
import { todayString } from '../lib/date.js';
import { getUsageSummary } from '../lib/claude.js';
import { DELIVER_MODEL } from '../lib/config.js';
import { aufbereiteArtikel, reviewRun } from '../deliver.js';
import { selectDailyArticles, inspectWriteup } from '../lib/editorial.js';
import { runWithConcurrency } from '../lib/concurrency.js';
import { closeStore } from '../lib/store.js';
import { judgeOne } from './deliver_eval.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JUDGE_MODEL = process.env.KI_NEWS_JUDGE_MODEL || 'claude-haiku-4-5-20251001';
const N = parseInt(process.env.COMPARE_N || '6', 10);
const MIN_CHARS = 2500;

const mean = xs => (xs.length ? Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)) : null);
const words = t => (t || '').replace(/\*\*[^*]+\*\*/g, '').split(/\s+/).filter(Boolean).length;

async function loadArticles(files) {
  const all = [];
  for (const f of files) {
    const data = JSON.parse(await fs.readFile(path.resolve(f), 'utf-8'));
    const list = Array.isArray(data) ? data : data.articles || [];
    all.push(...list.filter(a => (a.rohtext || '').length >= MIN_CHARS));
  }
  // Deterministische Auswahl: nach URL sortiert, die ersten N.
  return all.sort((a, b) => a.url.localeCompare(b.url)).slice(0, N)
    .map(a => ({ ...a, score: 4, begründung: 'Vergleichslauf' }));
}

async function main() {
  requireEnv('ANTHROPIC_API_KEY');
  const files = process.argv.slice(2);
  if (!files.length) throw new Error('Bitte articles-*.json als Argument angeben.');
  const articles = await loadArticles(files);
  console.log(`[compare] ${articles.length} Artikel · Kandidat ${DELIVER_MODEL} · Richter ${JUDGE_MODEL}`);

  // 1. Auswahl (Structured Output)
  let selection = { ok: false };
  try {
    const picked = await selectDailyArticles(articles);
    selection = { ok: true, count: picked.length, urls: picked.map(a => a.url) };
  } catch (err) {
    selection = { ok: false, error: err.message };
  }

  // 2. Aufbereitung aller Artikel (Text)
  const writeups = await runWithConcurrency(articles, 3, async (a) => {
    try {
      const text = await aufbereiteArtikel(a, { logTag: 'compare-aufbereitung' });
      return { url: a.url, titel: a.titel, quelle: a.quelle, writeup: text || '', format_ok: !!text };
    } catch (err) {
      return { url: a.url, titel: a.titel, quelle: a.quelle, writeup: '', format_ok: false, error: err.message };
    }
  });

  // 3. Review-Schlaufe (Structured Output, grosses Schema)
  const ok = writeups.filter(w => w.format_ok);
  const review = await reviewRun(articles.filter(a => ok.some(w => w.url === a.url)), ok.map(w => w.writeup), []);

  // 4. Fester Richter + deterministische Prüfungen
  const judged = await runWithConcurrency(writeups, 3, (w) => {
    const src = articles.find(a => a.url === w.url)?.rohtext || '';
    return w.format_ok ? judgeOne(w, src, { model: JUDGE_MODEL }) : { ...w, judgement: null, judge_error: 'kein Text' };
  });
  const rows = judged.map(j => ({
    url: j.url, format_ok: j.format_ok, words: words(j.writeup),
    inspect_issues: j.format_ok ? inspectWriteup(j.writeup) : ['Format verlassen'],
    banned_phrases: j.banned_phrases || [],
    faithfulness: j.judgement?.faithfulness_score ?? null,
    style: j.judgement?.style_score ?? null,
    hallucinations: j.judgement?.hallucinations?.length ?? null,
    writeup: j.writeup,
  }));
  const reviewRows = review.result?.selected_articles || [];

  const summary = {
    model: DELIVER_MODEL, judge_model: JUDGE_MODEL, date: todayString(), articles: rows.length,
    selection,
    format_ok: rows.filter(r => r.format_ok).length,
    with_inspect_issues: rows.filter(r => r.inspect_issues.length).length,
    with_banned_phrases: rows.filter(r => r.banned_phrases.length).length,
    mean_words: mean(rows.filter(r => r.format_ok).map(r => r.words)),
    mean_faithfulness: mean(rows.map(r => r.faithfulness).filter(x => x != null)),
    min_faithfulness: Math.min(...rows.map(r => r.faithfulness).filter(x => x != null)),
    mean_style: mean(rows.map(r => r.style).filter(x => x != null)),
    total_hallucinations: rows.reduce((s, r) => s + (r.hallucinations || 0), 0),
    review_ok: !review.error, review_error: review.error || null, review_rows: reviewRows.length,
    usage: getUsageSummary(),
  };
  console.log(JSON.stringify({ ...summary, usage: summary.usage.totals }, null, 2));
  const out = path.join(__dirname, 'results', `deliver-compare-${DELIVER_MODEL}-${summary.date}.json`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify({ ...summary, rows, review: review.result || null }, null, 2));
  console.log(`[compare] Bericht: ${out}`);
}

main()
  .catch(err => { console.error('[fatal]', err.message); process.exit(1); })
  .finally(() => { https.globalAgent.destroy(); closeStore(); });
