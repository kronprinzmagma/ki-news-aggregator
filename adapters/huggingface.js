import { httpGet, parseRss, enrichFromUrl } from './_base.js';

const FEED_URL = 'https://huggingface.co/blog/feed.xml';

// Feed liefert oft nur Teaser → per truncated-Pre-Filter werden diese
// auf Score 2 gesetzt und kommen nie ins Issue. Mit Enrichment-Fetch
// holen wir den Volltext direkt von der Blog-Seite.
export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  const articles = parseRss(xml, 'huggingface');
  return Promise.all(articles.map(a => enrichFromUrl(a, { logTag: 'huggingface' })));
}
