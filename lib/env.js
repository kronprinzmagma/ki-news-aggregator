import { readFileSync } from 'fs';

let loaded = false;

export function loadEnv(path = '.env') {
  if (loaded) return;
  loaded = true;
  try {
    const lines = readFileSync(path, 'utf-8').split('\n');
    for (const line of lines) {
      const match = /^([^#=]+)=(.*)$/.exec(line.trim());
      if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
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
