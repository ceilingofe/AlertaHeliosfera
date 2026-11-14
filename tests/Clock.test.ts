import { describe, expect, it } from 'vitest';
import { createInitialGameState } from '../src/state/GameState';
import { Clock } from '../src/systems/Clock';

describe('Sistema Clock (src/systems/Clock.ts)', () => {
  it('inicia a las 09:00 (540 min) y llega a las 20:00 (1200 min) en 300 s reales', () => {
    const state = createInitialGameState();
    expect(state.clock.minutes).toBe(540);
    expect(Clock.formatTime(state.clock.minutes)).toBe('09:00');
    expect(Clock.getProgress(state.clock.minutes)).toBe(0);

    const res = Clock.tick(state, 300, 300);
    expect(state.clock.minutes).toBe(1200);
    expect(Clock.formatTime(state.clock.minutes)).toBe('20:00');
    expect(Clock.getProgress(state.clock.minutes)).toBe(1);
    expect(res.warned16).toBe(true);
    expect(res.curfew17).toBe(true);
    expect(res.ended20).toBe(true);
  });

  it('no avanza cuando el reloj está en pausa', () => {
    const state = createInitialGameState();
    Clock.setPaused(state, true);
    const res = Clock.tick(state, 60, 300);
    expect(state.clock.minutes).toBe(540);
    expect(res.warned16).toBe(false);
    expect(res.curfew17).toBe(false);
    expect(res.ended20).toBe(false);
  });

  it('dispara avisos al cruzar 16:00 (960 min) y toque de queda a las 17:00 (1020 min)', () => {
    const state = createInitialGameState();
    state.clock.minutes = 958;

    const r1 = Clock.tick(state, 2, 300); // +4.4 min -> 962.4
    expect(r1.warned16).toBe(true);
    expect(r1.curfew17).toBe(false);
    expect(Clock.isNight(state.clock.minutes)).toBe(false);

    state.clock.minutes = 1018;
    const r2 = Clock.tick(state, 2, 300); // +4.4 min -> 1022.4
    expect(r2.curfew17).toBe(true);
    expect(Clock.isNight(state.clock.minutes)).toBe(true);
  });

  it('soporta duración de 150 s para el día 1 cuando se solicita', () => {
    expect(Clock.getDayDurationSec(1, true)).toBe(150);
    expect(Clock.getDayDurationSec(1, false)).toBe(300);
    expect(Clock.getDayDurationSec(2, true)).toBe(300);
  });
});
