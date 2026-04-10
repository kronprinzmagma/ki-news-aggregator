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
Der Leser ist ein erfahrener Product Owner / Product Manager im Schweizer Digital- und InsurTech-Umfeld. Er ist kein Entwickler. Er will verstehen:
1. Was ist die Kernaussage? (1-2 Sätze, kein Tech-Jargon)
2. Was bedeutet das für meine Arbeit als PO? (1-2 Sätze, konkreter Bezug zu Produktentwicklung, Teamführung oder Stakeholder-Kommunikation)
3. Projektidee: Was könnte man damit konkret machen? (1 Satz, umsetzbar)

Schreib direkt und knapp, wie eine Slack-Nachricht an einen Kollegen. Kein Marketing, keine Floskeln, kein "könnte interessant sein". Sprache: Deutsch, Schweizer Hochdeutsch.

Antworte mit genau diesem Format (die drei nummerierten Punkte als Markdown):
**1. Kernaussage:** <Text>
**2. Was bedeutet das für mich als PO?** <Text>
**3. Projektidee:** <Text>

Titel: ${artikel.titel}
Text: ${(artikel.rohtext || '').slice(0, 1500)}`;

const UEBERBLICK_PROMPT = (topArtikel) => `\
Du schreibst einen Überblick für einen Product Owner / Product Manager im Schweizer Digital- und InsurTech-Umfeld. Er ist kein Entwickler.

Fasse in 2-3 Sätzen zusammen: Was waren heute die wichtigsten KI-Themen, und was sollte ein PO davon mitnehmen?

Direkt und knapp, Schweizer Hochdeutsch, keine Floskeln.

Top-Artikel heute:
${topArtikel.map(a => `- ${a.titel} (Score ${a.score}): ${a.begründung}`).join('\n')}`;

async function aufbereiten(artikel, index, total) {
  console.log(`[${index + 1}/${total}] Aufbereitung: ${artikel.titel}`);
  return claudeText(ARTIKEL_PROMPT(artikel));
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

  const sorted = [...articles].sort((a, b) => b.score - a.score);
  const topArtikel = sorted.filter(a => a.score >= 4);
  const linkArtikel = sorted.filter(a => a.score === 3);

  console.log(`\n${topArtikel.length} Top-Artikel (Score >= 4), ${linkArtikel.length} Link-Artikel (Score 3)`);

  // Überblick generieren
  console.log('\nGeneriere Überblick...');
  const ueberblick = await claudeText(UEBERBLICK_PROMPT(topArtikel.length > 0 ? topArtikel : sorted.slice(0, 5)), 300);

  // Top-Artikel sequenziell aufbereiten (Rate Limiting)
  const aufbereitungen = [];
  for (let i = 0; i < topArtikel.length; i++) {
    const text = await aufbereiten(topArtikel[i], i, topArtikel.length);
    aufbereitungen.push(text);
  }

  // Markdown zusammensetzen
  const date = todayString();
  const lines = [
    `# KI-News – ${date}`,
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

  await postGithubIssue(date, markdown);
}

async function postGithubIssue(date, body) {
  const token = process.env.GH_PAT;
  if (!token) {
    console.warn('GH_PAT nicht gesetzt – GitHub Issue wird übersprungen.');
    return;
  }

  const payload = JSON.stringify({
    title: `KI-News Summary – ${date}`,
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
