import { httpGet, parseRss } from './_base.js';

// Community-maintained RSS feed via Olshansk/rss-feeds (github.com/Olshansk/rss-feeds).
// deeplearning.ai selbst publiziert keinen Feed; dieses Repo generiert ihn aus der Website.
const FEED_URL = 'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_the_batch.xml';

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  const articles = parseRss(xml, 'thebatch');
  if (articles.length === 0) throw new Error('Kein gültiger RSS-Feed empfangen');
  return articles;
}
