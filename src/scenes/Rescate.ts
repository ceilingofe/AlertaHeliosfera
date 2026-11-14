import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { gameStore } from '../state/GameState';
import type { RescueCause } from '../types';

interface RescateData {
  cause?: RescueCause;
}

/**
 * Escena de Rescate (fail forward): nunca muestra "Game over" ni "Perdiste".
 * El cohete desciende por el astronauta y Corvi explica qué ocurrió.
 */
export class Rescate extends Phaser.Scene {
  private cause: RescueCause = 'oxigeno';
  private rocket!: Phaser.GameObjects.Image;
  private flameGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Rescate');
  }

  init(data?: RescateData): void {
    this.cause = data?.cause ?? 'oxigeno';
  }

  create(): void {
    // 1. Fondo del terreno marciano a escala ×2 para igualar la vista de Mundo
    const ground = this.add.tileSprite(0, 0, 640, 360, 'ground_placeholder').setOrigin(0, 0);
    ground.setTileScale(2, 2);

    // 2. Barra superior de aviso
    this.add.rectangle(320, 14, 640, 28, 0x262b44).setOrigin(0.5);
    const bannerTitle =
      this.cause === 'radiacion' ? uiText.rescue.bannerRad : uiText.rescue.bannerO2;
    this.add
      .text(320, 14, bannerTitle, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '16px',
        color: '#fee761',
      })
      .setOrigin(0.5);

    // 3. Tarjeta izquierda "Qué pasó"
    const card = this.add.rectangle(8, 36, 238, 86, 0xc0cbdc).setOrigin(0, 0);
    card.setStrokeStyle(2, 0x181425);

    this.add.text(18, 44, uiText.rescue.whatHappenedTitle, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '13px',
      color: '#5a6988',
    });

    const causeText =
      this.cause === 'radiacion' ? uiText.rescue.causeRad : uiText.rescue.causeO2;
    const tipText =
      this.cause === 'radiacion' ? uiText.rescue.tipRad : uiText.rescue.tipO2;

    this.add.text(18, 62, causeText, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '13px',
      color: '#181425',
      lineSpacing: 2,
    });

    this.add.text(18, 100, tipText, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '12px',
      color: '#be4a2f',
    });

    // 4. Astronauta esperando el rescate y cohete descendiendo con llama animada
    this.add.ellipse(254, 240, 40, 10, 0x3e2731);
    this.add.image(254, 214, 'astronaut_mini_hair1').setScale(2);

    this.flameGraphics = this.add.graphics();
    this.rocket = this.add.image(432, 82, 'rocket').setScale(2);

    this.tweens.add({
      targets: this.rocket,
      y: 122,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 5. Cuadro de diálogo grande de Corvi (retrato ×3 sobresaliendo a la izquierda)
    const dialogBox = this.add.rectangle(148, 296, 484, 58, 0xead4aa).setOrigin(0, 0);
    dialogBox.setStrokeStyle(2, 0x181425);
    this.add
      .rectangle(151, 299, 478, 52)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xe4a672);

    // Placa de nombre de Corvi
    const namePlate = this.add.rectangle(180, 266, 118, 32, 0x262b44).setOrigin(0, 0);
    namePlate.setStrokeStyle(2, 0x181425);
    this.add.text(190, 269, uiText.rescue.corviName, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '15px',
      color: '#fee761',
    });
    this.add.text(190, 284, uiText.rescue.corviRole, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '10px',
      color: '#c0cbdc',
    });

    // Círculo y retrato grande de Corvi a ×3 (132×132 px)
    const portraitCircle = this.add.circle(88, 272, 74, 0x8b9bb4);
    portraitCircle.setStrokeStyle(3, 0x181425);
    this.add.image(88, 274, 'corvi_worried').setScale(3);

    this.add.text(188, 306, uiText.rescue.corviMessage, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '14px',
      color: '#181425',
      lineSpacing: 4,
    });

    this.add
      .text(618, 344, uiText.rescue.retryButton, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#3e2731',
      })
      .setOrigin(1, 1);

    const restartMission = (): void => {
      gameStore.reset();
      this.scene.start('Mundo');
    };

    this.input.once('pointerdown', restartMission);
    this.input.keyboard?.once('keydown-SPACE', restartMission);
    this.input.keyboard?.once('keydown-E', restartMission);
  }

  update(time: number): void {
    // Llama del cohete animada en 3 cuadros con triángulos rojo, naranja y amarillo (TODO_ARTE pendiente de Karmin)
    const frame = Math.floor(time / 90) % 3;
    const stretch = frame * 6;
    const rx = this.rocket.x;
    const ry = this.rocket.y + 56;

    this.flameGraphics.clear();
    this.flameGraphics.fillStyle(0xe43b44, 1);
    this.flameGraphics.fillTriangle(rx - 14, ry, rx + 14, ry, rx, ry + 38 + stretch);

    this.flameGraphics.fillStyle(0xf77622, 1);
    this.flameGraphics.fillTriangle(rx - 10, ry, rx + 10, ry, rx, ry + 28 + stretch);

    this.flameGraphics.fillStyle(0xfee761, 1);
    this.flameGraphics.fillTriangle(rx - 6, ry, rx + 6, ry, rx, ry + 18 + stretch);
  }
}
