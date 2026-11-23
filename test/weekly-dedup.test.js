// Tests für das Lesen der Daily-Issues (Weekly) und die Cross-Day-Dedup.
// Synthetische Issue-Bodies, keine Netzaufrufe, keine DB.
import assert from 'node:assert/strict';
import test from 'node:test';
import { articleMeta } from '../lib/issue-format.js';
import { sanitizeMarkdown } from '../lib/text-utils.js';
import { findSimilarTitle, detectCrossDayDuplicate } from '../lib/cross-day-dedup.js';
import { normalizeUrl } from '../lib/url.js';
import { parseDailyIssue } from '../weekly.js';

const BLOECKE = '**Was ist neu**\nNeue Funktion.\n\n**Was es für die KI-Richtung heisst**\nEinordnung.\n\n**Praktischer Hinweis**\nHinweis.';

function dailyBody(articles) {
  return articles.map(a => [
    articleMeta(a),
    `### ${sanitizeMarkdown(a.titel)}`,
    '',
    `Score ${a.score}/5 · [${sanitizeMarkdown(a.quelle)}](${a.url})`,
    '',
    BLOECKE,
    '',
    '---',
  ].join('\n')).join('\n');
}

test('parseDailyIssue liest Artikel aus den ki-news-meta-Markern samt Blöcken', () => {
  const body = dailyBody([
    { titel: 'Erster Artikel', url: 'https://example.com/a', quelle: 'quelle-a', score: 5 },
    { titel: 'Zweiter Artikel', url: 'https://example.com/b', quelle: 'quelle-b', score: 4 },
  ]);
  const articles = parseDailyIssue('2099-01-01', body);
  assert.equal(articles.length, 2);
  assert.deepEqual(
    articles.map(a => [a.titel, a.url, a.quelle, a.score, a.datum]),
    [
      ['Erster Artikel', 'https://example.com/a', 'quelle-a', 5, '2099-01-01'],
      ['Zweiter Artikel', 'https://example.com/b', 'quelle-b', 4, '2099-01-01'],
    ],
  );
  assert.equal(articles[0].wasIstNeu, 'Neue Funktion.');
  assert.equal(articles[0].richtung, 'Einordnung.');
});

test('parseDailyIssue: Rückfall auf das Regex-Format ohne Marker entescapt den Titel vollständig', () => {
  const titel = 'Pfad C:\\temp und *Stern* <Tag> [Klammer]';
  const body = dailyBody([{ titel, url: 'https://example.com/c', quelle: 'q', score: 9 }])
    .replace(/<!-- ki-news-meta: .*? -->\n/, '');
  const [article] = parseDailyIssue('2099-01-02', body);
  assert.equal(article.titel, titel);
  assert.equal(article.score, 5, 'Score wird auf 1–5 begrenzt');
  assert.equal(article.url, 'https://example.com/c');
});

test('parseDailyIssue überspringt Abschnitte ohne Inhaltsblöcke', () => {
  const body = `${articleMeta({ titel: 'Leer', url: 'https://example.com/d', quelle: 'q', score: 4 })}\n### Leer\n\n---`;
  assert.deepEqual(parseDailyIssue('2099-01-03', body), []);
});

test('findSimilarTitle greift ab der Schwelle gemeinsamer Schlüsselwörter', () => {
  const previous = ['Anthropic veröffentlicht neues Claude Modell mit Gedächtnis'];
  assert.equal(
    findSimilarTitle({ titel: 'Neues Claude Modell von Anthropic mit Gedächtnis' }, previous, 3),
    previous[0],
  );
  assert.equal(findSimilarTitle({ titel: 'Völlig anderes Thema über Datenbanken' }, previous, 3), null);
});

test('detectCrossDayDuplicate erkennt URL-Varianten und ähnliche Titel', () => {
  const recent = {
    urls: new Set([normalizeUrl('https://example.com/artikel')]),
    titles: ['Anthropic veröffentlicht neues Claude Modell mit Gedächtnis'],
  };
  assert.deepEqual(
    detectCrossDayDuplicate({ titel: 'x', url: 'https://example.com/artikel/?utm_source=feed#oben' }, recent, 3),
    { reason: 'url', matched_title: null },
  );
  assert.equal(
    detectCrossDayDuplicate({ titel: 'Neues Claude Modell von Anthropic mit Gedächtnis', url: 'https://example.org/neu' }, recent, 3).reason,
    'title_similarity',
  );
  assert.equal(detectCrossDayDuplicate({ titel: 'Datenbanken', url: 'https://example.org/z' }, recent, 3), null);
});
