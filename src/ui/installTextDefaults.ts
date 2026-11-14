import Phaser from 'phaser';

const defaultTextFactory = Phaser.GameObjects.GameObjectFactory.prototype.text;

Phaser.GameObjects.GameObjectFactory.prototype.text = function (
  this: Phaser.GameObjects.GameObjectFactory,
  x: number,
  y: number,
  text: string | string[],
  style?: Phaser.Types.GameObjects.Text.TextStyle
): Phaser.GameObjects.Text {
  const resolvedStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    ...style,
    resolution: 4,
  };

  return defaultTextFactory.call(this, x, y, text, resolvedStyle);
};
