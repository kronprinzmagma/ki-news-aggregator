import { httpGet, parseRss, enrichFromUrl } from './_base.js';

// Golem.de – allgemeiner RSS-Feed, gefiltert auf KI-Relevanz.
// Ergänzt Heise um Developer-Perspektive aus dem DACH-Raum (Open Source,
// Sicherheit, Entwickler-Tooling). KI-spezifischer Feed existiert nicht,
// deshalb wie bei Heise per Keyword-Filter im Adapter.
const FEED_URL = 'https://rss.golem.de/rss.php?feed=RSS2.0';

// Konsistent mit adapters/heise.js gehalten, damit Filter-Verhalten vergleichbar ist.
const AI_PATTERN = /\b(ki\b|k\.i\.|künstlich|artificial intelligence|machine learning|llm|sprachmodell|chatgpt|gpt|claude|gemini|mistral|openai|anthropic|deepmind|copilot|assistent|chatbot|deep learning|neural|neuronale|automation|automat|roboter|robotik|inferenz|generativ|transformer)\b/i;

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  const all = parseRss(xml, 'golem');
  const aiArticles = all.filter(a => AI_PATTERN.test(`${a.titel} ${a.rohtext || ''}`));
  return Promise.all(aiArticles.map(a => enrichFromUrl(a, {
    logTag: 'golem',
    useMetaDescription: true,
    maxLength: 3000,
  })));
}
