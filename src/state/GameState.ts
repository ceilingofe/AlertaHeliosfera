import balance from '../../content/balance.json';
import type { GameState } from '../types';

/**
 * Crea un estado inicial limpio para una partida nueva de Alerta Heliosfera.
 */
export function createInitialGameState(): GameState {
  return {
    version: 2,
    day: 1,
    clock: {
      minutes: balance.dayClock.startMin,
      paused: false,
    },
    location: 'mundo',
    astronaut: {
      o2: 100,
      heaterBattery: 100,
      suitTempC: balance.heater.suitC,
      doseToday: 0,
      doseTotal: 0,
      pos: { x: 640, y: 512 },
    },
    base: {
      energy: 100,
      o2Reserve: balance.supplies.normal.reserve,
      panels: [
        { id: 'p1', dust: 0 },
        { id: 'p2', dust: 0 },
        { id: 'p3', dust: 0 },
      ],
      antennaOk: true,
      moxieOk: true,
    },
    tubes: [null, null, null, null, null, null],
    deliveredToday: {
      roca: 0,
      suelo: 0,
      minerales: 0,
      aire: 0,
    },
    quotaToday: {
      roca: 1,
      suelo: 0,
      minerales: 0,
      aire: 0,
    },
    supplyBonus: 'normal',
    activeEvents: [],
    learnedToday: [],
    corviSeen: [],
    customization: {
      suit: 'blanco',
      hair: 1,
      accessory: null,
      patch: 'LUNA-7',
    },
    unlocks: {
      customization: false,
      accessories: ['diadema', 'mono'],
    },
    stats: {
      samples: {
        roca: 0,
        suelo: 0,
        minerales: 0,
        aire: 0,
      },
      moxieGrams: 0,
      stormsSheltered: 0,
      daysSurvived: 0,
      minigamesFailed: 0,
      triviaCorrect: 0,
      triviaAsked: 0,
    },
    missionTrust: 3,
    sciencePoints: 0,
    sitesUsedToday: [],
    journal: [],
    triviaDoneDay: 0,
  };
}

/**
 * Contenedor compartido del estado del juego para las escenas activas.
 */
class GameStateStore {
  private current: GameState = createInitialGameState();

  get state(): GameState {
    return this.current;
  }

  reset(nextState?: GameState): GameState {
    this.current = nextState ?? createInitialGameState();
    return this.current;
  }
}

export const gameStore = new GameStateStore();
