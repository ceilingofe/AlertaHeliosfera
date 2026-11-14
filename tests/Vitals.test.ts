import { describe, expect, it } from 'vitest';
import { createInitialGameState } from '../src/state/GameState';
import { Vitals } from '../src/systems/Vitals';

describe('Sistema Vitals (src/systems/Vitals.ts)', () => {
  it('baja el oxígeno de 100 a 0 en unos 120 s afuera y activa rescate por oxígeno', () => {
    const state = createInitialGameState();
    const after119 = Vitals.tick(state, 119);
    expect(state.astronaut.o2).toBeGreaterThan(0);
    expect(after119.warnedO2At40).toBe(true);
    expect(after119.dangerO2At20).toBe(true);
    expect(after119.rescueCause).toBeNull();

    const after121 = Vitals.tick(state, 2);
    expect(state.astronaut.o2).toBe(0);
    expect(after121.rescueCause).toBe('oxigeno');
  });

  it('gasta la batería del calefactor 3 veces más rápido después de las 17:00', () => {
    const dayState = createInitialGameState();
    dayState.clock.minutes = 600; // 10:00 (día)
    Vitals.tick(dayState, 10);
    const dayDrain = 100 - dayState.astronaut.heaterBattery;

    const nightState = createInitialGameState();
    nightState.clock.minutes = 1020; // 17:00 (noche)
    Vitals.tick(nightState, 10);
    const nightDrain = 100 - nightState.astronaut.heaterBattery;

    expect(dayDrain).toBeCloseTo(4, 4);
    expect(nightDrain).toBeCloseTo(12, 4);
    expect(nightDrain / dayDrain).toBeCloseTo(3, 4);
  });

  it('enfría el traje cuando la batería llega a 0 y triplica el consumo de oxígeno debajo de 18 °C', () => {
    const state = createInitialGameState();
    state.astronaut.heaterBattery = 0;
    state.astronaut.suitTempC = 21;

    // En 4 segundos sin batería baja de 21 °C a 17 °C (< 18 °C)
    Vitals.tick(state, 4);
    expect(state.astronaut.suitTempC).toBe(17);

    const o2Before = state.astronaut.o2;
    Vitals.tick(state, 10);
    const coldO2Drain = o2Before - state.astronaut.o2;

    // 0.8333 * 3 * 10 = ~25 puntos
    expect(coldO2Drain).toBeCloseTo(0.8333 * 3 * 10, 2);
  });

  it('acumula radiación afuera y la radiación total nunca baja ni al reiniciar el día', () => {
    const state = createInitialGameState();
    Vitals.tick(state, 100);
    expect(state.astronaut.doseToday).toBeGreaterThan(0);
    const totalAfterOutside = state.astronaut.doseTotal;
    expect(totalAfterOutside).toBeCloseTo(0.4587, 3);

    // En la base no sube pero tampoco baja
    state.location = 'base';
    Vitals.tick(state, 60);
    expect(state.astronaut.doseTotal).toBe(totalAfterOutside);

    // Al dormir se reinicia doseToday, pero doseTotal permanece intacta
    Vitals.resetDailyDose(state);
    expect(state.astronaut.doseToday).toBe(0);
    expect(state.astronaut.doseTotal).toBe(totalAfterOutside);
  });

  it('activa rescate por radiación al alcanzar el límite de 150 DR', () => {
    const state = createInitialGameState();
    state.astronaut.doseTotal = 149;
    const cause = Vitals.applyStormImpact(state, 30);
    expect(state.astronaut.doseTotal).toBeGreaterThanOrEqual(150);
    expect(cause).toBe('radiacion');
  });
});
