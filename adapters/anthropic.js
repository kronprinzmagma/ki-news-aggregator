import { httpGet, parseRss, enrichFromUrl } from './_base.js';

const FEED_URL = 'https://raw.githubusercontent.com/taobojlen/anthropic-rss-feed/main/anthropic_news_rss.xml';

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL, { timeoutMs: 15_000 });
  const articles = parseRss(xml, 'anthropic');
  if (articles.length === 0) throw new Error('Kein gültiger RSS-Feed empfangen');
  // Alle anthropic.com-URLs anreichern (nicht nur /news/ – Anthropic publiziert
  // auch Standalone-Pages wie /glasswing, die sonst per truncated-Pre-Filter
  // rausfallen). Die Seite hat Teaser-Templates vor dem Beitrag → preferArticle: false.
  return Promise.all(articles.map(a => enrichFromUrl(a, {
    logTag: 'anthropic',
    useMetaDescription: true,
    maxLength: 3000,
    extractOptions: { preferArticle: false },
    fetchOptions: { timeoutMs: 15_000 },
    shouldEnrich: art => art.url.includes('anthropic.com/'),
  })));
}
