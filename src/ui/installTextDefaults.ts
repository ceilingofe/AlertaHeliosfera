import Phaser from 'phaser';

const defaultTextFactory = Phaser.GameObjects.GameObjectFactory.prototype.text;

Phaser.GameObjects.GameObjectFactory.prototype.text = function (
  this: Phaser.GameObjects.GameObjectFactory,
  x: number,
  y: number,
  text: string | string[],
  style?: Phaser.Types.GameObjects.Text.TextStyle
): Phaser.GameObjects.Text {
  // La cámara dibuja ×2 (×4 en Mundo); rasterizar el texto a esa misma escala evita
  // que el filtro "pixelArt" (vecino más cercano) se coma columnas de píxeles.
  const resolvedStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    ...style,
    resolution: this.scene.cameras?.main?.zoom ?? 2,
  };

  return defaultTextFactory.call(this, x, y, text, resolvedStyle);
};
