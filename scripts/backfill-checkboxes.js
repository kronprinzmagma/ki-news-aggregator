#!/usr/bin/env node
/**
 * DEPRECATED – einmalige Migration, gelaufen im Mai 2026. Nicht erneut
 * ausführen: das Script fügt die inzwischen UMBENANNTEN alten Checkbox-Labels
 * ("Schlecht aufbereitet", "Irrelevanter Inhalt") ein; aktuelle Issues nutzen
 * "Zu kompliziert erklärt" / "Thema nicht relevant". Nur mit --force lauffähig.
 *
 * Ursprünglicher Zweck: ergänzt die zwei (damals neuen) Feedback-Checkboxen
 * in allen bestehenden KI-Daily-Issues mit altem 2-Box-Format.
 *
 * Verwendung (historisch):
 *   GH_PAT=ghp_... node scripts/backfill-checkboxes.js [--dry-run]
 */

import https from 'https';
import { loadEnv } from '../lib/env.js';

loadEnv();

if (!process.argv.includes('--force')) {
  console.error('[backfill] DEPRECATED: einmalige Migration (Mai 2026), würde die ALTEN Checkbox-Labels einfügen.');
  console.error('[backfill] Falls du sicher bist, mit --force ausführen.');
  process.exit(1);
}

const [DEFAULT_OWNER, DEFAULT_NAME] = (process.env.GITHUB_REPOSITORY || 'kronprinzmagma/ki-news-aggregator').split('/');
const REPO_OWNER = process.env.REPO_OWNER || DEFAULT_OWNER;
const REPO_NAME = process.env.REPO_NAME || DEFAULT_NAME;
const TOKEN = process.env.GH_PAT || process.env.GITHUB_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');

if (!TOKEN) { console.error('GH_PAT/GITHUB_TOKEN nicht gesetzt'); process.exit(1); }

function gh(method, pathSuffix, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com', path: pathSuffix, method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ki-news-backfill-checkboxes',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`GitHub ${method} ${pathSuffix}: HTTP ${res.statusCode} – ${data.slice(0, 200)}`));
        resolve(data ? JSON.parse(data) : {});
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function listDailyIssues() {
  const all = [];
  let page = 1;
  while (true) {
    const batch = await gh('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/issues?state=all&per_page=100&page=${page}`);
    if (batch.length === 0) break;
    all.push(...batch.filter(i => !i.pull_request && /^KI Daily – \d{4}-\d{2}-\d{2}$/.test(i.title)));
    if (batch.length < 100) break;
    page++;
  }
  return all;
}

function migrateBody(body) {
  if (body.includes('Schlecht aufbereitet')) return null; // bereits migriert
  // Nach jeder "Später weiterverfolgen"-Zeile zwei neue Boxen einfügen.
  // Match egal ob Box [ ] oder [x].
  const re = /^(- \[[ xX]\] Später weiterverfolgen)$/gm;
  const replaced = body.replace(re, '$1\n- [ ] Schlecht aufbereitet\n- [ ] Irrelevanter Inhalt');
  if (replaced === body) return null; // Pattern nicht gefunden
  return replaced;
}

async function main() {
  console.log(`[backfill] ${DRY_RUN ? 'DRY-RUN — ' : ''}Lade Daily-Issues …`);
  const issues = await listDailyIssues();
  console.log(`[backfill] ${issues.length} Daily-Issues gefunden`);

  let migrated = 0;
  let skipped = 0;
  let unchanged = 0;

  for (const issue of issues) {
    const newBody = migrateBody(issue.body || '');
    if (newBody === null) {
      // Entweder schon migriert oder kein Pattern. Schauen ob "Schlecht aufbereitet" drin ist:
      if ((issue.body || '').includes('Schlecht aufbereitet')) {
        skipped++;
        continue;
      }
      unchanged++;
      console.log(`  - ${issue.title}: kein "Später weiterverfolgen"-Pattern gefunden`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  ✓ würde migrieren: ${issue.title} (${(issue.body.match(/Später weiterverfolgen/g) || []).length} Artikel-Blöcke)`);
      migrated++;
      continue;
    }
    try {
      await gh('PATCH', `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issue.number}`, { body: newBody });
      console.log(`  ✓ migriert: ${issue.title}`);
      migrated++;
    } catch (err) {
      console.error(`  ✗ ${issue.title}: ${err.message}`);
    }
  }

  console.log(`\n[backfill] Fertig: ${migrated} migriert, ${skipped} bereits aktuell, ${unchanged} ohne Pattern.`);
}

main().catch(err => { console.error('[fatal]', err); process.exit(1); });
