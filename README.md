# KI-News Aggregator

A fully automated pipeline that ingests AI-relevant articles from 14 sources daily, scores them with Claude, and publishes a curated briefing as a GitHub Issue — tailored for a senior product person moving towards building with AI.

---

## The problem this solves

Keeping up with AI developments as a practitioner is noisy. Most newsletters either bury signal in volume, or optimise for breadth over relevance. What's actually useful is a daily signal that answers three specific questions: *what capability shifted, what does it mean for where AI is heading, and what can I build with it tonight?*

This pipeline runs every morning at 05:30 UTC and produces exactly that — one GitHub Issue per day, written in a fixed three-block format per article, with a weekly synthesis on Sundays.

---

## What the pipeline does

Three stages run sequentially:

**1. Ingest** — 14 adapters fetch RSS/Atom feeds and normalise each article into a shared schema (`titel`, `url`, `datum`, `quelle`, `rohtext`). Adapters for a16z and Heise Online apply keyword filters before passing articles downstream; a NewsAPI adapter exists but is currently inactive. URL deduplication runs at this stage; individual source failures do not abort the run.

**2. Score** — Each article is sent to `claude-haiku-4-5-20251001` with a relevance rubric. High-relevance signals: model capability jumps, hands-on SDK/MCP/eval patterns, agentic architecture insights, strategic market shifts. Low-relevance signals: generic "AI transforms industry" pieces, pure VC announcements, undifferentiated Show HN posts. Output is structured JSON (`score 1–5`, `begründung`). Articles scoring ≥ 3 are persisted.

**3. Deliver** — Articles scoring ≥ 4 are processed by `claude-sonnet-4-6` into a fixed three-block format (what's new / what it means for AI direction / a concrete build anchor for an evening with Claude Code). A review loop checks every article on four dimensions — product relevance, technical substance, learning value, write-up quality — and rewrites any article flagged `needs_rewrite` before it enters the issue. The issue is published to GitHub; a Markdown summary and a JSON audit artefact are written to disk.

**Weekly** — A Sunday digest fetches the last 7 daily issues, deduplicates across days, and synthesises the week's Score-5 articles (plus 1–2 Score-4 picks) into a narrative: what happened, what it means, a critical framing.

---

## How it runs

```
05:30 UTC daily     →  ingest.js → score.js → deliver.js → GitHub Issue
08:00 UTC Sunday    →  weekly.js → GitHub Issue
```

A Watchdog workflow monitors the daily run and retriggers if the issue was not created. A Close-Old-Issues workflow archives stale issues automatically.

---

## Engineering notes

**Structured LLM output with schema validation.** Every Claude response that feeds downstream code is validated with Zod before use. Schema definitions live in `lib/schema.js`; malformed responses are caught at the boundary and logged, not silently dropped.

**Prompt caching for cost efficiency.** The scoring stage sends the system prompt — including the full relevance rubric — as an Anthropic `cache_control: ephemeral` prefix. Only the per-article content varies across calls. This significantly reduces token cost on days with high article volume.

**Rate limiting and retry.** The scoring stage caps at 5 parallel Claude API requests. 429 responses trigger exponential backoff via a shared retry wrapper in `lib/claude.js`. Retry logic is centralised and not duplicated across callers.

**Cross-day deduplication via SQLite.** `better-sqlite3` backs a local `ki-news.db`. Articles published in a GitHub Issue are recorded in `issue_articles`; the deliver stage queries the last 7 days before selection. Title similarity (≥ 3 shared keywords, computed by `lib/topic-overlap.js`) catches repackaged articles that share no URL. Lookback window and threshold are configurable in `lib/config.js`.

**Topic-based deduplication within a day.** `lib/topic-overlap.js` implements a shared-token heuristic to detect thematically overlapping articles on the same day. When two articles cover the same topic, only the higher-scoring one proceeds; Lab sources (Anthropic, OpenAI, DeepMind) win ties.

**Versioned metadata in GitHub Issues.** Each article block in a published issue contains an HTML comment marker `<!-- ki-news-meta: {...} -->` with structured metadata (url, score, source, date). The weekly digest and cross-day dedup read from these markers; a regex fallback handles issues predating the marker format.

**SSRF protection.** All outbound HTTP in `lib/http.js` validates target IPs against private ranges before connecting. Adapters cannot be pointed at internal network addresses.

**Adapter base class.** `adapters/_base.js` provides HTTP fetch, RSS/Atom parsing, content extraction, and enrichment. Source-specific adapters extend this base; adding a new source requires only the feed URL and any source-specific filter logic.

**Shared config layer.** All model names, score thresholds, dedup parameters, and rate limits are defined once in `lib/config.js`. No magic numbers in application code.

---

## Repository layout

```
ingest.js              — Stage 1: fetch and normalise articles
score.js               — Stage 2: relevance scoring via Claude Haiku
deliver.js             — Stage 3: write-up, review loop, GitHub Issue
weekly.js              — Sunday synthesis digest
adapters/              — One adapter per source (15 files incl. base)
lib/                   — Shared modules: claude, github, http, store,
                         schema, config, topic-overlap, issue-format, …
.github/workflows/     — daily-news.yml, weekly-digest.yml, watchdog,
                         close-old-issues
```

---

## Stack

Node.js (ESM, no framework) · Claude API (Haiku + Sonnet) · `better-sqlite3` · Zod · GitHub Actions · GitHub Issues API

---

## License

MIT.
