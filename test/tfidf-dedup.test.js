import assert from 'node:assert/strict';
import test from 'node:test';
import { tfidfVectors, cosineSparse, tfidfDuplicatePairs } from '../lib/tfidf-dedup.js';

const day = [
  { titel: 'Zephyrlabs raises funding round', rohtext: 'Zephyrlabs closed a Series C led by Northwind Capital, valuing the startup at twelve billion.' },
  { titel: 'Investors pour money into AI startup', rohtext: 'Northwind Capital leads Zephyrlabs Series C at a twelve billion valuation.' },
  { titel: 'New model release improves coding', rohtext: 'A new model release brings better coding benchmarks and a lower price.' },
  { titel: 'Model release for image editing', rohtext: 'The image editing model release adds inpainting and layer support.' },
];

test('TF-IDF erkennt gleiche Story trotz verschiedener Titel', () => {
  const pairs = tfidfDuplicatePairs(day, { threshold: 0.35 });
  assert.ok(pairs.some(p => p.i === 0 && p.j === 1), JSON.stringify(pairs));
});

test('Allerweltswörter allein machen kein Duplikat', () => {
  const pairs = tfidfDuplicatePairs(day, { threshold: 0.35 });
  assert.ok(!pairs.some(p => p.i === 2 && p.j === 3), JSON.stringify(pairs));
});

test('Vektoren sind L2-normiert, Selbstähnlichkeit = 1', () => {
  const [v] = tfidfVectors(day);
  assert.ok(Math.abs(cosineSparse(v, v) - 1) < 1e-9);
});
