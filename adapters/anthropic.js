import https from 'https';

const FEED_URL = 'https://raw.githubusercontent.com/taobojlen/anthropic-rss-feed/main/anthropic_news_rss.xml';
const REQUEST_TIMEOUT_MS = 15_000;
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
    const req = https.get(url, {
      headers: {
        'User-Agent': 'ki-news-aggregator/1.0',
        'Accept': 'text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
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

function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripTags(html) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extractMetaDescription(html) {
  const match = /<meta\s+(?:name|property)=["'](?:description|og:description)["']\s+content=["']([^"']+)["'][^>]*>/i.exec(html)
    || /<meta\s+content=["']([^"']+)["']\s+(?:name|property)=["'](?:description|og:description)["'][^>]*>/i.exec(html);
  return match ? decodeHtmlEntities(match[1]).trim() : '';
}

function extractArticleText(html) {
  const mainMatch = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  const content = (mainMatch ? mainMatch[1] : html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ');

  const chunks = [];
  const blockRegex = /<(h2|h3|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    const text = stripTags(match[2]);
    if (text.length >= 35 && !/^(Research|Company|Products|Models|Solutions)$/i.test(text)) {
      chunks.push(text);
    }
  }

  return chunks.join(' ').replace(/\s+/g, ' ').trim().slice(0, 3000);
}

async function enrichArticleText(article) {
  if ((article.rohtext || '').length >= 1500 || !isSafeUrl(article.url) || !article.url.includes('anthropic.com/news/')) {
    return article;
  }

  try {
    const html = await get(article.url);
    const meta = extractMetaDescription(html);
    const body = extractArticleText(html);
    const enriched = [meta, body].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (enriched.length > (article.rohtext || '').length) {
      return { ...article, rohtext: enriched.slice(0, 3000) };
    }
  } catch (err) {
    console.warn(`[anthropic] Artikeltext konnte nicht geladen werden (${article.titel}): ${err.message}`);
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

    const titel = extractCdata(titleMatch[1]);
    const url = extractCdata(linkMatch[1]);
    const datum = pubDateMatch ? new Date(extractCdata(pubDateMatch[1])).toISOString() : null;
    const rohtext = descMatch
      ? stripTags(extractCdata(descMatch[1])).slice(0, 2000)
      : '';

    articles.push({ titel, url, datum, quelle: 'anthropic', rohtext });
  }

  if (articles.length === 0) throw new Error('Kein gültiger RSS-Feed empfangen');
  return articles;
}

export async function fetchArticles() {
  const xml = await get(FEED_URL);
  const articles = parseRss(xml);
  return Promise.all(articles.map(enrichArticleText));
}
