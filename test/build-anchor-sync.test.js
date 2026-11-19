import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeBuildAnchor, pruneBuildAnchorsForDate, writeBuildAnchorIndex } from '../lib/build-anchors.js';

test('hint catalog withdraws removed Daily entries while preserving current URLs and other dates', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ki-hint-sync-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const writeup = '**Praktischer Hinweis**\nPrüfe die Bedingungen.';
  const base = { quelle: 'Quelle', score: 4 };
  const current = await writeBuildAnchor({ repoRoot: root, date: '2026-10-07', writeup, article: { ...base, titel: 'Original technical title', display_title: 'Verständliche Nachricht', url: 'https://example.com/current?utm_source=feed' } });
  const withdrawn = await writeBuildAnchor({ repoRoot: root, date: '2026-10-07', writeup, article: { ...base, titel: 'Removed article', url: 'https://example.com/removed' } });
  const older = await writeBuildAnchor({ repoRoot: root, date: '2026-10-06', writeup, article: { ...base, titel: 'Older article', url: 'https://example.com/older' } });
  const manual = path.join(root, 'build-anchors/2026-10-07-manual-note.md');
  await fs.writeFile(manual, 'Eine eigene Notiz ohne generierte Metadaten.');
  assert.deepEqual(await pruneBuildAnchorsForDate({ repoRoot: root, date: '2026-10-07', articles: [{ url: 'https://example.com/current' }] }), [withdrawn]);
  await assert.rejects(fs.readFile(path.join(root, withdrawn)), { code: 'ENOENT' });
  assert.match(await fs.readFile(path.join(root, current), 'utf8'), /article_title: "Verständliche Nachricht"/);
  assert.match(await fs.readFile(path.join(root, current), 'utf8'), /Quelle: \[Verständliche Nachricht\]/);
  await fs.access(path.join(root, older));
  await fs.access(manual);
  await writeBuildAnchorIndex({ repoRoot: root });
  const index = await fs.readFile(path.join(root, 'build-anchors/README.md'), 'utf8');
  assert.match(index, /Verständliche Nachricht/);
  assert.doesNotMatch(index, /Removed article/);
});

test('hint cleanup cannot escape its date scope; absent directory is harmless', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ki-hint-scope-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await assert.rejects(pruneBuildAnchorsForDate({ repoRoot: root, date: '../2026-10-07', articles: [] }), /Ungültiges/);
  assert.deepEqual(await pruneBuildAnchorsForDate({ repoRoot: root, date: '2026-10-07', articles: [] }), []);
});
