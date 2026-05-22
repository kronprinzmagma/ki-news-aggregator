import assert from 'node:assert/strict';
import test from 'node:test';
import { buildScoreRequestParams, preFilterArticle } from '../lib/scoring.js';

test('score request uses the production structured-output contract', () => {
  const params = buildScoreRequestParams({
    titel: 'Agent SDK release',
    quelle: 'anthropic',
    rohtext: 'x'.repeat(2600),
  });

  assert.equal(params.toolChoice.name, 'submit_score');
  assert.equal(params.tools[0].name, 'submit_score');
  assert.match(params.messages[0].content, /Agent SDK release/);
  assert.match(params.messages[0].content, /<artikel_text>x{2500}<\/artikel_text>$/);
  assert.doesNotMatch(params.messages[0].content, /x{2501}/);
});

test('score prefilter keeps structurally weak articles out of LLM scoring', () => {
  assert.deepEqual(preFilterArticle({ quelle: 'hackernews-show' }), {
    score: 2,
    begründung: 'Auto-Score: Show-HN-Eintrag, im Scoring-Prompt eh deprioritisiert.',
    strategy_only: false,
    pre_filtered: 'show-hn',
  });
  assert.equal(preFilterArticle({ quelle: 'anthropic', truncated: true }).pre_filtered, 'truncated');
  assert.equal(preFilterArticle({ quelle: 'anthropic', truncated: false }), null);
});
