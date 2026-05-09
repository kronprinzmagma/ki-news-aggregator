import fs from 'fs/promises';
import https from 'https';
import { readFileSync } from 'fs';

// .env laden
try {
  const lines = readFileSync('.env', 'utf-8').split('\n');
  for (const line of lines) {
    const match = /^([^#=]+)=(.*)$/.exec(line.trim());
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
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
        res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
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

  const { status, body, headers: responseHeaders } = response;
  if (RETRYABLE_STATUSES.has(status)) {
    if (retries >= MAX_RETRIES) throw new Error(`Claude API Fehler: HTTP ${status} – maximale Retries erreicht`);
    const retryAfter = parseInt(responseHeaders?.['retry-after'] || '0', 10) * 1000;
    const delay = Math.max(retryDelay(retries), retryAfter);
    console.warn(`[deliver] HTTP ${status} – warte ${delay}ms, Retry ${retries + 1}/${MAX_RETRIES}`);
    await new Promise(r => setTimeout(r, delay));
    return claudeText(prompt, maxTokens, retries + 1);
  }
  if (status !== 200) throw new Error(`Claude API Fehler: HTTP ${status}`);
  const parsed = JSON.parse(body);
  const content = parsed?.content?.[0]?.text;
  if (!content) throw new Error(`Unerwartetes API-Response-Format: ${body.slice(0, 200)}`);
  return content.trim();
}

function parseClaudeJson(text) {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
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
Text: ${(artikel.rohtext || '').slice(0, 2500)}`;

const REVIEW_PROMPT = ({ selectedArticles, lowScoreSamples }) => `\
Du bist eine unabhängige Review-Schlaufe für einen persönlichen KI-News-Aggregator.

Kontext:
- Das Daily-Issue ist für eine erfahrene Product-/PM-Person mit Hands-on-Ambition.
- Ziel ist nicht "alles Interessante", sondern wenige starke Signale für KI-Produkte, Plattformen, Build-vs-Buy, Nutzererwartungen, Kosten, Risiken und eigene AI-Prototypen.
- Diese Review-Schlaufe ist advisory: Sie liefert strukturierte Qualitäts- und Prozesshinweise. Sie ändert keine Auswahl selbst.

Bewerte aus vier Perspektiven:
1. Produkt-Relevanz: Ist der Artikel für KI-Produkte/Plattformen/Strategie relevant?
2. Technische Substanz: Enthält der Input konkrete Details zu Capability, API, Architektur, Modell, Kosten, Lizenz oder Tooling?
3. Lernwert: Lohnt sich spätere Vertiefung für persönliche KI-Weiterbildung?
4. Aufbereitungsqualität: Reicht Titel/Text/Summary aus, oder wirkt der Input dünn/kaputt?

Analysiere:
- selected_articles: Artikel, die ins Issue kommen.
- low_score_samples: Bis zu zwei Beispiele je niedriger Score-Stufe 1, 2 und 3. Prüfe nur, ob der Ausschluss plausibel war oder ob möglicherweise Relevanz verloren ging.

Gib NUR valides JSON zurück:
{
  "selected_articles": [
    {
      "url": "...",
      "title": "...",
      "product_relevance": 1-5,
      "technical_substance": 1-5,
      "learning_value": 1-5,
      "input_quality": "good" | "thin" | "broken",
      "issue_fit": "strong" | "ok" | "weak",
      "suggested_feedback": {
        "besonders_wertvoll": true | false,
        "spaeter_weiterverfolgen": true | false
      },
      "reason": "ein kurzer Satz"
    }
  ],
  "low_score_samples": [
    {
      "url": "...",
      "title": "...",
      "score_seems_right": true | false,
      "missed_opportunity": true | false,
      "input_quality": "good" | "thin" | "broken",
      "reason": "ein kurzer Satz"
    }
  ],
  "process_adjustments": [
    {
      "area": "scoring" | "ingest" | "delivery" | "source",
      "priority": "low" | "medium" | "high",
      "recommendation": "konkrete Empfehlung",
      "auto_apply_safe": false
    }
  ],
  "overall_assessment": "maximal zwei Sätze"
}

Wichtig:
- Erfinde keine Details, die nicht im Input stehen.
- Wenn ein Originalartikel vermutlich spannend wäre, der Input aber dünn ist, markiere input_quality="thin" und empfehle eine Ingest-Verbesserung.
- Setze auto_apply_safe immer auf false. Prozessänderungen sollen erst sichtbar gemacht und später bewusst übernommen werden.

Input:
${JSON.stringify({ selected_articles: selectedArticles, low_score_samples: lowScoreSamples }, null, 2)}
`;

function topicLabel(article) {
  const text = `${article.titel} ${article.begründung || ''}`.toLowerCase();
  if (/agent|cowork|managed agents|mcp/.test(text)) return 'fertige Agenten-Bausteine';
  if (/usage limit|rate limit|compute|capacity|gpu|infrastruktur|api-limit/.test(text)) return 'LLM-Kapazität und API-Planbarkeit';
  if (/fraud|recaptcha|security|trust|bot|auth/.test(text)) return 'Trust-, Auth- und Fraud-Infrastruktur';
  if (/fine-?tuning|training|moe|model|inferenz|inference|open weights|quant/.test(text)) return 'günstigere Modell- und Training-Optionen';
  if (/pricing|cost|kosten|lizenz|license/.test(text)) return 'Kosten-, Lizenz- und Build-vs-Buy-Fragen';
  return 'Produkt- und Plattformsignale';
}

function buildOverview(topArtikel) {
  const articleCount = topArtikel.length;
  const strongestSignals = topArtikel
    .slice(0, 3)
    .map(a => a.titel)
    .join('; ');
  const themes = [...new Set(topArtikel.map(topicLabel))]
    .slice(0, 4)
    .join(', ');

  return [
    `Heute haben ${articleCount} Entwicklungen den Cutoff erreicht.`,
    `Die stärksten Signale sind: ${strongestSignals}.`,
    `Das Muster: ${themes}.`,
  ].join(' ');
}

function pickLowScoreSamples(belowCutoff, limit = 2) {
  return [1, 2, 3].flatMap(score => (
    belowCutoff
      .filter(article => article.score === score)
      .sort((a, b) => (a.titel || '').localeCompare(b.titel || ''))
      .slice(0, limit)
  ));
}

async function reviewRun(selectedArticles, summaries, lowScoreSamples) {
  const selectedPayload = selectedArticles.map((article, index) => ({
    title: article.titel,
    url: article.url,
    source: article.quelle,
    score: article.score,
    scoring_reason: article.begründung,
    raw_text: (article.rohtext || '').slice(0, 700),
    issue_summary: summaries[index],
  }));

  const samplePayload = lowScoreSamples.map(article => ({
    title: article.titel,
    url: article.url,
    source: article.quelle,
    score: article.score,
    scoring_reason: article.begründung,
    raw_text: (article.rohtext || '').slice(0, 600),
  }));

  let text;
  try {
    console.log('[review] Starte Claude-only Review-Schlaufe');
    text = await claudeText(
      REVIEW_PROMPT({ selectedArticles: selectedPayload, lowScoreSamples: samplePayload }),
      3000
    );
    return {
      enabled: true,
      model: 'claude-sonnet-4-6',
      mode: 'advisory',
      reviewed_selected: selectedArticles.length,
      reviewed_low_score_samples: lowScoreSamples.length,
      result: parseClaudeJson(text),
    };
  } catch (err) {
    console.warn(`[review] Review-Schlaufe übersprungen: ${err.message}`);
    return {
      enabled: true,
      mode: 'advisory',
      error: err.message,
      raw_response: text?.slice(0, 500),
    };
  }
}

function extractFeedbackStates(body = '') {
  const states = new Map();
  const sections = body.split(/\n(?=### )/);

  for (const section of sections) {
    const url = section.match(/Score \d+\/5 · \[[^\]]+\]\(([^)]+)\)/)?.[1];
    if (!url) continue;
    states.set(url, {
      standout: /- \[[xX]\] Besonders wertvoll/.test(section),
      followUp: /- \[[xX]\] Später weiterverfolgen/.test(section),
    });
  }

  return states;
}

function applyFeedbackStates(markdown, states) {
  if (!states.size) return markdown;

  return markdown
    .split(/\n(?=### )/)
    .map(section => {
      const url = section.match(/Score \d+\/5 · \[[^\]]+\]\(([^)]+)\)/)?.[1];
      const state = url ? states.get(url) : null;
      if (!state) return section;
      return section
        .replace('- [ ] Besonders wertvoll', `- [${state.standout ? 'x' : ' '}] Besonders wertvoll`)
        .replace('- [ ] Später weiterverfolgen', `- [${state.followUp ? 'x' : ' '}] Später weiterverfolgen`);
    })
    .join('\n');
}

async function aufbereiten(artikel, index, total) {
  console.log(`[${index + 1}/${total}] Aufbereitung: ${artikel.titel}`);
  return claudeText(ARTIKEL_PROMPT(artikel), 400);
}

// Themen-Dedup: Artikel mit >= 2 gemeinsamen Schlüsselwörtern im Titel gelten als Duplikat.
// Hinweis: Dies ist eine vereinfachte Heuristik – nur Titelwörter werden verglichen.
// Die 'begründung' aus dem Scoring wird hier bewusst nicht einbezogen, obwohl
// topicLabel() sie nutzt. Thematisch verwandte Artikel ohne Titelüberlapp können
// daher nicht dedupliziert werden.
// Artikel sind bereits nach Score absteigend sortiert – der erste (stärkere) gewinnt.
// Gibt { kept, removedDetails } zurück – removedDetails für run-summary.
function dedupByTheme(articles) {
  const stopWords = new Set([
    'und', 'die', 'der', 'das', 'ein', 'eine', 'mit', 'für', 'von', 'auf',
    'ist', 'in', 'an', 'zu', 'the', 'a', 'of', 'to', 'for',
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
  let articles;
  try {
    articles = JSON.parse(await fs.readFile(scoredFile, 'utf-8'));
  } catch (err) {
    console.error(`Fehler beim Lesen von ${scoredFile}: ${err.message}`);
    process.exit(1);
  }
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
  const belowCutoff = articles.filter(a => a.score !== null && a.score < 4);
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
  const lowScoreSamples = pickLowScoreSamples(belowCutoff);

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
    review: null,
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

  // Überblick deterministisch aus Top-Titeln bauen, kein LLM-Aufruf.
  // Bewusste Entscheidung: Kein LLM für den Überblick, um Halluzinationen zu vermeiden.
  const ueberblick = buildOverview(topArtikel);

  // Artikel sequenziell aufbereiten (Rate Limiting)
  const aufbereitungen = [];
  for (let i = 0; i < topArtikel.length; i++) {
    const text = await aufbereiten(topArtikel[i], i, topArtikel.length);
    aufbereitungen.push(text);
  }

  runSummary.review = await reviewRun(topArtikel, aufbereitungen, lowScoreSamples);

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
    lines.push('- [ ] Besonders wertvoll');
    lines.push('- [ ] Später weiterverfolgen');
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
  // Sicherheitshinweis: issueTitle wird direkt in den Suchquery interpoliert.
  // Das ist aktuell unkritisch, weil issueTitle immer aus dem fixen String
  // "KI Daily – " + Datum besteht. Der eigentliche Guard ist issue.title === issueTitle
  // weiter unten: Auch wenn der Suchquery mehr Treffer liefert als erwartet
  // (z.B. durch einen manipulierten RUN_DATE bei workflow_dispatch), wird
  // nur das Issue mit exakt passendem Titel verwendet.
  const q = new URLSearchParams({
    q: `repo:kronprinzmagma/ki-news-aggregator is:issue in:title "${issueTitle}"`,
  });
  const { status, body } = await githubRequest(token, 'GET', `/search/issues?${q}`);
  if (status !== 200) {
    console.warn(`GitHub Issue-Suche fehlgeschlagen: HTTP ${status} – ${body}`);
    return null;
  }

  let result;
  try {
    result = JSON.parse(body);
  } catch {
    console.warn(`GitHub Issue-Suche: ungültige JSON-Antwort – ${body.slice(0, 100)}`);
    return null;
  }
  return result.items?.find(issue => issue.title === issueTitle) || null;
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
    let existingBody = existingIssue.body || '';
    if (!existingBody && existingIssue.number) {
      const existingResponse = await githubRequest(
        token,
        'GET',
        `/repos/kronprinzmagma/ki-news-aggregator/issues/${existingIssue.number}`
      );
      if (existingResponse.status === 200) {
        existingBody = JSON.parse(existingResponse.body).body || '';
      } else {
        console.warn(`GitHub Issue konnte für Feedback-Erhalt nicht geladen werden: HTTP ${existingResponse.status}`);
      }
    }
    const feedbackStates = extractFeedbackStates(existingBody);
    const bodyWithPreservedFeedback = applyFeedbackStates(body, feedbackStates);
    const { status, body: responseBody } = await githubRequest(
      token,
      'PATCH',
      `/repos/kronprinzmagma/ki-news-aggregator/issues/${existingIssue.number}`,
      { title: issueTitle, body: bodyWithPreservedFeedback, labels: ['summary'] }
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
  .catch(err => { console.error('[fatal]', err.message); process.exit(1); })
  .finally(() => https.globalAgent.destroy());
