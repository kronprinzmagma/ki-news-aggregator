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
