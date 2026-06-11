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
import { listDailyIssues, listWeeklyIssues } from './_shared.js';
import { loadEnv } from '../lib/env.js';

loadEnv();

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
  // Konsolidiert auf scripts/_shared.js (lib/github.js) statt eigener Paginierung.
  const [dailies, weeklies] = await Promise.all([
    listDailyIssues(TOKEN),
    listWeeklyIssues(TOKEN),
  ]);
  return [...dailies, ...weeklies];
}

async function getIssueHtmlBody(issueNumber) {
  const { body } = await ghRequest(
    `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNumber}`,
    'application/vnd.github.html+json',
  );
  const parsed = JSON.parse(body);
  return parsed.body_html || '';
}

// ─── Audio-Assets (Podcast) ────────────────────────────────────────────────────
// MP3s liegen als Assets der "podcast"-Release. Mapt Datum → { url, size }.
const AUDIO_RELEASE_TAG = 'podcast';

async function getAudioByDate() {
  const daily = new Map();
  const weekly = new Map(); // Key: Sonntags-Datum der Woche (weekly-YYYY-MM-DD.mp3)
  try {
    const { body } = await ghRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${AUDIO_RELEASE_TAG}`);
    const release = JSON.parse(body);
    for (const asset of release.assets || []) {
      const d = asset.name.match(/^daily-(\d{4}-\d{2}-\d{2})\.mp3$/);
      if (d) daily.set(d[1], { url: asset.browser_download_url, size: asset.size, updated: asset.updated_at });
      const w = asset.name.match(/^weekly-(\d{4}-\d{2}-\d{2})\.mp3$/);
      if (w) weekly.set(w[1], { url: asset.browser_download_url, size: asset.size, updated: asset.updated_at });
    }
    console.log(`[archive] ${daily.size} Daily- und ${weekly.size} Weekly-Audio-Folgen gefunden`);
  } catch (err) {
    console.log(`[archive] Keine Audio-Assets (${err.message})`);
  }
  return { daily, weekly };
}

// GitHub-Pages-Basis-URL für absolute Links im RSS-Feed. Override via PAGES_URL
// (z.B. bei Custom-Domain), sonst Projekt-Pages-Default.
const PAGES_URL = (process.env.PAGES_URL || `https://${REPO_OWNER}.github.io/${REPO_NAME}`).replace(/\/$/, '');

function rfc822(dateStr) {
  // dateStr: YYYY-MM-DD → 06:00 UTC (nach dem Daily-Lauf).
  return new Date(`${dateStr}T06:00:00Z`).toUTCString();
}

/**
 * Generischer Podcast-Feed-Builder für Daily- und Weekly-Feed.
 * episodes: [{ title, pageUrl, guid, date (YYYY-MM-DD für pubDate), desc, audio }]
 */
function buildPodcastFeed({ title, summary, feedFile, episodes }) {
  const items = episodes.map((e) => `    <item>
      <title>${escapeHtml(e.title)}</title>
      <link>${e.pageUrl}</link>
      <guid isPermaLink="false">${e.guid}</guid>
      <pubDate>${rfc822(e.date)}</pubDate>
      <description>${escapeHtml(e.desc)}</description>
      <itunes:summary>${escapeHtml(e.desc)}</itunes:summary>
      <enclosure url="${escapeHtml(e.audio.url)}" length="${e.audio.size}" type="audio/mpeg"/>
      <itunes:explicit>false</itunes:explicit>
    </item>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(title)}</title>
    <link>${PAGES_URL}/</link>
    <atom:link href="${PAGES_URL}/${feedFile}" rel="self" type="application/rss+xml"/>
    <language>de</language>
    <description>${escapeHtml(summary)} KI-generiert (Claude/Anthropic, OpenAI TTS). Hinweis nach EU AI Act Art. 50(4).</description>
    <itunes:author>ki-news-aggregator</itunes:author>
    <itunes:summary>${escapeHtml(summary)}</itunes:summary>
    <itunes:explicit>false</itunes:explicit>
    <itunes:category text="Technology"/>
    <itunes:image href="${PAGES_URL}/cover.png"/>
${items}
  </channel>
</rss>`;
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
.audio {
  display: flex;
  flex-direction: column;
  gap: .5rem;
  background: #f4f7ff;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1rem 1.2rem;
  margin-bottom: 1.5rem;
}
.audio audio { width: 100%; }
.audio .dl { font-size: .85rem; color: var(--muted); }
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

// "…" nur anhängen, wenn tatsächlich gekürzt wurde.
function teaserPreview(teaser, maxChars = 80) {
  if (!teaser) return '';
  if (teaser.length <= maxChars) return escapeHtml(teaser);
  return escapeHtml(teaser.slice(0, maxChars)) + '…';
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

// ─── Stats-Seite ─────────────────────────────────────────────────────────────
// Rendert assets/stats.json (vom Daily-Lauf via scripts/export-stats.js
// committet) als Kosten-/Qualitäts-Übersicht. Fehlt die Datei, wird die
// Seite einfach weggelassen.

function bar(value, max, color = 'var(--accent)') {
  const pct = max > 0 ? Math.max(1, Math.round((value / max) * 100)) : 0;
  return `<div style="background:#eef;border-radius:3px;height:10px;width:100%"><div style="background:${color};border-radius:3px;height:10px;width:${pct}%"></div></div>`;
}

function buildStatsPage(stats) {
  // Kosten pro Tag (Stages aufsummiert)
  const byDay = new Map();
  for (const r of stats.usage_daily) {
    const d = byDay.get(r.run_date) || { usd: 0, cache_read: 0, input: 0 };
    d.usd += r.usd;
    d.cache_read += r.cache_read;
    d.input += r.input_tokens;
    byDay.set(r.run_date, d);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-30);
  const maxUsd = Math.max(...days.map(([, d]) => d.usd), 0.01);
  const totalUsd = [...byDay.values()].reduce((s, d) => s + d.usd, 0);
  const totalCacheRead = stats.usage_daily.reduce((s, r) => s + r.cache_read, 0);
  const totalInput = stats.usage_daily.reduce((s, r) => s + r.input_tokens, 0);
  const cacheRate = totalInput + totalCacheRead > 0 ? totalCacheRead / (totalInput + totalCacheRead) : 0;

  const costRows = days.map(([date, d]) => `
    <tr><td style="white-space:nowrap">${date}</td><td style="width:55%">${bar(d.usd, maxUsd)}</td><td style="text-align:right">$${d.usd.toFixed(3)}</td></tr>`).join('');

  const maxSource = Math.max(...stats.issue_sources.map(s => s.articles), 1);
  const sourceRows = stats.issue_sources.map(s => `
    <tr><td style="white-space:nowrap">${escapeHtml(s.quelle)}</td><td style="width:45%">${bar(s.articles, maxSource, '#7c3aed')}</td><td style="text-align:right">${s.articles}</td><td style="text-align:right">Ø ${s.avg_score}</td></tr>`).join('');

  const adapterRows = stats.adapter_health.map(a => `
    <tr><td>${escapeHtml(a.adapter)}</td><td style="text-align:right">${a.total_fetched}</td><td style="text-align:right">${a.total_truncated}</td><td style="text-align:right">${a.error_runs > 0 ? `⚠ ${a.error_runs}` : '–'}</td></tr>`).join('');

  return `
<section class="section">
  <h2>Pipeline-Statistik (letzte ${stats.lookback_days} Tage)</h2>
  <article class="entry">
    <p><strong>${stats.issues}</strong> publizierte Issues · <strong>$${totalUsd.toFixed(2)}</strong> API-Kosten gesamt · Cache-Hit-Rate <strong>${(cacheRate * 100).toFixed(1)} %</strong></p>
    <h3>Kosten pro Tag (letzte 30 Lauftage)</h3>
    <table style="width:100%;border-collapse:collapse;font-size:.9rem">${costRows}</table>
    <h3>Artikel pro Quelle in den Issues</h3>
    <table style="width:100%;border-collapse:collapse;font-size:.9rem">
      <tr><th style="text-align:left">Quelle</th><th></th><th style="text-align:right">Artikel</th><th style="text-align:right">Score</th></tr>${sourceRows}
    </table>
    <h3>Adapter-Health (letzte 14 Läufe)</h3>
    <table style="width:100%;border-collapse:collapse;font-size:.9rem">
      <tr><th style="text-align:left">Adapter</th><th style="text-align:right">Artikel</th><th style="text-align:right">Truncated</th><th style="text-align:right">Fehler-Läufe</th></tr>${adapterRows}
    </table>
    <p style="color:var(--muted);font-size:.85rem">Stand: ${escapeHtml(stats.generated_at.slice(0, 16).replace('T', ' '))} UTC – Quelle: usage_log/adapter_health (SQLite), exportiert vom Daily-Lauf.</p>
  </article>
</section>`;
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
  // Nach Startdatum aus dem Range sortieren, nicht nach KW-Nummer – sonst
  // steht nach dem Jahreswechsel KW 52 über KW 01.
  const weekStart = w => (w.range.match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
  weeklies.sort((a, b) => weekStart(b).localeCompare(weekStart(a)));
  console.log(`[archive] ${dailies.length} Daily-Issues, ${weeklies.length} Weekly-Issues`);

  const { daily: audioByDate, weekly: weeklyAudioByDate } = await getAudioByDate();
  // Weekly → Audio-Mapping über das Wochenend-Datum (zweites Datum im Range).
  const weekEnd = w => { const ds = w.range.match(/\d{4}-\d{2}-\d{2}/g) || []; return ds[1] || ds[0] || null; };

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
        const audio = item.kind === 'daily'
          ? audioByDate.get(item.slug)
          : weeklyAudioByDate.get(weekEnd(item));
        const player = audio
          ? `<div class="audio"><strong>🎧 Audio-Version</strong><audio controls preload="none" src="${escapeHtml(audio.url)}"></audio><a class="dl" href="${escapeHtml(audio.url)}">herunterladen</a></div>`
          : '';
        const content = `<article class="entry">${player}${html}</article>`;
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
      <span class="meta">${teaserPreview(teasers.get(d.issue.number))}</span>
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
  ${weeklyAudioByDate.size > 0 ? `<p>🎧 <a href="feed-weekly.xml">Weekly-Podcast-Feed abonnieren</a></p>` : ''}
  <div class="list-grid">${weeklyList}</div>
</section>` : ''}

<section class="section">
  <h2>Daily Briefings (${dailies.length})</h2>
  ${audioByDate.size > 0 ? `<p>🎧 <a href="feed-daily.xml">Audio-Podcast-Feed abonnieren</a> – in Apple Podcasts, Overcast, Pocket Casts u. a. einfügen.</p>` : ''}
  <div class="list-grid">${dailyList}</div>
</section>`;

  // Stats-Seite aus assets/stats.json (falls vom Daily-Lauf exportiert).
  let statsLink = '';
  try {
    const stats = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'assets', 'stats.json'), 'utf-8'));
    await fs.writeFile(
      path.join(OUT_DIR, 'stats.html'),
      layout({ title: 'Pipeline-Statistik', content: buildStatsPage(stats), crumbs: [{ href: './', label: 'Archiv' }, { label: 'Statistik' }] }),
      'utf-8',
    );
    statsLink = `<p>📊 <a href="stats.html">Pipeline-Statistik</a> – Kosten, Cache-Hit-Rate, Quellen, Adapter-Health.</p>`;
    console.log('  ✓ stats.html');
  } catch {
    console.log('  – stats.html übersprungen (assets/stats.json fehlt)');
  }

  await fs.writeFile(
    path.join(OUT_DIR, 'index.html'),
    layout({ title: 'KI-News Archiv', content: indexContent.replace('</section>\n', `${statsLink}</section>\n`) }),
    'utf-8',
  );
  console.log(`  ✓ index.html`);

  // Podcast-RSS-Feeds (nur wenn Audio existiert).
  if (audioByDate.size > 0) {
    const episodes = dailies
      .filter(d => audioByDate.has(d.date))
      .map(d => ({
        title: d.issue.title,
        pageUrl: `${PAGES_URL}/daily/${d.date}.html`,
        guid: `ki-daily-${d.date}`,
        date: d.date,
        desc: teasers.get(d.issue.number) || `KI Daily vom ${d.date}.`,
        audio: audioByDate.get(d.date),
      }));
    await fs.writeFile(path.join(OUT_DIR, 'feed-daily.xml'), buildPodcastFeed({
      title: 'KI Daily – Audio',
      summary: 'Tägliches KI-News-Briefing als Audio, automatisch kuratiert.',
      feedFile: 'feed-daily.xml',
      episodes,
    }), 'utf-8');
    console.log(`  ✓ feed-daily.xml (${episodes.length} Folgen)`);
  }
  if (weeklyAudioByDate.size > 0) {
    const episodes = weeklies
      .filter(w => weeklyAudioByDate.has(weekEnd(w)))
      .map(w => ({
        title: w.issue.title,
        pageUrl: `${PAGES_URL}/weekly/kw-${w.week.padStart(2, '0')}.html`,
        guid: `ki-weekly-${weekEnd(w)}`,
        date: weekEnd(w),
        desc: teasers.get(w.issue.number) || w.issue.title,
        audio: weeklyAudioByDate.get(weekEnd(w)),
      }));
    await fs.writeFile(path.join(OUT_DIR, 'feed-weekly.xml'), buildPodcastFeed({
      title: 'KI Weekly – Audio',
      summary: 'Wöchentlicher KI-Digest als Audio, Synthese der Daily-Briefings.',
      feedFile: 'feed-weekly.xml',
      episodes,
    }), 'utf-8');
    console.log(`  ✓ feed-weekly.xml (${episodes.length} Folgen)`);
  }

  // Podcast-Cover (Pflicht für Apple/Spotify-Verzeichnisse, itunes:image im Feed).
  try {
    await fs.copyFile(path.join(REPO_ROOT, 'assets', 'cover.png'), path.join(OUT_DIR, 'cover.png'));
    console.log('  ✓ cover.png');
  } catch (err) {
    console.warn(`  ✗ cover.png nicht kopiert (${err.message}) – assets/cover.png via scripts/make-cover.js erzeugen`);
  }

  // Disable Jekyll-Processing (sonst kollidieren _site und Markdown-Conventions).
  await fs.writeFile(path.join(OUT_DIR, '.nojekyll'), '', 'utf-8');

  console.log(`\n[archive] Fertig. ${all.length + 1} HTML-Files in ${OUT_DIR}`);
}

main().catch(err => { console.error('[fatal]', err); process.exit(1); });
