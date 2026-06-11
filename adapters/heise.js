import { httpGet, parseAtom, enrichFromUrl } from './_base.js';
import { DACH_AI_PATTERN } from '../lib/config.js';

// Heise Online – allgemeiner Atom-Feed, gefiltert auf KI-Relevanz (DACH-Perspektive).
const FEED_URL = 'https://www.heise.de/rss/heise-atom.xml';

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  const all = parseAtom(xml, 'heise');
  const aiArticles = all.filter(a => DACH_AI_PATTERN.test(`${a.titel} ${a.rohtext || ''}`));
  return Promise.all(aiArticles.map(a => enrichFromUrl(a, {
    logTag: 'heise',
    useMetaDescription: true,
    maxLength: 3000,
    // Die Seite enthaelt Teaser-<article>-Templates vor dem echten Beitrag.
    extractOptions: { preferArticle: false },
  })));
}
