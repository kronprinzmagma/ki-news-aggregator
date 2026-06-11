#!/usr/bin/env node
/**
 * Feedback-Statistik: aggregiert die Checkbox-Signale aus allen Daily-Issues
 * pro Quelle. Grundlage für "Personalisierung light" – Quellen mit Häufung
 * von "Thema nicht relevant" sind Kandidaten für einen Score-Bias oder
 * Quellen-Review, "Zu kompliziert erklärt" zeigt Aufbereitungs-Schwächen.
 *
 * Bewusst NUR Report, kein automatischer Eingriff ins Scoring: bei der
 * aktuellen Datenmenge (<50 Häkchen) wäre alles andere Overfitting auf
 * Einzelklicks. Schwelle für Handlungsempfehlung: >= 5 Signale pro Quelle.
 *
 * Verwendung:
 *   GH_PAT=ghp_... node scripts/feedback-stats.js [--json]
 *   (--json: schreibt evals/results/feedback-stats.json)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from '../lib/env.js';
import { parseArticleSections } from '../lib/issue-format.js';
import { listDailyIssues } from './_shared.js';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.resolve(__dirname, '..', 'evals', 'results', 'feedback-stats.json');
const WRITE_JSON = process.argv.includes('--json');
const TOKEN = process.env.GH_PAT || process.env.GITHUB_TOKEN;
const ACTION_THRESHOLD = 5;

if (!TOKEN) {
  console.error('GH_PAT oder GITHUB_TOKEN nicht gesetzt');
  process.exit(1);
}

// Beide Label-Generationen matchen (vor/nach dem Rename).
const CHECKBOX_PATTERNS = {
  wertvoll: /- \[[xX]\] Besonders wertvoll/,
  weiterverfolgen: /- \[[xX]\] Später weiterverfolgen/,
  zu_kompliziert: /- \[[xX]\] (?:Schlecht aufbereitet|Zu kompliziert erklärt)/,
  irrelevant: /- \[[xX]\] (?:Irrelevanter Inhalt|Thema nicht relevant)/,
};

function emptyBucket() {
  return { artikel_total: 0, wertvoll: 0, weiterverfolgen: 0, zu_kompliziert: 0, irrelevant: 0 };
}

const issues = await listDailyIssues(TOKEN);
console.log(`[feedback-stats] ${issues.length} Daily-Issues geladen`);

const perSource = new Map();
let totalChecked = 0;

for (const issue of issues) {
  for (const { meta, block } of parseArticleSections(issue.body || '')) {
    if (!meta) continue;
    const bucket = perSource.get(meta.quelle) || emptyBucket();
    bucket.artikel_total++;
    let any = false;
    for (const [key, re] of Object.entries(CHECKBOX_PATTERNS)) {
      if (re.test(block)) { bucket[key]++; any = true; }
    }
    if (any) totalChecked++;
    perSource.set(meta.quelle, bucket);
  }
}

const rows = [...perSource.entries()]
  .map(([quelle, b]) => ({
    quelle, ...b,
    positiv: b.wertvoll + b.weiterverfolgen,
    negativ: b.zu_kompliziert + b.irrelevant,
  }))
  .sort((a, b) => b.artikel_total - a.artikel_total);

console.log(`[feedback-stats] ${totalChecked} Artikel mit mindestens einem Häkchen\n`);
console.log('Quelle                    Artikel  👍wertvoll  🔖später  😵kompliziert  🚫irrelevant');
for (const r of rows) {
  console.log(
    `${r.quelle.padEnd(26)}${String(r.artikel_total).padStart(7)}` +
    `${String(r.wertvoll).padStart(11)}${String(r.weiterverfolgen).padStart(10)}` +
    `${String(r.zu_kompliziert).padStart(14)}${String(r.irrelevant).padStart(13)}`
  );
}

const hints = [];
for (const r of rows) {
  if (r.irrelevant >= ACTION_THRESHOLD && r.irrelevant > r.positiv) {
    hints.push(`Quelle "${r.quelle}": ${r.irrelevant}× irrelevant vs. ${r.positiv} positiv – Kandidat für Score-Bias oder Quellen-Review.`);
  }
  if (r.zu_kompliziert >= ACTION_THRESHOLD) {
    hints.push(`Quelle "${r.quelle}": ${r.zu_kompliziert}× zu kompliziert – Deliver-Prompt für diese Quelle prüfen (deliver_eval.js).`);
  }
}
if (hints.length > 0) {
  console.log('\n[feedback-stats] Handlungs-Hinweise:');
  hints.forEach(h => console.log(`  → ${h}`));
} else {
  console.log(`\n[feedback-stats] Keine Quelle über der Handlungs-Schwelle (>= ${ACTION_THRESHOLD} Signale) – kein Eingriff empfohlen.`);
}

if (WRITE_JSON) {
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify({
    generated_at: new Date().toISOString(),
    issues_scanned: issues.length,
    articles_with_feedback: totalChecked,
    per_source: rows,
    hints,
  }, null, 2) + '\n', 'utf-8');
  console.log(`\n[feedback-stats] ${OUT_FILE} geschrieben`);
}
