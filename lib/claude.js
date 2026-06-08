import https from 'https';
import { loadEnv } from './env.js';

const MAX_RETRIES_DEFAULT = 3;
const RETRY_DELAY_MS = 2000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504, 529]);

// ─── Pricing (USD pro 1 Mio Tokens) ──────────────────────────────────────────
// Stand 2026-05. Cache-Read = 0.1× Input, Cache-Creation = 1.25× Input.
const PRICING_PER_MTOK = {
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
  'claude-haiku-4-5':          { input: 1.0, output: 5.0 },
  'claude-sonnet-4-6':         { input: 3.0, output: 15.0 },
  'claude-sonnet-4-5':         { input: 3.0, output: 15.0 },
  'claude-opus-4-7':           { input: 5.0, output: 25.0 },
};

function priceFor(model) {
  return PRICING_PER_MTOK[model] || { input: 0, output: 0 };
}

/**
 * Berechnet USD-Kosten aus einem usage-Objekt der Anthropic-Response.
 * @param {string} model - Modell-Identifier
 * @param {Object} usage - Anthropic usage-Objekt
 * @param {number} discount - Multiplikator (z.B. 0.5 für Batch API)
 */
export function computeCost(model, usage, discount = 1.0) {
  if (!usage) return 0;
  const p = priceFor(model);
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheCreation = usage.cache_creation_input_tokens || 0;
  const cost =
    (input * p.input +
     output * p.output +
     cacheRead * p.input * 0.1 +
     cacheCreation * p.input * 1.25) / 1_000_000;
  return cost * discount;
}

// ─── Modul-weiter Usage-Akkumulator ──────────────────────────────────────────
// Tracked alle callClaude-Aufrufe des aktuellen Prozesses, gruppiert nach
// {logTag, model}. Wird am Ende einer Stage via getUsageSummary() abgefragt.
const _usageBuckets = new Map();

function trackUsage(logTag, model, usage, discount = 1.0) {
  if (!usage) return;
  const key = `${logTag}|${model}`;
  const bucket = _usageBuckets.get(key) || {
    log_tag: logTag, model,
    calls: 0, input_tokens: 0, output_tokens: 0,
    cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
    usd: 0,
  };
  bucket.calls++;
  bucket.input_tokens += usage.input_tokens || 0;
  bucket.output_tokens += usage.output_tokens || 0;
  bucket.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
  bucket.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
  bucket.usd += computeCost(model, usage, discount);
  _usageBuckets.set(key, bucket);
}

/** Liefert eine Zusammenfassung aller bisher getrackten LLM-Calls. */
export function getUsageSummary() {
  const by_log_tag = [...(_usageBuckets.values())]
    .map(b => ({ ...b, usd: Number(b.usd.toFixed(6)) }))
    .sort((a, b) => b.usd - a.usd);
  const totals = by_log_tag.reduce((acc, b) => ({
    calls: acc.calls + b.calls,
    input_tokens: acc.input_tokens + b.input_tokens,
    output_tokens: acc.output_tokens + b.output_tokens,
    cache_read_input_tokens: acc.cache_read_input_tokens + b.cache_read_input_tokens,
    cache_creation_input_tokens: acc.cache_creation_input_tokens + b.cache_creation_input_tokens,
    usd: acc.usd + b.usd,
  }), { calls: 0, input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, usd: 0 });
  totals.usd = Number(totals.usd.toFixed(6));
  const cacheHitRate = totals.cache_read_input_tokens + totals.input_tokens > 0
    ? totals.cache_read_input_tokens / (totals.cache_read_input_tokens + totals.input_tokens)
    : 0;
  return { totals, by_log_tag, cache_hit_rate: Number(cacheHitRate.toFixed(4)) };
}

/** Setzt den Akkumulator zurück (für Tests). */
export function resetUsage() { _usageBuckets.clear(); }

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
          // prompt-caching ist seit Q4/2024 GA, der alte Beta-Header
          // war erforderlich solange in Beta, jetzt überflüssig.
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
 *
 * Wenn `tools` + `toolChoice` gesetzt sind, wird der Tool-Use-Pfad genutzt
 * (Structured Outputs): die Response enthält dann ein tool_use-Content-Block,
 * dessen `input` gegen das input_schema validiert ist. Rückgabe in diesem
 * Fall: `{ tool_input, tool_use_id, usage }`. Sonst: `{ text, usage }`.
 */
export async function callClaude({
  model,
  messages,
  system,
  tools,
  toolChoice,
  maxTokens,
  timeoutMs = 60_000,
  maxRetries = MAX_RETRIES_DEFAULT,
  logTag = 'claude',
}) {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY nicht gesetzt');

  const payload = { model, max_tokens: maxTokens, messages };
  if (system) payload.system = system;
  if (tools) payload.tools = tools;
  if (toolChoice) payload.tool_choice = toolChoice;

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
    trackUsage(logTag, model, parsed.usage);

    if (tools) {
      const toolUse = parsed?.content?.find(c => c.type === 'tool_use');
      if (!toolUse) throw new Error(`Erwarteter tool_use-Block fehlt – stop_reason: ${parsed.stop_reason} – ${body.slice(0, 300)}`);
      return { tool_input: toolUse.input, tool_use_id: toolUse.id, usage: parsed.usage };
    }

    const content = parsed?.content?.[0]?.text;
    if (!content) throw new Error(`Unerwartetes API-Response-Format: ${body.slice(0, 200)}`);
    return { text: content.trim(), usage: parsed.usage };
  }
}

/**
 * Bequemer Helper für Structured Outputs via tool_use.
 * Zwingt das Modell, das angegebene Tool aufzurufen. Returnt das geparste
 * Tool-Input-Objekt (bereits gegen das input_schema validiert).
 */
export async function claudeStructured({
  model,
  system,
  messages,
  toolName,
  toolDescription,
  schema,
  cacheTools = true,
  maxTokens = 1024,
  timeoutMs = 60_000,
  maxRetries = MAX_RETRIES_DEFAULT,
  logTag = 'structured',
}) {
  // cache_control auf der Tool-Definition: ohne dies wird der gesamte
  // System-Prompt-Cache invalidiert, sobald Tools im Payload sind
  // (Cache-Key ist hierarchisch: tools → system → messages).
  const toolDef = {
    name: toolName,
    description: toolDescription || `Returns the result as a structured object.`,
    input_schema: schema,
  };
  if (cacheTools) toolDef.cache_control = { type: 'ephemeral' };
  const { tool_input } = await callClaude({
    model, system, messages, tools: [toolDef],
    toolChoice: { type: 'tool', name: toolName },
    maxTokens, timeoutMs, maxRetries, logTag,
  });
  return tool_input;
}

// ─── Batch API ───────────────────────────────────────────────────────────────
// Anthropic Message Batches: 50% Rabatt auf alle Tokens, asynchron (typisch
// <10min für kleine Batches, max 24h). Ideal für tägliche Cron-Jobs ohne
// harte SLA. Dokumentation: docs.claude.com/en/docs/build-with-claude/batch-processing

function rawAnthropicRequest(method, path, body, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request({ hostname: 'api.anthropic.com', path, method, headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Anthropic API Timeout nach ${timeoutMs / 1000}s`)));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Schickt eine Liste von Requests als Batch ab und liefert die Ergebnisse,
 * gemappt auf die custom_id. Pollt bis zum Ende oder Timeout.
 *
 * @param {Object[]} requests - Array von { custom_id, model, system, messages, tools, toolChoice, maxTokens }
 * @param {Object} opts - { pollIntervalMs, maxWaitMs, logTag }
 * @returns Map von custom_id → { tool_input?, text?, usage?, error? }
 */
// Fehler-Klasse für hängende Batches – wird in score.js für Fallback abgefangen.
export class BatchStuckError extends Error {
  constructor(batchId, elapsedMs, completedCount = 0) {
    super(`Batch ${batchId} hängt: kein Fortschritt (${completedCount} Requests verarbeitet) nach ${Math.round(elapsedMs / 60000)}min – Fallback auf Sync-Modus`);
    this.name = 'BatchStuckError';
    this.batchId = batchId;
  }
}

async function cancelBatch(batchId, logTag) {
  try {
    await rawAnthropicRequest('POST', `/v1/messages/batches/${batchId}/cancel`, {});
    console.log(`[${logTag}] Batch ${batchId} abgebrochen.`);
  } catch (err) {
    console.warn(`[${logTag}] Batch-Cancel fehlgeschlagen: ${err.message}`);
  }
}

export async function claudeBatch(requests, {
  pollIntervalMs = 5_000,
  maxWaitMs = 30 * 60 * 1000,
  stuckTimeoutMs = 10 * 60 * 1000,
  logTag = 'batch',
} = {}) {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY nicht gesetzt');

  if (requests.length === 0) return new Map();

  const batchPayload = {
    requests: requests.map(r => {
      const params = { model: r.model, max_tokens: r.maxTokens, messages: r.messages };
      if (r.system) params.system = r.system;
      if (r.tools) params.tools = r.tools;
      if (r.toolChoice) params.tool_choice = r.toolChoice;
      return { custom_id: r.custom_id, params };
    }),
  };

  // 1. Submit
  console.log(`[${logTag}] Submitte Batch mit ${requests.length} Requests …`);
  const submitRes = await rawAnthropicRequest('POST', '/v1/messages/batches', batchPayload);
  if (submitRes.status !== 200) {
    throw new Error(`Batch-Submit fehlgeschlagen: HTTP ${submitRes.status} – ${submitRes.body.slice(0, 300)}`);
  }
  const submitted = JSON.parse(submitRes.body);
  const batchId = submitted.id;
  console.log(`[${logTag}] Batch ${batchId} eingereicht, polle alle ${pollIntervalMs/1000}s (max ${maxWaitMs/60000}min) …`);

  // 2. Poll until ended
  const startedAt = Date.now();
  let batch = submitted;
  let lastCompletedCount = 0;
  let lastProgressAt = Date.now();
  while (batch.processing_status !== 'ended') {
    if (Date.now() - startedAt > maxWaitMs) {
      await cancelBatch(batchId, logTag);
      throw new Error(`Batch ${batchId} nicht innerhalb ${maxWaitMs/60000}min fertig (Status: ${batch.processing_status})`);
    }
    await new Promise(r => setTimeout(r, pollIntervalMs));
    const pollRes = await rawAnthropicRequest('GET', `/v1/messages/batches/${batchId}`, null);
    if (pollRes.status !== 200) {
      console.warn(`[${logTag}] Poll fehlgeschlagen (HTTP ${pollRes.status}), retry …`);
      continue;
    }
    batch = JSON.parse(pollRes.body);
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    const counts = batch.request_counts || {};
    console.log(`[${logTag}] ${elapsed}s – status=${batch.processing_status} succeeded=${counts.succeeded || 0} errored=${counts.errored || 0} processing=${counts.processing || 0}`);

    const completedCount = (counts.succeeded || 0) + (counts.errored || 0);
    if (completedCount > lastCompletedCount) {
      lastCompletedCount = completedCount;
      lastProgressAt = Date.now();
    } else if (Date.now() - lastProgressAt > stuckTimeoutMs) {
      // Kein Fortschritt seit stuckTimeoutMs – greift auch, wenn der Batch
      // erst teilweise (z.B. 50/100) durchläuft und dann stehenbleibt, nicht
      // nur beim Komplett-Stillstand bei 0. maxWaitMs bleibt als Backstop.
      await cancelBatch(batchId, logTag);
      throw new BatchStuckError(batchId, Date.now() - startedAt, completedCount);
    }
  }

  // 3. Download results (JSONL)
  const resultsUrl = new URL(batch.results_url);
  const resultsRes = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: resultsUrl.hostname,
      path: resultsUrl.pathname + resultsUrl.search,
      method: 'GET',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
  if (resultsRes.status !== 200) {
    throw new Error(`Batch-Results-Download fehlgeschlagen: HTTP ${resultsRes.status}`);
  }

  // 4. Parse JSONL und map auf custom_id
  const out = new Map();
  for (const line of resultsRes.body.split('\n').filter(Boolean)) {
    let parsed;
    try { parsed = JSON.parse(line); } catch { continue; }
    const { custom_id, result } = parsed;
    if (result?.type === 'succeeded') {
      const message = result.message;
      // Batch API gibt 50% Rabatt auf alle Tokens.
      trackUsage(logTag, message.model, message.usage, 0.5);
      const toolUse = message?.content?.find(c => c.type === 'tool_use');
      if (toolUse) {
        out.set(custom_id, { tool_input: toolUse.input, usage: message.usage });
      } else {
        const text = message?.content?.[0]?.text;
        out.set(custom_id, { text: text ? text.trim() : null, usage: message.usage });
      }
    } else {
      out.set(custom_id, { error: result?.error?.message || result?.type || 'unknown error' });
    }
  }
  return out;
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
