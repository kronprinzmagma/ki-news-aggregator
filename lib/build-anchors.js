// Extraktion + Persistenz der Build-Anker aus den 3-Block-Aufbereitungen.
//
// Build-Anker ist der dritte Block jeder Artikel-Aufbereitung im Daily –
// ein konkreter, in 2–4h mit Claude Code umsetzbarer Bauvorschlag. Über
// Monate wächst daraus eine durchsuchbare Sammlung von Abend-Projekten.

import fs from 'fs/promises';
import path from 'path';

const DIR = 'build-anchors';

/**
 * Zieht den "Build-Anker"-Block aus einer 3-Block-Aufbereitung.
 * Liefert den reinen Text (ohne den Marker selbst) oder null wenn
 * der Block nicht gefunden wurde.
 *
 * Toleriert mehrere Output-Varianten:
 *   "**Build-Anker** (1–2 Sätze): <text>"
 *   "**Build-Anker**: <text>"
 *   "**Build-Anker**\n<text>"   ← real beobachteter Default
 */
export function extractBuildAnchor(writeup) {
  if (!writeup) return null;
  const idx = writeup.search(/\*\*Build-Anker\*\*/i);
  if (idx === -1) return null;
  const after = writeup.slice(idx).replace(/^\*\*Build-Anker\*\*/i, '');
  // Optional folgenden Klammer-Hinweis und/oder Doppelpunkt + Whitespace entfernen.
  const cleaned = after
    .replace(/^\s*\([^)]*\)/, '')
    .replace(/^\s*:/, '')
    .replace(/^[\s\n]+/, '');
  // Stop am Section-Separator (---) oder am nächsten Block-Marker / Blockquote-
  // Insert ("> Lies auch", neuer `**…**` Block), damit Cross-Artikel-Inhalt
  // nicht hereinblutet, wenn jemand das gegen einen Issue-Body laufen lässt.
  const stopRe = /\n+(?:---|\n>|\*\*[A-Z])/;
  const stop = cleaned.search(stopRe);
  const trimmed = stop === -1 ? cleaned : cleaned.slice(0, stop);
  const result = trimmed.trim();
  return result.length > 0 ? result : null;
}

/**
 * URL-/Filesystem-taugliche Slug-Variante des Titels.
 */
export function slugify(title) {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // diakritika
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Schreibt einen Build-Anker als Markdown-File mit Frontmatter.
 * Returnt den relativen Pfad oder null wenn nichts zu schreiben war.
 */
export async function writeBuildAnchor({ article, writeup, date, repoRoot = '.' }) {
  const anchor = extractBuildAnchor(writeup);
  if (!anchor) return null;
  const slug = slugify(article.titel);
  if (!slug) return null;

  const filename = `${date}-${slug}.md`;
  const dir = path.join(repoRoot, DIR);
  const filepath = path.join(dir, filename);
  await fs.mkdir(dir, { recursive: true });

  const escapedTitle = (article.titel || '').replace(/"/g, '\\"');
  const body = `---
date: ${date}
source: ${article.quelle}
score: ${article.score}
article_url: ${article.url}
article_title: "${escapedTitle}"
---

# Build-Anker

${anchor}

---

*Aus dem [KI Daily vom ${date}](https://github.com/kronprinzmagma/ki-news-aggregator/issues?q=KI+Daily+${date}).*
*Quelle: [${article.titel}](${article.url}) (${article.quelle}, Score ${article.score}/5)*
`;
  await fs.writeFile(filepath, body, 'utf-8');
  return path.join(DIR, filename);
}

/**
 * Schreibt einen Index aller bestehenden Build-Anker. Wird vom Daily-Run
 * nach jedem Write aktualisiert. Sortierung: neueste zuerst.
 */
export async function writeBuildAnchorIndex({ repoRoot = '.' } = {}) {
  const dir = path.join(repoRoot, DIR);
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null; // Verzeichnis existiert (noch) nicht
  }
  const files = entries.filter(f => /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f));
  if (files.length === 0) return null;

  // Parse Frontmatter für die Index-Liste
  const items = [];
  for (const file of files) {
    const content = await fs.readFile(path.join(dir, file), 'utf-8');
    const fmMatch = content.match(/^---\n([\s\S]+?)\n---/);
    if (!fmMatch) continue;
    const fm = Object.fromEntries(
      fmMatch[1].split('\n').map(line => {
        const i = line.indexOf(':');
        return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')];
      })
    );
    items.push({ file, fm });
  }
  items.sort((a, b) => b.fm.date.localeCompare(a.fm.date) || b.file.localeCompare(a.file));

  const bySource = {};
  for (const it of items) {
    bySource[it.fm.source] = (bySource[it.fm.source] || 0) + 1;
  }
  const sourceLine = Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .map(([s, c]) => `${s} (${c})`).join(' · ');

  const lines = [
    '# Build-Anker — Sammlung',
    '',
    `Konkrete Abend-Projekte mit Claude Code, die aus den täglichen [KI-News-Briefings](https://github.com/kronprinzmagma/ki-news-aggregator/issues?q=is%3Aissue+%22KI+Daily%22) extrahiert wurden. Jeder Anker ist so geschnitten, dass er in 2–4 Stunden mit Claude Code umsetzbar ist – keine Wochenprojekte, keine Hardware-Setups.`,
    '',
    `**${items.length} Einträge** · Top-Quellen: ${sourceLine}`,
    '',
    '## Liste',
    '',
  ];

  for (const it of items) {
    lines.push(`- **${it.fm.date}** — [${it.fm.article_title}](${it.file}) · *${it.fm.source} · Score ${it.fm.score}*`);
  }
  lines.push('');

  const indexPath = path.join(dir, 'README.md');
  await fs.writeFile(indexPath, lines.join('\n'), 'utf-8');
  return path.join(DIR, 'README.md');
}
