import Phaser from 'phaser';

/** Tamaño lógico de diseño de todas las escenas (coordenadas que usa el código). */
export const VIEW_W = 640;
export const VIEW_H = 360;
/** Factor entre el lienzo real (1280×720) y el tamaño lógico. */
export const RENDER_SCALE = 2;

let installed = false;

/**
 * Hace que la cámara principal de cada escena muestre el área lógica 640×360
 * escalada ×2 sobre el lienzo de 1280×720. Se aplica justo antes de create().
 * Las escenas que necesiten otra cámara (Mundo con zoom ×4) la sobrescriben.
 */
export function installCameraDefaults(): void {
  if (installed) return;
  installed = true;
  const proto = Phaser.Scenes.Systems.prototype as unknown as {
    start: (data?: object) => void;
  };
  const originalStart = proto.start;
  proto.start = function (this: Phaser.Scenes.Systems, data?: object): void {
    originalStart.call(this, data);
    const cam = this.cameras?.main;
    if (cam) {
      cam.setOrigin(0, 0);
      cam.setZoom(RENDER_SCALE);
      cam.setScroll(0, 0);
    }
  };
}
