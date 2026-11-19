// Experiment: TF-IDF-Dedup (Titel + Textanfang) gegen die produktive
// Token-Overlap-Heuristik (lib/topic-overlap.js). Kostenlos, kein API-Aufruf.
//
//   node evals/tfidf_dedup_eval.js [--dir <ordner mit articles-*.json>] [--threshold 0.35]
//
// Ausgabe wie embedding_dedup_eval.js: Übereinstimmung und Disagreement-Paare
// zum Labeln von Hand, plus evals/results/tfidf-dedup-<datum>.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedTokens } from '../lib/topic-overlap.js';
import { tfidfDuplicatePairs } from '../lib/tfidf-dedup.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS_DIR = path.join(REPO_ROOT, 'evals', 'results');
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : def; };
const DIR = path.resolve(arg('--dir', REPO_ROOT));
const THRESHOLD = Number(arg('--threshold', '0.35'));
const HEURISTIC_THRESHOLD = 3; // wie applyEventDedup
const BODY_CHARS = Number(arg('--body', '400'));

const files = (await fs.readdir(DIR)).filter(f => /^articles-20\d\d-\d\d-\d\d\.json$/.test(f) && !f.startsWith('articles-2099')).sort();
if (files.length === 0) { console.error(`[tfidf-dedup] Keine articles-*.json in ${DIR}`); process.exit(1); }

const both = [], heurOnly = [], tfidfOnly = [];
let totalPairs = 0;
for (const file of files) {
  const articles = JSON.parse(await fs.readFile(path.join(DIR, file), 'utf-8')).filter(a => a.titel);
  const tf = new Map(tfidfDuplicatePairs(articles, { threshold: THRESHOLD, bodyChars: BODY_CHARS }).map(p => [`${p.i}-${p.j}`, p.cosine]));
  for (let i = 0; i < articles.length; i++) for (let j = i + 1; j < articles.length; j++) {
    totalPairs++;
    const shared = sharedTokens(articles[i].titel, articles[j].titel);
    const heur = shared.length >= HEURISTIC_THRESHOLD;
    const cos = tf.get(`${i}-${j}`);
    if (!heur && cos === undefined) continue;
    const pair = { file, a: articles[i].titel, b: articles[j].titel, shared_tokens: shared, cosine: cos === undefined ? null : Number(cos.toFixed(3)) };
    (heur && cos !== undefined ? both : heur ? heurOnly : tfidfOnly).push(pair);
  }
}
console.log(`[tfidf-dedup] ${files.length} Tagesdateien, ${totalPairs} Paare, Schwelle ${THRESHOLD}, Textanfang ${BODY_CHARS} Zeichen`);
console.log(`  beide: ${both.length}  nur Heuristik: ${heurOnly.length}  nur TF-IDF: ${tfidfOnly.length}`);
for (const [label, ps] of [['Nur Heuristik', heurOnly], ['Nur TF-IDF', tfidfOnly]]) {
  console.log(`\n${label}:`);
  for (const p of ps) console.log(`  [${p.file.slice(9, 19)}] cos=${p.cosine} | ${p.a}  <>  ${p.b}`);
}
await fs.mkdir(RESULTS_DIR, { recursive: true });
const out = path.join(RESULTS_DIR, `tfidf-dedup-${new Date().toISOString().slice(0, 10)}.json`);
await fs.writeFile(out, JSON.stringify({ generated_at: new Date().toISOString(), files: files.length, total_pairs: totalPairs, threshold: THRESHOLD, body_chars: BODY_CHARS, heuristic_threshold: HEURISTIC_THRESHOLD, both, heuristic_only: heurOnly, tfidf_only: tfidfOnly }, null, 2) + '\n');
console.log(`\n[tfidf-dedup] Ergebnis: ${out}`);
