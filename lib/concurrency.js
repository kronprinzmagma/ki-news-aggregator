// Geteilter Concurrency-Helper: arbeitet eine Item-Liste mit maximal `limit`
// parallelen Workern ab. Fehlerbehandlung liegt bewusst in der Task-Funktion
// des Aufrufers (z.B. score: null bei Score-Fehlern, null bei Aufbereitungs-
// Fehlern) – wirft die Task-Funktion doch, bricht der gesamte Lauf ab.
//
// Genutzt von score.js (Sync-Fallback) und deliver.js (Aufbereitungen).

/**
 * @param {Array} items Eingabe-Liste
 * @param {number} limit Maximale Anzahl paralleler Tasks
 * @param {(item: any, index: number) => Promise<any>} task Pro-Item-Funktion
 * @returns {Promise<Array>} Ergebnisse in Eingabe-Reihenfolge
 */
export async function runWithConcurrency(items, limit, task) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await task(items[i], i);
    }
  }
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
