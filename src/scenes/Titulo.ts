import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { gameStore } from '../state/GameState';
import { Save } from '../state/Save';
import { AudioSystem } from '../systems/Audio';
import { Quota } from '../systems/Quota';
import { button, txt } from '../minigames/widgets';

const T = uiText.title;

/**
 * Pantalla de título: deja elegir entre continuar o empezar de nuevo, explica en 4 líneas
 * cómo se gana y cómo se pierde, y arranca la música (los navegadores piden un toque primero).
 */
export class Titulo extends Phaser.Scene {
  private howTo: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Titulo');
  }

  create(): void {
    AudioSystem.installUnlock();
    AudioSystem.playMusic('starboard');
    AudioSystem.stopAllLoops();

    // Fondo marciano ilustrado (Sprite-0002-Menu2.jpeg)
    if (this.textures.exists('menu_bg')) {
      this.add.image(320, 180, 'menu_bg').setDisplaySize(640, 360);
    } else {
      this.add.rectangle(0, 0, 640, 360, 0x181425).setOrigin(0, 0);
    }

    // Estrellas sutiles en la franja superior del cielo marciano
    for (let i = 0; i < 45; i++) {
      const s = this.add.rectangle(
        Math.random() * 640,
        Math.random() * 110,
        1,
        1,
        0xffffff,
        0.25 + Math.random() * 0.45
      );
      this.tweens.add({
        targets: s,
        alpha: 0.08,
        duration: 900 + Math.random() * 1500,
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 1200,
      });
    }

    // Estrella fugaz ocasional en el cielo
    this.time.addEvent({
      delay: 3200,
      loop: true,
      callback: () => {
        const x = 90 + Math.random() * 440;
        const star = this.add.rectangle(x, 16 + Math.random() * 50, 7, 1, 0xfee761);
        this.tweens.add({
          targets: star,
          x: x + 110,
          y: star.y + 42,
          alpha: 0,
          duration: 650,
          onComplete: () => star.destroy(),
        });
      },
    });

    // Cintillo superior traslúcido que enmarca el título sin cubrir el cohete ni la base
    this.add
      .rectangle(320, 52, 540, 76, 0x181425, 0.78)
      .setStrokeStyle(2, 0xfee761);
    txt(this, 320, 34, uiText.gameTitle, 34, '#fee761')
      .setOrigin(0.5)
      .setShadow(2, 2, '#a22633', 0, false, true);
    txt(this, 320, 62, T.tagline, 11, '#ead4aa').setOrigin(0.5);
    txt(this, 320, 78, uiText.subtitle, 9, '#c0cbdc').setOrigin(0.5);

    // Consola inferior estética en cuadrícula 2×2 para dejar libre la ilustración central de la base
    this.add
      .rectangle(320, 306, 560, 92, 0x181425, 0.84)
      .setStrokeStyle(2, 0x5a6988);

    const saved = Save.load();
    if (saved) {
      button(
        this,
        192,
        282,
        236,
        28,
        `${T.continue} · ${T.dayPrefix} ${saved.day}`,
        () => this.continueGame(),
        0x63c74d,
        '#181425'
      );
      button(
        this,
        448,
        282,
        236,
        28,
        T.newGameOver,
        () => this.newGame(true),
        0xb86f50
      );
    } else {
      button(
        this,
        192,
        282,
        236,
        28,
        T.newGame,
        () => this.newGame(false),
        0x63c74d,
        '#181425'
      );
      button(
        this,
        448,
        282,
        236,
        28,
        uiText.personaliza.openButton,
        () => this.scene.start('Personaliza', { nextScene: 'Titulo' }),
        0x5a6988
      );
    }

    button(this, 192, 316, 236, 26, T.howToButton, () => this.toggleHowTo(), 0x3a4466);
    button(
      this,
      448,
      316,
      236,
      26,
      uiText.hud.creditsButton,
      () => this.scene.start('Creditos', { returnScene: 'Titulo' }),
      0x262b44
    );

    txt(this, 320, 342, uiText.honestyNotice, 9, '#ead4aa').setOrigin(0.5);

    const kb = this.input.keyboard;
    kb?.on('keydown-ENTER', () => (saved ? this.continueGame() : this.newGame(false)));
  }

  private toggleHowTo(): void {
    AudioSystem.play('ui_open');
    if (this.howTo) {
      this.howTo.destroy();
      this.howTo = null;
      return;
    }
    const bg = this.add.rectangle(320, 190, 520, 230, 0x262b44, 0.97).setStrokeStyle(2, 0xfee761).setInteractive();
    const title = txt(this, 320, 92, T.howToTitle, 16, '#fee761').setOrigin(0.5);
    const lines = txt(this, 76, 112, T.howToLines.join('\n'), 11, '#ffffff', 490).setLineSpacing(4);
    const close = txt(this, 320, 290, T.howToClose, 11, '#8b9bb4').setOrigin(0.5);
    bg.on('pointerdown', () => this.toggleHowTo());
    this.howTo = this.add.container(0, 0, [bg, title, lines, close]).setDepth(50);
  }

  private continueGame(): void {
    const saved = Save.load();
    if (!saved) return this.newGame(false);
    AudioSystem.play('ui_confirm_big');
    gameStore.reset(saved);
    Quota.applyDailyQuota(gameStore.state);
    if (saved.location === 'base' || saved.location === 'refugio') this.scene.start('Base');
    else this.scene.start('Transmision');
  }

  private newGame(overwrite: boolean): void {
    if (overwrite && !this.confirmArmed) {
      // Un segundo clic confirma: evita borrar la partida por accidente
      this.confirmArmed = true;
      AudioSystem.play('ui_question');
      const warn = txt(this, 320, 122, T.overwriteWarn, 11, '#feae34').setOrigin(0.5);
      this.time.delayedCall(2500, () => {
        warn.destroy();
        this.confirmArmed = false;
      });
      return;
    }
    AudioSystem.play('ui_confirm_big');
    const keepLook = { ...gameStore.state.customization };
    Save.clear();
    gameStore.reset();
    gameStore.state.customization = keepLook;
    Quota.applyDailyQuota(gameStore.state);
    this.scene.start('Despegue');
  }

  private confirmArmed = false;
}
