import { httpGet } from './_base.js';

const BASE_URL = 'https://newsapi.org/v2/everything';
const QUERY = 'artificial intelligence OR LLM OR "large language model" OR "generative AI"';

export async function fetchArticles() {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) throw new Error('NEWSAPI_KEY nicht gesetzt');

  const params = new URLSearchParams({
    q: QUERY,
    language: 'en',
    sortBy: 'publishedAt',
    pageSize: '20',
  });

  const raw = await httpGet(`${BASE_URL}?${params}`, { headers: { 'X-Api-Key': apiKey } });
  const json = JSON.parse(raw);

  if (json.status !== 'ok') {
    throw new Error(`NewsAPI Fehler: ${json.message || json.status}`);
  }

  return json.articles.map(a => ({
    titel: a.title || '',
    url: a.url,
    datum: a.publishedAt,
    quelle: 'newsapi',
    rohtext: [a.description, a.content].filter(Boolean).join(' ').slice(0, 2000),
  }));
}
