import type { GameState } from '../types';
import { createInitialGameState } from './GameState';

export const SAVE_STORAGE_KEY = 'alerta-heliosfera:v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // En modo privado restringido o entorno sin DOM, ignoramos localStorage.
  }
  return null;
}

const SAMPLE_TYPES = ['roca', 'suelo', 'minerales', 'aire'];
const LOCATIONS = ['mundo', 'base', 'refugio'];
const SUPPLY_BONUSES = ['menos', 'normal', 'extra'];
const SUIT_COLORS = ['blanco', 'naranja', 'azul', 'verde', 'rosa'];
const CHARACTERS = ['girl', 'boy1', 'boy2'];
const ACCESSORIES = ['diadema', 'mono', 'antena', 'gorrito', 'audifonos'];
const STORM_TYPES = ['cme_hit', 'cme_miss'];
const STORM_PHASES = ['countdown', 'impact', 'resolved'];

function isNumber(value: unknown, min = -Infinity, max = Infinity): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isOneOf(value: unknown, allowed: string[]): boolean {
  return typeof value === 'string' && allowed.includes(value);
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Registro de contadores por tipo de muestra (roca, suelo, minerales, aire). */
function isSampleCounts(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return SAMPLE_TYPES.every((type) => isNumber(obj[type], 0));
}

function isValidActiveStorm(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const storm = value as Record<string, unknown>;
  return (
    isOneOf(storm.type, STORM_TYPES) &&
    typeof storm.eventId === 'string' &&
    typeof storm.donkiActivityID === 'string' &&
    isOneOf(storm.phase, STORM_PHASES) &&
    isNumber(storm.countdownSec, 0) &&
    isNumber(storm.impactRemainingSec, 0) &&
    typeof storm.falseAlarmAnnounced === 'boolean'
  );
}

function isValidEventsState(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const events = value as Record<string, unknown>;
  return (
    isNumber(events.dayTracked, -1) &&
    Number.isInteger(events.dayTracked) &&
    isStringArray(events.fired) &&
    (events.storm === null || isValidActiveStorm(events.storm))
  );
}

/**
 * Guardado y carga de partida en localStorage (sección 6).
 * Si el guardado no existe, tiene otra versión o está corrupto, devuelve null sin lanzar error.
 */
export class Save {
  static save(state: GameState, storage: StorageLike | null = getDefaultStorage()): boolean {
    if (!storage) return false;
    try {
      const serialized = JSON.stringify(state);
      storage.setItem(SAVE_STORAGE_KEY, serialized);
      return true;
    } catch {
      return false;
    }
  }

  static load(storage: StorageLike | null = getDefaultStorage()): GameState | null {
    if (!storage) return null;
    try {
      const raw = storage.getItem(SAVE_STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      // Guardados anteriores a la persistencia de eventos: se migran sin perder la partida.
      if (parsed && typeof parsed === 'object' && !('events' in parsed)) {
        (parsed as Record<string, unknown>).events = {
          dayTracked: (parsed as Record<string, unknown>).day,
          fired: [],
          storm: null,
        };
      }
      // Guardados anteriores a los personajes: hair 2 pasa a boy1, hair 1 a girl.
      if (parsed && typeof parsed === 'object') {
        const customization = (parsed as Record<string, unknown>).customization as
          | Record<string, unknown>
          | undefined;
        if (customization && !('character' in customization) && 'hair' in customization) {
          customization.character = customization.hair === 2 ? 'boy1' : 'girl';
          delete customization.hair;
        }
      }
      if (!Save.isValidGameState(parsed)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  static loadOrCreate(storage: StorageLike | null = getDefaultStorage()): GameState {
    return Save.load(storage) ?? createInitialGameState();
  }

  static clear(storage: StorageLike | null = getDefaultStorage()): void {
    if (!storage) return;
    try {
      storage.removeItem(SAVE_STORAGE_KEY);
    } catch {
      // Ignorar errores de almacenamiento.
    }
  }

  static isValidGameState(value: unknown): value is GameState {
    if (!value || typeof value !== 'object') return false;
    const obj = value as Record<string, unknown>;

    if (obj.version !== 1) return false;
    if (!isNumber(obj.day, 1) || !Number.isInteger(obj.day)) return false;
    if (!isOneOf(obj.location, LOCATIONS)) return false;
    if (!isOneOf(obj.supplyBonus, SUPPLY_BONUSES)) return false;

    const clock = obj.clock as Record<string, unknown> | undefined;
    if (
      !clock ||
      !isNumber(clock.minutes, 0, 24 * 60) ||
      typeof clock.paused !== 'boolean'
    ) {
      return false;
    }

    const astronaut = obj.astronaut as Record<string, unknown> | undefined;
    const pos = astronaut?.pos as Record<string, unknown> | undefined;
    if (
      !astronaut ||
      !isNumber(astronaut.o2, 0, 100) ||
      !isNumber(astronaut.heaterBattery, 0, 100) ||
      !isNumber(astronaut.suitTempC, -273, 100) ||
      !isNumber(astronaut.doseToday, 0) ||
      !isNumber(astronaut.doseTotal, 0) ||
      !pos ||
      !isNumber(pos.x) ||
      !isNumber(pos.y)
    ) {
      return false;
    }

    const base = obj.base as Record<string, unknown> | undefined;
    if (
      !base ||
      !isNumber(base.energy, 0, 100) ||
      !isNumber(base.o2Reserve, 0, 100) ||
      typeof base.antennaOk !== 'boolean' ||
      typeof base.moxieOk !== 'boolean' ||
      !Array.isArray(base.panels) ||
      base.panels.length === 0
    ) {
      return false;
    }
    for (const panel of base.panels as unknown[]) {
      const p = panel as Record<string, unknown> | null;
      if (!p || typeof p.id !== 'string' || !isNumber(p.dust, 0, 1)) {
        return false;
      }
    }

    if (!Array.isArray(obj.tubes) || obj.tubes.length !== 6) {
      return false;
    }
    if (!obj.tubes.every((tube) => tube === null || isOneOf(tube, SAMPLE_TYPES))) {
      return false;
    }

    if (!isSampleCounts(obj.deliveredToday) || !isSampleCounts(obj.quotaToday)) {
      return false;
    }
    for (const type of SAMPLE_TYPES) {
      if (!Number.isInteger((obj.quotaToday as Record<string, number>)[type])) {
        return false;
      }
    }

    if (
      !isStringArray(obj.activeEvents) ||
      !isStringArray(obj.learnedToday) ||
      !isStringArray(obj.corviSeen)
    ) {
      return false;
    }

    const customization = obj.customization as Record<string, unknown> | undefined;
    if (
      !customization ||
      !isOneOf(customization.suit, SUIT_COLORS) ||
      !isOneOf(customization.character, CHARACTERS) ||
      (customization.accessory !== null &&
        !isOneOf(customization.accessory, ACCESSORIES)) ||
      typeof customization.patch !== 'string'
    ) {
      return false;
    }

    const unlocks = obj.unlocks as Record<string, unknown> | undefined;
    const accessories = unlocks?.accessories as unknown[] | undefined;
    if (
      !unlocks ||
      typeof unlocks.customization !== 'boolean' ||
      !Array.isArray(accessories) ||
      !accessories.every((acc) => isOneOf(acc, ACCESSORIES))
    ) {
      return false;
    }

    const stats = obj.stats as Record<string, unknown> | undefined;
    if (
      !stats ||
      !isSampleCounts(stats.samples) ||
      !isNumber(stats.moxieGrams, 0) ||
      !isNumber(stats.stormsSheltered, 0) ||
      !isNumber(stats.daysSurvived, 0)
    ) {
      return false;
    }

    if (!isValidEventsState(obj.events)) return false;

    return true;
  }
}
