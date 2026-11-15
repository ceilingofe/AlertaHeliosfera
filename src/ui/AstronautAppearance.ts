import Phaser from 'phaser';
import { Customization } from '../systems/Customization';
import type { Accessory, SuitColor } from '../types';

export type AstronautDirection = 'down' | 'up' | 'left' | 'right';
export type WalkStep = 0 | 1 | 2;

export interface AstronautVisualConfig {
  suit: SuitColor;
  hair: 1 | 2;
  accessory: Accessory | null;
  patch?: string;
}

/**
 * Utilidad visual de Phaser para generar y reutilizar las texturas recoloreadas
 * del astronauta (tamaño completo 24×56 y mini 12×28 / 14×23), con vistas en 4 direcciones
 * (frente, espalda, perfil izquierdo y perfil derecho) y cuadros de caminata animados.
 */
export class AstronautAppearance {
  /**
   * Devuelve la clave de textura para el sprite grande (24×56) con el peinado y color de traje indicados.
   */
  static getFullTextureKey(
    scene: Phaser.Scene,
    hair: 1 | 2,
    suit: SuitColor
  ): string {
    const preferred = hair === 2 ? 'boy1_front' : 'girl_front';
    const baseKey = scene.textures.exists(preferred)
      ? preferred
      : hair === 2
        ? 'astronaut_hair2'
        : 'astronaut_hair1';
    const startRow = baseKey.endsWith('_front') ? 20 : 18;
    if (suit === 'blanco') {
      return baseKey;
    }

    const targetKey = `${baseKey}_${suit}`;
    if (scene.textures.exists(targetKey)) {
      return targetKey;
    }

    AstronautAppearance.buildRecoloredTexture(scene, baseKey, targetKey, startRow, suit);
    return scene.textures.exists(targetKey) ? targetKey : baseKey;
  }

  /**
   * Devuelve la clave de textura para el sprite mini mirando al frente (quieto).
   */
  static getMiniTextureKey(
    scene: Phaser.Scene,
    hair: 1 | 2,
    suit: SuitColor
  ): string {
    return AstronautAppearance.getDirectionalMiniKey(scene, hair, suit, 'down', 0);
  }

  /**
   * Devuelve la clave de textura para el sprite mini en la dirección ('down'|'up'|'left'|'right')
   * y paso de caminata (0 = quieto, 1 = paso izq, 2 = paso der) indicados.
   */
  static getDirectionalMiniKey(
    scene: Phaser.Scene,
    hair: 1 | 2,
    suit: SuitColor,
    dir: AstronautDirection = 'down',
    step: WalkStep = 0
  ): string {
    const prefix = hair === 2 ? 'boy1' : 'girl';
    let baseKey: string;
    if (dir === 'up') {
      baseKey = scene.textures.exists('character_back_mini')
        ? 'character_back_mini'
        : hair === 2
          ? 'astronaut_mini_hair2'
          : 'astronaut_mini_hair1';
    } else if (dir === 'left' || dir === 'right') {
      const sideKey = `${prefix}_side_mini`;
      baseKey = scene.textures.exists(sideKey)
        ? sideKey
        : hair === 2
          ? 'astronaut_mini_hair2'
          : 'astronaut_mini_hair1';
    } else {
      const frontKey = `${prefix}_front_mini`;
      baseKey = scene.textures.exists(frontKey)
        ? frontKey
        : hair === 2
          ? 'astronaut_mini_hair2'
          : 'astronaut_mini_hair1';
    }

    const isCharMini = baseKey.endsWith('_mini') && !baseKey.startsWith('astronaut_');
    const startRow = isCharMini ? 10 : 8;

    const targetKey = `${baseKey}_${suit}_s${step}`;
    if (scene.textures.exists(targetKey)) {
      return targetKey;
    }

    if (suit === 'blanco' && step === 0) {
      return baseKey;
    }

    const viewKind: 'front' | 'back' | 'side' =
      dir === 'up' ? 'back' : dir === 'left' || dir === 'right' ? 'side' : 'front';

    AstronautAppearance.buildRecoloredTexture(
      scene,
      baseKey,
      targetKey,
      startRow,
      suit,
      step,
      viewKind
    );
    return scene.textures.exists(targetKey) ? targetKey : baseKey;
  }

  /**
   * Actualiza la textura y orientación del sprite del jugador durante el movimiento o reposo.
   */
  static updatePlayerWalk(
    scene: Phaser.Scene,
    sprite: Phaser.GameObjects.Sprite,
    hair: 1 | 2,
    suit: SuitColor,
    vx: number,
    vy: number,
    walkTimeMs: number,
    lastDir: AstronautDirection
  ): AstronautDirection {
    const moving = vx !== 0 || vy !== 0;
    let dir = lastDir;
    if (moving) {
      if (Math.abs(vy) >= Math.abs(vx)) {
        dir = vy < 0 ? 'up' : 'down';
      } else {
        dir = vx < 0 ? 'left' : 'right';
      }
    }

    // Ciclo de 4 tiempos: 0 (quieto) -> 1 (paso A) -> 0 (centro) -> 2 (paso B)
    let step: WalkStep = 0;
    if (moving) {
      const phase = Math.floor(walkTimeMs / 130) % 4;
      step = phase === 1 ? 1 : phase === 3 ? 2 : 0;
    }

    const texKey = AstronautAppearance.getDirectionalMiniKey(scene, hair, suit, dir, step);
    if (sprite.texture.key !== texKey) {
      sprite.setTexture(texKey);
    }

    // En vista lateral ('side_mini' mira hacia la izquierda), volteamos al ir a la derecha
    if (dir === 'right') {
      sprite.setFlipX(true);
    } else if (dir === 'left') {
      sprite.setFlipX(false);
    } else {
      sprite.setFlipX(false);
    }

    return dir;
  }

  private static buildRecoloredTexture(
    scene: Phaser.Scene,
    sourceKey: string,
    targetKey: string,
    startRow: number,
    suit: SuitColor,
    step: WalkStep = 0,
    viewKind: 'front' | 'back' | 'side' = 'front'
  ): void {
    if (!scene.textures.exists(sourceKey)) return;
    const srcTex = scene.textures.get(sourceKey);
    const sourceImage = srcTex.getSourceImage() as
      | HTMLImageElement
      | HTMLCanvasElement
      | undefined;
    if (!sourceImage) return;

    const width = sourceImage.width;
    const height = sourceImage.height;
    if (!width || !height) return;

    const canvasTex = scene.textures.createCanvas(targetKey, width, height);
    if (!canvasTex) return;

    const ctx = canvasTex.getContext();
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(sourceImage, 0, 0);

    const imgData = ctx.getImageData(0, 0, width, height);
    if (suit !== 'blanco') {
      Customization.recolorRgbaBuffer(imgData.data, width, height, startRow, suit);
    }
    if (step !== 0 && height >= 23) {
      AstronautAppearance.applyWalkStepToBuffer(imgData.data, width, height, step, viewKind);
    }
    ctx.putImageData(imgData, 0, 0);
    canvasTex.refresh();
  }

  /**
   * Anima las botas/piernas y el braceo en el buffer RGBA para dar caminata fluida en 4 direcciones.
   */
  private static applyWalkStepToBuffer(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    step: WalkStep,
    viewKind: 'front' | 'back' | 'side'
  ): void {
    const copy = new Uint8ClampedArray(data);
    const getPx = (x: number, y: number): [number, number, number, number] => {
      if (x < 0 || x >= width || y < 0 || y >= height) return [0, 0, 0, 0];
      const i = (y * width + x) * 4;
      return [copy[i], copy[i + 1], copy[i + 2], copy[i + 3]];
    };
    const setPx = (x: number, y: number, rgba: [number, number, number, number]): void => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const i = (y * width + x) * 4;
      data[i] = rgba[0];
      data[i + 1] = rgba[1];
      data[i + 2] = rgba[2];
      data[i + 3] = rgba[3];
    };

    const legStart = Math.max(16, height - 7);
    const halfX = Math.floor(width / 2);

    if (viewKind === 'front' || viewKind === 'back') {
      // Levantar la pierna activa 1 px (izquierda en step 1, derecha en step 2)
      const xMin = step === 1 ? 0 : halfX;
      const xMax = step === 1 ? halfX - 1 : width - 1;
      for (let y = legStart; y < height - 1; y++) {
        for (let x = xMin; x <= xMax; x++) {
          setPx(x, y, getPx(x, y + 1));
        }
      }
      for (let x = xMin; x <= xMax; x++) {
        setPx(x, height - 1, [0, 0, 0, 0]);
      }
    } else {
      // Vista de perfil: separar las dos piernas hacia adelante y atrás 1 px
      for (let y = legStart; y < height; y++) {
        for (let x = 0; x < width; x++) {
          setPx(x, y, [0, 0, 0, 0]);
        }
        for (let x = 0; x < width; x++) {
          const px = getPx(x, y);
          if (px[3] === 0) continue;
          const isFrontHalf = x < halfX;
          if (step === 1) {
            const tx = isFrontHalf ? x - 1 : x + 1;
            const ty = isFrontHalf ? y : Math.max(legStart, y - 1);
            setPx(tx, ty, px);
          } else {
            const tx = isFrontHalf ? x : x + 1;
            const ty = isFrontHalf ? Math.max(legStart, y - 1) : y;
            setPx(tx, ty, px);
          }
        }
      }
    }
  }

  /**
   * Crea un contenedor con el astronauta grande (24×56) recoloreado y su accesorio (32×64)
   * alineado exactamente en x=4, y=8 del lienzo de 32×64 (desplazamiento central y = -4 * scale).
   */
  static createFullAstronautContainer(
    scene: Phaser.Scene,
    x: number,
    y: number,
    scale: number,
    config: AstronautVisualConfig
  ): Phaser.GameObjects.Container {
    const container = scene.add.container(x, y);
    const texKey = AstronautAppearance.getFullTextureKey(
      scene,
      config.hair,
      config.suit
    );
    const bodyImg = scene.add.image(0, 0, texKey).setScale(scale);
    container.add(bodyImg);

    if (config.accessory) {
      const accKey = `acc_${config.accessory}`;
      if (scene.textures.exists(accKey)) {
        const accImg = scene.add
          .image(0, -4 * scale, accKey)
          .setScale(scale);
        container.add(accImg);
      }
    }

    return container;
  }
}
