import { httpGet, parseRss, stripTags, extractCdata } from './_base.js';

// Offizieller Feed von deeplearning.ai (Ghost). Der frühere Community-Feed
// (GitHub-Scraper) blieb im Oktober 2026 stehen, ohne dass der Abruf fehlschlug.
// Der Feed enthält den Volltext in <content:encoded> – kein Nachladen nötig.
const FEED_URL = 'https://charonhub.deeplearning.ai/rss/';

export function parseBatchFeed(xml) {
  const articles = parseRss(xml, 'thebatch');
  const fullTexts = new Map();
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const link = /<link>([\s\S]*?)<\/link>/.exec(match[1]);
    const content = /<content:encoded>([\s\S]*?)<\/content:encoded>/.exec(match[1]);
    if (link && content) fullTexts.set(extractCdata(link[1]), stripTags(extractCdata(content[1])).replace(/\s+/g, ' ').trim());
  }
  return articles.map(a => {
    const full = fullTexts.get(a.url) || '';
    return full.length > (a.rohtext || '').length ? { ...a, rohtext: full.slice(0, 8000) } : a;
  });
}

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  const articles = parseBatchFeed(xml);
  if (articles.length === 0) throw new Error('Kein gültiger RSS-Feed empfangen');
  return articles;
}
