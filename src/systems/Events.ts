import balance from '../../content/balance.json';
import type { GameState, RescueCause } from '../types';
import { Data, type DayEventScript } from './Data';

export interface ActiveStormState {
  type: 'cme_hit' | 'cme_miss';
  eventId: string;
  donkiActivityID: string;
  phase: 'countdown' | 'impact' | 'resolved';
  countdownSec: number;
  impactRemainingSec: number;
  falseAlarmAnnounced: boolean;
}

export interface EventTickResult {
  triggeredEvents: DayEventScript[];
  stormStarted: ActiveStormState | null;
  stormImpactStarted: boolean;
  stormFalseAlarmResolved: boolean;
  stormFinished: boolean;
  antennaDamaged: boolean;
  rescueCause: RescueCause | null;
}

/**
 * Sistema de eventos diarios y tormentas solares (sección 7.4 y 9.2).
 * Escrito en TypeScript puro sin depender de Phaser.
 */
export class Events {
  private static firedToday = new Set<string>();
  private static currentDayTracked = -1;
  private static activeStorm: ActiveStormState | null = null;

  /**
   * Convierte una cadena "HH:MM" en minutos desde las 00:00 (por defecto 09:00 = 540).
   */
  static parseTimeMinutes(at?: string): number {
    if (!at) return balance.dayClock.startMin;
    const parts = at.split(':');
    if (parts.length !== 2) return balance.dayClock.startMin;
    const hh = Number(parts[0]);
    const mm = Number(parts[1]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
      return balance.dayClock.startMin;
    }
    return hh * 60 + mm;
  }

  /**
   * Obtiene los eventos programados para un día (días 1–5 de days.json; día 6+ de eventsPerDay).
   */
  static getScheduledEventsForDay(day: number): DayEventScript[] {
    const script = Data.getDayScript(day);
    if (script) {
      return script.events;
    }

    // Días 6 en adelante según balance.eventsPerDay
    let count = 1;
    for (const rule of balance.eventsPerDay) {
      if (day >= rule.fromDay) {
        count = rule.count;
      }
    }

    const pool: DayEventScript[] = [
      { type: 'dust', at: '11:00', panels: ['p1', 'p2'] },
      { type: 'moxie_pipes', at: '10:30' },
      { type: 'cme_hit', at: '13:00', eventId: 'cme_mayo_2024' },
      { type: 'antenna', at: '10:00' },
      { type: 'cold_night' },
      { type: 'dust', at: '12:30', panels: ['p3'] },
      { type: 'cme_miss', at: '12:00', eventId: 'cme_falsa_alarma' },
    ];

    const selected: DayEventScript[] = [];
    for (let i = 0; i < count; i++) {
      selected.push(pool[(day + i) % pool.length]);
    }
    return selected;
  }

  static ensureMissionToday(state: GameState, missionId: string): void {
    state.missionsToday ??= [];
    if (!state.missionsToday.includes(missionId)) {
      state.missionsToday.push(missionId);
    }
  }

  static markMissionCompleted(state: GameState, missionId: string): void {
    Events.ensureMissionToday(state, missionId);
    state.completedMissionsToday ??= [];
    if (!state.completedMissionsToday.includes(missionId)) {
      state.completedMissionsToday.push(missionId);
    }
  }

  static unmarkMissionCompleted(state: GameState, missionId: string): void {
    if (!state.completedMissionsToday) return;
    state.completedMissionsToday = state.completedMissionsToday.filter((m) => m !== missionId);
  }

  /**
   * Reinicia el seguimiento de eventos al comenzar un nuevo día.
   */
  static initDay(state: GameState): void {
    Events.currentDayTracked = state.day;
    Events.firedToday.clear();
    Events.activeStorm = null;
    state.activeEvents = [];
    state.missionsToday = [];
    state.completedMissionsToday = [];
    if (!state.base.moxieOk) Events.ensureMissionToday(state, 'fix_moxie');
    if (!state.base.antennaOk) Events.ensureMissionToday(state, 'fix_antenna');
    if (state.base.panels.some((p) => p.dust > balance.dust.dirtyThreshold)) {
      Events.ensureMissionToday(state, 'clean_panels');
    }

    // Disparar eventos de inicio de día (sin hora 'at', como cold_night)
    const scheduled = Events.getScheduledEventsForDay(state.day);
    for (const ev of scheduled) {
      if (!ev.at) {
        Events.triggerEvent(state, ev);
        Events.firedToday.add(`${ev.type}@start`);
      }
    }
  }

  static getActiveStorm(): ActiveStormState | null {
    return Events.activeStorm;
  }

  static clearActiveStorm(): void {
    Events.activeStorm = null;
  }

  /**
   * Devuelve la dosis total de radiación (en DR) que suma la tormenta durante sus 30 s
   * según la ubicación del astronauta (sección 7.4 y criterio de Fase 4):
   * - mundo (afuera): 38 DR
   * - base: 10 DR
   * - refugio: 2 DR
   */
  static getStormTotalDoseForLocation(location: GameState['location']): number {
    if (location === 'refugio') return balance.radiation.stormRefuge;
    if (location === 'base') return balance.radiation.stormBase;
    return balance.radiation.stormOutside;
  }

  /**
   * Aplica de golpe la dosis completa de una tormenta solar según donde esté el astronauta.
   * Devuelve la dosis añadida (38 DR afuera, 10 DR en base, 2 DR en refugio).
   */
  static applyFullStormDose(state: GameState): {
    addedDose: number;
    rescueCause: RescueCause | null;
  } {
    const addedDose = Events.getStormTotalDoseForLocation(state.location);
    state.astronaut.doseToday += addedDose;
    state.astronaut.doseTotal += addedDose;
    if (state.location === 'refugio') {
      state.stats.stormsSheltered += 1;
    }
    const rescueCause: RescueCause | null =
      state.astronaut.doseTotal >= balance.radiation.doseLimit ? 'radiacion' : null;
    return { addedDose, rescueCause };
  }

  /**
   * Dispara un evento específico sobre el GameState.
   */
  static triggerEvent(state: GameState, ev: DayEventScript): ActiveStormState | null {
    if (!state.activeEvents.includes(ev.type)) {
      state.activeEvents.push(ev.type);
    }

    switch (ev.type) {
      case 'dust': {
        const targetIds = ev.panels && ev.panels.length > 0 ? ev.panels : ['p2'];
        for (const panel of state.base.panels) {
          if (targetIds.includes(panel.id)) {
            panel.dust = 0.55;
          }
        }
        Events.ensureMissionToday(state, 'clean_panels');
        Events.unmarkMissionCompleted(state, 'clean_panels');
        return null;
      }
      case 'moxie_pipes': {
        state.base.moxieOk = false;
        Events.ensureMissionToday(state, 'fix_moxie');
        Events.unmarkMissionCompleted(state, 'fix_moxie');
        return null;
      }
      case 'antenna': {
        state.base.antennaOk = false;
        Events.ensureMissionToday(state, 'fix_antenna');
        Events.unmarkMissionCompleted(state, 'fix_antenna');
        return null;
      }
      case 'cold_night': {
        return null;
      }
      case 'cme_hit':
      case 'cme_miss': {
        if (ev.type === 'cme_hit') {
          Events.ensureMissionToday(state, 'shelter');
          Events.unmarkMissionCompleted(state, 'shelter');
        }
        const eventId =
          ev.eventId ?? (ev.type === 'cme_miss' ? 'cme_falsa_alarma' : 'cme_mayo_2024');
        const donki = Data.getDonkiEventById(eventId);
        const storm: ActiveStormState = {
          type: ev.type,
          eventId,
          donkiActivityID: donki.donkiActivityID,
          phase: 'countdown',
          countdownSec: balance.radiation.shelterCountdownSec,
          impactRemainingSec: balance.radiation.stormHitSeconds,
          falseAlarmAnnounced: false,
        };
        Events.activeStorm = storm;
        return storm;
      }
    }
  }

  /**
   * Resuelve un evento de mantenimiento (paneles limpios, tuberías de MOXIE o antena).
   */
  static resolveMaintenanceEvent(
    state: GameState,
    type: 'dust' | 'moxie_pipes' | 'antenna',
    panelId?: string
  ): void {
    if (type === 'dust') {
      // Se limpia sólo el panel trabajado; la energía sube poco a poco en BaseSystem.tick.
      for (const p of state.base.panels) {
        if (!panelId || p.id === panelId) p.dust = 0;
      }
      if (state.base.panels.some((p) => p.dust > balance.dust.dirtyThreshold)) {
        return;
      }
      Events.markMissionCompleted(state, 'clean_panels');
    } else if (type === 'moxie_pipes') {
      state.base.moxieOk = true;
      Events.markMissionCompleted(state, 'fix_moxie');
    } else if (type === 'antenna') {
      state.base.antennaOk = true;
      Events.markMissionCompleted(state, 'fix_antenna');
    }
    state.activeEvents = state.activeEvents.filter((e) => e !== type);
  }

  /**
   * Avanza el sistema de eventos y la tormenta activa en función de dt (segundos reales).
   */
  static tick(state: GameState, dt: number): EventTickResult {
    const result: EventTickResult = {
      triggeredEvents: [],
      stormStarted: null,
      stormImpactStarted: false,
      stormFalseAlarmResolved: false,
      stormFinished: false,
      antennaDamaged: false,
      rescueCause: null,
    };

    if (Events.currentDayTracked !== state.day) {
      Events.initDay(state);
    }

    if (state.clock.paused || dt <= 0) {
      return result;
    }

    // 1. Revisar si algún evento programado por hora debe dispararse
    const scheduled = Events.getScheduledEventsForDay(state.day);
    for (const ev of scheduled) {
      const key = `${ev.type}@${ev.at ?? 'start'}`;
      if (Events.firedToday.has(key)) continue;

      const triggerMin = Events.parseTimeMinutes(ev.at);
      if (state.clock.minutes >= triggerMin) {
        Events.firedToday.add(key);
        const maybeStorm = Events.triggerEvent(state, ev);
        result.triggeredEvents.push(ev);
        if (maybeStorm) {
          result.stormStarted = maybeStorm;
        }
      }
    }

    // 2. Avanzar la tormenta solar activa si existe
    const storm = Events.activeStorm;
    if (!storm || storm.phase === 'resolved') {
      return result;
    }

    if (storm.type === 'cme_hit' && state.location === 'refugio') {
      Events.markMissionCompleted(state, 'shelter');
    }

    if (storm.phase === 'countdown') {
      storm.countdownSec = Math.max(0, storm.countdownSec - dt);

      // En cme_miss (falsa alarma del día 5), a los 60 s el modelo WSA-Enlil corrige la trayectoria
      if (
        storm.type === 'cme_miss' &&
        storm.countdownSec <= balance.radiation.shelterCountdownSec - 60 &&
        !storm.falseAlarmAnnounced
      ) {
        storm.falseAlarmAnnounced = true;
        storm.phase = 'resolved';
        state.activeEvents = state.activeEvents.filter((e) => e !== 'cme_miss');
        if (!state.activeEvents.includes('aurora_tonight')) {
          state.activeEvents.push('aurora_tonight');
        }
        result.stormFalseAlarmResolved = true;
        Events.activeStorm = null;
        return result;
      }

      if (storm.countdownSec <= 0 && storm.type === 'cme_hit') {
        storm.phase = 'impact';
        result.stormImpactStarted = true;
      }
      return result;
    }

    if (storm.phase === 'impact') {
      const stepSec = Math.min(dt, storm.impactRemainingSec);
      const totalDoseForLoc = Events.getStormTotalDoseForLocation(state.location);
      const dosePerSec = totalDoseForLoc / balance.radiation.stormHitSeconds;
      const addedDose = dosePerSec * stepSec;

      state.astronaut.doseToday += addedDose;
      state.astronaut.doseTotal += addedDose;

      storm.impactRemainingSec = Math.max(0, storm.impactRemainingSec - stepSec);

      if (state.astronaut.doseTotal >= balance.radiation.doseLimit) {
        result.rescueCause = 'radiacion';
      }

      if (storm.impactRemainingSec <= 0) {
        storm.phase = 'resolved';
        if (state.location === 'refugio') {
          state.stats.stormsSheltered += 1;
        }
        state.activeEvents = state.activeEvents.filter((e) => e !== 'cme_hit');
        // Las partículas solares dañan la electrónica expuesta: la antena queda con estática.
        // (En mayo de 2024 la cámara estelar del orbitador Mars Odyssey se apagó por lo mismo.)
        if (state.base.antennaOk) {
          state.base.antennaOk = false;
          if (!state.activeEvents.includes('antenna')) state.activeEvents.push('antenna');
          Events.ensureMissionToday(state, 'fix_antenna');
          Events.unmarkMissionCompleted(state, 'fix_antenna');
          result.antennaDamaged = true;
        }
        result.stormFinished = true;
        Events.activeStorm = null;
      }
    }

    return result;
  }
}
