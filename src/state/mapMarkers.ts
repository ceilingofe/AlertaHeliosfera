import type { SampleType } from '../types';

export type MarkerKind =
  | 'player'
  | 'base'
  | 'refuge'
  | 'depot'
  | 'sample'
  | 'repair';

export interface MapMarker {
  id: string;
  kind: MarkerKind;
  x: number;
  y: number;
  sampleType?: SampleType;
  label: string;
  /** Si es false, el radar no lo dibuja (muestra ya tomada, equipo reparado, etc.). */
  active: boolean;
  /** Muestra que todavía falta para la cuota de hoy (se resalta en el radar). */
  needed?: boolean;
}

/**
 * Registro compartido de puntos del mapa exterior. Mundo lo llena y el HUD lo dibuja
 * en el radar y en el mapa completo (tecla M). Es TypeScript puro.
 */
class MapMarkerRegistry {
  markers: MapMarker[] = [];
  player = { x: 0, y: 0 };
  worldW = 1280;
  worldH = 960;

  set(list: MapMarker[]): void {
    this.markers = list;
  }

  clear(): void {
    this.markers = [];
  }
}

export const mapMarkers = new MapMarkerRegistry();

export const SAMPLE_COLORS: Record<SampleType, number> = {
  roca: 0xf77622,
  suelo: 0xe4a672,
  minerales: 0x2ce8f5,
  aire: 0xffffff,
};

export const SAMPLE_NAMES: Record<SampleType, string> = {
  roca: 'Roca',
  suelo: 'Suelo',
  minerales: 'Minerales',
  aire: 'Aire',
};
