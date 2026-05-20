import { httpGet, parseRss } from './_base.js';

const FEED_URL = 'https://www.ben-evans.com/benedictevans?format=rss';

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  return parseRss(xml, 'benevans');
}
