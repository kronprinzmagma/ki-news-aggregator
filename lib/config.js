export const REPO_OWNER = 'kronprinzmagma';
export const REPO_NAME = 'ki-news-aggregator';
export const REPO_SLUG = `${REPO_OWNER}/${REPO_NAME}`;

// Sonnet 4.6 statt Haiku 4.5 für Scoring: Haiku 4.5 hat ein empirisch
// ermitteltes Cache-Minimum von >2226 Tokens (zwischen 2226 und 6619),
// unser Score-System-Prompt liegt darunter und cached deshalb nicht. Sonnet
// 4.6 cached bereits ab ~1000 Tokens zuverlässig. Mit 99% Cache-Hit-Rate
// ist Sonnet (cache_read $0.30/MTok) im Score-Workload trotz höherer
// Base-Pricing günstiger als Haiku ohne Cache – und qualitativ stärker.
export const SCORE_MODEL = 'claude-sonnet-4-6';
export const DELIVER_MODEL = 'claude-sonnet-4-6';
export const WEEKLY_MODEL = 'claude-sonnet-4-6';

export const SCORE_CUTOFF_DELIVER = 4;
export const SCORE_CUTOFF_PERSIST = 3;
export const CROSS_DAY_DEDUP_LOOKBACK = 7;
export const CROSS_DAY_TITLE_SIMILARITY_THRESHOLD = 3;

export const LAB_QUELLEN = new Set([
  'anthropic', 'openai', 'deepmind', 'latentspace', 'simonwillison',
]);

export const TOPIC_STOPWORDS = new Set([
  'und', 'die', 'der', 'das', 'ein', 'eine', 'mit', 'für', 'von', 'auf',
  'ist', 'in', 'an', 'zu', 'the', 'a', 'of', 'to', 'for',
  'with', 'and', 'or', 'is', 'are', 'at', 'by', 'from', 'how', 'why',
  'what', 'new', 'show', 'hn', 'using', 'via', 'über', 'bei', 'als',
]);

export const USER_AGENT = 'ki-news-aggregator/1.0';
