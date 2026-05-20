import { TOPIC_STOPWORDS } from './config.js';

export function tokenize(text) {
  return new Set(
    (text || '').toLowerCase().split(/\W+/).filter(w => w.length > 3 && !TOPIC_STOPWORDS.has(w))
  );
}

/** Gibt die Liste der gemeinsamen Tokens zurück (für Logging). */
export function sharedTokens(textA, textB) {
  const wa = tokenize(textA);
  const shared = [];
  for (const w of tokenize(textB)) if (wa.has(w)) shared.push(w);
  return shared;
}

export function overlapCount(textA, textB) {
  return sharedTokens(textA, textB).length;
}

function articleText(article, { includeReason = false } = {}) {
  return includeReason
    ? `${article.titel || ''} ${article.begründung || ''}`
    : `${article.titel || ''}`;
}

/**
 * Vergleicht zwei Artikel anhand ihres Overlap-Token-Counts.
 * Mit includeReason=true werden auch die Scoring-Begründungen berücksichtigt.
 */
export function articleOverlap(a, b, opts = {}) {
  return overlapCount(articleText(a, opts), articleText(b, opts));
}

/**
 * Event-Dedup: Artikel sind nach Score absteigend sortiert.
 * Der schwächere von zwei Artikeln mit >= threshold gemeinsamen Tokens
 * erhält penalty (Default -1, min. 1). Mutiert das Array nicht.
 */
export function applyEventDedup(scored, { threshold = 3, penalty = 1, onPenalty } = {}) {
  const sorted = [...scored].sort((a, b) => (b.score || 0) - (a.score || 0));
  const adjusted = sorted.map(a => ({ ...a }));
  for (let i = 0; i < adjusted.length; i++) {
    for (let j = i + 1; j < adjusted.length; j++) {
      if (articleOverlap(adjusted[i], adjusted[j]) >= threshold) {
        const before = adjusted[j].score;
        adjusted[j].score = Math.max(1, (adjusted[j].score || 1) - penalty);
        adjusted[j].dedup_penalty = true;
        adjusted[j].dedup_of = adjusted[i].titel;
        if (before !== adjusted[j].score && onPenalty) onPenalty(adjusted[j], adjusted[i]);
      }
    }
  }
  return adjusted;
}

/**
 * Cluster-Bonus: Artikel unter dem Cutoff (Score < 4), die einen
 * bereits selektierten Artikel (Score >= 4) thematisch ergänzen,
 * werden um bonus angehoben.
 */
export function applyClusterBonus(scored, { lowerThreshold = 2, upperThreshold = 3, bonus = 1, anchorMinScore = 4, onBonus } = {}) {
  const result = scored.map(a => ({ ...a }));
  const anchors = result.filter(a => (a.score || 0) >= anchorMinScore);
  for (const article of result) {
    if ((article.score || 0) >= anchorMinScore) continue;
    for (const anchor of anchors) {
      const overlap = articleOverlap(anchor, article, { includeReason: true });
      if (overlap >= lowerThreshold && overlap < upperThreshold) {
        const before = article.score;
        article.score = Math.min(5, (article.score || 0) + bonus);
        article.cluster_bonus = true;
        article.cluster_anchor = anchor.titel;
        if (before !== article.score && onBonus) onBonus(article, anchor);
        break;
      }
    }
  }
  return result;
}

/**
 * Themen-Dedup für Delivery: Artikel mit >= threshold gemeinsamen Tokens
 * im Titel werden entfernt; der erste (laut Sortierung stärkere) bleibt.
 * Liefert { kept, removed } mit Diagnose-Details.
 */
export function dedupByTopic(articles, { threshold = 2, onRemove } = {}) {
  const kept = [];
  const removed = [];
  const removedIdx = new Set();
  for (let i = 0; i < articles.length; i++) {
    if (removedIdx.has(i)) continue;
    kept.push(articles[i]);
    for (let j = i + 1; j < articles.length; j++) {
      if (removedIdx.has(j)) continue;
      const shared = sharedTokens(articles[i].titel, articles[j].titel);
      if (shared.length >= threshold) {
        const detail = {
          titel: articles[j].titel,
          url: articles[j].url,
          quelle: articles[j].quelle,
          score: articles[j].score,
          begründung: articles[j].begründung,
          duplicate_of: articles[i].titel,
          overlap_words: shared,
        };
        removed.push(detail);
        removedIdx.add(j);
        if (onRemove) onRemove(detail, articles[i]);
      }
    }
  }
  return { kept, removed };
}

/**
 * Liefert eine Map URL → verwandte Artikel im selben Issue
 * (>= threshold gemeinsame Tokens in Titel + Begründung).
 */
export function findRelated(articles, { threshold = 2 } = {}) {
  const related = new Map();
  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      if (articleOverlap(articles[i], articles[j], { includeReason: true }) >= threshold) {
        if (!related.has(articles[i].url)) related.set(articles[i].url, []);
        if (!related.has(articles[j].url)) related.set(articles[j].url, []);
        related.get(articles[i].url).push({ titel: articles[j].titel, url: articles[j].url });
        related.get(articles[j].url).push({ titel: articles[i].titel, url: articles[i].url });
      }
    }
  }
  return related;
}
