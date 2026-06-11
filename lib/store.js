import Database from 'better-sqlite3';
import path from 'path';

const DB_FILE = process.env.KI_NEWS_DB || 'ki-news.db';

let _db = null;

function db() {
  if (_db) return _db;
  _db = new Database(DB_FILE);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  // Bei parallelem Zugriff (z.B. überlappende Läufe) bis zu 5s auf Locks warten
  // statt sofort mit SQLITE_BUSY zu scheitern.
  _db.pragma('busy_timeout = 5000');
  migrate(_db);
  return _db;
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      url TEXT PRIMARY KEY,
      titel TEXT NOT NULL,
      quelle TEXT NOT NULL,
      datum TEXT,
      rohtext TEXT,
      first_seen TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scores (
      url TEXT NOT NULL,
      run_date TEXT NOT NULL,
      score INTEGER,
      begründung TEXT,
      strategy_only INTEGER,
      PRIMARY KEY (url, run_date),
      FOREIGN KEY (url) REFERENCES articles(url) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS issues (
      run_date TEXT PRIMARY KEY,
      issue_url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS issue_articles (
      run_date TEXT NOT NULL,
      url TEXT NOT NULL,
      score INTEGER NOT NULL,
      quelle TEXT NOT NULL,
      titel TEXT NOT NULL,
      PRIMARY KEY (run_date, url),
      FOREIGN KEY (run_date) REFERENCES issues(run_date) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_issue_articles_url ON issue_articles(url);
    CREATE INDEX IF NOT EXISTS idx_scores_run_date ON scores(run_date);

    CREATE TABLE IF NOT EXISTS usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_date TEXT NOT NULL,
      stage TEXT NOT NULL,
      log_tag TEXT NOT NULL,
      model TEXT NOT NULL,
      calls INTEGER NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cache_read_input_tokens INTEGER NOT NULL,
      cache_creation_input_tokens INTEGER NOT NULL,
      usd REAL NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_usage_log_run_date ON usage_log(run_date);
    CREATE INDEX IF NOT EXISTS idx_usage_log_stage ON usage_log(stage);

    CREATE TABLE IF NOT EXISTS adapter_health (
      run_date TEXT NOT NULL,
      adapter TEXT NOT NULL,
      articles_fetched INTEGER NOT NULL,
      truncated_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (run_date, adapter)
    );

    CREATE INDEX IF NOT EXISTS idx_adapter_health_adapter ON adapter_health(adapter);
  `);
}

/**
 * Speichert einen geladenen Artikel (Ingest-Stufe).
 * Idempotent über die URL als Primary Key.
 */
export function upsertArticle({ url, titel, quelle, datum, rohtext }) {
  db().prepare(`
    INSERT INTO articles (url, titel, quelle, datum, rohtext)
    VALUES (@url, @titel, @quelle, @datum, @rohtext)
    ON CONFLICT(url) DO UPDATE SET
      titel = excluded.titel,
      quelle = excluded.quelle,
      datum = COALESCE(excluded.datum, articles.datum),
      rohtext = excluded.rohtext
  `).run({ url, titel, quelle, datum: datum || null, rohtext: rohtext || '' });
}

/** Speichert das Scoring eines Artikels für ein bestimmtes Laufdatum. */
export function upsertScore({ url, run_date, score, begründung, strategy_only }) {
  db().prepare(`
    INSERT INTO scores (url, run_date, score, begründung, strategy_only)
    VALUES (@url, @run_date, @score, @begründung, @strategy_only)
    ON CONFLICT(url, run_date) DO UPDATE SET
      score = excluded.score,
      begründung = excluded.begründung,
      strategy_only = excluded.strategy_only
  `).run({
    url, run_date,
    score: score ?? null,
    begründung: begründung ?? null,
    strategy_only: strategy_only === undefined ? null : (strategy_only ? 1 : 0),
  });
}

/** Speichert ein veröffentlichtes Issue und seine Artikel. */
export function recordIssue({ run_date, issue_url, articles }) {
  const database = db();
  const insertIssue = database.prepare(`
    INSERT INTO issues (run_date, issue_url) VALUES (?, ?)
    ON CONFLICT(run_date) DO UPDATE SET issue_url = excluded.issue_url
  `);
  const clearArticles = database.prepare('DELETE FROM issue_articles WHERE run_date = ?');
  const insertArticle = database.prepare(`
    INSERT INTO issue_articles (run_date, url, score, quelle, titel)
    VALUES (@run_date, @url, @score, @quelle, @titel)
  `);

  const tx = database.transaction(() => {
    insertIssue.run(run_date, issue_url);
    clearArticles.run(run_date);
    for (const a of articles) {
      insertArticle.run({ run_date, url: a.url, score: a.score, quelle: a.quelle, titel: a.titel });
    }
  });
  tx();
}

/**
 * Liefert URLs, die in den letzten lookbackDays Issues bereits publiziert wurden.
 * Ersetzt das Re-Parsing der Issue-Markdowns aus deliver.js.
 */
export function urlsPublishedRecently(lookbackDays = 3) {
  const rows = db().prepare(`
    SELECT DISTINCT ia.url
    FROM issue_articles ia
    JOIN issues i ON i.run_date = ia.run_date
    WHERE i.run_date IN (
      SELECT run_date FROM issues ORDER BY run_date DESC LIMIT ?
    )
  `).all(lookbackDays);
  return new Set(rows.map(r => r.url));
}

/**
 * Liefert URLs UND Titel der zuletzt publizierten Artikel für Cross-Day-Dedup
 * inkl. Titel-Ähnlichkeits-Check.
 *
 * `beforeDate` (YYYY-MM-DD) schliesst das Issue des laufenden Tages aus –
 * sonst matcht beim Rerun am selben Tag jeder Artikel als "bereits publiziert"
 * und das Issue-Upsert wird nie erreicht.
 */
export function articlesPublishedRecently(lookbackDays = 7, beforeDate = null) {
  const rows = db().prepare(`
    SELECT DISTINCT ia.url, ia.titel
    FROM issue_articles ia
    JOIN issues i ON i.run_date = ia.run_date
    WHERE i.run_date IN (
      SELECT run_date FROM issues
      WHERE @beforeDate IS NULL OR run_date < @beforeDate
      ORDER BY run_date DESC LIMIT @lookbackDays
    )
  `).all({ beforeDate, lookbackDays });
  return {
    urls: new Set(rows.map(r => r.url)),
    titles: rows.map(r => r.titel),
  };
}

/**
 * Persistiert das Usage-Summary einer Stage (score/deliver/weekly) als
 * eine Zeile pro {log_tag, model}. Ermöglicht Cost-Time-Series-Auswertung.
 */
export function recordUsage({ run_date, stage, by_log_tag }) {
  if (!Array.isArray(by_log_tag) || by_log_tag.length === 0) return;
  const database = db();
  const insert = database.prepare(`
    INSERT INTO usage_log
      (run_date, stage, log_tag, model, calls,
       input_tokens, output_tokens,
       cache_read_input_tokens, cache_creation_input_tokens, usd)
    VALUES
      (@run_date, @stage, @log_tag, @model, @calls,
       @input_tokens, @output_tokens,
       @cache_read_input_tokens, @cache_creation_input_tokens, @usd)
  `);
  const tx = database.transaction(() => {
    for (const b of by_log_tag) {
      insert.run({
        run_date, stage,
        log_tag: b.log_tag, model: b.model, calls: b.calls,
        input_tokens: b.input_tokens, output_tokens: b.output_tokens,
        cache_read_input_tokens: b.cache_read_input_tokens,
        cache_creation_input_tokens: b.cache_creation_input_tokens,
        usd: b.usd,
      });
    }
  });
  tx();
}

/**
 * Schreibt pro Adapter eine Zeile pro Ingest-Lauf. Erlaubt nachher
 * Stale-Detection und Trend-Analyse, wenn ein Adapter still abdriftet.
 */
export function recordAdapterHealth({ run_date, adapter, articles_fetched, truncated_count = 0, error_message = null }) {
  db().prepare(`
    INSERT INTO adapter_health (run_date, adapter, articles_fetched, truncated_count, error_message)
    VALUES (@run_date, @adapter, @articles_fetched, @truncated_count, @error_message)
    ON CONFLICT(run_date, adapter) DO UPDATE SET
      articles_fetched = excluded.articles_fetched,
      truncated_count = excluded.truncated_count,
      error_message = excluded.error_message
  `).run({ run_date, adapter, articles_fetched, truncated_count, error_message });
}

/**
 * Reicht nur den truncated_count für einen bestehenden Lauf nach, ohne
 * articles_fetched anzutasten. Der ursprüngliche Fetch-Count (vor Dedup/
 * Age-Filter) bleibt erhalten – sonst würde die Stale-Detection mit einem
 * fälschlich kleineren Wert arbeiten. Existiert die Zeile noch nicht, wird
 * sie mit articles_fetched = truncated_count als sicherer Untergrenze angelegt.
 */
export function recordAdapterTruncated({ run_date, adapter, truncated_count = 0 }) {
  db().prepare(`
    INSERT INTO adapter_health (run_date, adapter, articles_fetched, truncated_count)
    VALUES (@run_date, @adapter, @truncated_count, @truncated_count)
    ON CONFLICT(run_date, adapter) DO UPDATE SET
      truncated_count = excluded.truncated_count
  `).run({ run_date, adapter, truncated_count });
}

/**
 * Liefert Adapter, die in den letzten staleDays Läufen 0 Artikel
 * geliefert haben (oder geerrort haben). Voraussetzung: mindestens
 * `staleDays` Einträge pro Adapter, sonst kann nichts beurteilt werden.
 */
export function getStaleAdapters(staleDays = 3) {
  const rows = db().prepare(`
    SELECT adapter,
           COUNT(*) AS runs,
           SUM(articles_fetched) AS total_fetched,
           MAX(run_date) AS latest_run
    FROM adapter_health
    WHERE run_date IN (
      SELECT DISTINCT run_date FROM adapter_health
      ORDER BY run_date DESC LIMIT ?
    )
    GROUP BY adapter
    HAVING runs >= ? AND total_fetched = 0
  `).all(staleDays, staleDays);
  return rows;
}

export function closeStore() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export function dbPath() {
  return path.resolve(DB_FILE);
}
