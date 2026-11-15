import { beforeEach, describe, expect, it } from 'vitest';
import eventsJson from '../public/data/events.json';
import horizonsJson from '../public/data/horizons_delay.json';
import medaJson from '../public/data/meda_jezero.json';
import { createInitialGameState } from '../src/state/GameState';
import { BaseSystem } from '../src/systems/BaseSystem';
import { Data } from '../src/systems/Data';
import { Events } from '../src/systems/Events';

describe('Fase 4 · Eventos de los días 2 a 5, tormenta solar y preguntas de Corvi', () => {
  beforeEach(() => {
    Data.setNasaDataCache({
      events: eventsJson,
      meda: medaJson,
      horizons: horizonsJson,
    });
  });

  it('día 2: dispara el evento de polvo en el panel p2 a las 11:00 y permite limpiarlo', () => {
    const state = createInitialGameState();
    state.day = 2;
    Events.initDay(state);

    // A las 10:30 (630 min) aún no ocurre el evento de polvo
    state.clock.minutes = 630;
    const early = Events.tick(state, 1);
    expect(early.triggeredEvents).toHaveLength(0);
    expect(state.base.panels.find((p) => p.id === 'p2')?.dust).toBe(0);

    // A las 11:00 (660 min) se ensucia el panel p2
    state.clock.minutes = 660;
    const atEleven = Events.tick(state, 1);
    expect(atEleven.triggeredEvents).toHaveLength(1);
    expect(atEleven.triggeredEvents[0].type).toBe('dust');
    expect(state.base.panels.find((p) => p.id === 'p2')?.dust).toBeCloseTo(0.55);
    expect(state.activeEvents).toContain('dust');

    // Al resolver el mantenimiento de paneles se limpia el polvo y sube energía a 100%
    Events.resolveMaintenanceEvent(state, 'dust');
    expect(state.base.panels.every((p) => p.dust === 0)).toBe(true);
    expect(state.base.energy).toBe(100);
    expect(state.activeEvents).not.toContain('dust');
  });

  it('día 3 (cme_hit): cuenta regresiva de 120 s y suma 38 DR afuera, 10 DR en base y 2 DR en refugio', () => {
    // 1. Quedarse afuera suma 38 DR
    const stateOutside = createInitialGameState();
    stateOutside.day = 3;
    stateOutside.location = 'mundo';
    Events.initDay(stateOutside);

    stateOutside.clock.minutes = 13 * 60; // 13:00
    const startRes = Events.tick(stateOutside, 0.1);
    expect(startRes.stormStarted).not.toBeNull();
    expect(startRes.stormStarted?.donkiActivityID).toContain('TODO_DATO');

    // Consumir los 120 s de cuenta regresiva
    const impactStart = Events.tick(stateOutside, 120);
    expect(impactStart.stormImpactStarted).toBe(true);

    const doseBeforeOutside = stateOutside.astronaut.doseTotal;
    const finishOutside = Events.tick(stateOutside, 30);
    expect(finishOutside.stormFinished).toBe(true);
    expect(stateOutside.astronaut.doseTotal - doseBeforeOutside).toBeCloseTo(38, 4);

    // 2. Quedarse en la base suma 10 DR
    const stateBase = createInitialGameState();
    stateBase.day = 3;
    stateBase.location = 'base';
    const baseRes = Events.applyFullStormDose(stateBase);
    expect(baseRes.addedDose).toBe(10);
    expect(stateBase.astronaut.doseTotal).toBe(10);

    // 3. Entrar al refugio suma solo 2 DR e incrementa stormsSheltered
    const stateRefuge = createInitialGameState();
    stateRefuge.day = 3;
    stateRefuge.location = 'refugio';
    const refugeRes = Events.applyFullStormDose(stateRefuge);
    expect(refugeRes.addedDose).toBe(2);
    expect(stateRefuge.astronaut.doseTotal).toBe(2);
    expect(stateRefuge.stats.stormsSheltered).toBe(1);
  });

  it('día 4: inicia con cold_night y descompone las tuberías de MOXIE a las 10:30', () => {
    const state = createInitialGameState();
    state.day = 4;
    Events.initDay(state);

    expect(state.activeEvents).toContain('cold_night');
    expect(state.base.moxieOk).toBe(true);

    state.clock.minutes = 10 * 60 + 30; // 10:30
    Events.tick(state, 1);
    expect(state.base.moxieOk).toBe(false);
    expect(state.activeEvents).toContain('moxie_pipes');

    Events.resolveMaintenanceEvent(state, 'moxie_pipes');
    expect(state.base.moxieOk).toBe(true);
    expect(state.activeEvents).not.toContain('moxie_pipes');
  });

  it('día 5 (cme_miss): falsa alarma se resuelve a los 60 s con modelo WSA-Enlil y activa aurora_tonight', () => {
    const state = createInitialGameState();
    state.day = 5;
    Events.initDay(state);

    state.clock.minutes = 12 * 60; // 12:00
    const start = Events.tick(state, 0.1);
    expect(start.stormStarted?.type).toBe('cme_miss');

    // Al avanzar 60 s de la cuenta regresiva (quedan <= 60 s de 120 s), WSA-Enlil corrige trayectoria
    const resolved = Events.tick(state, 60);
    expect(resolved.stormFalseAlarmResolved).toBe(true);
    expect(state.activeEvents).toContain('aurora_tonight');
    expect(Events.getActiveStorm(state)).toBeNull();
  });

  it('no cumplir la cuota solo cambia el suministro del día siguiente a menos (reserva 50 %) y permite avanzar días 1 a 5', () => {
    const state = createInitialGameState();
    for (let d = 1; d <= 5; d++) {
      expect(state.day).toBe(d);
      // No entregamos muestras este día
      BaseSystem.sleepToNextDay(state);
      expect(state.supplyBonus).toBe('menos');
      expect(state.base.o2Reserve).toBe(50);
      expect(state.astronaut.o2).toBe(100);
    }
    expect(state.day).toBe(6);
    expect(state.unlocks.customization).toBe(true);
    expect(state.unlocks.accessories).toEqual(
      expect.arrayContaining(['diadema', 'mono', 'antena'])
    );
  });

  it('guarda la tormenta y los eventos disparados dentro del GameState para sobrevivir a una recarga', () => {
    const state = createInitialGameState();
    state.day = 3;
    state.clock.minutes = 13 * 60; // 13:00
    Events.initDay(state);

    const started = Events.tick(state, 0.1);
    expect(started.stormStarted).not.toBeNull();

    // Simula guardar y recargar: el estado por sí solo conserva tormenta y eventos disparados
    const reloaded = JSON.parse(JSON.stringify(state)) as typeof state;
    expect(Events.getActiveStorm(reloaded)?.phase).toBe('countdown');
    expect(reloaded.events.fired).toContain('cme_hit@13:00');

    // ensureDay no reinicia un día ya inicializado, así que no borra la cuenta regresiva
    Events.ensureDay(reloaded);
    expect(Events.getActiveStorm(reloaded)).not.toBeNull();

    const before = Events.getActiveStorm(reloaded)?.countdownSec ?? 0;
    Events.tick(reloaded, 10);
    expect(Events.getActiveStorm(reloaded)?.countdownSec).toBeCloseTo(before - 10, 4);
  });

  it('desbloquea progresivamente las 10 preguntas de Corvi del día 1 al día 5', () => {
    expect(Data.getUnlockedCorviQA(1).length).toBe(4);
    expect(Data.getUnlockedCorviQA(3).length).toBe(8);
    expect(Data.getUnlockedCorviQA(5).length).toBe(10);
  });
});
