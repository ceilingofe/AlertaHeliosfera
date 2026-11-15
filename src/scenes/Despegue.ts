import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { gameStore } from '../state/GameState';
import { AudioSystem } from '../systems/Audio';
import { AstronautAppearance } from '../ui/AstronautAppearance';
import { DialogBox } from '../ui/DialogBox';

/**
 * Escena Despegue (fiel al storyboard s01_despegue.png):
 * Pantalla del día 1 con cohete aterrizado, astronauta en traje por defecto o personalizado,
 * botón "¡Despegue rápido!", vista de la personalización (con candado en esquina sin tapar iconos)
 * y saludo grande de Corvi.
 */
export class Despegue extends Phaser.Scene {
  private dialogBox: DialogBox | null = null;

  constructor() {
    super('Despegue');
  }

  create(): void {
    AudioSystem.playMusic('starboard');
    const state = gameStore.state;

    // 1. Cielo estrellado nocturno (#181425) y horizonte curvo de Marte
    this.add.rectangle(320, 180, 640, 360, 0x181425);

    const stars = this.add.graphics();
    for (let i = 0; i < 65; i++) {
      const sx = (i * 89 + 17) % 630;
      const sy = (i * 47 + 13) % 240;
      stars.fillStyle(i % 4 === 0 ? 0xfee761 : 0xffffff, 0.9);
      stars.fillRect(sx, sy, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
    }

    const horizon = this.add.graphics();
    horizon.fillStyle(0xb86f50, 1);
    horizon.fillEllipse(310, 340, 680, 156);

    // 2. Título superior "DÍA 1 · TE DAMOS LA BIENVENIDA A JEZERO" y botón de Fuentes NASA
    this.add
      .text(320, 22, uiText.despegue.header, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const creditsBtn = this.add
      .rectangle(64, 22, 108, 22, 0x262b44)
      .setStrokeStyle(1, 0x5a6988)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(64, 22, '★ Fuentes NASA', {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '10px',
        color: '#fee761',
      })
      .setOrigin(0.5);
    creditsBtn.on('pointerdown', () => {
      this.dialogBox?.destroy();
      this.dialogBox = null;
      this.scene.start('Creditos', { returnScene: 'Despegue' });
    });

    // 3. Cohete aterrizado y astronauta a escala entera ×3 con su traje/accesorio actual
    this.add.image(226, 206, 'rocket').setScale(1.8);
    this.add.ellipse(358, 260, 74, 14, 0x262b44);
    AstronautAppearance.createFullAstronautContainer(
      this,
      358,
      178,
      3,
      state.customization
    );

    // 4. Botón "¡Despegue rápido!" (arriba a la derecha, permite iniciar en menos de 15 s)
    const launchBtn = this.add
      .rectangle(522, 74, 208, 36, 0x181425)
      .setStrokeStyle(2, 0x5a6988)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(522, 74, uiText.despegue.quickLaunchButton, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.add
      .text(
        522,
        104,
        state.unlocks.customization
          ? `${uiText.despegue.unlockedSuitLabel} (clic abajo)`
          : uiText.despegue.defaultSuitLabel,
        {
          fontFamily: 'PixelifySans, monospace',
          fontSize: '11px',
          color: '#c0cbdc',
        }
      )
      .setOrigin(0.5);

    // 5. Vista previa de personalización "PREMIO DEL DÍA 1"
    const prizePanel = this.add
      .rectangle(416, 118, 212, 116, 0x5a6988)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x3a4466)
      .setInteractive({ useHandCursor: state.unlocks.customization });

    this.add.text(426, 124, uiText.despegue.prizeTitle, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#181425',
    });

    // 5 muestras de color de traje
    const suitColors = [0x8b9bb4, 0xbe4a2f, 0x0099db, 0x3e8948, 0xb86f50];
    suitColors.forEach((col, idx) => {
      const cx = 438 + idx * 30;
      this.add
        .rectangle(cx, 154, 22, 22, col)
        .setStrokeStyle(2, 0x262b44);
    });

    // 4 recuadros de accesorios
    const accKeys = ['acc_antena', 'acc_gorrito', 'acc_audifonos', 'acc_mono'];
    accKeys.forEach((accKey, idx) => {
      const ax = 448 + idx * 48;
      this.add
        .rectangle(ax, 202, 42, 44, 0x8b9bb4)
        .setStrokeStyle(2, 0x3a4466);
      this.add.image(ax, 206, 'astronaut_mini_hair1').setScale(1.6);
      this.add.image(ax, 198, accKey).setScale(0.75);
    });

    if (!state.unlocks.customization) {
      // Candado compacto en la esquina superior derecha de la tarjeta para no tapar los accesorios
      this.add
        .rectangle(604, 134, 34, 24, 0xfee761)
        .setStrokeStyle(2, 0x181425);
      this.add.rectangle(604, 137, 14, 11, 0x181425);
      const lockArc = this.add.graphics();
      lockArc.lineStyle(2, 0x181425, 1);
      lockArc.strokeCircle(604, 130, 4.5);
    } else {
      prizePanel.on('pointerdown', () => {
        this.dialogBox?.destroy();
        this.dialogBox = null;
        this.scene.start('Personaliza', { nextScene: 'Despegue' });
      });
    }

    // 6. Diálogo grande de Corvi
    this.dialogBox = new DialogBox(this, {
      mode: 'big',
      mood: 'happy',
      text: uiText.despegue.corviWelcome,
      onComplete: () => {
        this.goToTransmision();
      },
    });

    launchBtn.on('pointerdown', () => this.goToTransmision());
    this.input.keyboard?.on('keydown-ENTER', () => this.goToTransmision());
    this.input.keyboard?.on('keydown-E', () => this.goToTransmision());
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.dialogBox && this.dialogBox.isTyping()) {
        this.dialogBox.completeTyping();
      } else {
        this.goToTransmision();
      }
    });
  }

  private goToTransmision(): void {
    this.dialogBox?.destroy();
    this.dialogBox = null;
    this.scene.start('Transmision');
  }
}
