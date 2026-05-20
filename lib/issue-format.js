// Versionierte Metadaten-Marker für Daily-Issues.
// Erlaubt robustes Parsing durch Weekly + Cross-Day-Dedup, unabhängig vom Markdown-Stil.

const META_PREFIX = '<!-- ki-news-meta: ';
const META_SUFFIX = ' -->';
const META_VERSION = 1;

export function articleMeta(article) {
  const payload = {
    v: META_VERSION,
    url: article.url,
    score: article.score,
    quelle: article.quelle,
    titel: article.titel,
  };
  return `${META_PREFIX}${JSON.stringify(payload)}${META_SUFFIX}`;
}

/** Extrahiert alle Artikel-Metadaten aus einem Issue-Body. */
export function parseArticleMetas(body = '') {
  const out = [];
  const re = new RegExp(`${META_PREFIX.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(.*?)${META_SUFFIX}`, 'g');
  let match;
  while ((match = re.exec(body)) !== null) {
    try {
      const payload = JSON.parse(match[1]);
      if (payload.v === META_VERSION && payload.url) out.push(payload);
    } catch {
      // Defektes JSON ignorieren – Fallback-Parser greift.
    }
  }
  return out;
}

/**
 * Liefert Artikel-URLs aus einem Issue-Body.
 * Bevorzugt HTML-Kommentar-Metadaten, fällt auf das Regex-Format
 * "Score X/5 · [quelle](url)" zurück (Backwards Compatibility).
 */
export function extractArticleUrls(body = '') {
  const metas = parseArticleMetas(body);
  if (metas.length > 0) return metas.map(m => m.url);

  const out = [];
  const fallback = /Score \d\/5 · \[[^\]]+\]\((https?:\/\/[^)]+)\)/g;
  let match;
  while ((match = fallback.exec(body)) !== null) out.push(match[1]);
  return out;
}
