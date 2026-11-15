import Phaser from 'phaser';

/** Resolución interna del texto; 4 mantiene nítidos los píxeles al escalar. */
const TEXT_RESOLUTION = 4;

/**
 * Plugin de escena que aplica la resolución de texto solo a la fábrica de la
 * escena que lo instala. Sustituye al parche global del prototipo de Phaser,
 * que afectaba también a escenas y dependencias ajenas al juego.
 */
export class TextResolutionPlugin extends Phaser.Plugins.ScenePlugin {
  boot(): void {
    if (!this.scene) return;
    const factory = this.scene.add;
    const defaultTextFactory = factory.text;

    factory.text = function (
      x: number,
      y: number,
      text: string | string[],
      style?: Phaser.Types.GameObjects.Text.TextStyle
    ): Phaser.GameObjects.Text {
      return defaultTextFactory.call(this, x, y, text, {
        ...style,
        resolution: TEXT_RESOLUTION,
      });
    };
  }
}
