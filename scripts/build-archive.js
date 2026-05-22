#!/usr/bin/env node
/**
 * Generiert die statische Pages-Site aus den GitHub Issues.
 *
 * - Daily-Issues ("KI Daily – YYYY-MM-DD") und Weekly-Issues
 *   ("KI Weekly – KW XX (…)") werden via GitHub Issues API geladen.
 * - HTML kommt vorgerendert vom GitHub-API (Accept: application/vnd.github.html).
 * - Ausgabe: _site/index.html, _site/daily/YYYY-MM-DD.html,
 *   _site/weekly/YYYY-WW.html.
 *
 * Verwendung:
 *   GH_PAT=ghp_... node scripts/build-archive.js
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, '_site');

// Forkbar: REPO_OWNER/REPO_NAME entweder explizit via Env oder aus dem
// GITHUB_REPOSITORY-Default (auf GH-Actions automatisch gesetzt).
const [DEFAULT_OWNER, DEFAULT_NAME] = (process.env.GITHUB_REPOSITORY || 'kronprinzmagma/ki-news-aggregator').split('/');
const REPO_OWNER = process.env.REPO_OWNER || DEFAULT_OWNER;
const REPO_NAME = process.env.REPO_NAME || DEFAULT_NAME;
const TOKEN = process.env.GH_PAT || process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('GH_PAT oder GITHUB_TOKEN nicht gesetzt');
  process.exit(1);
}

// ─── HTTP-Helper ─────────────────────────────────────────────────────────────

function ghRequest(pathSuffix, accept = 'application/vnd.github+json') {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: pathSuffix,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: accept,
        'User-Agent': 'ki-news-aggregator-archive-builder',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`GitHub API ${res.statusCode}: ${data.slice(0, 200)}`));
        resolve({ status: res.statusCode, body: data, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function listAllIssues() {
  const all = [];
  let page = 1;
  while (true) {
    const { body } = await ghRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/issues?state=all&per_page=100&page=${page}`);
    const batch = JSON.parse(body);
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return all.filter(i => !i.pull_request);
}

async function getIssueHtmlBody(issueNumber) {
  const { body } = await ghRequest(
    `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNumber}`,
    'application/vnd.github.html+json',
  );
  const parsed = JSON.parse(body);
  return parsed.body_html || '';
}

// ─── Klassifizierung ─────────────────────────────────────────────────────────

function classify(issue) {
  const daily = issue.title.match(/^KI Daily – (\d{4}-\d{2}-\d{2})$/);
  if (daily) return { kind: 'daily', date: daily[1] };
  const weekly = issue.title.match(/^KI Weekly – KW (\d+)\s*\(([^)]+)\)/);
  if (weekly) return { kind: 'weekly', week: weekly[1], range: weekly[2] };
  return null;
}

// ─── HTML-Layout ─────────────────────────────────────────────────────────────

const CSS = `
:root {
  --fg: #111;
  --muted: #666;
  --accent: #2563eb;
  --bg: #fafafa;
  --border: #e5e5e5;
  --card-bg: #fff;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  background: var(--bg);
  color: var(--fg);
  line-height: 1.55;
}
header.site {
  border-bottom: 1px solid var(--border);
  padding: 1.5rem 2rem;
  background: var(--card-bg);
}
header.site .inner {
  max-width: 820px;
  margin: 0 auto;
}
header.site h1 {
  margin: 0 0 .4rem;
  font-size: 1.5rem;
  font-weight: 700;
}
header.site h1 a { color: var(--fg); text-decoration: none; }
header.site p {
  margin: 0;
  color: var(--muted);
  font-size: .95rem;
}
main {
  max-width: 820px;
  margin: 2rem auto;
  padding: 0 2rem;
}
article.entry {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1.5rem 2rem;
  margin-bottom: 2rem;
}
article.entry h1, article.entry h2, article.entry h3 {
  line-height: 1.3;
}
article.entry h1 { font-size: 1.6rem; margin-top: 0; }
article.entry h3 { margin-top: 1.8rem; }
article.entry a { color: var(--accent); }
article.entry blockquote {
  border-left: 3px solid var(--border);
  margin: 1rem 0;
  padding: .25rem 0 .25rem 1rem;
  color: var(--muted);
}
article.entry img { max-width: 100%; }
article.entry pre {
  background: #f4f4f4;
  padding: .5rem 1rem;
  border-radius: 4px;
  overflow-x: auto;
}
article.entry code {
  background: #f4f4f4;
  padding: .1rem .3rem;
  border-radius: 3px;
  font-size: .9em;
}
article.entry .task-list-item input { margin-right: .5rem; }
.list-grid {
  display: grid;
  gap: .8rem;
}
.list-entry {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1rem 1.4rem;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
}
.list-entry a {
  color: var(--accent);
  text-decoration: none;
  font-weight: 500;
}
.list-entry a:hover { text-decoration: underline; }
.list-entry .meta {
  color: var(--muted);
  font-size: .85rem;
  white-space: nowrap;
}
.section {
  margin-bottom: 3rem;
}
.section h2 {
  font-size: 1.2rem;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--muted);
  margin-bottom: 1rem;
}
footer.site {
  max-width: 820px;
  margin: 4rem auto 2rem;
  padding: 1.5rem 2rem 0;
  border-top: 1px solid var(--border);
  font-size: .85rem;
  color: var(--muted);
}
footer.site a { color: var(--muted); }
nav.crumbs {
  margin-bottom: 1.5rem;
  font-size: .9rem;
}
nav.crumbs a { color: var(--accent); text-decoration: none; }
`;

function layout({ title, content, crumbs }) {
  const crumbsHtml = crumbs
    ? `<nav class="crumbs">${crumbs.map((c, i) => i < crumbs.length - 1 ? `<a href="${c.href}">${c.label}</a>` : `<span>${c.label}</span>`).join(' &rsaquo; ')}</nav>`
    : '';
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<header class="site">
  <div class="inner">
    <h1><a href="./">KI-News Aggregator</a></h1>
    <p>Tägliche und wöchentliche KI-News-Briefings – automatisch kuratiert mit Claude.</p>
  </div>
</header>
<main>
${crumbsHtml}
${content}
</main>
<footer class="site">
  <p>Code &amp; Pipeline: <a href="https://github.com/${REPO_OWNER}/${REPO_NAME}">github.com/${REPO_OWNER}/${REPO_NAME}</a> – generiert am ${new Date().toISOString().slice(0, 10)}.</p>
  <p>🤖 Alle Briefings sind KI-generiert (Claude/Anthropic). Hinweis nach EU AI Act Art. 50(4).</p>
</footer>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Erste 2–3 Sätze aus dem Issue-HTML-Body als Teaser.
function extractTeaser(html, maxChars = 280) {
  if (!html) return '';
  // Striktes Text-Extracting: erstes <p> nach dem Disclaimer-Blockquote.
  const stripped = html
    .replace(/<blockquote>[\s\S]*?<\/blockquote>/g, '') // disclaimer raus
    .replace(/<[^>]+>/g, ' ') // tags raus
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length <= maxChars) return stripped;
  const truncated = stripped.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  return truncated.slice(0, lastSpace) + '…';
}

// ─── Build ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('[archive] Lade Issues von GitHub …');
  const issues = await listAllIssues();
  console.log(`[archive] ${issues.length} Issues geladen`);

  const dailies = [];
  const weeklies = [];
  for (const issue of issues) {
    const cls = classify(issue);
    if (!cls) continue;
    if (cls.kind === 'daily') dailies.push({ issue, ...cls });
    if (cls.kind === 'weekly') weeklies.push({ issue, ...cls });
  }
  dailies.sort((a, b) => b.date.localeCompare(a.date));
  weeklies.sort((a, b) => parseInt(b.week, 10) - parseInt(a.week, 10));
  console.log(`[archive] ${dailies.length} Daily-Issues, ${weeklies.length} Weekly-Issues`);

  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(path.join(OUT_DIR, 'daily'), { recursive: true });
  await fs.mkdir(path.join(OUT_DIR, 'weekly'), { recursive: true });

  // Detail-Pages parallel rendern (sanft, max 5 gleichzeitig).
  const all = [...dailies.map(d => ({ ...d, kind: 'daily', slug: d.date })),
               ...weeklies.map(w => ({ ...w, kind: 'weekly', slug: `kw-${w.week.padStart(2, '0')}` }))];
  const teasers = new Map();

  const concurrency = 5;
  let i = 0;
  async function worker() {
    while (i < all.length) {
      const item = all[i++];
      try {
        const html = await getIssueHtmlBody(item.issue.number);
        const file = path.join(OUT_DIR, item.kind, `${item.slug}.html`);
        const crumbs = [
          { href: '../', label: 'Archiv' },
          { href: `./`, label: item.kind === 'daily' ? 'Daily' : 'Weekly' },
          { label: item.issue.title },
        ];
        const content = `<article class="entry">${html}</article>`;
        await fs.writeFile(file, layout({ title: item.issue.title, content, crumbs }), 'utf-8');
        teasers.set(item.issue.number, extractTeaser(html));
        console.log(`  ✓ ${item.kind}/${item.slug}.html`);
      } catch (err) {
        console.warn(`  ✗ ${item.issue.title}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  // Index-Page mit beiden Listen.
  const dailyList = dailies.map(d => `
    <div class="list-entry">
      <a href="daily/${d.date}.html">${escapeHtml(d.issue.title)}</a>
      <span class="meta">${teasers.get(d.issue.number) ? escapeHtml(teasers.get(d.issue.number).slice(0, 80)) + '…' : ''}</span>
    </div>`).join('');
  const weeklyList = weeklies.map(w => `
    <div class="list-entry">
      <a href="weekly/kw-${w.week.padStart(2, '0')}.html">${escapeHtml(w.issue.title)}</a>
    </div>`).join('');

  const indexContent = `
<section class="section">
  <h2>Über dieses Archiv</h2>
  <article class="entry">
    <p>Tägliche KI-News-Briefings, kuratiert aus 14 Quellen mit einer Claude-basierten Scoring- und Aufbereitungs-Pipeline. Jeden Morgen um 05:30 UTC läuft die Pipeline und veröffentlicht ein Issue im GitHub-Repository. Sonntags um 08:00 UTC kommt ein Wochen-Digest mit Synthese und kritischer Einordnung.</p>
    <p>Pro Artikel drei Blöcke: <em>was neu ist</em>, <em>was es für die KI-Richtung heisst</em>, <em>Build-Anker</em> (ein konkretes Abend-Projekt mit Claude Code). Output ist Schweizer Hochdeutsch, direkt, ohne PO-Sprech.</p>
    <p><a href="https://github.com/${REPO_OWNER}/${REPO_NAME}">→ Code &amp; Architektur auf GitHub</a></p>
  </article>
</section>

${weeklies.length > 0 ? `<section class="section">
  <h2>Weekly Digests</h2>
  <div class="list-grid">${weeklyList}</div>
</section>` : ''}

<section class="section">
  <h2>Daily Briefings (${dailies.length})</h2>
  <div class="list-grid">${dailyList}</div>
</section>`;

  await fs.writeFile(
    path.join(OUT_DIR, 'index.html'),
    layout({ title: 'KI-News Archiv', content: indexContent }),
    'utf-8',
  );
  console.log(`  ✓ index.html`);

  // Disable Jekyll-Processing (sonst kollidieren _site und Markdown-Conventions).
  await fs.writeFile(path.join(OUT_DIR, '.nojekyll'), '', 'utf-8');

  console.log(`\n[archive] Fertig. ${all.length + 1} HTML-Files in ${OUT_DIR}`);
}

main().catch(err => { console.error('[fatal]', err); process.exit(1); });
