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

const API_TIMEOUT_MS = 120_000;
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

// Erkennt ob ein Artikel API-Features mit Pricing-Relevanz enthält.
// Nutzt das pricing_signal_found-Flag aus dem Ingest falls vorhanden,
// sonst Fallback auf Textsuche.
function hasPricingContext(artikel) {
  if (artikel.pricing_signal_found !== undefined) return artikel.pricing_signal_found;
  const text = `${artikel.titel} ${artikel.rohtext || ''}`.toLowerCase();
  return /api|sdk|pricing|price|cost|kosten|preis|\$|per token|per request|rate limit|limit/.test(text);
}

const ARTIKEL_PROMPT = (artikel) => {
  const pricingHint = hasPricingContext(artikel)
    ? '\n\nFalls der Text Kosten-, Preis- oder Limit-Informationen enthält: erwähne diese knapp im "Was ist neu"-Block. Falls keine solchen Angaben im Text sind, füge am Ende von "Was ist neu" folgende Zeile an: _Kosten/Limits: keine Angabe im Text._'
    : '';
  return `\
Du schreibst für eine erfahrene Product-Owner-/Product-Manager-Person, die KI-Produkte strategisch verstehen und zugleich eigene kleine AI-Prototypen bauen will.

WICHTIG: Keine Sprint-, Ticket- oder Stakeholder-Floskeln. Schreibe nicht generisch "als PO". Jede Aussage muss helfen, eine Produktentscheidung, Marktbeobachtung oder eigene Bauidee schärfer zu sehen.

Nutze ausschliesslich Titel und Text unten. Erfinde keine Firmen, Produkte, Zahlen, Integrationen, Kunden, technischen Details oder Schlussfolgerungen, die nicht aus dem Text hervorgehen. Wenn der Text zu dünn ist, benenne die Unsicherheit knapp statt Lücken zu füllen.

Schreibe genau drei Blöcke. Gesamt maximal 120 Wörter.

**Was ist neu** (max. 3 Sätze): Nüchtern, kein Marketing-Sprech. Nicht den Titel wiederholen. Was ist passiert, wer steckt dahinter, was ist konkret neu?${pricingHint} WICHTIG: Erfinde keine Modellnamen, Zahlen oder technischen Details die nicht explizit im Text stehen. Marketing-Begriffe wie "class-leading" oder "X-class reasoning" entweder als Zitat kennzeichnen oder durch belegte Benchmarks ersetzen. Wenn der Text zu dünn ist, schreibe "Volltext nicht verfügbar – Angaben basieren auf Teaser."

**Was es für die KI-Richtung heisst** (1–2 Sätze): Welche Strömung steckt dahinter? Nicht nur den Fakt beschreiben, sondern was dieser Schritt über die Entwicklungsrichtung der KI sagt. Konkret: welche Failure-Modes, Produktentscheidungen oder Marktverschiebungen folgen daraus?

**Build-Anker** (1–2 Sätze): Muss zwingend enthalten: (1) ein Verb im Imperativ, (2) ein konkretes Tool oder eine Technologie aus dem Artikeltext, (3) eine messbare Ausgabe ("siehst du X", "miss Y", "vergleiche Z"). Verbot: "könnte man", "liesse sich", "wäre möglich". Der Build-Anker muss thematisch zum Artikel passen – kein Themensprung.

Tonalität: Deutsch, Schweizer Hochdeutsch, direkt.

Titel: ${artikel.titel}
Text: ${(artikel.rohtext || '').slice(0, 3000)}`;
};

const REWRITE_PROMPT = (artikel, currentSummary, hints) => {
  return `\
Du überarbeitest eine bestehende Artikelaufbereitung für einen KI-News-Aggregator.

Die bisherige Aufbereitung hatte folgende Schwäche:
${hints.hint}

Schreibe die drei Blöcke neu. Gesamt maximal 120 Wörter. Selbe Struktur wie bisher.

**Was ist neu** (max. 3 Sätze): Nüchtern, kein Marketing-Sprech. Nicht den Titel wiederholen. Nur belegbare Fakten aus dem Text.

**Was es für die KI-Richtung heisst** (1–2 Sätze): Welche Strömung steckt dahinter? Nicht nur den Fakt beschreiben, sondern was dieser Schritt über die Entwicklungsrichtung der KI sagt.

**Build-Anker** (1–2 Sätze): Aktiver Imperativsatz. Konkret genug für einen Abend mit Claude Code. Kein Hedging ("könnte man", "liesse sich"). Erkenntnisgewinn im Satz selbst sichtbar.

Tonalität: Deutsch, Schweizer Hochdeutsch, direkt.

Bisherige Aufbereitung (zur Orientierung, nicht kopieren):
${currentSummary}

Titel: ${artikel.titel}
Text: ${(artikel.rohtext || '').slice(0, 3000)}`;
};

const UEBERBLICK_PROMPT = (topArtikel) => `\
Du schreibst den Einleitungstext eines täglichen KI-News-Issues für eine erfahrene Product-/PM-Person mit Hands-on-KI-Ambitionen.

Aufgabe: Genau 3–4 kurze Sätze. Erkenne das übergeordnete Muster des Tages – nicht die Summe der Artikel, sondern die Strömung dahinter. Kein Marketing, keine PO-/Stakeholder-Sprache, keine Titel-Wiederholung. Direkt, nüchtern, sachlich.

Halte jeden Satz unter 25 Wörtern. Zusammen maximal 100 Wörter. Kein JSON, kein Markdown, kein Aufzählung – nur Fliesstext.

Artikel heute (Titel + Scoring-Begründung):
${topArtikel.map((a, i) => `${i + 1}. ${a.titel}\n   Score ${a.score}: ${a.begründung}`).join('\n')}

Tonalität: Deutsch, Schweizer Hochdeutsch, direkt.`;

const REVIEW_PROMPT = ({ selectedArticles, lowScoreSamples }) => `\
Du bist eine unabhängige Review-Schlaufe für einen persönlichen KI-News-Aggregator.

Kontext:
- Das Daily-Issue ist für eine erfahrene Product-/PM-Person mit Hands-on-Ambition.
- Ziel ist nicht "alles Interessante", sondern wenige starke Signale für KI-Produkte, Plattformen, Build-vs-Buy, Nutzererwartungen, Kosten, Risiken und eigene AI-Prototypen.
- Diese Review-Schlaufe ist advisory: Sie liefert strukturierte Qualitäts- und Prozesshinweise. Sie ändert keine Auswahl selbst.

Bewerte jeden Artikel aus vier Perspektiven:
1. Produkt-Relevanz: Ist der Artikel für KI-Produkte/Plattformen/Strategie relevant?
2. Technische Substanz: Enthält der Input konkrete Details zu Capability, API, Architektur, Modell, Kosten, Lizenz oder Tooling?
3. Lernwert: Lohnt sich spätere Vertiefung für persönliche KI-Weiterbildung?
4. Aufbereitungsqualität: Reicht Titel/Text/Summary aus, oder wirkt der Input dünn/kaputt?

Bewerte zusätzlich den geschriebenen Output (issue_summary) – die drei Blöcke:
- "Was ist neu": Nüchtern, kein Marketing, keine Titel-Wiederholung, nur belegbare Fakten.
- "Was es für die KI-Richtung heisst": Zeigt die Strömung dahinter, nicht nur den Fakt.
- "Build-Anker": Aktiver Imperativsatz, konkret genug für einen Abend, kein Hedging.

Falls der Output eines Artikels in einer oder mehreren Dimensionen schwach ist, gib konkrete rewrite_hints – was genau soll besser werden. Diese werden genutzt, um den Artikel sofort neu aufzubereiten.

Analysiere:
- selected_articles: Artikel, die ins Issue kommen (inkl. issue_summary = geschriebener Output).
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
      "needs_rewrite": true | false,
      "rewrite_hint": "Ein Satz: Was genau soll besser werden? Nur ausfüllen wenn needs_rewrite=true, sonst null.",
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
      "recommendation": "konkrete, umsetzbare Empfehlung – nicht 'prüfen ob', sondern 'ändere X auf Y' oder 'füge Z hinzu'",
      "rationale": "ein Satz: warum würde das den Output konkret verbessern?",
      "auto_apply_safe": false
    }
  ],
  "overall_assessment": "maximal zwei Sätze – was war heute gut, was ist die wichtigste Verbesserungsmöglichkeit?"
}

Wichtig:
- needs_rewrite: true wenn issue_fit != "strong" ODER wenn einer der drei Blöcke klar verbesserungswürdig ist.
- rewrite_hint: Ein präziser Satz was verbessert werden soll. Nur wenn needs_rewrite=true, sonst null.
- Erfinde keine Details, die nicht im Input stehen.
- Wenn ein Originalartikel vermutlich spannend wäre, der Input aber dünn ist, markiere input_quality="thin".
- Setze auto_apply_safe immer auf false.

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
  const themes = [...new Set(topArtikel.map(topicLabel))];
  const topScore5 = topArtikel.filter(a => a.score === 5);
  const score5Part = topScore5.length > 0
    ? `Stärkstes Signal: ${topScore5.map(a => a.titel).join(' und ')}.`
    : `Stärkstes Signal: ${topArtikel[0].titel}.`;

  // Quellen-Verteilung für Kommentar
  const sources = [...new Set(topArtikel.map(a => a.quelle))];
  const sourceNote = sources.length === 1
    ? `Alle Artikel stammen heute aus derselben Quelle (${sources[0]}).`
    : `Quellen heute: ${sources.join(', ')}.`;

  // Thematische Aussage
  const themeStr = themes.length === 1
    ? `Thema: ${themes[0]}.`
    : `Schwerpunkte: ${themes.slice(0, 3).join(' · ')}.`;

  return [score5Part, themeStr, sourceNote].join(' ');
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
    raw_text: (article.rohtext || '').slice(0, 400),
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
      4000
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
  return claudeText(ARTIKEL_PROMPT(artikel), 600);
}

// "Lies auch"-Links: Findet thematisch verwandte Artikel-Paare im Issue.
// Kriterium: 2 gemeinsame Schlüsselwörter in Titel+Begründung, aber kein Dedup-Kandidat.
function findRelatedArticles(articles) {
  const stopWords = new Set([
    'und', 'die', 'der', 'das', 'ein', 'eine', 'mit', 'für', 'von', 'auf',
    'ist', 'in', 'an', 'zu', 'the', 'a', 'of', 'to', 'for',
    'with', 'and', 'or', 'is', 'are', 'at', 'by', 'from', 'how', 'why',
    'what', 'new', 'show', 'hn', 'using', 'via',
  ]);
  const words = (text) => new Set(
    (text || '').toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w))
  );
  const overlapCount = (a, b) => {
    const textA = `${a.titel} ${a.begründung || ''}`;
    const textB = `${b.titel} ${b.begründung || ''}`;
    const wa = words(textA);
    let count = 0;
    for (const w of words(textB)) if (wa.has(w)) count++;
    return count;
  };

  // Map: URL → [verwandte Artikel (Titel + URL)]
  const related = new Map();
  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const overlap = overlapCount(articles[i], articles[j]);
      if (overlap >= 2) {
        if (!related.has(articles[i].url)) related.set(articles[i].url, []);
        if (!related.has(articles[j].url)) related.set(articles[j].url, []);
        related.get(articles[i].url).push({ titel: articles[j].titel, url: articles[j].url });
        related.get(articles[j].url).push({ titel: articles[i].titel, url: articles[i].url });
      }
    }
  }
  return related;
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

  // Bereits in den letzten Issues veröffentlichte URLs laden (tagesübergreifende Dedup)
  const token = process.env.GH_PAT;
  const recentlyPublished = await fetchRecentlyPublishedUrls(token, 3);

  // Nur Score >= 4, nach Score absteigend, dann nach Quelle priorisieren (Lab > HN)
  const LAB_QUELLEN = new Set(['anthropic', 'openai', 'deepmind', 'latentspace', 'simonwillison']);
  const belowCutoff = articles.filter(a => a.score !== null && a.score < 4);
  const alreadyPublished = articles.filter(a => a.score >= 4 && recentlyPublished.has(a.url));
  if (alreadyPublished.length > 0) {
    console.log(`[dedup] ${alreadyPublished.length} Artikel bereits in vorherigen Issues – werden übersprungen:`);
    alreadyPublished.forEach(a => console.log(`  - ${a.titel}`));
  }
  const sorted = [...articles]
    .filter(a => a.score >= 4 && !recentlyPublished.has(a.url))
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
      cross_day_dedup: alreadyPublished.map(a => ({ titel: a.titel, url: a.url })),
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

  // Überblick per LLM aus Titeln und Scoring-Begründungen erzeugen.
  // Nutzt nur Daten, die bereits im scored-*.json vorhanden sind – kein rohtext nötig.
  let ueberblick;
  try {
    console.log('[deliver] Generiere Überblick per LLM...');
    ueberblick = await claudeText(UEBERBLICK_PROMPT(topArtikel), 300);
  } catch (err) {
    console.warn(`[deliver] LLM-Überblick fehlgeschlagen (${err.message}), falle auf deterministischen Fallback zurück`);
    ueberblick = buildOverview(topArtikel);
  }

  // Artikel sequenziell aufbereiten (Rate Limiting)
  const aufbereitungen = [];
  for (let i = 0; i < topArtikel.length; i++) {
    const text = await aufbereiten(topArtikel[i], i, topArtikel.length);
    aufbereitungen.push(text);
  }

  runSummary.review = await reviewRun(topArtikel, aufbereitungen, lowScoreSamples);

  // Rewrite-Schritt: Artikel mit needs_rewrite=true neu aufbereiten
  const reviewedArticles = runSummary.review?.result?.selected_articles || [];
  let rewriteCount = 0;
  for (let i = 0; i < topArtikel.length; i++) {
    const reviewResult = reviewedArticles.find(r => r.url === topArtikel[i].url);
    if (!reviewResult?.needs_rewrite || !reviewResult.rewrite_hint) continue;

    try {
      console.log(`[rewrite] Überarbeite "${topArtikel[i].titel}" (${reviewResult.rewrite_hint})`);
      const rewritten = await claudeText(REWRITE_PROMPT(topArtikel[i], aufbereitungen[i], { hint: reviewResult.rewrite_hint }), 600);
      aufbereitungen[i] = rewritten;
      rewriteCount++;
    } catch (err) {
      console.warn(`[rewrite] Überarbeitung fehlgeschlagen für "${topArtikel[i].titel}": ${err.message}`);
    }
  }
  if (rewriteCount > 0) console.log(`[rewrite] ${rewriteCount} Artikel neu aufbereitet`);
  runSummary.deliver.rewrites = rewriteCount;

  // "Lies auch"-Links berechnen
  const relatedMap = findRelatedArticles(topArtikel);

  // Markdown zusammensetzen
  const lines = [
    `# KI Daily – ${date}`,
    '',
    ueberblick,
    '',
  ];

  // Duplikat-Warnung: wenn Artikel durch Themen-Dedup zusammengeführt wurden
  if (dedupedOut.length > 0) {
    lines.push(`> **${dedupedOut.length} Artikel zum gleichen Event zusammengeführt:** ${dedupedOut.map(a => `[${a.titel}](${a.url})`).join(' · ')}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');

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

    // "Lies auch"-Links für verwandte Artikel im selben Issue
    const related = relatedMap.get(a.url);
    if (related && related.length > 0) {
      lines.push('');
      lines.push(`> **Lies auch:** ${related.map(r => `[${r.titel}](${r.url})`).join(' · ')}`);
    }

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

/**
 * Holt die URLs aller Hauptartikel aus den letzten N "KI Daily" Issues.
 * Verhindert, dass Artikel mehrere Tage in Folge im Issue erscheinen.
 */
async function fetchRecentlyPublishedUrls(token, lookbackDays = 3) {
  if (!token) return new Set();
  try {
    const { status, body } = await githubRequest(
      token, 'GET',
      '/repos/kronprinzmagma/ki-news-aggregator/issues?state=all&labels=&per_page=10'
    );
    if (status !== 200) {
      console.warn(`[dedup] GitHub Issues nicht ladbar: HTTP ${status}`);
      return new Set();
    }
    const issues = JSON.parse(body);
    const kiDailyIssues = issues
      .filter(i => /^KI Daily – \d{4}-\d{2}-\d{2}$/.test(i.title))
      .slice(0, lookbackDays);

    const seenUrls = new Set();
    // URL-Muster für Hauptartikel-Zeilen: "Score X/5 · [quelle](url)"
    const urlPattern = /Score \d\/5 · \[[^\]]+\]\((https?:\/\/[^)]+)\)/g;
    for (const issue of kiDailyIssues) {
      let match;
      while ((match = urlPattern.exec(issue.body || '')) !== null) {
        seenUrls.add(match[1]);
      }
    }
    console.log(`[dedup] ${seenUrls.size} URLs aus ${kiDailyIssues.length} vorherigen Issues geladen`);
    return seenUrls;
  } catch (err) {
    console.warn(`[dedup] Vorherige Issues nicht ladbar: ${err.message}`);
    return new Set();
  }
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
