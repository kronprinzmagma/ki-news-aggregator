import https from 'https';

// DEAKTIVIERT: deeplearning.ai betreibt The Batch als reinen E-Mail-Newsletter
// auf einer Next.js-SPA. Alle getesteten Feed-URLs (/feed/, /rss.xml, /the-batch/feed/)
// geben 404 zurück. Kein öffentlicher RSS-Feed vorhanden (verifiziert 2026-05-06).
// Adapter wird in ingest.js nicht eingebunden bis eine alternative Quelle gefunden ist.
const FEED_URL = 'https://www.deeplearning.ai/the-batch/feed/';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // Redirects folgen
      if (res.statusCode === 301 || res.statusCode === 302) {
        https.get(res.headers.location, (res2) => {
          let data = '';
          res2.on('data', chunk => data += chunk);
          res2.on('end', () => resolve(data));
        }).on('error', reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
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

    articles.push({ titel, url, datum, quelle: 'thebatch', rohtext });
  }

  if (articles.length === 0) throw new Error('Kein gültiger RSS-Feed empfangen');
  return articles;
}

export async function fetchArticles() {
  const xml = await get(FEED_URL);
  return parseRss(xml);
}
