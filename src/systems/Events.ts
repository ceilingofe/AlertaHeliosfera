import balance from '../../content/balance.json';
import type { ActiveStormState, GameState, RescueCause } from '../types';
import { Data, type DayEventScript } from './Data';

export type { ActiveStormState };

export interface EventTickResult {
  triggeredEvents: DayEventScript[];
  stormStarted: ActiveStormState | null;
  stormImpactStarted: boolean;
  stormFalseAlarmResolved: boolean;
  stormFinished: boolean;
  rescueCause: RescueCause | null;
}

/**
 * Sistema de eventos diarios y tormentas solares (sección 7.4 y 9.2).
 * Escrito en TypeScript puro sin depender de Phaser.
 * El progreso del día vive en state.events para sobrevivir a una recarga.
 */
export class Events {
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
      { type: 'cold_night' },
      { type: 'cme_miss', at: '12:00', eventId: 'cme_falsa_alarma' },
    ];

    const selected: DayEventScript[] = [];
    for (let i = 0; i < count; i++) {
      selected.push(pool[(day + i) % pool.length]);
    }
    return selected;
  }

  /**
   * Reinicia el seguimiento de eventos al comenzar un nuevo día.
   */
  static initDay(state: GameState): void {
    state.events = { dayTracked: state.day, fired: [], storm: null };
    state.activeEvents = [];

    // Disparar eventos de inicio de día (sin hora 'at', como cold_night)
    const scheduled = Events.getScheduledEventsForDay(state.day);
    for (const ev of scheduled) {
      if (!ev.at) {
        Events.triggerEvent(state, ev);
        state.events.fired.push(`${ev.type}@start`);
      }
    }
  }

  /**
   * Inicializa el día solo si aún no se hizo, para no borrar una tormenta
   * ni los eventos ya disparados al reanudar una partida.
   */
  static ensureDay(state: GameState): void {
    if (state.events.dayTracked !== state.day) {
      Events.initDay(state);
    }
  }

  static getActiveStorm(state: GameState): ActiveStormState | null {
    return state.events.storm;
  }

  static clearActiveStorm(state: GameState): void {
    state.events.storm = null;
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
        return null;
      }
      case 'moxie_pipes': {
        state.base.moxieOk = false;
        return null;
      }
      case 'antenna': {
        state.base.antennaOk = false;
        return null;
      }
      case 'cold_night': {
        return null;
      }
      case 'cme_hit':
      case 'cme_miss': {
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
        state.events.storm = storm;
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
      for (const p of state.base.panels) {
        if (!panelId || p.id === panelId) {
          p.dust = 0;
        }
      }
      state.base.energy = 100;
    } else if (type === 'moxie_pipes') {
      state.base.moxieOk = true;
    } else if (type === 'antenna') {
      state.base.antennaOk = true;
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
      rescueCause: null,
    };

    if (state.events.dayTracked !== state.day) {
      Events.initDay(state);
    }

    if (state.clock.paused || dt <= 0) {
      return result;
    }

    // 1. Revisar si algún evento programado por hora debe dispararse
    const scheduled = Events.getScheduledEventsForDay(state.day);
    for (const ev of scheduled) {
      const key = `${ev.type}@${ev.at ?? 'start'}`;
      if (state.events.fired.includes(key)) continue;

      const triggerMin = Events.parseTimeMinutes(ev.at);
      if (state.clock.minutes >= triggerMin) {
        state.events.fired.push(key);
        const maybeStorm = Events.triggerEvent(state, ev);
        result.triggeredEvents.push(ev);
        if (maybeStorm) {
          result.stormStarted = maybeStorm;
        }
      }
    }

    // 2. Avanzar la tormenta solar activa si existe
    const storm = state.events.storm;
    if (!storm || storm.phase === 'resolved') {
      return result;
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
        state.events.storm = null;
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
        result.stormFinished = true;
        state.events.storm = null;
      }
    }

    return result;
  }
}
