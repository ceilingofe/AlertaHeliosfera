import Phaser from 'phaser';
import type { CharacterFacing, CharacterId, SuitColor } from '../types';
import { AstronautAppearance } from '../ui/AstronautAppearance';
import { getSharedJoystickVector } from '../ui/Joystick';
import {
  resetPlayerMotion,
  updatePlayerMotion,
  type PlayerMotionState,
} from './PlayerMotion';

export interface PlayerControllerConfig {
  scene: Phaser.Scene;
  player: Phaser.Physics.Arcade.Sprite;
  speed: number;
  character: CharacterId;
  suit: SuitColor;
  onInteract: () => void;
  onAction: () => void;
  onPause: () => void;
}

/**
 * Movimiento, orientación y teclas compartidas por Mundo y Base. Cada escena
 * conserva sus propias reglas de interacción mediante callbacks.
 */
export class PlayerController {
  private readonly cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly keyW?: Phaser.Input.Keyboard.Key;
  private readonly keyA?: Phaser.Input.Keyboard.Key;
  private readonly keyS?: Phaser.Input.Keyboard.Key;
  private readonly keyD?: Phaser.Input.Keyboard.Key;
  private readonly motion: PlayerMotionState;
  private facing: CharacterFacing = 'down';

  constructor(private readonly config: PlayerControllerConfig) {
    this.motion = {
      originY: config.player.displayOriginY,
      bobTime: 0,
    };

    const keyboard = config.scene.input.keyboard;
    if (keyboard) {
      this.cursors = keyboard.createCursorKeys();
      this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyS = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E).on('down', config.onInteract);
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE).on('down', config.onAction);
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', config.onPause);
    }
  }

  /** Detiene al personaje sin cambiar su orientación (pausa o minijuego). */
  stop(): void {
    resetPlayerMotion(this.config.player, this.motion);
  }

  /** Aplica entrada y movimiento; devuelve true si el personaje se movió. */
  update(delta: number): boolean {
    const { x: vx, y: vy } = this.readInput();
    const moving = updatePlayerMotion(
      this.config.player,
      this.motion,
      vx,
      vy,
      delta,
      this.config.speed
    );

    if (moving) {
      this.facing = AstronautAppearance.getFacing(vx, vy, this.facing);
      AstronautAppearance.syncPlayerSprite(
        this.config.scene,
        this.config.player,
        this.config.character,
        this.config.suit,
        this.facing
      );
    }

    return moving;
  }

  private readInput(): { x: number; y: number } {
    let vx = 0;
    let vy = 0;

    if (this.cursors) {
      if (this.cursors.left.isDown || this.keyA?.isDown) vx -= 1;
      if (this.cursors.right.isDown || this.keyD?.isDown) vx += 1;
      if (this.cursors.up.isDown || this.keyW?.isDown) vy -= 1;
      if (this.cursors.down.isDown || this.keyS?.isDown) vy += 1;
    }

    const joy = getSharedJoystickVector();
    if (vx === 0 && vy === 0) {
      vx = joy.x;
      vy = joy.y;
    }

    return { x: vx, y: vy };
  }
}
