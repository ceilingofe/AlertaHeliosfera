// Actualiza public/data/events.json con las CME recientes de DONKI (NASA).
// Uso: NASA_API_KEY=tu_llave npm run data   (sin llave usa DEMO_KEY, con límite de uso)
// El navegador nunca llama a la NASA: el juego sólo lee este archivo ya guardado.
import { readFile, writeFile } from 'node:fs/promises';

const key = process.env.NASA_API_KEY || 'DEMO_KEY';
const end = new Date();
const start = new Date(end.getTime() - 30 * 86400000);
const fmt = (d) => d.toISOString().slice(0, 10);
const url = `https://api.nasa.gov/DONKI/CME?startDate=${fmt(start)}&endDate=${fmt(end)}&api_key=${key}`;

const path = new URL('../public/data/events.json', import.meta.url);
const current = JSON.parse(await readFile(path, 'utf8'));

try {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DONKI respondió ${res.status}`);
  const list = await res.json();
  current.recent = (Array.isArray(list) ? list : []).slice(-10).map((cme) => {
    const analysis = (cme.cmeAnalyses || []).find((a) => a.isMostAccurate) || (cme.cmeAnalyses || [])[0] || {};
    return {
      donkiActivityID: cme.activityID,
      startTime: cme.startTime,
      speedKmS: analysis.speed ?? null,
      halfAngleDeg: analysis.halfAngle ?? null,
      note: cme.note ? String(cme.note).slice(0, 200) : '',
      label: 'ARCHIVO REAL',
      source: 'DONKI (NASA CCMC)',
    };
  });
  current.generatedAt = fmt(end);
  await writeFile(path, JSON.stringify(current, null, 2) + '\n');
  console.log(`Listo: ${current.recent.length} CME recientes guardadas en events.json`);
} catch (err) {
  console.error('No se pudo consultar DONKI; se conserva events.json sin cambios.', err.message);
  process.exitCode = 1;
}
