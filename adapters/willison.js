import { httpGet, parseAtom, extractBodyText, isSafeUrl, isRecent, withHostLimit } from './_base.js';

const FEED_URL = 'https://simonwillison.net/atom/everything/';

function extractExternalLink(html) {
  // Simon Willison verlinkt oft auf externe Artikel – diesen Link extrahieren.
  const match = /<p[^>]*>.*?<a href="(https?:\/\/(?!simonwillison\.net)[^"]+)"[^>]*>/i.exec(html);
  return match ? match[1] : null;
}

async function enrich(article) {
  if (!isSafeUrl(article.url)) return article;
  // Ältere Feed-Einträge fallen im Altersfilter weg – kein Abruf nötig.
  if (!isRecent(article.datum)) return article;
  try {
    const html = await withHostLimit(article.url, () => httpGet(article.url));
    const fromPage = await extractBodyText(html, article.url);

    // Wenn der Artikel-Text dünn ist: externen Link nachladen.
    if (fromPage.length < 2500) {
      const externalUrl = extractExternalLink(html);
      if (externalUrl && isSafeUrl(externalUrl)) {
        try {
          const externalHtml = await withHostLimit(externalUrl, () => httpGet(externalUrl));
          const externalText = await extractBodyText(externalHtml, externalUrl);
          const combined = [fromPage, externalText].filter(Boolean).join(' ').trim();
          if (combined.length > (article.rohtext || '').length) {
            return { ...article, rohtext: combined.slice(0, 8000) };
          }
        } catch (err) {
          console.warn(`[simonwillison] Externer Link nicht ladbar (${externalUrl}): ${err.message}`);
        }
      }
    }

    if (fromPage.length > (article.rohtext || '').length) {
      return { ...article, rohtext: fromPage.slice(0, 8000) };
    }
  } catch (err) {
    console.warn(`[simonwillison] Artikeltext konnte nicht geladen werden (${article.titel}): ${err.message}`);
  }
  return article;
}

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  const articles = parseAtom(xml, 'simonwillison');
  return Promise.all(articles.map(enrich));
}
