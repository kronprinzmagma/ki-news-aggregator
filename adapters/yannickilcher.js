import https from 'https';

const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCZHmQk67mSJgfCCTn7xBfew';
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

function parseAtom(xml) {
  const articles = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(entry);
    const linkMatch = /<link rel="alternate" href="([^"]+)"/.exec(entry);
    const publishedMatch = /<published>([\s\S]*?)<\/published>/.exec(entry);
    // YouTube liefert die Beschreibung im media:description-Tag
    const descMatch = /<media:description>([\s\S]*?)<\/media:description>/.exec(entry);

    if (!titleMatch || !linkMatch) continue;

    const titel = decodeHtmlEntities(titleMatch[1].trim());
    const url = linkMatch[1].trim();
    const datum = publishedMatch ? publishedMatch[1].trim() : null;
    const rohtext = descMatch
      ? stripTags(descMatch[1]).slice(0, 2000)
      : '';

    articles.push({ titel, url, datum, quelle: 'yannickilcher', rohtext });
  }

  if (articles.length === 0) throw new Error('Kein gültiger Atom-Feed empfangen');
  return articles;
}

export async function fetchArticles() {
  const xml = await get(FEED_URL);
  return parseAtom(xml);
}
