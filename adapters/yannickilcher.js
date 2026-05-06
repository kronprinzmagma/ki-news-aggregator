import https from 'https';

const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCZHmQk67mSJgfCCTn7xBfew';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseAtom(xml) {
  const articles = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(entry);
    const linkMatch = /<link rel="alternate" href="([^"]+)"/.exec(entry);
    const publishedMatch = /<published>([\s\S]*?)<\/published>/.exec(entry);
    // YouTube liefert die Beschreibung im media:description-Tag
    const descMatch = /<media:description>([\s\S]*?)<\/media:description>/.exec(entry);

    if (!titleMatch || !linkMatch) continue;

    const titel = titleMatch[1].trim();
    const url = linkMatch[1].trim();
    const datum = publishedMatch ? publishedMatch[1].trim() : null;
    const rohtext = descMatch
      ? stripTags(descMatch[1]).slice(0, 2000)
      : '';

    articles.push({ titel, url, datum, quelle: 'yannickilcher', rohtext });
  }

  if (articles.length === 0) throw new Error('Kein gültiger Atom-Feed empfangen');
  return articles;
}

export async function fetchArticles() {
  const xml = await get(FEED_URL);
  return parseAtom(xml);
}
