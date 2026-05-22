import assert from 'node:assert/strict';
import test from 'node:test';
import { assertExtractedBlocks, splitSummary } from '../evals/deliver_eval.js';

test('deliver eval extracts article writeups from metadata blocks', () => {
  const blocks = splitSummary(`<!-- ki-news-meta: {"url":"https://example.com/article","titel":"Example","quelle":"lab","score":4} -->
### Example

Score 4/5 · [lab](https://example.com/article)

- [ ] Besonders wertvoll

**Was ist neu**
Etwas Neues.

**Was es für die KI-Richtung heisst**
Ein Muster.

**Build-Anker**
Miss die Ausgabe.

---
`);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].url, 'https://example.com/article');
  assert.match(blocks[0].writeup, /\*\*Build-Anker\*\*/);
});

test('deliver eval fails when selected summaries provide no writeups', () => {
  assert.throws(
    () => assertExtractedBlocks([], ['/tmp/summary-2026-05-22.md']),
    /Keine Artikel-Writeups/
  );
});
