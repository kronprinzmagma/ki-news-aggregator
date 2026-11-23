import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeBuildAnchor, writeBuildAnchorIndex } from '../lib/build-anchors.js';

const WRITEUP = '**Was ist neu**\nText.\n\n**Praktischer Hinweis**\nEin synthetischer Hinweis.';

async function tmpRepo() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'build-anchors-'));
}

test('writeBuildAnchor schreibt den Titel als gültigen YAML-String (Backslash, Anführungszeichen, Zeilenumbruch)', async () => {
  const repoRoot = await tmpRepo();
  const titel = 'Pfad C:\\temp\\ und "Zitat"\nzweite Zeile\\';
  const rel = await writeBuildAnchor({
    article: { titel, quelle: 'test', score: 4, url: 'https://example.com/a' },
    writeup: WRITEUP,
    date: '2099-01-01',
    repoRoot,
  });
  const content = await fs.readFile(path.join(repoRoot, rel), 'utf-8');
  const line = content.split('\n').find(l => l.startsWith('article_title: '));
  // Eine einzige Frontmatter-Zeile, die als JSON- bzw. YAML-String den Originaltitel ergibt.
  assert.equal(JSON.parse(line.slice('article_title: '.length)), titel);
  assert.match(content, /^---\ndate: 2099-01-01\n[\s\S]*?\n---\n/);
});

test('writeBuildAnchor bleibt für gewöhnliche Titel unverändert', async () => {
  const repoRoot = await tmpRepo();
  const rel = await writeBuildAnchor({
    article: { titel: 'There\'s a new "Google Jail" für Wikis', quelle: 'test', score: 5, url: 'https://example.com/b' },
    writeup: WRITEUP,
    date: '2099-01-02',
    repoRoot,
  });
  const content = await fs.readFile(path.join(repoRoot, rel), 'utf-8');
  assert.ok(content.includes('article_title: "There\'s a new \\"Google Jail\\" für Wikis"\n'));
  const index = await writeBuildAnchorIndex({ repoRoot });
  assert.ok(index);
});
