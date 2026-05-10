import fs from 'fs/promises';
import https from 'https'; // nur für globalAgent.destroy() am Ende
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

// Nur Artikel der letzten N Tage behalten – verhindert, dass täglich dieselben RSS-Einträge erscheinen
const MAX_ARTICLE_AGE_DAYS = 3;
const ADAPTER_TIMEOUT_MS = 30_000;

function withTimeout(promise, ms, name) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timeout nach ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout])
    .finally(() => clearTimeout(timeoutId));
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
];

async function runAdapters() {
  const results = await Promise.allSettled(
    ADAPTERS.map(a => withTimeout(a.fn(), ADAPTER_TIMEOUT_MS, a.name))
  );
  const articles = [];

  for (let i = 0; i < ADAPTERS.length; i++) {
    const { name } = ADAPTERS[i];
    const result = results[i];
    if (result.status === 'fulfilled') {
      console.log(`[${name}] ${result.value.length} Artikel geladen`);
      articles.push(...result.value);
    } else {
      console.error(`[${name}] Fehler: ${result.reason.message}`);
    }
  }

  return articles;
}

function deduplicate(articles) {
  const seen = new Set();
  return articles.filter(a => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });
}

function filterByAge(articles) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_ARTICLE_AGE_DAYS);

  const filtered = articles.filter(a => {
    if (!a.datum) return true; // kein Datum → behalten
    const date = new Date(a.datum);
    return isNaN(date.getTime()) || date >= cutoff;
  });

  const dropped = articles.length - filtered.length;
  if (dropped > 0) console.log(`${dropped} Artikel als zu alt gefiltert (> ${MAX_ARTICLE_AGE_DAYS} Tage)`);
  return filtered;
}

function todayString() {
  const raw = process.env.RUN_DATE || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    console.error(`Ungültiges RUN_DATE-Format: "${raw}". Erwartet: YYYY-MM-DD`);
    process.exit(1);
  }
  return raw;
}

// Artikel mit raw_text < 300 Zeichen werden als truncated geflakt und gewarnt
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

// Artikel auf Pricing-Signale prüfen und pricing_signal_found-Flag setzen
function flagPricingSignals(articles) {
  const PRICING_PATTERN = /\$[\d.,]+|\bpricing\b|\bprice\b|\bkosten\b|\bpreis\b|\bper token\b|\bper request\b|\brate limit\b|\bfree tier\b|\bpaid plan\b|\bcost\b|\bgebühr\b|\btier\b/i;
  return articles.map(a => {
    const text = `${a.titel} ${a.rohtext || ''}`;
    return { ...a, pricing_signal_found: PRICING_PATTERN.test(text) };
  });
}

async function main() {
  const raw = await runAdapters();
  const deduped = deduplicate(raw);
  const aged = filterByAge(deduped);
  const truncated = flagTruncated(aged);
  const articles = flagPricingSignals(truncated);

  console.log(`${articles.length} Artikel nach Deduplizierung (${raw.length - deduped.length} Duplikate entfernt)`);

  const filename = `articles-${todayString()}.json`;
  await fs.writeFile(filename, JSON.stringify(articles, null, 2), 'utf-8');
  console.log(`Gespeichert: ${filename}`);
}

main()
  .catch(err => { console.error('[fatal]', err.message); process.exit(1); })
  .finally(() => https.globalAgent.destroy());
