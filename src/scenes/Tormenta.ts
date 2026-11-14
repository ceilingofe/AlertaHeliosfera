import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { bus } from '../state/bus';
import { Events } from '../systems/Events';

/**
 * Escena en paralelo Tormenta (fiel al storyboard s10_tormenta.png):
 * Muestra la doble señal (cielo ocre #feae34 alpha 0.27 y estática en la antena),
 * la barra superior de peligro con cuenta regresiva de 120 s reales (y luego 30 s de impacto),
 * el recuadro "SEÑALES DE AVISO", la etiqueta con el ID de DONKI y partículas solares.
 */
export class Tormenta extends Phaser.Scene {
  private rootContainer!: Phaser.GameObjects.Container;
  private ochreOverlay!: Phaser.GameObjects.Rectangle;
  private bannerText!: Phaser.GameObjects.Text;
  private honestyTagText!: Phaser.GameObjects.Text;
  private honestyTagBg!: Phaser.GameObjects.Rectangle;
  private staticBars: Phaser.GameObjects.Rectangle[] = [];
  private particlesGraphic!: Phaser.GameObjects.Graphics;

  private lastAnnouncedStormId: string | null = null;

  constructor() {
    super('Tormenta');
  }

  create(): void {
    this.staticBars = [];
    this.lastAnnouncedStormId = null;

    // 1. Cielo ocre (#feae34 con alpha 0.27, sección 9.2 y s10_tormenta.png)
    this.ochreOverlay = this.add
      .rectangle(320, 180, 640, 360, 0xfeae34, 0.27)
      .setDepth(5);

    this.particlesGraphic = this.add.graphics().setDepth(6);

    // 2. Barra superior con franjas rojas/naranjas de alerta y cartel central (s10_tormenta.png)
    const hazardGraphics = this.add.graphics();
    for (let x = -20; x < 660; x += 18) {
      hazardGraphics.fillStyle(0xe43b44, 1);
      hazardGraphics.fillPoints(
        [
          new Phaser.Geom.Point(x, 0),
          new Phaser.Geom.Point(x + 9, 0),
          new Phaser.Geom.Point(x + 17, 18),
          new Phaser.Geom.Point(x + 8, 18),
        ],
        true
      );
      hazardGraphics.fillStyle(0xd77643, 1);
      hazardGraphics.fillPoints(
        [
          new Phaser.Geom.Point(x + 9, 0),
          new Phaser.Geom.Point(x + 18, 0),
          new Phaser.Geom.Point(x + 26, 18),
          new Phaser.Geom.Point(x + 17, 18),
        ],
        true
      );
    }

    const bannerBox = this.add
      .rectangle(320, 10, 348, 18, 0x181425)
      .setOrigin(0.5);
    this.bannerText = this.add
      .text(320, 10, '', {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // 3. Recuadro superior izquierdo "SEÑALES DE AVISO" + etiqueta DONKI (s10_tormenta.png)
    const signalsBox = this.add
      .rectangle(6, 26, 222, 58, 0x181425, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x3a4466);
    const sigTitle = this.add.text(16, 33, uiText.storm.signalsTitle, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#fee761',
    });
    const sig1 = this.add.text(16, 49, uiText.storm.signalSky, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#ffffff',
    });
    const sig2 = this.add.text(16, 64, uiText.storm.signalAntenna, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#ffffff',
    });

    this.honestyTagBg = this.add
      .rectangle(6, 90, 238, 16, 0xffffff)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x5a6988);
    this.honestyTagText = this.add.text(12, 92, '', {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '9px',
      color: '#262b44',
    });

    // 4. Indicador de estática de la antena arriba al centro-derecha (s10_tormenta.png)
    const staticBox = this.add
      .rectangle(417, 38, 44, 18, 0x181425)
      .setStrokeStyle(2, 0x262b44);
    for (let i = 0; i < 5; i++) {
      const bar = this.add.rectangle(401 + i * 8, 38, 4, 12, 0xc0cbdc);
      this.staticBars.push(bar);
    }
    const staticLabel = this.add
      .text(417, 56, uiText.storm.staticLabel, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '10px',
        color: '#181425',
      })
      .setOrigin(0.5);

    this.rootContainer = this.add
      .container(0, 0, [
        this.ochreOverlay,
        this.particlesGraphic,
        hazardGraphics,
        bannerBox,
        this.bannerText,
        signalsBox,
        sigTitle,
        sig1,
        sig2,
        this.honestyTagBg,
        this.honestyTagText,
        staticBox,
        ...this.staticBars,
        staticLabel,
      ])
      .setDepth(60)
      .setVisible(false);
  }

  update(time: number): void {
    const storm = Events.getActiveStorm();
    const inMinigame =
      this.scene.isActive('MinijuegoRoca') ||
      this.scene.isActive('MinijuegoSuelo') ||
      this.scene.isActive('MinijuegoMinerales') ||
      this.scene.isActive('MinijuegoAire') ||
      this.scene.isActive('MinijuegoPaneles') ||
      this.scene.isActive('MinijuegoTuberias');

    if (!storm || storm.phase === 'resolved' || inMinigame) {
      this.rootContainer.setVisible(false);
      return;
    }

    this.rootContainer.setVisible(true);

    // Disparar diálogo grande de Corvi con alerta la primera vez que arranca esta tormenta
    const stormKey = `${storm.eventId}:${storm.type}`;
    if (this.lastAnnouncedStormId !== stormKey) {
      this.lastAnnouncedStormId = stormKey;
      bus.emit('dialog:open', {
        mode: 'big',
        mood: 'alert',
        text: uiText.storm.corviAlertHit,
        source: uiText.storm.sealSource,
        label: 'ARCHIVO REAL',
      });
    }

    if (storm.phase === 'countdown') {
      const secs = Math.ceil(storm.countdownSec);
      const mm = Math.floor(secs / 60);
      const ss = String(secs % 60).padStart(2, '0');
      this.bannerText.setText(
        `${uiText.storm.bannerCountdownPrefix} ${mm}:${ss}`
      );
      this.ochreOverlay.setAlpha(0.27);
    } else if (storm.phase === 'impact') {
      const secs = Math.ceil(storm.impactRemainingSec);
      const ss = String(secs).padStart(2, '0');
      this.bannerText.setText(`${uiText.storm.bannerImpactPrefix} 0:${ss}`);
      this.ochreOverlay.setAlpha(0.38);
    }

    const shortId = storm.donkiActivityID.startsWith('TODO_DATO')
      ? 'TODO_DATO (CME mayo 2024)'
      : storm.donkiActivityID;
    this.honestyTagText.setText(`▪ ARCHIVO REAL · DONKI · ${shortId}`);
    this.honestyTagBg.width = Math.max(238, Math.round(this.honestyTagText.width + 14));

    // Parpadeo de las barras de estática de la antena
    this.staticBars.forEach((bar, idx) => {
      const on = Math.floor(time / 120 + idx) % 2 === 0;
      bar.setFillStyle(on ? 0xffffff : 0x5a6988);
    });

    // Trazos diagonales blancos de partículas solares (s10_tormenta.png)
    this.particlesGraphic.clear();
    this.particlesGraphic.fillStyle(0xffffff, 0.9);
    const offset = Math.floor(time * 0.08) % 180;
    for (let i = 0; i < 16; i++) {
      const px = ((i * 67 + offset) % 620) + 10;
      const py = ((i * 53 + offset) % 280) + 24;
      this.particlesGraphic.fillRect(px, py, 3, 2);
      this.particlesGraphic.fillRect(px + 2, py + 2, 3, 2);
    }
  }
}
