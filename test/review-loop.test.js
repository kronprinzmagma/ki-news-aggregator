import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runReviewLoop } from '../lib/review-loop.js';
import { formatWriteup, inspectWriteup, limitBold, WRITEUP_MAX_BOLD } from '../lib/editorial.js';

const writeup = (extra = '') => `**Was ist neu**\n\nText ${extra}\n\n**Was es für die KI-Richtung heisst**\n\nText\n\n**Praktischer Hinweis**\n\nText`;
const art = id => ({ url: `https://example.com/${id}`, titel: id });
const good = { product_relevance: 4, input_quality: 'good', faithfulness: 5, comprehension_nontechnical: 4, issue_fit: 'strong', needs_rewrite: false, rewrite_hint: null, reason: 'gut' };
const weak = { ...good, faithfulness: 3, needs_rewrite: true, rewrite_hint: 'Satz X entfernen' };

/** rounds: pro Review-Runde eine Zuordnung id → Bewertung (oder { error }). */
function setup(ids, rounds, { texts, rewrite } = {}) {
  const reviewed = [];
  const hints = [];
  return {
    reviewed, hints,
    run: () => runReviewLoop({
      articles: ids.map(art), texts: texts ?? ids.map(() => writeup()), lowScoreSamples: ['s'],
      review: async (articles, _texts, samples) => {
        const round = rounds[reviewed.length];
        reviewed.push({ ids: articles.map(a => a.titel), samples });
        if (round.error) return round;
        return { result: { selected_articles: articles.map(a => ({ url: a.url, ...round[a.titel] })) } };
      },
      rewrite: rewrite ?? (async (a, _t, hint) => { hints.push(hint); return writeup(`neu ${a.titel}`); }),
    }),
  };
}

test('bestandene Texte bleiben stehen und werden nicht erneut geprüft', async () => {
  const s = setup(['a', 'b'], [{ a: good, b: weak }, { b: good }]);
  const r = await s.run();
  assert.deepEqual(s.reviewed, [{ ids: ['a', 'b'], samples: ['s'] }, { ids: ['b'], samples: [] }]);
  assert.deepEqual(r.items.map(i => i.article.titel), ['a', 'b']);
  assert.equal(r.items[0].text, writeup());
  assert.match(r.items[1].text, /neu b/);
  assert.equal(r.rewrites, 1);
  assert.deepEqual(r.review.result.selected_articles.map(x => x.faithfulness), [5, 5]);
  assert.equal(r.reviewInitial.result.selected_articles[1].faithfulness, 3);
});

test('zweite Runde mit neuem Hinweis rettet einen Text', async () => {
  const s = setup(['a'], [{ a: weak }, { a: { ...weak, rewrite_hint: 'Satz Y entfernen' } }, { a: good }]);
  const r = await s.run();
  assert.deepEqual(s.hints, ['Satz X entfernen', 'Satz Y entfernen']);
  assert.equal(r.items.length, 1);
  assert.equal(r.rewrites, 1);
  assert.deepEqual(r.rewriteLog.map(x => x.round), [1, 2]);
});

test('nach zwei Überarbeitungen fällt ein schwacher Text weg', async () => {
  const s = setup(['a'], [{ a: weak }, { a: weak }, { a: weak }]);
  const r = await s.run();
  assert.equal(r.items.length, 0);
  assert.equal(s.hints.length, 2);
  assert.equal(r.excluded.length, 1);
});

test('irrelevante Themen und dünne Quellen werden nie überarbeitet', async () => {
  const s = setup(['a', 'b'], [{ a: { ...weak, product_relevance: 3 }, b: { ...good, input_quality: 'thin' } }]);
  const r = await s.run();
  assert.equal(s.hints.length, 0);
  assert.equal(r.excluded.length, 2);
  assert.equal(r.reviewInitial, null);
});

test('Review-Fehler stoppt vor und nach der Überarbeitung', async () => {
  const before = await setup(['a'], [{ error: 'kaputt' }]).run();
  assert.equal(before.error, 'kaputt');
  assert.equal(before.rewriteLog.length, 0);
  const after = await setup(['a', 'b'], [{ a: good, b: weak }, { error: 'kaputt' }]).run();
  assert.equal(after.error, 'kaputt');
  assert.equal(after.rewriteLog.length, 1);
});

test('fehlgeschlagene Überarbeitung schliesst nur diesen Artikel aus', async () => {
  const r = await setup(['a', 'b'], [{ a: good, b: weak }], { rewrite: async () => null }).run();
  assert.deepEqual(r.items.map(i => i.article.titel), ['a']);
  assert.match(r.excluded[0].reason, /Rewrite fehlgeschlagen/);
  assert.equal(r.rewrites, 0);
});

test('reiner Formfehler: Hinweis verlangt unveränderten Inhalt', async () => {
  const s = setup(['a'], [{ a: good }, { a: good }], { texts: [writeup('wort '.repeat(310))] });
  const r = await s.run();
  assert.match(s.hints[0], /^Inhalt und Aussagen sind in Ordnung.*Behebe nur: Auf maximal/);
  assert.doesNotMatch(s.hints[0], /gut/);
  assert.equal(r.items.length, 1);
});

test('limitBold: ganze Sätze und Überzähliges verlieren das Fett, Stichwörter bleiben', () => {
  const [a, b, c] = limitBold([
    'Kern **eins** und **zwei**\n\n- **L1:** x\n- **L2:** x\n- **L3:** x\n- **L4:** x',
    '**das ist ein ganzer Satz mit mehr als acht Wörtern** und **drei**, **vier**, **fünf**',
    '**Kernempfehlung**',
  ]);
  assert.equal(a, 'Kern **eins** und **zwei**\n\n- **L1:** x\n- **L2:** x\n- **L3:** x\n- **L4:** x');
  assert.equal(b, 'das ist ein ganzer Satz mit mehr als acht Wörtern und **drei**, vier, fünf');
  assert.equal(c, '**Kernempfehlung**');
  assert.equal([a, b, c].join('\n').match(/\*\*[^*\n]+\*\*/g).length, WRITEUP_MAX_BOLD);
});

test('formatWriteup behebt Fett- und Überschriftenfehler ohne Überarbeitung', () => {
  const text = formatWriteup({
    was_ist_neu: `## Titel\n\n${Array.from({ length: 12 }, (_, i) => `**b${i}**`).join(' ')}`,
    ki_richtung: 'Text', praktischer_hinweis: '**Jetzt testen**',
  });
  assert.deepEqual(inspectWriteup(text), []);
  assert.match(text, /\*\*Jetzt testen\*\*/);
});
