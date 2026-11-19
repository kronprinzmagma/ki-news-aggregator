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
//
// Stand 2026-11-19 (Vergleichsmessung siehe PR «Claude 5.5»):
// - Scoring auf Haiku 5.5: im CI-Datensatz genauer, rund zehnmal billiger.
// - Aufbereitung bleibt vorerst auf Sonnet 4.6: Sonnet 5.5 war gleich quellentreu,
//   schrieb aber im Schnitt ~300 statt ~210 Wörter (Hälfte über der Obergrenze,
//   also mehr Neuschreib-Runden) und war pro Aufbereitung nicht billiger.
//   Nachmessen mit evals/deliver_model_compare.js. lib/claude.js kann 5.5 bereits.
// Die Env-Variablen dienen nur Vergleichsläufen der Evals (alt gegen neu).
export const SCORE_MODEL = process.env.KI_NEWS_SCORE_MODEL || 'claude-haiku-5-5';
export const DELIVER_MODEL = process.env.KI_NEWS_DELIVER_MODEL || 'claude-sonnet-4-6';
export const WEEKLY_MODEL = process.env.KI_NEWS_DELIVER_MODEL || 'claude-sonnet-4-6';

// ─── Audio-Ausgabe (Daily) ────────────────────────────────────────────────────
// Sprechfassung wird per Claude (AUDIO_SCRIPT_MODEL) aus den fertigen
// Aufbereitungen erzeugt, dann via OpenAI TTS zu MP3 synthetisiert und als
// Release-Asset gehostet. Komplett optional: ohne OPENAI_API_KEY wird der
// Schritt übersprungen und die Pipeline verhält sich wie zuvor.
export const AUDIO_SCRIPT_MODEL = process.env.KI_NEWS_DELIVER_MODEL || 'claude-sonnet-4-6';
// gpt-4o-mini-tts wird am 06.01.2027 abgeschaltet; Nachfolger laut OpenAI ist
// gpt-realtime-2.1-mini, erreichbar nur über die Realtime-API (lib/tts.js).
export const AUDIO_TTS_MODEL = 'gpt-realtime-2.1-mini';
// Realtime-Stimmen: alloy, ash, ballad, coral, echo, sage, shimmer, verse,
// marin, cedar. «onyx» gibt es dort nicht; OpenAI empfiehlt marin oder cedar.
export const AUDIO_VOICE = 'cedar';
// Preise gpt-realtime-2.1-mini in USD pro 1 Mio. Tokens (Modellseite, 2026-11-19).
export const AUDIO_TTS_PRICE = { text_input: 0.6, text_output: 2.4, audio_output: 20 };
export const AUDIO_RELEASE_TAG = 'podcast';
export const AUDIO_RELEASE_NAME = 'KI-News Audio';

export const SCORE_CUTOFF_DELIVER = 4;
export const DAILY_MAX_ARTICLES = 5;
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
