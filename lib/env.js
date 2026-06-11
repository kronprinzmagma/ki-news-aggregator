import { readFileSync } from 'fs';

let loaded = false;

export function loadEnv(path = '.env') {
  if (loaded) return;
  loaded = true;
  try {
    const lines = readFileSync(path, 'utf-8').split('\n');
    for (const line of lines) {
      const match = /^([^#=]+)=(.*)$/.exec(line.trim());
      if (!match) continue;
      const key = match[1].trim();
      // dotenv-Konvention: echte Umgebungsvariablen gewinnen über die Datei –
      // sonst übersteuert die lokale .env stillschweigend gesetzte Shell-Werte.
      if (key in process.env) continue;
      process.env[key] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* .env optional */ }
}

export function requireEnv(name) {
  loadEnv();
  const value = process.env[name];
  if (!value) {
    console.error(`${name} nicht gesetzt.`);
    process.exit(1);
  }
  return value;
}
