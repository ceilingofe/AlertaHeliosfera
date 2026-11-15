import type { SampleType } from '../types';

export interface SampleSite {
  id: string;
  type: SampleType;
  x: number;
  y: number;
}

interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Dónde aparece cada tipo de muestra (inspirado en las zonas reales de Jezero):
 * - Roca con capas: Bright Angel (norte) y Séítah (suroeste).
 * - Suelo (regolito): alrededor del aterrizaje Octavia E. Butler y Séítah.
 * - Minerales con agua: Bright Angel y Three Forks (delta del antiguo río).
 * - Aire: zonas abiertas de Three Forks y Séítah.
 */
const AREAS: Record<SampleType, Area[]> = {
  roca: [
    { x: 400, y: 80, w: 480, h: 220 },
    { x: 120, y: 580, w: 360, h: 300 },
  ],
  suelo: [
    { x: 450, y: 560, w: 330, h: 120 },
    { x: 160, y: 560, w: 320, h: 300 },
    { x: 780, y: 600, w: 300, h: 200 },
  ],
  minerales: [
    { x: 420, y: 80, w: 460, h: 200 },
    { x: 840, y: 360, w: 360, h: 300 },
  ],
  aire: [
    { x: 860, y: 560, w: 340, h: 320 },
    { x: 120, y: 360, w: 280, h: 200 },
    { x: 960, y: 100, w: 260, h: 220 },
  ],
};

const BASE = { x: 640, y: 480 };
const ALL_TYPES: SampleType[] = ['roca', 'suelo', 'minerales', 'aire'];

/** Generador pseudoaleatorio con semilla (mulberry32) para que cada día sea reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Crea los sitios de muestra del día. Hay un poco más de los necesarios para la cuota
 * (para poder equivocarse), pero no infinitos: fallar un sitio lo arruina hasta mañana.
 * Los sitios lejanos obligan a planear el oxígeno.
 */
export function generateSampleSites(day: number, quota: Record<SampleType, number>): SampleSite[] {
  const rand = rng(day * 7919 + 17);
  const sites: SampleSite[] = [];

  // Día 1: una roca cerca de la base para aprender sin presión
  if (day === 1) {
    sites.push({ id: 'd1-roca-tuto', type: 'roca', x: 684, y: 540 });
  }

  for (const type of ALL_TYPES) {
    const needed = quota[type] ?? 0;
    // Margen: 1 extra por tipo pedido (2 desde el día 6 que la cuota sube) y 1 sitio
    // de los tipos no pedidos para quien quiera entregar de más.
    const count = needed > 0 ? needed + (day >= 6 ? 2 : 1) : 1;
    let made = 0;
    let guard = 0;
    while (made < count && guard < 400) {
      guard += 1;
      const areas = AREAS[type];
      const area = areas[Math.floor(rand() * areas.length)];
      const x = Math.round(area.x + rand() * area.w);
      const y = Math.round(area.y + rand() * area.h);
      if (Math.hypot(x - BASE.x, y - BASE.y) < 110) continue;
      if (sites.some((s) => Math.hypot(s.x - x, s.y - y) < 48)) continue;
      sites.push({ id: `d${day}-${type}-${made}`, type, x, y });
      made += 1;
    }
  }
  return sites;
}

/**
 * Genera un sitio de reemplazo del mismo tipo cuando el jugador aborta una misión,
 * manteniendo distancia segura respecto a la base y a los demás puntos del mapa.
 */
export function createReplacementSampleSite(
  type: SampleType,
  existing: { x: number; y: number }[],
  id: string,
  seed: number = Date.now()
): SampleSite {
  const rand = rng(seed);
  const areas = AREAS[type];
  for (let guard = 0; guard < 400; guard += 1) {
    const area = areas[Math.floor(rand() * areas.length)];
    const x = Math.round(area.x + rand() * area.w);
    const y = Math.round(area.y + rand() * area.h);
    if (Math.hypot(x - BASE.x, y - BASE.y) < 110) continue;
    if (existing.some((s) => Math.hypot(s.x - x, s.y - y) < 48)) continue;
    return { id, type, x, y };
  }
  const fallback = areas[0];
  return {
    id,
    type,
    x: Math.round(fallback.x + fallback.w * 0.5),
    y: Math.round(fallback.y + fallback.h * 0.5),
  };
}
