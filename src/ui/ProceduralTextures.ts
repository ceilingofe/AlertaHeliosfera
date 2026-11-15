import Phaser from 'phaser';

/**
 * Pequeñas texturas de decoración dibujadas en código con la paleta ENDESGA 32.
 * Complementan los sprites de Karmin (no los reemplazan): piedritas, dunas, huellas,
 * estación de muestreo de aire, marcador de sitio perdido y tierra con variación.
 */

const C = {
  dark: 0x181425,
  plum: 0x3e2731,
  brown: 0x733e39,
  rust: 0xb86f50,
  tan: 0xe4a672,
  sand: 0xead4aa,
  orange: 0xd77643,
  slate: 0x5a6988,
  steel: 0x8b9bb4,
  light: 0xc0cbdc,
  white: 0xffffff,
  cyan: 0x2ce8f5,
  yellow: 0xfee761,
  red: 0xe43b44,
  navy: 0x262b44,
};

function make(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (g: Phaser.GameObjects.Graphics) => void
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function px(g: Phaser.GameObjects.Graphics, color: number, pts: [number, number][], alpha = 1): void {
  g.fillStyle(color, alpha);
  for (const [x, y] of pts) g.fillRect(x, y, 1, 1);
}

export function createProceduralTextures(scene: Phaser.Scene): void {
  // Piedritas sueltas (3 variantes)
  make(scene, 'pebble_a', 6, 4, (g) => {
    g.fillStyle(C.brown).fillRect(1, 1, 4, 3);
    g.fillStyle(C.rust).fillRect(1, 1, 3, 2);
    px(g, C.tan, [[2, 1]]);
  });
  make(scene, 'pebble_b', 4, 3, (g) => {
    g.fillStyle(C.plum).fillRect(0, 1, 4, 2);
    g.fillStyle(C.brown).fillRect(1, 0, 2, 2);
  });
  make(scene, 'pebble_c', 8, 5, (g) => {
    g.fillStyle(C.plum).fillRect(1, 3, 7, 2);
    g.fillStyle(C.brown).fillRect(0, 1, 7, 3);
    g.fillStyle(C.rust).fillRect(1, 1, 4, 2);
    px(g, C.tan, [[2, 1], [3, 1]]);
  });

  // Duna baja (ondas de arena)
  make(scene, 'dune', 36, 10, (g) => {
    g.fillStyle(C.tan, 0.55);
    g.fillEllipse(18, 6, 34, 8);
    g.fillStyle(C.sand, 0.45);
    g.fillEllipse(16, 4, 22, 4);
    g.fillStyle(C.rust, 0.5);
    g.fillRect(6, 8, 24, 1);
  });

  // Afloramiento rocoso grande (no interactivo)
  make(scene, 'outcrop', 30, 18, (g) => {
    g.fillStyle(C.plum).fillRect(2, 12, 26, 6);
    g.fillStyle(C.brown).fillRect(3, 5, 22, 10);
    g.fillStyle(C.brown).fillRect(8, 2, 12, 5);
    g.fillStyle(C.rust).fillRect(5, 6, 10, 5);
    g.fillStyle(C.rust).fillRect(10, 3, 6, 3);
    g.fillStyle(C.tan).fillRect(10, 3, 3, 1);
    g.fillStyle(C.tan).fillRect(6, 6, 4, 1);
    // capas sedimentarias
    g.fillStyle(C.orange, 0.8).fillRect(4, 10, 20, 1);
    g.fillStyle(C.orange, 0.8).fillRect(5, 13, 18, 1);
  });

  // Huella de bota (una pisada)
  make(scene, 'footprint', 3, 4, (g) => {
    g.fillStyle(C.brown, 0.9).fillRect(0, 0, 3, 4);
    g.fillStyle(C.plum, 0.6).fillRect(1, 1, 1, 2);
  });

  // Huellas de las ruedas del rover (decoración)
  make(scene, 'rover_track', 8, 2, (g) => {
    g.fillStyle(C.brown, 0.35).fillRect(0, 0, 3, 2);
    g.fillStyle(C.brown, 0.35).fillRect(5, 0, 3, 2);
  });

  // Estación para muestrear aire (trípode con antena y luz)
  make(scene, 'air_station', 14, 18, (g) => {
    g.fillStyle(C.dark).fillRect(6, 3, 2, 12);
    g.fillStyle(C.steel).fillRect(6, 3, 1, 12);
    g.fillStyle(C.dark).fillRect(2, 14, 2, 3);
    g.fillStyle(C.dark).fillRect(10, 14, 2, 3);
    g.fillStyle(C.light).fillRect(3, 13, 8, 2);
    g.fillStyle(C.dark).fillRect(3, 6, 8, 5);
    g.fillStyle(C.light).fillRect(4, 7, 6, 3);
    g.fillStyle(C.cyan).fillRect(5, 8, 2, 1);
    g.fillStyle(C.yellow).fillRect(6, 0, 2, 2);
  });

  // Sitio de muestra arruinado (cruz roja en el suelo)
  make(scene, 'site_lost', 9, 9, (g) => {
    g.fillStyle(C.red, 0.85);
    for (let i = 0; i < 9; i++) {
      g.fillRect(i, i, 1, 1);
      g.fillRect(8 - i, i, 1, 1);
    }
  });

  // Mosaico de suelo con variación (64×64) para repetir debajo del sprite base
  make(scene, 'ground_var', 64, 64, (g) => {
    const rnd = new Phaser.Math.RandomDataGenerator(['jezero']);
    for (let i = 0; i < 70; i++) {
      const x = rnd.between(0, 63);
      const y = rnd.between(0, 63);
      const pick = rnd.between(0, 9);
      const color = pick < 4 ? C.rust : pick < 7 ? C.brown : pick < 9 ? C.tan : C.plum;
      g.fillStyle(color, pick < 7 ? 0.35 : 0.5);
      g.fillRect(x, y, rnd.between(1, 2), 1);
    }
  });

  // Partícula de polvo que lleva el viento
  make(scene, 'dust_mote', 2, 1, (g) => {
    g.fillStyle(C.sand, 0.8).fillRect(0, 0, 2, 1);
  });

  // Punto de luz para el radar
  make(scene, 'px_white', 1, 1, (g) => {
    g.fillStyle(C.white).fillRect(0, 0, 1, 1);
  });
}
