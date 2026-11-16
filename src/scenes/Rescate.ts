import Phaser from 'phaser';
import { AudioSystem } from '../systems/Audio';
import { Clock } from '../systems/Clock';
import { I18n } from '../systems/I18n';
import { gameStore } from '../state/GameState';
import type { RescueCause } from '../types';
import { AstronautAppearance } from '../ui/AstronautAppearance';

interface RescateData {
  cause?: RescueCause;
}

/**
 * Escena de Rescate (fail forward): nunca muestra "Game over" ni "Perdiste".
 * El cohete desciende desde el espacio profundo entre estelas de polvo marciano
 * y Corvi vuela hasta el astronauta para rescatarlo antes de pasar al Diploma.
 */
export class Rescate extends Phaser.Scene {
  private cause: RescueCause = 'oxigeno';
  private rocket!: Phaser.GameObjects.Image;
  private flameGraphics!: Phaser.GameObjects.Graphics;
  private beaconBeam!: Phaser.GameObjects.Graphics;
  private landed = false;
  private landPulseTime = 0;

  constructor() {
    super('Rescate');
  }

  init(data?: RescateData): void {
    this.cause = data?.cause ?? 'oxigeno';
  }

  create(): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    const isNight = Clock.isNight(state.clock.minutes);
    this.landed = false;
    this.landPulseTime = 0;

    AudioSystem.stopAllLoops();
    AudioSystem.playMusic(null);
    AudioSystem.play('siren', { volume: 0.65 });
    this.time.delayedCall(260, () => AudioSystem.play('rocket', { volume: 0.85 }));

    // 1. Cielo espacial estrellado arriba (y = 0..162) + superficie marciana de Karmin abajo (y = 158..360)
    const sky = this.add.graphics().setDepth(0);
    sky.fillStyle(0x0b0a1c, 1);
    sky.fillRect(0, 0, 640, 74);
    sky.fillStyle(0x161228, 1);
    sky.fillRect(0, 74, 640, 54);
    sky.fillStyle(0x241634, 1);
    sky.fillRect(0, 128, 640, 38);

    const starColors = [0xffffff, 0xc0cbdc, 0x2ce8f5, 0xfee761];
    const rnd = new Phaser.Math.RandomDataGenerator(['rescate-cosmos']);
    for (let i = 0; i < 65; i++) {
      const sx = rnd.between(6, 634);
      const sy = rnd.between(28, 152);
      const s = this.add.rectangle(sx, sy, i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1, starColors[i % starColors.length], 0.8);
      s.setDepth(1);
      this.tweens.add({
        targets: s,
        alpha: 0.25,
        duration: 700 + (i % 5) * 280,
        yoyo: true,
        repeat: -1,
      });
    }

    const terrainKey = isNight ? 'ground_night' : 'ground_day';
    this.add
      .tileSprite(0, 158, 640, 202, terrainKey)
      .setOrigin(0, 0)
      .setTileScale(0.55, 0.55)
      .setDepth(2);
    if (isNight) {
      this.add.rectangle(0, 158, 640, 202, 0x0b1026, 0.22).setOrigin(0, 0).setDepth(3);
    }

    // Cordillera marciana en el horizonte
    const ridge = this.add.graphics().setDepth(4);
    for (let x = 0; x < 640; x += 12) {
      const h = Math.round(Math.sin(x * 0.045) * 4 + Math.cos(x * 0.11) * 3);
      ridge.fillStyle(isNight ? 0x181425 : 0x733e39, 1);
      ridge.fillRect(x, 155 + h, 13, 10 - h);
      ridge.fillStyle(isNight ? 0x3a4466 : 0xb86f50, 0.7);
      ridge.fillRect(x, 155 + h, 13, 2);
    }

    // Rocas del paisaje marciano alrededor de la zona de rescate
    this.add.image(62, 232, 'rock_mars').setScale(1.1).setDepth(5);
    this.add.image(588, 224, 'rock_sandstone').setScale(1.2).setDepth(5);
    this.add.image(350, 246, 'rock_sparkle_2').setScale(1).setDepth(5);

    // 2. Barra superior de aviso y tarjeta izquierda "Qué pasó"
    this.add.rectangle(320, 14, 640, 28, 0x262b44).setOrigin(0.5).setDepth(30);
    const bannerTitle =
      this.cause === 'radiacion'
        ? uiText.rescue.bannerRad
        : this.cause === 'mision'
          ? uiText.rescue.bannerMision
          : uiText.rescue.bannerO2;
    this.add
      .text(320, 14, bannerTitle, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '16px',
        color: '#fee761',
      })
      .setOrigin(0.5)
      .setDepth(31);

    const card = this.add.rectangle(8, 36, 238, 86, 0xc0cbdc).setOrigin(0, 0).setDepth(30);
    card.setStrokeStyle(2, 0x181425);

    this.add
      .text(18, 44, uiText.rescue.whatHappenedTitle, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '13px',
        color: '#5a6988',
      })
      .setDepth(31);

    const causeText =
      this.cause === 'radiacion'
        ? uiText.rescue.causeRad
        : this.cause === 'mision'
          ? uiText.rescue.causeMision
          : uiText.rescue.causeO2;
    const tipText =
      this.cause === 'radiacion'
        ? uiText.rescue.tipRad
        : this.cause === 'mision'
          ? uiText.rescue.tipMision
          : uiText.rescue.tipO2;

    this.add
      .text(18, 62, causeText, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '13px',
        color: '#181425',
        lineSpacing: 2,
      })
      .setDepth(31);

    this.add
      .text(18, 100, tipText, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '12px',
        color: '#be4a2f',
      })
      .setDepth(31);

    // 3. Astronauta con su traje personalizado y reflector de emergencia en tierra
    this.beaconBeam = this.add.graphics().setDepth(6);
    this.add.ellipse(276, 240, 38, 10, 0x181425, 0.5).setDepth(7);
    const miniKey = AstronautAppearance.getMiniTextureKey(
      this,
      state.customization.hair,
      state.customization.suit
    );
    const astro = this.add.image(276, 214, miniKey).setScale(1).setDepth(10);

    // Baliza de auxilio parpadeando junto al astronauta
    const beaconLed = this.add.circle(250, 232, 3, 0x2ce8f5).setDepth(11);
    this.tweens.add({
      targets: beaconLed,
      alpha: 0.15,
      scale: 1.5,
      duration: 380,
      yoyo: true,
      repeat: -1,
    });

    // 4. Cohete de rescate descendiendo desde el espacio profundo hasta la superficie marciana
    this.add.ellipse(462, 238, 68, 14, 0x181425, 0.45).setDepth(7);
    this.flameGraphics = this.add.graphics().setDepth(8);
    this.rocket = this.add.image(462, -68, 'rocket').setScale(2).setDepth(12);

    this.tweens.add({
      targets: this.rocket,
      y: 176,
      duration: 1450,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.landed = true;
        this.cameras.main.shake(260, 0.008);
        this.spawnTouchdownDust(462, 236);

        // Corvi despega del cohete y vuela hasta el lado del astronauta para rescatarlo
        const rescueCorvi = this.add
          .image(424, 178, 'corvi_perch')
          .setScale(1.6)
          .setFlipX(true)
          .setDepth(15);

        this.tweens.add({
          targets: rescueCorvi,
          x: 310,
          y: 198,
          duration: 850,
          ease: 'Sine.easeInOut',
          onUpdate: (_tween, target: Phaser.GameObjects.Image) => {
            target.y -= Math.sin(_tween.progress * Math.PI) * 32;
          },
          onComplete: () => {
            rescueCorvi.setFlipX(true);
            this.tweens.add({
              targets: rescueCorvi,
              y: 194,
              duration: 500,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            });
            // El astronauta da un pequeño brinco al ver llegar a Corvi
            this.tweens.add({
              targets: astro,
              y: 208,
              duration: 180,
              yoyo: true,
              ease: 'Quad.easeOut',
            });
          },
        });
      },
    });

    // 5. Cuadro de diálogo grande de Corvi (retrato ×3 sobresaliendo a la izquierda)
    const dialogBox = this.add.rectangle(148, 296, 484, 58, 0xead4aa).setOrigin(0, 0).setDepth(30);
    dialogBox.setStrokeStyle(2, 0x181425);
    this.add
      .rectangle(151, 299, 478, 52)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xe4a672)
      .setDepth(30);

    const namePlate = this.add.rectangle(180, 266, 118, 32, 0x262b44).setOrigin(0, 0).setDepth(30);
    namePlate.setStrokeStyle(2, 0x181425);
    this.add
      .text(190, 269, uiText.rescue.corviName, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '15px',
        color: '#fee761',
      })
      .setDepth(31);
    this.add
      .text(190, 284, uiText.rescue.corviRole, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '10px',
        color: '#c0cbdc',
      })
      .setDepth(31);

    const portraitCircle = this.add.circle(88, 272, 74, 0x8b9bb4).setDepth(30);
    portraitCircle.setStrokeStyle(3, 0x181425);
    this.add.image(88, 274, 'corvi_worried').setScale(3).setDepth(31);

    this.add
      .text(188, 306, uiText.rescue.corviMessage, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '14px',
        color: '#181425',
        lineSpacing: 4,
      })
      .setDepth(31);

    this.add
      .text(618, 344, uiText.rescue.retryButton, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#3e2731',
      })
      .setOrigin(1, 1)
      .setDepth(31);

    const goToDiploma = (): void => {
      this.scene.start('Diploma', { cause: this.cause });
    };

    this.input.once('pointerdown', goToDiploma);
    this.input.keyboard?.once('keydown-SPACE', goToDiploma);
    this.input.keyboard?.once('keydown-E', goToDiploma);
  }

  private spawnTouchdownDust(cx: number, cy: number): void {
    for (let i = 0; i < 20; i++) {
      const dir = i % 2 === 0 ? -1 : 1;
      const dist = 24 + (i % 5) * 18;
      const puff = this.add
        .circle(cx + dir * 8, cy, 4 + (i % 3) * 2, i % 2 === 0 ? 0xe4a672 : 0xb86f50, 0.85)
        .setDepth(14);
      this.tweens.add({
        targets: puff,
        x: cx + dir * dist,
        y: cy - 6 - (i % 4) * 5,
        scale: 1.7,
        alpha: 0,
        duration: 750 + (i % 4) * 140,
        ease: 'Quad.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }

  update(time: number, delta: number): void {
    const frame = Math.floor(time / 80) % 3;
    const rx = this.rocket.x;
    const ry = this.rocket.y + 52;

    this.flameGraphics.clear();
    if (!this.landed) {
      const stretch = 16 + frame * 7;
      this.flameGraphics.fillStyle(0xe43b44, 0.95);
      this.flameGraphics.fillTriangle(rx - 15, ry, rx + 15, ry, rx, ry + 42 + stretch);
      this.flameGraphics.fillStyle(0xf77622, 1);
      this.flameGraphics.fillTriangle(rx - 10, ry, rx + 10, ry, rx, ry + 30 + stretch);
      this.flameGraphics.fillStyle(0xfee761, 1);
      this.flameGraphics.fillTriangle(rx - 5, ry, rx + 5, ry, rx, ry + 18 + stretch);
    } else {
      this.landPulseTime += delta * 0.005;
      const ember = Math.max(0, 12 - this.landPulseTime * 4) + frame * 1.5;
      if (ember > 1) {
        this.flameGraphics.fillStyle(0xf77622, 0.7);
        this.flameGraphics.fillTriangle(rx - 8, ry, rx + 8, ry, rx, ry + ember);
        this.flameGraphics.fillStyle(0xfee761, 0.85);
        this.flameGraphics.fillTriangle(rx - 4, ry, rx + 4, ry, rx, ry + ember * 0.6);
      }
    }

    // Haz de reflector del cohete siguiendo hacia el astronauta
    this.beaconBeam.clear();
    const beamAlpha = this.landed ? 0.14 : 0.2;
    this.beaconBeam.fillStyle(0xfee761, beamAlpha);
    this.beaconBeam.fillTriangle(rx - 6, this.rocket.y + 18, 250, 240, 304, 240);
  }
}
