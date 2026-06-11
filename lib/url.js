// URL-Normalisierung für Dedup: Tracking-Parameter, Hash und Trailing-Slash
// entfernen, damit dieselbe Seite über verschiedene Quellen als Duplikat erkannt wird.
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('utm_')) u.searchParams.delete(key);
    }
    u.hash = '';
    return u.href.replace(/\/$/, '');
  } catch { return url; }
}
