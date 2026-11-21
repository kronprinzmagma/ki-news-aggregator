import { httpGet, parseAtom, enrichFromUrl } from './_base.js';

// The Verge, KI-Ressort. Ersetzt VentureBeat, dessen Feed automatisierte
// Abrufe dauerhaft mit HTTP 429 ablehnte (kein Artikel in 14 von 14 Läufen).
// Der Feed liefert nur Anrisse → Volltext von der Artikelseite.
const FEED_URL = 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml';

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  const articles = parseAtom(xml, 'theverge');
  if (articles.length === 0) throw new Error('Kein gültiger Atom-Feed empfangen');
  return Promise.all(articles.map(a => enrichFromUrl(a, { logTag: 'theverge', useMetaDescription: true })));
}
