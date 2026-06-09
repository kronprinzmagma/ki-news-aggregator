import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkForTts } from '../lib/tts.js';

test('chunkForTts keeps short text in a single chunk', () => {
  const chunks = chunkForTts('Ein kurzer Satz zum Vorlesen.');
  assert.equal(chunks.length, 1);
});

test('chunkForTts splits long text into chunks within the limit', () => {
  const long = 'Dies ist ein Testsatz mit etwas Inhalt. '.repeat(400);
  const chunks = chunkForTts(long);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 3500));
});

test('chunkForTts hard-splits a single oversized sentence', () => {
  const giant = 'Wort'.repeat(2000); // 8000 Zeichen ohne Satzende
  const chunks = chunkForTts(giant);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 3500));
});

test('chunkForTts reassembles to the original word content', () => {
  const text = Array.from({ length: 6 }, (_, i) => `Absatz ${i}. ${'Wort '.repeat(200)}`).join('\n\n');
  const joined = chunkForTts(text).join(' ').replace(/\s+/g, ' ');
  assert.ok(joined.includes('Absatz 0'));
  assert.ok(joined.includes('Absatz 5'));
});
