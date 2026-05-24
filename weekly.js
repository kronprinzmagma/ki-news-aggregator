import { loadEnv, requireEnv } from './lib/env.js';
import { claudeText, getUsageSummary } from './lib/claude.js';
import { githubRequest, ghPath } from './lib/github.js';
import { WEEKLY_MODEL, REPO_SLUG } from './lib/config.js';
import { recordUsage, closeStore } from './lib/store.js';

loadEnv();

// ─── Issue-Parsing ────────────────────────────────────────────────────────────

function parseDailyIssue(issueDate, body) {
  const articles = [];
  const sections = body.split(/\n---\n/);

  for (const section of sections) {
    const titleMatch = /^###\s+(.+)$/m.exec(section);
    if (!titleMatch) continue;
    const scoreMatch = /Score (\d)\/5 · \[([^\]]+)\]\((https?:\/\/[^)]+)\)/.exec(section);
    if (!scoreMatch) continue;

    const titel = titleMatch[1].trim();
    const score = Math.min(5, Math.max(1, parseInt(scoreMatch[1], 10) || 1));
    const quelle = scoreMatch[2].trim();
    const url = scoreMatch[3].trim();

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

async function fetchDailyIssues(token, lookbackDays = 7) {
  const { status, body } = await githubRequest(token, 'GET', ghPath.issues('?state=all&per_page=20'));
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
  const day = d.getDay(); // 0 = Sonntag, 1 = Montag, …

  // Wenn nicht Sonntag: letzte abgeschlossene Woche verwenden.
  // Sonst: aktuelle Woche (endet heute).
  const anchor = day === 0 ? d : (() => {
    const prev = new Date(d);
    prev.setDate(d.getDate() - day); // zurück zum letzten Sonntag
    return prev;
  })();

  const diffToMonday = -6;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + diffToMonday);
  const sunday = new Date(anchor);
  const fmt = dt => dt.toISOString().slice(0, 10);
  return { from: fmt(monday), to: fmt(sunday), kw: isoWeek(monday) };
}

// ─── Weekly-Prompt ────────────────────────────────────────────────────────────

const WEEKLY_PROMPT = (must, optional, weekInfo) => `Wöchentlicher KI-Digest für eine erfahrene Product Owner / PM mit Hands-on-Ambition (Claude Code, Anthropic API). Fokus: Produktstrategie, Build-vs-Buy, AI-Adoption, Kosten, eigene Prototypen. Nicht im Scope: Backlog, Sprint, Stakeholder.

Tonalität: Schweizer Hochdeutsch, direkt. Keine Überschrift am Anfang – Titel wird extern gesetzt.

---

KW ${weekInfo.kw} (${weekInfo.from} – ${weekInfo.to})

PFLICHTARTIKEL (Score 5, alle ins Issue):
${must.map((a, i) => `[P${i + 1}] ${a.datum} | ${a.quelle} | ${a.titel}
Neu: ${a.wasIstNeu}
Richtung: ${a.richtung}
URL: ${a.url}`).join('\n\n')}

OPTIONAL (Score 4, wähle 1–2 nach strategischer Bedeutung):
${optional.map((a, i) => `[O${i + 1}] ${a.datum} | ${a.quelle} | ${a.titel}
Neu: ${a.wasIstNeu}
Richtung: ${a.richtung}
URL: ${a.url}`).join('\n\n')}

---

Markdown-Struktur:

1. **Einleitung** (3–4 Sätze): Dominante Strömung der Woche, was hat sich gegenüber der Vorwoche verschoben?

2. **Top-Entwicklungen**: Alle P-Artikel zuerst, dann gewählte O-Artikel. Pro Artikel:
   - **Was passiert ist** (2–3 Sätze, nur Fakten aus dem Input – für jemanden der die Dailies nicht gelesen hat)
   - **Was das bedeutet** (1–2 Sätze, Implikation für Produkt/Build-vs-Buy)
   - **Kritische Einordnung** (1–2 Sätze, was fehlt im Bericht / welche Annahme könnte falsch sein)
   - \`- [ ] Besonders wertvoll\` und \`- [ ] Später weiterverfolgen\`

3. **Strömungen der Woche** (2–3 Cluster, je 2–3 Sätze): Muster benennen, keine Artikel-Aufzählung.

4. **Wochenimpuls** (1 konkreter Build-Anker + 1–2 Sätze Kontext): Aus der Gesamtschau der Woche, nicht aus einem Einzelartikel.

Regeln: Nur Fakten aus dem Input. P/O-Kürzel nicht in Überschriften. Ca. 700–900 Wörter.`;

async function createWeeklyIssue(token, weekInfo, body) {
  const issueTitle = `KI Weekly – KW ${weekInfo.kw} (${weekInfo.from} – ${weekInfo.to})`;

  const { status, body: responseBody } = await githubRequest(token, 'POST', ghPath.issues(),
    { title: issueTitle, body, labels: ['weekly-digest'] });

  if (status !== 201) {
    throw new Error(`GitHub Issue konnte nicht erstellt werden: HTTP ${status} – ${responseBody.slice(0, 200)}`);
  }

  const created = JSON.parse(responseBody);
  console.log(`[weekly] Issue erstellt: ${created.html_url}`);
  return created.html_url;
}

async function main() {
  const token = requireEnv('GH_PAT');
  requireEnv('ANTHROPIC_API_KEY');

  const today = process.env.RUN_DATE || new Date().toISOString().slice(0, 10);
  const weekInfo = weekRange(today);
  console.log(`[weekly] Digest für KW ${weekInfo.kw}: ${weekInfo.from} – ${weekInfo.to}`);

  const dailyIssues = await fetchDailyIssues(token, 7);

  if (dailyIssues.length === 0) {
    console.log('[weekly] Keine Daily Issues gefunden – kein Weekly Digest erstellt.');
    process.exit(0);
  }

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

  const mustArticles = allArticles.filter(a => a.score === 5);
  const optionalArticles = allArticles.filter(a => a.score < 5);
  console.log(`[weekly] ${allArticles.length} unique Artikel – ${mustArticles.length} Pflicht (Score 5), ${optionalArticles.length} optional (Score < 5)`);

  console.log('[weekly] Generiere Digest per Claude...');
  const digestBody = await claudeText(
    WEEKLY_PROMPT(mustArticles, optionalArticles, weekInfo),
    { model: WEEKLY_MODEL, maxTokens: 2800, timeoutMs: 120_000, logTag: 'weekly' }
  );

  const issueBody = `# KI Weekly – KW ${weekInfo.kw}
*${weekInfo.from} – ${weekInfo.to} · ${allArticles.length} Artikel (${dailyIssues.length} Daily Issues)*

> 🤖 **KI-generierter Inhalt.** Synthese und Einordnung sind von Claude (Anthropic) verfasst, aggregiert aus den Daily Issues der Woche. Hinweis nach EU AI Act Art. 50(4).

${digestBody}

*Generiert aus den KI Daily Issues der Woche. Einzelartikel: [Daily Issues](https://github.com/${REPO_SLUG}/issues?q=label%3A)*`;

  const issueUrl = await createWeeklyIssue(token, weekInfo, issueBody);
  console.log(`[weekly] Fertig: ${issueUrl}`);

  const usage = getUsageSummary();
  if (usage.totals.calls > 0) {
    console.log(`[usage] ${usage.totals.calls} Calls · in ${usage.totals.input_tokens} · cached ${usage.totals.cache_read_input_tokens} (Hit ${(usage.cache_hit_rate * 100).toFixed(1)}%) · out ${usage.totals.output_tokens} · $${usage.totals.usd.toFixed(4)}`);
    recordUsage({ run_date: weekInfo.to, stage: 'weekly', by_log_tag: usage.by_log_tag });
  }
}

main()
  .catch(err => { console.error('[weekly] Fehler:', err.message); process.exit(1); })
  .finally(() => closeStore());
