import { httpGet, parseRss, enrichFromUrl, extractArticleText, extractMetaDescription, isSafeUrl } from './_base.js';

const FEED_URL = 'https://raw.githubusercontent.com/taobojlen/anthropic-rss-feed/main/anthropic_news_rss.xml';

async function enrich(article) {
  // Vorher nur /news/-URLs angereichert – Anthropic publiziert aber auch
  // Standalone-Pages (z.B. /glasswing, /81k-interviews). Diese hatten dünne
  // Feeds und wurden per truncated-Pre-Filter rausgeworfen.
  if ((article.rohtext || '').length >= 1500 || !article.url.includes('anthropic.com/')) {
    return article;
  }
  if (!isSafeUrl(article.url)) return article;
  try {
    const html = await httpGet(article.url, { timeoutMs: 15_000 });
    const meta = extractMetaDescription(html);
    const body = extractArticleText(html, { maxLength: 3000, preferArticle: false });
    const enriched = [meta, body].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (enriched.length > (article.rohtext || '').length) {
      return { ...article, rohtext: enriched.slice(0, 3000) };
    }
  } catch (err) {
    console.warn(`[anthropic] Artikeltext konnte nicht geladen werden (${article.titel}): ${err.message}`);
  }
  return article;
}

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL, { timeoutMs: 15_000 });
  const articles = parseRss(xml, 'anthropic');
  if (articles.length === 0) throw new Error('Kein gültiger RSS-Feed empfangen');
  return Promise.all(articles.map(enrich));
}
