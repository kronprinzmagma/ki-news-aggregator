import { httpGet, parseRss, enrichFromUrl } from './_base.js';
import { DACH_AI_PATTERN } from '../lib/config.js';

// Golem.de – allgemeiner RSS-Feed, gefiltert auf KI-Relevanz.
// Ergänzt Heise um Developer-Perspektive aus dem DACH-Raum (Open Source,
// Sicherheit, Entwickler-Tooling). KI-spezifischer Feed existiert nicht,
// deshalb wie bei Heise per Keyword-Filter (zentral in lib/config.js).
const FEED_URL = 'https://rss.golem.de/rss.php?feed=RSS2.0';

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  const all = parseRss(xml, 'golem');
  const aiArticles = all.filter(a => DACH_AI_PATTERN.test(`${a.titel} ${a.rohtext || ''}`));
  return Promise.all(aiArticles.map(a => enrichFromUrl(a, {
    logTag: 'golem',
    useMetaDescription: true,
    maxLength: 3000,
  })));
}
