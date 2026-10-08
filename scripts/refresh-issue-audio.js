#!/usr/bin/env node
import https from 'node:https';
import { pathToFileURL } from 'node:url';
import { loadEnv, requireEnv } from '../lib/env.js';
import { githubRequest, ghPath } from '../lib/github.js';
import { parseArticleSections } from '../lib/issue-format.js';
import { generateDailyAudio, generateWeeklyAudio } from '../lib/audio.js';
import { runWithConcurrency } from '../lib/concurrency.js';

export function parseIssueForAudio(issue) {
  const body = (issue.body || '').replace(/🎧 \*\*Audio-Version:\*\*[^\n]*\n?/g, '').split('<details>')[0];
  const daily = /^KI Daily – (\d{4}-\d{2}-\d{2})$/.exec(issue.title);
  if (daily) {
    const sections = parseArticleSections(body).filter(s => s.meta);
    if (!sections.length) throw new Error(`Daily #${issue.number} enthält keine Artikel zum Vertonen.`);
    const first = body.indexOf('<!-- ki-news-meta:');
    const ueberblick = body.slice(0, first).replace(/^#.*$|^>.*$|^---$/gm, '').trim();
    return {
      type: 'daily', date: daily[1], ueberblick,
      topArtikel: sections.map(({ meta, block }) => ({ ...meta, display_title: /^### (.+)$/m.exec(block)?.[1] || meta.titel })),
      aufbereitungen: sections.map(({ block }) => {
        const start = block.indexOf('**Was ist neu**');
        if (start < 0) throw new Error(`Daily #${issue.number}: Aufbereitung fehlt.`);
        return block.slice(start).split('\n---')[0].trim();
      }),
    };
  }
  const weekly = /^KI Weekly – KW (\d+) \((\d{4}-\d{2}-\d{2}) – (\d{4}-\d{2}-\d{2})\)$/.exec(issue.title);
  if (weekly) return { type: 'weekly', weekInfo: { kw: Number(weekly[1]), from: weekly[2], to: weekly[3] }, digestBody: body.replace(/^#.*$|^>.*$/gm, '').replace(/\*Am 8\. Oktober 2026[^*]*\*/g, '').trim() };
  throw new Error(`Issue #${issue.number} ist kein Daily oder Weekly.`);
}

export function parseIssueNumbers(value) {
  if (!/^\d+(?:,\d+)*$/.test(value || '')) throw new Error('Issue-Nummern als kommagetrennte Zahlen angeben.');
  const numbers = [...new Set(value.split(',').map(Number))];
  if (numbers.length > 25 || numbers.some(n => !Number.isSafeInteger(n) || n < 1)) throw new Error('Höchstens 25 gültige Issue-Nummern angeben.');
  return numbers;
}

async function readIssue(token, number) {
  const r = await githubRequest(token, 'GET', ghPath.issue(number));
  if (r.status !== 200) throw new Error(`Issue #${number} nicht lesbar: HTTP ${r.status}`);
  return JSON.parse(r.body);
}

async function main() {
  loadEnv(); requireEnv('ANTHROPIC_API_KEY'); requireEnv('OPENAI_API_KEY');
  const token = requireEnv('GH_PAT');
  const numbers = parseIssueNumbers(process.argv[2]);
  const outcomes = await runWithConcurrency(numbers, 3, async number => {
    try {
      const issue = await readIssue(token, number);
      const input = parseIssueForAudio(issue);
      const audio = input.type === 'daily'
        ? await generateDailyAudio({ ...input, token })
        : await generateWeeklyAudio({ ...input, token });
      if (!audio.audio_url) throw new Error(audio.error || audio.reason || 'Audio fehlt.');
      const fresh = await readIssue(token, number);
      if (fresh.body !== issue.body) throw new Error('Issue wurde während der Vertonung verändert; Audio-Link wird nicht eingesetzt.');
      const clean = issue.body.replace(/🎧 \*\*Audio-Version:\*\*[^\n]*\n?/g, '');
      const link = `🎧 **Audio-Version:** [anhören / herunterladen](${audio.audio_url}) · ~${Math.round(audio.est_duration_sec / 60)} Min.\n`;
      const lines = clean.split('\n');
      const disclaimer = lines.findIndex(line => line.startsWith('> 🤖'));
      lines.splice(disclaimer >= 0 ? disclaimer + 1 : 1, 0, '', link);
      const r = await githubRequest(token, 'PATCH', ghPath.issue(number), { body: lines.join('\n') });
      if (r.status !== 200) throw new Error(`Audio-Link nicht gespeichert: HTTP ${r.status}`);
      console.log(`[refresh-audio] #${number} erfolgreich (${audio.bytes} Bytes)`);
      return { number, ok: true };
    } catch (err) {
      console.error(`[refresh-audio] #${number}: ${err.message}`);
      return { number, ok: false, error: err.message };
    }
  });
  if (outcomes.some(r => !r.ok)) throw new Error(`Vertonung fehlgeschlagen: ${outcomes.filter(r => !r.ok).map(r => r.number).join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
  .catch(err => { console.error('[fatal]', err.message); process.exitCode = 1; })
  .finally(() => https.globalAgent.destroy());
