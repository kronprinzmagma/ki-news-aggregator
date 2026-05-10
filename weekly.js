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

const API_TIMEOUT_MS = 120_000;
const GITHUB_TIMEOUT_MS = 30_000;
const MODEL = 'claude-sonnet-4-6';

// ─── HTTP-Hilfsfunktionen ─────────────────────────────────────────────────────

function httpsRequest(options, payload = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.setTimeout(API_TIMEOUT_MS, () => {
      req.destroy(new Error(`Timeout nach ${API_TIMEOUT_MS / 1000}s`));
    });
    req.on('error', reject);
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
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

// ─── Claude API ───────────────────────────────────────────────────────────────

async function claudeText(prompt, maxTokens = 1200) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY nicht gesetzt');

  const { status, body } = await httpsRequest(
    {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    },
    {
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }
  );

  if (status !== 200) throw new Error(`Claude API Fehler: HTTP ${status} – ${body.slice(0, 300)}`);

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`Claude API: ungültige JSON-Antwort – ${body.slice(0, 200)}`);
  }
  const content = parsed?.content?.[0]?.text;
  if (!content) throw new Error(`Claude API: leere Antwort – ${body.slice(0, 200)}`);
  return content.trim();
}

// ─── Issue-Parsing ────────────────────────────────────────────────────────────

/**
 * Parst ein Daily-Issue-Body und extrahiert Artikel als strukturierte Objekte.
 * Unterstützt beide Block-Varianten (alte und neue Bezeichnungen).
 */
function parseDailyIssue(issueDate, body) {
  const articles = [];
  // Artikel-Sektionen durch "---" getrennt
  const sections = body.split(/\n---\n/);

  for (const section of sections) {
    // Muss mit "### " beginnen (Artikel-Überschrift)
    const titleMatch = /^###\s+(.+)$/m.exec(section);
    if (!titleMatch) continue;

    const scoreMatch = /Score (\d)\/5 · \[([^\]]+)\]\((https?:\/\/[^)]+)\)/.exec(section);
    if (!scoreMatch) continue;

    const titel = titleMatch[1].trim();
    const score = parseInt(scoreMatch[1], 10);
    const quelle = scoreMatch[2].trim();
    const url = scoreMatch[3].trim();

    // Blöcke extrahieren – beide Varianten ("Was ist neu" / alter Stil)
    const neuMatch = /\*\*Was ist neu\*\*\s*([\s\S]*?)(?=\*\*|$)/.exec(section);
    const richtungMatch = /\*\*Was es für die KI-Richtung heisst\*\*\s*([\s\S]*?)(?=\*\*|$)/.exec(section)
      || /\*\*Warum es produktrelevant ist\*\*\s*([\s\S]*?)(?=\*\*|$)/.exec(section);
    const ankerMatch = /\*\*Build-Anker\*\*\s*([\s\S]*?)(?=\*\*|>|$)/.exec(section)
      || /\*\*Projektanker\*\*\s*([\s\S]*?)(?=\*\*|>|$)/.exec(section);

    const wasIstNeu = neuMatch ? neuMatch[1].replace(/\n+/g, ' ').trim() : '';
    const richtung = richtungMatch ? richtungMatch[1].replace(/\n+/g, ' ').trim() : '';
    const anker = ankerMatch ? ankerMatch[1].replace(/\n+/g, ' ').trim() : '';

    if (wasIstNeu || richtung) {
      articles.push({ datum: issueDate, titel, score, quelle, url, wasIstNeu, richtung, anker });
    }
  }

  return articles;
}

// ─── GitHub: Issues holen ─────────────────────────────────────────────────────

async function fetchDailyIssues(token, lookbackDays = 7) {
  const { status, body } = await githubRequest(
    token, 'GET',
    '/repos/kronprinzmagma/ki-news-aggregator/issues?state=all&per_page=20'
  );
  if (status !== 200) throw new Error(`GitHub Issues nicht ladbar: HTTP ${status}`);

  const issues = JSON.parse(body);
  const kiDailyIssues = issues
    .filter(i => /^KI Daily – \d{4}-\d{2}-\d{2}$/.test(i.title))
    .slice(0, lookbackDays);

  console.log(`[weekly] ${kiDailyIssues.length} KI-Daily-Issues der letzten ${lookbackDays} Tage gefunden`);
  return kiDailyIssues;
}

// ─── Woche berechnen ─────────────────────────────────────────────────────────

function isoWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return Math.round(((d - week1) / 86400000 + ((week1.getDay() + 6) % 7)) / 7) + 1;
}

function weekRange(referenceDate) {
  const d = new Date(referenceDate);
  const day = d.getDay(); // 0=So, 1=Mo, ...
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = dt => dt.toISOString().slice(0, 10);
  return { from: fmt(monday), to: fmt(sunday), kw: isoWeek(monday) };
}

// ─── Weekly-Prompt ────────────────────────────────────────────────────────────

const WEEKLY_PROMPT = (articles, weekInfo) => `Du schreibst den wöchentlichen KI-Digest für eine erfahrene Product Owner / Product Managerin mit technischer Hands-on-Ambition. Sie baut eigene Tools mit Claude Code und der Anthropic API. Sie will KI-Entwicklungen früh verstehen: was ändert sich für Produktstrategie, Build-vs-Buy, AI-Adoption, Kosten und eigene Prototypen.

Nicht im Scope: Backlog, Sprint-Mechanik, Stakeholder-Kommunikation, Jira-Integrationen.

Tonalität: Schweizer Hochdeutsch, direkt, kein Marketing.

---

**Woche KW ${weekInfo.kw} (${weekInfo.from} – ${weekInfo.to})**

Die Woche hatte ${articles.length} veröffentlichte Artikel in den Daily Issues. Hier ist der vollständige Input:

${articles.map((a, i) => `[${i + 1}] Score ${a.score}/5 | ${a.datum} | ${a.quelle}
Titel: ${a.titel}
Was ist neu: ${a.wasIstNeu}
Richtung: ${a.richtung}
Build-Anker: ${a.anker}
URL: ${a.url}`).join('\n\n')}

---

Erstelle einen wöchentlichen Digest als GitHub-Issue-Body in Markdown. Struktur:

1. **Einleitung** (3–4 Sätze): Was hat die Woche geprägt? Welche Strömung war dominant? Was hat sich gegenüber der Vorwoche verschoben (soweit erkennbar)?

2. **Top-Entwicklungen der Woche** (die 3–5 wichtigsten Artikel, nicht einfach die mit dem höchsten Score, sondern die strategisch bedeutsamsten):
   - Für jeden: Titel als Markdown-Link, kurze Neubewertung aus Wochenperspektive (2–3 Sätze), warum diese Woche wichtig
   - Feedback-Checkboxen: \`- [ ] Besonders wertvoll\` und \`- [ ] Später weiterverfolgen\`

3. **Strömungen der Woche** (2–3 Themencluster, je 1–2 Sätze): Was zieht sich wie ein roter Faden durch? Keine Aufzählung von Artikeln, sondern Muster benennen.

4. **Wochenimpuls** (1 konkreter Build-Anker für das Wochenende): Aktiver Imperativsatz, konkret genug für einen Abend mit Claude Code. Nicht aus einem einzelnen Artikel kopieren, sondern aus der Gesamtschau der Woche ableiten.

Wichtig:
- Keine Halluzinationen: Nur Fakten aus den gegebenen Artikeln
- Keine Titel-Wiederholungen als "Zusammenfassung"
- Kein PO/Stakeholder-Sprache (keine Begriffe wie "Roadmap", "Sprint", "Backlog")
- Maximal 500 Wörter gesamt`;

// ─── GitHub: Weekly Issue erstellen ──────────────────────────────────────────

async function upsertWeeklyIssue(token, weekInfo, body) {
  const issueTitle = `KI Weekly – KW ${weekInfo.kw} (${weekInfo.from} – ${weekInfo.to})`;

  // Prüfen ob bereits vorhanden
  const q = new URLSearchParams({
    q: `repo:kronprinzmagma/ki-news-aggregator is:issue in:title "KI Weekly – KW ${weekInfo.kw}"`,
  });
  const { status: searchStatus, body: searchBody } = await githubRequest(
    token, 'GET', `/search/issues?${q}`
  );

  if (searchStatus === 200) {
    let result;
    try { result = JSON.parse(searchBody); } catch { result = { items: [] }; }
    const existing = result.items?.find(i => i.title === issueTitle);
    if (existing) {
      console.log(`[weekly] Issue existiert bereits: ${existing.html_url}`);
      return existing.html_url;
    }
  }

  const { status, body: responseBody } = await githubRequest(
    token, 'POST',
    '/repos/kronprinzmagma/ki-news-aggregator/issues',
    { title: issueTitle, body, labels: ['weekly-digest'] }
  );

  if (status !== 201) {
    throw new Error(`GitHub Issue konnte nicht erstellt werden: HTTP ${status} – ${responseBody.slice(0, 200)}`);
  }

  const created = JSON.parse(responseBody);
  console.log(`[weekly] Issue erstellt: ${created.html_url}`);
  return created.html_url;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const token = process.env.GH_PAT;
  if (!token) {
    console.error('GH_PAT nicht gesetzt – Weekly Digest kann nicht erstellt werden.');
    process.exit(1);
  }

  const today = process.env.RUN_DATE || new Date().toISOString().slice(0, 10);
  const weekInfo = weekRange(today);
  console.log(`[weekly] Digest für KW ${weekInfo.kw}: ${weekInfo.from} – ${weekInfo.to}`);

  // Daily Issues der letzten 7 Tage holen
  const dailyIssues = await fetchDailyIssues(token, 7);

  if (dailyIssues.length === 0) {
    console.log('[weekly] Keine Daily Issues gefunden – kein Weekly Digest erstellt.');
    process.exit(0);
  }

  // Artikel aus allen Issues parsen, URL-Duplikate über Tage entfernen
  const allArticles = [];
  const seenUrls = new Set();
  for (const issue of dailyIssues) {
    const issueDate = issue.title.replace('KI Daily – ', '');
    const parsed = parseDailyIssue(issueDate, issue.body || '');
    console.log(`[weekly] ${issueDate}: ${parsed.length} Artikel geparsed`);
    for (const article of parsed) {
      if (!seenUrls.has(article.url)) {
        seenUrls.add(article.url);
        allArticles.push(article);
      }
    }
  }

  if (allArticles.length === 0) {
    console.log('[weekly] Keine Artikel aus Daily Issues extrahierbar – kein Weekly Digest erstellt.');
    process.exit(0);
  }

  console.log(`[weekly] ${allArticles.length} unique Artikel für Synthese (URL-Duplikate entfernt)`);

  // Wöchentlichen Digest per Claude generieren
  console.log('[weekly] Generiere Digest per Claude...');
  const digestBody = await claudeText(WEEKLY_PROMPT(allArticles, weekInfo), 1500);

  // Issue-Body zusammenbauen
  const issueBody = `# KI Weekly – KW ${weekInfo.kw}
*${weekInfo.from} – ${weekInfo.to} · ${allArticles.length} Artikel aus ${dailyIssues.length} Daily Issues*

${digestBody}

---
*Generiert aus den KI Daily Issues der Woche. Einzelartikel: [Daily Issues](https://github.com/kronprinzmagma/ki-news-aggregator/issues?q=label%3A)*`;

  // GitHub Issue erstellen
  const issueUrl = await upsertWeeklyIssue(token, weekInfo, issueBody);
  console.log(`[weekly] Fertig: ${issueUrl}`);
}

main().catch(err => {
  console.error('[weekly] Fehler:', err.message);
  process.exit(1);
});
