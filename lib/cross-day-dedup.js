// Cross-Day-Dedup: vereinheitlichte Quelle für "wurde dieser Artikel in den
// letzten N Daily-Issues schon veröffentlicht?".
//
// Primärquelle: SQLite-issue_articles-Tabelle.
// Fallback: GitHub-Issues parsen (für ephemere Umgebungen wie GH-Actions, wo
// die DB pro Run leer startet).
//
// Genutzt von score.js (Pre-Dedup vor LLM) und deliver.js (Sicherheitsnetz).

import { articlesPublishedRecently } from './store.js';
import { extractArticleUrls } from './issue-format.js';
import { sharedTokens } from './topic-overlap.js';
import { githubRequest, ghPath } from './github.js';
import { REPO_SLUG, CROSS_DAY_TITLE_SIMILARITY_THRESHOLD } from './config.js';

/**
 * Lädt URLs + Titel der zuletzt publizierten Artikel.
 * Erst aus SQLite, dann Fallback auf das Parsen der GitHub-Issue-Bodies.
 */
export async function loadRecentlyPublished(token, lookbackDays) {
  const fromDb = articlesPublishedRecently(lookbackDays);
  if (fromDb.urls.size > 0) {
    return { urls: fromDb.urls, titles: fromDb.titles, source: 'sqlite' };
  }
  if (!token) return { urls: new Set(), titles: [], source: 'empty' };

  try {
    const { status, body } = await githubRequest(token, 'GET', ghPath.issues('?state=all&labels=&per_page=20'));
    if (status !== 200) return { urls: new Set(), titles: [], source: 'github-error' };
    const issues = JSON.parse(body);
    const kiDailyIssues = issues
      .filter(i => /^KI Daily – \d{4}-\d{2}-\d{2}$/.test(i.title))
      .slice(0, lookbackDays);
    const urls = new Set();
    const titles = [];
    const titlePattern = /^### (.+)$/gm;
    for (const issue of kiDailyIssues) {
      const issueBody = issue.body || '';
      for (const url of extractArticleUrls(issueBody)) urls.add(url);
      let m;
      while ((m = titlePattern.exec(issueBody)) !== null) {
        titles.push(m[1].replace(/\\([`*_[\]()#>])/g, '$1'));
      }
    }
    return { urls, titles, source: 'github' };
  } catch {
    return { urls: new Set(), titles: [], source: 'github-error' };
  }
}

/**
 * Findet einen ähnlichen Titel in einer Liste vorheriger Titel (Token-Overlap-
 * Schwelle aus Config). Liefert den gematchten Titel oder null.
 */
export function findSimilarTitle(article, previousTitles, threshold = CROSS_DAY_TITLE_SIMILARITY_THRESHOLD) {
  for (const prev of previousTitles) {
    if (sharedTokens(article.titel, prev).length >= threshold) return prev;
  }
  return null;
}

/**
 * Convenience: prüft URL-Match ODER Titel-Ähnlichkeit gegen ein
 * vorgeladenes Recently-Set. Liefert null oder { reason, matched_title }.
 */
export function detectCrossDayDuplicate(article, recent, threshold) {
  if (recent.urls.has(article.url)) return { reason: 'url', matched_title: null };
  const matched = findSimilarTitle(article, recent.titles, threshold);
  if (matched) return { reason: 'title_similarity', matched_title: matched };
  return null;
}
