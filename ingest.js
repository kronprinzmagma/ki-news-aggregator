import fs from 'fs/promises';
import { fetchArticles as fetchWillison } from './adapters/willison.js';
import { fetchArticles as fetchLatentSpace } from './adapters/latentspace.js';
import { fetchArticles as fetchAnthropic } from './adapters/anthropic.js';
import { fetchArticles as fetchHackerNews } from './adapters/hackernews.js';
import { fetchArticles as fetchLastWeekInAI } from './adapters/lastweekinai.js';

const ADAPTERS = [
  { name: 'simonwillison', fn: fetchWillison },
  { name: 'latentspace', fn: fetchLatentSpace },
  { name: 'anthropic', fn: fetchAnthropic },
  { name: 'hackernews', fn: fetchHackerNews },
  { name: 'lastweekinai', fn: fetchLastWeekInAI },
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

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const raw = await runAdapters();
  const articles = deduplicate(raw);

  console.log(`${articles.length} Artikel nach Deduplizierung (${raw.length - articles.length} Duplikate entfernt)`);

  const filename = `articles-${todayString()}.json`;
  await fs.writeFile(filename, JSON.stringify(articles, null, 2), 'utf-8');
  console.log(`Gespeichert: ${filename}`);
}

main();
