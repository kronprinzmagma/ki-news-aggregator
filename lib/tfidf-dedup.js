// Experiment (Branch experiment/2026-11-19-tfidf-dedup): Duplikat-Erkennung über
// TF-IDF statt reiner Titel-Token-Zählung. Nicht im Produktionspfad verdrahtet.
//
// Idee (Muster aus UglyFeed, main.py vectorize_texts): Titel plus Textanfang
// vergleichen und Wörter, die an diesem Tag selten sind, stärker gewichten als
// Allerweltswörter wie «model» oder «openai».
import { tokenize } from './topic-overlap.js';

export const DEFAULT_BODY_CHARS = 400;

/** Tokens eines Artikels als Liste (mit Wiederholungen, für die Termfrequenz). */
export function articleTokens(article, { bodyChars = DEFAULT_BODY_CHARS } = {}) {
  const text = `${article.titel || ''} ${(article.rohtext || '').slice(0, bodyChars)}`;
  // tokenize() liefert ein Set; für TF zählen wir über die Wortliste mit
  // derselben Filterlogik (Mindestlänge, Stopwords, Kürzel-Whitelist).
  const allowed = tokenize(text);
  return (text.toLowerCase().split(/[^\p{L}\p{N}]+/u)).filter(w => allowed.has(w));
}

/** TF-IDF-Vektoren (Map token -> Gewicht, L2-normiert) für eine Tagesmenge. */
export function tfidfVectors(articles, opts = {}) {
  const docs = articles.map(a => articleTokens(a, opts));
  const df = new Map();
  for (const toks of docs) for (const t of new Set(toks)) df.set(t, (df.get(t) || 0) + 1);
  const n = docs.length;
  return docs.map(toks => {
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    const vec = new Map();
    let norm = 0;
    for (const [t, c] of tf) {
      // Geglättete IDF wie sklearn (smooth_idf): ln((1+n)/(1+df)) + 1
      const w = (1 + Math.log(c)) * (Math.log((1 + n) / (1 + df.get(t))) + 1);
      vec.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of vec) vec.set(t, w / norm);
    return vec;
  });
}

export function cosineSparse(a, b) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of small) { const v = large.get(t); if (v) dot += w * v; }
  return dot;
}

/** Alle Paare (i<j) mit Cosine >= threshold. */
export function tfidfDuplicatePairs(articles, { threshold = 0.35, ...opts } = {}) {
  const vecs = tfidfVectors(articles, opts);
  const pairs = [];
  for (let i = 0; i < vecs.length; i++) {
    for (let j = i + 1; j < vecs.length; j++) {
      const sim = cosineSparse(vecs[i], vecs[j]);
      if (sim >= threshold) pairs.push({ i, j, cosine: sim });
    }
  }
  return pairs;
}
