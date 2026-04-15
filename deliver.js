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
Der Leser ist ein erfahrener, nichttechnischer Produktmensch (PO, PM, Head of Product) im Schweizer Digital-Umfeld. Er baut nebenbei eigene kleine Projekte mit Claude Code und interessiert sich für die praktische Anwendung von KI.

Schreibe für diesen Artikel:

1. Was ist die Kernaussage? (5-6 Sätze, kein Tech-Jargon. Wenn Fachbegriffe unvermeidbar sind, kurz erklären. Was ist passiert, wer steckt dahinter, warum ist es relevant, und was ist neu daran?)

2. Was bedeutet das für meine Arbeit als PO? (5-6 Sätze. Breit denken: Wie verändert das, wie digitale Produkte entstehen, priorisiert, bewertet oder verkauft werden? Was ändert sich in der Zusammenarbeit mit Entwicklern, Stakeholdern oder Nutzern? Was sollte ein PO jetzt wissen oder anders machen?)

3. Projektidee: Was könnte man damit konkret machen? (2-3 konkrete Ideen in je 1-2 Sätzen. Umsetzbar von einer Einzelperson mit Claude Code – kein grosses Budget, kein Team. Keine Workshops, keine Strategieprojekte.)

Tonalität: Deutsch, Schweizer Hochdeutsch, direkt und klar. Kein Marketing, keine Floskeln.

Antworte mit genau diesem Format:
**1. Was ist die Kernaussage?** <Text>
**2. Was bedeutet das für meine Arbeit als PO?** <Text>
**3. Projektideen** <Text>

Titel: ${artikel.titel}
Text: ${(artikel.rohtext || '').slice(0, 1500)}`;

const UEBERBLICK_PROMPT = (topArtikel) => `\
Du schreibst einen Überblick für einen Product Owner / Product Manager im Schweizer Digital- und Digital-Umfeld. Er ist kein Entwickler.

Fasse in 2-3 Sätzen zusammen: Was waren heute die wichtigsten KI-Themen, und was sollte ein PO davon mitnehmen?

Direkt und knapp, Schweizer Hochdeutsch, keine Floskeln.

Top-Artikel heute:
${topArtikel.map(a => `- ${a.titel} (Score ${a.score}): ${a.begründung}`).join('\n')}`;

const HIGHLIGHTS_UEBERBLICK_PROMPT = (topArtikel) => `\
Du schreibst einen Überblick für einen Product Owner / Product Manager im Schweizer Digital- und Digital-Umfeld. Er ist kein Entwickler.

Heute gibt es keine neuen relevanten KI-Meldungen. Stattdessen werden die wichtigsten Artikel der letzten zwei Wochen nochmals aufbereitet.

Fasse in 2-3 Sätzen zusammen: Was sind die prägenden KI-Themen der letzten zwei Wochen, und was sollte ein PO davon mitnehmen?

Direkt und knapp, Schweizer Hochdeutsch, keine Floskeln.

Top-Artikel der letzten zwei Wochen:
${topArtikel.map(a => `- ${a.titel} (Score ${a.score}): ${a.begründung}`).join('\n')}`;

async function aufbereiten(artikel, index, total) {
  console.log(`[${index + 1}/${total}] Aufbereitung: ${artikel.titel}`);
  return claudeText(ARTIKEL_PROMPT(artikel), 800);
}

const MIN_TOP_ARTIKEL = 3;

async function ladeHighlights() {
  const files = await fs.readdir('.');
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);

  const scoredFiles = files
    .filter(f => f.startsWith('scored-') && f.endsWith('.json'))
    .filter(f => {
      const dateStr = f.replace('scored-', '').replace('.json', '');
      return new Date(dateStr) >= cutoff;
    })
    .sort();

  const seen = new Set();
  const all = [];
  for (const file of scoredFiles) {
    const articles = JSON.parse(await fs.readFile(file, 'utf-8'));
    for (const a of articles) {
      if (!seen.has(a.url)) {
        seen.add(a.url);
        all.push(a);
      }
    }
  }
  return all;
}

async function main() {
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

  const hatGenugText = a => (a.rohtext || '').length >= 200;
  const tagesSorted = [...articles].sort((a, b) => b.score - a.score);
  const tagesTop = tagesSorted.filter(a => a.score >= 4 && hatGenugText(a));

  let isHighlights = false;
  let topArtikel;
  let linkArtikel;

  if (tagesTop.length < MIN_TOP_ARTIKEL) {
    console.log(`\nNur ${tagesTop.length} Top-Artikel heute (< ${MIN_TOP_ARTIKEL}) – wechsle zu KI Highlights (letzte 2 Wochen)`);
    isHighlights = true;
    const allArticles = await ladeHighlights();
    console.log(`${allArticles.length} Artikel aus den letzten 14 Tagen geladen`);
    const sorted = [...allArticles].sort((a, b) => b.score - a.score);
    topArtikel = sorted.filter(a => a.score >= 4 && hatGenugText(a)).slice(0, 5);
    linkArtikel = [];
  } else {
    const sorted = tagesSorted;
    topArtikel = tagesTop;
    linkArtikel = [
      ...sorted.filter(a => a.score >= 4 && !hatGenugText(a)),
      ...sorted.filter(a => a.score === 3),
    ];
  }

  console.log(`\n${topArtikel.length} Top-Artikel, ${linkArtikel.length} Link-Artikel`);

  // Überblick generieren
  console.log('\nGeneriere Überblick...');
  const ueberblickPrompt = isHighlights
    ? HIGHLIGHTS_UEBERBLICK_PROMPT(topArtikel)
    : UEBERBLICK_PROMPT(topArtikel.length > 0 ? topArtikel : tagesSorted.slice(0, 5));
  const ueberblick = await claudeText(ueberblickPrompt, 300);

  // Top-Artikel sequenziell aufbereiten (Rate Limiting)
  const aufbereitungen = [];
  for (let i = 0; i < topArtikel.length; i++) {
    const text = await aufbereiten(topArtikel[i], i, topArtikel.length);
    aufbereitungen.push(text);
  }

  // Markdown zusammensetzen
  const date = todayString();
  const titel = isHighlights ? `KI Highlights` : `KI-News`;
  const lines = [
    `# ${titel} – ${date}`,
    '',
    '## Überblick',
    '',
    ueberblick,
    '',
    '---',
    '',
  ];

  if (topArtikel.length > 0) {
    lines.push('## Top-Artikel');
    lines.push('');

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
  }

  if (linkArtikel.length > 0) {
    lines.push('## Weitere relevante Artikel');
    lines.push('');
    for (const a of linkArtikel) {
      lines.push(`- [${a.titel}](${a.url}) _(${a.quelle})_ – ${a.begründung}`);
    }
    lines.push('');
  }

  const markdown = lines.join('\n');
  const filename = `summary-${date}.md`;
  await fs.writeFile(filename, markdown, 'utf-8');
  console.log(`\nGespeichert: ${filename}`);

  await postGithubIssue(date, markdown, isHighlights);
}

async function postGithubIssue(date, body, isHighlights = false) {
  const token = process.env.GH_PAT;
  if (!token) {
    console.warn('GH_PAT nicht gesetzt – GitHub Issue wird übersprungen.');
    return;
  }

  const issueTitle = isHighlights ? `KI Highlights – ${date}` : `KI-News Summary – ${date}`;
  const payload = JSON.stringify({
    title: issueTitle,
    body,
    labels: ['summary'],
  });

  await new Promise((resolve, reject) => {
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
          } else {
            console.error(`GitHub API Fehler: HTTP ${res.statusCode} – ${data}`);
          }
          resolve();
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

main();
