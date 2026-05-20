import { httpGet, isSafeUrl } from '../lib/http.js';
import { decodeHtmlEntities, stripTags, extractCdata } from '../lib/text-utils.js';

export { httpGet, isSafeUrl, decodeHtmlEntities, stripTags, extractCdata };

const DEFAULT_BLOCK_REGEX = /<(h1|h2|h3|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const DEFAULT_BOILERPLATE_REGEX = /(subscribe|newsletter|sign in|privacy|terms|cookie)/i;

/**
 * Extrahiert lesbaren Text aus einer HTML-Seite.
 * Bevorzugt <article>, dann <main>, sonst das ganze Dokument.
 * Entfernt Scripts, Styles, Navigation und Footer.
 */
export function extractArticleText(html, {
  blockRegex = DEFAULT_BLOCK_REGEX,
  boilerplateRegex = DEFAULT_BOILERPLATE_REGEX,
  minBlockLength = 45,
  maxLength = 4000,
  preferArticle = true,
} = {}) {
  let scope = html;
  if (preferArticle) {
    const articleMatch = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html);
    const mainMatch = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html);
    scope = articleMatch ? articleMatch[1] : (mainMatch ? mainMatch[1] : html);
  }
  const content = scope
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');

  const chunks = [];
  const re = new RegExp(blockRegex.source, blockRegex.flags);
  let match;
  while ((match = re.exec(content)) !== null) {
    const text = stripTags(match[2]);
    if (text.length >= minBlockLength && !boilerplateRegex.test(text)) {
      chunks.push(text);
    }
  }
  return chunks.join(' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function extractMetaDescription(html) {
  const match = /<meta\s+(?:name|property)=["'](?:description|og:description)["']\s+content=["']([^"']+)["'][^>]*>/i.exec(html)
    || /<meta\s+content=["']([^"']+)["']\s+(?:name|property)=["'](?:description|og:description)["'][^>]*>/i.exec(html);
  return match ? decodeHtmlEntities(match[1]).trim() : '';
}

function parseDate(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  try {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? trimmed : d.toISOString();
  } catch { return trimmed; }
}

/** RSS-Feed parsen, einheitliches Article-Schema zurückgeben. */
export function parseRss(xml, quelle, { decodeTitle = true } = {}) {
  const articles = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(item);
    const linkMatch = /<link>([\s\S]*?)<\/link>/.exec(item);
    const pubDateMatch = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(item);
    const descMatch = /<description>([\s\S]*?)<\/description>/.exec(item);
    if (!titleMatch || !linkMatch) continue;

    const rawTitle = extractCdata(titleMatch[1]);
    const titel = decodeTitle ? decodeHtmlEntities(rawTitle) : rawTitle;
    const url = extractCdata(linkMatch[1]);
    const datum = pubDateMatch ? parseDate(extractCdata(pubDateMatch[1])) : null;
    const rohtext = descMatch ? stripTags(extractCdata(descMatch[1])).slice(0, 2000) : '';

    const article = { titel, url, datum, quelle: typeof quelle === 'function' ? quelle({ titel, url }) : quelle, rohtext };
    articles.push(article);
  }
  return articles;
}

/** Atom-Feed parsen, einheitliches Article-Schema zurückgeben. */
export function parseAtom(xml, quelle) {
  const articles = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry);
    const linkMatch = /<link[^>]*href="([^"]+)"(?:[^>]*rel="alternate")?/i.exec(entry)
      || /<link href="([^"]+)" rel="alternate"/i.exec(entry);
    const publishedMatch = /<published>([\s\S]*?)<\/published>/.exec(entry)
      || /<updated>([\s\S]*?)<\/updated>/.exec(entry);
    const summaryMatch = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(entry)
      || /<content[^>]*>([\s\S]*?)<\/content>/.exec(entry);

    if (!titleMatch || !linkMatch) continue;

    const titel = decodeHtmlEntities(extractCdata(titleMatch[1]));
    const url = linkMatch[1].trim();
    const datum = publishedMatch ? parseDate(publishedMatch[1]) : null;
    const rohtext = summaryMatch ? stripTags(decodeHtmlEntities(extractCdata(summaryMatch[1]))).slice(0, 2000) : '';

    articles.push({ titel, url, datum, quelle: typeof quelle === 'function' ? quelle({ titel, url }) : quelle, rohtext });
  }
  return articles;
}

/**
 * Enrichment-Helper: Wenn der Artikeltext kürzer als minLength ist,
 * lade die Artikelseite nach und extrahiere zusätzlichen Text.
 */
export async function enrichFromUrl(article, {
  minLength = 1500,
  maxLength = 3000,
  logTag = 'enrich',
  fetchOptions = {},
  useMetaDescription = false,
  shouldEnrich,
} = {}) {
  if ((article.rohtext || '').length >= minLength) return article;
  if (!isSafeUrl(article.url)) return article;
  if (shouldEnrich && !shouldEnrich(article)) return article;

  try {
    const html = await httpGet(article.url, fetchOptions);
    const meta = useMetaDescription ? extractMetaDescription(html) : '';
    const body = extractArticleText(html, { maxLength });
    const enriched = [meta, body].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (enriched.length > (article.rohtext || '').length) {
      return { ...article, rohtext: enriched.slice(0, maxLength) };
    }
  } catch (err) {
    console.warn(`[${logTag}] Artikeltext konnte nicht geladen werden (${article.titel}): ${err.message}`);
  }
  return article;
}
