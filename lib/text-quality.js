// Deterministische Stil-Checks für die geschriebenen Artikel-Aufbereitungen.
// Wird sowohl inline in deliver.js (live während des Daily-Runs) als auch
// retrospektiv im Deliver-Eval (evals/deliver_eval.js) verwendet.
//
// Die Listen spiegeln explizit das, was der Deliver-Prompt verbietet –
// jeder Treffer ist per Definition eine Verletzung des Style-Contracts.

const BANNED_TEMPLATE_PHRASES = [
  /build[-\s]?vs[-\s]?buy verschiebt sich/i,
  /effizienz wird zur differenzierung/i,
  /wer .{0,40} nicht tut,? verliert strukturell/i,
  /der engpass verschiebt sich/i,
];

const BANNED_MARKETING_ANGLICISMS = [
  /\bheadroom\b/i,
  /\bharness\b/i,
  /\bmikroturn\b/i,
  /\bdistributions-?engineering\b/i,
  /\bclass-leading\b/i,
];

/**
 * Sucht in einem Text-Block (z.B. einer Artikel-Aufbereitung) nach verbotenen
 * Schablonen-Sätzen und Marketing-Anglizismen.
 * Liefert ein Array von Treffern: { kind, match }.
 */
export function detectBannedPhrases(text) {
  const hits = [];
  for (const re of BANNED_TEMPLATE_PHRASES) {
    const m = text.match(re);
    if (m) hits.push({ kind: 'template', match: m[0] });
  }
  for (const re of BANNED_MARKETING_ANGLICISMS) {
    const m = text.match(re);
    if (m) hits.push({ kind: 'marketing_anglicism', match: m[0] });
  }
  return hits;
}

/**
 * Bequeme Variante für mehrere Texte: liefert pro Index ein Hits-Array,
 * plus ein Summary mit total_hits + articles_with_hits.
 */
export function detectBannedPhrasesBatch(texts) {
  const per_text = texts.map(t => detectBannedPhrases(t || ''));
  const total_hits = per_text.reduce((sum, hits) => sum + hits.length, 0);
  const articles_with_hits = per_text.filter(hits => hits.length > 0).length;
  return { per_text, total_hits, articles_with_hits };
}
