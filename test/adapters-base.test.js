import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRss, parseAtom, enrichFromUrl, extractArticleText, httpGet, isRecent, isTransientHttpError, looksLikeConsentPage, withHostLimit } from '../adapters/_base.js';
import { parseSitemapNews, parseNewsPage } from '../adapters/anthropic.js';
import { parseBatchFeed } from '../adapters/thebatch.js';
import { cleanTeaser } from '../adapters/golem.js';
import { describeNetworkError } from '../lib/http.js';

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

const para = n => `<p>${'Ein ausreichend langer Absatz mit Inhalt zum Artikel. '.repeat(n)}</p>`;

test('isRecent: Fenster relativ zum Laufdatum, fehlendes Datum gilt als aktuell', () => {
  assert.equal(isRecent('2026-11-18T00:00:00Z', '2026-11-21'), true);
  assert.equal(isRecent('2026-11-17T23:59:59Z', '2026-11-21'), false);
  assert.equal(isRecent(null, '2026-11-21'), true);
  assert.equal(isRecent('kein datum', '2026-11-21'), true);
});

test('enrichFromUrl: alte Artikel lösen keinen Abruf aus, aktuelle schon', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return `<html><body>${para(10)}</body></html>`; };
  const old = { titel: 'Alt', url: 'https://example.com/alt', datum: '2026-01-01T00:00:00Z', rohtext: 'Teaser' };
  assert.equal(await enrichFromUrl(old, { runDate: '2026-11-21', fetchImpl }), old);
  assert.equal(calls, 0);
  const fresh = await enrichFromUrl({ ...old, datum: '2026-11-20T00:00:00Z' }, { runDate: '2026-11-21', fetchImpl });
  assert.equal(calls, 1);
  assert.ok(fresh.rohtext.length > 300);
});

test('enrichFromUrl: Einwilligungs-Seite ersetzt den Teaser nicht', async () => {
  const consent = `<html><body><p>Consent is not possible inside an iFrame. Open page in its own window. ${'Advertising and content can be personalised based on a profile. '.repeat(8)}</p></body></html>`;
  const article = { titel: 'Golem', url: 'https://example.com/g', datum: null, rohtext: 'Echter Teaser.' };
  assert.equal(await enrichFromUrl(article, { fetchImpl: async () => consent }), article);
  assert.equal(looksLikeConsentPage('Ein normaler Artikel über Cookies im Browser.'), false);
});

test('extractArticleText: leeres <article> vor dem Beitrag fällt auf das ganze Dokument zurück', () => {
  const html = `<html><body><article><p>kurz</p></article><div>${para(10)}</div></body></html>`;
  assert.ok(extractArticleText(html).length > 300);
  const scoped = `<html><body><p>${'Navigation und Randspalte mit viel Text drumherum. '.repeat(10)}</p><article>${para(10)}</article></body></html>`;
  assert.ok(!extractArticleText(scoped).includes('Randspalte'));
});

test('httpGet: ein Wiederholungsversuch bei vorübergehenden Fehlern, keiner bei 404', async () => {
  let calls = 0;
  const flaky = async () => { if (++calls === 1) throw new Error('Timeout nach 10s für https://example.com'); return 'ok'; };
  assert.equal(await httpGet('https://example.com', { fetchImpl: flaky, retryDelayMs: 1 }), 'ok');
  assert.equal(calls, 2);
  calls = 0;
  const missing = async () => { calls++; throw new Error('HTTP 404 für https://example.com'); };
  await assert.rejects(httpGet('https://example.com', { fetchImpl: missing, retryDelayMs: 1 }), /404/);
  assert.equal(calls, 1);
  assert.equal(isTransientHttpError(new Error('HTTP 429 für x')), true);
  assert.equal(isTransientHttpError(new Error('HTTP 503 für x')), true);
  assert.equal(isTransientHttpError(new Error('Unsichere URL blockiert: x')), false);
});

test('withHostLimit: nie mehr als das Limit gleichzeitig pro Host', async () => {
  let active = 0, peak = 0;
  const task = async () => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active--; return 1; };
  const results = await Promise.all(Array.from({ length: 12 }, () => withHostLimit('https://limit.example/a', task, 3)));
  assert.equal(results.length, 12);
  assert.equal(peak, 3);
});

test('describeNetworkError: AggregateError ohne Meldung bekommt Code und URL', () => {
  const err = describeNetworkError(new AggregateError([Object.assign(new Error('a'), { code: 'ETIMEDOUT' }), Object.assign(new Error('b'), { code: 'ENETUNREACH' })], ''), 'https://www.heise.de/x');
  assert.match(err.message, /ETIMEDOUT, ENETUNREACH.*heise\.de/);
  const named = new Error('Timeout nach 10s');
  assert.equal(describeNetworkError(named, 'https://x'), named);
});

test('anthropic: Sitemap liefert nur /news/-Beiträge, Übersichtsseiten ohne Datum fallen weg', () => {
  const xml = `<urlset><url><loc>https://www.anthropic.com/news/alt</loc><lastmod>2026-10-01T00:00:00Z</lastmod></url>
    <url><loc>https://www.anthropic.com/news/neu</loc><lastmod>2026-11-20T00:00:00Z</lastmod></url>
    <url><loc>https://www.anthropic.com/research/x</loc><lastmod>2026-11-20T00:00:00Z</lastmod></url>
    <url><loc>https://www.anthropic.com/news</loc></url></urlset>`;
  assert.deepEqual(parseSitemapNews(xml).map(e => e.url), ['https://www.anthropic.com/news/neu', 'https://www.anthropic.com/news/alt']);
  const page = `<html><head><title>Neu \\ Anthropic</title><meta property="og:title" content="Neues Modell &amp; mehr"><meta property="article:published_time" content="2026-11-20T00:00:00.000Z"></head><body>${para(10)}</body></html>`;
  const article = parseNewsPage(page, { url: 'https://www.anthropic.com/news/neu' });
  assert.equal(article.titel, 'Neues Modell & mehr');
  assert.equal(article.datum, '2026-11-20T00:00:00.000Z');
  assert.equal(article.quelle, 'anthropic');
  assert.ok(article.rohtext.length > 300);
  assert.equal(parseNewsPage(`<html><head><title>Announcements \\ Anthropic</title></head><body>${para(10)}</body></html>`, { url: 'https://www.anthropic.com/news/announcements' }), null);
});

test('thebatch: Volltext kommt aus content:encoded', () => {
  const xml = `<rss xmlns:content="x"><channel><item><title><![CDATA[Titel]]></title><link>https://charonhub.deeplearning.ai/a/</link>
    <pubDate>Fri, 20 Nov 2026 16:15:00 GMT</pubDate><description><![CDATA[Kurz.]]></description>
    <content:encoded><![CDATA[${para(10)}]]></content:encoded></item></channel></rss>`;
  const [article] = parseBatchFeed(xml);
  assert.equal(article.quelle, 'thebatch');
  assert.ok(article.rohtext.length > 300);
});

test('golem: Teaser ohne kodierte Themen-Links und Zählpixel', () => {
  const raw = 'Zwei Sätze Teaser. Mehr nicht. (<a href="https://www.golem.de/specials/claude/">Claude</a>, <a href="https://www.golem.de/specials/wissen/">Wissen</a>) <img src="https://cpx.golem.de/cpx.php?class=17&amp;aid=1" alt="" width="1" height="1" />';
  assert.equal(cleanTeaser(raw), 'Zwei Sätze Teaser. Mehr nicht. (Claude, Wissen)');
});
