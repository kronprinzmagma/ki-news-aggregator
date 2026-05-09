import https from 'https';

// Community-maintained RSS feed via Olshansk/rss-feeds (github.com/Olshansk/rss-feeds).
// deeplearning.ai selbst publiziert keinen Feed; dieses Repo generiert ihn aus der Website.
// TODO: Falls dieses Community-Repo eingestellt wird oder den Feed-Pfad ändert, fällt der
// Adapter still aus. Alternativquelle prüfen oder URL-Verfügbarkeit im Watchdog überwachen.
const FEED_URL = 'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_the_batch.xml';

const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'ki-news-aggregator/1.0' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects >= MAX_REDIRECTS) {
          reject(new Error(`Zu viele Redirects für ${url}`));
          return;
        }
        const nextUrl = new URL(res.headers.location, url).toString();
        resolve(get(nextUrl, redirects + 1));
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} für ${url}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
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

    articles.push({ titel, url, datum, quelle: 'thebatch', rohtext });
  }

  if (articles.length === 0) throw new Error('Kein gültiger RSS-Feed empfangen');
  return articles;
}

export async function fetchArticles() {
  const xml = await get(FEED_URL);
  return parseRss(xml);
}
