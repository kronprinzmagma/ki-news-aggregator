import fs from 'fs/promises';

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function scoreBar(score) {
  return '★'.repeat(score) + '☆'.repeat(5 - score);
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

  const date = todayString();
  const lines = [
    `# KI-News Summary – ${date}`,
    '',
    `_${sorted.length} relevante Artikel (Score ≥ 3), sortiert nach Relevanz_`,
    '',
    '---',
    '',
  ];

  for (const article of sorted) {
    lines.push(`## ${article.titel}`);
    lines.push('');
    lines.push(`**Score:** ${scoreBar(article.score)} (${article.score}/5)  `);
    lines.push(`**Quelle:** ${article.quelle}  `);
    lines.push(`**Datum:** ${article.datum}  `);
    lines.push(`**Link:** [${article.url}](${article.url})`);
    lines.push('');
    lines.push(`> ${article.begründung}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  const markdown = lines.join('\n');
  const filename = `summary-${date}.md`;
  await fs.writeFile(filename, markdown, 'utf-8');
  console.log(`Gespeichert: ${filename}`);
}

main();
