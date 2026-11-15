import { beforeEach, describe, expect, it } from 'vitest';
import horizonsJson from '../public/data/horizons_delay.json';
import medaJson from '../public/data/meda_jezero.json';
import eventsJson from '../public/data/events.json';
import { createInitialGameState } from '../src/state/GameState';
import { Data } from '../src/systems/Data';
import { Quota } from '../src/systems/Quota';

describe('Sistemas Data y Quota (Fase 3)', () => {
  beforeEach(() => {
    Data.setNasaDataCache({
      horizons: horizonsJson,
      meda: medaJson,
      events: eventsJson,
    });
  });

  it('asigna la cuota del Día 1 (1 roca) y del Día 2 (1 roca, 1 suelo)', () => {
    const state = createInitialGameState();
    expect(state.quotaToday.roca).toBe(1);
    expect(state.quotaToday.suelo).toBe(0);
    expect(Quota.isAllMet(state)).toBe(false);

    state.deliveredToday.roca = 1;
    expect(Quota.isTypeMet(state, 'roca')).toBe(true);
    expect(Quota.isAllMet(state)).toBe(true);

    state.day = 2;
    Quota.applyDailyQuota(state);
    expect(state.quotaToday.roca).toBe(1);
    expect(state.quotaToday.suelo).toBe(1);
  });

  it('respeta los marcadores TODO_DATO en JSON públicos y asigna etiquetas SIMULADO / ARCHIVO REAL', () => {
    // Mientras horizons_delay.json y meda_jezero.json tienen TODO_DATO, se etiquetan como SIMULADO
    const delay = Data.getLightDelay(1);
    expect(delay.minutes).toBe(12);
    expect(delay.isTodo).toBe(true);
    expect(delay.label).toBe('SIMULADO');
    expect(delay.source).toContain('JPL Horizons');

    const meda = Data.getMedaForecast(1);
    expect(meda.tempsC.length).toBe(13);
    expect(meda.isTodo).toBe(true);
    expect(meda.label).toBe('SIMULADO');
    expect(meda.source).toContain('MEDA Jezero');

    const alertDay1 = Data.getSolarAlert(1);
    expect(alertDay1.hasAlert).toBe(true);
    expect(alertDay1.activityId).toContain('TODO_DATO');
    expect(alertDay1.label).toBe('SIMULADO');
    expect(alertDay1.source).toBe('DONKI');

    // Si se inyecta un archivo real sin TODO_DATO, cambia a ARCHIVO REAL
    const realDelay = Data.getLightDelay(1, {
      delays: [{ date: '2026-03-01', minutes: 14 }],
    });
    expect(realDelay.minutes).toBe(14);
    expect(realDelay.isTodo).toBe(false);
    expect(realDelay.label).toBe('ARCHIVO REAL');
  });

  it('filtra las cápsulas científicas del Día 1 y conserva fuente NASA + etiqueta de honestidad', () => {
    const day1Facts = Data.getFactsForDay(1);
    expect(day1Facts.length).toBe(3);
    expect(day1Facts.map((f) => f.id)).toEqual([
      'luz',
      'radiacion',
      'cheyava',
    ]);
    for (const fact of day1Facts) {
      expect(fact.source.length).toBeGreaterThan(0);
      expect(['ARCHIVO REAL', 'SIMULADO', 'EN VIVO']).toContain(fact.label);
    }
  });
});
