import Phaser from 'phaser';
import { Base } from './scenes/Base';
import { Boot } from './scenes/Boot';
import { Creditos } from './scenes/Creditos';
import { Despegue } from './scenes/Despegue';
import { Dialogo } from './scenes/Dialogo';
import { Diploma } from './scenes/Diploma';
import { HUD } from './scenes/HUD';
import { Mundo } from './scenes/Mundo';
import { Noche } from './scenes/Noche';
import { Personaliza } from './scenes/Personaliza';
import { Preload } from './scenes/Preload';
import { Rescate } from './scenes/Rescate';
import { Tormenta } from './scenes/Tormenta';
import { Transmision } from './scenes/Transmision';
import { TextResolutionPlugin } from './ui/TextResolutionPlugin';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 640,
  height: 360,
  backgroundColor: '#181425',
  pixelArt: true,
  roundPixels: true,
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true,
  },
  input: { activePointers: 3 },
  plugins: {
    scene: [
      {
        key: 'TextResolutionPlugin',
        plugin: TextResolutionPlugin,
        mapping: 'textResolution',
      },
    ],
  },
  scene: [
    Boot,
    Preload,
    Despegue,
    Creditos,
    Personaliza,
    Transmision,
    Mundo,
    Base,
    HUD,
    Dialogo,
    Tormenta,
    Noche,
    Rescate,
    Diploma,
  ],
};

export default new Phaser.Game(config);
