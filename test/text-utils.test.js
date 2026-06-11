import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeHtmlEntities, sanitizeMarkdown, sanitizeUrl } from '../lib/text-utils.js';

test('decodeHtmlEntities decodiert doppelt encodierte Entities nicht doppelt', () => {
  // &amp;lt; ist encodiertes "&lt;" – darf NICHT zu "<" werden
  assert.equal(decodeHtmlEntities('&amp;lt;script&amp;gt;'), '&lt;script&gt;');
  assert.equal(decodeHtmlEntities('&amp;amp;'), '&amp;');
});

test('decodeHtmlEntities decodiert einfache Entities weiterhin korrekt', () => {
  assert.equal(decodeHtmlEntities('&lt;b&gt; &amp; &quot;x&quot; &#39;y&#39;'), '<b> & "x" \'y\'');
  assert.equal(decodeHtmlEntities('A&nbsp;B'), 'A B');
});

test('decodeHtmlEntities unterstützt Codepoints > 0xFFFF (Emoji)', () => {
  assert.equal(decodeHtmlEntities('&#128640;'), '🚀');
  assert.equal(decodeHtmlEntities('&#x1F680;'), '🚀');
});

test('sanitizeMarkdown escaped < gegen HTML-Injection', () => {
  assert.equal(sanitizeMarkdown('<script>alert(1)</script>'), '\\<script\\>alert\\(1\\)\\</script\\>');
  assert.equal(sanitizeMarkdown('<!-- böser kommentar -->'), '\\<!-- böser kommentar --\\>');
});

test('sanitizeMarkdown escaped weiterhin Markdown-Sonderzeichen und Newlines', () => {
  assert.equal(sanitizeMarkdown('a `b` *c*\nd'), 'a \\`b\\` \\*c\\* d');
  assert.equal(sanitizeMarkdown(null), '');
});

test('sanitizeUrl encodiert Klammern gegen Markdown-Link-Ausbruch', () => {
  assert.equal(
    sanitizeUrl('https://example.com/wiki/Foo_(bar)'),
    'https://example.com/wiki/Foo_%28bar%29'
  );
  assert.equal(
    sanitizeUrl('https://example.com/a)[evil](https://evil.com'),
    'https://example.com/a%29[evil]%28https://evil.com'
  );
});

test('sanitizeUrl lehnt Nicht-HTTPS und kaputte URLs weiterhin ab', () => {
  assert.equal(sanitizeUrl('http://example.com'), '#ungueltige-url');
  assert.equal(sanitizeUrl('javascript:alert(1)'), '#ungueltige-url');
  assert.equal(sanitizeUrl('kein url'), '#ungueltige-url');
  assert.equal(sanitizeUrl('https://example.com/pfad'), 'https://example.com/pfad');
});
