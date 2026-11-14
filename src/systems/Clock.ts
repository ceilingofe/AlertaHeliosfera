import balance from '../../content/balance.json';
import type { GameState } from '../types';

export interface ClockTickResult {
  warned16: boolean;
  curfew17: boolean;
  ended20: boolean;
}

/**
 * Sistema de reloj del día (09:00 a 20:00 = 660 minutos de juego).
 * Escrito en TypeScript puro sin depender de Phaser.
 */
export class Clock {
  /**
   * Obtiene la duración real en segundos de la jornada.
   * SUPUESTO: Por defecto usa 300 s (criterio de aceptación de Fase 1); cuando se activa el guion del día 1 en Fase 3, usa 150 s.
   */
  static getDayDurationSec(day: number, useDay1Short = false): number {
    if (useDay1Short && day === 1) {
      return balance.dayClock.day1Sec;
    }
    return balance.dayClock.daySec;
  }

  /**
   * Avanza el reloj en función de dt (segundos reales) si no está en pausa.
   */
  static tick(
    state: GameState,
    dt: number,
    durationSec: number = balance.dayClock.daySec
  ): ClockTickResult {
    const result: ClockTickResult = {
      warned16: false,
      curfew17: false,
      ended20: false,
    };

    if (state.clock.paused || dt <= 0) {
      return result;
    }

    const totalGameMinutes = balance.dayClock.endMin - balance.dayClock.startMin;
    const gameMinPerRealSec = totalGameMinutes / durationSec;

    const prevMin = state.clock.minutes;
    const nextMin = Math.min(
      balance.dayClock.endMin,
      prevMin + gameMinPerRealSec * dt
    );

    state.clock.minutes = nextMin;

    if (prevMin < balance.dayClock.warnMin && nextMin >= balance.dayClock.warnMin) {
      result.warned16 = true;
    }
    if (prevMin < balance.dayClock.curfewMin && nextMin >= balance.dayClock.curfewMin) {
      result.curfew17 = true;
    }
    if (prevMin < balance.dayClock.endMin && nextMin >= balance.dayClock.endMin) {
      result.ended20 = true;
    }

    return result;
  }

  static setPaused(state: GameState, paused: boolean): void {
    state.clock.paused = paused;
  }

  static togglePause(state: GameState): boolean {
    state.clock.paused = !state.clock.paused;
    return state.clock.paused;
  }

  static isNight(minutes: number): boolean {
    return minutes >= balance.dayClock.curfewMin;
  }

  static isDayEnd(minutes: number): boolean {
    return minutes >= balance.dayClock.endMin;
  }

  /**
   * Devuelve el progreso del día entre 0 (09:00) y 1 (20:00).
   */
  static getProgress(minutes: number): number {
    const total = balance.dayClock.endMin - balance.dayClock.startMin;
    const elapsed = minutes - balance.dayClock.startMin;
    return Math.max(0, Math.min(1, elapsed / total));
  }

  /**
   * Formatea los minutos desde las 00:00 como "HH:MM".
   */
  static formatTime(minutes: number): string {
    const clamped = Math.max(0, Math.floor(minutes));
    const hours = Math.floor(clamped / 60);
    const mins = clamped % 60;
    const hh = String(hours).padStart(2, '0');
    const mm = String(mins).padStart(2, '0');
    return `${hh}:${mm}`;
  }
}
