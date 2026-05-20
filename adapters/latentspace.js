import { httpGet, parseRss, enrichFromUrl } from './_base.js';

const FEED_URL = 'https://www.latent.space/feed';

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  const articles = parseRss(xml, 'latentspace');
  return Promise.all(articles.map(a => enrichFromUrl(a, { logTag: 'latentspace' })));
}
