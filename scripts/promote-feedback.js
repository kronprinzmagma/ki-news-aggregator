#!/usr/bin/env node
/**
 * Promote-Feedback: konvertiert manuelle Lese-Checkboxen aus den GitHub-
 * Daily-Issues in Goldstandard-Einträge.
 *
 * Logik:
 *   "Besonders wertvoll" UND NICHT "Irrelevanter Inhalt"
 *      → human_score = 5  (Inhalt relevant, unabhängig von Aufbereitungsqualität)
 *   "Irrelevanter Inhalt" UND NICHT "Besonders wertvoll"
 *      → human_score = 1  (Inhalt irrelevant, unabhängig von Aufbereitungsqualität)
 *
 *   "Schlecht aufbereitet" ist ein separates Signal für die Deliver-Stufe
 *   (Writeup-Qualität) und blockiert die Goldstandard-Promotion NICHT mehr.
 *   Ein Artikel kann inhaltlich wertvoll sein und trotzdem schlecht aufbereitet.
 *
 *   "Besonders wertvoll" UND "Irrelevanter Inhalt" gleichzeitig → kein Promote
 *   (widersprüchlich).
 *
 *   "Später weiterverfolgen" allein wird NICHT promoted (zu weiches Signal).
 *
 * Idempotent: dedupliziert via URL gegen bestehende goldstandard.json.
 * Source-Text wird aus der SQLite-articles-Tabelle gezogen.
 *
 * Verwendung:
 *   GH_PAT=ghp_... node scripts/promote-feedback.js [--dry-run]
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { loadEnv } from '../lib/env.js';
import { parseArticleMetas } from '../lib/issue-format.js';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const GOLD_FILE = path.join(REPO_ROOT, 'evals', 'goldstandard.json');
const DB_FILE = process.env.KI_NEWS_DB || path.join(REPO_ROOT, 'ki-news.db');

// Forkbar: siehe lib/config.js für dasselbe Pattern.
const [DEFAULT_OWNER, DEFAULT_NAME] = (process.env.GITHUB_REPOSITORY || 'kronprinzmagma/ki-news-aggregator').split('/');
const REPO_OWNER = process.env.REPO_OWNER || DEFAULT_OWNER;
const REPO_NAME = process.env.REPO_NAME || DEFAULT_NAME;
const TOKEN = process.env.GH_PAT || process.env.GITHUB_TOKEN;

const DRY_RUN = process.argv.includes('--dry-run');

if (!TOKEN) {
  console.error('GH_PAT oder GITHUB_TOKEN nicht gesetzt');
  process.exit(1);
}

// ─── GitHub-Helpers ──────────────────────────────────────────────────────────

function ghRequest(pathSuffix) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com', path: pathSuffix, method: 'GET',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ki-news-promote-feedback',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`GitHub API ${res.statusCode}: ${data.slice(0, 200)}`));
        resolve(JSON.parse(data));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function listDailyIssues() {
  const all = [];
  let page = 1;
  while (true) {
    const batch = await ghRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/issues?state=all&per_page=100&page=${page}`);
    if (batch.length === 0) break;
    all.push(...batch.filter(i => !i.pull_request && /^KI Daily – \d{4}-\d{2}-\d{2}$/.test(i.title)));
    if (batch.length < 100) break;
    page++;
  }
  return all;
}

// ─── Checkbox-Parser ─────────────────────────────────────────────────────────

// Negative Labels wurden umbenannt (poorWriteup: "Schlecht aufbereitet" →
// "Zu kompliziert erklärt"; irrelevant: "Irrelevanter Inhalt" → "Thema nicht
// relevant"). Beide Varianten matchen, damit historische und neue Issues laufen.
const CHECKBOX_PATTERNS = {
  wertvoll:           /- \[[xX]\] Besonders wertvoll/,
  weiterverfolgen:    /- \[[xX]\] Später weiterverfolgen/,
  schlecht_aufbereitet: /- \[[xX]\] (?:Schlecht aufbereitet|Zu kompliziert erklärt)/,
  irrelevant:         /- \[[xX]\] (?:Irrelevanter Inhalt|Thema nicht relevant)/,
};

/**
 * Zerlegt einen Issue-Body in Artikel-Blöcke und liest pro Block die Metadaten
 * (aus HTML-Comment) plus den Checkbox-Zustand aus.
 */
function parseIssueArticles(body, runDate) {
  const articles = [];
  const metas = parseArticleMetas(body);
  if (metas.length === 0) return articles;

  // Zwischen den Metadaten-Markern liegen jeweils die Artikel-Blöcke (incl.
  // Checkboxen). Wir splitten nochmal am Marker selbst.
  const sections = body.split(/<!-- ki-news-meta: .*? -->/);
  // sections[0] = Header, sections[i+1] = Block nach i-tem Marker
  for (let i = 0; i < metas.length; i++) {
    const block = sections[i + 1] || '';
    const checks = {};
    for (const [key, re] of Object.entries(CHECKBOX_PATTERNS)) {
      checks[key] = re.test(block);
    }
    const anyChecked = Object.values(checks).some(Boolean);
    if (!anyChecked) continue; // Performance: ungecheckte Artikel direkt skippen
    articles.push({ ...metas[i], run_date: runDate, checks });
  }
  return articles;
}

// ─── Promote-Logik ───────────────────────────────────────────────────────────

function decidePromotion({ checks }) {
  if (checks.wertvoll && checks.irrelevant) return null; // widersprüchlich, ignorieren
  if (checks.wertvoll) return {
    human_score: 5,
    poor_writeup: checks.schlecht_aufbereitet || false,
    reason: checks.schlecht_aufbereitet
      ? 'wertvoll + schlecht aufbereitet (wichtiges Thema, Aufbereitung ungenügend)'
      : 'wertvoll',
  };
  if (checks.irrelevant) return {
    human_score: 1,
    poor_writeup: false,
    reason: 'irrelevant',
  };
  return null;
}

// ─── Source-Text-Lookup ──────────────────────────────────────────────────────

function fetchSourceTextsFromDb(urls) {
  try {
    const db = new Database(DB_FILE, { readonly: true, fileMustExist: true });
    const stmt = db.prepare('SELECT url, titel, quelle, datum, rohtext FROM articles WHERE url = ?');
    const result = new Map();
    for (const url of urls) {
      const row = stmt.get(url);
      if (row) result.set(url, row);
    }
    db.close();
    return result;
  } catch (err) {
    console.warn(`[promote] SQLite-DB nicht verfügbar (${err.code || err.message}) – versuche URL-Fetch-Fallback.`);
    return new Map();
  }
}

// Fallback: holt einen rudimentären Source-Text via plain HTTP-GET (kein
// HTML-Parsing). Für News-Sites mit RSS-vollem Content reicht es nicht, aber
// für Goldstandard ist es OK – das Modell kriegt zumindest minimal Kontext.
// Wer mehr will, lässt vorher `node ingest.js` lokal laufen.
function fetchUrlText(url, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'GET', headers: { 'User-Agent': 'ki-news-promote-feedback' } }, res => {
      // Redirect tolerant: bis zu 2 Hops.
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && !url._redirect2) {
        return fetchUrlText(res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href).then(resolve);
      }
      if (res.statusCode !== 200) return resolve(null);
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        // Sehr simples Text-Extracting: Tags raus, multiple Whitespace zusammen.
        const text = body
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 4000);
        resolve(text);
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.end();
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[promote] ${DRY_RUN ? 'DRY-RUN — ' : ''}Lade Daily-Issues …`);
  const issues = await listDailyIssues();
  console.log(`[promote] ${issues.length} Daily-Issues gefunden`);

  // Aktuellen Goldstandard laden
  let goldstandard;
  try {
    goldstandard = JSON.parse(await fs.readFile(GOLD_FILE, 'utf-8'));
  } catch {
    goldstandard = [];
  }
  const existingUrls = new Set(goldstandard.map(g => g.url));
  console.log(`[promote] ${goldstandard.length} bestehende Goldstandard-Einträge`);

  // Alle gecheckten Artikel über alle Issues sammeln
  const allChecked = [];
  for (const issue of issues) {
    const date = issue.title.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
    const articles = parseIssueArticles(issue.body || '', date);
    allChecked.push(...articles);
  }
  console.log(`[promote] ${allChecked.length} Artikel mit mindestens einem Häkchen`);

  // Promote-Entscheidung pro Artikel
  const candidates = [];
  let blockedByConflict = 0;
  let withPoorWriteup = 0;
  for (const a of allChecked) {
    const decision = decidePromotion(a);
    if (!decision) {
      if (a.checks.wertvoll && a.checks.irrelevant) blockedByConflict++;
      continue;
    }
    if (a.checks.schlecht_aufbereitet) withPoorWriteup++;
    if (existingUrls.has(a.url)) continue; // bereits im Goldstandard
    candidates.push({ ...a, ...decision });
  }
  console.log(`[promote] ${candidates.length} neue Promotion-Kandidaten`);
  if (blockedByConflict) console.log(`[promote]   blockiert: ${blockedByConflict} wegen wertvoll+irrelevant (widersprüchlich)`);
  if (withPoorWriteup) console.log(`[promote]   davon ${withPoorWriteup} mit "Schlecht aufbereitet" → trotzdem promoted, reason vermerkt`);

  if (candidates.length === 0) {
    console.log('[promote] Nichts zu promoten – fertig.');
    return;
  }

  // Source-Texte: erst SQLite, dann URL-Fetch-Fallback.
  const dbTexts = fetchSourceTextsFromDb(candidates.map(c => c.url));
  const promoted = [];
  let fetchedFromWeb = 0;
  for (const c of candidates) {
    let titel, datum, quelle, rohtext;
    const src = dbTexts.get(c.url);
    if (src) {
      titel = src.titel; datum = src.datum; quelle = src.quelle; rohtext = src.rohtext;
    } else {
      // Aus Issue-Meta haben wir titel/quelle/score; Fallback für rohtext: URL fetchen.
      titel = c.titel;
      quelle = c.quelle;
      datum = null;
      console.log(`[promote] Fetche Volltext für "${titel.slice(0, 60)}" …`);
      rohtext = await fetchUrlText(c.url);
      if (rohtext) fetchedFromWeb++;
      else rohtext = ''; // leerer Goldstandard-Eintrag ist akzeptabel, eval-Script kann skippen
    }
    promoted.push({
      titel,
      url: c.url,
      datum,
      quelle,
      rohtext,
      human_score: c.human_score,
      ...(c.poor_writeup ? { poor_writeup: true } : {}),
      promoted_from: { run_date: c.run_date, reason: c.reason, model_score: c.score },
    });
  }
  if (fetchedFromWeb > 0) {
    console.log(`[promote] ${fetchedFromWeb} Rohtexte via URL-Fetch-Fallback geholt`);
  }

  console.log(`\n[promote] ${promoted.length} neue Einträge:`);
  for (const p of promoted) {
    const flag = p.poor_writeup ? ' ⚠ wichtig, Aufbereitung ungenügend' : '';
    console.log(`  ${p.human_score}/5 — ${p.titel.slice(0, 60)} (${p.quelle})${flag}`);
  }

  const poorWriteupCases = promoted.filter(p => p.poor_writeup);
  if (poorWriteupCases.length > 0) {
    console.log('\n[promote] ⚠ ACHTUNG – wichtige Themen mit schlechter Aufbereitung:');
    console.log('[promote] Diese Artikel zeigen, wo der Deliver-Prompt versagt hat:');
    for (const p of poorWriteupCases) {
      console.log(`  → ${p.titel.slice(0, 70)}`);
      console.log(`     ${p.url}`);
    }
    console.log('[promote] Tipp: deliver_eval.js auf diese Artikel laufen lassen.');
  }

  if (DRY_RUN) {
    console.log('\n[promote] DRY-RUN: goldstandard.json NICHT geschrieben.');
    return;
  }

  const merged = [...goldstandard, ...promoted];
  await fs.writeFile(GOLD_FILE, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  console.log(`\n[promote] goldstandard.json aktualisiert: ${goldstandard.length} → ${merged.length} Einträge`);
}

main().catch(err => { console.error('[fatal]', err); process.exit(1); });
