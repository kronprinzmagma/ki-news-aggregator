import fs from 'fs/promises';
import https from 'https';
import { readFileSync } from 'fs';

// .env laden
try {
  const lines = readFileSync('.env', 'utf-8').split('\n');
  for (const line of lines) {
    const match = /^([^#=]+)=(.*)$/.exec(line.trim());
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
} catch { /* .env optional */ }

const CONCURRENCY = 5;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function claudeRequest(article) {
  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `Du bewertest Artikel für einen Solo-Entwickler, der konkrete technische Abendprojekte sucht. Primäre Frage: Liefert dieser Artikel eine konkrete Idee, die ich als Einzelperson an einem Abend mit Claude Code technisch umsetzen oder ausprobieren kann?

Score 4–5 – technisch umsetzbar, direkt verwertbar:
- Neue Modell-Capabilities mit konkreter API (Tool Use, Reasoning, Kontext-Erweiterung)
- SDKs, Frameworks, MCP-Server, Eval-Tools, die man direkt einsetzen kann
- Architektur-Erkenntnisse zu Agenten-Systemen mit praktischem Muster
- Strategische Verschiebungen (Pricing, OSS-Releases), die eigene Projekte direkt betreffen

Score 1–2 – kein technischer Mehrwert für eigene Projekte:
- Verwaltungs- oder Prozess-Tools (Ticket-Systeme, Sprint-Planung, Stakeholder-Reporting)
- Generische "KI verändert Branche XY"-Artikel ohne technische Substanz
- Reine VC-/Funding-Meldungen ohne Produktdetail
- Marketing-Posts ohne neue Capability
- Quelle "hackernews-show": Show-HN-Selbstpromotion ohne klare technische Differenzierung → maximal Score 2, ausser der Inhalt ist technisch aussergewöhnlich

Die Begründung benennt den konkreten Mehrwert für ein Maker-Projekt (ein Satz).

Antworte NUR mit JSON (kein Markdown, kein Code-Block): {"score": <1-5>, "begründung": "<ein Satz>"}

Titel: ${article.titel}
Quelle: ${article.quelle}
Text: ${(article.rohtext || '').slice(0, 1500)}`
      }
    ]
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function scoreArticle(article, retries = 0) {
  const { status, body } = await claudeRequest(article);

  if (status === 429) {
    if (retries >= MAX_RETRIES) throw new Error('Rate limit: maximale Retries erreicht');
    const delay = RETRY_DELAY_MS * (retries + 1);
    console.warn(`[score] 429 Rate Limit – warte ${delay}ms, Retry ${retries + 1}/${MAX_RETRIES}`);
    await new Promise(r => setTimeout(r, delay));
    return scoreArticle(article, retries + 1);
  }

  if (status !== 200) throw new Error(`Claude API Fehler: HTTP ${status} – ${body}`);

  const parsed = JSON.parse(body);
  const text = parsed.content[0].text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
  const result = JSON.parse(text);
  return { score: result.score, begründung: result.begründung };
}

async function runWithConcurrency(articles, limit) {
  const results = new Array(articles.length);
  let index = 0;

  async function worker() {
    while (index < articles.length) {
      const i = index++;
      const article = articles[i];
      try {
        const rating = await scoreArticle(article);
        results[i] = { ...article, ...rating };
        console.log(`[${i + 1}/${articles.length}] Score ${rating.score} – ${article.titel}`);
      } catch (err) {
        console.error(`[${i + 1}/${articles.length}] Fehler bei "${article.titel}": ${err.message}`);
        results[i] = { ...article, score: null, begründung: null };
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

async function main() {
  const files = await fs.readdir('.');
  const articleFile = files
    .filter(f => f.startsWith('articles-') && f.endsWith('.json'))
    .sort()
    .pop();

  if (!articleFile) {
    console.error('Keine articles-*.json gefunden. Bitte zuerst node ingest.js ausführen.');
    process.exit(1);
  }

  console.log(`Lese: ${articleFile}`);
  const articles = JSON.parse(await fs.readFile(articleFile, 'utf-8'));
  console.log(`${articles.length} Artikel geladen`);

  const scored = await runWithConcurrency(articles, CONCURRENCY);

  const relevant = scored.filter(a => a.score !== null && a.score >= 3);
  const dropped = scored.length - relevant.length;
  console.log(`\n${relevant.length} relevante Artikel (Score >= 3), ${dropped} aussortiert`);

  const filename = `scored-${todayString()}.json`;
  await fs.writeFile(filename, JSON.stringify(relevant, null, 2), 'utf-8');
  console.log(`Gespeichert: ${filename}`);
}

main();
