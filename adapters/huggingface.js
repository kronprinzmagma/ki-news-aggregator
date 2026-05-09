import https from 'https';

const FEED_URL = 'https://huggingface.co/blog/feed.xml';

const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'ki-news-aggregator/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
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

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
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

    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry);
    const linkMatch = /<link[^>]+href="([^"]+)"/.exec(entry);
    const updatedMatch = /<updated>([\s\S]*?)<\/updated>/.exec(entry);
    const summaryMatch = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(entry);
    const contentMatch = /<content[^>]*>([\s\S]*?)<\/content>/.exec(entry);

    if (!titleMatch || !linkMatch) continue;

    const titel = decodeHtmlEntities(stripTags(titleMatch[1].trim()));
    const url = linkMatch[1].trim();
    const datum = updatedMatch ? updatedMatch[1].trim() : null;
    const rawText = summaryMatch || contentMatch;
    const rohtext = rawText
      ? stripTags(decodeHtmlEntities(rawText[1])).slice(0, 2000)
      : '';

    articles.push({ titel, url, datum, quelle: 'huggingface', rohtext });
  }

  return articles;
}

export async function fetchArticles() {
  const xml = await get(FEED_URL);
  return parseAtom(xml);
}
