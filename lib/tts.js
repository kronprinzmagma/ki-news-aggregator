import https from 'https';
import { loadEnv } from './env.js';

const MAX_RETRIES_DEFAULT = 3;
const RETRY_DELAY_MS = 2000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

// OpenAI /v1/audio/speech akzeptiert maximal 4096 Zeichen pro Request.
// Längere Skripte werden in Stücke zerlegt und die MP3-Buffer aneinander-
// gehängt (concatenated MP3-Frames spielen in gängigen Playern problemlos).
const TTS_INPUT_LIMIT = 4096;
const CHUNK_TARGET = 3500;

function retryDelay(retries) {
  // Exponentieller Backoff mit Jitter – gleiches Muster wie lib/claude.js.
  return RETRY_DELAY_MS * 2 ** retries + Math.random() * 1000;
}

/**
 * Zerlegt langen Text in Stücke <= CHUNK_TARGET Zeichen entlang von
 * Absatz- und Satzgrenzen, damit kein Chunk mitten im Wort schneidet.
 */
export function chunkForTts(text, limit = CHUNK_TARGET) {
  const clean = text.trim();
  if (clean.length <= limit) return [clean];

  const chunks = [];
  let current = '';
  // Erst an Absätzen, dann an Satzgrenzen splitten.
  const paragraphs = clean.split(/\n{2,}/);
  for (const para of paragraphs) {
    const pieces = para.length <= limit ? [para] : para.match(/[^.!?]+[.!?]*\s*/g) || [para];
    for (const piece of pieces) {
      if ((current + piece).length > limit && current) {
        chunks.push(current.trim());
        current = '';
      }
      // Einzelnes Stück größer als das Limit (sehr langer Satz): hart schneiden.
      if (piece.length > limit) {
        for (let i = 0; i < piece.length; i += limit) chunks.push(piece.slice(i, i + limit).trim());
      } else {
        current += piece;
      }
    }
    current += '\n\n';
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function rawSpeechRequest({ model, input, voice, format, speed }, timeoutMs) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model,
      input,
      voice,
      response_format: format,
      ...(speed ? { speed } : {}),
    });
    const req = https.request(
      {
        hostname: 'api.openai.com',
        path: '/v1/audio/speech',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks), headers: res.headers }));
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`OpenAI TTS Timeout nach ${timeoutMs / 1000}s`)));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function synthesizeChunk(input, { model, voice, format, speed, timeoutMs, maxRetries, logTag }) {
  for (let retries = 0; ; retries++) {
    let response;
    try {
      response = await rawSpeechRequest({ model, input, voice, format, speed }, timeoutMs);
    } catch (err) {
      if (retries >= maxRetries) throw err;
      const delay = retryDelay(retries);
      console.warn(`[${logTag}] Request fehlgeschlagen (${err.message}) – warte ${delay}ms, Retry ${retries + 1}/${maxRetries}`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    const { status, buffer, headers } = response;
    if (RETRYABLE_STATUSES.has(status)) {
      if (retries >= maxRetries) throw new Error(`OpenAI TTS Fehler: HTTP ${status} – maximale Retries erreicht`);
      const retryAfter = parseInt(headers?.['retry-after'] || '0', 10) * 1000;
      const delay = Math.max(retryDelay(retries), retryAfter);
      console.warn(`[${logTag}] HTTP ${status} – warte ${delay}ms, Retry ${retries + 1}/${maxRetries}`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    if (status !== 200) {
      throw new Error(`OpenAI TTS Fehler: HTTP ${status} – ${buffer.toString('utf-8').slice(0, 200)}`);
    }
    return buffer;
  }
}

/**
 * Wandelt Text in eine MP3-Sprachausgabe um (OpenAI gpt-4o-mini-tts).
 * Zerlegt zu lange Texte automatisch und hängt die Teil-MP3s aneinander.
 *
 * @returns {Promise<Buffer>} MP3-Daten
 */
export async function synthesizeSpeech(text, {
  model = 'gpt-4o-mini-tts',
  voice = 'onyx',
  format = 'mp3',
  speed = null,
  timeoutMs = 120_000,
  maxRetries = MAX_RETRIES_DEFAULT,
  logTag = 'tts',
} = {}) {
  loadEnv();
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY nicht gesetzt');
  if (!text || !text.trim()) throw new Error('synthesizeSpeech: leerer Text');

  const chunks = chunkForTts(text, Math.min(CHUNK_TARGET, TTS_INPUT_LIMIT));
  console.log(`[${logTag}] Synthese: ${text.length} Zeichen in ${chunks.length} Chunk(s), Stimme=${voice}`);

  const buffers = [];
  for (let i = 0; i < chunks.length; i++) {
    const buf = await synthesizeChunk(chunks[i], { model, voice, format, speed, timeoutMs, maxRetries, logTag });
    buffers.push(buf);
  }
  return Buffer.concat(buffers);
}
