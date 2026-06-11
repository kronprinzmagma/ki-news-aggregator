import { loadEnv, requireEnv } from './lib/env.js';
import { claudeText, getUsageSummary } from './lib/claude.js';
import { githubRequest, ghPath } from './lib/github.js';
import { WEEKLY_MODEL, REPO_SLUG } from './lib/config.js';
import { recordUsage, closeStore } from './lib/store.js';
import { parseArticleSections } from './lib/issue-format.js';

loadEnv();

// ─── Issue-Parsing ────────────────────────────────────────────────────────────

// Titel im Issue sind sanitizeMarkdown-escapt – fürs Weekly (Prompt + Belege-Links)
// wieder entescapen, sonst landen \[ \* etc. in der Ausgabe.
function unescapeMarkdown(s) {
  return (s || '').replace(/\\([`*_[\]()#><])/g, '$1');
}

function extractBlocks(section) {
  const neuMatch = /\*\*Was ist neu\*\*\s*([\s\S]*?)(?=\*\*|$)/.exec(section);
  const richtungMatch = /\*\*Was es für die KI-Richtung heisst\*\*\s*([\s\S]*?)(?=\*\*|$)/.exec(section)
    || /\*\*Warum es produktrelevant ist\*\*\s*([\s\S]*?)(?=\*\*|$)/.exec(section);
  const ankerMatch = /\*\*Build-Anker\*\*\s*([\s\S]*?)(?=\*\*|>|$)/.exec(section)
    || /\*\*Projektanker\*\*\s*([\s\S]*?)(?=\*\*|>|$)/.exec(section);
  return {
    wasIstNeu: neuMatch ? neuMatch[1].replace(/\n+/g, ' ').trim() : '',
    richtung: richtungMatch ? richtungMatch[1].replace(/\n+/g, ' ').trim() : '',
    anker: ankerMatch ? ankerMatch[1].replace(/\n+/g, ' ').trim() : '',
  };
}

function parseDailyIssue(issueDate, body) {
  // Primärquelle: versionierte ki-news-meta-Marker (url/score/quelle/titel
  // robust, Blöcke positionssicher zugeordnet). Regex nur als Fallback für
  // Issues vor Einführung der Marker.
  const sections = parseArticleSections(body);
  if (sections.some(s => s.meta)) {
    return sections
      .filter(s => s.meta)
      .map(({ meta, block }) => ({
        datum: issueDate,
        titel: unescapeMarkdown(meta.titel),
        score: Math.min(5, Math.max(1, Number(meta.score) || 1)),
        quelle: meta.quelle,
        url: meta.url,
        ...extractBlocks(block),
      }))
      .filter(a => a.wasIstNeu || a.richtung);
  }

  // Fallback: altes Regex-Parsing über "Score X/5 · [quelle](url)".
  const articles = [];
  for (const section of body.split(/\n---\n/)) {
    const titleMatch = /^###\s+(.+)$/m.exec(section);
    if (!titleMatch) continue;
    const scoreMatch = /Score (\d)\/5 · \[([^\]]+)\]\((https?:\/\/[^)]+)\)/.exec(section);
    if (!scoreMatch) continue;

    const blocks = extractBlocks(section);
    if (blocks.wasIstNeu || blocks.richtung) {
      articles.push({
        datum: issueDate,
        titel: unescapeMarkdown(titleMatch[1].trim()),
        score: Math.min(5, Math.max(1, parseInt(scoreMatch[1], 10) || 1)),
        quelle: scoreMatch[2].trim(),
        url: scoreMatch[3].trim(),
        ...blocks,
      });
    }
  }
  return articles;
}

async function fetchDailyIssues(token, lookbackDays = 7) {
  // Label-Filter + grosszügiges per_page: der ungefilterte Issues-Endpoint
  // liefert Weeklies/PRs mit, wodurch der Lookback stillschweigend schrumpft.
  const { status, body } = await githubRequest(token, 'GET', ghPath.issues('?state=all&labels=summary&per_page=50'));
  if (status !== 200) throw new Error(`GitHub Issues nicht ladbar: HTTP ${status}`);

  const issues = JSON.parse(body);
  const kiDailyIssues = issues
    .filter(i => !i.pull_request)
    .filter(i => /^KI Daily – \d{4}-\d{2}-\d{2}$/.test(i.title))
    .slice(0, lookbackDays);

  console.log(`[weekly] ${kiDailyIssues.length} KI-Daily-Issues der letzten ${lookbackDays} Tage gefunden`);
  return kiDailyIssues;
}

// ─── Woche berechnen ─────────────────────────────────────────────────────────

// Durchgängig UTC: "YYYY-MM-DD" parst als UTC-Mitternacht – lokale
// Date-Methoden würden westlich von UTC einen Off-by-one-Tag erzeugen.
function isoWeek(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const week1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return Math.round(((d - week1) / 86400000 + ((week1.getUTCDay() + 6) % 7)) / 7) + 1;
}

function weekRange(referenceDate) {
  const d = new Date(referenceDate);
  const day = d.getUTCDay(); // 0 = Sonntag, 1 = Montag, …

  // Wenn nicht Sonntag: letzte abgeschlossene Woche verwenden.
  // Sonst: aktuelle Woche (endet heute).
  const anchor = day === 0 ? d : (() => {
    const prev = new Date(d);
    prev.setUTCDate(d.getUTCDate() - day); // zurück zum letzten Sonntag
    return prev;
  })();

  const monday = new Date(anchor);
  monday.setUTCDate(anchor.getUTCDate() - 6);
  const sunday = new Date(anchor);
  const fmt = dt => dt.toISOString().slice(0, 10);
  return { from: fmt(monday), to: fmt(sunday), kw: isoWeek(monday) };
}

// ─── Weekly-Prompt ────────────────────────────────────────────────────────────

const WEEKLY_PROMPT = (articles, weekInfo) => `Wöchentlicher KI-Digest für eine erfahrene Product Owner / PM OHNE tiefes Engineering-Wissen, mit Hands-on-Ambition (Claude Code, Anthropic API). Nicht im Scope: Backlog, Sprint, Stakeholder.

Das Weekly ist KEINE Wiederholung der Daily-Artikel. Es ist ein redaktioneller Wochenrückblick: Du identifizierst die WICHTIGSTEN ÜBERGREIFENDEN THEMEN der Woche und bereitest sie ausführlicher und verständlicher auf als die einzelnen Daily-Einträge. Die Leserin hat die Daily-Artikel schon gesehen – Mehrwert entsteht NUR durch Synthese und Einordnung, nicht durch erneutes Nacherzählen.

Tonalität: Schweizer Hochdeutsch, direkt, kein Marketing-Sprech. Keine Überschrift am Anfang – Titel wird extern gesetzt.

VERSTÄNDLICHKEIT IST PFLICHT: Jeder Fachbegriff, jedes Kürzel und jede Benchmark-/Parameter-Zahl, die ein Produktmensch ohne Engineering-Hintergrund nicht sofort einordnet, wird in einem Halbsatz erklärt oder weggelassen – deutsch wie englisch, auch Zahlen (nicht "550B Parameter, 55B aktiv" oder "SWE-Bench 51,2 %" ohne Einordnung). Würde der Satz einen Nicht-Techniker stocken lassen, formuliere ihn um.

---

KW ${weekInfo.kw} (${weekInfo.from} – ${weekInfo.to})

ARTIKEL-POOL DER WOCHE (nach Score sortiert, Score 5 = stärkstes Signal):
${articles.map(a => `Score: ${a.score} | Quelle: ${a.quelle} | URL: ${a.url}
Titel: ${a.titel}
Neu: ${a.wasIstNeu}
Richtung: ${a.richtung}`).join('\n\n')}

---

Struktur der Ausgabe (Markdown):

**Einleitung** (3–4 Sätze): Dominante Strömung der Woche. Was hat sich gegenüber der Vorwoche verschoben? Direkt, verständlich, kein Jargon.

Dann GENAU 3 Themen der Woche. Wähle die drei wichtigsten übergreifenden Themen aus dem Pool (nicht zwingend die drei höchsten Scores – sondern die, die zusammen die Story der Woche ergeben). Score-5-Artikel sind starke Kandidaten, aber keine Pflicht. Jedes Thema exakt so:

### [Thema-Titel: prägnant, kein Artikel-Titel]
- [ ] Besonders wertvoll
- [ ] Später weiterverfolgen
- [ ] Zu kompliziert erklärt
- [ ] Thema nicht relevant

[Ein ausführlicher Absatz, 4–6 Sätze: Was ist diese Woche zu diesem Thema passiert (verständlich zusammengefasst, mehrere Artikel zu einem Bild verbunden)? Warum hängen diese Entwicklungen zusammen? Was bedeutet das für die KI-Richtung und für konkrete Produktentscheidungen? Konkreter Akteur + Bewegung, keine Schablonen wie "der Engpass verschiebt sich".]

**Dran bleiben:** [Ein Beobachtungs- oder Build-Anker für das Thema: im Browser oder mit Claude in unter 1–2h machbar, mit messbarer/vergleichender Erkenntnis. Kein Entwickler-Setup, kein Kernel-Build, kein Modelltraining.]

_Belege:_ [2–4 stützende Artikel als kompakte Liste, je eine Zeile: [Titel](url) (Quelle, Score X) – ein Halbsatz, warum er zum Thema gehört.]

---

**Wochenimpuls** (1–2 Sätze): Ein konkreter Anker aus der Gesamtschau der Woche.

Regeln: Nur Fakten aus dem Input. Keine Artikel-Volltextwiederholung – Artikel erscheinen nur in den Belegen-Listen. Kürzel wie P1/O2 nicht in der Ausgabe. Ziel ca. 600–800 Wörter – die Themen-Absätze sind der Kern, nicht eine lange Artikelliste.`;

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

  const fetched = await fetchDailyIssues(token, 7);

  // Nur Dailies aus dem im Titel ausgewiesenen Wochenbereich: bei leeren
  // Tagen würden sonst ältere Issues von ausserhalb der Woche einfliessen.
  const dailyIssues = fetched.filter(issue => {
    const issueDate = issue.title.replace('KI Daily – ', '');
    return issueDate >= weekInfo.from && issueDate <= weekInfo.to;
  });
  if (fetched.length !== dailyIssues.length) {
    console.log(`[weekly] ${fetched.length - dailyIssues.length} Daily-Issues ausserhalb ${weekInfo.from} – ${weekInfo.to} ignoriert`);
  }

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

  // Themen-zentriert: Claude wählt die 3 wichtigsten Themen aus dem ganzen Pool.
  // Score 5 zuerst (stärkstes Signal), dann Score 4 – keine Pflicht-Ausbreitung mehr.
  const articlePool = [...allArticles].sort((a, b) => b.score - a.score).slice(0, 20);
  const score5Count = articlePool.filter(a => a.score === 5).length;
  console.log(`[weekly] ${allArticles.length} unique Artikel – Pool für Themenwahl: ${articlePool.length} (davon ${score5Count} Score 5)`);

  console.log('[weekly] Generiere themen-zentrierten Digest per Claude...');
  const digestBody = await claudeText(
    WEEKLY_PROMPT(articlePool, weekInfo),
    { model: WEEKLY_MODEL, maxTokens: 4000, timeoutMs: 120_000, logTag: 'weekly' }
  );

  const issueBody = `# KI Weekly – KW ${weekInfo.kw}
*${weekInfo.from} – ${weekInfo.to} · ${allArticles.length} Artikel (${dailyIssues.length} Daily Issues)*

> 🤖 **KI-generierter Inhalt.** Synthese und Einordnung sind von Claude (Anthropic) verfasst, aggregiert aus den Daily Issues der Woche. Hinweis nach EU AI Act Art. 50(4).

${digestBody}

*Generiert aus den KI Daily Issues der Woche. Einzelartikel: [Daily Issues](https://github.com/${REPO_SLUG}/issues?q=label%3Asummary)*`;

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
