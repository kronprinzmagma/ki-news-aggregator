import { httpGet, parseAtom, enrichFromUrl } from './_base.js';

// Heise Online – allgemeiner Atom-Feed, gefiltert auf KI-Relevanz (DACH-Perspektive).
const FEED_URL = 'https://www.heise.de/rss/heise-atom.xml';

// Bewusst eng gehalten: nur Begriffe mit direktem Modell-/LLM-Bezug.
// "automation", "automat", "roboter", "assistent" wurden entfernt – sie
// treffen zu viele Enterprise-IT-Artikel ohne hands-on KI-Substanz.
const AI_PATTERN = /\b(ki\b|k\.i\.|künstliche intelligenz|artificial intelligence|machine learning|llm|sprachmodell|chatgpt|gpt|claude|gemini|mistral|openai|anthropic|deepmind|copilot|chatbot|deep learning|neuronale netze|neural network|inferenz|generativ|transformer|diffusion|multimodal|embedding|fine.?tun|rag\b|agentic|mcp\b)\b/i;

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  const all = parseAtom(xml, 'heise');
  const aiArticles = all.filter(a => AI_PATTERN.test(`${a.titel} ${a.rohtext || ''}`));
  return Promise.all(aiArticles.map(a => enrichFromUrl(a, {
    logTag: 'heise',
    useMetaDescription: true,
    maxLength: 3000,
    // Die Seite enthaelt Teaser-<article>-Templates vor dem echten Beitrag.
    extractOptions: { preferArticle: false },
  })));
}
