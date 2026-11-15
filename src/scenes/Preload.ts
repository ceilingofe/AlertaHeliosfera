import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { gameStore } from '../state/GameState';
import { Save } from '../state/Save';
import { Data } from '../systems/Data';
import { Quota } from '../systems/Quota';

const SPRITE_KEYS = [
  'acc_antena',
  'acc_audifonos',
  'acc_diadema',
  'acc_gorrito',
  'acc_mono',
  'antenna',
  'antenna_broken',
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

/** Los personajes viven en assets/sprites/char/ con versión completa y mini. */
const CHARACTER_SPRITE_KEYS = [
  'character_back',
  'character_back_mini',
  'girl_front',
  'girl_front_mini',
  'girl_side',
  'girl_side_mini',
  'boy1_front',
  'boy1_front_mini',
  'boy1_side',
  'boy1_side_mini',
  'boy2_front',
  'boy2_front_mini',
  'boy2_side',
  'boy2_side_mini',
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
 * Escena de precarga: carga todos los sprites, íconos y JSON de datos NASA.
 * Si no hay guardado va a Despegue (Día 1); si hay guardado retoma el día guardado.
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
        resolution: 2,
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

    for (const key of CHARACTER_SPRITE_KEYS) {
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

    const saved = Save.load();
    if (saved) {
      gameStore.reset(saved);
      // Reanudar sin quedar congelado en pausa.
      gameStore.state.clock.paused = false;
      // Reanudar exactamente donde quedó la partida: afuera va a Mundo, dentro a Base/refugio.
      if (saved.location === 'mundo') {
        this.scene.start('Mundo');
        return;
      }
      this.scene.start('Base');
      return;
    }

    Quota.applyDailyQuota(gameStore.state);
    this.scene.start('Despegue');
  }
}
