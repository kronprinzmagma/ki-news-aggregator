import { claudeText } from './claude.js';
import { synthesizeSpeech } from './tts.js';
import { getOrCreateRelease, uploadReleaseAsset } from './github.js';
import {
  AUDIO_SCRIPT_MODEL,
  AUDIO_TTS_MODEL,
  AUDIO_VOICE,
  AUDIO_RELEASE_TAG,
  AUDIO_RELEASE_NAME,
} from './config.js';

// Deutsche Sprechgeschwindigkeit grob ~130 Wörter/Minute. gpt-4o-mini-tts
// kostet ~$0.015 pro Audiominute. Beides nur für eine grobe Schätzung im
// run-summary – keine exakte Abrechnung.
const WORDS_PER_MINUTE = 130;
const USD_PER_AUDIO_MINUTE = 0.015;

const SCRIPT_PROMPT = ({ date, ueberblick, artikel }) => `Du schreibst die Hörfassung eines täglichen KI-News-Briefings, das eine Produktperson unterwegs (Pendeln, Sport) anhört. Aus dem geschriebenen Issue-Text wird ein flüssiger, gesprochener Monolog.

Regeln:
- Reiner Fliesstext zum Vorlesen. KEIN Markdown, keine Sternchen, keine Aufzählungszeichen, keine eckigen Klammern, keine URLs, keine Score-Angaben.
- Wandle Block-Überschriften ("Was ist neu", "Was es für die KI-Richtung heisst", "Build-Anker") in natürliche gesprochene Übergänge um, statt sie wörtlich vorzulesen.
- Pro Artikel ein kurzer, hörbarer Übergang mit dem Thema/Titel, dann die drei Inhalte als zusammenhängende Sätze.
- Sprich Zahlen und Abkürzungen aus, wie man sie sagen würde (z.B. "API" als "A-P-I" nur wenn nötig; Prozentzahlen ausschreiben).
- Erfinde nichts dazu. Nutze ausschliesslich den gelieferten Text.
- Tonalität: Deutsch, Schweizer Hochdeutsch, ruhig, sachlich, direkt. Keine Marketing-Floskeln.

Beginne mit genau diesem Intro-Satz: "KI Daily vom ${date}. Dieser Beitrag ist KI-generiert."
Danach der Tages-Überblick (frei nacherzählt), dann die Artikel. Schliesse mit einem kurzen Outro-Satz wie "Das war das KI Daily. Bis morgen."

Tages-Überblick:
${ueberblick}

Artikel (Titel, Quelle, aufbereiteter Text):
${artikel.map((a, i) => `${i + 1}. ${a.titel} (${a.quelle})\n${a.aufbereitung}`).join('\n\n')}`;

/**
 * Erzeugt aus dem fertigen Daily eine MP3-Hörfassung und hostet sie als
 * Release-Asset. Vollständig optional und fehlertolerant: fehlt der
 * OPENAI_API_KEY oder schlägt ein Schritt fehl, wird { audio_url: null, ... }
 * mit Fehlergrund zurückgegeben – der Daily-Lauf bricht nie daran ab.
 *
 * @returns {Promise<Object>} Audio-Metadaten für die run-summary.
 */
export async function generateDailyAudio({ date, ueberblick, aufbereitungen, topArtikel, token }) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[audio] OPENAI_API_KEY nicht gesetzt – Audio-Ausgabe übersprungen.');
    return { enabled: false, reason: 'OPENAI_API_KEY nicht gesetzt' };
  }
  if (!token) {
    console.warn('[audio] GH_PAT nicht gesetzt – Audio-Ausgabe übersprungen (Hosting nicht möglich).');
    return { enabled: false, reason: 'GH_PAT nicht gesetzt' };
  }

  try {
    const artikel = topArtikel.map((a, i) => ({ titel: a.titel, quelle: a.quelle, aufbereitung: aufbereitungen[i] }));

    console.log('[audio] Generiere Sprechfassung per Claude …');
    const script = await claudeText(SCRIPT_PROMPT({ date, ueberblick, artikel }), {
      model: AUDIO_SCRIPT_MODEL,
      maxTokens: 4000,
      timeoutMs: 120_000,
      logTag: 'audio-script',
    });

    console.log('[audio] Synthetisiere MP3 …');
    const mp3 = await synthesizeSpeech(script, { model: AUDIO_TTS_MODEL, voice: AUDIO_VOICE, logTag: 'audio-tts' });

    const wordCount = script.split(/\s+/).filter(Boolean).length;
    const estDurationSec = Math.round((wordCount / WORDS_PER_MINUTE) * 60);
    const estCostUsd = Number(((estDurationSec / 60) * USD_PER_AUDIO_MINUTE).toFixed(4));

    console.log('[audio] Lade MP3 als Release-Asset hoch …');
    const release = await getOrCreateRelease(token, AUDIO_RELEASE_TAG, AUDIO_RELEASE_NAME);
    if (!release) return { enabled: true, audio_url: null, error: 'Release konnte nicht angelegt/gelesen werden' };

    const assetName = `daily-${date}.mp3`;
    const audioUrl = await uploadReleaseAsset(token, release, assetName, mp3, 'audio/mpeg');
    if (!audioUrl) return { enabled: true, audio_url: null, error: 'Asset-Upload fehlgeschlagen' };

    console.log(`[audio] Audio bereit: ${audioUrl} (~${Math.round(estDurationSec / 60)}min, ~$${estCostUsd})`);
    return {
      enabled: true,
      audio_url: audioUrl,
      voice: AUDIO_VOICE,
      script_chars: script.length,
      word_count: wordCount,
      bytes: mp3.length,
      est_duration_sec: estDurationSec,
      est_cost_usd: estCostUsd,
    };
  } catch (err) {
    console.warn(`[audio] Audio-Ausgabe fehlgeschlagen: ${err.message}`);
    return { enabled: true, audio_url: null, error: err.message };
  }
}
