export function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

export function stripTags(html) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function extractCdata(str) {
  const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(str);
  return cdata ? cdata[1].trim() : str.trim();
}

export function sanitizeMarkdown(str) {
  return (str || '').replace(/[`*_[\]()#>]/g, '\\$&').replace(/\n/g, ' ');
}

export function sanitizeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? url : '#ungueltige-url';
  } catch { return '#ungueltige-url'; }
}
