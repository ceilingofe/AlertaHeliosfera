import Phaser from 'phaser';

export interface PlayerMotionState {
  originY: number;
  bobTime: number;
}

export function updatePlayerMotion(
  player: Phaser.Physics.Arcade.Sprite,
  motion: PlayerMotionState,
  vx: number,
  vy: number,
  delta: number,
  speed: number
): boolean {
  const moving = vx !== 0 || vy !== 0;
  if (moving) {
    const length = Math.hypot(vx, vy);
    player.setVelocity((vx / length) * speed, (vy / length) * speed);
    if (vx < 0) player.setFlipX(true);
    else if (vx > 0) player.setFlipX(false);

    motion.bobTime += delta;
    const bob = Math.sin(motion.bobTime * 0.018) * 0.8;
    player.setDisplayOrigin(player.displayOriginX, motion.originY + bob);
  } else {
    player.setVelocity(0, 0);
    motion.bobTime = 0;
    player.setDisplayOrigin(player.displayOriginX, motion.originY);
  }

  return moving;
}

export function resetPlayerMotion(
  player: Phaser.Physics.Arcade.Sprite,
  motion: PlayerMotionState
): void {
  player.setVelocity(0, 0);
  motion.bobTime = 0;
  player.setDisplayOrigin(player.displayOriginX, motion.originY);
}
