import fs from 'fs/promises';
import { fetchArticles as fetchWillison } from './adapters/willison.js';
import { fetchArticles as fetchLatentSpace } from './adapters/latentspace.js';
import { fetchArticles as fetchAnthropic } from './adapters/anthropic.js';
import { fetchArticles as fetchHackerNews } from './adapters/hackernews.js';
import { fetchArticles as fetchLastWeekInAI } from './adapters/lastweekinai.js';
import { fetchArticles as fetchVentureBeat } from './adapters/venturebeat.js';
import { fetchArticles as fetchHuggingFace } from './adapters/huggingface.js';

// Nur Artikel der letzten N Tage behalten – verhindert, dass täglich dieselben RSS-Einträge erscheinen
const MAX_ARTICLE_AGE_DAYS = 3;

const ADAPTERS = [
  { name: 'simonwillison', fn: fetchWillison },
  { name: 'latentspace', fn: fetchLatentSpace },
  { name: 'anthropic', fn: fetchAnthropic },
  { name: 'hackernews', fn: fetchHackerNews },
  { name: 'lastweekinai', fn: fetchLastWeekInAI },
  { name: 'venturebeat', fn: fetchVentureBeat },
  { name: 'huggingface', fn: fetchHuggingFace },
];

async function runAdapters() {
  const results = await Promise.allSettled(ADAPTERS.map(a => a.fn()));
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
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const raw = await runAdapters();
  const deduped = deduplicate(raw);
  const articles = filterByAge(deduped);

  console.log(`${articles.length} Artikel nach Deduplizierung (${raw.length - deduped.length} Duplikate entfernt)`);

  const filename = `articles-${todayString()}.json`;
  await fs.writeFile(filename, JSON.stringify(articles, null, 2), 'utf-8');
  console.log(`Gespeichert: ${filename}`);
}

main();
