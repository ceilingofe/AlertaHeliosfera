import Phaser from 'phaser';
import { bus } from '../state/bus';
import { gameStore } from '../state/GameState';
import { AudioSystem } from '../systems/Audio';
import { Events } from '../systems/Events';
import { I18n } from '../systems/I18n';
import { StaticEffect } from '../ui/StaticEffect';

/**
 * Escena en paralelo Tormenta (fiel al storyboard s10_tormenta.png):
 * Muestra la doble señal:
 * 1) Cielo ocre (#feae34 con alpha 0.27) y partículas solares diagonales (solo afuera en el Mundo),
 * 2) Interferencia suave de señal tipo TV en toda la pantalla cada ciertos segundos (StaticEffect, solo afuera),
 * junto con el cartel central de cuenta regresiva (120 s reales + 30 s de impacto) y el ID de DONKI,
 * ubicado en la franja central superior (x = 214..502) para no empalmarse con ningún panel del HUD ni de la Base.
 * En el Día 5 (cme_miss), anuncia primero como vigilancia preventiva (corviAlertWatch) antes de confirmar la falsa alarma.
 */
export class Tormenta extends Phaser.Scene {
  private rootContainer!: Phaser.GameObjects.Container;
  private ochreOverlay!: Phaser.GameObjects.Rectangle;
  private bannerText!: Phaser.GameObjects.Text;
  private signalsText!: Phaser.GameObjects.Text;
  private honestyTagText!: Phaser.GameObjects.Text;
  private particlesGraphic!: Phaser.GameObjects.Graphics;
  private staticEffect!: StaticEffect;

  private lastAnnouncedStormId: string | null = null;

  constructor() {
    super('Tormenta');
  }

  create(): void {
    const uiText = I18n.ui();
    this.lastAnnouncedStormId = null;

    // 1. Cielo ocre (#feae34 con alpha 0.27, sección 9.2 y s10_tormenta.png)
    this.ochreOverlay = this.add
      .rectangle(320, 180, 640, 360, 0xfeae34, 0.27)
      .setDepth(5);

    this.particlesGraphic = this.add.graphics().setDepth(6);

    // 2. Efecto suave de estática tipo TV en toda la pantalla cada ~3.8 s
    this.staticEffect = new StaticEffect(this, {
      intervalMs: 3800,
      burstDurationMs: 260,
      maxAlpha: 0.16,
    });

    // 3. Tarjeta central superior (x = 212..504, centro x = 358) libre de colisión con paneles laterales
    const centerX = 358;
    const cardW = 288;

    const hazardGraphics = this.add.graphics();
    const startX = centerX - cardW / 2;
    const endX = centerX + cardW / 2;
    for (let x = startX; x < endX - 8; x += 16) {
      hazardGraphics.fillStyle(0xe43b44, 1);
      hazardGraphics.fillRect(x, 6, 8, 20);
      hazardGraphics.fillStyle(0xd77643, 1);
      hazardGraphics.fillRect(x + 8, 6, 8, 20);
    }

    const bannerBox = this.add
      .rectangle(centerX, 16, cardW - 8, 18, 0x181425)
      .setOrigin(0.5);
    this.bannerText = this.add
      .text(centerX, 16, '', {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#fee761',
      })
      .setOrigin(0.5);

    const infoCard = this.add
      .rectangle(centerX, 43, cardW, 30, 0x181425, 0.94)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0x5a6988);

    this.signalsText = this.add
      .text(
        centerX,
        36,
        `${uiText.storm.signalsTitle}: ${uiText.storm.signalsSub}`,
        {
          fontFamily: 'PixelifySans, monospace',
          fontSize: '9px',
          color: '#ead4aa',
        }
      )
      .setOrigin(0.5);

    this.honestyTagText = this.add
      .text(centerX, 49, '', {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '9px',
        color: '#2ce8f5',
      })
      .setOrigin(0.5);

    this.rootContainer = this.add
      .container(0, 0, [
        this.ochreOverlay,
        this.particlesGraphic,
        hazardGraphics,
        bannerBox,
        this.bannerText,
        infoCard,
        this.signalsText,
        this.honestyTagText,
      ])
      .setDepth(60)
      .setVisible(false);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.staticEffect?.destroy();
    });
  }

  update(time: number): void {
    const uiText = I18n.ui();
    const storm = Events.getActiveStorm();
    const inMinigame =
      this.scene.isActive('MinijuegoRoca') ||
      this.scene.isActive('MinijuegoSuelo') ||
      this.scene.isActive('MinijuegoMinerales') ||
      this.scene.isActive('MinijuegoAire') ||
      this.scene.isActive('MinijuegoPaneles') ||
      this.scene.isActive('MinijuegoTuberias');

    if (!storm || storm.phase === 'resolved' || inMinigame) {
      AudioSystem.stopLoop('storm');
      this.rootContainer.setVisible(false);
      this.staticEffect.setEnabled(false);
      return;
    }

    const insideHabitat = gameStore.state.location !== 'mundo';
    this.rootContainer.setVisible(true);
    this.ochreOverlay.setVisible(!insideHabitat);
    this.particlesGraphic.setVisible(!insideHabitat);

    // Disparar diálogo grande de Corvi y primera ráfaga suave de TV al comenzar la tormenta
    const stormKey = `${storm.eventId}:${storm.type}`;
    const justStarted = this.lastAnnouncedStormId !== stormKey;
    if (justStarted) {
      this.lastAnnouncedStormId = stormKey;
      AudioSystem.play('stormAlarm');
      this.staticEffect.setEnabled(!insideHabitat, !insideHabitat);
      const alertText =
        storm.type === 'cme_miss'
          ? uiText.storm.corviAlertWatch
          : uiText.storm.corviAlertHit;
      bus.emit('dialog:open', {
        mode: 'big',
        mood: 'alert',
        text: alertText,
        source: uiText.storm.sealSource,
        label: 'ARCHIVO REAL',
      });
    } else {
      this.staticEffect.setEnabled(!insideHabitat, false);
    }

    if (!insideHabitat) {
      this.staticEffect.update(time);
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

    this.honestyTagText.setText(`★ ${I18n.formatLabel('ARCHIVO REAL')} · NASA · ${storm.donkiActivityID}`);
    if (storm.phase === 'impact') {
      AudioSystem.startLoop('storm', 'rumble', insideHabitat ? 0.25 : 0.6);
    } else {
      AudioSystem.stopLoop('storm');
    }

    // Trazos diagonales blancos de partículas solares: nunca visibles dentro de la base o refugio
    this.particlesGraphic.clear();
    if (!insideHabitat) {
      this.particlesGraphic.fillStyle(0xffffff, 0.85);
      const offset = Math.floor(time * 0.08) % 180;
      for (let i = 0; i < 14; i++) {
        const px = ((i * 67 + offset) % 620) + 10;
        const py = ((i * 53 + offset) % 280) + 24;
        this.particlesGraphic.fillRect(px, py, 3, 2);
        this.particlesGraphic.fillRect(px + 2, py + 2, 3, 2);
      }
    }
  }
}
