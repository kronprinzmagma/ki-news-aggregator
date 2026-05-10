import https from 'https';

const BASE_URL = 'https://newsapi.org/v2/everything';
const QUERY = 'artificial intelligence OR LLM OR "large language model" OR "generative AI"';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB

function isSafeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname;
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host)) return false;
    return true;
  } catch { return false; }
}

function get(url, extraHeaders = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (!isSafeUrl(url)) {
      reject(new Error(`Unsichere URL blockiert: ${url}`));
      return;
    }
    const req = https.get(url, {
      headers: {
        'User-Agent': 'ki-news-aggregator/1.0',
        ...extraHeaders,
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects >= MAX_REDIRECTS) {
          reject(new Error(`Zu viele Redirects für ${url}`));
          return;
        }
        const nextUrl = new URL(res.headers.location, url).toString();
        if (!isSafeUrl(nextUrl)) {
          reject(new Error(`Redirect auf unsichere URL blockiert: ${nextUrl}`));
          return;
        }
        resolve(get(nextUrl, extraHeaders, redirects + 1));
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} für ${url}`));
        return;
      }
      let data = '';
      let totalBytes = 0;
      res.on('data', chunk => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          req.destroy(new Error(`Response zu gross (> 5 MB) für ${url}`));
          return;
        }
        data += chunk;
      });
      res.on('end', () => resolve(data));
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Timeout nach ${REQUEST_TIMEOUT_MS / 1000}s für ${url}`));
    });
    req.on('error', reject);
  });
}

export async function fetchArticles() {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) throw new Error('NEWSAPI_KEY nicht gesetzt');

  const params = new URLSearchParams({
    q: QUERY,
    language: 'en',
    sortBy: 'publishedAt',
    pageSize: '20',
  });

  const raw = await get(`${BASE_URL}?${params}`, { 'X-Api-Key': apiKey });
  const json = JSON.parse(raw);

  if (json.status !== 'ok') {
    throw new Error(`NewsAPI Fehler: ${json.message || json.status}`);
  }

  return json.articles.map(a => ({
    titel: a.title || '',
    url: a.url,
    datum: a.publishedAt,
    quelle: 'newsapi',
    rohtext: [a.description, a.content].filter(Boolean).join(' ').slice(0, 2000),
  }));
}
