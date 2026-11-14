import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';

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
 * En Fase 0 verifica el renderizado pixel art mostrando astronaut_hair1 a escala ×4 nítido.
 */
export class Preload extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Barra de carga con colores de la paleta ENDESGA 32
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
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Fondo de tarjeta central (ENDESGA 32: #262b44 con borde #181425)
    const panel = this.add.rectangle(width / 2, height / 2, 560, 312, 0x262b44).setOrigin(0.5);
    panel.setStrokeStyle(2, 0xe4a672);

    // Título del juego desde content/ui_text.json
    this.add
      .text(width / 2, 44, uiText.gameTitle, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '28px',
        color: '#fee761',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 72, uiText.subtitle, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '14px',
        color: '#c0cbdc',
      })
      .setOrigin(0.5);

    // Criterio de aceptación Fase 0: astronaut_hair1 (24×56 px) mostrado a escala entera ×4 nítido
    const astronaut = this.add.image(width / 2, 194, 'astronaut_hair1');
    astronaut.setScale(4);

    this.add
      .text(width / 2, 316, uiText.phase0Ready, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '16px',
        color: '#ead4aa',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 338, uiText.honestyNotice, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '12px',
        color: '#8b9bb4',
      })
      .setOrigin(0.5);
  }
}
