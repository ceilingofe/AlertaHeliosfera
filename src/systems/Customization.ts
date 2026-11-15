import balance from '../../content/balance.json';
import type {
  Accessory,
  CharacterId,
  GameState,
  RescueCause,
  SampleType,
  SuitColor,
} from '../types';
import { Data, type FactEntry } from './Data';

export interface SuitColorPalette {
  id: SuitColor;
  name: string;
  lightHex: string;
  shadowHex: string;
  lightInt: number;
  shadowInt: number;
  lightRgb: [number, number, number];
  shadowRgb: [number, number, number];
}

export const SUIT_PALETTES: Record<SuitColor, SuitColorPalette> = {
  blanco: {
    id: 'blanco',
    name: 'Blanco',
    lightHex: '#ffffff',
    shadowHex: '#c0cbdc',
    lightInt: 0xffffff,
    shadowInt: 0xc0cbdc,
    lightRgb: [0xff, 0xff, 0xff],
    shadowRgb: [0xc0, 0xcb, 0xdc],
  },
  naranja: {
    id: 'naranja',
    name: 'Naranja',
    lightHex: '#f77622',
    shadowHex: '#be4a2f',
    lightInt: 0xf77622,
    shadowInt: 0xbe4a2f,
    lightRgb: [0xf7, 0x76, 0x22],
    shadowRgb: [0xbe, 0x4a, 0x2f],
  },
  azul: {
    id: 'azul',
    name: 'Azul',
    lightHex: '#2ce8f5',
    shadowHex: '#0099db',
    lightInt: 0x2ce8f5,
    shadowInt: 0x0099db,
    lightRgb: [0x2c, 0xe8, 0xf5],
    shadowRgb: [0x00, 0x99, 0xdb],
  },
  verde: {
    id: 'verde',
    name: 'Verde',
    lightHex: '#63c74d',
    shadowHex: '#3e8948',
    lightInt: 0x63c74d,
    shadowInt: 0x3e8948,
    lightRgb: [0x63, 0xc7, 0x4d],
    shadowRgb: [0x3e, 0x89, 0x48],
  },
  rosa: {
    id: 'rosa',
    name: 'Rosa',
    lightHex: '#f6757a',
    shadowHex: '#b55088',
    lightInt: 0xf6757a,
    shadowInt: 0xb55088,
    lightRgb: [0xf6, 0x75, 0x7a],
    shadowRgb: [0xb5, 0x50, 0x88],
  },
};

export const SUIT_COLOR_ORDER: SuitColor[] = ['blanco', 'naranja', 'azul', 'verde', 'rosa'];

export const CHARACTER_ORDER: CharacterId[] = ['girl', 'boy1', 'boy2'];

export const ACCESSORY_ORDER: Accessory[] = [
  'diadema',
  'mono',
  'antena',
  'gorrito',
  'audifonos',
];

export const ACCESSORY_UNLOCK_DAY: Record<Accessory, number> = {
  diadema: 1,
  mono: 1,
  antena: 5,
  gorrito: 10,
  audifonos: 15,
};

export const PATCH_OPTIONS = ['SPACECROWS', 'JEZERO', 'HELIOSFERA', 'PERSEVERANCE'] as const;

export interface DiplomaSummary {
  missionCode: string;
  daysSurvived: number;
  totalSamples: number;
  samplesByType: Record<SampleType, number>;
  moxieKg: number;
  moxieKgFormatted: string;
  stormsSheltered: number;
  doseTotal: number;
  dosePercent: number;
  cause: RescueCause;
  zoneName: string;
  favoriteFact: FactEntry;
}

/**
 * Sistema de personalización del astronauta y cálculo de estadísticas del Diploma (sección 9.6 y 9.8).
 * Escrito en TypeScript puro sin depender de Phaser.
 */
export class Customization {
  static isCustomizationUnlocked(state: GameState): boolean {
    return state.unlocks.customization;
  }

  static isAccessoryUnlocked(state: GameState, accessory: Accessory): boolean {
    return (
      state.unlocks.customization && state.unlocks.accessories.includes(accessory)
    );
  }

  static setSuitColor(state: GameState, suit: SuitColor): boolean {
    if (!state.unlocks.customization && suit !== 'blanco') {
      return false;
    }
    state.customization.suit = suit;
    return true;
  }

  static setCharacter(state: GameState, character: CharacterId): boolean {
    if (!state.unlocks.customization && character !== 'girl') {
      return false;
    }
    state.customization.character = character;
    return true;
  }

  static setAccessory(state: GameState, accessory: Accessory | null): boolean {
    if (accessory === null) {
      state.customization.accessory = null;
      return true;
    }
    if (!Customization.isAccessoryUnlocked(state, accessory)) {
      return false;
    }
    state.customization.accessory = accessory;
    return true;
  }

  static setPatch(state: GameState, patch: string): boolean {
    if (!state.unlocks.customization) {
      return false;
    }
    state.customization.patch = patch;
    return true;
  }

  /**
   * Aplica el cambio de paleta en un buffer RGBA (Uint8ClampedArray o Uint8Array)
   * desde la fila `startRow` en adelante:
   * - #ffffff (255, 255, 255) -> color claro del traje
   * - #c0cbdc (192, 203, 220) -> color sombra del traje
   */
  static recolorRgbaBuffer(
    data: Uint8ClampedArray | Uint8Array,
    width: number,
    height: number,
    startRow: number,
    suit: SuitColor
  ): void {
    if (suit === 'blanco') return;
    const palette = SUIT_PALETTES[suit];
    if (!palette) return;

    const [lr, lg, lb] = palette.lightRgb;
    const [sr, sg, sb] = palette.shadowRgb;

    for (let y = startRow; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const a = data[idx + 3];
        if (a === 0) continue;

        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        if (r === 0xff && g === 0xff && b === 0xff) {
          data[idx] = lr;
          data[idx + 1] = lg;
          data[idx + 2] = lb;
        } else if (r === 0xc0 && g === 0xcb && b === 0xdc) {
          data[idx] = sr;
          data[idx + 1] = sg;
          data[idx + 2] = sb;
        }
      }
    }
  }

  /**
   * Calcula las métricas del diploma al terminar la misión (sección 7.7 y 9.8).
   */
  static computeDiplomaSummary(
    state: GameState,
    cause: RescueCause = 'oxigeno',
    zoneName = 'Bright Angel',
    favoriteFactId?: string
  ): DiplomaSummary {
    const samplesByType: Record<SampleType, number> = {
      roca: state.stats.samples.roca ?? 0,
      suelo: state.stats.samples.suelo ?? 0,
      minerales: state.stats.samples.minerales ?? 0,
      aire: state.stats.samples.aire ?? 0,
    };
    const totalSamples =
      samplesByType.roca +
      samplesByType.suelo +
      samplesByType.minerales +
      samplesByType.aire;

    const moxieKg = Number((state.stats.moxieGrams / 1000).toFixed(2));
    const moxieKgFormatted = moxieKg.toFixed(1).replace('.', ',');

    const doseTotal = Number(state.astronaut.doseTotal.toFixed(1));
    const dosePercent = Math.min(
      100,
      Math.max(0, Math.round((state.astronaut.doseTotal / balance.radiation.doseLimit) * 100))
    );

    const allFacts = Data.getAllFacts();
    const chosenFact =
      (favoriteFactId ? Data.getFactById(favoriteFactId) : undefined) ??
      (state.learnedToday.length > 0 ? Data.getFactById(state.learnedToday[0]) : undefined) ??
      allFacts[0];

    return {
      missionCode: 'LUNA-7',
      daysSurvived: state.stats.daysSurvived,
      totalSamples,
      samplesByType,
      moxieKg,
      moxieKgFormatted,
      stormsSheltered: state.stats.stormsSheltered,
      doseTotal,
      dosePercent,
      cause,
      zoneName,
      favoriteFact: chosenFact,
    };
  }
}
