#!/usr/bin/env node
/**
 * Eval-Runner fuer ki-news-aggregator.
 *
 * Laedt Artikel aus goldstandard.json, bewertet sie ueber denselben Scoring-
 * Pfad wie score.js und vergleicht die Scores mit den Human-Labels.
 */

import fs from 'fs/promises';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUsageSummary } from '../lib/claude.js';
import { SCORE_MODEL } from '../lib/config.js';
import { todayString } from '../lib/date.js';
import { loadEnv, requireEnv } from '../lib/env.js';
import { scoreArticleWithPrefilter } from '../lib/scoring.js';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLD_FILE = path.join(__dirname, 'goldstandard.json');
const RESULTS_DIR = path.join(__dirname, 'results');
const CONCURRENCY = 5;

function round(value, digits) {
  return Number(value.toFixed(digits));
}

export function computeMae(pairs) {
  return pairs.reduce((sum, [human, model]) => sum + Math.abs(human - model), 0) / pairs.length;
}

export function computePearson(pairs) {
  if (pairs.length < 2) return null;

  const xs = pairs.map(([human]) => human);
  const ys = pairs.map(([, model]) => model);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const numerator = xs.reduce((sum, value, index) => sum + ((value - meanX) * (ys[index] - meanY)), 0);
  const denominator = Math.sqrt(
    xs.reduce((sum, value) => sum + ((value - meanX) ** 2), 0)
    * ys.reduce((sum, value) => sum + ((value - meanY) ** 2), 0)
  );

  return denominator ? round(numerator / denominator, 4) : 0;
}

export function computeAccuracyAt1(pairs) {
  return pairs.filter(([human, model]) => Math.abs(human - model) <= 1).length / pairs.length;
}

function distribution(values) {
  return Object.fromEntries(
    [...values.reduce((counts, value) => counts.set(value, (counts.get(value) || 0) + 1), new Map()).entries()]
      .sort(([a], [b]) => a - b)
  );
}

async function runWithConcurrency(items, fn, limit) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

async function scoreGoldArticle(article, index) {
  try {
    const rating = await scoreArticleWithPrefilter(article, { logTag: 'score-eval' });
    console.log(`  [${index + 1}] Score ${rating.score} (Human: ${article.human_score}) - ${article.titel.slice(0, 70)}`);
    return {
      titel: article.titel,
      url: article.url || '',
      quelle: article.quelle || '',
      human_score: article.human_score,
      model_score: rating.score,
      begründung: rating.begründung,
      strategy_only: rating.strategy_only,
      pre_filtered: rating.pre_filtered || null,
      diff: rating.score - article.human_score,
      error: null,
    };
  } catch (err) {
    console.error(`  [${index + 1}] FEHLER: ${err.message}`);
    return {
      titel: article.titel || '',
      url: article.url || '',
      quelle: article.quelle || '',
      human_score: article.human_score,
      model_score: null,
      begründung: null,
      strategy_only: null,
      pre_filtered: null,
      diff: null,
      error: err.message,
    };
  }
}

export async function main() {
  requireEnv('ANTHROPIC_API_KEY');

  const articles = JSON.parse(await fs.readFile(GOLD_FILE, 'utf-8'));
  if (!Array.isArray(articles) || articles.length === 0) {
    throw new Error('goldstandard.json ist leer oder kein Array.');
  }

  console.log(`Eval gestartet - ${articles.length} Artikel, Modell: ${SCORE_MODEL}`);
  console.log('-'.repeat(60));

  const results = await runWithConcurrency(articles, scoreGoldArticle, CONCURRENCY);
  const scored = results.filter(result => result.model_score !== null);
  const failed = results.length - scored.length;
  const pairs = scored.map(result => [result.human_score, result.model_score]);

  const mae = pairs.length ? round(computeMae(pairs), 3) : null;
  const pearson = pairs.length ? computePearson(pairs) : null;
  const accuracyAt1 = pairs.length ? round(computeAccuracyAt1(pairs), 3) : null;
  const humanDist = distribution(results.map(result => result.human_score));
  const modelDist = distribution(scored.map(result => result.model_score));

  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const today = todayString();
  const outFile = path.join(RESULTS_DIR, `${today}.json`);
  await fs.writeFile(outFile, JSON.stringify({
    date: today,
    model: SCORE_MODEL,
    scoring_path: 'lib/scoring.js',
    n_total: articles.length,
    n_scored: scored.length,
    n_failed: failed,
    metrics: {
      mae,
      pearson_r: pearson,
      accuracy_at_1: accuracyAt1,
    },
    score_distribution: {
      human: humanDist,
      model: modelDist,
    },
    details: results,
    usage: getUsageSummary(),
  }, null, 2), 'utf-8');

  console.log();
  console.log('='.repeat(60));
  console.log(`  EVAL RESULTS  -  ${today}`);
  console.log('='.repeat(60));
  console.log(`  Artikel gesamt:        ${articles.length}`);
  console.log(`  Erfolgreich bewertet:  ${scored.length}`);
  if (failed) console.log(`  Fehler:                ${failed}`);
  console.log();
  console.log(`  MAE (Abweichung):      ${mae}`);
  console.log(`  Pearson-r:             ${pearson}`);
  console.log(accuracyAt1 === null
    ? '  Accuracy @+/-1:        -'
    : `  Accuracy @+/-1:        ${(accuracyAt1 * 100).toFixed(1)}%`);
  console.log();
  console.log(`  Human-Score Verteilung:  ${JSON.stringify(humanDist)}`);
  console.log(`  Model-Score Verteilung:  ${JSON.stringify(modelDist)}`);
  console.log();
  console.log(`  Report gespeichert: ${outFile}`);
  console.log('='.repeat(60));

  if (mae !== null && mae > 1.5) {
    console.error(`\nWARNING: MAE ${mae} ueberschreitet Schwelle 1.5 - Scoring-Prompt pruefen.`);
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main()
    .catch(err => {
      console.error(`[fatal] ${err.message}`);
      process.exitCode = 1;
    })
    .finally(() => https.globalAgent.destroy());
}
