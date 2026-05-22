// Forkbar via Env-Vars. Auf GitHub Actions kommt GITHUB_REPOSITORY automatisch
// im "owner/name"-Format → das Projekt funktioniert beim Fork ohne Code-Edit.
// Lokal greift der Fallback auf den Default des Original-Repos.
const [DEFAULT_OWNER, DEFAULT_NAME] = (process.env.GITHUB_REPOSITORY || 'kronprinzmagma/ki-news-aggregator').split('/');
export const REPO_OWNER = process.env.REPO_OWNER || DEFAULT_OWNER;
export const REPO_NAME = process.env.REPO_NAME || DEFAULT_NAME;
export const REPO_SLUG = `${REPO_OWNER}/${REPO_NAME}`;

// Score läuft auf Haiku – billiger und für die Scoring-Aufgabe ausreichend.
// Caching greift bei dieser Prompt-Grösse zwar nicht (Haiku-Cache-Minimum
// liegt über unseren ~1000 System-Tokens), das ist aber kein Problem:
// absoluter Cost-Effekt ist ~CHF 5/Monat statt ~CHF 20 mit Sonnet.
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
