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
    if (typeof obj.day !== 'number' || !Number.isFinite(obj.day) || obj.day < 1) return false;

    const clock = obj.clock as Record<string, unknown> | undefined;
    if (!clock || typeof clock.minutes !== 'number' || typeof clock.paused !== 'boolean') {
      return false;
    }

    const astronaut = obj.astronaut as Record<string, unknown> | undefined;
    if (
      !astronaut ||
      typeof astronaut.o2 !== 'number' ||
      typeof astronaut.heaterBattery !== 'number' ||
      typeof astronaut.suitTempC !== 'number' ||
      typeof astronaut.doseToday !== 'number' ||
      typeof astronaut.doseTotal !== 'number'
    ) {
      return false;
    }

    const base = obj.base as Record<string, unknown> | undefined;
    if (
      !base ||
      typeof base.energy !== 'number' ||
      typeof base.o2Reserve !== 'number' ||
      !Array.isArray(base.panels)
    ) {
      return false;
    }

    if (!Array.isArray(obj.tubes) || obj.tubes.length !== 6) {
      return false;
    }

    return true;
  }
}
