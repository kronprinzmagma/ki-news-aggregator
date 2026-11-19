#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { loadEnv, requireEnv } from '../lib/env.js';
import { githubRequest, ghPath } from '../lib/github.js';

export function planIssueClosures(issues, now = new Date()) {
  const cutoff = now.getTime() - 7 * 86400000;
  const today = now.toISOString().slice(0, 10);
  const eligible = issues.filter(issue => !issue.pull_request);
  const weekly = eligible.map(issue => ({ issue, end: /^KI Weekly – KW \d+ \(\d{4}-\d{2}-\d{2} – (\d{4}-\d{2}-\d{2})\)$/.exec(issue.title)?.[1] }))
    .filter(row => row.end && row.end <= today && Number.isFinite(Date.parse(row.end)));
  const retained = new Set([...new Set(weekly.map(row => row.end))].sort().reverse().slice(0, 14));
  return eligible.filter(issue => /^KI Daily – \d{4}-\d{2}-\d{2}$/.test(issue.title) && Date.parse(issue.created_at) < cutoff)
    .map(issue => ({ number: issue.number, reason: 'Daily älter als sieben Tage' }))
    .concat(weekly.filter(row => !retained.has(row.end)).map(row => ({ number: row.issue.number, reason: 'Weekly ausserhalb der letzten 14 Wochenrückblicke' })));
}

async function main() {
  loadEnv();
  const token = process.env.GH_PAT || requireEnv('GH_TOKEN');
  const issues = new Map();
  for (const label of ['summary', 'weekly-digest']) {
    for (let page = 1; ; page++) {
      const response = await githubRequest(token, 'GET', ghPath.issues(`?state=open&labels=${label}&per_page=100&page=${page}`));
      if (response.status !== 200) throw new Error(`Issues nicht lesbar: HTTP ${response.status}`);
      const rows = JSON.parse(response.body);
      rows.forEach(issue => issues.set(issue.number, issue));
      if (rows.length < 100) break;
    }
  }
  for (const { number, reason } of planIssueClosures([...issues.values()])) {
    const response = await githubRequest(token, 'PATCH', ghPath.issue(number), { state: 'closed', state_reason: 'completed' });
    if (response.status !== 200) throw new Error(`Issue #${number} nicht archiviert: HTTP ${response.status}`);
    console.log(`[issue-archive] #${number}: ${reason}; Inhalt unverändert.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
