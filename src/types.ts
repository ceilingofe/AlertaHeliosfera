export type SampleType = 'roca' | 'suelo' | 'minerales' | 'aire';
export type Mood = 'neutral' | 'happy' | 'alert' | 'think' | 'worried' | 'proud' | 'blink' | 'sad';
export type Label = 'ARCHIVO REAL' | 'SIMULADO' | 'EN VIVO';
export type SuitColor = 'blanco' | 'naranja' | 'azul' | 'verde' | 'rosa';
export type Accessory = 'diadema' | 'mono' | 'antena' | 'gorrito' | 'audifonos';
export type RescueCause = 'oxigeno' | 'radiacion';
export type CharacterId = 'girl' | 'boy1' | 'boy2';
export type CharacterFacing = 'up' | 'down' | 'left' | 'right';

export interface MinigameInput {
  type: string;
  day: number;
  difficulty: 1 | 2 | 3;
  zone?: string;
  panelId?: string;
}

export interface MinigameResult {
  ok: boolean;
  quality: 0 | 1 | 2 | 3;
  factId?: string;
}

export interface DialogMessage {
  mode: 'big' | 'small';
  mood: Mood;
  text: string;
  source?: string;
  label?: Label;
}

export interface ActiveStormState {
  type: 'cme_hit' | 'cme_miss';
  eventId: string;
  donkiActivityID: string;
  phase: 'countdown' | 'impact' | 'resolved';
  countdownSec: number;
  impactRemainingSec: number;
  falseAlarmAnnounced: boolean;
}

/**
 * Progreso de eventos del día. Vive en GameState para que una recarga
 * no pierda los eventos ya disparados ni la tormenta en curso.
 */
export interface EventsState {
  dayTracked: number;
  fired: string[];
  storm: ActiveStormState | null;
}

export interface GameState {
  version: 1;
  day: number;
  clock: { minutes: number; paused: boolean };
  location: 'mundo' | 'base' | 'refugio';
  astronaut: {
    o2: number;
    heaterBattery: number;
    suitTempC: number;
    doseToday: number;
    doseTotal: number;
    pos: { x: number; y: number };
  };
  base: {
    energy: number;
    o2Reserve: number;
    panels: { id: string; dust: number }[];
    antennaOk: boolean;
    moxieOk: boolean;
  };
  tubes: (SampleType | null)[];
  deliveredToday: Record<SampleType, number>;
  quotaToday: Record<SampleType, number>;
  supplyBonus: 'menos' | 'normal' | 'extra';
  events: EventsState;
  activeEvents: string[];
  learnedToday: string[];
  corviSeen: string[];
  customization: {
    suit: SuitColor;
    character: CharacterId;
    accessory: Accessory | null;
    patch: string;
  };
  unlocks: {
    customization: boolean;
    accessories: Accessory[];
  };
  stats: {
    samples: Record<SampleType, number>;
    moxieGrams: number;
    stormsSheltered: number;
    daysSurvived: number;
  };
}
