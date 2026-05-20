export const REPO_OWNER = 'kronprinzmagma';
export const REPO_NAME = 'ki-news-aggregator';
export const REPO_SLUG = `${REPO_OWNER}/${REPO_NAME}`;

export const SCORE_MODEL = 'claude-haiku-4-5-20251001';
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
