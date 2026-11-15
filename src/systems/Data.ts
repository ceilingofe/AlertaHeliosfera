import corviQaData from '../../content/corvi_qa.json';
import daysData from '../../content/days.json';
import factsData from '../../content/facts.json';
import type { GameState, Label, Mood, SampleType } from '../types';

export interface FactEntry {
  id: string;
  icon: string;
  text: string;
  label: Label;
  source: string;
}

export interface CorviAnswerPage {
  mood: Mood;
  text: string;
  source?: string;
}

export interface CorviQAEntry {
  id: string;
  q: string;
  unlock: string;
  a: CorviAnswerPage[];
}

export interface DayEventScript {
  type: 'dust' | 'moxie_pipes' | 'antenna' | 'cme_hit' | 'cme_miss' | 'cold_night';
  at?: string;
  panels?: string[];
  eventId?: string;
}

export interface DayScriptEntry {
  day: number;
  durationSec: number;
  quota: Partial<Record<SampleType, number>>;
  events: DayEventScript[];
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
  eventType: 'cme_hit' | 'cme_miss' | 'none';
  activityId: string;
  speedText: string;
  label: Label;
  source: string;
}

export interface DonkiCuratedEvent {
  id: string;
  type: 'cme_hit' | 'cme_miss';
  donkiActivityID: string;
  speedKmS: string | number;
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

  static getAllFacts(): FactEntry[] {
    return factsData as FactEntry[];
  }

  static getFactById(id: string): FactEntry {
    const list = factsData as FactEntry[];
    return list.find((f) => f.id === id) ?? list[0];
  }

  static getFactsForDay(day: number): FactEntry[] {
    const script = Data.getDayScript(day);
    if (script && script.factIds.length > 0) {
      const ids = [...script.factIds];
      const list = factsData as FactEntry[];
      let idx = 0;
      while (ids.length < 3) {
        const candidate = list[(day + idx) % list.length].id;
        if (!ids.includes(candidate)) {
          ids.push(candidate);
        }
        idx += 1;
      }
      return ids.slice(0, 3).map((id) => Data.getFactById(id));
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
   * Devuelve las preguntas de Corvi desbloqueadas hasta el día actual.
   */
  static getUnlockedCorviQA(stateOrDay: GameState | number): CorviQAEntry[] {
    const day = typeof stateOrDay === 'number' ? stateOrDay : stateOrDay.day;
    const all = corviQaData as CorviQAEntry[];
    return all.filter((entry) => {
      if (entry.unlock === 'start') return true;
      if (entry.unlock.startsWith('day')) {
        const minDay = Number(entry.unlock.replace('day', ''));
        return day >= minDay;
      }
      return true;
    });
  }

  /**
   * Obtiene un evento curado de DONKI por su id ('cme_mayo_2024' o 'cme_falsa_alarma').
   */
  static getDonkiEventById(
    eventId: string,
    rawEvents: unknown = Data.eventsCache
  ): DonkiCuratedEvent {
    const obj = rawEvents as
      | {
          curated?: {
            id?: string;
            type?: 'cme_hit' | 'cme_miss';
            donkiActivityID?: string;
            speedKmS?: string | number;
            label?: Label;
            source?: string;
          }[];
        }
      | null
      | undefined;

    const found = obj?.curated?.find((e) => e.id === eventId);
    const donkiActivityID = found?.donkiActivityID ?? 'TODO_DATO';
    const speedKmS = found?.speedKmS ?? 'TODO_DATO';
    const containsTodo = [donkiActivityID, speedKmS].some(
      (value) => typeof value === 'string' && value.includes('TODO_DATO')
    );
    return {
      id: found?.id ?? eventId,
      type: found?.type ?? (eventId === 'cme_falsa_alarma' ? 'cme_miss' : 'cme_hit'),
      donkiActivityID,
      speedKmS,
      label: containsTodo ? 'SIMULADO' : found?.label ?? 'ARCHIVO REAL',
      source: found?.source ?? 'DONKI',
    };
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
    const targetId = day === 5 ? 'cme_falsa_alarma' : 'cme_mayo_2024';
    const ev = Data.getDonkiEventById(targetId, rawEvents);
    const rawId = ev.donkiActivityID;
    const shortId = rawId.startsWith('TODO_DATO') ? 'TODO_DATO · CME-2024-05' : rawId;
    const speedText =
      typeof ev.speedKmS === 'number' ? `${ev.speedKmS} km/s` : 'TODO_DATO km/s';

    const hasAlert = day <= 3 || day === 5;
    return {
      hasAlert,
      eventType: day === 5 ? 'cme_miss' : day <= 3 ? 'cme_hit' : 'none',
      activityId: shortId,
      speedText,
      label: ev.label,
      source: 'DONKI',
    };
  }
}
