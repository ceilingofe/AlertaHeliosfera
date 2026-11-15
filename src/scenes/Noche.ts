import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { gameStore } from '../state/GameState';
import { Save } from '../state/Save';
import { AudioSystem } from '../systems/Audio';
import { BaseSystem } from '../systems/BaseSystem';
import { Data } from '../systems/Data';
import { StaticEffect } from '../ui/StaticEffect';

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
}

/**
 * Escena Noche (fiel al storyboard s11_estrellas.png):
 * Lluvia de estrellas fugaces (y auroras marcianas en el día 5 tras cme_miss),
 * tarjeta "Lo que aprendiste hoy" con los 3 datos del día, desbloqueos nuevos
 * y guardado en localStorage antes de pasar a Transmision del día siguiente.
 */
export class Noche extends Phaser.Scene {
  private shootingStars: ShootingStar[] = [];
  private starGraphics!: Phaser.GameObjects.Graphics;
  private staticEffect!: StaticEffect;

  constructor() {
    super('Noche');
  }

  create(): void {
    const state = gameStore.state;
    const completedDay = state.day;
    const hadAurora = state.activeEvents.includes('aurora_tonight') || completedDay === 5;
    const dayFacts = Data.getFactsForDay(completedDay);

    BaseSystem.deliverTubes(state, 1);
    BaseSystem.sleepToNextDay(state);
    Save.save(state);
    AudioSystem.play(completedDay === 1 || completedDay === 4 ? 'unlock' : 'shootingStar');

    const nextDay = state.day;

    // 1. Cielo nocturno (#181425) con estrellas fijas y horizonte marciano
    this.add.rectangle(320, 180, 640, 360, 0x181425);

    // Si hubo roce de CME (día 5), dibujamos auroras marcianas verdes y violetas en el cielo
    if (hadAurora) {
      const aurora = this.add.graphics();
      aurora.fillStyle(0x63c74d, 0.22);
      aurora.fillEllipse(160, 92, 290, 66);
      aurora.fillStyle(0x2ce8f5, 0.18);
      aurora.fillEllipse(175, 114, 260, 50);
      aurora.fillStyle(0xb55088, 0.2);
      aurora.fillEllipse(145, 72, 240, 44);
    }

    const staticStars = this.add.graphics();
    staticStars.fillStyle(0xffffff, 0.85);
    for (let i = 0; i < 48; i++) {
      const sx = (i * 73 + 19) % 340;
      const sy = (i * 41 + 11) % 230;
      staticStars.fillRect(sx, sy, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
    }

    const horizon = this.add.graphics();
    horizon.fillStyle(0x3e2731, 1);
    horizon.fillRect(0, 246, 640, 114);
    this.add.image(208, 224, 'base_exterior').setScale(2);
    this.add.image(294, 192, 'antenna').setScale(2);

    // 2. 10 estrellas fugaces con estela blanco -> amarillo -> gris
    this.starGraphics = this.add.graphics();
    this.shootingStars = [];
    for (let i = 0; i < 10; i++) {
      this.shootingStars.push({
        x: 40 + ((i * 37) % 280),
        y: 20 + ((i * 29) % 160),
        vx: -90 - (i % 4) * 18,
        vy: 42 + (i % 3) * 10,
        length: 28 + (i % 3) * 10,
      });
    }

    // 3. Tarjeta derecha "Lo que aprendiste hoy" (s11_estrellas.png)
    const card = this.add.rectangle(334, 12, 296, 308, 0xc0cbdc).setOrigin(0, 0);
    card.setStrokeStyle(2, 0x181425);

    this.add.text(350, 22, uiText.night.learnedTitle, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '18px',
      color: '#181425',
    });

    this.add.text(
      350,
      46,
      `${uiText.night.dayPassedPrefix} ${completedDay} ${uiText.night.dayPassedSuffix}`,
      {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#5a6988',
      }
    );

    dayFacts.slice(0, 3).forEach((fact, idx) => {
      const fy = 66 + idx * 54;
      this.add.rectangle(350, fy, 264, 46, 0xffffff).setOrigin(0, 0);
      this.add.image(364, fy + 16, `icon_${fact.icon}`).setScale(1.8);
      this.add.text(378, fy + 6, fact.text, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#181425',
        wordWrap: { width: 230 },
      });
      this.add.text(378, fy + 33, `★ ${fact.label} · ${fact.source}`, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '10px',
        color: '#5a6988',
      });
    });

    // Recuadro amarillo de desbloqueos por día
    const unlockTitle =
      completedDay === 1
        ? uiText.night.unlocksDay1Title
        : completedDay === 4
          ? uiText.night.unlocksDay5Title
          : uiText.night.unlocksTitle;
    const unlockSub =
      completedDay === 1
        ? uiText.night.unlocksDay1Sub
        : completedDay === 4
          ? uiText.night.unlocksDay5Sub
          : uiText.night.unlocksSub;

    this.add.rectangle(350, 230, 264, 38, 0xfee761).setOrigin(0, 0);
    this.add.text(360, 234, unlockTitle, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '11px',
      color: '#181425',
    });
    this.add.text(360, 250, unlockSub, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '10px',
      color: '#be4a2f',
    });

    // Botón "Dormir hasta el día N"
    const sleepBtn = this.add
      .rectangle(350, 276, 264, 32, 0x181425)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x3a4466)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(482, 292, `${uiText.night.sleepButtonPrefix} ${nextDay}`, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // 4. Cuadro de diálogo inferior izquierdo con Corvi grande (s11_estrellas.png)
    const dialogBox = this.add.rectangle(94, 282, 232, 70, 0xead4aa).setOrigin(0, 0);
    dialogBox.setStrokeStyle(2, 0x181425);

    const namePlate = this.add.rectangle(122, 254, 114, 30, 0x262b44).setOrigin(0, 0);
    namePlate.setStrokeStyle(2, 0x181425);
    this.add.text(130, 256, uiText.night.corviTitle, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '14px',
      color: '#fee761',
    });
    this.add.text(130, 271, uiText.night.corviRole, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '10px',
      color: '#c0cbdc',
    });

    const circle = this.add.circle(56, 292, 54, 0x8b9bb4);
    circle.setStrokeStyle(3, 0x181425);
    this.add
      .image(56, 294, completedDay === 1 ? 'corvi_alert' : 'corvi_happy')
      .setScale(2.5);

    const hookText =
      completedDay === 1
        ? uiText.night.corviStormHook
        : hadAurora
          ? uiText.night.corviAuroraText
          : uiText.night.corviNightText;
    const sealLabel =
      completedDay === 1 || hadAurora
        ? uiText.night.nasaSealDonki
        : uiText.night.nasaSeal;

    this.add.text(124, 290, hookText, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '11px',
      color: '#181425',
      lineSpacing: 2,
    });

    const seal = this.add.rectangle(124, 330, 194, 16, 0xfee761).setOrigin(0, 0);
    seal.setStrokeStyle(1, 0x181425);
    this.add.text(130, 332, `★ ${sealLabel}`, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '10px',
      color: '#181425',
    });

    // Efecto suave de estática tipo TV en toda la pantalla cuando el Día 1 avisa de la tormenta solar
    this.staticEffect = new StaticEffect(this, {
      intervalMs: 3600,
      burstDurationMs: 250,
      maxAlpha: 0.14,
    });
    this.staticEffect.setEnabled(completedDay === 1, completedDay === 1);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.staticEffect?.destroy();
    });

    const startNextDay = (): void => {
      AudioSystem.play('scanClick');
      state.location = 'base';
      Save.save(state);
      this.scene.start('Transmision');
    };

    sleepBtn.on('pointerdown', startNextDay);
    this.input.keyboard?.once('keydown-SPACE', startNextDay);
    this.input.keyboard?.once('keydown-E', startNextDay);
    this.input.keyboard?.once('keydown-ENTER', startNextDay);
  }

  update(time: number, delta: number): void {
    this.staticEffect?.update(time);
    const dt = delta / 1000;
    this.starGraphics.clear();

    for (const s of this.shootingStars) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      if (s.x < -20 || s.y > 235) {
        s.x = 240 + Math.random() * 90;
        s.y = 10 + Math.random() * 80;
      }

      this.starGraphics.lineStyle(2, 0x8b9bb4, 0.7);
      this.starGraphics.lineBetween(
        s.x + 12,
        s.y - 6,
        s.x + s.length,
        s.y - s.length * 0.48
      );

      this.starGraphics.lineStyle(2, 0xfee761, 0.95);
      this.starGraphics.lineBetween(s.x, s.y, s.x + 12, s.y - 6);

      this.starGraphics.fillStyle(0xffffff, 1);
      this.starGraphics.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, 3, 3);
    }
  }
}
