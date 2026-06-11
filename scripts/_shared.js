// Gemeinsame Helfer für die scripts/: GitHub-Zugriffe laufen über lib/github.js
// statt pro Script eigene HTTP-Implementierungen zu pflegen.
// (Kandidat für lib/, sobald auch die Pipeline selbst paginierte Listen braucht.)

import { githubRequest, ghPath } from '../lib/github.js';

const DAILY_TITLE = /^KI Daily – \d{4}-\d{2}-\d{2}$/;

/**
 * Listet alle Daily-Issues (Label "summary", Titel "KI Daily – YYYY-MM-DD"),
 * paginiert über alle Seiten.
 */
export async function listDailyIssues(token) {
  const all = [];
  let page = 1;
  while (true) {
    const { status, body } = await githubRequest(
      token, 'GET', ghPath.issues(`?state=all&labels=summary&per_page=100&page=${page}`)
    );
    if (status !== 200) throw new Error(`GitHub API ${status}: ${body.slice(0, 200)}`);
    const batch = JSON.parse(body);
    if (batch.length === 0) break;
    all.push(...batch.filter(i => !i.pull_request && DAILY_TITLE.test(i.title)));
    if (batch.length < 100) break;
    page++;
  }
  return all;
}

/** Wie listDailyIssues, aber für Weekly-Issues (Label "weekly-digest"). */
export async function listWeeklyIssues(token) {
  const all = [];
  let page = 1;
  while (true) {
    const { status, body } = await githubRequest(
      token, 'GET', ghPath.issues(`?state=all&labels=weekly-digest&per_page=100&page=${page}`)
    );
    if (status !== 200) throw new Error(`GitHub API ${status}: ${body.slice(0, 200)}`);
    const batch = JSON.parse(body);
    if (batch.length === 0) break;
    all.push(...batch.filter(i => !i.pull_request));
    if (batch.length < 100) break;
    page++;
  }
  return all;
}
