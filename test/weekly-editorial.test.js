import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWeeklyDigest, reviewWeeklyDigest, weeklyReviewPassed, requireWeeklyPublication, extractWeeklySourceText } from '../lib/weekly-editorial.js';

const articles = Array.from({ length: 3 }, (_, i) => ({ url: `https://example.com/news/${i}`, titel: `Nachricht ${i}`, quelle: 'Quelle', wasIstNeu: 'Daily-Zusammenfassung' }));
const feedback = ['Besonders wertvoll', 'Später weiterverfolgen', 'Zu kompliziert erklärt', 'Thema nicht relevant'].map(label => `- [ ] ${label}`).join('\n');
const digest = articles.map((article, index) => `### Thema ${index}\n${feedback}\n\nErklärung und Bedingungen.\n\n**Praktischer Hinweis:** Ein nützlicher Gesichtspunkt.\n\n_Belege:_ [Quelle](${article.url})`).join('\n\n---\n\n');
const passed = { faithfulness: 5, comprehension: 4, product_relevance: 4, needs_rewrite: false, issues: [] };

test('Heise originals are extracted past empty teaser article templates', () => {
  const content = 'Ein belegter Inhalt mit Bedingungen. '.repeat(15);
  const html = `<article></article><main><p>${content}</p></main>`;
  assert.equal(extractWeeklySourceText('https://www.heise.de/news/example.html', html), content.trim());
  assert.equal(extractWeeklySourceText('https://another.example/news', html), '');
});

test('weekly publication requires three supported themes, feedback and practical hints', () => {
  assert.deepEqual(inspectWeeklyDigest(digest, articles), []);
  assert.ok(inspectWeeklyDigest(digest.replace('### Thema 2', '## Thema 2'), articles).length);
  assert.ok(inspectWeeklyDigest(digest.replace('**Praktischer Hinweis:**', 'Hinweis:'), articles).length);
  assert.ok(inspectWeeklyDigest(digest.replace('- [ ] Thema nicht relevant', ''), articles).length);
  assert.ok(inspectWeeklyDigest(digest.replace(articles[0].url, 'https://unknown.example/news'), articles).length);
  assert.ok(inspectWeeklyDigest(digest + ' Wort'.repeat(850), articles).length);
  assert.ok(inspectWeeklyDigest(digest + '\ufffd', articles).length);
});

test('every cited original is fetched and reviewed; repeated checking reuses original text', async () => {
  let fetches = 0, reviews = 0;
  const sourceCache = new Map();
  const options = {
    sourceCache,
    fetchSource: async url => { assert.ok(articles.some(article => article.url === url)); fetches++; return 'Originaler Quellenbefund. '.repeat(20); },
    review: async request => {
      reviews++;
      assert.match(request.messages[0].content, /Originaler Quellenbefund/);
      assert.doesNotMatch(request.messages[0].content, /Daily-Zusammenfassung/);
      return passed;
    },
  };
  const result = await reviewWeeklyDigest(digest, articles, options);
  requireWeeklyPublication(result);
  assert.equal(result.sources.length, 3);
  await reviewWeeklyDigest(digest, articles, options);
  assert.equal(fetches, 3);
  assert.equal(reviews, 2);
});

test('invented citations prevent any fetching or model call', async () => {
  const never = () => { throw Error('must not run'); };
  const result = await reviewWeeklyDigest(digest.replace(articles[1].url, 'https://unknown.example/'), articles, { fetchSource: never, review: never });
  assert.ok(result.issues.length);
  assert.throws(() => requireWeeklyPublication(result), /Veröffentlichung gestoppt/);
});

test('unavailable, thin or damaged originals cannot be replaced with the daily summary', async () => {
  const review = () => { throw Error('must not review missing evidence'); };
  for (const fetchSource of [async () => { throw Error('HTTP 429'); }, async () => 'Teaser', async () => '\ufffd'.repeat(400)]) {
    await assert.rejects(reviewWeeklyDigest(digest, articles, { fetchSource, review }), /HTTP 429|nicht ausreichend prüfbar/);
  }
});

test('failed, incomplete or contradictory reviews block publication', () => {
  assert.equal(weeklyReviewPassed(passed), true);
  assert.throws(() => requireWeeklyPublication(null), /Veröffentlichung gestoppt/);
  for (const review of [null, {}, { ...passed, faithfulness: 3 }, { ...passed, comprehension: 3 }, { ...passed, product_relevance: 3 }, { ...passed, needs_rewrite: true }, { ...passed, issues: ['Unbelegte Aussage'] }, { ...passed, faithfulness: '5' }]) {
    assert.equal(weeklyReviewPassed(review), false);
    assert.throws(() => requireWeeklyPublication({ issues: [], review }), /Veröffentlichung gestoppt/);
  }
});
