# Code Review – ki-news-aggregator

**Datum:** 2026-05-09
**Tiefe:** Standard (alle Dateien vollständig gelesen)
**Reviewer:** Claude (adversarial review)

---

## Zusammenfassung

| Severity | Anzahl |
|----------|--------|
| Critical | 4      |
| Warning  | 7      |
| Info     | 4      |

Der jüngste Fix-Commit hat die Robustheit deutlich verbessert – Socket-Timeouts, Redirect-Schutz und defensives API-Parsing sind in den meisten Adaptern korrekt umgesetzt. Es verbleiben jedoch **zwei funktionale Lücken** (fehlender 5-Artikel-Cap und fehlende Retry-After-Auswertung in `deliver.js`) sowie **drei Adapter** (`huggingface`, `thebatch`, `venturebeat`) die keinerlei Socket-Timeout setzen und damit das prozessweite 10s-ingest-Timeout umgehen. Sechs weitere Adapter haben kein HTML-Entity-Decoding für Titel, was zu kodierten Zeichen (`&amp;`, `&lt;`) in Issues führt.

---

## Critical

### [Critical] CR-01 – 5-Artikel-Limit in `deliver.js` nicht implementiert

**Datei:** `deliver.js:406–408`

**Problem:** CLAUDE.md definiert explizit "Maximal 5 Artikel pro Issue". Die Pipeline filtert und dedupliciert, aber schneidet nie ab. Das `over_limit`-Feld im Run-Summary wird initialisiert (Zeile 432), aber nie befüllt – ein starkes Indiz dafür, dass das Limit bewusst geplant aber nicht eingebaut wurde. An starken Tagen können 10+ Artikel mit Score >= 4 das Issue unkontrolliert aufblähen, was GitHub-Issues unlesbar macht und die Claude-Kosten pro Deliver-Lauf erhöht.

**Fix:**
```js
// Nach Zeile 407 (nach dedupByTheme), vor topArtikel-Zuweisung:
const MAX_ISSUE_ARTICLES = 5;
const topArtikel = deduped.slice(0, MAX_ISSUE_ARTICLES);
const overLimit = deduped.slice(MAX_ISSUE_ARTICLES);

// und in runSummary.deliver:
over_limit: overLimit.map(a => ({
  titel: a.titel, url: a.url, quelle: a.quelle, score: a.score,
})),
```

---

### [Critical] CR-02 – `deliver.js` wertet `Retry-After`-Header bei 429 nicht aus

**Datei:** `deliver.js:40` und `deliver.js:72–78`

**Problem:** `claudeRequest()` löst nur mit `{ status, body }` auf (Zeile 40), ohne `headers`. Bei einem 429 wird deshalb der `Retry-After`-Header ignoriert und nur der feste `retryDelay` verwendet. `score.js` macht das korrekt (Zeile 83: `headers: res.headers`). Bei einem Rate-Limit-Event von Claude Sonnet (teuerstes Modell, größte Payloads) kann die Pipeline daher in eine Retry-Schleife laufen, die zu kurz wartet und wiederholt scheitert.

**Fix:**
```js
// deliver.js Zeile 40:
res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));

// deliver.js Zeile 72:
const { status, body, headers: responseHeaders } = response;

// deliver.js Zeile 73–78 (analog zu score.js):
if (RETRYABLE_STATUSES.has(status)) {
  if (retries >= MAX_RETRIES) throw new Error(`Claude API Fehler: HTTP ${status} – maximale Retries erreicht`);
  const retryAfter = parseInt(responseHeaders?.['retry-after'] || '0', 10) * 1000;
  const delay = Math.max(retryDelay(retries), retryAfter);
  console.warn(`[deliver] HTTP ${status} – warte ${delay}ms, Retry ${retries + 1}/${MAX_RETRIES}`);
  await new Promise(r => setTimeout(r, delay));
  return claudeText(prompt, maxTokens, retries + 1);
}
```

---

### [Critical] CR-03 – `huggingface.js`, `venturebeat.js`, `thebatch.js`: kein Socket-Timeout

**Datei:** `adapters/huggingface.js:7–23`, `adapters/venturebeat.js:15–32`, `adapters/thebatch.js:7–23`

**Problem:** Alle drei Adapter haben kein `req.setTimeout()`. Das prozessweite `withTimeout` in `ingest.js` bricht zwar das Promise ab, aber der zugrundeliegende TCP-Socket bleibt offen und hält die Verbindung. Bei einem hängenden Server blockiert das Ressourcen für die gesamte Laufzeit des Prozesses. Im Gegensatz dazu setzen alle anderen Adapter (`hackernews`, `willison`, `latentspace`, `lastweekinai`, `aheadofai`, `interconnects`, `yannickilcher`) `req.setTimeout` korrekt. `thebatch.js` ist besonders betroffen, weil es `https.get()` ohne `const req =` aufruft und das Handle gar nicht festhält.

**Fix (exemplarisch für alle drei):**
```js
const REQUEST_TIMEOUT_MS = 10_000;

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'ki-news-aggregator/1.0' } }, (res) => {
      // ... bestehende Logik
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Timeout nach ${REQUEST_TIMEOUT_MS / 1000}s für ${url}`));
    });
    req.on('error', reject);
  });
}
```

---

### [Critical] CR-04 – `thebatch.js`: Redirect ohne `res.resume()`, ohne Timeout, ohne URL-Auflösung

**Datei:** `adapters/thebatch.js:7–23`

**Problem:** Drei Fehler kombiniert:
1. Bei einem Redirect (3xx) wird die erste Response-Body nicht via `res.resume()` entleert. Node.js hält den Socket offen bis der Body gelesen oder verworfen wird – möglicher Socket-Leak.
2. `res.headers.location` wird direkt als URL übergeben. Ein relativer Location-Header (`/new-path`) würde zu einem `https.get('/new-path')` führen und einen URL-Parse-Fehler werfen.
3. Der Redirect-Ziel-Request hat keinen Timeout (hängt zusammen mit CR-03).

**Fix:**
```js
function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume(); // Socket drainieren
        const nextUrl = new URL(res.headers.location, url).toString(); // relative URLs auflösen
        resolve(get(nextUrl)); // rekursiv mit vollem Error-Handling
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} für ${url}`));
        return;
      }
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.setTimeout(10_000, () => req.destroy(new Error(`Timeout für ${url}`)));
    req.on('error', reject);
  });
}
```

---

## Warning

### [Warning] WR-01 – Sechs Adapter ohne HTML-Entity-Decoding im Titel

**Datei:** `adapters/latentspace.js:110`, `adapters/interconnects.js:43`, `adapters/lastweekinai.js:43`, `adapters/aheadofai.js:43`, `adapters/thebatch.js:51`, `adapters/venturebeat.js:59`

**Problem:** `extractCdata()` entfernt nur CDATA-Wrapper, dekodiert aber keine HTML-Entities. RSS-Feeds liefern Titel wie `"OpenAI &amp; Anthropic announce..."` – diese landen unkorrigiert als Titeltext im JSON, in der Scoring-API und im GitHub-Issue. Referenz-Adapter `hackernews.js` und `willison.js` rufen `decodeHtmlEntities()` auf dem Titel auf.

**Fix:** In jedem betroffenen Adapter eine `decodeHtmlEntities()`-Funktion (analog zu `hackernews.js:52–63`) hinzufügen und auf `titel` anwenden:
```js
function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

// Anwendung auf Titel:
const titel = decodeHtmlEntities(extractCdata(titleMatch[1]));
```

---

### [Warning] WR-02 – `huggingface.js`, `thebatch.js`, `venturebeat.js`: HTTP-Fehler werden still ignoriert

**Datei:** `adapters/huggingface.js:19–21`, `adapters/thebatch.js:19–22`, `adapters/venturebeat.js:27–32`

**Problem:** Wenn der Server einen 4xx oder 5xx zurückgibt der kein Redirect ist, wird die leere oder fehlerhafte Body trotzdem aufgelöst. `parseAtom('')` bzw. `parseRss('')` liefern `[]` zurück, ohne dass ein Fehler geloggt wird. In `ingest.js` wird das als "0 Artikel geladen" verbucht – stilles Fehlverhalten. Der Referenz-Adapter (`hackernews.js:29–33`) lehnt Non-2xx-Responses mit `reject(new Error(...))` ab.

**Fix (für alle drei):**
```js
if (res.statusCode < 200 || res.statusCode >= 300) {
  res.resume();
  reject(new Error(`HTTP ${res.statusCode} für ${url}`));
  return;
}
```

---

### [Warning] WR-03 – `ingest.js`: äusseres Adapter-Timeout gleich wie inneres Socket-Timeout

**Datei:** `ingest.js:17`

**Problem:** `ADAPTER_TIMEOUT_MS = 10_000` (äussere Promise-Hülle) und `REQUEST_TIMEOUT_MS = 10_000` (Socket-Timeout der Adapter-internen `get()`-Funktion) sind identisch. Ein Adapter der intern mehrere HTTP-Anfragen macht (z.B. `hackernews.js` mit Artikel-Enrichment über bis zu 30 Artikel) hat faktisch null Budget zwischen Socket-Timeout und Adapter-Timeout. Der äussere Timeout feuert zur gleichen Zeit wie der erste Socket-Timeout – das Adapter-Promise wird nicht mehr korrekt abgebaut.

**Fix:**
```js
const ADAPTER_TIMEOUT_MS = 30_000; // Adapter-Gesamtlaufzeit, deutlich über Socket-Timeout
// In den Adaptern bleibt REQUEST_TIMEOUT_MS = 10_000 (Socket-Ebene)
```

---

### [Warning] WR-04 – `deliver.js`: `findExistingIssue()` parst GitHub-Response ohne try-catch

**Datei:** `deliver.js:554`

**Problem:** `const result = JSON.parse(body)` wird nicht in einem try-catch ausgeführt. Wenn die GitHub-Such-API eine unerwartete Response liefert (Rate-Limiting mit HTML-Body, temporärer Fehler), wirft `JSON.parse` einen SyntaxError der den gesamten `main()`-Promise rejected – und kein Issue wird erstellt, obwohl `summary-*.md` bereits geschrieben wurde.

**Fix:**
```js
let result;
try {
  result = JSON.parse(body);
} catch {
  console.warn(`GitHub Issue-Suche: ungültige JSON-Antwort – ${body.slice(0, 100)}`);
  return null;
}
return result.items?.find(issue => issue.title === issueTitle) || null;
```

---

### [Warning] WR-05 – `score.js`: `JSON.parse(text)` nach Claude-Output ohne try-catch

**Datei:** `score.js:128`

**Problem:** Zeile 127 bereinigt den Claude-Output mit Regex, Zeile 128 ruft `JSON.parse(text)` auf ohne try-catch. Wenn Claude trotz Prompt kein valides JSON liefert (halluzinierter Text, Token-Limit-Abschnitt), wirft der Parse-Error einen unbehandelten Fehler. Der Catch in `runWithConcurrency` fängt ihn auf und setzt `score: null`, aber der Log zeigt nur den Error-Message ohne den rohen Claude-Output – schwer zu debuggen.

**Fix:**
```js
let result;
try {
  result = JSON.parse(text);
} catch (err) {
  throw new Error(`JSON-Parse-Fehler: ${err.message} – Rohtext: "${text.slice(0, 200)}"`);
}
return { score: result.score, begründung: result.begründung };
```

---

### [Warning] WR-06 – `deliver.js`: Review-Schlaufe speichert Claude-Rohoutput nicht bei Fehler

**Datei:** `deliver.js:248–255`

**Problem:** Wenn `parseClaudeJson(text)` in `reviewRun()` fehlschlägt (Claude liefert kein valides JSON), enthält `runSummary.review` nur `{ enabled, mode, error }` – kein Hinweis was Claude tatsächlich geantwortet hat. Bei wiederholt schlechtem Claude-Output gibt es keinen Anhaltspunkt für Debugging.

**Fix:**
```js
// In der catch-Clause von reviewRun():
return {
  enabled: true,
  mode: 'advisory',
  error: err.message,
  raw_response: text?.slice(0, 500), // 'text' muss im scope sein
};
```

---

### [Warning] WR-07 – `yannickilcher.js`: kein `decodeHtmlEntities`, keine HTTP-Fehlerbehandlung

**Datei:** `adapters/yannickilcher.js:6–16`

**Problem:** YouTube-Atom-Feeds können Entities in Titeln enthalten (`&quot;`, `&#39;` etc.) – kein Decoding vorhanden. Ausserdem: keine HTTP-Statuscode-Prüfung. Ein 403 (YouTube-Feed gelegentlich für bestimmte IPs gesperrt) wird als leerer Feed behandelt, was den `throw new Error('Kein gültiger Atom-Feed empfangen')` auslöst – immerhin nicht still, aber ohne HTTP-Statuscode im Log.

**Fix:** `decodeHtmlEntities()` hinzufügen (analog zu `hackernews.js:52–63`) und auf `titel` anwenden. HTTP-Statuscode-Check vor dem Body-Lesen einbauen (analog zu WR-02).

---

## Info

### [Info] IN-01 – `thebatch.js`: Community-RSS ohne Fallback-Notiz

**Datei:** `adapters/thebatch.js:3–5`

**Problem:** Der Kommentar verweist auf `github.com/Olshansk/rss-feeds` als externe Abhängigkeit. Wenn dieses Repo eingestellt wird oder den Feed-Pfad ändert, fällt der Adapter still aus. Kein Hinweis auf Alternativquelle oder Monitoring.

**Fix:** TODO-Kommentar mit Fallback-Hinweis; alternativ regelmässige URL-Prüfung im Watchdog ergänzen.

---

### [Info] IN-02 – `deliver.js`: doppeltes `'in'` in der `stopWords`-Liste

**Datei:** `deliver.js:307`

**Problem:** Die `stopWords`-Liste in `dedupByTheme()` enthält `'in'` zweimal (einmal in der deutschen Gruppe auf Zeile 306, einmal in der englischen Gruppe auf Zeile 307). Kein funktionaler Bug, aber redundant.

**Fix:**
```js
// Zeile 307: zweites 'in' entfernen
'with', 'and', 'or', 'is', 'are', 'at', 'by', 'from', 'how', 'why',
```

---

### [Info] IN-03 – `deliver.js`: `buildOverview()` erfüllt Akzeptanzkriterium "Trend des Tages" nur teilweise

**Datei:** `deliver.js:188–203`

**Problem:** CLAUDE.md verlangt für den Überblick "Trend des Tages". `buildOverview()` konstruiert deterministisch drei Template-Sätze aus Artikeltiteln und Topic-Labels ohne LLM-Aufruf. Das ergibt Texte wie "Das Muster: günstigere Modell- und Training-Optionen, Produkt- und Plattformsignale." – maschinell und wenig aussagekräftig. Die bewusste Entscheidung gegen LLM-Halluzination ist verständlich, widerspricht aber dem genannten Akzeptanzkriterium.

**Fix:** Entweder das Akzeptanzkriterium in CLAUDE.md anpassen ("deterministisch aus Top-Titeln"), oder einen kurzen LLM-Aufruf für den Überblick einbauen (analog zu `aufbereiten()`).

---

### [Info] IN-04 – `huggingface.js`: Redirect-Location ohne URL-Auflösung

**Datei:** `adapters/huggingface.js:16`

**Problem:** `resolve(get(res.headers.location, redirects + 1))` übergibt den Location-Wert direkt. Ein relativer Location-Header (`/blog/new-feed`) würde zu einem URL-Parse-Fehler führen. Alle anderen Adapter mit Redirect-Unterstützung (`hackernews`, `willison`, `latentspace`, `venturebeat`) verwenden `new URL(location, base)`.

**Fix:**
```js
const nextUrl = new URL(res.headers.location, url).toString();
resolve(get(nextUrl, redirects + 1));
```

---

## Adapter-Qualitäts-Matrix

| Adapter        | Socket-Timeout | Redirect-Schutz   | HTTP-Fehler  | Entity-Decode | res.resume() |
|----------------|---------------|-------------------|--------------|---------------|--------------|
| hackernews     | ✓             | ✓ (3 Ebenen)      | ✓            | ✓             | ✓            |
| willison       | ✓             | ✓ (3 Ebenen)      | ✓            | ✓             | ✓            |
| latentspace    | ✓             | ✓ (3 Ebenen)      | ✓            | ✗ WR-01       | ✓            |
| lastweekinai   | ✓             | ✗ (kein Redirect) | ✗ WR-02      | ✗ WR-01       | –            |
| aheadofai      | ✓             | ✗ (kein Redirect) | ✗ WR-02      | ✗ WR-01       | –            |
| interconnects  | ✓             | ✗ (kein Redirect) | ✗ WR-02      | ✗ WR-01       | –            |
| yannickilcher  | ✓             | ✗ (kein Redirect) | ✗ WR-07      | ✗ WR-07       | –            |
| huggingface    | ✗ CR-03       | ✓ (partiell IN-04)| ✗ WR-02      | ✓             | ✓            |
| venturebeat    | ✗ CR-03       | ✓ (3 Ebenen)      | ✗ WR-02      | ✗ WR-01       | ✓            |
| thebatch       | ✗ CR-03       | ✗ CR-04           | ✗ WR-02      | ✗ WR-01       | ✗ CR-04      |

---

_Reviewed: 2026-05-09_
_Reviewer: Claude (adversarial, standard depth)_
