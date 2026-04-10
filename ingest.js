import fs from 'fs/promises';
import { readFileSync } from 'fs';
import { fetchArticles as fetchWillison } from './adapters/willison.js';
import { fetchArticles as fetchNewsApi } from './adapters/newsapi.js';
import { fetchArticles as fetchLatentSpace } from './adapters/latentspace.js';

// .env laden
try {
  const lines = readFileSync('.env', 'utf-8').split('\n');
  for (const line of lines) {
    const match = /^([^#=]+)=(.*)$/.exec(line.trim());
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
} catch { /* .env optional */ }

const ADAPTERS = [
  { name: 'simonwillison', fn: fetchWillison },
  { name: 'newsapi', fn: fetchNewsApi },
  { name: 'latentspace', fn: fetchLatentSpace },
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
