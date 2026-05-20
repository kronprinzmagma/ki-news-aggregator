import { httpGet, decodeHtmlEntities, stripTags } from './_base.js';

const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCZHmQk67mSJgfCCTn7xBfew';

// YouTube-Atom-Feed nutzt media:description statt summary — Custom-Parser.
function parseYouTubeAtom(xml) {
  const articles = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(entry);
    const linkMatch = /<link rel="alternate" href="([^"]+)"/.exec(entry);
    const publishedMatch = /<published>([\s\S]*?)<\/published>/.exec(entry);
    const descMatch = /<media:description>([\s\S]*?)<\/media:description>/.exec(entry);
    if (!titleMatch || !linkMatch) continue;

    articles.push({
      titel: decodeHtmlEntities(titleMatch[1].trim()),
      url: linkMatch[1].trim(),
      datum: publishedMatch ? publishedMatch[1].trim() : null,
      quelle: 'yannickilcher',
      rohtext: descMatch ? stripTags(descMatch[1]).slice(0, 2000) : '',
    });
  }
  return articles;
}

export async function fetchArticles() {
  const xml = await httpGet(FEED_URL);
  const articles = parseYouTubeAtom(xml);
  if (articles.length === 0) throw new Error('Kein gültiger Atom-Feed empfangen');
  return articles;
}
