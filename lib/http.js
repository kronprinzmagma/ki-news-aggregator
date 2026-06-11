import dns from 'dns';
import https from 'https';
import net from 'net';
import { USER_AGENT } from './config.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

const BLOCKED_TARGETS = new net.BlockList();

const BLOCKED_IPV4_SUBNETS = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

BLOCKED_IPV4_SUBNETS.forEach(([address, prefix]) => {
  BLOCKED_TARGETS.addSubnet(address, prefix, 'ipv4');
  // IPv4-mapped IPv6 literals must follow the same policy without blocking
  // all public IPv4 addresses via the whole ::ffff:0:0/96 range.
  BLOCKED_TARGETS.addSubnet(`::ffff:${address}`, 96 + prefix, 'ipv6');
});

[
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],  // NAT64 – bettet IPv4 ein, würde sonst den IPv4-Filter umgehen
  ['100::', 64],
  ['2001::', 32],     // Teredo (nur /32, nicht 2001::/16 – das wäre zu breit)
  ['2001:db8::', 32],
  ['2002::', 16],     // 6to4 – bettet ebenfalls IPv4 ein
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
].forEach(([address, prefix]) => BLOCKED_TARGETS.addSubnet(address, prefix, 'ipv6'));

function stripIpv6Brackets(hostname) {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

export function isPrivateIpAddress(address) {
  const family = net.isIP(address);
  if (!family) return false;
  return BLOCKED_TARGETS.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

export function isSafeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = stripIpv6Brackets(parsed.hostname);
    if (!host || host === 'localhost' || host.endsWith('.localhost')) return false;
    if (net.isIP(host) && isPrivateIpAddress(host)) return false;
    return true;
  } catch { return false; }
}

export async function resolveSafeAddresses(hostname, lookup = dns.promises.lookup) {
  const host = stripIpv6Brackets(hostname);
  if (net.isIP(host)) {
    if (isPrivateIpAddress(host)) throw new Error(`Private Ziel-IP blockiert: ${host}`);
    return [{ address: host, family: net.isIP(host) }];
  }

  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length) throw new Error(`Keine Ziel-IP für ${host} gefunden`);

  for (const result of addresses) {
    if (!net.isIP(result.address)) throw new Error(`Ungültige Ziel-IP für ${host}: ${result.address}`);
    if (isPrivateIpAddress(result.address)) {
      throw new Error(`Private Ziel-IP blockiert: ${host} -> ${result.address}`);
    }
  }
  return addresses;
}

function approvedLookup(addresses) {
  return (_hostname, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (options?.all) {
      callback(null, addresses);
      return;
    }
    const first = addresses[0];
    callback(null, first.address, first.family);
  };
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
export async function httpGet(url, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRedirects = DEFAULT_MAX_REDIRECTS,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  headers = {},
  enforceSafeUrl = true,
  _redirects = 0,
} = {}) {
  let lookup;
  if (enforceSafeUrl) {
    if (!isSafeUrl(url)) {
      throw new Error(`Unsichere URL blockiert: ${url}`);
    }
    const parsed = new URL(url);
    lookup = approvedLookup(await resolveSafeAddresses(parsed.hostname));
  }

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      lookup,
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
        // Bei Hostwechsel keine Custom-Headers (z.B. X-Api-Key) an den fremden
        // Host weiterreichen – User-Agent/Accept werden ohnehin neu gesetzt.
        let nextHeaders = headers;
        try {
          if (new URL(nextUrl).hostname !== new URL(url).hostname) nextHeaders = {};
        } catch { nextHeaders = {}; }
        resolve(httpGet(nextUrl, { timeoutMs, maxRedirects, maxResponseBytes, headers: nextHeaders, enforceSafeUrl, _redirects: _redirects + 1 }));
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
