import fs from 'fs/promises';
import https from 'https';
import { loadEnv, requireEnv } from './lib/env.js';
import { todayString } from './lib/date.js';
import { claudeBatch, BatchStuckError, getUsageSummary } from './lib/claude.js';
import { SCORE_MODEL, SCORE_CUTOFF_DELIVER, CROSS_DAY_DEDUP_LOOKBACK } from './lib/config.js';
import { applyEventDedup, applyClusterBonus } from './lib/topic-overlap.js';
import { recordUsage, closeStore } from './lib/store.js';
import { loadRecentlyPublished, detectCrossDayDuplicate } from './lib/cross-day-dedup.js';
import { runWithConcurrency } from './lib/concurrency.js';
import { parseArticles } from './lib/schema.js';
import {
  buildScoreRequestParams,
  mapScoreToolInput,
  preFilterArticle,
  scoreArticle,
} from './lib/scoring.js';

loadEnv();

const CONCURRENCY = 5;

// Batch-Variante: alle Artikel in einem Anthropic-Batch-Submit → 50% Rabatt.
// Async (typisch <10 min), aber für Cron-Workload akzeptabel.
async function runViaBatch(articles) {
  if (articles.length === 0) return [];

  const requests = articles.map((article, i) => {
    const params = buildScoreRequestParams(article);
    return {
      custom_id: `score_${i}`,
      model: SCORE_MODEL,
      ...params,
    };
  });

  const resultsMap = await claudeBatch(requests, { logTag: 'score-batch' });

  const out = new Array(articles.length);
  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < articles.length; i++) {
    const r = resultsMap.get(`score_${i}`);
    if (!r) {
      out[i] = { ...articles[i], score: null, begründung: null };
      failed++;
      continue;
    }
    if (r.error || !r.tool_input) {
      console.error(`[score-batch] Fehler bei "${articles[i].titel}": ${r.error || 'kein tool_input'}`);
      out[i] = { ...articles[i], score: null, begründung: null };
      failed++;
      continue;
    }
    const rating = mapScoreToolInput(r.tool_input);
    out[i] = { ...articles[i], ...rating };
    succeeded++;
    console.log(`[${i + 1}/${articles.length}] Score ${rating.score} – ${articles[i].titel}`);
  }
  console.log(`[score-batch] ${succeeded} erfolgreich, ${failed} fehlgeschlagen`);
  return out;
}

// Sync-Variante: nutzt den geteilten Concurrency-Helper aus lib/concurrency.js.
function scoreWithConcurrency(articles, limit) {
  return runWithConcurrency(articles, limit, async (article, i) => {
    try {
      const rating = await scoreArticle(article);
      console.log(`[${i + 1}/${articles.length}] Score ${rating.score} – ${article.titel}`);
      return { ...article, ...rating };
    } catch (err) {
      console.error(`[${i + 1}/${articles.length}] Fehler bei "${article.titel}": ${err.message}`);
      return { ...article, score: null, begründung: null };
    }
  });
}

async function main() {
  requireEnv('ANTHROPIC_API_KEY');

  const date = todayString();
  const articleFile = `articles-${date}.json`;

  try { await fs.access(articleFile); }
  catch {
    console.error(`${articleFile} nicht gefunden. Bitte zuerst node ingest.js für denselben Lauf ausführen.`);
    process.exit(1);
  }

  console.log(`Lese: ${articleFile}`);
  let articles;
  try {
    // Schema-Validierung am Phasen-Übergang Ingest → Score (lib/schema.js).
    articles = parseArticles(JSON.parse(await fs.readFile(articleFile, 'utf-8')));
  } catch (err) {
    console.error(`Fehler beim Lesen von ${articleFile}: ${err.message}`);
    process.exit(1);
  }
  console.log(`${articles.length} Artikel geladen`);

  // Pre-Dedup: Artikel, die bereits in den letzten Daily-Issues waren, gehen
  // gar nicht erst ans LLM. Spart Score-Calls und damit Tokens.
  const recent = await loadRecentlyPublished(process.env.GH_PAT, CROSS_DAY_DEDUP_LOOKBACK, date);
  const beforeDedup = articles.length;
  const articlesAfterDedup = articles.filter(article => {
    const dup = detectCrossDayDuplicate(article, recent);
    if (dup) {
      console.log(`[pre-dedup] "${article.titel}" übersprungen (${dup.reason}${dup.matched_title ? `: "${dup.matched_title}"` : ''})`);
      return false;
    }
    return true;
  });
  if (beforeDedup !== articlesAfterDedup.length) {
    console.log(`[pre-dedup] ${beforeDedup - articlesAfterDedup.length} Artikel vor Scoring rausgefiltert (Quelle: ${recent.source})`);
  }

  // Pre-Filter: deterministische Vorab-Bewertung ohne LLM-Call.
  const preFiltered = [];
  const toScore = [];
  for (const article of articlesAfterDedup) {
    const rating = preFilterArticle(article);
    if (rating) preFiltered.push({ ...article, ...rating });
    else toScore.push(article);
  }
  if (preFiltered.length > 0) {
    const breakdown = {};
    for (const a of preFiltered) breakdown[a.pre_filtered] = (breakdown[a.pre_filtered] || 0) + 1;
    const summary = Object.entries(breakdown).map(([k, v]) => `${v}× ${k}`).join(', ');
    console.log(`[pre-filter] ${preFiltered.length} Artikel auto-bewertet ohne LLM-Call: ${summary}`);
  }

  const useBatch = process.env.SCORE_USE_BATCH !== 'false';
  console.log(`[score] ${toScore.length} Artikel gehen ans LLM (${articles.length} - ${beforeDedup - articlesAfterDedup.length} dedup - ${preFiltered.length} pre-filter) – Modus: ${useBatch ? 'BATCH (50% Rabatt)' : 'SYNC'}`);
  let scoredFromLlm;
  if (useBatch) {
    try {
      scoredFromLlm = await runViaBatch(toScore);
    } catch (err) {
      if (err instanceof BatchStuckError) {
        console.warn(`[score] ${err.message} – starte Sync-Fallback …`);
        scoredFromLlm = await scoreWithConcurrency(toScore, CONCURRENCY);
      } else {
        throw err;
      }
    }
  } else {
    scoredFromLlm = await scoreWithConcurrency(toScore, CONCURRENCY);
  }
  const scored = [...preFiltered, ...scoredFromLlm];

  const failedCount = scored.filter(a => a.score === null).length;
  const deduplicated = applyEventDedup(
    scored.filter(a => a.score !== null),
    { onPenalty: (loser, winner) => console.log(`[dedup] Score -1 für "${loser.titel}" (Event-Überschneidung mit "${winner.titel}")`) }
  );
  const boosted = applyClusterBonus(deduplicated, {
    onBonus: (article, anchor) => console.log(`[cluster] Score +1 für "${article.titel}" (ergänzt "${anchor.titel}")`),
  });

  const deliverCandidates = boosted.filter(a => a.score >= SCORE_CUTOFF_DELIVER).length;
  const belowDeliverCutoff = boosted.length - deliverCandidates;
  console.log(`\n${boosted.length} bewertete Artikel gespeichert, ${deliverCandidates} mit Score >= ${SCORE_CUTOFF_DELIVER}, ${belowDeliverCutoff} unter Deliver-Cutoff, ${failedCount} API-Fehler`);

  const filename = `scored-${date}.json`;
  await fs.writeFile(filename, JSON.stringify(boosted, null, 2), 'utf-8');
  console.log(`Gespeichert: ${filename}`);

  const usage = getUsageSummary();
  if (usage.totals.calls > 0) {
    console.log(`[usage] ${usage.totals.calls} Calls · in ${usage.totals.input_tokens} · cache_create ${usage.totals.cache_creation_input_tokens} · cache_read ${usage.totals.cache_read_input_tokens} (Hit ${(usage.cache_hit_rate * 100).toFixed(1)}%) · out ${usage.totals.output_tokens} · $${usage.totals.usd.toFixed(4)}`);
    recordUsage({ run_date: date, stage: 'score', by_log_tag: usage.by_log_tag });
  }

  // Schlägt mehr als die Hälfte der LLM-Calls fehl, ist das ein API-Ausfall
  // und kein ruhiger Nachrichtentag – Workflow soll rot werden statt still
  // "kein Issue" zu liefern. Datei + Usage sind zu dem Zeitpunkt geschrieben.
  if (toScore.length > 0 && failedCount / toScore.length > 0.5) {
    console.error(`[score] ${failedCount}/${toScore.length} LLM-Calls fehlgeschlagen (>50%) – breche mit Fehler ab.`);
    process.exit(1);
  }
}

main()
  .catch(err => { console.error('[fatal]', err.message); process.exit(1); })
  .finally(() => { https.globalAgent.destroy(); closeStore(); });
