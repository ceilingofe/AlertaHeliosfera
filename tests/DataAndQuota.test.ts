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

  it('calcula el retraso de luz con efemérides y no muestra marcadores TODO_DATO', () => {
    // 12 ene 2025: oposición cercana (~0.64 UA ≈ 5.3 min)
    const near = Data.getLightDelay(1, undefined, new Date('2025-01-12T00:00:00Z'));
    expect(near.minutes).toBeGreaterThan(5);
    expect(near.minutes).toBeLessThan(5.7);
    expect(near.label).toBe('CALCULADO');
    expect(near.isTodo).toBe(false);
    // Cada día de juego avanza un día real
    const later = Data.getLightDelay(30, undefined, new Date('2025-01-12T00:00:00Z'));
    expect(later.minutes).toBeGreaterThan(near.minutes);
    // Siempre dentro del rango físico Tierra–Marte (~3 a ~22 min)
    for (let d = 0; d < 800; d += 50) {
      const m = Data.getLightDelay(1, undefined, new Date(Date.UTC(2026, 0, 1) + d * 86400000)).minutes;
      expect(m).toBeGreaterThan(3);
      expect(m).toBeLessThan(22.5);
    }

    const meda = Data.getMedaForecast(1);
    expect(meda.tempsC.length).toBe(13);
    expect(meda.label).toBe('CALCULADO');
    expect(Math.min(...meda.tempsC)).toBeGreaterThanOrEqual(-86);
    expect(Math.max(...meda.tempsC)).toBeLessThanOrEqual(-20);

    const alertDay1 = Data.getSolarAlert(1);
    expect(alertDay1.hasAlert).toBe(true);
    expect(alertDay1.activityId).not.toContain('TODO_DATO');
    expect(alertDay1.activityId).toContain('X12');
    expect(alertDay1.label).toBe('ARCHIVO REAL');

    const json = JSON.stringify([horizonsJson, medaJson, eventsJson]);
    expect(json).not.toContain('TODO_DATO');
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
