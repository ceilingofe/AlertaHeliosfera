import balance from '../../content/balance.json';
import type { Accessory, GameState, SampleType } from '../types';
import { Events } from './Events';
import { Quota } from './Quota';
import { Vitals } from './Vitals';

const SAMPLE_TYPES: SampleType[] = ['roca', 'suelo', 'minerales', 'aire'];

/**
 * Sistema de la base marciana: energía solar, generador MOXIE, recarga de traje,
 * entrega de muestras, restricción nocturna de puerta y transición de sueño al día siguiente.
 * Escrito en TypeScript puro sin depender de Phaser.
 */
export class BaseSystem {
  static getTargetEnergy(state: GameState): number {
    const panels = state.base.panels;
    if (panels.length === 0) return 0;
    const avgDust =
      panels.reduce((acc, p) => acc + Math.max(0, Math.min(1, p.dust)), 0) / panels.length;
    return Math.max(0, Math.min(100, 100 * (1 - avgDust)));
  }

  static tick(
    state: GameState,
    dt: number,
    durationSec: number = balance.dayClock.daySec
  ): void {
    if (state.clock.paused || dt <= 0) {
      return;
    }

    const totalGameMinutes = balance.dayClock.endMin - balance.dayClock.startMin;
    const gameMinutesDelta = (totalGameMinutes / durationSec) * dt;
    const gameHoursDelta = gameMinutesDelta / 60;
    const isNight = state.clock.minutes >= balance.dayClock.curfewMin;

    if (isNight) {
      const loss = balance.base.nightEnergyLossPerGameMin * gameMinutesDelta;
      state.base.energy = Math.max(0, state.base.energy - loss);
    } else {
      const target = BaseSystem.getTargetEnergy(state);
      const step = balance.base.panelRecoverPerSec * dt;
      if (state.base.energy < target) {
        state.base.energy = Math.min(target, state.base.energy + step);
      } else if (state.base.energy > target) {
        state.base.energy = Math.max(target, state.base.energy - step);
      }
    }

    if (state.base.energy > balance.base.moxieMinEnergy && state.base.moxieOk) {
      const o2Produced = balance.base.moxieFillPerGameHour * gameHoursDelta;
      state.base.o2Reserve = Math.min(100, state.base.o2Reserve + o2Produced);
      state.stats.moxieGrams += balance.base.moxieGramsPerGameHour * gameHoursDelta;
    }
  }

  static refillO2(state: GameState, dt: number): number {
    if (dt <= 0 || state.base.energy <= 0 || state.base.o2Reserve <= 0) {
      return 0;
    }

    const missingO2 = Math.max(0, 100 - state.astronaut.o2);
    if (missingO2 <= 0) {
      return 0;
    }

    const maxByTime = balance.o2.refillPerSec * dt;
    const maxByReserve = state.base.o2Reserve / balance.o2.reserveCostPerPoint;
    const addedO2 = Math.min(missingO2, maxByTime, maxByReserve);

    state.astronaut.o2 = Math.min(100, state.astronaut.o2 + addedO2);
    state.base.o2Reserve = Math.max(
      0,
      state.base.o2Reserve - addedO2 * balance.o2.reserveCostPerPoint
    );

    return addedO2;
  }

  static rechargeHeater(state: GameState, dt: number): number {
    state.astronaut.suitTempC = balance.heater.suitC;
    if (dt <= 0 || state.base.energy <= 0) {
      return 0;
    }

    const missingBattery = Math.max(0, 100 - state.astronaut.heaterBattery);
    if (missingBattery <= 0) {
      return 0;
    }

    const added = Math.min(missingBattery, balance.heater.rechargePerSec * dt);
    state.astronaut.heaterBattery = Math.min(100, state.astronaut.heaterBattery + added);
    return added;
  }

  static deliverTubes(state: GameState, multiplier = 1): number {
    let deliveredCount = 0;
    for (let i = 0; i < state.tubes.length; i++) {
      const sample = state.tubes[i];
      if (sample !== null) {
        state.deliveredToday[sample] += multiplier;
        state.stats.samples[sample] += multiplier;
        state.tubes[i] = null;
        deliveredCount += 1;
      }
    }
    return deliveredCount;
  }

  static canExitToWorld(state: GameState): boolean {
    return state.clock.minutes < balance.dayClock.curfewMin;
  }

  static evaluateDailyQuota(state: GameState): 'menos' | 'normal' | 'extra' {
    let metAll = true;
    let totalDelivered = 0;
    let totalRequired = 0;

    for (const type of SAMPLE_TYPES) {
      const delivered = state.deliveredToday[type] ?? 0;
      const required = state.quotaToday[type] ?? 0;
      totalDelivered += delivered;
      totalRequired += required;
      if (delivered < required) {
        metAll = false;
      }
    }

    if (!metAll) {
      return 'menos';
    }
    if (totalDelivered > totalRequired) {
      return 'extra';
    }
    return 'normal';
  }

  /**
   * Revisión de Control de Misión al terminar el día: si no se cumplió la cuota
   * se pierde confianza; si se entregó de más, se recupera. Devuelve el cambio.
   */
  static applyMissionReview(state: GameState, bonus: 'menos' | 'normal' | 'extra'): number {
    const max = balance.mission.maxTrust;
    const before = state.missionTrust;
    if (bonus === 'menos') {
      state.missionTrust = Math.max(0, state.missionTrust - balance.mission.quotaMissTrustLoss);
    } else if (bonus === 'extra') {
      state.missionTrust = Math.min(max, state.missionTrust + balance.mission.extraTrustGain);
    }
    return state.missionTrust - before;
  }

  /** El polvo marciano se acumula cada sol sobre todos los paneles que no se limpian. */
  static accumulateDailyDust(state: GameState): void {
    for (const p of state.base.panels) {
      p.dust = Math.min(1, p.dust + balance.dust.dailyAccumulation);
    }
    if (
      state.base.panels.some((p) => p.dust > balance.dust.dirtyThreshold) &&
      !state.activeEvents.includes('dust')
    ) {
      state.activeEvents.push('dust');
    }
  }

  static sleepToNextDay(
    state: GameState,
    forcedBonus?: 'menos' | 'normal' | 'extra'
  ): number {
    const bonus = forcedBonus ?? BaseSystem.evaluateDailyQuota(state);
    state.supplyBonus = bonus;
    const trustDelta = BaseSystem.applyMissionReview(state, bonus);
    for (const id of state.learnedToday) {
      if (!state.journal.includes(id)) state.journal.push(id);
    }
    state.stats.daysSurvived = state.day;

    if (state.day >= balance.unlocks.customizationDay) {
      state.unlocks.customization = true;
    }

    state.day += 1;
    state.clock.minutes = balance.dayClock.startMin;
    state.clock.paused = false;

    // Desbloquear accesorios según el día alcanzado (sección 9.6 y 10.8)
    const accMap = balance.unlocks.accessories as Record<string, Accessory[]>;
    for (const [dayKey, items] of Object.entries(accMap)) {
      if (state.day >= Number(dayKey)) {
        for (const acc of items) {
          if (!state.unlocks.accessories.includes(acc)) {
            state.unlocks.accessories.push(acc);
          }
        }
      }
    }

    Vitals.resetDailyDose(state);
    Quota.applyDailyQuota(state);
    Events.initDay(state);
    BaseSystem.accumulateDailyDust(state);
    state.sitesUsedToday = [];
    state.tubes = state.tubes.map(() => null);

    if (bonus === 'extra') {
      state.base.o2Reserve = balance.supplies.extra.reserve;
      state.astronaut.heaterBattery = 100;
    } else if (bonus === 'normal') {
      state.base.o2Reserve = balance.supplies.normal.reserve;
      state.astronaut.heaterBattery = 100;
    } else {
      state.base.o2Reserve = balance.supplies.menos.reserve;
      state.astronaut.heaterBattery = 100;
    }

    state.astronaut.o2 = 100;
    state.astronaut.suitTempC = balance.heater.suitC;

    for (const type of SAMPLE_TYPES) {
      state.deliveredToday[type] = 0;
    }
    state.learnedToday = [];
    return trustDelta;
  }
}
