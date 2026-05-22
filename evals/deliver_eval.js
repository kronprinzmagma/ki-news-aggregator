#!/usr/bin/env node
/**
 * Deliver-Eval: prüft die geschriebenen 3-Block-Aufbereitungen aus den letzten
 * summary-*.md-Files auf zwei Dimensionen:
 *
 *   (1) Faithfulness (LLM-as-Judge mit Claude Haiku): Enthält der Writeup
 *       Behauptungen, die nicht aus dem Source-Artikel ableitbar sind?
 *
 *   (2) Marketing-Sprech / Banned-Phrases (deterministische Regex): Hat der
 *       Writeup eine der im Deliver-Prompt explizit verbotenen Schablonen
 *       oder Marketing-Anglizismen verwendet?
 *
 * Quelle der Writeups: summary-YYYY-MM-DD.md (per HTML-Comment-Marker
 * artikelweise zerlegt). Quelle der Source-Texte: SQLite-articles-Tabelle.
 *
 * Verwendung:
 *   ANTHROPIC_API_KEY=sk-... node evals/deliver_eval.js [--last N]
 *   (default: letzte 3 Daily-Summaries)
 *
 * Output:
 *   - Konsolen-Summary (aggregiert)
 *   - evals/results/deliver-eval-YYYY-MM-DD.json (detail)
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { loadEnv, requireEnv } from '../lib/env.js';
import { todayString } from '../lib/date.js';
import { claudeStructured, getUsageSummary } from '../lib/claude.js';
import { SCORE_MODEL } from '../lib/config.js';
import { parseArticleMetas } from '../lib/issue-format.js';
import { closeStore } from '../lib/store.js';
import { detectBannedPhrases } from '../lib/text-quality.js';
import Database from 'better-sqlite3';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const RESULTS_DIR = path.join(__dirname, 'results');
const DB_FILE = process.env.KI_NEWS_DB || path.join(REPO_ROOT, 'ki-news.db');

const DEFAULT_LAST = 3;
const CONCURRENCY = 3;
const API_TIMEOUT_MS = 60_000;

// ─── Judge-Prompt + Schema ───────────────────────────────────────────────────

const JUDGE_PROMPT = ({ sourceText, writeupText, articleTitle, articleUrl }) => `Du bist ein strenger Eval-Judge für eine KI-News-Aggregator-Pipeline.

Aufgabe: Prüfe die geschriebene 3-Block-Aufbereitung gegen den Source-Artikeltext.

Zwei Dimensionen:

1. FAITHFULNESS: Enthält der Writeup Behauptungen, die im Source-Text NICHT belegbar sind?
   - Beispiele für Verstösse: erfundene Modellnamen, erfundene Zahlen, erfundene Firmen/Partnerschaften, behauptete Benchmarks ohne Beleg, Schlussfolgerungen über Strategien, die im Text nicht stehen.
   - Erlaubt: Einordnung in bekannte Strömungen (z.B. "Anthropic dreht X" ist OK, wenn der Text das nahelegt), Build-Vorschläge die über den Text hinausgehen (Block 3 ist per Design ein Anstoss).
   - Score 5 = vollständig belegbar; Score 1 = mehrere Halluzinationen.

2. STYLE: Hält sich der Writeup an die Tonalität-Regeln des Deliver-Prompts?
   - Verboten: PO-/Stakeholder-/Sprint-Sprache, Marketing-Floskeln ohne Beleg, generische "KI verändert X"-Sätze, Schablonen wie "Build-vs-Buy verschiebt sich".
   - Verboten in Block 3 (Build-Anker): Hedging ("könnte man", "liesse sich"), Kernel-Builds, eigenes Modelltraining, Hardware-Setup.
   - Score 5 = nüchtern und konkret; Score 1 = voller Marketing/Hedging.

Wenn unklar, ob etwas belegbar ist: lieber als Hallucination markieren. Falsch-Positiv kostet weniger als Falsch-Negativ.

Gib das Urteil über das submit_judgement-Tool zurück.

<article_title>${articleTitle}</article_title>
<article_url>${articleUrl}</article_url>

<source_text>
${sourceText.slice(0, 4000)}
</source_text>

<writeup>
${writeupText}
</writeup>`;

const JUDGE_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    faithfulness_score: { type: 'integer', minimum: 1, maximum: 5 },
    style_score: { type: 'integer', minimum: 1, maximum: 5 },
    hallucinations: {
      type: 'array',
      description: 'Konkrete Aussagen im Writeup, die im Source-Text nicht belegbar sind.',
      items: { type: 'string' },
    },
    style_issues: {
      type: 'array',
      description: 'Konkrete Stil-Verstösse (Floskeln, Marketing-Sprech, Hedging).',
      items: { type: 'string' },
    },
    summary: { type: 'string', description: 'Ein Satz Gesamteinschätzung.' },
  },
  required: ['faithfulness_score', 'style_score', 'hallucinations', 'style_issues', 'summary'],
};

// ─── Summary-Parser ──────────────────────────────────────────────────────────

/**
 * Zerlegt eine summary-YYYY-MM-DD.md-Datei in einzelne Artikel-Writeups.
 * Splittet pro HTML-Comment-Marker und extrahiert den Text bis zum nächsten
 * `---`-Separator oder Marker.
 */
function splitSummary(markdown) {
  const blocks = [];
  const metaRe = /<!-- ki-news-meta: (.*?) -->/g;
  const matches = [...markdown.matchAll(metaRe)];

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : markdown.length;
    const section = markdown.slice(start, end);

    let meta;
    try { meta = JSON.parse(matches[i][1]); } catch { continue; }
    if (!meta?.url) continue;

    // 3-Block-Writeup beginnt nach der "Score X/5 · [quelle](url)"-Zeile
    // und den beiden Checkbox-Zeilen.
    const writeupStart = section.search(/\*\*Was ist neu\*\*/);
    if (writeupStart === -1) continue;
    const writeupEnd = section.search(/\n---\n/);
    const writeup = section
      .slice(writeupStart, writeupEnd === -1 ? undefined : writeupEnd)
      .trim();

    blocks.push({ url: meta.url, titel: meta.titel, quelle: meta.quelle, score: meta.score, writeup });
  }
  return blocks;
}

// ─── Source-Text-Lookup aus SQLite ───────────────────────────────────────────

function fetchSourceTexts(urls) {
  const db = new Database(DB_FILE, { readonly: true, fileMustExist: true });
  const stmt = db.prepare('SELECT url, rohtext FROM articles WHERE url = ?');
  const result = new Map();
  for (const url of urls) {
    const row = stmt.get(url);
    if (row) result.set(url, row.rohtext || '');
  }
  db.close();
  return result;
}

// ─── Eval-Runner ─────────────────────────────────────────────────────────────

async function judgeOne(block, sourceText) {
  const banned = detectBannedPhrases(block.writeup);
  let judgement = null;
  let judgeError = null;
  if (!sourceText) {
    return { ...block, banned_phrases: banned, judgement: null, judge_error: 'no_source_text' };
  }
  try {
    judgement = await claudeStructured({
      model: SCORE_MODEL,
      messages: [{
        role: 'user',
        content: JUDGE_PROMPT({
          sourceText, writeupText: block.writeup,
          articleTitle: block.titel, articleUrl: block.url,
        }),
      }],
      toolName: 'submit_judgement',
      toolDescription: 'Reicht das Eval-Urteil für eine einzelne Artikel-Aufbereitung ein.',
      schema: JUDGE_TOOL_SCHEMA,
      maxTokens: 1000,
      timeoutMs: API_TIMEOUT_MS,
      logTag: 'deliver-eval',
    });
  } catch (err) {
    judgeError = err.message;
  }
  return { ...block, banned_phrases: banned, judgement, judge_error: judgeError };
}

async function runWithConcurrency(items, fn, limit) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

function aggregate(results) {
  const judged = results.filter(r => r.judgement);
  const faith = judged.map(r => r.judgement.faithfulness_score);
  const style = judged.map(r => r.judgement.style_score);
  const mean = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  return {
    articles_total: results.length,
    articles_judged: judged.length,
    judge_failures: results.filter(r => r.judge_error).length,
    mean_faithfulness: mean(faith),
    mean_style: mean(style),
    faithfulness_floor: faith.length ? Math.min(...faith) : null,
    style_floor: style.length ? Math.min(...style) : null,
    articles_with_hallucinations: judged.filter(r => r.judgement.hallucinations.length > 0).length,
    articles_with_style_issues: judged.filter(r => r.judgement.style_issues.length > 0).length,
    articles_with_banned_phrases: results.filter(r => r.banned_phrases.length > 0).length,
    banned_phrase_hits_total: results.reduce((sum, r) => sum + r.banned_phrases.length, 0),
  };
}

async function findRecentSummaries(n) {
  const files = await fs.readdir(REPO_ROOT);
  return files
    .filter(f => /^summary-\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse()
    .slice(0, n)
    .map(f => path.join(REPO_ROOT, f));
}

async function main() {
  requireEnv('ANTHROPIC_API_KEY');

  const argIdx = process.argv.indexOf('--last');
  const lastN = argIdx > -1 ? parseInt(process.argv[argIdx + 1], 10) || DEFAULT_LAST : DEFAULT_LAST;

  const summaryFiles = await findRecentSummaries(lastN);
  if (summaryFiles.length === 0) {
    console.error('Keine summary-*.md-Dateien gefunden.');
    process.exit(1);
  }
  console.log(`[eval] Bewerte ${summaryFiles.length} Daily-Summaries: ${summaryFiles.map(f => path.basename(f)).join(', ')}`);

  const allBlocks = [];
  for (const file of summaryFiles) {
    const content = await fs.readFile(file, 'utf-8');
    const blocks = splitSummary(content);
    const date = path.basename(file).match(/summary-(\d{4}-\d{2}-\d{2})/)[1];
    blocks.forEach(b => b.run_date = date);
    allBlocks.push(...blocks);
  }
  console.log(`[eval] ${allBlocks.length} Artikel-Writeups extrahiert`);

  const urls = allBlocks.map(b => b.url);
  const sourceTexts = fetchSourceTexts(urls);
  const missing = urls.filter(u => !sourceTexts.has(u));
  if (missing.length) console.log(`[eval] Warnung: ${missing.length} Source-Texte nicht in DB`);

  const results = await runWithConcurrency(
    allBlocks,
    (block) => judgeOne(block, sourceTexts.get(block.url) || ''),
    CONCURRENCY,
  );

  const agg = aggregate(results);
  console.log('\n─── Aggregat ─────────────────────────────────');
  console.log(`Artikel total:           ${agg.articles_total}`);
  console.log(`Davon gejudged:          ${agg.articles_judged}`);
  console.log(`Judge-Failures:          ${agg.judge_failures}`);
  console.log(`Faithfulness:            Ø ${agg.mean_faithfulness?.toFixed(2)} (min ${agg.faithfulness_floor})`);
  console.log(`Style:                   Ø ${agg.mean_style?.toFixed(2)} (min ${agg.style_floor})`);
  console.log(`Mit Halluzinationen:     ${agg.articles_with_hallucinations}/${agg.articles_judged}`);
  console.log(`Mit Stil-Problemen:      ${agg.articles_with_style_issues}/${agg.articles_judged}`);
  console.log(`Mit Banned-Phrases:      ${agg.articles_with_banned_phrases}/${agg.articles_total} (${agg.banned_phrase_hits_total} Hits gesamt)`);

  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const today = todayString();
  const outFile = path.join(RESULTS_DIR, `deliver-eval-${today}.json`);
  await fs.writeFile(outFile, JSON.stringify({
    ran_at: new Date().toISOString(),
    judge_model: SCORE_MODEL,
    summary_files: summaryFiles.map(f => path.basename(f)),
    aggregate: agg,
    per_article: results,
    usage: getUsageSummary(),
  }, null, 2), 'utf-8');
  console.log(`\nDetailbericht: ${outFile}`);
}

main()
  .catch(err => { console.error('[fatal]', err.message); process.exit(1); })
  .finally(() => { https.globalAgent.destroy(); closeStore(); });
