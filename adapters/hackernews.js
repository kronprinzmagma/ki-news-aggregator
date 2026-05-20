import { httpGet, parseRss, enrichFromUrl } from './_base.js';

const FEED_URL = 'https://hnrss.org/frontpage';

function quelleFor({ titel }) {
  // Show-HN-Einträge separat markieren – werden im Scoring deprioritisiert.
  return titel.startsWith('Show HN:') ? 'hackernews-show' : 'hackernews';
}

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  const articles = parseRss(xml, quelleFor);
  return Promise.all(articles.map(a => enrichFromUrl(a, {
    logTag: 'hackernews',
    useMetaDescription: true,
    maxLength: 3000,
    shouldEnrich: art => art.quelle !== 'hackernews-show',
  })));
}
