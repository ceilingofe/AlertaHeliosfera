import { describe, expect, it } from 'vitest';
import { createInitialGameState } from '../src/state/GameState';
import { Save, SAVE_STORAGE_KEY, type StorageLike } from '../src/state/Save';
import { BaseSystem } from '../src/systems/BaseSystem';

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
    expect(state.base.energy).toBeCloseTo(99.5, 4);

    // Otro segundo completa hasta 100 (+15 puntos) y baja 7.5 más de reserva (a 60)
    const gained2 = BaseSystem.refillO2(state, 1);
    expect(gained2).toBe(15);
    expect(state.astronaut.o2).toBe(100);
    expect(state.base.o2Reserve).toBeCloseTo(60, 4);
    expect(state.base.energy).toBeCloseTo(99.2, 4);
  });

  it('calentarse devuelve el traje a 21 °C, recarga la batería y consume energía de la base', () => {
    const state = createInitialGameState();
    state.astronaut.suitTempC = 12;
    state.astronaut.heaterBattery = 50;
    state.base.energy = 100;

    const added = BaseSystem.rechargeHeater(state, 2);
    expect(added).toBe(40);
    expect(state.astronaut.suitTempC).toBe(21);
    expect(state.astronaut.heaterBattery).toBe(90);
    expect(state.base.energy).toBeCloseTo(99, 4);
  });

  it('aplica el bonus de batería del suministro extra al iniciar el día siguiente', () => {
    const state = createInitialGameState();
    state.base.energy = 40;

    BaseSystem.sleepToNextDay(state, 'extra');

    expect(state.base.o2Reserve).toBe(100);
    expect(state.base.energy).toBe(70);
  });

  it('no calienta el traje si la base no tiene energía', () => {
    const state = createInitialGameState();
    state.astronaut.suitTempC = 12;
    state.astronaut.heaterBattery = 50;
    state.base.energy = 0;

    expect(BaseSystem.rechargeHeater(state, 1)).toBe(0);
    expect(state.astronaut.suitTempC).toBe(12);
    expect(state.astronaut.heaterBattery).toBe(50);
  });

  it('no permite salir por la puerta después de las 17:00 (1020 min)', () => {
    const state = createInitialGameState();
    state.clock.minutes = 1019;
    expect(BaseSystem.canExitToWorld(state)).toBe(true);

    state.clock.minutes = 1020;
    expect(BaseSystem.canExitToWorld(state)).toBe(false);
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

  it('rechaza guardados incompletos o corruptos en lugar de cargarlos a medias', () => {
    const mem = new MemoryStorage();
    const base = createInitialGameState();

    const corruptos: Record<string, unknown> = {
      'ubicación inválida': { ...base, location: 'orbita' },
      'tubo con tipo desconocido': { ...base, tubes: ['roca', 'lava', null, null, null, null] },
      'oxígeno fuera de rango': { ...base, astronaut: { ...base.astronaut, o2: 250 } },
      'posición inválida': { ...base, astronaut: { ...base.astronaut, pos: { x: 'a', y: 1 } } },
      'eventos corruptos': {
        ...base,
        events: { dayTracked: 2, fired: [], storm: { type: 'otra' } },
      },
      'paneles corruptos': { ...base, base: { ...base.base, panels: [{ id: 'p1', dust: 'mucho' }] } },
      'cuota incompleta': { ...base, quotaToday: { roca: 1 } },
      'accesorio desconocido': {
        ...base,
        customization: { ...base.customization, accessory: 'sombrero' },
      },
      'personaje desconocido': {
        ...base,
        customization: { ...base.customization, character: 'alien' },
      },
    };

    for (const [nombre, value] of Object.entries(corruptos)) {
      mem.setItem(SAVE_STORAGE_KEY, JSON.stringify(value));
      expect(Save.load(mem), nombre).toBeNull();
    }
  });

  it('migra guardados anteriores sin estado de eventos en lugar de descartar la partida', () => {
    const mem = new MemoryStorage();
    const legacy = { ...createInitialGameState(), day: 3 } as Record<string, unknown>;
    delete legacy.events;

    mem.setItem(SAVE_STORAGE_KEY, JSON.stringify(legacy));

    const loaded = Save.load(mem);
    expect(loaded?.day).toBe(3);
    expect(loaded?.events).toEqual({ dayTracked: 3, fired: [], storm: null });
  });

  it('migra el peinado anterior al nuevo campo de personaje', () => {
    const mem = new MemoryStorage();
    const legacy = { ...createInitialGameState(), day: 2 } as Record<string, unknown>;
    legacy.customization = {
      suit: 'azul',
      hair: 2,
      accessory: null,
      patch: 'LUNA-7',
    };

    mem.setItem(SAVE_STORAGE_KEY, JSON.stringify(legacy));

    const loaded = Save.load(mem);
    expect(loaded?.customization.character).toBe('boy1');
    expect(loaded?.customization.suit).toBe('azul');
    expect(
      (loaded?.customization as unknown as Record<string, unknown>).hair
    ).toBeUndefined();
  });
});
