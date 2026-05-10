import https from 'https';

const FEED_URL = 'https://magazine.sebastianraschka.com/feed';
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

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (!isSafeUrl(url)) {
      reject(new Error(`Unsichere URL blockiert: ${url}`));
      return;
    }
    const req = https.get(url, {
      headers: { 'User-Agent': 'ki-news-aggregator/1.0' },
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
        resolve(get(nextUrl, redirects + 1));
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

function extractCdata(str) {
  const cdata = /\<\!\[CDATA\[([\s\S]*?)\]\]\>/.exec(str);
  return cdata ? cdata[1].trim() : str.trim();
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractArticleText(html) {
  const articleMatch = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  const mainMatch = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  const content = (articleMatch ? articleMatch[1] : (mainMatch ? mainMatch[1] : html))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  const chunks = [];
  const blockRegex = /<(h1|h2|h3|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    const text = stripTags(match[2]);
    if (text.length >= 45 && !/(subscribe|newsletter|sign in|privacy|terms)/i.test(text)) {
      chunks.push(text);
    }
  }
  return chunks.join(' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
}

async function enrichArticleText(article) {
  if ((article.rohtext || '').length >= 1500 || !isSafeUrl(article.url)) {
    return article;
  }
  try {
    const html = await get(article.url);
    const enriched = extractArticleText(html);
    if (enriched.length > (article.rohtext || '').length) {
      return { ...article, rohtext: enriched };
    }
  } catch (err) {
    console.warn(`[aheadofai] Artikeltext konnte nicht geladen werden (${article.titel}): ${err.message}`);
  }
  return article;
}

function parseRss(xml) {
  const articles = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];

    const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(item);
    const linkMatch = /<link>([\s\S]*?)<\/link>/.exec(item);
    const pubDateMatch = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(item);
    const descMatch = /<description>([\s\S]*?)<\/description>/.exec(item);

    if (!titleMatch || !linkMatch) continue;

    const titel = decodeHtmlEntities(extractCdata(titleMatch[1]));
    const url = extractCdata(linkMatch[1]);
    const datum = pubDateMatch ? new Date(extractCdata(pubDateMatch[1])).toISOString() : null;
    const rohtext = descMatch
      ? stripTags(extractCdata(descMatch[1])).slice(0, 2000)
      : '';

    articles.push({ titel, url, datum, quelle: 'aheadofai', rohtext });
  }

  if (articles.length === 0) throw new Error('Kein gültiger RSS-Feed empfangen');
  return articles;
}

export async function fetchArticles() {
  const xml = await get(FEED_URL);
  const articles = parseRss(xml);
  return Promise.all(articles.map(enrichArticleText));
}
