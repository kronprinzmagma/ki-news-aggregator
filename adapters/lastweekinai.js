import { httpGet, parseRss, enrichFromUrl } from './_base.js';

const FEED_URL = 'https://lastweekin.ai/feed';

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  const articles = parseRss(xml, 'lastweekinai');
  return Promise.all(articles.map(a => enrichFromUrl(a, { logTag: 'lastweekinai' })));
}
