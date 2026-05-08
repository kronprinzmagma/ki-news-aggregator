import https from 'https';

const FEED_URL = 'https://lastweekin.ai/feed';
const REQUEST_TIMEOUT_MS = 10_000;

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Timeout nach ${REQUEST_TIMEOUT_MS / 1000}s für ${url}`));
    });
  });
}

function extractCdata(str) {
  const cdata = /\<\!\[CDATA\[([\s\S]*?)\]\]\>/.exec(str);
  return cdata ? cdata[1].trim() : str.trim();
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

    const titel = extractCdata(titleMatch[1]);
    const url = extractCdata(linkMatch[1]);
    const datum = pubDateMatch ? new Date(extractCdata(pubDateMatch[1])).toISOString() : null;
    const rohtext = descMatch
      ? stripTags(extractCdata(descMatch[1])).slice(0, 2000)
      : '';

    articles.push({ titel, url, datum, quelle: 'lastweekinai', rohtext });
  }

  return articles;
}

export async function fetchArticles() {
  const xml = await get(FEED_URL);
  return parseRss(xml);
}
