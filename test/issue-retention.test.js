import test from 'node:test';
import assert from 'node:assert/strict';
import { planIssueClosures } from '../scripts/close-old-issues.js';

test('issue archive preserves recent dailies, warnings, unrelated issues and pull requests', () => {
  const issues = [
    { number: 1, title: 'KI Daily – 2026-10-01', created_at: '2026-10-01T10:00:00Z' },
    { number: 2, title: 'KI Daily – 2026-10-02', created_at: '2026-10-02T10:00:00Z' },
    { number: 3, title: 'Adapter stale: venturebeat (0 Artikel über 3 Läufe)', created_at: '2026-01-01' },
    { number: 4, title: 'summary: an unrelated issue', created_at: '2026-01-01' },
    { number: 5, title: 'KI Daily – 2026-01-01', created_at: '2026-01-01', pull_request: {} },
  ];
  assert.deepEqual(planIssueClosures(issues, new Date('2026-10-08T12:00:00Z')), [{ number: 1, reason: 'Daily älter als sieben Tage' }]);
});

test('weekly archive retains fourteen distinct periods including duplicate issues for a recent week', () => {
  const issues = Array.from({ length: 16 }, (_, index) => {
    const end = new Date(Date.UTC(2026, 9, 4 - index * 7)).toISOString().slice(0, 10);
    return { number: index + 1, title: `KI Weekly – KW ${40 - index} (2026-01-01 – ${end})` };
  });
  issues.push({ ...issues[0], number: 50 });
  issues.push({ number: 51, title: 'KI Weekly – unrelated discussion' });
  assert.deepEqual(planIssueClosures(issues, new Date('2026-10-08')), [
    { number: 15, reason: 'Weekly ausserhalb der letzten 14 Wochenrückblicke' },
    { number: 16, reason: 'Weekly ausserhalb der letzten 14 Wochenrückblicke' },
  ]);
});
