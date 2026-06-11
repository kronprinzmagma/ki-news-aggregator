import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRss, parseAtom } from '../adapters/_base.js';

test('parseRss: Standard-Item mit CDATA', () => {
  const xml = `<rss><channel>
    <item>
      <title><![CDATA[Titel mit <b>Tags</b> & Ampersand]]></title>
      <link>https://example.com/a</link>
      <pubDate>Mon, 01 Jun 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>Ein Text.</p>]]></description>
    </item>
  </channel></rss>`;
  const articles = parseRss(xml, 'testquelle');
  assert.equal(articles.length, 1);
  assert.equal(articles[0].url, 'https://example.com/a');
  assert.equal(articles[0].quelle, 'testquelle');
  assert.ok(articles[0].datum.startsWith('2026-06-01'));
  assert.equal(articles[0].rohtext, 'Ein Text.');
});

test('parseRss: <item rdf:about> (RDF/RSS 1.0) wird erkannt', () => {
  const xml = `<rdf:RDF>
    <item rdf:about="https://example.com/b">
      <title>RDF-Artikel</title>
      <link>https://example.com/b</link>
    </item>
  </rdf:RDF>`;
  const articles = parseRss(xml, 'rdfquelle');
  assert.equal(articles.length, 1);
  assert.equal(articles[0].titel, 'RDF-Artikel');
});

test('parseRss: unparsebares Datum wird null', () => {
  const xml = `<rss><item><title>X</title><link>https://example.com/c</link><pubDate>kein datum</pubDate></item></rss>`;
  const articles = parseRss(xml, 'q');
  assert.equal(articles[0].datum, null);
});

test('parseAtom: <entry xml:lang> wird erkannt, rel="self" vor rel="alternate" gewinnt nicht', () => {
  const xml = `<feed>
    <entry xml:lang="de">
      <title>Atom-Artikel</title>
      <link rel="self" href="https://example.com/feed.xml"/>
      <link rel="alternate" href="https://example.com/artikel"/>
      <published>2026-06-01T10:00:00Z</published>
      <summary>Zusammenfassung.</summary>
    </entry>
  </feed>`;
  const articles = parseAtom(xml, 'atomquelle');
  assert.equal(articles.length, 1);
  assert.equal(articles[0].url, 'https://example.com/artikel');
});

test('parseAtom: href vor rel="alternate" (Attributreihenfolge egal)', () => {
  const xml = `<feed><entry>
    <title>T</title>
    <link href="https://example.com/x" rel="alternate"/>
  </entry></feed>`;
  assert.equal(parseAtom(xml, 'q')[0].url, 'https://example.com/x');
});

test('parseAtom: Link ohne rel-Attribut gilt als alternate', () => {
  const xml = `<feed><entry>
    <title>T</title>
    <link rel="edit" href="https://example.com/edit"/>
    <link href="https://example.com/artikel"/>
  </entry></feed>`;
  assert.equal(parseAtom(xml, 'q')[0].url, 'https://example.com/artikel');
});

test('parseAtom: fehlender Link → Entry wird übersprungen', () => {
  const xml = `<feed><entry><title>Nur Titel</title></entry></feed>`;
  assert.equal(parseAtom(xml, 'q').length, 0);
});
