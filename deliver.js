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

function todayString() {
  return process.env.RUN_DATE || new Date().toISOString().slice(0, 10);
}

const API_TIMEOUT_MS = 60_000;
const GITHUB_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504, 529]);

function claudeRequest(body) {
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
    req.write(JSON.stringify(body));
    req.end();
  });
}

function retryDelay(retries) {
  return RETRY_DELAY_MS * (retries + 1);
}

async function claudeText(prompt, maxTokens = 400, retries = 0) {
  let response;
  try {
    response = await claudeRequest({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (err) {
    if (retries >= MAX_RETRIES) throw err;
    const delay = retryDelay(retries);
    console.warn(`[deliver] Request fehlgeschlagen (${err.message}) – warte ${delay}ms, Retry ${retries + 1}/${MAX_RETRIES}`);
    await new Promise(r => setTimeout(r, delay));
    return claudeText(prompt, maxTokens, retries + 1);
  }

  const { status, body } = response;
  if (RETRYABLE_STATUSES.has(status)) {
    if (retries >= MAX_RETRIES) throw new Error(`Claude API Fehler: HTTP ${status} – maximale Retries erreicht`);
    const delay = retryDelay(retries);
    console.warn(`[deliver] HTTP ${status} – warte ${delay}ms, Retry ${retries + 1}/${MAX_RETRIES}`);
    await new Promise(r => setTimeout(r, delay));
    return claudeText(prompt, maxTokens, retries + 1);
  }
  if (status !== 200) throw new Error(`Claude API Fehler: HTTP ${status}`);
  const parsed = JSON.parse(body);
  return parsed.content[0].text.trim();
}

const ARTIKEL_PROMPT = (artikel) => `\
Du schreibst für eine erfahrene Product-Owner-/Product-Manager-Person, die KI-Produkte strategisch verstehen und zugleich eigene kleine AI-Prototypen bauen will.

WICHTIG: Keine Sprint-, Ticket- oder Stakeholder-Floskeln. Schreibe nicht generisch "als PO". Jede Aussage muss helfen, eine Produktentscheidung, Marktbeobachtung oder eigene Bauidee schärfer zu sehen.

Nutze ausschliesslich Titel und Text unten. Erfinde keine Firmen, Produkte, Zahlen, Integrationen, Kunden, technischen Details oder Schlussfolgerungen, die nicht aus dem Text hervorgehen. Wenn der Text zu dünn ist, benenne die Unsicherheit knapp statt Lücken zu füllen.

Schreibe genau drei Blöcke. Gesamt maximal 120 Wörter.

**Was ist neu** (max. 3 Sätze): Nüchtern, kein Marketing-Sprech. Nicht den Titel wiederholen. Was ist passiert, wer steckt dahinter, was ist konkret neu?

**Warum es produktrelevant ist** (1–2 Sätze): Welche Auswirkung hat das auf Produktstrategie, Build-vs-Buy, Nutzererwartung, Kosten, Risiko oder AI-Adoption?

**Projektanker** (1–2 Sätze): Eine konkrete Sache, die man selbst ausprobieren, messen oder prototypen kann. Nicht bloss ein Tool installieren – ein Erkenntnisgewinn muss sichtbar sein.

Tonalität: Deutsch, Schweizer Hochdeutsch, direkt.

Titel: ${artikel.titel}
Text: ${(artikel.rohtext || '').slice(0, 1500)}`;

const UEBERBLICK_PROMPT = (topArtikel) => `\
Du schreibst einen Tagesüberblick für eine Product-Owner-/Product-Manager-Person, die KI-Entwicklungen strategisch einordnen und daraus eigene Prototyp-Ideen ableiten will.

Antworte ohne Überschrift, ohne Markdown und ohne separaten Prototyp-Impuls.
Maximal 100 Wörter, maximal 4 Sätze.
Nutze nur die Titel und Begründungen unten. Erfinde keine zusätzlichen Fakten, Standards, Zahlen, Produktnamen oder Integrationen.
Fasse zusammen: Welche Produkt-, Plattform- oder Marktbewegung ist heute wichtig? Was sollte man daraus lernen oder beobachten?

Direkt, Schweizer Hochdeutsch, keine Floskeln, keine Sprint-/Stakeholder-Sprache.

Top-Artikel heute:
${topArtikel.map(a => `- ${a.titel} (Score ${a.score}): ${a.begründung}`).join('\n')}`;

function trimIncompleteSentence(text) {
  const trimmed = text.trim();
  if (/[.!?][)"'»]*$/.test(trimmed)) return trimmed;

  const lastSentenceEnd = Math.max(
    trimmed.lastIndexOf('.'),
    trimmed.lastIndexOf('!'),
    trimmed.lastIndexOf('?')
  );
  if (lastSentenceEnd > 0) return trimmed.slice(0, lastSentenceEnd + 1).trim();
  return trimmed;
}

async function aufbereiten(artikel, index, total) {
  console.log(`[${index + 1}/${total}] Aufbereitung: ${artikel.titel}`);
  return claudeText(ARTIKEL_PROMPT(artikel), 400);
}

// Themen-Dedup: Artikel mit >= 2 gemeinsamen Schlüsselwörtern im Titel gelten als Duplikat.
// Artikel sind bereits nach Score absteigend sortiert – der erste (stärkere) gewinnt.
// Gibt { kept, removedDetails } zurück – removedDetails für run-summary.
function dedupByTheme(articles) {
  const stopWords = new Set([
    'und', 'die', 'der', 'das', 'ein', 'eine', 'mit', 'für', 'von', 'auf',
    'ist', 'in', 'an', 'zu', 'the', 'a', 'an', 'of', 'to', 'in', 'for',
    'with', 'and', 'or', 'is', 'are', 'at', 'by', 'from', 'how', 'why',
    'what', 'new', 'show', 'hn', 'using', 'via',
  ]);
  const words = (titel) => new Set(
    titel.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w))
  );
  const overlapWords = (a, b) => {
    const wa = words(a.titel);
    const shared = [];
    for (const w of words(b.titel)) if (wa.has(w)) shared.push(w);
    return shared;
  };
  const kept = [];
  const removedDetails = [];
  const removedIdx = new Set();
  for (let i = 0; i < articles.length; i++) {
    if (removedIdx.has(i)) continue;
    kept.push(articles[i]);
    for (let j = i + 1; j < articles.length; j++) {
      if (removedIdx.has(j)) continue;
      const shared = overlapWords(articles[i], articles[j]);
      if (shared.length >= 2) {
        console.log(`[dedup] "${articles[j].titel}" entfernt (overlap: "${shared.join(', ')}" mit "${articles[i].titel}")`);
        removedDetails.push({
          titel: articles[j].titel,
          url: articles[j].url,
          quelle: articles[j].quelle,
          score: articles[j].score,
          begründung: articles[j].begründung,
          duplicate_of: articles[i].titel,
          overlap_words: shared,
        });
        removedIdx.add(j);
      }
    }
  }
  return { kept, removedDetails };
}

// Hilfsfunktion: Anzahl Artikel pro Quelle zählen
function countPerSource(articles) {
  const counts = {};
  for (const a of articles) counts[a.quelle] = (counts[a.quelle] || 0) + 1;
  return counts;
}

// Hilfsfunktion: Score-Verteilung pro Quelle
function scoreDistributionPerSource(articles) {
  const dist = {};
  for (const a of articles) {
    if (a.score === null) continue;
    if (!dist[a.quelle]) dist[a.quelle] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    dist[a.quelle][a.score] = (dist[a.quelle][a.score] || 0) + 1;
  }
  return dist;
}

async function main() {
  const date = todayString();
  const scoredFile = `scored-${date}.json`;

  try {
    await fs.access(scoredFile);
  } catch {
    console.error(`${scoredFile} nicht gefunden. Bitte zuerst node score.js für denselben Lauf ausführen.`);
    process.exit(1);
  }

  console.log(`Lese: ${scoredFile}`);
  const articles = JSON.parse(await fs.readFile(scoredFile, 'utf-8'));
  console.log(`${articles.length} Artikel geladen`);

  // articles-*.json für Ingest-Statistiken laden (optional – kein Abbruch bei Fehler)
  let ingestArtikel = null;
  try {
    const articlesFile = scoredFile.replace('scored-', 'articles-');
    ingestArtikel = JSON.parse(await fs.readFile(articlesFile, 'utf-8'));
    console.log(`[summary] Ingest-Datei geladen: ${articlesFile} (${ingestArtikel.length} Artikel)`);
  } catch {
    console.warn('[summary] articles-*.json nicht gefunden – Ingest-Statistik wird übersprungen.');
  }

  // Nur Score >= 4, nach Score absteigend, dann nach Quelle priorisieren (Lab > HN)
  const LAB_QUELLEN = new Set(['anthropic', 'openai', 'deepmind', 'latentspace', 'simonwillison']);
  const belowCutoff = articles.filter(a => a.score < 4);
  const sorted = [...articles]
    .filter(a => a.score >= 4)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aLab = LAB_QUELLEN.has(a.quelle) ? 1 : 0;
      const bLab = LAB_QUELLEN.has(b.quelle) ? 1 : 0;
      return bLab - aLab;
    });

  // Themen-Dedup. Relevanz gewinnt: kein künstliches Quellen- oder Mengenlimit.
  const { kept: deduped, removedDetails: dedupedOut } = dedupByTheme(sorted);
  const topArtikel = deduped;

  // Run-Summary aufbauen (wird am Ende geschrieben)
  const runSummary = {
    date,
    ingest: ingestArtikel ? {
      total: ingestArtikel.length,
      per_source: countPerSource(ingestArtikel),
    } : null,
    scoring: {
      total: articles.length,
      score_distribution_per_source: scoreDistributionPerSource(articles),
      below_cutoff: belowCutoff.map(a => ({
        titel: a.titel, url: a.url, quelle: a.quelle,
        score: a.score, begründung: a.begründung,
      })),
    },
    deliver: {
      after_cutoff: sorted.length,
      after_dedup: deduped.length,
      in_issue: 0,
      issue_articles: [],
      deduped_out: dedupedOut,
      over_limit: [],
    },
    issue_created: false,
    issue_url: null,
  };

  if (topArtikel.length === 0) {
    console.log('Kein Artikel erreicht Score >= 4 – kein Issue erstellt (leerer Tag ist Feature, nicht Bug).');
    runSummary.deliver.reason = 'Kein Artikel mit Score >= 4';
    await writeRunSummary(date, runSummary);
    process.exit(0);
  }

  console.log(`\n${topArtikel.length} Artikel nach Dedup und Cutoff`);

  // Überblick generieren
  console.log('\nGeneriere Überblick...');
  const ueberblick = trimIncompleteSentence(await claudeText(UEBERBLICK_PROMPT(topArtikel), 300));

  // Artikel sequenziell aufbereiten (Rate Limiting)
  const aufbereitungen = [];
  for (let i = 0; i < topArtikel.length; i++) {
    const text = await aufbereiten(topArtikel[i], i, topArtikel.length);
    aufbereitungen.push(text);
  }

  // Markdown zusammensetzen
  const lines = [
    `# KI Daily – ${date}`,
    '',
    ueberblick,
    '',
    '---',
    '',
  ];

  for (let i = 0; i < topArtikel.length; i++) {
    const a = topArtikel[i];
    lines.push(`### ${a.titel}`);
    lines.push('');
    lines.push(`Score ${a.score}/5 · [${a.quelle}](${a.url})`);
    lines.push('');
    lines.push(aufbereitungen[i]);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  const markdown = lines.join('\n');
  const filename = `summary-${date}.md`;
  await fs.writeFile(filename, markdown, 'utf-8');
  console.log(`\nGespeichert: ${filename}`);

  const issueUrl = await upsertGithubIssue(date, markdown);

  // Run-Summary finalisieren und schreiben
  runSummary.issue_created = !!issueUrl;
  runSummary.issue_url = issueUrl;
  runSummary.deliver.in_issue = topArtikel.length;
  runSummary.deliver.issue_articles = topArtikel.map(a => ({
    titel: a.titel, url: a.url, quelle: a.quelle, score: a.score,
  }));
  await writeRunSummary(date, runSummary);
}

async function writeRunSummary(date, summary) {
  const filename = `run-summary-${date}.json`;
  await fs.writeFile(filename, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`Run-Summary gespeichert: ${filename}`);
}

function githubRequest(token, method, path, payload = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ki-news-aggregator',
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.setTimeout(GITHUB_TIMEOUT_MS, () => {
      req.destroy(new Error(`GitHub API Timeout nach ${GITHUB_TIMEOUT_MS / 1000}s`));
    });
    req.on('error', reject);
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
}

async function findExistingIssue(token, issueTitle) {
  const q = new URLSearchParams({
    q: `repo:kronprinzmagma/ki-news-aggregator is:issue in:title "${issueTitle}"`,
  });
  const { status, body } = await githubRequest(token, 'GET', `/search/issues?${q}`);
  if (status !== 200) {
    console.warn(`GitHub Issue-Suche fehlgeschlagen: HTTP ${status} – ${body}`);
    return null;
  }

  const result = JSON.parse(body);
  return result.items.find(issue => issue.title === issueTitle) || null;
}

async function upsertGithubIssue(date, body) {
  const token = process.env.GH_PAT;
  if (!token) {
    console.warn('GH_PAT nicht gesetzt – GitHub Issue wird übersprungen.');
    return null;
  }

  const issueTitle = `KI Daily – ${date}`;
  const existingIssue = await findExistingIssue(token, issueTitle);
  if (existingIssue) {
    const { status, body: responseBody } = await githubRequest(
      token,
      'PATCH',
      `/repos/kronprinzmagma/ki-news-aggregator/issues/${existingIssue.number}`,
      { title: issueTitle, body, labels: ['summary'] }
    );

    if (status === 200) {
      const issue = JSON.parse(responseBody);
      console.log(`GitHub Issue aktualisiert: ${issue.html_url}`);
      return issue.html_url;
    }

    console.error(`GitHub API Fehler beim Aktualisieren: HTTP ${status} – ${responseBody}`);
    return null;
  }

  const payload = {
    title: issueTitle,
    body,
    labels: ['summary'],
  };
  const { status, body: responseBody } = await githubRequest(
    token,
    'POST',
    '/repos/kronprinzmagma/ki-news-aggregator/issues',
    payload
  );

  if (status === 201) {
    const issue = JSON.parse(responseBody);
    console.log(`GitHub Issue erstellt: ${issue.html_url}`);
    return issue.html_url;
  }

  console.error(`GitHub API Fehler beim Erstellen: HTTP ${status} – ${responseBody}`);
  return null;
}

main()
  .finally(() => https.globalAgent.destroy());
