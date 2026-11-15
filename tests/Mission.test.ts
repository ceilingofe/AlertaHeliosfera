import { describe, expect, it } from 'vitest';
import trivia from '../content/trivia.json';
import minigames from '../content/minigames.json';
import { generatePipePuzzle, rotateMask, traceFlow } from '../src/minigames/pipePuzzle';
import { questionsForDay } from '../src/systems/TriviaBank';
import { createInitialGameState } from '../src/state/GameState';
import { Save } from '../src/state/Save';
import { BaseSystem } from '../src/systems/BaseSystem';
import { Ephemeris } from '../src/systems/Ephemeris';
import { generateSampleSites } from '../src/systems/SampleSites';
import { Vitals } from '../src/systems/Vitals';

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

describe('Consecuencias de misión', () => {
  it('no cumplir la cuota quita una estrella de confianza; entregar de más la recupera', () => {
    const state = createInitialGameState();
    expect(state.missionTrust).toBe(3);
    expect(BaseSystem.applyMissionReview(state, 'menos')).toBe(-1);
    expect(state.missionTrust).toBe(2);
    expect(BaseSystem.applyMissionReview(state, 'extra')).toBe(1);
    expect(state.missionTrust).toBe(3);
    // Nunca pasa del máximo
    expect(BaseSystem.applyMissionReview(state, 'extra')).toBe(0);
    expect(state.missionTrust).toBe(3);
  });

  it('dormir sin cumplir la cuota baja la confianza y deja menos reserva de O₂', () => {
    const state = createInitialGameState();
    const delta = BaseSystem.sleepToNextDay(state);
    expect(delta).toBe(-1);
    expect(state.supplyBonus).toBe('menos');
    expect(state.sitesUsedToday).toEqual([]);
    expect(state.day).toBe(2);
  });

  it('trabajar en un minijuego afuera gasta oxígeno y suma radiación aunque el reloj esté en pausa', () => {
    const state = createInitialGameState();
    state.location = 'mundo';
    state.clock.paused = true;
    const o2 = state.astronaut.o2;
    Vitals.tickFieldWork(state, 10);
    expect(state.astronaut.o2).toBeLessThan(o2);
    expect(state.astronaut.doseToday).toBeGreaterThan(0);
  });

  it('migra partidas guardadas de la versión 1', () => {
    const v1 = { ...createInitialGameState(), version: 1 } as Record<string, unknown>;
    delete v1.missionTrust;
    delete v1.sitesUsedToday;
    const migrated = Save.migrate(v1);
    expect(Save.isValidGameState(migrated)).toBe(true);
  });
});

describe('Sitios de muestra', () => {
  it('son reproducibles por día, lejos de la base y con margen limitado sobre la cuota', () => {
    const quota = { roca: 2, suelo: 1, minerales: 0, aire: 0 };
    const a = generateSampleSites(3, quota);
    const b = generateSampleSites(3, quota);
    expect(a).toEqual(b);
    const rocas = a.filter((s) => s.type === 'roca');
    expect(rocas.length).toBe(3);
    for (const s of a) expect(Math.hypot(s.x - 640, s.y - 480)).toBeGreaterThanOrEqual(110);
    expect(new Set(a.map((s) => s.id)).size).toBe(a.length);
  });
});

describe('Rompecabezas de tuberías', () => {
  it('siempre tiene solución y empieza sin resolver', () => {
    for (let seed = 1; seed < 60; seed++) {
      const p = generatePipePuzzle(5, 7, 2, seeded(seed));
      expect(traceFlow(p).ok).toBe(false);
      const solved = { ...p, masks: p.solution.slice(), clogged: new Set<number>() };
      expect(traceFlow(solved).ok).toBe(true);
      // Cada pieza del tablero es una rotación de la pieza de la solución
      p.masks.forEach((m, i) => {
        const rots = [m, rotateMask(m), rotateMask(rotateMask(m)), rotateMask(rotateMask(rotateMask(m)))];
        expect(rots).toContain(p.solution[i]);
      });
      expect(p.clogged.size).toBe(2);
    }
  });

  it('un tramo tapado corta el flujo', () => {
    const p = generatePipePuzzle(4, 5, 0, seeded(7));
    const solved = { ...p, masks: p.solution.slice(), clogged: new Set<number>([p.path[1]]) };
    expect(traceFlow(solved).ok).toBe(false);
  });
});

describe('Efemérides', () => {
  it('coinciden con distancias conocidas Tierra–Marte', () => {
    // Oposición del 16 ene 2025: ~0.642 UA
    expect(Ephemeris.earthMarsDistanceAU(new Date('2025-01-12T00:00:00Z'))).toBeCloseTo(0.642, 1);
    // Conjunción solar de nov 2023: ~2.5 UA (~21 min)
    expect(Ephemeris.lightDelayMinutes(new Date('2023-11-18T00:00:00Z'))).toBeGreaterThan(19);
  });
});

describe('Contenido didáctico', () => {
  it('cada pregunta de trivia tiene 4 opciones, respuesta válida, explicación y fuente', () => {
    expect(trivia.length).toBeGreaterThanOrEqual(30);
    const ids = new Set<string>();
    for (const q of trivia) {
      expect(q.options.length).toBe(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(4);
      expect(q.explain.length).toBeGreaterThan(30);
      expect(q.source.length).toBeGreaterThan(3);
      ids.add(q.id);
    }
    expect(ids.size).toBe(trivia.length);
  });

  it('el examen no repite preguntas en los primeros 10 días', () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 10; day++) {
      for (const q of questionsForDay(day)) {
        expect(seen.has(q.id)).toBe(false);
        seen.add(q.id);
      }
    }
  });

  it('los textos de los minijuegos no dejan marcadores pendientes', () => {
    expect(JSON.stringify(minigames)).not.toMatch(/TODO/);
  });
});
