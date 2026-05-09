import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 8787);
const UI_DIR = path.join(ROOT, 'evals', 'review-ui');
const GOLD_FILE = path.join(ROOT, 'evals', 'goldstandard.json');

function articleId(article) {
  const key = `${article.url || ''}|${article.titel || ''}|${article.datum || ''}`;
  return createHash('sha1').update(key).digest('hex').slice(0, 12);
}

function goldKey(article) {
  return article.url || `${article.titel || ''}|${article.datum || ''}`;
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8'));
  } catch (err) {
    if (fallback !== null && err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(file, data) {
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

async function listArticleFiles() {
  const files = await fs.readdir(ROOT);
  return files
    .filter(file => /^articles-\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort()
    .reverse();
}

async function loadArticles() {
  const files = await listArticleFiles();
  const articles = [];

  for (const file of files) {
    const data = await readJson(path.join(ROOT, file), []);
    for (const article of data) {
      const normalized = {
        id: articleId(article),
        source_file: file,
        titel: article.titel || '',
        url: article.url || '',
        datum: article.datum || '',
        quelle: article.quelle || '',
        rohtext: article.rohtext || '',
      };
      articles.push(normalized);
    }
  }

  return articles;
}

async function loadGold() {
  const gold = await readJson(GOLD_FILE, []);
  return Array.isArray(gold) ? gold : [];
}

async function dataResponse() {
  const [files, articles, gold] = await Promise.all([
    listArticleFiles(),
    loadArticles(),
    loadGold(),
  ]);

  const goldByKey = new Map(gold.map(item => [goldKey(item), item]));
  const rated = {};
  for (const article of articles) {
    const existing = goldByKey.get(goldKey(article));
    if (existing) {
      rated[article.id] = {
        human_score: existing.human_score,
        original_score: existing.original_score ?? null,
        input_quality: existing.input_quality || 'unknown',
      };
    }
  }

  return {
    files,
    articles,
    rated,
    stats: {
      article_count: articles.length,
      gold_count: gold.length,
      rated_from_articles: Object.keys(rated).length,
    },
  };
}

async function saveRating(payload) {
  const score = Number(payload.human_score);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return { status: 400, body: { error: 'human_score muss eine Zahl von 1 bis 5 sein.' } };
  }

  const originalScore = payload.original_score === null || payload.original_score === undefined || payload.original_score === ''
    ? null
    : Number(payload.original_score);
  if (originalScore !== null && (!Number.isInteger(originalScore) || originalScore < 1 || originalScore > 5)) {
    return { status: 400, body: { error: 'original_score muss leer oder eine Zahl von 1 bis 5 sein.' } };
  }

  const inputQuality = payload.input_quality || 'unknown';
  if (!['good', 'thin', 'broken', 'unknown'].includes(inputQuality)) {
    return { status: 400, body: { error: 'input_quality ist ungültig.' } };
  }

  const articles = await loadArticles();
  const article = articles.find(item => item.id === payload.id);
  if (!article) {
    return { status: 404, body: { error: 'Artikel nicht gefunden.' } };
  }

  const gold = await loadGold();
  const key = goldKey(article);
  const entry = {
    titel: article.titel,
    url: article.url,
    datum: article.datum,
    quelle: article.quelle,
    rohtext: article.rohtext,
    human_score: score,
    original_score: originalScore,
    input_quality: inputQuality,
  };

  const index = gold.findIndex(item => goldKey(item) === key);
  if (index >= 0) gold[index] = entry;
  else gold.push(entry);

  await writeJson(GOLD_FILE, gold);
  return { status: 200, body: { ok: true, gold_count: gold.length, rating: entry } };
}

async function removeRating(payload) {
  const articles = await loadArticles();
  const article = articles.find(item => item.id === payload.id);
  if (!article) {
    return { status: 404, body: { error: 'Artikel nicht gefunden.' } };
  }

  const gold = await loadGold();
  const key = goldKey(article);
  const next = gold.filter(item => goldKey(item) !== key);
  await writeJson(GOLD_FILE, next);
  return { status: 200, body: { ok: true, gold_count: next.length } };
}

async function requestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf-8');
  return text ? JSON.parse(text) : {};
}

function send(res, status, body, type = 'application/json') {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': `${type}; charset=utf-8`,
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

async function staticFile(res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(UI_DIR, safePath));
  if (!file.startsWith(UI_DIR)) {
    send(res, 403, 'Forbidden', 'text/plain');
    return;
  }

  const ext = path.extname(file);
  const type = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
  }[ext] || 'text/plain';

  try {
    send(res, 200, await fs.readFile(file, 'utf-8'), type);
  } catch (err) {
    if (err.code === 'ENOENT') send(res, 404, 'Not found', 'text/plain');
    else throw err;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/data') {
      send(res, 200, await dataResponse());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/rate') {
      const result = await saveRating(await requestBody(req));
      send(res, result.status, result.body);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/unrate') {
      const result = await removeRating(await requestBody(req));
      send(res, result.status, result.body);
      return;
    }

    if (req.method === 'GET') {
      await staticFile(res, url.pathname);
      return;
    }

    send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Eval Review UI läuft auf http://localhost:${PORT}`);
});
