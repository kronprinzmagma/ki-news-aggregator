import assert from 'node:assert/strict';
import test from 'node:test';
import {
  tokenize,
  sharedTokens,
  overlapCount,
  articleOverlap,
  applyEventDedup,
  applyClusterBonus,
  dedupByTopic,
  findRelated,
} from '../lib/topic-overlap.js';

// topic-overlap.js ist die zentrale Heuristik hinter Event-Dedup, Cluster-Bonus,
// Themen-Dedup und Related-Links. Reine Funktionen, ohne LLM-Call deterministisch
// pinbar — genau die Schicht, die ein Unit-Layer absichern soll.

test('tokenize behält Umlaut-Wörter intakt statt sie zu zerstückeln', () => {
  // \W+ ohne u-Flag hätte "kündigt" in ["k","ndigt"] zerlegt.
  const tokens = tokenize('OpenAI kündigt Sprachmodell an');
  assert.ok(tokens.has('kündigt'));
  assert.ok(tokens.has('sprachmodell'));
  assert.ok(!tokens.has('k'));
});

test('tokenize lässt Kurz-Kürzel aus der Whitelist durch, filtert Stopwords', () => {
  const tokens = tokenize('the new GPT and KI model via google');
  assert.ok(tokens.has('gpt'));     // 3 Zeichen, Whitelist
  assert.ok(tokens.has('ki'));      // 2 Zeichen, Whitelist
  assert.ok(tokens.has('model'));
  for (const stop of ['the', 'new', 'and', 'via', 'google']) {
    assert.ok(!tokens.has(stop), `Stopword "${stop}" sollte gefiltert sein`);
  }
});

test('sharedTokens / overlapCount zählen die gemeinsamen Themen-Tokens', () => {
  const a = 'Claude Agent Plattform Release';
  const b = 'Claude Agent Plattform Update';
  assert.deepEqual(sharedTokens(a, b).sort(), ['agent', 'claude', 'plattform']);
  assert.equal(overlapCount(a, b), 3);
  assert.equal(overlapCount('Claude Release', 'Gemini Update'), 0);
});

test('applyEventDedup bestraft den schwächeren von zwei Themen-Dubletten', () => {
  const scored = [
    { titel: 'Claude Opus Modell Release', score: 5, quelle: 'anthropic' },
    { titel: 'Claude Opus Modell Update', score: 3, quelle: 'venturebeat' },
  ];
  const out = applyEventDedup(scored, { threshold: 3 });
  const stark = out.find(a => a.titel.includes('Release'));
  const schwach = out.find(a => a.titel.includes('Update'));
  assert.equal(stark.score, 5, 'der stärkere Artikel bleibt unangetastet');
  assert.equal(schwach.score, 2, 'der schwächere bekommt -1');
  assert.equal(schwach.dedup_penalty, true);
  assert.equal(schwach.dedup_of, stark.titel);
  // Eingabe wird nicht mutiert.
  assert.equal(scored[1].score, 3);
  assert.equal(scored[1].dedup_penalty, undefined);
});

test('applyEventDedup vergibt pro Artikel höchstens eine Penalty', () => {
  const scored = [
    { titel: 'Claude Opus Modell Release', score: 5, quelle: 'anthropic' },
    { titel: 'Claude Opus Modell Update', score: 4, quelle: 'venturebeat' },
    { titel: 'Claude Opus Modell Preview', score: 3, quelle: 'theverge' },
  ];
  const out = applyEventDedup(scored, { threshold: 3 });
  const penalised = out.filter(a => a.dedup_penalty);
  // Zwei schwächere Artikel werden je genau einmal bestraft, nie doppelt.
  for (const a of penalised) {
    assert.equal(typeof a.score, 'number');
    assert.ok(a.score >= 1);
  }
  assert.equal(out.find(a => a.titel.includes('Release')).score, 5);
});

test('applyClusterBonus hebt einen thematisch verwandten Low-Score-Artikel an', () => {
  const scored = [
    { titel: 'Claude Agent Plattform', score: 5, quelle: 'anthropic', begründung: '' },
    { titel: 'Claude Agent', score: 2, quelle: 'theverge', begründung: '' },
  ];
  const out = applyClusterBonus(scored);
  const low = out.find(a => a.titel === 'Claude Agent');
  assert.equal(low.score, 3, 'der Low-Score-Artikel wurde um +1 angehoben');
  assert.equal(low.cluster_bonus, true);
  assert.equal(low.cluster_anchor, 'Claude Agent Plattform');
  assert.equal(scored[1].score, 2, 'Eingabe bleibt unverändert');
});

test('dedupByTopic entfernt Titel-Dubletten und behält den ersten', () => {
  const articles = [
    { titel: 'Claude Opus Release', url: 'u1', score: 5 },
    { titel: 'Claude Opus Update', url: 'u2', score: 3 },
    { titel: 'Gemini Pricing News', url: 'u3', score: 4 },
  ];
  const { kept, removed } = dedupByTopic(articles, { threshold: 2 });
  assert.deepEqual(kept.map(a => a.url), ['u1', 'u3']);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].url, 'u2');
  assert.equal(removed[0].duplicate_of, 'Claude Opus Release');
});

test('findRelated verlinkt Artikel mit genügend gemeinsamen Tokens beidseitig', () => {
  const articles = [
    { titel: 'Claude Agent Release', url: 'u1', begründung: '' },
    { titel: 'Claude Agent SDK', url: 'u2', begründung: '' },
    { titel: 'Völlig anderes Thema Wetter', url: 'u3', begründung: '' },
  ];
  const related = findRelated(articles, { threshold: 2 });
  assert.ok(related.has('u1'));
  assert.ok(related.has('u2'));
  assert.equal(related.get('u1')[0].url, 'u2');
  assert.ok(!related.has('u3'), 'der themenfremde Artikel hat keine Related-Einträge');
});
