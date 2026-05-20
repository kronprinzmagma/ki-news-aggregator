import { httpGet, parseRss } from './_base.js';

const FEED_URL = 'https://huggingface.co/blog/feed.xml';

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  return parseRss(xml, 'huggingface');
}
