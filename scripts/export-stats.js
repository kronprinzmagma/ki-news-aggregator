#!/usr/bin/env node
/**
 * Exportiert Pipeline-Statistiken aus der SQLite-DB (ki-news.db) nach
 * assets/stats.json. Läuft im Daily-Workflow nach deliver und wird zusammen
 * mit den build-anchors committet – so hat der Pages-Build (der keine DB hat)
 * trotzdem aktuelle Zahlen für die Stats-Seite.
 *
 * Aggregiert (letzte 60 Tage):
 * - Kosten/Tokens pro Tag und Stage (usage_log) inkl. Cache-Hit-Rate
 * - Artikel pro Quelle in den Issues (issue_articles)
 * - Adapter-Health (Artikel pro Adapter, letzte 14 Läufe)
 *
 * Verwendung: node scripts/export-stats.js
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DB_FILE = process.env.KI_NEWS_DB || path.join(REPO_ROOT, 'ki-news.db');
const OUT_FILE = path.join(REPO_ROOT, 'assets', 'stats.json');

const LOOKBACK_DAYS = 60;

let db;
try {
  db = new Database(DB_FILE, { readonly: true, fileMustExist: true });
} catch (err) {
  console.warn(`[stats] DB nicht verfügbar (${err.code || err.message}) – kein Export.`);
  process.exit(0); // bewusst kein Fehler: ohne DB einfach No-Op
}

const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString().slice(0, 10);

const usageDaily = db.prepare(`
  SELECT run_date, stage,
         SUM(calls) AS calls,
         SUM(input_tokens) AS input_tokens,
         SUM(output_tokens) AS output_tokens,
         SUM(cache_read_input_tokens) AS cache_read,
         SUM(cache_creation_input_tokens) AS cache_creation,
         ROUND(SUM(usd), 4) AS usd
  FROM usage_log
  WHERE run_date >= ?
  GROUP BY run_date, stage
  ORDER BY run_date
`).all(cutoff);

const issueSources = db.prepare(`
  SELECT quelle, COUNT(*) AS articles, ROUND(AVG(score), 2) AS avg_score
  FROM issue_articles
  WHERE run_date >= ?
  GROUP BY quelle
  ORDER BY articles DESC
`).all(cutoff);

const adapterHealth = db.prepare(`
  SELECT adapter,
         COUNT(*) AS runs,
         SUM(articles_fetched) AS total_fetched,
         SUM(truncated_count) AS total_truncated,
         SUM(CASE WHEN error_message IS NOT NULL THEN 1 ELSE 0 END) AS error_runs
  FROM adapter_health
  WHERE run_date IN (
    SELECT DISTINCT run_date FROM adapter_health ORDER BY run_date DESC LIMIT 14
  )
  GROUP BY adapter
  ORDER BY total_fetched DESC
`).all();

const issueCount = db.prepare('SELECT COUNT(*) AS n FROM issues WHERE run_date >= ?').get(cutoff).n;

db.close();

const stats = {
  generated_at: new Date().toISOString(),
  lookback_days: LOOKBACK_DAYS,
  issues: issueCount,
  usage_daily: usageDaily,
  issue_sources: issueSources,
  adapter_health: adapterHealth,
};

await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
await fs.writeFile(OUT_FILE, JSON.stringify(stats, null, 2) + '\n', 'utf-8');
const totalUsd = usageDaily.reduce((s, r) => s + r.usd, 0);
console.log(`[stats] ${OUT_FILE} geschrieben – ${usageDaily.length} Tages-Stage-Zeilen, $${totalUsd.toFixed(2)} über ${LOOKBACK_DAYS} Tage.`);
