import Phaser from 'phaser';
import { AudioSystem } from '../systems/Audio';
import { Data } from '../systems/Data';
import { I18n } from '../systems/I18n';
import { VIEW_H, VIEW_W } from '../ui/installCameraDefaults';
import { createProceduralTextures } from '../ui/ProceduralTextures';

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
  'planet_earth',
  'planet_mars',
  'bed_base',
  'brush_clean',
  'flask_blue',
  'flask_conical',
  'tube_sample',
] as const;

const WALK_SHEET_KEYS = [
  'girl_walk_front',
  'girl_walk_back',
  'girl_walk_side',
  'boy1_walk_front',
  'boy1_walk_back',
  'boy1_walk_side',
  'boy2_walk_front',
  'boy2_walk_back',
  'boy2_walk_side',
] as const;

const CHAR_SPRITE_KEYS = [
  'girl_front',
  'girl_side',
  'girl_front_mini',
  'girl_side_mini',
  'boy1_front',
  'boy1_side',
  'boy1_front_mini',
  'boy1_side_mini',
  'boy2_front',
  'boy2_side',
  'boy2_front_mini',
  'boy2_side_mini',
  'character_back',
  'character_back_mini',
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
 * Escena de precarga: muestra la ilustración marciana de pantalla de carga,
 * carga todos los sprites, íconos y JSON de datos NASA y pasa a la pantalla de Título.
 */
export class Preload extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    const width = VIEW_W;
    const height = VIEW_H;
    const uiText = I18n.ui();

    // Fondo ilustrado de la pantalla de carga (cargado en Boot)
    if (this.textures.exists('loading_bg')) {
      this.textures.get('loading_bg').setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.add.image(width / 2, height / 2, 'loading_bg').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x181425);
    }

    // Panel inferior semitransparente para que la barra de progreso destaque sin tapar el sol ni las mesetas
    const cardBg = this.add
      .rectangle(width / 2, height - 46, 304, 54, 0x181425, 0.84)
      .setStrokeStyle(2, 0xfee761);

    const loadingLabel = this.add
      .text(width / 2, height - 58, `${uiText.gameTitle} · ${uiText.loading}`, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '13px',
        color: '#fee761',
      })
      .setOrigin(0.5);

    const barBg = this.add
      .rectangle(width / 2, height - 34, 264, 16, 0x262b44)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x181425);

    const barFill = this.add
      .rectangle(width / 2 - 130, height - 34, 1, 12, 0x63c74d)
      .setOrigin(0, 0.5)
      .setVisible(false);

    const pctLabel = this.add
      .text(width / 2, height - 34, '0 %', {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '10px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      const w = Math.round(260 * value);
      barFill.setVisible(w > 0);
      barFill.setSize(Math.max(1, w), 12).updateDisplayOrigin();
      pctLabel.setText(`${Math.round(value * 100)} %`);
    });

    this.load.on('complete', () => {
      barFill.setVisible(true);
      barFill.setSize(260, 12).updateDisplayOrigin();
      pctLabel.setText('100 %');
      void cardBg;
      void barBg;
      void loadingLabel;
    });

    this.load.image('menu_bg', 'assets/sprites/menu_bg.jpg');

    for (const key of SPRITE_KEYS) {
      this.load.image(key, `assets/sprites/${key}.png`);
    }

    for (const key of WALK_SHEET_KEYS) {
      this.load.image(key, `assets/sprites/walk/${key}.png`);
    }

    for (const key of CHAR_SPRITE_KEYS) {
      this.load.image(key, `assets/sprites/char/${key}.png`);
    }

    for (const key of UI_ICON_KEYS) {
      this.load.image(key, `assets/ui/${key}.png`);
    }

    // Cargar archivos de datos NASA desde public/data/
    this.load.json('nasa_events', 'data/events.json');
    this.load.json('nasa_meda', 'data/meda_jezero.json');
    this.load.json('nasa_horizons', 'data/horizons_delay.json');
  }

  create(): void {
    Data.setNasaDataCache({
      events: this.cache.json.get('nasa_events'),
      meda: this.cache.json.get('nasa_meda'),
      horizons: this.cache.json.get('nasa_horizons'),
    });

    for (const key of [
      ...SPRITE_KEYS,
      ...WALK_SHEET_KEYS,
      ...CHAR_SPRITE_KEYS,
      ...UI_ICON_KEYS,
      'menu_bg',
    ]) {
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }

    createProceduralTextures(this);
    AudioSystem.installUnlock();
    AudioSystem.preloadAll();

    // Breve pausa para que se aprecie la pantalla de carga antes de entrar a Título
    this.time.delayedCall(550, () => {
      this.scene.start('Titulo');
    });
  }
}
