import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeUrl } from '../lib/url.js';

test('normalizeUrl entfernt utm-Parameter, behält andere Query-Parameter', () => {
  assert.equal(
    normalizeUrl('https://example.com/a?utm_source=rss&utm_medium=feed&id=42'),
    'https://example.com/a?id=42'
  );
});

test('normalizeUrl entfernt Hash und Trailing-Slash', () => {
  assert.equal(normalizeUrl('https://example.com/a/#section'), 'https://example.com/a');
  assert.equal(normalizeUrl('https://example.com/a/'), 'https://example.com/a');
});

test('normalizeUrl ist idempotent', () => {
  const once = normalizeUrl('https://example.com/a/?utm_campaign=x#top');
  assert.equal(normalizeUrl(once), once);
});

test('normalizeUrl gibt ungültige URLs unverändert zurück', () => {
  assert.equal(normalizeUrl('kein url'), 'kein url');
});
