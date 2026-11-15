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

    // Cielo con estrellas que titilan
    this.add.rectangle(0, 0, 640, 360, 0x181425).setOrigin(0, 0);
    for (let i = 0; i < 90; i++) {
      const s = this.add.rectangle(Math.random() * 640, Math.random() * 250, 1, 1, 0xffffff, 0.4 + Math.random() * 0.6);
      this.tweens.add({ targets: s, alpha: 0.15, duration: 800 + Math.random() * 1600, yoyo: true, repeat: -1, delay: Math.random() * 1500 });
    }
    // Estrella fugaz de vez en cuando
    this.time.addEvent({
      delay: 2600,
      loop: true,
      callback: () => {
        const x = 80 + Math.random() * 480;
        const star = this.add.rectangle(x, 20 + Math.random() * 60, 6, 1, 0xfee761);
        this.tweens.add({ targets: star, x: x + 120, y: star.y + 50, alpha: 0, duration: 700, onComplete: () => star.destroy() });
      },
    });

    // Horizonte marciano
    const g = this.add.graphics();
    g.fillStyle(0x733e39).fillRect(0, 280, 640, 80);
    g.fillStyle(0xb86f50);
    for (let x = 0; x < 640; x += 8) g.fillRect(x, 272 + Math.round(Math.sin(x / 40) * 6), 8, 12);
    g.fillStyle(0x3e2731).fillRect(0, 300, 640, 60);
    this.add.tileSprite(0, 300, 640, 60, 'ground_var').setOrigin(0, 0).setAlpha(0.6);
    this.add.image(470, 262, 'base_exterior').setScale(1.2).setOrigin(0.5, 1);
    this.add.image(150, 290, 'corvi_happy').setScale(1.4);
    const hair = gameStore.state.customization?.hair === 2 ? 'astronaut_mini_hair2' : 'astronaut_mini_hair1';
    this.add.image(560, 292, hair).setScale(2);

    // Título
    txt(this, 320, 44, uiText.gameTitle, 40, '#fee761').setOrigin(0.5).setShadow(3, 3, '#a22633', 0, false, true);
    txt(this, 320, 82, T.tagline, 12, '#ead4aa').setOrigin(0.5);
    txt(this, 320, 100, uiText.subtitle, 10, '#8b9bb4').setOrigin(0.5);

    const saved = Save.load();
    let y = 140;
    if (saved) {
      const b = button(this, 320, y, 220, 30, `${T.continue} · ${T.dayPrefix} ${saved.day}`, () => this.continueGame(), 0x63c74d, '#181425');
      void b;
      y += 38;
    }
    button(this, 320, y, 220, 30, saved ? T.newGameOver : T.newGame, () => this.newGame(saved !== null));
    y += 38;
    button(this, 320, y, 220, 30, T.howToButton, () => this.toggleHowTo(), 0x5a6988);
    y += 38;
    button(this, 320, y, 220, 30, uiText.hud.creditsButton, () => this.scene.start('Creditos', { returnScene: 'Titulo' }), 0x3a4466);

    txt(this, 320, 346, uiText.honestyNotice, 9, '#c0cbdc').setOrigin(0.5);

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
    Save.clear();
    gameStore.reset();
    Quota.applyDailyQuota(gameStore.state);
    this.scene.start('Despegue');
  }

  private confirmArmed = false;
}
