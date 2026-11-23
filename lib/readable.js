import { parseHTML } from 'linkedom';
import { Defuddle } from 'defuddle/node';
import { stripTags } from './text-utils.js';

// Haupttext einer Webseite mit der gepflegten Bibliothek defuddle (MIT)
// herausziehen; linkedom (ISC) liefert das DOM in Node. Die eigenen
// Suchmuster in adapters/_base.js bleiben als Rückfall.
//
// Sicherheit: `useAsync: false` verhindert, dass defuddle für bestimmte Seiten
// (YouTube, X, Reddit …) selbst weitere URLs abruft. So bleibt jeder Abruf beim
// SSRF-geschützten httpGet. Scripts im HTML werden von linkedom nicht ausgeführt.

// Blockgrenzen als Leerzeichen erhalten, damit Wörter nicht zusammenkleben.
const BLOCK_END = /<\/(p|h[1-6]|li|blockquote|pre|td|th|div|section|figcaption)>/gi;

function documentFor(html, url) {
  const { document } = parseHTML(html);
  // Polyfills wie in defuddles eigenem linkedom-Pfad.
  if (!document.styleSheets) document.styleSheets = [];
  if (document.defaultView && !document.defaultView.getComputedStyle) {
    document.defaultView.getComputedStyle = () => ({ display: '' });
  }
  if (url) {
    try { document.URL = url; } catch { /* nur für relative Links nötig */ }
  }
  return document;
}

/**
 * @returns {Promise<string>} Fliesstext des Hauptinhalts, '' bei Fehler.
 */
export async function extractReadableText(html, url, { maxLength = 8000 } = {}) {
  if (!html) return '';
  try {
    const result = await Defuddle(documentFor(html, url), url, { useAsync: false, removeImages: true });
    const content = (result?.content || '').replace(BLOCK_END, '$& ');
    return stripTags(content).slice(0, maxLength);
  } catch (err) {
    console.warn(`[readable] defuddle fehlgeschlagen für ${url || 'unbekannte URL'}, Rückfall auf Suchmuster: ${err.message}`);
    return '';
  }
}

/**
 * Ganzer Seitentext ohne Hauptinhalt-Erkennung. Scripts, Styles, noscript und
 * template entfernt der DOM-Parser (linkedom) statt eines eigenen Suchmusters;
 * so fallen auch Schreibweisen wie `</script >` sicher weg (CodeQL
 * js/bad-tag-filter).
 * @returns {string} Fliesstext, '' bei leerer Eingabe oder Parserfehler.
 */
export function htmlToPlainText(html, { maxLength = 4000 } = {}) {
  if (!html) return '';
  try {
    // Leeres Gerüst plus innerHTML: linkedom parst so auch Fragmente ohne <html>.
    const { document } = parseHTML('<!doctype html><html><head></head><body></body></html>');
    document.body.innerHTML = String(html);
    for (const el of document.querySelectorAll('script, style, noscript, template')) el.remove();
    return stripTags(document.body.innerHTML).slice(0, maxLength);
  } catch (err) {
    console.warn(`[readable] HTML-Parser fehlgeschlagen, leerer Text: ${err.message}`);
    return '';
  }
}
