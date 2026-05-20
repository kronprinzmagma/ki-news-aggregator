import { httpGet, parseRss } from './_base.js';

const FEED_URL = 'https://venturebeat.com/category/ai/feed/';

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  return parseRss(xml, 'venturebeat');
}
