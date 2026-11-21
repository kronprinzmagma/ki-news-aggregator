import { httpGet as rawHttpGet, isSafeUrl } from '../lib/http.js';
import { decodeHtmlEntities, stripTags, extractCdata } from '../lib/text-utils.js';
import { extractReadableText } from '../lib/readable.js';
import { MAX_ARTICLE_AGE_DAYS, ENRICH_HOST_CONCURRENCY } from '../lib/config.js';
import { todayString } from '../lib/date.js';

export { isSafeUrl, decodeHtmlEntities, stripTags, extractCdata };

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Vorübergehend = Netzwerkfehler, Timeout, 408, 429 oder 5xx. Andere 4xx nicht. */
export function isTransientHttpError(err) {
  const status = /^HTTP (\d{3}) /.exec(err?.message || '')?.[1];
  if (!status) return !/Unsichere URL|Private Ziel-IP|Zu viele Redirects|Response zu gross|Textkodierung/.test(err?.message || '');
  return status === '408' || status === '429' || status.startsWith('5');
}

/**
 * GET für Adapter: wie lib/http, aber mit einem Wiederholungsversuch bei
 * vorübergehenden Fehlern. Ohne ihn kippt ein einzelner Timeout den ganzen
 * Feed (z.B. hnrss) oder den Volltext eines Artikels.
 */
export async function httpGet(url, { retries = 1, retryDelayMs = 1500, fetchImpl = rawHttpGet, ...options } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchImpl(url, options);
    } catch (err) {
      if (attempt >= retries || !isTransientHttpError(err)) throw err;
      await sleep(retryDelayMs * (attempt + 1));
    }
  }
}

/**
 * Liegt das Artikeldatum im Ingest-Fenster? Artikel ohne (parsebares) Datum
 * gelten als aktuell – dieselbe Regel wie der Altersfilter in ingest.js.
 */
export function isRecent(datum, runDate = todayString(), maxAgeDays = MAX_ARTICLE_AGE_DAYS) {
  if (!datum) return true;
  const date = new Date(datum);
  if (isNaN(date.getTime())) return true;
  const cutoff = new Date(`${runDate}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - maxAgeDays);
  return date >= cutoff;
}

// Volltext-Abrufe pro Host begrenzen: Hunderte parallele Requests an denselben
// Server enden in HTTP 429 (Hugging Face) oder gescheiterten Verbindungen (Heise).
const hostQueues = new Map();
export async function withHostLimit(url, task, limit = ENRICH_HOST_CONCURRENCY) {
  let host = '';
  try { host = new URL(url).hostname; } catch { /* ungültige URL: ohne Limit */ }
  if (!hostQueues.has(host)) hostQueues.set(host, { active: 0, waiting: [] });
  const state = hostQueues.get(host);
  if (state.active >= limit) await new Promise(resolve => state.waiting.push(resolve));
  else state.active++;
  try {
    return await task();
  } finally {
    const next = state.waiting.shift();
    if (next) next(); else state.active--;
  }
}

const DEFAULT_BLOCK_REGEX = /<(h1|h2|h3|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const DEFAULT_BOILERPLATE_REGEX = /(subscribe|newsletter|sign in|privacy|terms|cookie)/i;

/**
 * Extrahiert lesbaren Text aus einer HTML-Seite.
 * Bevorzugt <article>, dann <main>, sonst das ganze Dokument.
 * Entfernt Scripts, Styles, Navigation und Footer.
 */
export function extractArticleText(html, options = {}) {
  const { preferArticle = true } = options;
  if (!preferArticle) return extractBlocks(html, options);
  const articleMatch = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  const mainMatch = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  const scope = articleMatch ? articleMatch[1] : (mainMatch ? mainMatch[1] : null);
  if (scope === null) return extractBlocks(html, options);
  const scoped = extractBlocks(scope, options);
  // Manche Seiten setzen ein leeres oder Teaser-<article> vor den eigentlichen
  // Beitrag (z.B. Hugging Face Blog). Liefert der Ausschnitt kaum Text, zählt
  // das ganze Dokument.
  if (scoped.length >= MIN_SCOPED_TEXT_LENGTH) return scoped;
  const whole = extractBlocks(html, options);
  return whole.length > scoped.length ? whole : scoped;
}

const MIN_SCOPED_TEXT_LENGTH = 300;

function extractBlocks(scope, {
  blockRegex = DEFAULT_BLOCK_REGEX,
  boilerplateRegex = DEFAULT_BOILERPLATE_REGEX,
  minBlockLength = 45,
  maxLength = 8000,
} = {}) {
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

// Einwilligungs-Seiten (z.B. Golem leitet jeden Artikelabruf dorthin um) sind
// kein Artikeltext. Ohne diese Prüfung ersetzte der Consent-Text den Teaser und
// der Artikel wurde auf Basis von Werbe-Hinweisen bewertet und aufbereitet.
const CONSENT_PAGE_REGEX = /consent is not possible inside an iframe|consent dialog could not be loaded|advertising and content can be personalised|zustimmung zur datenverarbeitung|mit werbung und tracking weiterlesen|cookies zustimmen/i;
export function looksLikeConsentPage(text = '') {
  return CONSENT_PAGE_REGEX.test(text);
}

// Unter dieser Länge gilt der Bibliothekstext als zu dünn; dann zählt der
// Rückfall auf die eigenen Suchmuster, falls er mehr liefert.
export const READABLE_MIN_CHARS = 300;

/**
 * Haupttext einer Seite: zuerst defuddle (lib/readable.js), die eigenen
 * Suchmuster (extractArticleText) nur als Rückfall.
 */
export async function extractBodyText(html, url, { maxLength = 8000, extractOptions = {} } = {}) {
  const readable = await extractReadableText(html, url, { maxLength });
  if (readable.length >= READABLE_MIN_CHARS) return readable;
  const fallback = extractArticleText(html, { maxLength, ...extractOptions });
  return fallback.length > readable.length ? fallback : readable;
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
    // Unparsebares Datum → null statt Rohstring, damit das datum-Feld
    // konsistent ISO-String oder null ist (filterByAge behält null-Artikel).
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch { return null; }
}

/** RSS-Feed parsen, einheitliches Article-Schema zurückgeben. */
export function parseRss(xml, quelle, { decodeTitle = true } = {}) {
  const articles = [];
  // \b[^>]*: matcht auch <item rdf:about="..."> (RDF/RSS 1.0).
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
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
  if (articles.length === 0) {
    // Stumme Degradation sichtbar machen: nicht jeder Adapter prüft selbst auf 0.
    console.warn(`[parseRss] 0 Artikel geparst (${typeof quelle === 'function' ? 'dynamische Quelle' : quelle}) – Feed-Format geändert?`);
  }
  return articles;
}

/**
 * Atom-Link-Auswahl: explizit rel="alternate" bevorzugen (beide Attribut-
 * Reihenfolgen), dann Links ohne rel-Attribut, erst dann der erste Link –
 * sonst gewinnt z.B. ein vorangestelltes rel="self" und liefert Feed- statt
 * Artikel-URLs.
 */
function extractAtomLink(entry) {
  const relFirst = /<link\b[^>]*rel="alternate"[^>]*href="([^"]+)"/i.exec(entry);
  if (relFirst) return relFirst[1];
  const hrefFirst = /<link\b[^>]*href="([^"]+)"[^>]*rel="alternate"/i.exec(entry);
  if (hrefFirst) return hrefFirst[1];
  // Links ohne rel-Attribut gelten in Atom als alternate.
  const linkTags = entry.match(/<link\b[^>]*>/gi) || [];
  for (const tag of linkTags) {
    if (/\brel=/i.test(tag)) continue;
    const href = /href="([^"]+)"/i.exec(tag);
    if (href) return href[1];
  }
  const any = /<link\b[^>]*href="([^"]+)"/i.exec(entry);
  return any ? any[1] : null;
}

/** Atom-Feed parsen, einheitliches Article-Schema zurückgeben. */
export function parseAtom(xml, quelle) {
  const articles = [];
  // \b[^>]*: matcht auch <entry xml:lang="..."> u.ä.
  const entryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry);
    const link = extractAtomLink(entry);
    const publishedMatch = /<published>([\s\S]*?)<\/published>/.exec(entry)
      || /<updated>([\s\S]*?)<\/updated>/.exec(entry);
    const summaryMatch = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(entry)
      || /<content[^>]*>([\s\S]*?)<\/content>/.exec(entry);

    if (!titleMatch || !link) continue;

    const titel = decodeHtmlEntities(extractCdata(titleMatch[1]));
    const url = link.trim();
    const datum = publishedMatch ? parseDate(publishedMatch[1]) : null;
    const rohtext = summaryMatch ? stripTags(decodeHtmlEntities(extractCdata(summaryMatch[1]))).slice(0, 2000) : '';

    articles.push({ titel, url, datum, quelle: typeof quelle === 'function' ? quelle({ titel, url }) : quelle, rohtext });
  }
  if (articles.length === 0) {
    console.warn(`[parseAtom] 0 Artikel geparst (${typeof quelle === 'function' ? 'dynamische Quelle' : quelle}) – Feed-Format geändert?`);
  }
  return articles;
}

/**
 * Enrichment-Helper: Wenn der Artikeltext kürzer als minLength ist,
 * lade die Artikelseite nach und extrahiere zusätzlichen Text.
 * Artikel ausserhalb des Ingest-Fensters werden nicht abgerufen – sie fallen
 * im Altersfilter ohnehin weg (ein Feed-Archiv mit 900 Einträgen löste sonst
 * 900 Requests pro Lauf aus).
 */
export async function enrichFromUrl(article, {
  minLength = 1500,
  maxLength = 8000,
  logTag = 'enrich',
  fetchOptions = {},
  useMetaDescription = false,
  extractOptions = {},
  shouldEnrich,
  runDate,
  fetchImpl = httpGet,
} = {}) {
  if ((article.rohtext || '').length >= minLength) return article;
  if (!isRecent(article.datum, runDate)) return article;
  if (!isSafeUrl(article.url)) return article;
  if (shouldEnrich && !shouldEnrich(article)) return article;

  try {
    const html = await withHostLimit(article.url, () => fetchImpl(article.url, fetchOptions));
    const meta = useMetaDescription ? extractMetaDescription(html) : '';
    const body = await extractBodyText(html, article.url, { maxLength, extractOptions });
    const enriched = [meta, body].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (looksLikeConsentPage(enriched)) {
      console.warn(`[${logTag}] Einwilligungs-Seite statt Artikeltext (${article.titel}) – Teaser bleibt.`);
      return article;
    }
    if (enriched.length > (article.rohtext || '').length) {
      return { ...article, rohtext: enriched.slice(0, maxLength) };
    }
  } catch (err) {
    console.warn(`[${logTag}] Artikeltext konnte nicht geladen werden (${article.titel}): ${err.message}`);
  }
  return article;
}
