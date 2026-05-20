import { httpGet, parseAtom, extractArticleText, isSafeUrl } from './_base.js';

const FEED_URL = 'https://simonwillison.net/atom/everything/';

function extractExternalLink(html) {
  // Simon Willison verlinkt oft auf externe Artikel – diesen Link extrahieren.
  const match = /<p[^>]*>.*?<a href="(https?:\/\/(?!simonwillison\.net)[^"]+)"[^>]*>/i.exec(html);
  return match ? match[1] : null;
}

async function enrich(article) {
  if (!isSafeUrl(article.url)) return article;
  try {
    const html = await httpGet(article.url);
    const fromPage = extractArticleText(html);

    // Wenn der Artikel-Text dünn ist: externen Link nachladen.
    if (fromPage.length < 2500) {
      const externalUrl = extractExternalLink(html);
      if (externalUrl && isSafeUrl(externalUrl)) {
        try {
          const externalHtml = await httpGet(externalUrl);
          const externalText = extractArticleText(externalHtml);
          const combined = [fromPage, externalText].filter(Boolean).join(' ').trim();
          if (combined.length > (article.rohtext || '').length) {
            return { ...article, rohtext: combined.slice(0, 4000) };
          }
        } catch (err) {
          console.warn(`[simonwillison] Externer Link nicht ladbar (${externalUrl}): ${err.message}`);
        }
      }
    }

    if (fromPage.length > (article.rohtext || '').length) {
      return { ...article, rohtext: fromPage.slice(0, 4000) };
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
