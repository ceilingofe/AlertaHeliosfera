/**
 * Cliente ligero y puro (sin Phaser) para consultar en vivo la API pública NASA DONKI (CME)
 * desde el navegador, con caché en sesión y respaldo silencioso al archivo curado local.
 */

export interface LiveCmeSnapshot {
  donkiActivityID: string;
  startTime: string;
  speedKmS: number | null;
  halfAngleDeg: number | null;
  note: string;
  fetchedAtMs: number;
}

const SESSION_CACHE_KEY = 'alerta-heliosfera:live-cme-v1';
const CACHE_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 3500;

interface RawDonkiAnalysis {
  isMostAccurate?: boolean;
  speed?: number | string | null;
  halfAngle?: number | string | null;
}

interface RawDonkiCme {
  activityID?: unknown;
  startTime?: unknown;
  note?: unknown;
  cmeAnalyses?: RawDonkiAnalysis[] | null;
}

/**
 * Extrae la eyección de masa coronal (CME) más reciente y completa de una respuesta JSON de NASA DONKI.
 */
export function parseDonkiCmeList(raw: unknown, nowMs = Date.now()): LiveCmeSnapshot | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  for (let i = raw.length - 1; i >= 0; i--) {
    const item = raw[i] as RawDonkiCme | null | undefined;
    if (!item || typeof item.activityID !== 'string' || item.activityID.trim().length === 0) {
      continue;
    }
    const analyses = Array.isArray(item.cmeAnalyses) ? item.cmeAnalyses : [];
    const primary = analyses.find((a) => a?.isMostAccurate) ?? analyses[0] ?? null;
    const rawSpeed = primary?.speed;
    const rawAngle = primary?.halfAngle;
    const speedNum = typeof rawSpeed === 'number' ? rawSpeed : Number(rawSpeed);
    const angleNum = typeof rawAngle === 'number' ? rawAngle : Number(rawAngle);

    return {
      donkiActivityID: item.activityID.trim(),
      startTime: typeof item.startTime === 'string' ? item.startTime : '',
      speedKmS: Number.isFinite(speedNum) && speedNum > 0 ? Math.round(speedNum) : null,
      halfAngleDeg: Number.isFinite(angleNum) && angleNum > 0 ? Math.round(angleNum) : null,
      note: typeof item.note === 'string' ? item.note.slice(0, 160).trim() : '',
      fetchedAtMs: nowMs,
    };
  }

  return null;
}

function getApiKey(): string {
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> }).env;
    if (env?.VITE_NASA_API_KEY && env.VITE_NASA_API_KEY.trim().length > 0) {
      return env.VITE_NASA_API_KEY.trim();
    }
  } catch {
    // Entorno sin Vite
  }
  return 'DEMO_KEY';
}

function readCached(nowMs: number): LiveCmeSnapshot | null {
  if (LiveNasa.memoryCache && nowMs - LiveNasa.memoryCache.fetchedAtMs < CACHE_TTL_MS) {
    return LiveNasa.memoryCache;
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LiveCmeSnapshot;
        if (
          parsed &&
          typeof parsed.donkiActivityID === 'string' &&
          typeof parsed.fetchedAtMs === 'number' &&
          nowMs - parsed.fetchedAtMs < CACHE_TTL_MS
        ) {
          LiveNasa.memoryCache = parsed;
          return parsed;
        }
      }
    }
  } catch {
    // Sin sessionStorage o JSON inválido
  }
  return null;
}

function writeCached(snapshot: LiveCmeSnapshot): void {
  LiveNasa.memoryCache = snapshot;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(snapshot));
    }
  } catch {
    // Ignorar errores de cuota/privacidad
  }
}

export class LiveNasa {
  static memoryCache: LiveCmeSnapshot | null = null;
  private static pending: Promise<LiveCmeSnapshot | null> | null = null;

  static clearCache(): void {
    LiveNasa.memoryCache = null;
    LiveNasa.pending = null;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(SESSION_CACHE_KEY);
      }
    } catch {
      // Ignorar
    }
  }

  /**
   * Consulta las CME de los últimos 30 días en NASA DONKI.
   * Nunca lanza excepción: si falla o está sin red devuelve null para activar el respaldo local.
   */
  static async fetchLatestCme(
    fetchImpl: typeof fetch | undefined = typeof fetch === 'function' ? fetch.bind(globalThis) : undefined,
    now: Date = new Date()
  ): Promise<LiveCmeSnapshot | null> {
    const nowMs = now.getTime();
    const cached = readCached(nowMs);
    if (cached) return cached;
    if (!fetchImpl) return null;
    if (LiveNasa.pending) return LiveNasa.pending;

    const endStr = now.toISOString().slice(0, 10);
    const startStr = new Date(nowMs - 30 * 86400000).toISOString().slice(0, 10);
    const url = `https://api.nasa.gov/DONKI/CME?startDate=${startStr}&endDate=${endStr}&api_key=${encodeURIComponent(getApiKey())}`;

    LiveNasa.pending = (async () => {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
      try {
        const res = await fetchImpl(url, controller ? { signal: controller.signal } : undefined);
        if (!res.ok) return null;
        const json = (await res.json()) as unknown;
        const snapshot = parseDonkiCmeList(json, nowMs);
        if (snapshot) {
          writeCached(snapshot);
        }
        return snapshot;
      } catch {
        return null;
      } finally {
        if (timer !== null) clearTimeout(timer);
        LiveNasa.pending = null;
      }
    })();

    return LiveNasa.pending;
  }
}
