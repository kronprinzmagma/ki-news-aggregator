#!/usr/bin/env node
/**
 * Generiert das Podcast-Cover (assets/cover.png, 1400×1400) ohne npm-Abhängig-
 * keiten: minimaler PNG-Encoder (node:zlib + eigener CRC32). Apple Podcasts
 * verlangt Channel-Artwork zwischen 1400 und 3000 px.
 *
 * Design: dunkler Diagonal-Verlauf mit hellem "KI"-Wellenmuster – bewusst
 * schlicht; bei Bedarf einfach durch ein eigenes PNG ersetzen.
 *
 * Verwendung: node scripts/make-cover.js
 */

import fs from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, '..', 'assets', 'cover.png');

const W = 1400;
const H = 1400;

// ─── PNG-Encoder ─────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

function encodePng(width, height, rgb) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: truecolor RGB
  // compression/filter/interlace = 0

  // Pro Zeile ein Filter-Byte (0 = none) vor den Pixeldaten.
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0;
    rgb.copy(raw, rowStart + 1, y * width * 3, (y + 1) * width * 3);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Motiv ───────────────────────────────────────────────────────────────────

function renderCover() {
  const rgb = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = (x + y) / (W + H); // 0..1 diagonal
      // Verlauf: tiefes Blau → Violett.
      let r = Math.round(18 + t * 70);
      let g = Math.round(24 + t * 18);
      let b = Math.round(48 + t * 110);
      // Wellenmuster (angedeutete Audio-Wellenform in der unteren Hälfte).
      const wave = Math.sin(x / 55) * 120 + Math.sin(x / 23) * 50;
      const waveCenter = H * 0.62;
      const dist = Math.abs(y - (waveCenter + wave));
      if (dist < 14) {
        const glow = 1 - dist / 14;
        r = Math.min(255, r + Math.round(glow * 140));
        g = Math.min(255, g + Math.round(glow * 160));
        b = Math.min(255, b + Math.round(glow * 200));
      }
      // Punktraster oben links als dezentes "Daten"-Motiv.
      if (x % 70 < 6 && y % 70 < 6 && x < W * 0.45 && y < H * 0.35) {
        r = Math.min(255, r + 60); g = Math.min(255, g + 70); b = Math.min(255, b + 90);
      }
      const o = (y * W + x) * 3;
      rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b;
    }
  }
  return rgb;
}

const png = encodePng(W, H, renderCover());
await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
await fs.writeFile(OUT_FILE, png);
console.log(`[cover] ${OUT_FILE} geschrieben (${(png.length / 1024).toFixed(0)} KB, ${W}×${H})`);
