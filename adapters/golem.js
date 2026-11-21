import { httpGet, parseRss, enrichFromUrl, decodeHtmlEntities, stripTags } from './_base.js';
import { DACH_AI_PATTERN } from '../lib/config.js';

// Golem.de – allgemeiner RSS-Feed, gefiltert auf KI-Relevanz.
// Ergänzt Heise um Developer-Perspektive aus dem DACH-Raum (Open Source,
// Sicherheit, Entwickler-Tooling). KI-spezifischer Feed existiert nicht,
// deshalb wie bei Heise per Keyword-Filter (zentral in lib/config.js).
const FEED_URL = 'https://rss.golem.de/rss.php?feed=RSS2.0';

// Der Feed-Teaser enthält doppelt kodierte Themen-Links und ein Zählpixel.
// Ungereinigt blähen sie zwei Sätze auf über 300 Zeichen auf; der Teaser
// rutschte so am truncated-Filter vorbei und wurde wie ein Volltext bewertet.
export function cleanTeaser(text = '') {
  return stripTags(decodeHtmlEntities(text)).replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+([,)])/g, '$1').trim();
}

// Artikelseiten leiten ohne Einwilligung auf eine Consent-Seite um – Volltext
// ist für die Pipeline nicht erreichbar. enrichFromUrl erkennt das und behält
// den Teaser; solche Artikel gelten dann korrekt als «truncated».
export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  const all = parseRss(xml, 'golem').map(a => ({ ...a, rohtext: cleanTeaser(a.rohtext) }));
  const aiArticles = all.filter(a => DACH_AI_PATTERN.test(`${a.titel} ${a.rohtext || ''}`));
  return Promise.all(aiArticles.map(a => enrichFromUrl(a, {
    logTag: 'golem',
    useMetaDescription: true,
    maxLength: 8000,
  })));
}
