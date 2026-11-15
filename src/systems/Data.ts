import type { GameState, Label, Mood, SampleType } from '../types';
import { Ephemeris } from './Ephemeris';
import { I18n } from './I18n';

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
  distanceMkm?: number;
  dateText?: string;
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

/**
 * Carga, valida y entrega datos científicos con sus etiquetas de honestidad
 * ("ARCHIVO REAL" o "SIMULADO") según el idioma activo.
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
    const list = I18n.days() as DayScriptEntry[];
    return list.find((d) => d.day === day) ?? null;
  }

  static getAllFacts(): FactEntry[] {
    return I18n.facts() as FactEntry[];
  }

  static getFactById(id: string): FactEntry {
    const list = I18n.facts() as FactEntry[];
    return list.find((f) => f.id === id) ?? list[0];
  }

  static getFactsForDay(day: number): FactEntry[] {
    const script = Data.getDayScript(day);
    if (script && script.factIds.length > 0) {
      const ids = [...script.factIds];
      const list = Data.getAllFacts();
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
    const list = Data.getAllFacts();
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
    const all = I18n.corviQa() as CorviQAEntry[];
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
    return {
      id: found?.id ?? eventId,
      type: found?.type ?? (eventId === 'cme_falsa_alarma' ? 'cme_miss' : 'cme_hit'),
      donkiActivityID: found?.donkiActivityID ?? 'DONKI',
      speedKmS: found?.speedKmS ?? '',
      label: found?.label ?? 'ARCHIVO REAL',
      source: found?.source ?? 'DONKI',
    };
  }

  /**
   * Retraso de la luz Tierra–Marte para el día de juego: el día 1 es la fecha real de hoy
   * y cada día de juego avanza un día del calendario. Se calcula con efemérides de JPL.
   */
  static getLightDelay(day: number, _raw: unknown = Data.horizonsCache, now: Date = new Date()): LightDelayInfo {
    const date = new Date(now.getTime() + (Math.max(1, day) - 1) * 86400000);
    const minutes = Math.round(Ephemeris.lightDelayMinutes(date) * 10) / 10;
    return {
      minutes,
      label: 'CALCULADO',
      source: I18n.getLang() === 'es' ? 'Efemérides JPL' : 'JPL Ephemeris',
      isTodo: false,
      distanceMkm: Math.round(Ephemeris.distanceMillionKm(date)),
      dateText: date.toISOString().slice(0, 10),
    };
  }

  /**
   * Pronóstico horario (06:00 a 18:00) de Jezero: curva suave entre el mínimo y el máximo
   * de temperatura del aire que reporta la NASA para MEDA (−83 °C y −23 °C).
   * Cada día de juego varía un poco para que el pronóstico no sea idéntico.
   */
  static getMedaForecast(day: number, rawMeda: unknown = Data.medaCache): MedaForecastInfo {
    const obj = rawMeda as { range?: { minC?: number; maxC?: number } } | null | undefined;
    const minC = typeof obj?.range?.minC === 'number' ? obj.range.minC : -83;
    const maxC = typeof obj?.range?.maxC === 'number' ? obj.range.maxC : -23;
    const wobble = ((day * 37) % 7) - 3; // −3..+3 °C de variación entre días
    const tempsC = HOURS_06_TO_18.map((h) => {
      const hour = Number(h);
      // Mínimo cerca de las 06:00, máximo cerca de las 14:00.
      const phase = Math.cos(((hour - 14) / 12) * Math.PI);
      const k = (phase + 1) / 2;
      return Math.round(minC + (maxC - minC) * Math.pow(k, 1.4) + wobble);
    });
    const isEs = I18n.getLang() === 'es';
    return {
      sol: isEs ? `día ${day}` : `sol ${day}`,
      hours: HOURS_06_TO_18,
      tempsC,
      label: 'CALCULADO',
      source: isEs ? 'rango real de MEDA' : 'MEDA real range',
      isTodo: false,
    };
  }

  /**
   * Obtiene la alerta solar desde events.json (DONKI).
   */
  static getSolarAlert(day: number, rawEvents: unknown = Data.eventsCache): SolarAlertInfo {
    const targetId = day === 5 ? 'cme_falsa_alarma' : 'cme_mayo_2024';
    const ev = Data.getDonkiEventById(targetId, rawEvents);
    const shortId = ev.donkiActivityID;
    const speedText =
      typeof ev.speedKmS === 'number' ? `${ev.speedKmS} km/s` : String(ev.speedKmS);

    const hasAlert = day <= 3 || day === 5;
    return {
      hasAlert,
      eventType: day === 5 ? 'cme_miss' : day <= 3 ? 'cme_hit' : 'none',
      activityId: shortId,
      speedText,
      label: 'ARCHIVO REAL',
      source: 'DONKI',
    };
  }
}
