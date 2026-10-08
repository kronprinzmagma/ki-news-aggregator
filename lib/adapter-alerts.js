import { githubRequest, ghPath } from './github.js';

const adapterFromTitle = title => /^Adapter stale: ([a-z0-9_-]+) \(0 Artikel über \d+ Läufe\)$/.exec(title || '')?.[1];

// Resolve only the exact fetch-failure alerts this pipeline creates. A restored
// feed can still contain old articles; record that separately instead of
// claiming that the source has published new news.
export async function syncAdapterAlerts(token, { health, stale, runDate }, request = githubRequest) {
  if (!token) return [];
  const open = [];
  for (let page = 1; ; page++) {
    const response = await request(token, 'GET', ghPath.issues(`?state=open&labels=adapter-stale&per_page=100&page=${page}`));
    if (response.status !== 200) throw new Error(`Quellenwarnungen nicht lesbar: HTTP ${response.status}`);
    const issues = JSON.parse(response.body);
    open.push(...issues.filter(issue => !issue.pull_request && adapterFromTitle(issue.title)));
    if (issues.length < 100) break;
  }
  const outcomes = [];
  for (const issue of open) {
    const adapter = adapterFromTitle(issue.title);
    const recovered = health.find(row => row.name === adapter && row.fetched > 0 && !row.error);
    if (!recovered) continue;
    const note = `\n\n**Erholung geprüft am ${runDate}:** Der Feed liefert wieder ${recovered.fetched} Einträge ohne Abruffehler.${recovered.latest ? ` Neuster Eintrag: ${recovered.latest}.` : ''} Das bestätigt die Erreichbarkeit; Aktualität und redaktionelle Eignung werden weiterhin separat geprüft.`;
    const response = await request(token, 'PATCH', ghPath.issue(issue.number), { state: 'closed', state_reason: 'completed', body: (issue.body || '') + note });
    if (response.status !== 200) throw new Error(`Quellenwarnung #${issue.number} nicht geschlossen: HTTP ${response.status}`);
    outcomes.push({ adapter, action: 'closed', number: issue.number });
  }
  for (const row of stale) {
    const existing = open.find(issue => adapterFromTitle(issue.title) === row.adapter);
    const title = `Adapter stale: ${row.adapter} (0 Artikel über ${row.runs} Läufe)`;
    const failure = health.find(item => item.name === row.adapter)?.error;
    const body = `Der Adapter \`${row.adapter}\` hat in den letzten ${row.runs} Daily-Läufen 0 Artikel geliefert (letzter Lauf: ${row.latest_run}).${failure ? `\n\nAktueller Abruffehler: ${failure.slice(0, 300)}` : ''}\n\nFeed-Erreichbarkeit, Format und Quellenfilter prüfen. Die Warnung wird geschlossen, wenn der Adapter wieder Einträge ohne Abruffehler liefert.\n\n*Auto-generiert vom Daily-Ingest.*`;
    const response = existing
      ? await request(token, 'PATCH', ghPath.issue(existing.number), { title, body })
      : await request(token, 'POST', ghPath.issues(), { title, body, labels: ['adapter-stale'] });
    if (response.status !== (existing ? 200 : 201)) throw new Error(`Quellenwarnung für ${row.adapter} nicht gespeichert: HTTP ${response.status}`);
    outcomes.push({ adapter: row.adapter, action: existing ? 'updated' : 'created', number: JSON.parse(response.body).number });
  }
  return outcomes;
}
