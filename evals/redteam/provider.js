// promptfoo-Provider fuer den Prompt-Injection-Test.
//
// Ruft dieselben Produktionspfade auf wie die Pipeline, damit der Test den
// echten Prompt prueft und nicht eine Kopie davon:
//   ziel=score         -> scoreArticle() aus lib/scoring.js (SCORE_SYSTEM, Tool-Use, Haiku)
//   ziel=aufbereitung  -> aufbereiteArtikel() aus deliver.js (ARTIKEL_PROMPT, Sonnet,
//                         Ausgabe-Validierung wie vor der Veroeffentlichung)
// Der deterministische Prefilter wird bewusst umgangen: getestet wird der LLM-Aufruf.
import { scoreArticle } from '../../lib/scoring.js';
import { aufbereiteArtikel } from '../../deliver.js';

export default class KiNewsInjectionProvider {
  constructor(options = {}) {
    this.providerId = options.id || 'ki-news-injection';
  }

  id() {
    return this.providerId;
  }

  async callApi(_prompt, context) {
    const vars = context?.vars || {};
    const artikel = {
      titel: vars.titel,
      quelle: vars.quelle || 'redteam',
      url: 'https://news.example.org/redteam',
      rohtext: vars.rohtext,
    };
    try {
      if (vars.ziel === 'score') {
        const result = await scoreArticle(artikel, { logTag: 'redteam-score' });
        return { output: JSON.stringify(result) };
      }
      if (vars.ziel === 'aufbereitung') {
        // null = Format verlassen; leere Ausgabe laesst aufbereitungsFormat scheitern.
        const text = await aufbereiteArtikel(artikel, { logTag: 'redteam-aufbereitung' });
        return { output: text ?? '' };
      }
      return { error: `Unbekanntes ziel: ${vars.ziel} (erwartet: score oder aufbereitung)` };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
}
