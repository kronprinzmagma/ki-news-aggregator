import https from 'https';
import { REPO_SLUG } from './config.js';

const GITHUB_TIMEOUT_MS = 30_000;

export function githubRequest(token, method, path, payload = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ki-news-aggregator',
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.setTimeout(GITHUB_TIMEOUT_MS, () => {
      req.destroy(new Error(`GitHub API Timeout nach ${GITHUB_TIMEOUT_MS / 1000}s`));
    });
    req.on('error', reject);
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
}

export const ghPath = {
  issues: (query = '') => `/repos/${REPO_SLUG}/issues${query}`,
  issue: (number) => `/repos/${REPO_SLUG}/issues/${number}`,
  searchIssues: (query) => `/search/issues?${query}`,
  releaseByTag: (tag) => `/repos/${REPO_SLUG}/releases/tags/${tag}`,
  releases: () => `/repos/${REPO_SLUG}/releases`,
  releaseAsset: (assetId) => `/repos/${REPO_SLUG}/releases/assets/${assetId}`,
};

// ─── Release-Assets (Audio-Hosting) ──────────────────────────────────────────
// MP3s werden als Assets einer rollierenden Release abgelegt (off-repo, gratis,
// stabile Download-URLs). Der Asset-Upload läuft über uploads.github.com mit
// Binär-Body – nicht über den JSON-githubRequest oben.

/**
 * Holt eine Release per Tag oder legt sie an, falls sie noch nicht existiert.
 * @returns {Promise<Object|null>} Release-Objekt (inkl. id, assets[]) oder null bei Fehler.
 */
export async function getOrCreateRelease(token, tag, name) {
  const existing = await githubRequest(token, 'GET', ghPath.releaseByTag(tag));
  if (existing.status === 200) {
    try { return JSON.parse(existing.body); } catch { return null; }
  }
  if (existing.status !== 404) {
    console.warn(`Release-Lookup fehlgeschlagen: HTTP ${existing.status}`);
    return null;
  }
  const created = await githubRequest(token, 'POST', ghPath.releases(), {
    tag_name: tag,
    name: name || tag,
    body: 'Audio-Assets der KI-News-Briefings (automatisch gepflegt).',
  });
  if (created.status === 201) {
    try { return JSON.parse(created.body); } catch { return null; }
  }
  console.warn(`Release-Erstellung fehlgeschlagen: HTTP ${created.status} – ${created.body.slice(0, 200)}`);
  return null;
}

export async function deleteReleaseAsset(token, assetId) {
  const { status } = await githubRequest(token, 'DELETE', ghPath.releaseAsset(assetId));
  return status === 204;
}

/**
 * Lädt einen Binär-Buffer als Release-Asset hoch. Existiert bereits ein Asset
 * mit gleichem Namen (Re-Run desselben Tages), wird es vorher gelöscht.
 * @returns {Promise<string|null>} browser_download_url oder null bei Fehler.
 */
export function uploadReleaseAsset(token, release, name, buffer, contentType = 'application/octet-stream') {
  return new Promise((resolve) => {
    const existing = (release.assets || []).find((a) => a.name === name);
    const doUpload = () => {
      const req = https.request(
        {
          hostname: 'uploads.github.com',
          path: `/repos/${REPO_SLUG}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
          method: 'POST',
          headers: {
            'Content-Type': contentType,
            'Content-Length': buffer.length,
            Authorization: `Bearer ${token}`,
            'User-Agent': 'ki-news-aggregator',
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            if (res.statusCode === 201) {
              try { resolve(JSON.parse(data).browser_download_url); return; } catch { /* fällt durch */ }
            }
            console.warn(`Asset-Upload fehlgeschlagen: HTTP ${res.statusCode} – ${data.slice(0, 200)}`);
            resolve(null);
          });
        }
      );
      req.setTimeout(GITHUB_TIMEOUT_MS * 4, () => req.destroy(new Error('Asset-Upload Timeout')));
      req.on('error', (err) => { console.warn(`Asset-Upload-Fehler: ${err.message}`); resolve(null); });
      req.write(buffer);
      req.end();
    };

    if (existing) {
      deleteReleaseAsset(token, existing.id).then(doUpload);
    } else {
      doUpload();
    }
  });
}
