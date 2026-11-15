import Phaser from 'phaser';

const defaultTextFactory = Phaser.GameObjects.GameObjectFactory.prototype.text;

Phaser.GameObjects.GameObjectFactory.prototype.text = function (
  this: Phaser.GameObjects.GameObjectFactory,
  x: number,
  y: number,
  text: string | string[],
  style?: Phaser.Types.GameObjects.Text.TextStyle
): Phaser.GameObjects.Text {
  // Rasterizar el texto a alta resolución (mínimo ×4) y con filtrado suave en su textura
  // evita que el modo pixelArt se coma trazos horizontales y confunda la 'S' con '2' o '5'.
  const camZoom = this.scene.cameras?.main?.zoom ?? 2;
  const resolvedStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    ...style,
    resolution: Math.max(4, camZoom * 2),
  };

  const txtObj = defaultTextFactory.call(this, x, y, text, resolvedStyle);
  txtObj.texture?.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return txtObj;
};

