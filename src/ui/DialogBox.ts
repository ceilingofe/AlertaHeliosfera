import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { AudioSystem } from '../systems/Audio';
import type { Label, Mood } from '../types';

export interface DialogBoxConfig {
  mode: 'big' | 'small';
  mood: Mood;
  text: string;
  source?: string;
  label?: Label;
  autoCloseMs?: number;
  onComplete?: () => void;
}

const MOOD_TO_SPRITE: Record<Mood, string> = {
  neutral: 'corvi_neutral',
  happy: 'corvi_happy',
  alert: 'corvi_alert',
  think: 'corvi_think',
  worried: 'corvi_worried',
  proud: 'corvi_proud',
  blink: 'corvi_blink',
  sad: 'corvi_sad_tear',
};

/**
 * Componente de diálogo de Corvi (sección 9.5 y 10.9):
 * - Modo 'big': retrato a ×3 (132×132 px) sobresaliendo por arriba e izquierda sobre círculo #8b9bb4,
 *   placa de nombre #262b44 ("CORVI" en #fee761, "Oficial de la base" en #c0cbdc), cuadro crema #ead4aa,
 *   texto a 40 caracteres/s, sello amarillo "DATO REAL NASA · fuente" y etiqueta de honestidad.
 * - Modo 'small': retrato a ×2, 1–2 líneas, se cierra solo a los 3 s.
 */
export class DialogBox {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private bodyText!: Phaser.GameObjects.Text;
  private portrait!: Phaser.GameObjects.Image;
  private nextArrow?: Phaser.GameObjects.Triangle;

  private fullText = '';
  private visibleChars = 0;
  private typeTimer: Phaser.Time.TimerEvent | null = null;
  private blinkTimer: Phaser.Time.TimerEvent | null = null;
  private autoCloseTimer: Phaser.Time.TimerEvent | null = null;
  private baseMoodKey = 'corvi_neutral';
  private onComplete?: () => void;

  constructor(scene: Phaser.Scene, config: DialogBoxConfig) {
    this.scene = scene;
    this.fullText = config.text;
    this.onComplete = config.onComplete;
    this.baseMoodKey = MOOD_TO_SPRITE[config.mood] ?? 'corvi_neutral';

    this.container = scene.add.container(0, 0).setDepth(90);

    if (config.mode === 'big') {
      this.buildBigDialog(config);
    } else {
      this.buildSmallDialog(config);
    }

    AudioSystem.play('corviChirrup');
    this.startTypewriter();
  }

  private buildBigDialog(config: DialogBoxConfig): void {
    // Cuadro de texto color crema #ead4aa con borde #181425 y línea interior #e4a672
    const boxX = 148;
    const boxY = 278;
    const boxW = 482;
    const boxH = 74;

    const outerRect = this.scene.add
      .rectangle(boxX, boxY, boxW, boxH, 0xead4aa)
      .setOrigin(0, 0)
      .setStrokeStyle(3, 0x181425)
      .setInteractive({ useHandCursor: true });

    const innerRect = this.scene.add
      .rectangle(boxX + 3, boxY + 3, boxW - 6, boxH - 6)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xe4a672);

    // Círculo #8b9bb4 con borde #5a6988 y contorno #181425 abajo a la izquierda
    const outerCircle = this.scene.add
      .circle(86, 272, 74, 0x5a6988)
      .setStrokeStyle(3, 0x181425);
    const innerCircle = this.scene.add.circle(86, 272, 69, 0x8b9bb4);

    // Retrato de Corvi a ×3 (132×132 px) sobresaliendo por arriba y por la izquierda
    this.portrait = this.scene.add.image(86, 272, this.baseMoodKey).setScale(3);

    // Placa de nombre oscura #262b44
    const namePlate = this.scene.add
      .rectangle(180, 248, 122, 32, 0x262b44)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x181425);

    const nameTitle = this.scene.add.text(190, 250, uiText.rescue.corviName, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '15px',
      color: '#fee761',
    });

    const roleTitle = this.scene.add.text(190, 266, uiText.rescue.corviRole, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '10px',
      color: '#c0cbdc',
    });

    this.bodyText = this.scene.add.text(184, 286, '', {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '14px',
      color: '#181425',
      lineSpacing: 3,
      wordWrap: { width: 416 },
    });

    // Indicador ▼ abajo a la derecha
    this.nextArrow = this.scene.add.triangle(
      614,
      338,
      0,
      0,
      12,
      0,
      6,
      9,
      0x181425
    );

    this.container.add([
      outerRect,
      innerRect,
      outerCircle,
      innerCircle,
      this.portrait,
      namePlate,
      nameTitle,
      roleTitle,
      this.bodyText,
      this.nextArrow,
    ]);

    if (config.source) {
      this.appendNasaSeal(184, 328, config.source, config.label ?? 'ARCHIVO REAL');
    }

    // Parpadeo cada 3 a 5 s en el retrato grande
    this.blinkTimer = this.scene.time.addEvent({
      delay: 3600,
      loop: true,
      callback: () => {
        if (!this.portrait.active) return;
        this.portrait.setTexture('corvi_blink');
        this.scene.time.delayedCall(160, () => {
          if (this.portrait.active) {
            this.portrait.setTexture(this.baseMoodKey);
          }
        });
      },
    });

    outerRect.on('pointerdown', () => this.advanceOrFinish());
  }

  private buildSmallDialog(config: DialogBoxConfig): void {
    const boxX = 128;
    const boxY = 286;
    const boxW = 396;
    const boxH = 58;

    const outerRect = this.scene.add
      .rectangle(boxX, boxY, boxW, boxH, 0xead4aa)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });

    const innerRect = this.scene.add
      .rectangle(boxX + 2, boxY + 2, boxW - 4, boxH - 4)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xe4a672);

    const circle = this.scene.add
      .circle(118, 304, 46, 0x8b9bb4)
      .setStrokeStyle(2, 0x181425);

    // Retrato mediano a ×2 (88×88 px)
    this.portrait = this.scene.add.image(118, 304, this.baseMoodKey).setScale(2);

    this.bodyText = this.scene.add.text(172, 293, '', {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '12px',
      color: '#181425',
      lineSpacing: 2,
      wordWrap: { width: 336 },
    });

    this.container.add([outerRect, innerRect, circle, this.portrait, this.bodyText]);

    if (config.source) {
      this.appendNasaSeal(172, 324, config.source, config.label ?? 'ARCHIVO REAL');
    }

    const closeDelay = config.autoCloseMs ?? 3000;
    this.autoCloseTimer = this.scene.time.delayedCall(closeDelay, () => {
      this.finish();
    });

    outerRect.on('pointerdown', () => this.advanceOrFinish());
  }

  private appendNasaSeal(x: number, y: number, source: string, label: Label): void {
    // Sello amarillo #fee761 con estrella naranja #f77622 y borde #181425 + etiqueta de honestidad
    const sealTextStr = `${uiText.transmision.nasaSealPrefix} · ${source}`;
    const sealText = this.scene.add.text(x + 18, y + 2, sealTextStr, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '10px',
      color: '#181425',
    });

    const sealW = Math.round(sealText.width + 24);
    const sealBg = this.scene.add
      .rectangle(x, y, sealW, 16, 0xfee761)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x181425);

    const star = this.scene.add.text(x + 4, y + 1, '★', {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#f77622',
    });

    const tagX = x + sealW + 6;
    const tagText = this.scene.add.text(tagX + 6, y + 2, `▪ ${label}`, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '10px',
      color: '#262b44',
    });
    const tagW = Math.round(tagText.width + 12);
    const tagBg = this.scene.add
      .rectangle(tagX, y, tagW, 16, 0xffffff)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x5a6988);

    this.container.add([sealBg, star, sealText, tagBg, tagText]);
  }

  private startTypewriter(): void {
    this.visibleChars = 0;
    this.bodyText.setText('');

    // 40 caracteres por segundo = 25 ms por carácter
    this.typeTimer = this.scene.time.addEvent({
      delay: 25,
      repeat: Math.max(0, this.fullText.length - 1),
      callback: () => {
        this.visibleChars += 1;
        this.bodyText.setText(this.fullText.slice(0, this.visibleChars));
      },
    });
  }

  isTyping(): boolean {
    return this.visibleChars < this.fullText.length;
  }

  completeTyping(): void {
    if (this.typeTimer) {
      this.typeTimer.remove(false);
      this.typeTimer = null;
    }
    this.visibleChars = this.fullText.length;
    this.bodyText.setText(this.fullText);
  }

  advanceOrFinish(): void {
    if (this.isTyping()) {
      this.completeTyping();
      return;
    }
    this.finish();
  }

  private finish(): void {
    const cb = this.onComplete;
    this.destroy();
    if (cb) {
      cb();
    }
  }

  destroy(): void {
    this.typeTimer?.remove(false);
    this.blinkTimer?.remove(false);
    this.autoCloseTimer?.remove(false);
    this.container.destroy(true);
  }
}
