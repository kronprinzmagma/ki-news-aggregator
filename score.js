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
const API_TIMEOUT_MS = 45_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504, 529]);

function todayString() {
  return process.env.RUN_DATE || new Date().toISOString().slice(0, 10);
}

function claudeRequest(article) {
  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `Du bewertest KI-News für eine erfahrene Product-Owner-/Product-Manager-Person mit technischer Hands-on-Ambition. Sie will wissen, welche Entwicklungen für Produktstrategie, Roadmap-Entscheidungen, Build-vs-Buy, AI-Adoption und eigene Prototypen wirklich wichtig sind.

Primäre Frage: Ändert dieser Artikel, was ich als PM/PO über KI-Produkte, Plattformen, Nutzererwartungen, Kosten, Risiken oder eigene AI-Prototypen wissen sollte?

Score 5 – wichtiges Signal mit Produkt- oder Strategie-Auswirkung:
- Neue Modell- oder Plattform-Capabilities mit klarer Auswirkung auf mögliche Produktfunktionen
- Relevante Änderungen bei API-Zugang, Pricing, Limits, Lizenzierung, Open Weights oder Distribution
- Breite Adoption, neue Produktmuster, Sicherheits-/Regulierungsfragen oder Marktverschiebungen mit PM-Konsequenz
- Technische Architektur-Erkenntnisse, die zeigen, wie AI-Produkte künftig gebaut oder betrieben werden

Score 4 – verwertbar, aber enger:
- Praktische Frameworks, SDKs, Eval-Tools, Agenten-Patterns oder Case Studies mit übertragbarem Produktnutzen
- Konkrete Tooling-Releases, wenn sie ein grösseres Muster zeigen oder eigene Prototypen deutlich erleichtern
- Strategische Meldungen, wenn sie eine klare Entscheidung oder Beobachtung für eigene Projekte nahelegen

Score 1–2 – kein relevanter PM-/Produkt-Mehrwert:
- Reine Verwaltungs- oder Prozess-Tools (Ticket-Systeme, Sprint-Planung, Stakeholder-Reporting)
- Generische "KI verändert Branche XY"-Artikel ohne konkrete Substanz
- Reine VC-/Funding-Meldungen ohne Produkt-, Plattform- oder Capability-Details
- Marketing-Posts ohne neue Capability, Daten oder konkrete Produktimplikation
- Quelle "hackernews-show": Selbstpromotion ohne klare Differenzierung → maximal Score 2

Wichtig: Kleine Plugin-Releases, Bugfixes, einzelne Header-/CLI-/Konfigurationsänderungen oder persönliche Changelog-Posts sind maximal Score 3, ausser sie stehen klar für ein grösseres Produkt- oder Plattformmuster. Ein Artikel ist nicht schon deshalb Score 4, weil daraus ein Abendprojekt möglich ist.

Wenn der Text extrem dünn ist (nur Titel, Teaser oder unter ca. 200 Zeichen), darfst du höchstens Score 2 vergeben, ausser der Text enthält selbst konkrete überprüfbare Details zu Capability, Preis, API, Limit, Lizenz oder Plattformänderung. Erfinde keine Details aus dem Titel.

Die Begründung ist ein einzelner Satz und benennt den konkreten PM-/Produkt-Mehrwert plus möglichen Projektanker.

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
    req.setTimeout(API_TIMEOUT_MS, () => {
      req.destroy(new Error(`Claude API Timeout nach ${API_TIMEOUT_MS / 1000}s`));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function retryDelay(retries) {
  return RETRY_DELAY_MS * (retries + 1);
}

async function scoreArticle(article, retries = 0) {
  let response;
  try {
    response = await claudeRequest(article);
  } catch (err) {
    if (retries >= MAX_RETRIES) throw err;
    const delay = retryDelay(retries);
    console.warn(`[score] Request fehlgeschlagen (${err.message}) – warte ${delay}ms, Retry ${retries + 1}/${MAX_RETRIES}`);
    await new Promise(r => setTimeout(r, delay));
    return scoreArticle(article, retries + 1);
  }

  const { status, body } = response;

  if (RETRYABLE_STATUSES.has(status)) {
    if (retries >= MAX_RETRIES) throw new Error(`Claude API Fehler: HTTP ${status} – maximale Retries erreicht`);
    const delay = retryDelay(retries);
    console.warn(`[score] HTTP ${status} – warte ${delay}ms, Retry ${retries + 1}/${MAX_RETRIES}`);
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
  const date = todayString();
  const articleFile = `articles-${date}.json`;

  try {
    await fs.access(articleFile);
  } catch {
    console.error(`${articleFile} nicht gefunden. Bitte zuerst node ingest.js für denselben Lauf ausführen.`);
    process.exit(1);
  }

  console.log(`Lese: ${articleFile}`);
  const articles = JSON.parse(await fs.readFile(articleFile, 'utf-8'));
  console.log(`${articles.length} Artikel geladen`);

  const scored = await runWithConcurrency(articles, CONCURRENCY);

  const relevant = scored.filter(a => a.score !== null && a.score >= 3);
  const dropped = scored.length - relevant.length;
  console.log(`\n${relevant.length} relevante Artikel (Score >= 3), ${dropped} aussortiert`);

  const filename = `scored-${date}.json`;
  await fs.writeFile(filename, JSON.stringify(relevant, null, 2), 'utf-8');
  console.log(`Gespeichert: ${filename}`);
}

main()
  .finally(() => https.globalAgent.destroy());
