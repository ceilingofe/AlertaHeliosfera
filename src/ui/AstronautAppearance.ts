import Phaser from 'phaser';
import { Customization } from '../systems/Customization';
import type {
  Accessory,
  CharacterFacing,
  CharacterId,
  SuitColor,
} from '../types';

export interface AstronautVisualConfig {
  suit: SuitColor;
  character: CharacterId;
  accessory: Accessory | null;
  patch?: string;
}

/** Primera fila del traje: el casco y la cara quedan sin recolorear. */
const SUIT_START_ROW_FULL = 20;
const SUIT_START_ROW_MINI = 10;

/**
 * Utilidad visual de Phaser para generar y reutilizar las texturas de los tres
 * personajes (tamaño completo 24×56 y mini 12×28), con cuatro orientaciones:
 * front (abajo), back (arriba) y side (izquierda; la derecha es el mismo sprite
 * invertido). Mantiene consistencia en Mundo, Base, Despegue, Personaliza,
 * Rescate, Diploma y minijuegos.
 */
export class AstronautAppearance {
  /**
   * Devuelve la clave de textura del sprite grande (24×56) mirando al frente.
   */
  static getFullTextureKey(
    scene: Phaser.Scene,
    character: CharacterId,
    suit: SuitColor
  ): string {
    return AstronautAppearance.getTextureKey(scene, character, 'down', suit, 'full');
  }

  /**
   * Devuelve la clave de textura del sprite mini (12×28) mirando al frente.
   */
  static getMiniTextureKey(
    scene: Phaser.Scene,
    character: CharacterId,
    suit: SuitColor
  ): string {
    return AstronautAppearance.getTextureKey(scene, character, 'down', suit, 'mini');
  }

  /**
   * Devuelve la textura del personaje para una orientación concreta. La
   * orientación "right" reutiliza el lado izquierdo y se voltea con applyFacing.
   */
  static getTextureKey(
    scene: Phaser.Scene,
    character: CharacterId,
    facing: CharacterFacing,
    suit: SuitColor,
    size: 'full' | 'mini'
  ): string {
    const baseKey = AstronautAppearance.getBaseTextureKey(character, facing, size);
    if (suit === 'blanco') {
      return baseKey;
    }

    const targetKey = `${baseKey}_${suit}`;
    if (scene.textures.exists(targetKey)) {
      return targetKey;
    }

    const startRow =
      size === 'full' ? SUIT_START_ROW_FULL : SUIT_START_ROW_MINI;
    AstronautAppearance.buildRecoloredTexture(
      scene,
      baseKey,
      targetKey,
      startRow,
      suit
    );
    return scene.textures.exists(targetKey) ? targetKey : baseKey;
  }

  /**
   * Calcula la orientación a partir del vector de movimiento, conservando la
   * anterior cuando el personaje está quieto.
   */
  static getFacing(
    vx: number,
    vy: number,
    current: CharacterFacing
  ): CharacterFacing {
    if (vx === 0 && vy === 0) return current;
    if (Math.abs(vy) >= Math.abs(vx)) {
      return vy < 0 ? 'up' : 'down';
    }
    return vx < 0 ? 'left' : 'right';
  }

  /**
   * Aplica el volteo horizontal. Los sprites de lado miran a la izquierda.
   */
  static applyFacing(
    sprite: Phaser.GameObjects.Sprite,
    facing: CharacterFacing
  ): void {
    sprite.setFlipX(facing === 'right');
  }

  /**
   * Sincroniza textura y volteo de un sprite de juego con la orientación actual.
   */
  static syncPlayerSprite(
    scene: Phaser.Scene,
    sprite: Phaser.GameObjects.Sprite,
    character: CharacterId,
    suit: SuitColor,
    facing: CharacterFacing
  ): void {
    const key = AstronautAppearance.getTextureKey(
      scene,
      character,
      facing,
      suit,
      'mini'
    );
    if (sprite.texture.key !== key) {
      sprite.setTexture(key);
    }
    AstronautAppearance.applyFacing(sprite, facing);
  }

  private static getBaseTextureKey(
    character: CharacterId,
    facing: CharacterFacing,
    size: 'full' | 'mini'
  ): string {
    const suffix = size === 'mini' ? '_mini' : '';
    if (facing === 'up') {
      return `character_back${suffix}`;
    }
    const view = facing === 'down' ? 'front' : 'side';
    return `${character}_${view}${suffix}`;
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
   * Crea un contenedor con el personaje grande (24×56) de frente, recoloreado y
   * con su accesorio (32×64) alineado en x=4, y=8 del lienzo de 32×64.
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
      config.character,
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
