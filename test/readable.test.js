import assert from 'node:assert/strict';
import test from 'node:test';
import { htmlToPlainText } from '../lib/readable.js';

test('htmlToPlainText entfernt Script und Style, auch mit Schlusstag-Varianten (CodeQL js/bad-tag-filter)', () => {
  const html = `<!doctype html><html><head><style>p{color:red}</style></head><body>
    <p>Erster Absatz &amp; mehr</p>
    <script>versteckt()</script >
    <SCRIPT>auchVersteckt()</SCRIPT
      foo>
    <noscript>Bitte JavaScript aktivieren</noscript>
    <p>Zweiter&nbsp;Absatz</p>
  </body></html>`;
  assert.equal(htmlToPlainText(html), 'Erster Absatz & mehr Zweiter Absatz');
});

test('htmlToPlainText trennt Blöcke mit Leerzeichen, kürzt auf maxLength und verträgt Fragmente', () => {
  assert.equal(htmlToPlainText('<p>a</p><p>b</p>'), 'a b');
  assert.equal(htmlToPlainText('nur Text'), 'nur Text');
  assert.equal(htmlToPlainText('<p>abcdef</p>', { maxLength: 3 }), 'abc');
  assert.equal(htmlToPlainText('<p>offen <script>nie geschlossen'), 'offen');
  assert.equal(htmlToPlainText(''), '');
  assert.equal(htmlToPlainText(null), '');
});
