import fs from 'fs/promises';
import https from 'https';
import { todayString } from './lib/date.js';
import { normalizeUrl } from './lib/url.js';
import { recordAdapterHealth, recordAdapterTruncated, getStaleAdapters, closeStore } from './lib/store.js';
import { syncAdapterAlerts } from './lib/adapter-alerts.js';
import { fetchArticles as fetchWillison } from './adapters/willison.js';
import { fetchArticles as fetchLatentSpace } from './adapters/latentspace.js';
import { fetchArticles as fetchAnthropic } from './adapters/anthropic.js';
import { fetchArticles as fetchHackerNews } from './adapters/hackernews.js';
import { fetchArticles as fetchLastWeekInAI } from './adapters/lastweekinai.js';
import { fetchArticles as fetchVentureBeat } from './adapters/venturebeat.js';
import { fetchArticles as fetchHuggingFace } from './adapters/huggingface.js';
import { fetchArticles as fetchAheadOfAI } from './adapters/aheadofai.js';
import { fetchArticles as fetchInterconnects } from './adapters/interconnects.js';
import { fetchArticles as fetchTheBatch } from './adapters/thebatch.js';
import { fetchArticles as fetchYannicKilcher } from './adapters/yannickilcher.js';
import { fetchArticles as fetchBenEvans } from './adapters/benevans.js';
import { fetchArticles as fetchA16z } from './adapters/a16z.js';
import { fetchArticles as fetchHeise } from './adapters/heise.js';
import { fetchArticles as fetchGolem } from './adapters/golem.js';

const MAX_ARTICLE_AGE_DAYS = 3;
const ADAPTER_TIMEOUT_MS = 30_000;

function withTimeout(promise, ms, name) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timeout nach ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

const ADAPTERS = [
  { name: 'simonwillison', fn: fetchWillison },
  { name: 'latentspace', fn: fetchLatentSpace },
  { name: 'anthropic', fn: fetchAnthropic },
  { name: 'hackernews', fn: fetchHackerNews },
  { name: 'lastweekinai', fn: fetchLastWeekInAI },
  { name: 'venturebeat', fn: fetchVentureBeat },
  { name: 'huggingface', fn: fetchHuggingFace },
  { name: 'aheadofai', fn: fetchAheadOfAI },
  { name: 'interconnects', fn: fetchInterconnects },
  { name: 'thebatch', fn: fetchTheBatch },
  { name: 'yannickilcher', fn: fetchYannicKilcher },
  { name: 'benevans', fn: fetchBenEvans },
  { name: 'a16z', fn: fetchA16z },
  { name: 'heise', fn: fetchHeise },
  { name: 'golem', fn: fetchGolem },
];

async function runAdapters(runDate) {
  const results = await Promise.allSettled(
    ADAPTERS.map(a => withTimeout(a.fn(), ADAPTER_TIMEOUT_MS, a.name))
  );
  const articles = [];
  const perAdapter = [];
  for (let i = 0; i < ADAPTERS.length; i++) {
    const { name } = ADAPTERS[i];
    const result = results[i];
    if (result.status === 'fulfilled') {
      console.log(`[${name}] ${result.value.length} Artikel geladen`);
      articles.push(...result.value);
      const dates = result.value.map(article => article.datum).filter(date => date && Number.isFinite(Date.parse(date))).sort((a, b) => Date.parse(b) - Date.parse(a));
      perAdapter.push({ name, fetched: result.value.length, error: null, latest: dates[0] || null });
    } else {
      console.error(`[${name}] Fehler: ${result.reason.message}`);
      perAdapter.push({ name, fetched: 0, error: result.reason.message });
    }
  }
  // Adapter-Health persistieren (truncated_count wird später nachgereicht).
  for (const a of perAdapter) {
    recordAdapterHealth({
      run_date: runDate,
      adapter: a.name,
      articles_fetched: a.fetched,
      error_message: a.error,
    });
  }
  return { articles, health: perAdapter };
}

function deduplicate(articles) {
  const seen = new Set();
  return articles.filter(a => {
    const normalized = normalizeUrl(a.url);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function filterByAge(articles, runDate) {
  // Cutoff vom Laufdatum ableiten (respektiert RUN_DATE), nicht von der
  // Wall-Clock – sonst filtert ein nachträglicher Lauf falsche Artikel.
  const cutoff = new Date(`${runDate}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - MAX_ARTICLE_AGE_DAYS);
  const filtered = articles.filter(a => {
    if (!a.datum) return true;
    const date = new Date(a.datum);
    return isNaN(date.getTime()) || date >= cutoff;
  });
  const dropped = articles.length - filtered.length;
  if (dropped > 0) console.log(`${dropped} Artikel als zu alt gefiltert (> ${MAX_ARTICLE_AGE_DAYS} Tage)`);
  return filtered;
}

function flagTruncated(articles) {
  let truncatedCount = 0;
  const flagged = articles.map(a => {
    const len = (a.rohtext || '').length;
    if (len < 300) {
      truncatedCount++;
      return { ...a, truncated: true };
    }
    return a;
  });
  if (truncatedCount > 0) {
    console.warn(`[ingest] ${truncatedCount} Artikel mit raw_text < 300 Zeichen (truncated: true gesetzt)`);
  }
  return flagged;
}

// Truncated-Counts pro Quelle nachreichen – die Adapter-Health-Tabelle
// bekommt damit auch die Qualitätsdimension "wie viel ist nur Teaser".
function backfillTruncatedPerAdapter(articles, runDate) {
  const counts = {};
  for (const a of articles) {
    if (a.truncated) counts[a.quelle] = (counts[a.quelle] || 0) + 1;
  }
  for (const [adapter, truncated_count] of Object.entries(counts)) {
    // Nur truncated_count nachreichen. articles_fetched bleibt der
    // ursprüngliche Fetch-Count aus runAdapters – er darf hier nicht mit dem
    // kleineren Post-Dedup/Post-Age-Count überschrieben werden, sonst würde
    // die Stale-Detection einen Adapter fälschlich als abgedriftet werten.
    recordAdapterTruncated({
      run_date: runDate,
      adapter,
      truncated_count,
    });
  }
}

function flagPricingSignals(articles) {
  const PRICING_PATTERN = /\$[\d.,]+|\bpricing\b|\bprice\b|\bkosten\b|\bpreis\b|\bper token\b|\bper request\b|\brate limit\b|\bfree tier\b|\bpaid plan\b|\bcost\b|\bgebühr\b|\btier\b/i;
  return articles.map(a => {
    const text = `${a.titel} ${a.rohtext || ''}`;
    return { ...a, pricing_signal_found: PRICING_PATTERN.test(text) };
  });
}

async function main() {
  const runDate = todayString();
  const { articles: raw, health } = await runAdapters(runDate);
  const deduped = deduplicate(raw);
  const aged = filterByAge(deduped, runDate);
  const truncated = flagTruncated(aged);
  const articles = flagPricingSignals(truncated);
  backfillTruncatedPerAdapter(articles, runDate);

  console.log(`${articles.length} Artikel nach Deduplizierung (${raw.length - deduped.length} Duplikate entfernt)`);

  const filename = `articles-${runDate}.json`;
  await fs.writeFile(filename, JSON.stringify(articles, null, 2), 'utf-8');
  console.log(`Gespeichert: ${filename}`);

  try {
    const outcomes = await syncAdapterAlerts(process.env.GH_PAT, { health, stale: getStaleAdapters(3), runDate });
    for (const outcome of outcomes) console.log(`[adapter-health] ${outcome.adapter}: ${outcome.action} #${outcome.number}`);
  } catch (error) { console.warn(`[adapter-health] ${error.message}`); }
}

main()
  .catch(err => { console.error('[fatal]', err.message); process.exit(1); })
  .finally(() => { https.globalAgent.destroy(); closeStore(); });
