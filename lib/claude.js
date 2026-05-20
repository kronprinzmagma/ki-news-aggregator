import https from 'https';
import { loadEnv } from './env.js';

const MAX_RETRIES_DEFAULT = 3;
const RETRY_DELAY_MS = 2000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504, 529]);

function retryDelay(retries) {
  return RETRY_DELAY_MS * (retries + 1);
}

function rawRequest(body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Claude API Timeout nach ${timeoutMs / 1000}s`));
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Ruft Claude auf und retried bei 429/5xx mit Backoff.
 * Akzeptiert das volle messages-Payload (inkl. optional system mit cache_control).
 */
export async function callClaude({
  model,
  messages,
  system,
  maxTokens,
  timeoutMs = 60_000,
  maxRetries = MAX_RETRIES_DEFAULT,
  logTag = 'claude',
}) {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY nicht gesetzt');

  const payload = { model, max_tokens: maxTokens, messages };
  if (system) payload.system = system;

  for (let retries = 0; ; retries++) {
    let response;
    try {
      response = await rawRequest(payload, timeoutMs);
    } catch (err) {
      if (retries >= maxRetries) throw err;
      const delay = retryDelay(retries);
      console.warn(`[${logTag}] Request fehlgeschlagen (${err.message}) – warte ${delay}ms, Retry ${retries + 1}/${maxRetries}`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    const { status, body, headers } = response;
    if (RETRYABLE_STATUSES.has(status)) {
      if (retries >= maxRetries) throw new Error(`Claude API Fehler: HTTP ${status} – maximale Retries erreicht`);
      const retryAfter = parseInt(headers?.['retry-after'] || '0', 10) * 1000;
      const delay = Math.max(retryDelay(retries), retryAfter);
      console.warn(`[${logTag}] HTTP ${status} – warte ${delay}ms, Retry ${retries + 1}/${maxRetries}`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    if (status !== 200) throw new Error(`Claude API Fehler: HTTP ${status} – ${body.slice(0, 200)}`);

    const parsed = JSON.parse(body);
    const content = parsed?.content?.[0]?.text;
    if (!content) throw new Error(`Unerwartetes API-Response-Format: ${body.slice(0, 200)}`);
    return { text: content.trim(), usage: parsed.usage };
  }
}

/** Bequemer Helper: Claude aufrufen und Antwort als Text zurückgeben. */
export async function claudeText(prompt, { model, maxTokens = 600, timeoutMs = 60_000, logTag } = {}) {
  const { text } = await callClaude({
    model,
    messages: [{ role: 'user', content: prompt }],
    maxTokens,
    timeoutMs,
    logTag,
  });
  return text;
}

/** Bequemer Helper: Claude aufrufen und JSON-Antwort parsen (entfernt Code-Block-Wrapping). */
export async function claudeJson(prompt, opts = {}) {
  const text = await claudeText(prompt, opts);
  const cleaned = text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`JSON-Parse-Fehler: ${err.message} – Rohtext: "${cleaned.slice(0, 200)}"`);
  }
}
