import Phaser from 'phaser';
import { Base } from './scenes/Base';
import { Boot } from './scenes/Boot';
import { HUD } from './scenes/HUD';
import { Mundo } from './scenes/Mundo';
import { Noche } from './scenes/Noche';
import { Preload } from './scenes/Preload';
import { Rescate } from './scenes/Rescate';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 640,
  height: 360,
  backgroundColor: '#181425',
  pixelArt: true,
  roundPixels: true,
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 },
  scene: [Boot, Preload, Mundo, Base, HUD, Noche, Rescate],
};

export default new Phaser.Game(config);
