import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { gameStore } from '../state/GameState';
import { Save } from '../state/Save';

const SPRITE_KEYS = [
  'acc_antena',
  'acc_audifonos',
  'acc_diadema',
  'acc_gorrito',
  'acc_mono',
  'antenna',
  'antenna_broken',
  'astronaut_hair1',
  'astronaut_hair2',
  'astronaut_mini_hair1',
  'astronaut_mini_hair2',
  'base_exterior',
  'corvi_alert',
  'corvi_blink',
  'corvi_happy',
  'corvi_neutral',
  'corvi_proud',
  'corvi_sad_tear',
  'corvi_think',
  'corvi_worried',
  'ground_placeholder',
  'marker_event',
  'marker_sample',
  'moxie',
  'refuge',
  'rock_leopard',
  'rock_sandstone',
  'rock_sparkle',
  'rock_volcanic',
  'rocket',
  'solar_panel',
  'solar_panel_dusty',
  'tube_empty',
  'tube_full',
] as const;

const UI_ICON_KEYS = [
  'icon_bolt',
  'icon_brush',
  'icon_drill',
  'icon_moon',
  'icon_o2',
  'icon_rad',
  'icon_scanner',
  'icon_shovel',
  'icon_sun',
  'icon_temp',
  'icon_valve',
  'icon_wrench',
] as const;

/**
 * Escena de precarga: carga todos los sprites e íconos con sus nombres nativos.
 * Si existe una partida guardada en localStorage, la restaura y retoma el día guardado.
 */
export class Preload extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const barBg = this.add.rectangle(width / 2, height / 2 + 20, 244, 16, 0x262b44).setOrigin(0.5);
    barBg.setStrokeStyle(2, 0x181425);

    const barFill = this.add.rectangle(width / 2 - 120, height / 2 + 20, 0, 12, 0x63c74d).setOrigin(0, 0.5);

    const loadingLabel = this.add
      .text(width / 2, height / 2 - 6, uiText.loading, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '16px',
        color: '#ead4aa',
      })
      .setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      barFill.width = Math.round(240 * value);
    });

    this.load.on('complete', () => {
      barBg.destroy();
      barFill.destroy();
      loadingLabel.destroy();
    });

    for (const key of SPRITE_KEYS) {
      this.load.image(key, `assets/sprites/${key}.png`);
    }

    for (const key of UI_ICON_KEYS) {
      this.load.image(key, `assets/ui/${key}.png`);
    }
  }

  create(): void {
    const saved = Save.load();
    if (saved) {
      gameStore.reset(saved);
      if (saved.location === 'base' || saved.location === 'refugio') {
        this.scene.start('Base');
        return;
      }
    }

    this.scene.start('Mundo');
  }
}
