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
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { loadEnv } from '../lib/env.js';
import { parseArticleSections } from '../lib/issue-format.js';
import { httpGet } from '../lib/http.js';
import { listDailyIssues } from './_shared.js';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const GOLD_FILE = path.join(REPO_ROOT, 'evals', 'goldstandard.json');
const DB_FILE = process.env.KI_NEWS_DB || path.join(REPO_ROOT, 'ki-news.db');

const TOKEN = process.env.GH_PAT || process.env.GITHUB_TOKEN;

const DRY_RUN = process.argv.includes('--dry-run');

if (!TOKEN) {
  console.error('GH_PAT oder GITHUB_TOKEN nicht gesetzt');
  process.exit(1);
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
  // parseArticleSections ordnet Block↔Meta positionssicher zu – ein defekter
  // Marker (meta=null) verschiebt keine Indizes und wird einfach übersprungen.
  const articles = [];
  for (const { meta, block } of parseArticleSections(body)) {
    if (!meta) continue;
    const checks = {};
    for (const [key, re] of Object.entries(CHECKBOX_PATTERNS)) {
      checks[key] = re.test(block);
    }
    if (!Object.values(checks).some(Boolean)) continue; // ungecheckte Artikel skippen
    articles.push({ ...meta, run_date: runDate, checks });
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

// Fallback: holt einen rudimentären Source-Text über lib/http.js – damit gelten
// SSRF-Schutz und Redirect-Limit auch hier (URLs stammen aus editierbaren
// Issue-Bodies eines öffentlichen Repos). Für Goldstandard reicht das simple
// Text-Extracting; wer mehr will, lässt vorher `node ingest.js` lokal laufen.
async function fetchUrlText(url, timeoutMs = 10_000) {
  try {
    const body = await httpGet(url, { timeoutMs });
    return body
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
  } catch {
    return null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[promote] ${DRY_RUN ? 'DRY-RUN — ' : ''}Lade Daily-Issues …`);
  const issues = await listDailyIssues(TOKEN);
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
