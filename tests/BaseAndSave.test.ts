import { describe, expect, it } from 'vitest';
import { createInitialGameState } from '../src/state/GameState';
import { Save, SAVE_STORAGE_KEY, type StorageLike } from '../src/state/Save';
import { BaseSystem } from '../src/systems/BaseSystem';
import { createReplacementSampleSite } from '../src/systems/SampleSites';
import { Vitals } from '../src/systems/Vitals';

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

describe('Sistemas BaseSystem y Save (Fase 2)', () => {
  it('recargar sube el oxígeno del traje y baja la reserva de la base a razón de 0.5 por punto', () => {
    const state = createInitialGameState();
    state.astronaut.o2 = 60;
    state.base.o2Reserve = 80;
    state.base.energy = 100;

    // 1 segundo de recarga: sube 25 puntos de O2 (de 60 a 85) y baja 12.5 de reserva (de 80 a 67.5)
    const gained = BaseSystem.refillO2(state, 1);
    expect(gained).toBe(25);
    expect(state.astronaut.o2).toBe(85);
    expect(state.base.o2Reserve).toBeCloseTo(67.5, 4);

    // Otro segundo completa hasta 100 (+15 puntos) y baja 7.5 más de reserva (a 60)
    const gained2 = BaseSystem.refillO2(state, 1);
    expect(gained2).toBe(15);
    expect(state.astronaut.o2).toBe(100);
    expect(state.base.o2Reserve).toBeCloseTo(60, 4);
  });

  it('calentarse devuelve el traje a 21 °C y recarga la batería a 20 por segundo', () => {
    const state = createInitialGameState();
    state.astronaut.suitTempC = 12;
    state.astronaut.heaterBattery = 50;

    const added = BaseSystem.rechargeHeater(state, 2);
    expect(added).toBe(40);
    expect(state.astronaut.suitTempC).toBe(21);
    expect(state.astronaut.heaterBattery).toBe(90);
  });

  it('permite salir después de las 17:00, y de noche la temperatura/batería baja más rápido que el oxígeno', () => {
    const state = createInitialGameState();
    state.clock.minutes = 1019;
    expect(BaseSystem.canExitToWorld(state)).toBe(true);
    expect(BaseSystem.isNightExit(state)).toBe(false);

    state.clock.minutes = 1020;
    expect(BaseSystem.canExitToWorld(state)).toBe(true);
    expect(BaseSystem.isNightExit(state)).toBe(true);

    const day = createInitialGameState();
    day.location = 'mundo';
    day.clock.minutes = 700;
    Vitals.tick(day, 1);
    const night = createInitialGameState();
    night.location = 'mundo';
    night.clock.minutes = 1100;
    Vitals.tick(night, 1);
    expect(100 - night.astronaut.o2).toBeCloseTo((100 - day.astronaut.o2) * 1.35, 4);
    expect(100 - night.astronaut.heaterBattery).toBeGreaterThan(100 - night.astronaut.o2);
    expect(night.astronaut.suitTempC).toBeLessThan(day.astronaut.suitTempC);
  });

  it('dormir pasa al día 2 con dosis de hoy en 0 y dosis total intacta', () => {
    const state = createInitialGameState();
    state.day = 1;
    state.astronaut.doseToday = 0.85;
    state.astronaut.doseTotal = 0.85;
    state.tubes[0] = 'roca';

    const delivered = BaseSystem.deliverTubes(state);
    expect(delivered).toBe(1);
    expect(state.deliveredToday.roca).toBe(1);

    BaseSystem.sleepToNextDay(state);
    expect(state.day).toBe(2);
    expect(state.stats.daysSurvived).toBe(1);
    expect(state.astronaut.doseToday).toBe(0);
    expect(state.astronaut.doseTotal).toBeCloseTo(0.85, 4);
    expect(state.clock.minutes).toBe(540);
    expect(state.unlocks.customization).toBe(true);
  });

  it('guarda y carga el día en localStorage e ignora guardados corruptos o de otra versión', () => {
    const mem = new MemoryStorage();
    const state = createInitialGameState();
    state.day = 2;
    state.astronaut.doseTotal = 1.25;

    expect(Save.save(state, mem)).toBe(true);
    const loaded = Save.load(mem);
    expect(loaded).not.toBeNull();
    expect(loaded?.day).toBe(2);
    expect(loaded?.astronaut.doseTotal).toBeCloseTo(1.25, 4);

    // Si la versión no coincide o el JSON está roto, devuelve null sin fallar
    mem.setItem(SAVE_STORAGE_KEY, JSON.stringify({ ...state, version: 99 }));
    expect(Save.load(mem)).toBeNull();

    mem.setItem(SAVE_STORAGE_KEY, '{json_roto');
    expect(Save.load(mem)).toBeNull();
  });

  it('createReplacementSampleSite genera un sitio nuevo lejos de la base y de sitios existentes', () => {
    const existing = [
      { x: 500, y: 150 },
      { x: 200, y: 700 },
    ];
    const site = createReplacementSampleSite('roca', existing, 'd2-roca-re-1', 12345);
    expect(site.type).toBe('roca');
    expect(Math.hypot(site.x - 640, site.y - 480)).toBeGreaterThanOrEqual(110);
    for (const e of existing) {
      expect(Math.hypot(site.x - e.x, site.y - e.y)).toBeGreaterThanOrEqual(48);
    }
  });
});
