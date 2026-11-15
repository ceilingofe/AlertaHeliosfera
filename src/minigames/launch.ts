import Phaser from 'phaser';

/**
 * Los minijuegos se cargan solo al abrirlos: no forman parte del bundle inicial.
 * Cada import genera un chunk independiente.
 */
const MINIGAME_LOADERS = {
  MinijuegoRoca: () => import('./MinijuegoRoca').then((m) => m.MinijuegoRoca),
  MinijuegoSuelo: () => import('./MinijuegoSuelo').then((m) => m.MinijuegoSuelo),
  MinijuegoMinerales: () =>
    import('./MinijuegoMinerales').then((m) => m.MinijuegoMinerales),
  MinijuegoAire: () => import('./MinijuegoAire').then((m) => m.MinijuegoAire),
  MinijuegoPaneles: () =>
    import('./MinijuegoPaneles').then((m) => m.MinijuegoPaneles),
  MinijuegoTuberias: () =>
    import('./MinijuegoTuberias').then((m) => m.MinijuegoTuberias),
};

export type MinigameKey = keyof typeof MINIGAME_LOADERS;

export const MINIGAME_KEYS = Object.keys(MINIGAME_LOADERS) as MinigameKey[];

/** Registra el minijuego en el SceneManager la primera vez que se necesita. */
export async function loadMinigame(
  scene: Phaser.Scene,
  key: MinigameKey
): Promise<void> {
  if (scene.scene.get(key)) return;

  const SceneClass = await MINIGAME_LOADERS[key]();
  if (!scene.scene.get(key)) {
    scene.scene.add(key, SceneClass, false);
  }
}
