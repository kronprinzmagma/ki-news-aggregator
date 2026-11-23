import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadGoldstandard } from '../scripts/_shared.js';

async function tmpFile(name, content) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gold-'));
  const file = path.join(dir, name);
  if (content !== undefined) await fs.writeFile(file, content, 'utf-8');
  return file;
}

test('loadGoldstandard liefert eine leere Liste nur, wenn die Datei fehlt', async () => {
  assert.deepEqual(await loadGoldstandard(await tmpFile('fehlt.json')), []);
});

test('loadGoldstandard liest eine gueltige Liste', async () => {
  const file = await tmpFile('gold.json', JSON.stringify([{ url: 'https://example.com/a', human_score: 5 }]));
  assert.equal((await loadGoldstandard(file)).length, 1);
});

test('loadGoldstandard bricht bei kaputter Datei ab, statt sie still als leer zu lesen', async () => {
  await assert.rejects(loadGoldstandard(await tmpFile('kaputt.json', '[{"url": "https://example.com/a",')), /Goldstandard/);
  await assert.rejects(loadGoldstandard(await tmpFile('objekt.json', '{"url": "x"}')), /keine Liste/);
  await assert.rejects(loadGoldstandard(await tmpFile('leer.json', '')), /Goldstandard/);
});
