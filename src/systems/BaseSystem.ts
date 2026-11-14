import balance from '../../content/balance.json';
import type { GameState, SampleType } from '../types';
import { Vitals } from './Vitals';

const SAMPLE_TYPES: SampleType[] = ['roca', 'suelo', 'minerales', 'aire'];

/**
 * Sistema de la base marciana: energía solar, generador MOXIE, recarga de traje,
 * entrega de muestras, restricción nocturna de puerta y transición de sueño al día siguiente.
 * Escrito en TypeScript puro sin depender de Phaser.
 */
export class BaseSystem {
  /**
   * Calcula la energía objetivo según el polvo promedio de los 3 paneles solares:
   * 100 * (1 - promedio de dust).
   */
  static getTargetEnergy(state: GameState): number {
    const panels = state.base.panels;
    if (panels.length === 0) return 0;
    const avgDust =
      panels.reduce((acc, p) => acc + Math.max(0, Math.min(1, p.dust)), 0) / panels.length;
    return Math.max(0, Math.min(100, 100 * (1 - avgDust)));
  }

  /**
   * Avanza la simulación de energía solar y producción de O₂ de MOXIE.
   */
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

    // 1. Energía de la base (sección 7.5)
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

    // 2. Producción de oxígeno de MOXIE (sección 7.5)
    if (state.base.energy > balance.base.moxieMinEnergy && state.base.moxieOk) {
      const o2Produced = balance.base.moxieFillPerGameHour * gameHoursDelta;
      state.base.o2Reserve = Math.min(100, state.base.o2Reserve + o2Produced);
      state.stats.moxieGrams += balance.base.moxieGramsPerGameHour * gameHoursDelta;
    }
  }

  /**
   * Recarga el oxígeno del traje a 25 puntos/s mientras haya reserva de MOXIE y energía.
   * Cada punto que sube el traje baja 0.5 de la reserva de la base (sección 7.2).
   * Devuelve cuántos puntos de O₂ subió el traje.
   */
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

  /**
   * Calienta el traje a 21 °C y recarga la batería del calefactor a 20 puntos/s (sección 7.3).
   * Devuelve cuántos puntos de batería se recargaron.
   */
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

  /**
   * Entrega los tubos recolectados en la mesa de muestras de la base (sección 7.6).
   * Devuelve el número de tubos entregados.
   */
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

  /**
   * La puerta de la base no permite salir después de las 17:00 (1020 min, sección 7.1).
   */
  static canExitToWorld(state: GameState): boolean {
    return state.clock.minutes < balance.dayClock.curfewMin;
  }

  /**
   * Evalúa el cumplimiento de la cuota del día: 'extra', 'normal' o 'menos' (sección 7.6).
   */
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
   * Procesa el fin del día al dormir:
   * - Sube daysSurvived y pasa al día siguiente (day + 1)
   * - Reinicia doseToday a 0 manteniendo doseTotal intacta
   * - Aplica el efecto de envío en la reserva de la base
   * - Reinicia el reloj a las 09:00
   */
  static sleepToNextDay(
    state: GameState,
    forcedBonus?: 'menos' | 'normal' | 'extra'
  ): void {
    const bonus = forcedBonus ?? BaseSystem.evaluateDailyQuota(state);
    state.supplyBonus = bonus;
    state.stats.daysSurvived = state.day;

    // Desbloqueo de personalización al terminar el día 1 (sección 9.6)
    if (state.day >= balance.unlocks.customizationDay) {
      state.unlocks.customization = true;
    }

    state.day += 1;
    state.clock.minutes = balance.dayClock.startMin;
    state.clock.paused = false;

    // La dosis del día se reinicia a 0, pero doseTotal nunca baja (sección 7.4)
    Vitals.resetDailyDose(state);

    // Aplicar suministros del nuevo día según cuota (sección 7.6)
    if (bonus === 'extra') {
      state.base.o2Reserve = balance.supplies.extra.reserve;
      state.astronaut.heaterBattery = Math.min(
        100,
        100 + balance.supplies.extra.batteryBonus - 30
      );
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
  }
}
