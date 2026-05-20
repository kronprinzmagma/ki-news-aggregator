import { httpGet, parseRss, enrichFromUrl } from './_base.js';

const FEED_URL = 'https://magazine.sebastianraschka.com/feed';

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  const articles = parseRss(xml, 'aheadofai');
  if (articles.length === 0) throw new Error('Kein gültiger RSS-Feed empfangen');
  return Promise.all(articles.map(a => enrichFromUrl(a, { logTag: 'aheadofai' })));
}
