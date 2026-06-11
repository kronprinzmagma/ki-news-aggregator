#!/usr/bin/env node
/**
 * Embeddings-Dedup-Eval: lässt die bestehende Token-Overlap-Heuristik
 * (lib/topic-overlap.js, Schwelle 3 gemeinsame Schlüsselwörter) gegen
 * Embeddings-Cosine-Similarity antreten – als A/B über die lokalen
 * articles-*.json-Historien, NICHT als Eingriff in die Produktion.
 *
 * Methodik:
 * 1. Alle lokalen articles-YYYY-MM-DD.json laden (Titel + Quelle).
 * 2. Pro Tagesdatei alle Titel-Paare bilden (Dedup arbeitet intra-day).
 * 3. Heuristik-Urteil: sharedTokens(a, b).length >= 3.
 * 4. Embeddings-Urteil: Cosine-Similarity der Titel-Embeddings
 *    (OpenAI text-embedding-3-small) >= Schwellwert.
 * 5. Report: Übereinstimmung, nur-Heuristik-Paare, nur-Embeddings-Paare –
 *    mit Titeln, damit man die Disagreements von Hand beurteilen kann.
 *    Es gibt kein automatisches "Gewinner"-Urteil: das Label ist menschlich.
 *
 * Kosten: text-embedding-3-small ≈ $0.02 / 1M Tokens – ein Lauf über
 * ~30 Tagesdateien kostet weniger als einen Rappen.
 *
 * Verwendung:
 *   OPENAI_API_KEY=sk-... node evals/embedding_dedup_eval.js [--threshold 0.82]
 *
 * Ergebnis zusätzlich als evals/results/embedding-dedup-<datum>.json.
 * Erst wenn die manuelle Durchsicht zeigt, dass Embeddings klar besser
 * trennen, lohnt sich der Produktions-Umbau (siehe EVALS.md).
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { loadEnv } from '../lib/env.js';
import { sharedTokens } from '../lib/topic-overlap.js';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const RESULTS_DIR = path.join(__dirname, 'results');

const HEURISTIC_THRESHOLD = 3; // identisch zur Produktion (topic-overlap)
const thresholdArgIdx = process.argv.indexOf('--threshold');
const EMBED_THRESHOLD = thresholdArgIdx > -1 ? Number(process.argv[thresholdArgIdx + 1]) : 0.82;
const EMBED_MODEL = 'text-embedding-3-small';

if (!process.env.OPENAI_API_KEY) {
  console.error('[dedup-eval] OPENAI_API_KEY nicht gesetzt – Embeddings-Vergleich braucht den Key.');
  console.error('[dedup-eval] (Gleicher Key wie für die Audio-Ausgabe; nur lokal nötig, läuft nicht in CI.)');
  process.exit(1);
}

function openaiEmbeddings(inputs) {
  const payload = JSON.stringify({ model: EMBED_MODEL, input: inputs });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/embeddings',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`OpenAI ${res.statusCode}: ${data.slice(0, 200)}`));
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.data.map(d => d.embedding));
        } catch (err) { reject(err); }
      });
    });
    req.setTimeout(60_000, () => req.destroy(new Error('Timeout')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  const files = (await fs.readdir(REPO_ROOT))
    .filter(f => /^articles-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  if (files.length === 0) {
    console.error('[dedup-eval] Keine lokalen articles-*.json gefunden – zuerst ein paar Tage Pipeline laufen lassen oder Artefakte herunterladen.');
    process.exit(1);
  }
  console.log(`[dedup-eval] ${files.length} Tagesdateien, Heuristik-Schwelle ${HEURISTIC_THRESHOLD} Tokens, Embedding-Schwelle ${EMBED_THRESHOLD} (${EMBED_MODEL})`);

  const agreementPairs = [];
  const heuristicOnly = [];
  const embeddingOnly = [];
  let totalPairs = 0;

  for (const file of files) {
    let articles;
    try { articles = JSON.parse(await fs.readFile(path.join(REPO_ROOT, file), 'utf-8')); }
    catch { continue; }
    const titles = articles.map(a => a.titel).filter(Boolean);
    if (titles.length < 2) continue;

    // Embeddings batched pro Tagesdatei (max ~100 Titel, weit unter Limit).
    const embeddings = await openaiEmbeddings(titles);

    for (let i = 0; i < titles.length; i++) {
      for (let j = i + 1; j < titles.length; j++) {
        totalPairs++;
        const shared = sharedTokens(titles[i], titles[j]);
        const heur = shared.length >= HEURISTIC_THRESHOLD;
        const sim = cosine(embeddings[i], embeddings[j]);
        const emb = sim >= EMBED_THRESHOLD;
        if (!heur && !emb) continue;
        const pair = { file, a: titles[i], b: titles[j], shared_tokens: shared, cosine: Number(sim.toFixed(3)) };
        if (heur && emb) agreementPairs.push(pair);
        else if (heur) heuristicOnly.push(pair);
        else embeddingOnly.push(pair);
      }
    }
    process.stdout.write('.');
  }
  console.log('\n');

  console.log(`[dedup-eval] ${totalPairs} Paare geprüft`);
  console.log(`  beide einig (Duplikat):       ${agreementPairs.length}`);
  console.log(`  nur Heuristik flaggt:         ${heuristicOnly.length}  ← mögliche False Positives der Heuristik`);
  console.log(`  nur Embeddings flaggen:       ${embeddingOnly.length}  ← mögliche Misses der Heuristik`);

  const show = (label, pairs) => {
    if (pairs.length === 0) return;
    console.log(`\n${label} (max. 15):`);
    for (const p of pairs.slice(0, 15)) {
      console.log(`  [${p.file.slice(9, 19)}] cos=${p.cosine} tokens=[${p.shared_tokens.join(',')}]`);
      console.log(`    A: ${p.a}`);
      console.log(`    B: ${p.b}`);
    }
  };
  show('Nur Heuristik', heuristicOnly);
  show('Nur Embeddings', embeddingOnly);

  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const outFile = path.join(RESULTS_DIR, `embedding-dedup-${new Date().toISOString().slice(0, 10)}.json`);
  await fs.writeFile(outFile, JSON.stringify({
    generated_at: new Date().toISOString(),
    files: files.length,
    total_pairs: totalPairs,
    heuristic_threshold: HEURISTIC_THRESHOLD,
    embed_threshold: EMBED_THRESHOLD,
    embed_model: EMBED_MODEL,
    agreement: agreementPairs,
    heuristic_only: heuristicOnly,
    embedding_only: embeddingOnly,
  }, null, 2) + '\n', 'utf-8');
  console.log(`\n[dedup-eval] Ergebnis: ${outFile}`);
  console.log('[dedup-eval] Nächster Schritt: Disagreements von Hand labeln. Erst bei klarem Embeddings-Vorteil Produktions-Umbau erwägen.');
}

main().catch(err => { console.error('[fatal]', err.message); process.exit(1); });
