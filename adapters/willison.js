import https from 'https';

const FEED_URL = 'https://simonwillison.net/atom/everything/';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
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

    const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(entry);
    const linkMatch = /<link href="([^"]+)" rel="alternate"/.exec(entry);
    const publishedMatch = /<published>([\s\S]*?)<\/published>/.exec(entry);
    const summaryMatch = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(entry);

    if (!titleMatch || !linkMatch) continue;

    const titel = decodeHtmlEntities(titleMatch[1].trim());
    const url = linkMatch[1].trim();
    const datum = publishedMatch ? publishedMatch[1].trim() : null;
    const rohtext = summaryMatch
      ? stripTags(decodeHtmlEntities(summaryMatch[1])).slice(0, 2000)
      : '';

    articles.push({ titel, url, datum, quelle: 'simonwillison', rohtext });
  }

  return articles;
}

export async function fetchArticles() {
  const xml = await get(FEED_URL);
  return parseAtom(xml);
}
