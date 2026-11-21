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

// ─── Realtime-Vorlesen (Fake-WebSocket, kein Netz) ───────────────────────────
import { checkTranscriptFidelity, realtimeSpeak, synthesizeSpeech } from '../lib/tts.js';

function fakeConnect(script) {
  const sent = [];
  const sockets = [];
  const connect = (url, headers) => {
    const ws = {
      url, headers, sent,
      send(data) {
        const ev = JSON.parse(data);
        sent.push(ev);
        setImmediate(() => script(ev, (out) => ws.onmessage?.({ data: JSON.stringify(out) })));
      },
      close() { this.closed = true; },
    };
    sockets.push(ws);
    setImmediate(() => ws.onmessage?.({ data: JSON.stringify({ type: 'session.created' }) }));
    return ws;
  };
  return { connect, sent, sockets };
}

function speakingServer({ transcriptFor = (t) => t, status = 'completed', error = null } = {}) {
  let text = '';
  return (ev, emit) => {
    if (ev.type === 'session.update') emit({ type: 'session.updated' });
    if (ev.type === 'conversation.item.create') text = ev.item.content[0].text;
    if (ev.type === 'response.create') {
      if (error) { emit({ type: 'error', error }); return; }
      emit({ type: 'response.output_audio.delta', delta: Buffer.alloc(480).toString('base64') });
      emit({ type: 'response.output_audio_transcript.delta', delta: transcriptFor(text) });
      emit({ type: 'response.done', response: { status, usage: { output_token_details: { audio_tokens: 50 }, input_token_details: { text_tokens: 20 } } } });
    }
  };
}

test('checkTranscriptFidelity akzeptiert wörtliches Vorlesen und lehnt Antworten ab', () => {
  const input = 'KI Daily vom 19. November. Dieser Beitrag ist KI-generiert.';
  assert.equal(checkTranscriptFidelity(input, 'KI Daily vom 19. November – dieser Beitrag ist KI generiert.').ok, true);
  assert.equal(checkTranscriptFidelity(input, 'Gerne, hier ist eine Zusammenfassung.').ok, false);
  const padded = `${input} ${'Und noch viel mehr eigener Text dazu. '.repeat(3)}`;
  assert.equal(checkTranscriptFidelity(input, padded).ok, false);
});

test('realtimeSpeak schickt Sitzung, Text und Auth-Header und sammelt Audio', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { connect, sent, sockets } = fakeConnect(speakingServer());
  const res = await realtimeSpeak('Hallo Welt.', { model: 'gpt-realtime-2.1-mini', voice: 'cedar', timeoutMs: 2000, connect });
  assert.equal(res.pcm.length, 480);
  assert.equal(res.transcript, 'Hallo Welt.');
  const update = sent.find((e) => e.type === 'session.update');
  assert.deepEqual(update.session.output_modalities, ['audio']);
  assert.equal(update.session.audio.output.voice, 'cedar');
  assert.equal(update.session.audio.output.format.type, 'audio/pcm');
  assert.equal(sockets[0].headers.Authorization, 'Bearer test-key');
  assert.match(sockets[0].url, /^wss:\/\/api\.openai\.com\/v1\/realtime\?model=gpt-realtime-2\.1-mini$/);
  assert.doesNotMatch(sockets[0].url, /test-key/);
});

test('synthesizeSpeech wiederholt bei abweichendem Transkript und bricht dann ab', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { connect } = fakeConnect(speakingServer({ transcriptFor: () => 'Gerne helfe ich dir.' }));
  await assert.rejects(
    synthesizeSpeech('Ein Satz zum Vorlesen, der genau so gesprochen werden soll.', { connect, maxRetries: 0, encode: async (b) => b }),
    /weicht ab/,
  );
});

test('synthesizeSpeech bricht bei fatalem API-Fehler ohne Retry ab', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  let calls = 0;
  const server = speakingServer({ error: { code: 'invalid_api_key', message: 'bad key' } });
  const { connect } = fakeConnect((ev, emit) => { if (ev.type === 'response.create') calls++; server(ev, emit); });
  await assert.rejects(synthesizeSpeech('Text.', { connect, maxRetries: 3, encode: async (b) => b }), /invalid_api_key/);
  assert.equal(calls, 1);
});

test('synthesizeSpeech meldet Tokens und Dauer und fügt Pausen zwischen Stücken ein', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { connect } = fakeConnect(speakingServer());
  let stats;
  const text = Array.from({ length: 3 }, (_, i) => `Absatz ${i}. ${'Wort '.repeat(200)}`).join('\n\n');
  const pcm = await synthesizeSpeech(text, { connect, encode: async (b) => b, onStats: (s) => { stats = s; } });
  assert.ok(stats.chunks > 1);
  assert.equal(stats.audio_output_tokens, 50 * stats.chunks);
  assert.ok(pcm.length > 480 * stats.chunks); // Pausen dazwischen
});

test('synthesizeSpeech verrechnet auch verworfene Versuche und Text-Ausgabe-Tokens', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const satz = 'Ein Satz zum Vorlesen, der genau so gesprochen werden soll.';
  let versuch = 0;
  // Erster Versuch weicht ab (wird verworfen, kostet aber), zweiter stimmt.
  const server = speakingServer({ transcriptFor: (t) => (++versuch === 1 ? 'Gerne helfe ich dir.' : t) });
  const { connect } = fakeConnect(server);
  let stats;
  const { ttsCostUsd } = await import('../lib/audio.js');
  const origWarn = console.warn; console.warn = () => {};
  try {
    await synthesizeSpeech(satz, { connect, maxRetries: 1, encode: async (b) => b, onStats: (s) => { stats = s; } });
  } finally { console.warn = origWarn; }
  assert.equal(stats.attempts, 2);
  assert.equal(stats.audio_output_tokens, 100);
  assert.equal(stats.text_input_tokens, 40);
  assert.equal(stats.text_output_tokens, 0);
  assert.ok(ttsCostUsd({ ...stats, text_output_tokens: 1e6 }) > ttsCostUsd(stats));
});
