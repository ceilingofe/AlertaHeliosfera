import Phaser from 'phaser';
import { MinijuegoAire } from './minigames/MinijuegoAire';
import { MinijuegoMinerales } from './minigames/MinijuegoMinerales';
import { MinijuegoPaneles } from './minigames/MinijuegoPaneles';
import { MinijuegoRoca } from './minigames/MinijuegoRoca';
import { MinijuegoSuelo } from './minigames/MinijuegoSuelo';
import { MinijuegoTuberias } from './minigames/MinijuegoTuberias';
import { Base } from './scenes/Base';
import { Boot } from './scenes/Boot';
import { Despegue } from './scenes/Despegue';
import { Dialogo } from './scenes/Dialogo';
import { HUD } from './scenes/HUD';
import { Mundo } from './scenes/Mundo';
import { Noche } from './scenes/Noche';
import { Preload } from './scenes/Preload';
import { Rescate } from './scenes/Rescate';
import { Tormenta } from './scenes/Tormenta';
import { Transmision } from './scenes/Transmision';
import './ui/installTextDefaults';

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
  scene: [
    Boot,
    Preload,
    Despegue,
    Transmision,
    Mundo,
    Base,
    HUD,
    Dialogo,
    Tormenta,
    MinijuegoRoca,
    MinijuegoSuelo,
    MinijuegoMinerales,
    MinijuegoAire,
    MinijuegoPaneles,
    MinijuegoTuberias,
    Noche,
    Rescate,
  ],
};

export default new Phaser.Game(config);
