import test from 'node:test';
import assert from 'node:assert/strict';
import { syncAdapterAlerts } from '../lib/adapter-alerts.js';

const issue = (number, adapter, runs = 3) => ({ number, title: `Adapter stale: ${adapter} (0 Artikel über ${runs} Läufe)`, body: 'Abruffehler' });
const context = { runDate: '2026-10-08', health: [], stale: [] };
function mock(issues) {
  const calls = [];
  const request = async (_token, method, path, body) => {
    calls.push({ method, path, body });
    return { status: method === 'POST' ? 201 : 200, body: JSON.stringify(method === 'GET' ? issues : { number: 42, ...body }) };
  };
  return { calls, request };
}

test('recovered feeds resolve only their own exact alerts and retain the latest date', async () => {
  const { calls, request } = mock([issue(1, 'heise'), issue(2, 'venturebeat'), { number: 3, title: 'Adapter stale: heise: investigate' }]);
  const outcomes = await syncAdapterAlerts('token', { ...context, health: [{ name: 'heise', fetched: 44, error: null, latest: '2026-10-08' }, { name: 'venturebeat', fetched: 0, error: 'HTTP 429' }] }, request);
  assert.deepEqual(outcomes, [{ adapter: 'heise', action: 'closed', number: 1 }]);
  assert.equal(calls[1].body.state, 'closed');
  assert.match(calls[1].body.body, /44 Einträge.*Neuster Eintrag: 2026-10-08/);
  assert.match(calls[1].body.body, /Aktualität.*separat/);
  assert.equal(calls.length, 2);
});

test('a changed failure count updates the existing warning rather than duplicating it', async () => {
  const { calls, request } = mock([issue(9, 'venturebeat', 3)]);
  await syncAdapterAlerts('token', { ...context, health: [{ name: 'venturebeat', fetched: 0, error: 'HTTP 429' }], stale: [{ adapter: 'venturebeat', runs: 4, latest_run: '2026-10-08' }] }, request);
  assert.equal(calls[1].method, 'PATCH');
  assert.match(calls[1].path, /issues\/9$/);
  assert.match(calls[1].body.title, /4 Läufe/);
  assert.match(calls[1].body.body, /HTTP 429/);
});

test('failed or empty fetches cannot resolve warnings; missing warning is created', async () => {
  const { calls, request } = mock([issue(9, 'heise')]);
  await syncAdapterAlerts('token', { ...context, health: [{ name: 'heise', fetched: 5, error: 'partial failure' }], stale: [{ adapter: 'a16z', runs: 3, latest_run: '2026-10-08' }] }, request);
  assert.equal(calls[1].method, 'POST');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body.labels, ['adapter-stale']);
});

test('no token means no GitHub operations; unreadable warnings cannot be treated as absent', async () => {
  assert.deepEqual(await syncAdapterAlerts(null, context, () => { throw Error('must not run'); }), []);
  await assert.rejects(syncAdapterAlerts('token', context, async () => ({ status: 503, body: '' })), /nicht lesbar/);
});
