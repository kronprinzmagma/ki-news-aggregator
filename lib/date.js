export function todayString() {
  const raw = process.env.RUN_DATE || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    console.error(`Ungültiges RUN_DATE-Format: "${raw}". Erwartet: YYYY-MM-DD`);
    process.exit(1);
  }
  return raw;
}
