import https from 'https';

const FEED_URL = 'https://huggingface.co/blog/feed.xml';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ki-news-aggregator/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
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
