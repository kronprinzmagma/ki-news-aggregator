import { inspectWriteup } from './editorial.js';
import { normalizeUrl } from './url.js';

export const MAX_REWRITE_ROUNDS = 2;

const isEligible = row => row.product_relevance >= 4 && row.input_quality === 'good';

const contentPasses = row => isEligible(row) && row.faithfulness >= 4
  && row.comprehension_nontechnical >= 4 && row.issue_fit === 'strong' && !row.needs_rewrite;

/** Reine Formfehler sagen das ausdrücklich, damit der Inhalt nicht neu erfunden wird. */
function rewriteHint(row, issues) {
  if (contentPasses(row)) return `Inhalt und Aussagen sind in Ordnung und bleiben unverändert. Behebe nur: ${issues.join(' ')}`;
  return [row.rewrite_hint || row.reason, ...issues].join(' ');
}

/**
 * Review-Schlaufe vor der Veröffentlichung. Ein bestandener Text bleibt
 * unverändert und wird nicht erneut bewertet; nur überarbeitete Texte gehen
 * nochmals durch die Review. Irrelevante Themen und dünne Quellen fallen ohne
 * Rewrite weg, schwache Texte nach maxRounds Überarbeitungen. Eine fehlende
 * oder ungültige Review stoppt die Veröffentlichung (error).
 *
 * review(articles, texts, samples) → { result } oder { error }
 * rewrite(article, text, hint) → neuer Text oder null (Format verlassen)
 */
export async function runReviewLoop({ articles, texts, lowScoreSamples = [], review, rewrite, maxRounds = MAX_REWRITE_ROUNDS }) {
  const order = articles.map((article, i) => ({ article, text: texts[i], rewritten: false }));
  const excluded = [];
  const rewriteLog = [];
  const passed = new Set();
  const latest = new Map();
  let pending = order;
  let firstReview = null;
  let finalReview = null;

  const finish = error => ({
    items: order.filter(i => passed.has(i)).map(({ article, text }) => ({ article, text })),
    excluded,
    rewrites: order.filter(i => i.rewritten).length,
    rewriteLog,
    reviewInitial: rewriteLog.length ? firstReview : null,
    review: finalReview,
    ...(error ? { error } : {}),
  });

  for (let round = 0; pending.length; round++) {
    const current = await review(pending.map(i => i.article), pending.map(i => i.text), round === 0 ? lowScoreSamples : []);
    if (round === 0) firstReview = current;
    if (current.error) {
      finalReview = current;
      return finish(current.error);
    }
    for (const row of current.result.selected_articles) latest.set(normalizeUrl(row.url), row);
    // Zusammengeführt: pro Artikel die jeweils letzte Bewertung.
    finalReview = {
      ...firstReview,
      result: { ...firstReview.result, selected_articles: order.map(i => latest.get(normalizeUrl(i.article.url))) },
    };

    const next = [];
    for (const item of pending) {
      const { url } = item.article;
      const row = latest.get(normalizeUrl(url));
      const issues = inspectWriteup(item.text);
      if (contentPasses(row) && !issues.length) {
        passed.add(item);
        continue;
      }
      if (!isEligible(row) || round >= maxRounds) {
        excluded.push({ url, reason: contentPasses(row) ? issues.join(' ') : row.reason });
        continue;
      }
      const hint = rewriteHint(row, issues);
      console.log(`[rewrite] Runde ${round + 1}: ${item.article.titel} – ${hint}`);
      rewriteLog.push({ url, round: round + 1, hint });
      try {
        const text = await rewrite(item.article, item.text, hint);
        if (text === null) throw new Error('Rewrite ohne Drei-Block-Format');
        item.text = text;
        item.rewritten = true;
        next.push(item);
      } catch (err) {
        excluded.push({ url, reason: `Rewrite fehlgeschlagen: ${err.message}` });
      }
    }
    pending = next;
  }
  return finish();
}
