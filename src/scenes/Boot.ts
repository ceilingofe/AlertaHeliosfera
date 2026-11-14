import Phaser from 'phaser';

/**
 * Escena inicial: configura ajustes básicos y espera a que la fuente PixelifySans
 * esté disponible en el navegador antes de pasar a Preload.
 */
export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor('#181425');

    if (typeof document !== 'undefined' && 'fonts' in document) {
      try {
        await document.fonts.ready;
        await Promise.all([
          document.fonts.load('400 16px PixelifySans'),
          document.fonts.load('700 16px PixelifySans'),
        ]);
      } catch {
        // Si el navegador falla al reportar fuentes, continuamos con la fuente de respaldo.
      }
    }

    this.scene.start('Preload');
  }
}
