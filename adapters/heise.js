import { httpGet, parseAtom } from './_base.js';

// Heise Online – allgemeiner Atom-Feed, gefiltert auf KI-Relevanz (DACH-Perspektive).
const FEED_URL = 'https://www.heise.de/rss/heise-atom.xml';

const AI_PATTERN = /\b(ki\b|k\.i\.|künstlich|artificial intelligence|machine learning|llm|sprachmodell|chatgpt|gpt|claude|gemini|mistral|openai|anthropic|deepmind|copilot|assistent|chatbot|deep learning|neural|neuronale|automation|automat|roboter|robotik|inferenz|generativ|transformer)\b/i;

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  const all = parseAtom(xml, 'heise');
  return all.filter(a => AI_PATTERN.test(`${a.titel} ${a.rohtext || ''}`));
}
