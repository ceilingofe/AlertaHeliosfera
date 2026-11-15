import Phaser from 'phaser';
import { AudioSystem } from '../systems/Audio';

export interface StaticEffectOptions {
  /** Intervalo base entre ráfagas de interferencia de señal (ms). Por defecto 4200 ms. */
  intervalMs?: number;
  /** Duración de cada ráfaga suave de TV (ms). Por defecto 260 ms. */
  burstDurationMs?: number;
  /** Opacidad máxima (0..1) para que sea suave y no distraiga del juego. Por defecto 0.16. */
  maxAlpha?: number;
}

/**
 * Efecto suave de interferencia de señal tipo TV en toda la pantalla (640×360).
 * Aparece cada ciertos segundos durante unos milisegundos sin bloquear clics ni tapar la UI.
 */
export class StaticEffect {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private enabled = false;
  private intervalMs: number;
  private burstDurationMs: number;
  private maxAlpha: number;
  private nextBurstAt = 0;
  private burstEndAt = 0;
  private soundPlayedForBurst = false;

  constructor(scene: Phaser.Scene, options?: StaticEffectOptions) {
    this.scene = scene;
    this.intervalMs = options?.intervalMs ?? 4200;
    this.burstDurationMs = options?.burstDurationMs ?? 260;
    this.maxAlpha = options?.maxAlpha ?? 0.16;

    this.graphics = scene.add.graphics();
    this.graphics.setScrollFactor(0);
    this.graphics.setDepth(95);
    this.graphics.setVisible(false);
  }

  setEnabled(active: boolean, triggerImmediate = false): void {
    if (this.enabled === active && !triggerImmediate) return;
    this.enabled = active;
    if (!active) {
      this.graphics.clear();
      this.graphics.setVisible(false);
      return;
    }

    const now = this.scene.time.now;
    if (triggerImmediate) {
      this.burstEndAt = now + this.burstDurationMs;
      this.nextBurstAt = now + this.intervalMs;
      this.soundPlayedForBurst = false;
    } else if (now > this.nextBurstAt) {
      this.nextBurstAt = now + 1200;
    }
  }

  triggerBurstNow(): void {
    const now = this.scene.time.now;
    this.burstEndAt = now + this.burstDurationMs;
    this.nextBurstAt = now + this.intervalMs;
    this.soundPlayedForBurst = false;
  }

  update(time: number): void {
    if (!this.enabled) {
      return;
    }

    if (time >= this.nextBurstAt && time >= this.burstEndAt) {
      this.burstEndAt = time + this.burstDurationMs;
      // Pequeña variación natural entre 3.4 s y 5.0 s
      const jitter = ((Math.floor(time) % 5) - 2) * 350;
      this.nextBurstAt = time + this.intervalMs + jitter;
      this.soundPlayedForBurst = false;
    }

    if (time < this.burstEndAt) {
      if (!this.soundPlayedForBurst) {
        this.soundPlayedForBurst = true;
        AudioSystem.play('staticBurst');
      }
      this.drawMildTvStatic(time);
      this.graphics.setVisible(true);
    } else if (this.graphics.visible) {
      this.graphics.clear();
      this.graphics.setVisible(false);
    }
  }

  private drawMildTvStatic(time: number): void {
    this.graphics.clear();
    const seed = Math.floor(time / 35);

    // 1. Velo sutil de barrido de pantalla completa
    this.graphics.fillStyle(0xc0cbdc, this.maxAlpha * 0.22);
    this.graphics.fillRect(0, 0, 640, 360);

    // 2. Bandas horizontales de interferencia de señal de TV (4 franjas suaves que se desplazan)
    for (let b = 0; b < 4; b++) {
      const bandY = ((seed * 43 + b * 97) % 348) + 4;
      const bandH = b % 2 === 0 ? 6 : 3;
      const alpha = this.maxAlpha * (b === 0 ? 0.95 : 0.65);
      this.graphics.fillStyle(b % 2 === 0 ? 0xffffff : 0x8b9bb4, alpha);
      this.graphics.fillRect(0, bandY, 640, bandH);

      // Línea oscura de sincronía horizontal junto a la franja
      this.graphics.fillStyle(0x181425, alpha * 0.6);
      this.graphics.fillRect(0, (bandY + bandH) % 360, 640, 1);
    }

    // 3. Líneas finas de scanline cada 12 px con opacidad muy baja
    this.graphics.fillStyle(0xc0cbdc, this.maxAlpha * 0.35);
    const offset = seed % 12;
    for (let y = offset; y < 360; y += 12) {
      this.graphics.fillRect(0, y, 640, 1);
    }

    // 4. Granulado disperso de nieve de TV en toda la pantalla
    for (let i = 0; i < 55; i++) {
      const px = (seed * 73 + i * 131) % 634;
      const py = (seed * 59 + i * 83) % 356;
      const w = (i % 3 === 0 ? 6 : 3);
      const col = i % 3 === 0 ? 0xffffff : i % 2 === 0 ? 0xc0cbdc : 0x5a6988;
      this.graphics.fillStyle(col, this.maxAlpha * 0.85);
      this.graphics.fillRect(px, py, w, 2);
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
