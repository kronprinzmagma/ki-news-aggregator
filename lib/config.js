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

// ─── Audio-Ausgabe (Daily) ────────────────────────────────────────────────────
// Sprechfassung wird per Claude (AUDIO_SCRIPT_MODEL) aus den fertigen
// Aufbereitungen erzeugt, dann via OpenAI TTS zu MP3 synthetisiert und als
// Release-Asset gehostet. Komplett optional: ohne OPENAI_API_KEY wird der
// Schritt übersprungen und die Pipeline verhält sich wie zuvor.
export const AUDIO_SCRIPT_MODEL = 'claude-sonnet-4-6';
export const AUDIO_TTS_MODEL = 'gpt-4o-mini-tts';
export const AUDIO_VOICE = 'onyx'; // ruhig/sachlich; Alternativen: alloy, nova, echo, shimmer
export const AUDIO_RELEASE_TAG = 'podcast';
export const AUDIO_RELEASE_NAME = 'KI-News Audio';

export const SCORE_CUTOFF_DELIVER = 4;
export const CROSS_DAY_DEDUP_LOOKBACK = 7;
export const CROSS_DAY_TITLE_SIMILARITY_THRESHOLD = 3;

export const LAB_QUELLEN = new Set([
  'anthropic', 'openai', 'deepmind', 'latentspace', 'simonwillison',
]);

export const TOPIC_STOPWORDS = new Set([
  // Funktionswörter DE/EN
  'und', 'die', 'der', 'das', 'ein', 'eine', 'mit', 'für', 'von', 'auf',
  'ist', 'in', 'an', 'zu', 'the', 'a', 'of', 'to', 'for',
  'with', 'and', 'or', 'is', 'are', 'at', 'by', 'from', 'how', 'why',
  'what', 'new', 'show', 'hn', 'using', 'via', 'über', 'bei', 'als',
  // Generische Marker, Quellenpräfixe, Jahreszahlen
  'ainews', 'heise', 'quoting', '2026', 'this', 'time', 'open', 'source',
  'more', 'than', 'nach', 'neue',
  // Mainstream-Plattformen die alleine keine Themen-Differenzierung sind
  // (z.B. "google + gemini" matchte Adobe-Integration, Volvo, Smart-Home)
  'google',
]);

export const USER_AGENT = 'ki-news-aggregator/1.0';

// KI-Keyword-Filter für DACH-Generalisten-Feeds (Heise, Golem): nur Artikel
// mit AI-/KI-Bezug in Titel oder Rohtext kommen durch. Zentral gepflegt,
// damit beide Adapter identisch filtern.
export const DACH_AI_PATTERN = /\b(ki\b|k\.i\.|künstlich|artificial intelligence|machine learning|llm|sprachmodell|chatgpt|gpt|claude|gemini|mistral|openai|anthropic|deepmind|copilot|assistent|chatbot|deep learning|neural|neuronale|automation|automat|roboter|robotik|inferenz|generativ|transformer)\b/i;
