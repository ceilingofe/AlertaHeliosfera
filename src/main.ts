import Phaser from 'phaser';
import { MinijuegoAire } from './minigames/MinijuegoAire';
import { MinijuegoMinerales } from './minigames/MinijuegoMinerales';
import { MinijuegoPaneles } from './minigames/MinijuegoPaneles';
import { MinijuegoRoca } from './minigames/MinijuegoRoca';
import { MinijuegoSuelo } from './minigames/MinijuegoSuelo';
import { MinijuegoTuberias } from './minigames/MinijuegoTuberias';
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
import { Titulo } from './scenes/Titulo';
import { Transmision } from './scenes/Transmision';
import { Trivia } from './scenes/Trivia';
import './ui/installTextDefaults';
import { installCameraDefaults, VIEW_H, VIEW_W } from './ui/installCameraDefaults';

installCameraDefaults();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  // Lienzo interno a 1280×720: el mundo sigue diseñado en 640×360 y cada cámara usa zoom ×2,
  // así el texto se rasteriza 1:1 y se ve nítido en vez de borroso.
  width: VIEW_W * 2,
  height: VIEW_H * 2,
  backgroundColor: '#181425',
  pixelArt: true,
  roundPixels: true,
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    expandParent: true,
    autoRound: false,
  },
  input: { activePointers: 3 },
  scene: [
    Boot,
    Preload,
    Titulo,
    Despegue,
    Creditos,
    Personaliza,
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
    Trivia,
    Noche,
    Rescate,
    Diploma,
  ],
};

const game = new Phaser.Game(config);

const refreshScale = (): void => {
  if (game.scale) {
    game.scale.refresh();
  }
};
window.addEventListener('resize', refreshScale);
window.addEventListener('orientationchange', () => {
  setTimeout(refreshScale, 120);
  setTimeout(refreshScale, 350);
});
window.visualViewport?.addEventListener('resize', refreshScale);

const fsBtn = document.getElementById('mobile-fs-btn');
if (fsBtn) {
  fsBtn.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (mode: string) => Promise<void>;
        };
        if (orientation?.lock) {
          await orientation.lock('landscape').catch(() => undefined);
        }
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignorar si el navegador móvil bloquea fullscreen nativo
    }
    setTimeout(refreshScale, 150);
  });
  document.addEventListener('fullscreenchange', () => {
    fsBtn.textContent = document.fullscreenElement ? '✕ Salir' : '⛶ Pantalla completa';
    setTimeout(refreshScale, 120);
  });
}

// Acceso de depuración para pruebas automatizadas (no afecta el juego).
(window as unknown as { __game?: Phaser.Game }).__game = game;
export default game;

