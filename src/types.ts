export type SampleType = 'roca' | 'suelo' | 'minerales' | 'aire';
export type Mood = 'neutral' | 'happy' | 'alert' | 'think' | 'worried' | 'proud' | 'blink' | 'sad';
export type Label = 'ARCHIVO REAL' | 'SIMULADO' | 'EN VIVO' | 'CALCULADO';
export type SuitColor = 'blanco' | 'naranja' | 'azul' | 'verde' | 'rosa';
export type Accessory = 'diadema' | 'mono' | 'antena' | 'gorrito' | 'audifonos';
export type RescueCause = 'oxigeno' | 'radiacion' | 'mision';

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
  aborted?: boolean;
}

export interface DialogMessage {
  mode: 'big' | 'small';
  mood: Mood;
  text: string;
  source?: string;
  label?: Label;
}

export interface GameState {
  version: 2;
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
  activeEvents: string[];
  learnedToday: string[];
  corviSeen: string[];
  customization: {
    suit: SuitColor;
    hair: 1 | 2 | 3;
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
    minigamesFailed: number;
    triviaCorrect: number;
    triviaAsked: number;
  };
  /** Confianza de Control de Misión (0 a 3). Si llega a 0, la misión se cancela. */
  missionTrust: number;
  /** Puntos de ciencia: suben con muestras de calidad y respuestas correctas. */
  sciencePoints: number;
  /** Sitios de muestra ya usados o arruinados hoy (no reaparecen hasta mañana). */
  sitesUsedToday: string[];
  /** Bitácora: todos los datos científicos aprendidos en la misión. */
  journal: string[];
  /** Último día en que se presentó el examen de Control de Misión. */
  triviaDoneDay: number;
  /** Misiones secundarias o de evento activadas hoy (permanecen visibles al completarse). */
  missionsToday?: string[];
  /** Misiones completadas hoy (permanecen marcadas el resto del día). */
  completedMissionsToday?: string[];
  /** Sitios de muestra de reemplazo generados hoy tras abortar un minijuego. */
  extraSitesToday?: { id: string; type: SampleType; x: number; y: number }[];
}
