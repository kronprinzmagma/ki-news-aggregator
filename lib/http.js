import https from 'https';
import { USER_AGENT } from './config.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export function isSafeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname;
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host)) return false;
    return true;
  } catch { return false; }
}

function resolveLocation(location, base) {
  if (location.startsWith('http://') || location.startsWith('https://')) return location;
  if (location.startsWith('//')) return 'https:' + location;
  return new URL(location, base).href;
}

/**
 * GET-Helper mit SSRF-Schutz, Redirect-Limit, Response-Size-Cap und Timeout.
 * Wird von allen Adaptern genutzt – ersetzt 12 fast-identische Copy-Paste-Implementierungen.
 */
export function httpGet(url, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRedirects = DEFAULT_MAX_REDIRECTS,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  headers = {},
  enforceSafeUrl = true,
  _redirects = 0,
} = {}) {
  return new Promise((resolve, reject) => {
    if (enforceSafeUrl && !isSafeUrl(url)) {
      reject(new Error(`Unsichere URL blockiert: ${url}`));
      return;
    }

    const req = https.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/atom+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
        ...headers,
      },
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (_redirects >= maxRedirects) {
          reject(new Error(`Zu viele Redirects für ${url}`));
          return;
        }
        const nextUrl = resolveLocation(res.headers.location, url);
        if (enforceSafeUrl && !isSafeUrl(nextUrl)) {
          reject(new Error(`Redirect auf unsichere URL blockiert: ${nextUrl}`));
          return;
        }
        resolve(httpGet(nextUrl, { timeoutMs, maxRedirects, maxResponseBytes, headers, enforceSafeUrl, _redirects: _redirects + 1 }));
        return;
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} für ${url}`));
        return;
      }

      let data = '';
      let totalBytes = 0;
      res.on('data', chunk => {
        totalBytes += chunk.length;
        if (totalBytes > maxResponseBytes) {
          req.destroy(new Error(`Response zu gross (> ${Math.round(maxResponseBytes / 1024 / 1024)} MB) für ${url}`));
          return;
        }
        data += chunk;
      });
      res.on('end', () => resolve(data));
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout nach ${timeoutMs / 1000}s für ${url}`));
    });
    req.on('error', reject);
  });
}
