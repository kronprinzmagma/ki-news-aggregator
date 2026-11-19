#!/usr/bin/env node
/**
 * Kurze Vorlese-Probe: liest einen festen, öffentlichen Testsatz über die
 * Realtime-API vor und speichert `tts-probe.mp3` lokal. Kein Upload, keine
 * Issue-Daten. Kostet Bruchteile eines Cents.
 *
 *   node scripts/tts-probe.js
 *
 * Benötigt: OPENAI_API_KEY und lame (oder ffmpeg).
 */

import fs from 'fs/promises';
import { requireEnv } from '../lib/env.js';
import { synthesizeSpeech } from '../lib/tts.js';
import { ttsCostUsd } from '../lib/audio.js';
import { AUDIO_TTS_MODEL, AUDIO_VOICE } from '../lib/config.js';

const PROBE_TEXT = 'KI Daily, Vorlese-Probe. Dieser Beitrag ist KI-generiert. '
  + 'Heute geht es um eine neue Funktion, mit der ein Sprachmodell längere Dokumente schneller zusammenfasst.';

requireEnv('OPENAI_API_KEY');

let stats = null;
const mp3 = await synthesizeSpeech(PROBE_TEXT, {
  model: AUDIO_TTS_MODEL,
  voice: AUDIO_VOICE,
  logTag: 'tts-probe',
  onStats: (s) => { stats = s; },
});
await fs.writeFile('tts-probe.mp3', mp3);
console.log(JSON.stringify({
  model: AUDIO_TTS_MODEL,
  voice: AUDIO_VOICE,
  mp3_bytes: mp3.length,
  ...stats,
  cost_usd: ttsCostUsd(stats),
}, null, 2));
