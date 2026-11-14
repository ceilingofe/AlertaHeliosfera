import daysData from '../../content/days.json';
import factsData from '../../content/facts.json';
import type { Label, SampleType } from '../types';

export interface FactEntry {
  id: string;
  icon: string;
  text: string;
  label: Label;
  source: string;
}

export interface DayScriptEntry {
  day: number;
  durationSec: number;
  quota: Partial<Record<SampleType, number>>;
  events: { type: string; at?: string; panels?: string[]; eventId?: string }[];
  endHook?: string;
  factIds: string[];
  corviIntro?: string;
}

export interface LightDelayInfo {
  minutes: number;
  label: Label;
  source: string;
  isTodo: boolean;
}

export interface MedaForecastInfo {
  sol: string;
  hours: string[];
  tempsC: number[];
  label: Label;
  source: string;
  isTodo: boolean;
}

export interface SolarAlertInfo {
  hasAlert: boolean;
  activityId: string;
  speedText: string;
  label: Label;
  source: string;
}

const HOURS_06_TO_18 = [
  '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18',
];

// Curva de ejemplo de la sección 10.3 mientras meda_jezero.json tiene TODO_DATO
const SIMULATED_MEDA_CURVE_C = [
  -78, -74, -60, -42, -28, -18, -12, -10, -14, -24, -40, -58, -70,
];

/**
 * Carga, valida y entrega datos científicos con sus etiquetas de honestidad
 * ("ARCHIVO REAL" o "SIMULADO") y marcadores TODO_DATO (sección 10).
 */
export class Data {
  private static horizonsCache: unknown = null;
  private static medaCache: unknown = null;
  private static eventsCache: unknown = null;

  static setNasaDataCache(payload: {
    horizons?: unknown;
    meda?: unknown;
    events?: unknown;
  }): void {
    if (payload.horizons !== undefined) Data.horizonsCache = payload.horizons;
    if (payload.meda !== undefined) Data.medaCache = payload.meda;
    if (payload.events !== undefined) Data.eventsCache = payload.events;
  }

  static getDayScript(day: number): DayScriptEntry | null {
    const list = daysData as DayScriptEntry[];
    return list.find((d) => d.day === day) ?? null;
  }

  static getFactById(id: string): FactEntry {
    const list = factsData as FactEntry[];
    return list.find((f) => f.id === id) ?? list[0];
  }

  static getFactsForDay(day: number): FactEntry[] {
    const script = Data.getDayScript(day);
    if (script && script.factIds.length > 0) {
      return script.factIds.map((id) => Data.getFactById(id));
    }
    const list = factsData as FactEntry[];
    const start = ((day - 1) * 3) % list.length;
    return [
      list[start % list.length],
      list[(start + 1) % list.length],
      list[(start + 2) % list.length],
    ];
  }

  /**
   * Obtiene el retraso de luz Tierra-Marte desde horizons_delay.json.
   * Si tiene el marcador TODO_DATO, devuelve 12 min con etiqueta SIMULADO.
   */
  static getLightDelay(day: number, rawHorizons: unknown = Data.horizonsCache): LightDelayInfo {
    const obj = rawHorizons as
      | { source?: string; delays?: { date?: string; minutes?: unknown }[] }
      | null
      | undefined;

    const delays = obj?.delays;
    if (Array.isArray(delays) && delays.length > 0) {
      const entry = delays[(day - 1) % delays.length];
      if (typeof entry?.minutes === 'number' && Number.isFinite(entry.minutes)) {
        return {
          minutes: entry.minutes,
          label: 'ARCHIVO REAL',
          source: 'JPL Horizons',
          isTodo: false,
        };
      }
    }

    return {
      minutes: 12,
      label: 'SIMULADO',
      source: 'JPL Horizons (TODO_DATO)',
      isTodo: true,
    };
  }

  /**
   * Obtiene el pronóstico horario (06:00 a 18:00) desde meda_jezero.json.
   * Si tiene TODO_DATO, devuelve la curva de ejemplo de la sección 10.3 marcada como SIMULADO.
   */
  static getMedaForecast(day: number, rawMeda: unknown = Data.medaCache): MedaForecastInfo {
    const obj = rawMeda as
      | { sols?: { sol?: unknown; hourlyC?: Record<string, unknown> }[] }
      | null
      | undefined;

    const sols = obj?.sols;
    if (Array.isArray(sols) && sols.length > 0) {
      const entry = sols[(day - 1) % sols.length];
      const hourly = entry?.hourlyC;
      if (hourly && typeof entry?.sol === 'number') {
        const parsedTemps: number[] = [];
        for (const h of HOURS_06_TO_18) {
          const val = hourly[h];
          if (typeof val === 'number' && Number.isFinite(val)) {
            parsedTemps.push(val);
          }
        }
        if (parsedTemps.length === HOURS_06_TO_18.length) {
          return {
            sol: String(entry.sol),
            hours: HOURS_06_TO_18,
            tempsC: parsedTemps,
            label: 'ARCHIVO REAL',
            source: `MEDA Jezero sol ${entry.sol}`,
            isTodo: false,
          };
        }
      }
    }

    return {
      sol: 'TODO_DATO',
      hours: HOURS_06_TO_18,
      tempsC: [...SIMULATED_MEDA_CURVE_C],
      label: 'SIMULADO',
      source: 'MEDA Jezero (TODO_DATO)',
      isTodo: true,
    };
  }

  /**
   * Obtiene la alerta solar desde events.json (DONKI).
   */
  static getSolarAlert(day: number, rawEvents: unknown = Data.eventsCache): SolarAlertInfo {
    const obj = rawEvents as
      | {
          curated?: {
            id?: string;
            donkiActivityID?: string;
            speedKmS?: unknown;
            source?: string;
          }[];
        }
      | null
      | undefined;

    const cme = obj?.curated?.find((e) => e.id === 'cme_mayo_2024');
    const rawId = cme?.donkiActivityID ?? 'TODO_DATO';
    const shortId = rawId.startsWith('TODO_DATO') ? 'TODO_DATO · CME-2024-05' : rawId;
    const speedText =
      typeof cme?.speedKmS === 'number' ? `${cme.speedKmS} km/s` : 'TODO_DATO km/s';

    return {
      hasAlert: day <= 3,
      activityId: shortId,
      speedText,
      label: 'ARCHIVO REAL',
      source: 'DONKI',
    };
  }
}
