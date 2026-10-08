import { httpGet, parseRss } from './_base.js';

// Offizielle Newsletter-Domain; der alte Substack-Host blockiert CI-Abrufe.
const FEED_URL = 'https://www.a16z.news/feed';

// Nur Artikel mit KI-Bezug aufnehmen.
const AI_PATTERN = /\b(ai|artificial intelligence|machine learning|llm|gpt|model|agent|foundation model|generative|deep learning|neural|claude|openai|anthropic|gemini|mistral|automation|robotics)\b/i;

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  const all = parseRss(xml, 'a16z');
  return all.filter(a => AI_PATTERN.test(`${a.titel} ${a.rohtext || ''}`));
}
