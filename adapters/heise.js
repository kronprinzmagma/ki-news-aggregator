import https from 'https';

// Heise Online – allgemeiner Atom-Feed, gefiltert auf KI-Relevanz
const FEED_URL = 'https://www.heise.de/rss/heise-atom.xml';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'ki-news-aggregator/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects >= MAX_REDIRECTS) { reject(new Error(`Zu viele Redirects für ${url}`)); return; }
        const next = new URL(res.headers.location, url).href;
        resolve(get(next, redirects + 1));
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
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error(`Timeout nach ${REQUEST_TIMEOUT_MS / 1000}s`)));
    req.on('error', reject);
  });
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function extractCdata(str) {
  const m = /\<\!\[CDATA\[([\s\S]*?)\]\]\>/.exec(str);
  return m ? m[1].trim() : str.trim();
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const AI_PATTERN = /\b(ki\b|k\.i\.|künstlich|artificial intelligence|machine learning|llm|sprachmodell|chatgpt|gpt|claude|gemini|mistral|openai|anthropic|deepmind|copilot|assistent|chatbot|deep learning|neural|neuronale|automation|automat|roboter|robotik|inferenz|generativ|transformer)\b/i;

function parseAtom(xml) {
  const articles = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry);
    const linkMatch = /<link href="([^"]+)"/.exec(entry);
    const publishedMatch = /<published>([\s\S]*?)<\/published>/.exec(entry);
    const summaryMatch = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(entry);
    const contentMatch = /<content[^>]*>([\s\S]*?)<\/content>/.exec(entry);

    if (!titleMatch || !linkMatch) continue;

    const titel = decodeHtmlEntities(extractCdata(titleMatch[1]));
    const url = linkMatch[1];
    const datum = publishedMatch ? publishedMatch[1].trim() : null;
    const rawDesc = contentMatch || summaryMatch;
    const rohtext = rawDesc
      ? stripTags(decodeHtmlEntities(extractCdata(rawDesc[1]))).slice(0, 2000)
      : '';

    // Nur Artikel mit KI-Bezug aufnehmen
    if (!AI_PATTERN.test(`${titel} ${rohtext}`)) continue;

    articles.push({ titel, url, datum, quelle: 'heise', rohtext });
  }

  return articles;
}

export async function fetchArticles() {
  const xml = await get(FEED_URL);
  return parseAtom(xml);
}
