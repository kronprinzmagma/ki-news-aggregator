import test from 'node:test';
import assert from 'node:assert/strict';
import { applySelection, inspectWriteup, validateReviewCoverage } from '../lib/editorial.js';
import { parseIssueForAudio, parseIssueNumbers } from '../scripts/refresh-issue-audio.js';
import { articleMeta } from '../lib/issue-format.js';
import { extractBuildAnchor } from '../lib/build-anchors.js';
import { parseDailyIssue } from '../weekly.js';
const candidates = Array.from({length:6},(_,i)=>({url:`https://example.com/${i}`,titel:`Artikel ${i}`,rohtext:'Quelle'}));
const chosen = a => ({url:a.url,headline:'Verständliche Nachricht',reason:'Alltagsnutzen'});

test('editorial selection limits volume and rejects fabricated or duplicate sources', () => {
  assert.throws(()=>applySelection(candidates,{articles:candidates.map(chosen)}),/Tageslimit/);
  assert.throws(()=>applySelection(candidates,{articles:[chosen(candidates[0]),chosen(candidates[0])]}),/doppelte/);
  assert.throws(()=>applySelection(candidates,{articles:[{url:'https://unknown.test/',headline:'Neu'}]}),/unbekannte/);
  assert.throws(()=>applySelection(candidates,{}),/Auswahl fehlt/);
  assert.deepEqual(applySelection(candidates,{articles:[]}),[]);
  assert.equal(applySelection(candidates,{articles:[chosen(candidates[0])]} )[0].rohtext,'Quelle');
});

test('review must cover every selected URL once, even if valid JSON is returned', () => {
  const articles=candidates.slice(0,2);
  assert.throws(()=>validateReviewCoverage(articles,{}),/nicht alle/);
  assert.throws(()=>validateReviewCoverage(articles,{selected_articles:[chosen(articles[0]),chosen(articles[0])]}),/doppelte/);
  assert.throws(()=>validateReviewCoverage(articles,{selected_articles:[chosen(articles[0]),chosen(candidates[2])]}),/fremde/);
  assert.equal(validateReviewCoverage(articles,{selected_articles:articles.map(chosen)}).length,2);
});

test('damaged or overly long output fails deterministic publication checks', () => {
  const text='**Was ist neu**\nEin neues Angebot.\n**Was es für die KI-Richtung heisst**\nEinfach testen.\n**Build-Anker**\nVergleiche zwei Antworten.';
  assert.deepEqual(inspectWriteup(text),[]);
  assert.ok(inspectWriteup(text+' '+ 'Wort '.repeat(300)).length);
  assert.ok(inspectWriteup(text+' Volltext nicht verfügbar').length);
  assert.ok(inspectWriteup(text+' Fr�hrente').length);
  assert.ok(inspectWriteup('Nur ein Absatz.').length);
});

test('fuller explanations and practical advice pass while legacy headings remain readable', () => {
  const text='**Was ist neu**\n'+ 'Erklärung '.repeat(120)+'\n**Was es für die KI-Richtung heisst**\n'+ 'Einordnung '.repeat(60)+'\n**Praktischer Hinweis**\n'+ 'Hinweis '.repeat(20);
  assert.deepEqual(inspectWriteup(text),[]);
  assert.deepEqual(inspectWriteup(text.replace('Praktischer Hinweis','Build-Anker')),[]);
  assert.ok(inspectWriteup(text.replace('**Praktischer Hinweis**','')).length);
});

test('audio refresh reads final daily text, omitting feedback and quality footer', () => {
  const a=candidates[0];
  const body='# KI Daily\n> 🤖 KI-generiert\n\nHeute eine Nachricht.\n---\n'+articleMeta(a)+'\n### Einfacher Titel\nScore 4/5 · [Quelle]('+a.url+')\n- [x] Besonders wertvoll\n**Was ist neu**\nBelegte Nachricht.\n**Was es für die KI-Richtung heisst**\nNutzen.\n**Build-Anker**\nTeste es.\n---\n<details>Internes Review</details>';
  const result=parseIssueForAudio({number:1,title:'KI Daily – 2026-10-07',body});
  assert.equal(result.topArtikel[0].display_title,'Einfacher Titel');
  assert.doesNotMatch(result.aufbereitungen[0],/Review|Besonders wertvoll|Score/);
  assert.equal(result.ueberblick,'Heute eine Nachricht.');
  assert.throws(()=>parseIssueForAudio({number:1,title:'KI Daily – 2026-10-07',body:''}),/keine Artikel/);
  assert.deepEqual(parseIssueNumbers('217,216,217'),[217,216]);
  assert.throws(()=>parseIssueNumbers('217;rm'),/Zahlen/);
});

test('weekly and practical-hint catalog retain the new third block and legacy anchors', () => {
  const a={...candidates[0],score:4,quelle:'Quelle'};
  for (const heading of ['Praktischer Hinweis','Build-Anker']) {
    const text=`**Was ist neu**\nBelegte Änderung.\n**Was es für die KI-Richtung heisst**\nVerständliche Einordnung.\n**${heading}**\nPrüfe die Berechtigungen.`;
    const body=articleMeta(a)+'\n### Nachricht\n'+text;
    assert.equal(parseDailyIssue('2026-10-07',body)[0].anker,'Prüfe die Berechtigungen.');
    assert.equal(extractBuildAnchor(text),'Prüfe die Berechtigungen.');
    assert.match(parseIssueForAudio({number:1,title:'KI Daily – 2026-10-07',body}).aufbereitungen[0],/Prüfe die Berechtigungen/);
  }
});
