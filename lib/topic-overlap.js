import { TOPIC_STOPWORDS } from './config.js';

export function tokenize(text) {
  return new Set(
    (text || '').toLowerCase().split(/\W+/).filter(w => w.length > 3 && !TOPIC_STOPWORDS.has(w))
  );
}

export function sharedTokens(a, b) {
  const wa = tokenize(a);
  const shared = [];
  for (const w of tokenize(b)) if (wa.has(w)) shared.push(w);
  return shared;
}

export function overlapCount(a, b) {
  return sharedTokens(a, b).length;
}

export function articleText(article, { includeReason = false } = {}) {
  return includeReason
    ? `${article.titel} ${article.begründung || ''}`
    : article.titel || '';
}
