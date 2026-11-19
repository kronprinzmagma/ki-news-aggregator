export function decodeHtmlEntities(text) {
  // &amp; MUSS als letztes ersetzt werden, sonst wird doppelt encodiertes
  // "&amp;lt;" fälschlich zu "<" decodiert (Double-Decoding).
  // fromCodePoint statt fromCharCode: Codepoints > 0xFFFF (z.B. Emoji) korrekt.
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

export function stripTags(html) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function extractCdata(str) {
  const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(str);
  return cdata ? cdata[1].trim() : str.trim();
}

export function sanitizeMarkdown(str) {
  // < zusätzlich escapen: verhindert HTML-/Kommentar-Injection ins Issue.
  // GitHub-Markdown rendert "\<" als literales "<".
  return (str || '').replace(/[`*_[\]()#><]/g, '\\$&').replace(/\n/g, ' ');
}

export function sanitizeUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return '#ungueltige-url';
    // Klammern encodieren, damit ")" nicht aus dem Markdown-Link [titel](url) ausbricht.
    return url.replace(/\(/g, '%28').replace(/\)/g, '%29');
  } catch { return '#ungueltige-url'; }
}

// Unsichtbare Zeichen, mit denen sich Anweisungen im Quelltext verstecken lassen:
// Zero-Width- und Join-Zeichen, Bidi-Steuerzeichen, weiches Trennzeichen, BOM,
// Variation Selectors und der Unicode-Tag-Block (U+E0000–U+E007F).
const UNSICHTBARE_ZEICHEN = /[­᠎​-‏‪-‮⁠-⁤⁦-⁯︀-️﻿]|[\u{E0000}-\u{E007F}]|[\u{E0100}-\u{E01EF}]/gu;

/**
 * Bereitet fremden Artikeltext fuer einen LLM-Prompt auf (Prompt-Injection-Schutz):
 * Unicode-Normalisierung (NFKC), unsichtbare Zeichen und Tag-Zeichen entfernen,
 * HTML-Kommentare und HTML-Tags samt Attributen (z. B. alt-Text) entfernen,
 * Markdown-Bilder (moeglicher Exfiltrationskanal) entfernen. Dadurch kann der
 * Text auch die Prompt-Tags wie </artikel_text> nicht mehr schliessen.
 */
export function sanitizeSourceText(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(UNSICHTBARE_ZEICHEN, '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Ein nicht geschlossenes <!-- darf den Rest des Artikeltexts nicht löschen.
    .replace(/<!--/g, ' ')
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}
