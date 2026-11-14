import Phaser from 'phaser';
import { Customization } from '../systems/Customization';
import type { Accessory, SuitColor } from '../types';

export interface AstronautVisualConfig {
  suit: SuitColor;
  hair: 1 | 2;
  accessory: Accessory | null;
  patch?: string;
}

/**
 * Utilidad visual de Phaser para generar y reutilizar las texturas recoloreadas
 * del astronauta (tamaño completo 24×56 desde fila 18 y mini 14×23 desde fila 8),
 * manteniendo consistencia en Mundo, Base, Despegue, Personaliza, Rescate y Diploma.
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
    const baseKey = hair === 2 ? 'astronaut_hair2' : 'astronaut_hair1';
    if (suit === 'blanco') {
      return baseKey;
    }

    const targetKey = `${baseKey}_${suit}`;
    if (scene.textures.exists(targetKey)) {
      return targetKey;
    }

    AstronautAppearance.buildRecoloredTexture(scene, baseKey, targetKey, 18, suit);
    return scene.textures.exists(targetKey) ? targetKey : baseKey;
  }

  /**
   * Devuelve la clave de textura para el sprite mini (14×23) con el peinado y color de traje indicados.
   */
  static getMiniTextureKey(
    scene: Phaser.Scene,
    hair: 1 | 2,
    suit: SuitColor
  ): string {
    const baseKey = hair === 2 ? 'astronaut_mini_hair2' : 'astronaut_mini_hair1';
    if (suit === 'blanco') {
      return baseKey;
    }

    const targetKey = `${baseKey}_${suit}`;
    if (scene.textures.exists(targetKey)) {
      return targetKey;
    }

    AstronautAppearance.buildRecoloredTexture(scene, baseKey, targetKey, 8, suit);
    return scene.textures.exists(targetKey) ? targetKey : baseKey;
  }

  private static buildRecoloredTexture(
    scene: Phaser.Scene,
    sourceKey: string,
    targetKey: string,
    startRow: number,
    suit: SuitColor
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
    Customization.recolorRgbaBuffer(imgData.data, width, height, startRow, suit);
    ctx.putImageData(imgData, 0, 0);
    canvasTex.refresh();
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
