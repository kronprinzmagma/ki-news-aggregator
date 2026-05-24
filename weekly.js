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

const WEEKLY_PROMPT = (must, optional, weekInfo) => `Wöchentlicher KI-Digest für eine erfahrene Product Owner / PM mit Hands-on-Ambition (Claude Code, Anthropic API). Nicht im Scope: Backlog, Sprint, Stakeholder.

Tonalität: Schweizer Hochdeutsch, direkt, kein Marketing-Sprech. Keine Überschrift am Anfang – Titel wird extern gesetzt.

---

KW ${weekInfo.kw} (${weekInfo.from} – ${weekInfo.to})

PFLICHTARTIKEL (Score 5, alle ins Issue):
${must.length > 0 ? must.map(a => `Score: ${a.score} | Quelle: ${a.quelle} | URL: ${a.url}
Titel: ${a.titel}
Neu: ${a.wasIstNeu}
Richtung: ${a.richtung}
Anker: ${a.anker}`).join('\n\n') : '(keine Score-5-Artikel diese Woche)'}

OPTIONAL (Score 4, wähle 1–2 nach strategischer Bedeutung):
${optional.slice(0, 10).map(a => `Score: ${a.score} | Quelle: ${a.quelle} | URL: ${a.url}
Titel: ${a.titel}
Neu: ${a.wasIstNeu}
Richtung: ${a.richtung}
Anker: ${a.anker}`).join('\n\n')}

---

Struktur der Ausgabe:

**Einleitung** (3–4 Sätze): Dominante Strömung der Woche, was hat sich gegenüber der Vorwoche verschoben?

Dann pro Artikel (alle Pflicht, dann 1–2 gewählte Optionale), durch eine Leerzeile getrennt. Jeder Artikel exakt so formatiert:

### [Titel]

Score [X]/5 · [[quelle]]([url])
- [ ] Besonders wertvoll
- [ ] Später weiterverfolgen
- [ ] Schlecht aufbereitet
- [ ] Irrelevanter Inhalt

**Was ist neu** (max. 3 Sätze): Nüchtern, kein Marketing. Nur belegbare Fakten aus dem Input. Nicht den Titel wiederholen.

**Was es für die KI-Richtung heisst** (1–2 Sätze): Konkreter Akteur + Bewegung. Verboten: "Build-vs-Buy verschiebt sich", "Effizienz wird zur Differenzierung", "der Engpass verschiebt sich".

**Build-Anker** (1–2 Sätze): Imperativsatz, konkretes Tool aus dem Artikel, messbare Ausgabe, in 2–4h mit Claude Code umsetzbar. Kein Hedging ("könnte man", "liesse sich"). Kein Kernel-Build, kein Modelltraining.

---

**Strömungen der Woche** (2–3 Cluster, je 2–3 Sätze): Übergreifende Muster benennen, keine Artikel-Aufzählung.

**Wochenimpuls** (1–2 Sätze): Ein konkreter Build-Anker aus der Gesamtschau der Woche.

Regeln: Nur Fakten aus dem Input. Kürzel wie P1/O2 nicht in der Ausgabe. Ca. 800–1000 Wörter gesamt.`;

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
    { model: WEEKLY_MODEL, maxTokens: 4000, timeoutMs: 120_000, logTag: 'weekly' }
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
