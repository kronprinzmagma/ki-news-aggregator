import { httpGet, isRecent, withHostLimit, extractBodyText, extractMetaDescription, decodeHtmlEntities } from './_base.js';

// Anthropic publiziert keinen RSS-Feed. Der frühere Community-Feed (GitHub-
// Scraper) blieb im Oktober 2026 stehen, ohne dass der Abruf fehlschlug.
// Deshalb direkt von anthropic.com: Die Sitemap liefert die Kandidaten
// (kürzlich geänderte /news/-Seiten), die Artikelseite selbst Titel, Text und
// das echte Veröffentlichungsdatum. `lastmod` allein genügt nicht – ältere
// Beiträge werden nachträglich bearbeitet und wären sonst wieder «neu».
const SITEMAP_URL = 'https://www.anthropic.com/sitemap.xml';
const NEWS_URL_REGEX = /^https:\/\/www\.anthropic\.com\/news\/[a-z0-9-]+$/;
const MAX_CANDIDATES = 15;
const FETCH_OPTIONS = { timeoutMs: 15_000 };

export function parseSitemapNews(xml) {
  const entries = [];
  const re = /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const url = match[1].trim();
    if (NEWS_URL_REGEX.test(url)) entries.push({ url, lastmod: match[2]?.trim() || null });
  }
  return entries.sort((a, b) => Date.parse(b.lastmod || 0) - Date.parse(a.lastmod || 0));
}

export async function parseNewsPage(html, { url }) {
  const rawTitle = /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i.exec(html)?.[1]
    || /<title>([^<]+)<\/title>/i.exec(html)?.[1]?.replace(/\s*[\\|]\s*Anthropic\s*$/, '');
  const titel = decodeHtmlEntities(rawTitle || '').trim();
  if (!titel) return null;
  // Ohne Veröffentlichungsdatum ist es kein Beitrag, sondern eine
  // Übersichtsseite (/news/announcements, /news/product …).
  const published = /<meta\s+property=["']article:published_time["']\s+content=["']([^"']+)["']/i.exec(html)?.[1]
    || /"datePublished":"([^"]+)"/.exec(html)?.[1];
  const date = published ? new Date(published) : null;
  if (!date || isNaN(date.getTime())) return null;
  const datum = date.toISOString();
  // Die Seite hat Teaser-Templates vor dem Beitrag → preferArticle: false.
  const body = await extractBodyText(html, url, { maxLength: 8000, extractOptions: { preferArticle: false } });
  const rohtext = [extractMetaDescription(html), body].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
  return { titel, url, datum, quelle: 'anthropic', rohtext };
}

export async function fetchArticles() {
  const xml = await httpGet(SITEMAP_URL, FETCH_OPTIONS);
  const entries = parseSitemapNews(xml);
  if (entries.length === 0) throw new Error('Sitemap enthält keine /news/-Einträge – Format geändert?');
  const candidates = entries.filter(e => e.lastmod && isRecent(e.lastmod)).slice(0, MAX_CANDIDATES);
  let failed = 0;
  const pages = await Promise.all(candidates.map(async entry => {
    try {
      const html = await withHostLimit(entry.url, () => httpGet(entry.url, FETCH_OPTIONS));
      return await parseNewsPage(html, entry);
    } catch (err) {
      failed++;
      console.warn(`[anthropic] Artikelseite konnte nicht geladen werden (${entry.url}): ${err.message}`);
      return null;
    }
  }));
  // Alle Kandidaten unlesbar: als Fehler melden, nicht als «heute nichts Neues».
  if (candidates.length > 0 && failed === candidates.length) throw new Error('Keine Anthropic-Artikelseite lesbar');
  return pages.filter(Boolean);
}
