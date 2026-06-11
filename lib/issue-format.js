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
  // < und > als Unicode-Escapes encodieren: ein Titel mit "-->" oder "<!--"
  // darf den HTML-Kommentar nicht vorzeitig terminieren bzw. neu öffnen.
  // Bleibt valides JSON – JSON.parse beim Lesen funktioniert unverändert.
  const json = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  return `${META_PREFIX}${json}${META_SUFFIX}`;
}

function metaRegex() {
  return new RegExp(`${META_PREFIX.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(.*?)${META_SUFFIX}`, 'g');
}

function parsePayload(json) {
  try {
    const payload = JSON.parse(json);
    if (payload.v === META_VERSION && payload.url) return payload;
  } catch {
    // Defektes JSON ignorieren – Fallback-Parser greift.
  }
  return null;
}

/** Extrahiert alle Artikel-Metadaten aus einem Issue-Body. */
export function parseArticleMetas(body = '') {
  const out = [];
  let match;
  const re = metaRegex();
  while ((match = re.exec(body)) !== null) {
    const payload = parsePayload(match[1]);
    if (payload) out.push(payload);
  }
  return out;
}

/**
 * Zerlegt einen Issue-Body positionssicher in Artikel-Abschnitte:
 * pro Meta-Marker ein Eintrag { meta, block }, wobei block der Text bis zum
 * nächsten Marker ist. Defekte Marker liefern meta=null, verschieben aber
 * keine Indizes – im Gegensatz zu split() + parseArticleMetas(), wo ein
 * defekter Marker die Zuordnung Block↔Meta verrutschen lässt.
 */
export function parseArticleSections(body = '') {
  const matches = [...body.matchAll(metaRegex())];
  return matches.map((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
    return { meta: parsePayload(m[1]), block: body.slice(start, end) };
  });
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
