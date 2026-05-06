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
  return new Date().toISOString().slice(0, 10);
}

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
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function claudeText(prompt, maxTokens = 400) {
  const { status, body } = await claudeRequest({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  if (status !== 200) throw new Error(`Claude API Fehler: HTTP ${status}`);
  const parsed = JSON.parse(body);
  return parsed.content[0].text.trim();
}

const ARTIKEL_PROMPT = (artikel) => `\
Du schreibst für eine erfahrene Senior-Produktperson, die ihre Kompetenz hands-on Richtung KI-Builder entwickelt. Sie setzt eigene Tools mit Claude Code und Anthropic API um und will die Entwicklungsrichtung der KI für ihre strategische Positionierung verstehen.

WICHTIG: Kein Bezug zu Backlog, Sprint, Tickets, Stakeholder-Kommunikation oder Teamführung. Keine Formulierungen wie "als PO" oder "für dein Team".

Schreibe genau drei Blöcke. Gesamt maximal 120 Wörter.

**Was ist neu** (max. 3 Sätze): Nüchtern, kein Marketing-Sprech. Nicht den Titel wiederholen. Was ist passiert, wer steckt dahinter, was ist konkret neu?

**Was es für die KI-Richtung heisst** (1–2 Sätze): Welche Strömung oder Entwicklungslinie steckt dahinter?

**Build-Anker** (1–2 Sätze): Eine konkrete kleine Sache, die man an einem Abend mit Claude Code ausprobieren oder in ein eigenes Projekt integrieren kann.

Tonalität: Deutsch, Schweizer Hochdeutsch, direkt.

Titel: ${artikel.titel}
Text: ${(artikel.rohtext || '').slice(0, 1500)}`;

const UEBERBLICK_PROMPT = (topArtikel) => `\
Du schreibst einen Tagesüberblick für jemanden, der KI hands-on anwendet und die Entwicklungsrichtung des Feldes versteht.

Fasse in maximal 4 Sätzen zusammen: Welcher Trend zeichnet sich heute ab, in welche Richtung bewegt sich das Feld?

Keine PO-Empfehlungen, keine Stakeholder-Sprache. Direkt, Schweizer Hochdeutsch, keine Floskeln.

Top-Artikel heute:
${topArtikel.map(a => `- ${a.titel} (Score ${a.score}): ${a.begründung}`).join('\n')}`;

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
  const overlap = (a, b) => {
    const wa = words(a.titel);
    let n = 0;
    for (const w of words(b.titel)) if (wa.has(w)) n++;
    return n;
  };
  const kept = [];
  const removedDetails = [];
  const removedIdx = new Set();
  for (let i = 0; i < articles.length; i++) {
    if (removedIdx.has(i)) continue;
    kept.push(articles[i]);
    for (let j = i + 1; j < articles.length; j++) {
      if (removedIdx.has(j)) continue;
      if (overlap(articles[i], articles[j]) >= 2) {
        console.log(`[dedup] Themen-Duplikat entfernt: "${articles[j].titel}" (ähnlich: "${articles[i].titel}")`);
        removedDetails.push({
          titel: articles[j].titel,
          url: articles[j].url,
          quelle: articles[j].quelle,
          score: articles[j].score,
          begründung: articles[j].begründung,
          duplicate_of: articles[i].titel,
        });
        removedIdx.add(j);
      }
    }
  }
  return { kept, removedDetails };
}

const MAX_ARTIKEL = 5;

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
  const files = await fs.readdir('.');

  const scoredFile = files
    .filter(f => f.startsWith('scored-') && f.endsWith('.json'))
    .sort()
    .pop();

  if (!scoredFile) {
    console.error('Keine scored-*.json gefunden. Bitte zuerst node score.js ausführen.');
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

  // Themen-Dedup, dann auf MAX_ARTIKEL begrenzen
  const { kept: deduped, removedDetails: dedupedOut } = dedupByTheme(sorted);
  const topArtikel = deduped.slice(0, MAX_ARTIKEL);
  const overLimit   = deduped.slice(MAX_ARTIKEL);

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
      over_limit: overLimit.map(a => ({
        titel: a.titel, url: a.url, quelle: a.quelle,
        score: a.score, begründung: a.begründung,
      })),
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
  const ueberblick = await claudeText(UEBERBLICK_PROMPT(topArtikel), 400);

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

  const issueUrl = await postGithubIssue(date, markdown);

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

async function postGithubIssue(date, body) {
  const token = process.env.GH_PAT;
  if (!token) {
    console.warn('GH_PAT nicht gesetzt – GitHub Issue wird übersprungen.');
    return null;
  }

  const issueTitle = `KI Daily – ${date}`;
  const payload = JSON.stringify({
    title: issueTitle,
    body,
    labels: ['summary'],
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: '/repos/kronprinzmagma/ki-news-aggregator/issues',
        method: 'POST',
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
        res.on('end', () => {
          if (res.statusCode === 201) {
            const issue = JSON.parse(data);
            console.log(`GitHub Issue erstellt: ${issue.html_url}`);
            resolve(issue.html_url);
          } else {
            console.error(`GitHub API Fehler: HTTP ${res.statusCode} – ${data}`);
            resolve(null);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

main();
