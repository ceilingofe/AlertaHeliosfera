import balance from '../../content/balance.json';
import type { GameState, SampleType } from '../types';
import { Data } from './Data';

const ALL_TYPES: SampleType[] = ['roca', 'suelo', 'minerales', 'aire'];

/**
 * Sistema de cuota diaria de muestras (sección 7.6 y 9.3).
 * Escrito en TypeScript puro sin depender de Phaser.
 */
export class Quota {
  /**
   * Obtiene la cuota de muestras correspondiente al día indicado.
   * Días 1 a 5 vienen de content/days.json; día 6 en adelante usa balance.quotaByDay.
   */
  static getQuotaForDay(day: number): Record<SampleType, number> {
    const quota: Record<SampleType, number> = {
      roca: 0,
      suelo: 0,
      minerales: 0,
      aire: 0,
    };

    const script = Data.getDayScript(day);
    if (script) {
      for (const t of ALL_TYPES) {
        quota[t] = script.quota[t] ?? 0;
      }
      return quota;
    }

    // Día 6 en adelante según balance.quotaByDay
    let rule = balance.quotaByDay[0];
    for (const r of balance.quotaByDay) {
      if (day >= r.fromDay) {
        rule = r;
      }
    }

    for (let i = 0; i < rule.total; i++) {
      const typeIdx = (day + i) % Math.min(ALL_TYPES.length, rule.types);
      const sampleType = ALL_TYPES[typeIdx];
      quota[sampleType] += 1;
    }

    return quota;
  }

  /**
   * Asigna la cuota del día actual en el GameState.
   */
  static applyDailyQuota(state: GameState): void {
    state.quotaToday = Quota.getQuotaForDay(state.day);
  }

  /**
   * Comprueba si ya se entregaron las muestras requeridas de un tipo específico.
   */
  static isTypeMet(state: GameState, type: SampleType): boolean {
    const req = state.quotaToday[type] ?? 0;
    if (req <= 0) return true;
    return (state.deliveredToday[type] ?? 0) >= req;
  }

  /**
   * Comprueba si toda la cuota del día fue entregada en la mesa de la base.
   */
  static isAllMet(state: GameState): boolean {
    return ALL_TYPES.every((t) => Quota.isTypeMet(state, t));
  }
}
