import balance from '../../content/balance.json';
import type { GameState, RescueCause } from '../types';

export interface VitalsTickResult {
  warnedO2At40: boolean;
  dangerO2At20: boolean;
  rescueCause: RescueCause | null;
}

/**
 * Sistema de signos vitales del traje (oxígeno, batería del calefactor, temperatura y radiación).
 * Escrito en TypeScript puro sin depender de Phaser.
 */
export class Vitals {
  /**
   * Actualiza oxígeno, calefactor, temperatura y radiación según dt (segundos reales).
   * Solo avanza cuando el reloj no está en pausa.
   */
  static tick(state: GameState, dt: number): VitalsTickResult {
    const result: VitalsTickResult = {
      warnedO2At40: false,
      dangerO2At20: false,
      rescueCause: null,
    };

    if (state.clock.paused || dt <= 0) {
      return result;
    }

    const prevO2 = state.astronaut.o2;

    if (state.location === 'mundo') {
      // 1. Batería del calefactor y temperatura del traje (sección 7.3)
      const isNight = state.clock.minutes >= balance.dayClock.curfewMin;
      const isColdNightEvent = state.activeEvents.includes('cold_night');
      const nightMultiplier = isNight
        ? isColdNightEvent
          ? balance.heater.coldNightMultiplier
          : balance.heater.nightMultiplier
        : 1;

      const heaterDrainRate = balance.heater.drainPerSec * nightMultiplier;
      const prevBattery = state.astronaut.heaterBattery;

      if (prevBattery > 0) {
        const timeToEmpty = prevBattery / heaterDrainRate;
        if (dt <= timeToEmpty) {
          state.astronaut.heaterBattery = Math.max(0, prevBattery - heaterDrainRate * dt);
          if (isNight) {
            const comfortSpan = balance.heater.suitC - balance.heater.comfortMinC;
            state.astronaut.suitTempC =
              balance.heater.comfortMinC + (comfortSpan * state.astronaut.heaterBattery) / 100;
          } else {
            state.astronaut.suitTempC = balance.heater.suitC;
          }
        } else {
          state.astronaut.heaterBattery = 0;
          const coldDt = dt - timeToEmpty;
          const startC = isNight ? balance.heater.comfortMinC : balance.heater.suitC;
          state.astronaut.suitTempC = Math.max(
            balance.heater.minC,
            startC - balance.heater.coolPerSec * coldDt
          );
        }
      } else {
        state.astronaut.suitTempC = Math.max(
          balance.heater.minC,
          state.astronaut.suitTempC - balance.heater.coolPerSec * dt
        );
      }

      // 2. Oxígeno del traje (sección 7.2): si hace frío (< 18 °C) se multiplica por 3;
      //    de noche el traje trabaja más (×2) para mantener presión y calor.
      const isCold = state.astronaut.suitTempC < balance.heater.comfortMinC;
      const o2Multiplier =
        (isCold ? balance.o2.coldMultiplier : 1) * (isNight ? balance.o2.nightMultiplier : 1);
      const o2Drain = balance.o2.drainPerSec * o2Multiplier * dt;
      state.astronaut.o2 = Math.max(0, state.astronaut.o2 - o2Drain);

      // 3. Radiación acumulada afuera (sección 7.4): nunca disminuye
      const radDelta = balance.radiation.outsidePerSec * dt;
      state.astronaut.doseToday += radDelta;
      state.astronaut.doseTotal += radDelta;
    } else {
      // Dentro de la base o refugio en condiciones normales: traje cómodo a 21 °C y radiación 0
      state.astronaut.suitTempC = balance.heater.suitC;
    }

    if (prevO2 > balance.o2.warnAt && state.astronaut.o2 <= balance.o2.warnAt) {
      result.warnedO2At40 = true;
    }
    if (prevO2 > balance.o2.dangerAt && state.astronaut.o2 <= balance.o2.dangerAt) {
      result.dangerO2At20 = true;
    }

    result.rescueCause = Vitals.checkRescue(state);
    return result;
  }

  /**
   * Trabajo de campo durante un minijuego: el reloj del día está en pausa, pero el traje
   * sigue gastando oxígeno y recibiendo radiación. Así, tardarse o fallar tiene un costo real.
   */
  static tickFieldWork(state: GameState, dt: number): VitalsTickResult {
    const result: VitalsTickResult = { warnedO2At40: false, dangerO2At20: false, rescueCause: null };
    if (dt <= 0 || state.location !== 'mundo') return result;
    const prevO2 = state.astronaut.o2;
    const isCold = state.astronaut.suitTempC < balance.heater.comfortMinC;
    const mult = (isCold ? balance.o2.coldMultiplier : 1) * balance.minigame.o2DrainMultiplier;
    state.astronaut.o2 = Math.max(0, state.astronaut.o2 - balance.o2.drainPerSec * mult * dt);
    const radDelta = balance.radiation.outsidePerSec * dt;
    state.astronaut.doseToday += radDelta;
    state.astronaut.doseTotal += radDelta;
    result.warnedO2At40 = prevO2 > balance.o2.warnAt && state.astronaut.o2 <= balance.o2.warnAt;
    result.dangerO2At20 = prevO2 > balance.o2.dangerAt && state.astronaut.o2 <= balance.o2.dangerAt;
    result.rescueCause = Vitals.checkRescue(state);
    return result;
  }

  /**
   * Aplica dosis extra durante los segundos de impacto de una tormenta solar (cme_hit).
   */
  static applyStormImpact(state: GameState, dt: number): RescueCause | null {
    if (state.clock.paused || dt <= 0) {
      return null;
    }

    const totalStormDose =
      state.location === 'mundo'
        ? balance.radiation.stormOutside
        : state.location === 'base'
          ? balance.radiation.stormBase
          : balance.radiation.stormRefuge;

    const ratePerSec = totalStormDose / balance.radiation.stormHitSeconds;
    const delta = ratePerSec * dt;

    state.astronaut.doseToday += delta;
    state.astronaut.doseTotal += delta;

    return Vitals.checkRescue(state);
  }

  /**
   * Reinicia la dosis del día al dormir sin disminuir jamás la dosis total acumulada.
   */
  static resetDailyDose(state: GameState): void {
    state.astronaut.doseToday = 0;
  }

  /**
   * Evalúa si el astronauta requiere rescate por oxígeno en 0 o dosis total en el límite.
   */
  static checkRescue(state: GameState): RescueCause | null {
    if (state.astronaut.o2 <= 0) {
      return 'oxigeno';
    }
    if (state.astronaut.doseTotal >= balance.radiation.doseLimit) {
      return 'radiacion';
    }
    return null;
  }
}
