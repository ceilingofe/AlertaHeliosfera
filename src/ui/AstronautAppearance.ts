import Phaser from 'phaser';
import { gameStore } from '../state/GameState';
import { Customization } from '../systems/Customization';
import type { Accessory, SuitColor } from '../types';

export type AstronautDirection = 'down' | 'up' | 'left' | 'right';
export type WalkStep = 0 | 1 | 2 | 3;

export interface AstronautVisualConfig {
  suit: SuitColor;
  hair: 1 | 2 | 3;
  accessory: Accessory | null;
  patch?: string;
}

const PATCH_COLORS: Record<string, { bg: string; accent: string; border: string }> = {
  SPACECROWS: { bg: '#b55088', accent: '#fee761', border: '#181425' },
  JEZERO: { bg: '#0099db', accent: '#2ce8f5', border: '#181425' },
  HELIOSFERA: { bg: '#e43b44', accent: '#fee761', border: '#181425' },
  PERSEVERANCE: { bg: '#3e8948', accent: '#ffffff', border: '#181425' },
  'LUNA-7': { bg: '#3a4466', accent: '#fee761', border: '#181425' },
};

/**
 * Utilidad visual de Phaser para generar y reutilizar las texturas recoloreadas
 * del astronauta (tamaño completo y mini), con los spritesheets de caminata fluida
 * de 4 cuadros (`caminata.zip`), accesorios visibles en el casco y parche de misión en el pecho.
 */
export class AstronautAppearance {
  private static getCharPrefix(hair: 1 | 2 | 3): 'girl' | 'boy1' | 'boy2' {
    if (hair === 2) return 'boy1';
    if (hair === 3) return 'boy2';
    return 'girl';
  }

  /**
   * Devuelve la clave de textura para el sprite grande (24×56) con el peinado, color de traje y parche indicados.
   */
  static getFullTextureKey(
    scene: Phaser.Scene,
    hair: 1 | 2 | 3,
    suit: SuitColor,
    patch: string = gameStore.state.customization.patch
  ): string {
    const prefix = AstronautAppearance.getCharPrefix(hair);
    const preferred = `${prefix}_front`;
    const baseKey = scene.textures.exists(preferred)
      ? preferred
      : hair === 2
        ? 'astronaut_hair2'
        : 'astronaut_hair1';
    const startRow = baseKey.endsWith('_front') ? 20 : 18;
    const safePatch = patch || 'LUNA-7';
    const targetKey = `${baseKey}_${suit}_p_${safePatch}`;
    if (scene.textures.exists(targetKey)) {
      return targetKey;
    }

    AstronautAppearance.buildRecoloredFullTexture(
      scene,
      baseKey,
      targetKey,
      startRow,
      suit,
      safePatch
    );
    return scene.textures.exists(targetKey) ? targetKey : baseKey;
  }

  /**
   * Devuelve la clave de textura para el sprite mini mirando al frente (quieto).
   */
  static getMiniTextureKey(
    scene: Phaser.Scene,
    hair: 1 | 2 | 3,
    suit: SuitColor
  ): string {
    return AstronautAppearance.getDirectionalMiniKey(scene, hair, suit, 'down', 0);
  }

  /**
   * Devuelve la clave de textura para el sprite mini en la dirección ('down'|'up'|'left'|'right')
   * y cuadro de caminata (0..3) usando los spritesheets de `caminata.zip` + accesorio + parche.
   */
  static getDirectionalMiniKey(
    scene: Phaser.Scene,
    hair: 1 | 2 | 3,
    suit: SuitColor,
    dir: AstronautDirection = 'down',
    step: WalkStep = 0,
    accessory: Accessory | null = gameStore.state.customization.accessory,
    patch: string = gameStore.state.customization.patch
  ): string {
    const prefix = AstronautAppearance.getCharPrefix(hair);
    const sheetKind = dir === 'up' ? 'back' : dir === 'left' || dir === 'right' ? 'side' : 'front';
    const walkSheetKey = `${prefix}_walk_${sheetKind}`;
    const safeAcc = accessory ?? 'none';
    const safePatch = patch || 'LUNA-7';

    // Si existe la hoja de caminata de 4/8 cuadros, construimos el cuadro animado con gorrito/accesorio y parche
    if (scene.textures.exists(walkSheetKey)) {
      const frameIdx =
        dir === 'left' ? 4 + (step % 4) : step % 4;
      const targetKey = `walk_${walkSheetKey}_f${frameIdx}_${suit}_a_${safeAcc}_p_${safePatch}`;
      if (scene.textures.exists(targetKey)) {
        return targetKey;
      }
      AstronautAppearance.buildWalkFrameMiniTexture(
        scene,
        walkSheetKey,
        targetKey,
        frameIdx,
        suit,
        dir,
        step,
        accessory,
        safePatch
      );
      if (scene.textures.exists(targetKey)) {
        return targetKey;
      }
    }

    // Respaldo (fallback) para entornos sin las hojas de caminata
    const fallbackKey =
      hair === 2 ? 'astronaut_mini_hair2' : 'astronaut_mini_hair1';
    return fallbackKey;
  }

  /**
   * Actualiza la textura y orientación del sprite del jugador durante el movimiento o reposo.
   */
  static updatePlayerWalk(
    scene: Phaser.Scene,
    sprite: Phaser.GameObjects.Sprite,
    hair: 1 | 2 | 3,
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

    // Ciclo fluido de 4 cuadros (0 -> 1 -> 2 -> 3) de caminata.zip
    let step: WalkStep = 0;
    if (moving) {
      step = (Math.floor(walkTimeMs / 110) % 4) as WalkStep;
    }

    const texKey = AstronautAppearance.getDirectionalMiniKey(scene, hair, suit, dir, step);
    if (sprite.texture.key !== texKey) {
      sprite.setTexture(texKey);
    }

    // Las hojas laterales ya incluyen los 4 cuadros derechos (0..3) y los 4 izquierdos (4..7)
    sprite.setFlipX(false);

    return dir;
  }

  private static buildRecoloredFullTexture(
    scene: Phaser.Scene,
    sourceKey: string,
    targetKey: string,
    startRow: number,
    suit: SuitColor,
    patch: string
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
    ctx.putImageData(imgData, 0, 0);

    // Dibujar insignia/parche de misión en el pecho del traje grande (24×56)
    AstronautAppearance.drawPatchBadge(ctx, 13, 27, 6, 5, patch);

    canvasTex.refresh();
  }

  /**
   * Extrae un cuadro de 64×64 de la hoja de caminata, recolorea el traje,
   * dibuja el parche en el pecho y el accesorio en el casco, y lo escala a 16×32 nítido.
   */
  private static buildWalkFrameMiniTexture(
    scene: Phaser.Scene,
    sheetKey: string,
    targetKey: string,
    frameIdx: number,
    suit: SuitColor,
    dir: AstronautDirection,
    step: WalkStep,
    accessory: Accessory | null,
    patch: string
  ): void {
    if (!scene.textures.exists(sheetKey)) return;
    const srcTex = scene.textures.get(sheetKey);
    const sourceImage = srcTex.getSourceImage() as
      | HTMLImageElement
      | HTMLCanvasElement
      | undefined;
    if (!sourceImage) return;

    // Lienzo temporal de resolución completa (32×64) centrado en el personaje del cuadro de 64×64 (x=15..47, y=0..64)
    const workCanvas = document.createElement('canvas');
    workCanvas.width = 32;
    workCanvas.height = 64;
    const workCtx = workCanvas.getContext('2d');
    if (!workCtx) return;
    workCtx.imageSmoothingEnabled = false;

    const sx = frameIdx * 64 + 15;
    workCtx.drawImage(sourceImage, sx, 0, 32, 64, 0, 0, 32, 64);

    // Recolorear traje desde y=28 (donde empieza el cuello del traje en el lienzo de 64px de alto)
    if (suit !== 'blanco') {
      const imgData = workCtx.getImageData(0, 0, 32, 64);
      Customization.recolorRgbaBuffer(imgData.data, 32, 64, 28, suit);
      workCtx.putImageData(imgData, 0, 0);
    }

    // Dibujar parche de misión en el pecho o brazo según la dirección
    const bobY = step === 1 || step === 3 ? 2 : 0;
    if (dir === 'down') {
      AstronautAppearance.drawPatchBadge(workCtx, 17, 35 + bobY, 6, 5, patch);
    } else if (dir === 'right') {
      AstronautAppearance.drawPatchBadge(workCtx, 15, 35 + bobY, 5, 5, patch);
    } else if (dir === 'left') {
      AstronautAppearance.drawPatchBadge(workCtx, 13, 35 + bobY, 5, 5, patch);
    }

    // Superponer el accesorio (sombrero, diadema, moño, antena, audífonos) alineado al casco
    if (accessory) {
      const accKey = `acc_${accessory}`;
      if (scene.textures.exists(accKey)) {
        const accImg = scene.textures.get(accKey).getSourceImage() as
          | HTMLImageElement
          | HTMLCanvasElement
          | undefined;
        if (accImg) {
          const dx = dir === 'right' ? 2 : dir === 'left' ? -1 : 0;
          workCtx.drawImage(accImg, dx, bobY);
        }
      }
    }

    // Escalar de 32×64 a 16×32 para mantener las proporciones mini del mundo y la base
    const canvasTex = scene.textures.createCanvas(targetKey, 16, 32);
    if (!canvasTex) return;
    const outCtx = canvasTex.getContext();
    outCtx.imageSmoothingEnabled = false;
    outCtx.clearRect(0, 0, 16, 32);
    outCtx.drawImage(workCanvas, 0, 0, 32, 64, 0, 0, 16, 32);
    canvasTex.refresh();
  }

  private static drawPatchBadge(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    patch: string
  ): void {
    const style = PATCH_COLORS[patch] ?? PATCH_COLORS['LUNA-7'];
    ctx.fillStyle = style.border;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = style.bg;
    ctx.fillRect(x + 1, y + 1, Math.max(1, w - 2), Math.max(1, h - 2));
    ctx.fillStyle = style.accent;
    ctx.fillRect(x + Math.floor(w / 2) - 1, y + Math.floor(h / 2) - 1, 2, 2);
  }

  /**
   * Crea un contenedor con el astronauta grande (24×56) recoloreado, su parche de misión en el pecho
   * y su accesorio (32×64) alineado exactamente sobre el casco.
   */
  static createFullAstronautContainer(
    scene: Phaser.Scene,
    x: number,
    y: number,
    scale: number,
    config: AstronautVisualConfig
  ): Phaser.GameObjects.Container {
    const container = scene.add.container(x, y);
    const patchName = config.patch ?? gameStore.state.customization.patch ?? 'LUNA-7';
    const texKey = AstronautAppearance.getFullTextureKey(
      scene,
      config.hair,
      config.suit,
      patchName
    );
    const bodyImg = scene.add.image(0, 0, texKey).setScale(scale);
    container.add(bodyImg);

    // Placa miniatura del parche sobre el pecho para que resalte visualmente
    const patchStyle = PATCH_COLORS[patchName] ?? PATCH_COLORS['LUNA-7'];
    const bgInt = Number.parseInt(patchStyle.bg.replace('#', ''), 16);
    const accInt = Number.parseInt(patchStyle.accent.replace('#', ''), 16);
    const badgeBg = scene.add
      .rectangle(3.2 * scale, 1.5 * scale, 5.2 * scale, 3.6 * scale, bgInt)
      .setStrokeStyle(Math.max(1, 0.4 * scale), 0x181425);
    const badgeDot = scene.add.rectangle(
      3.2 * scale,
      1.5 * scale,
      2 * scale,
      1.6 * scale,
      accInt
    );
    container.add([badgeBg, badgeDot]);

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

