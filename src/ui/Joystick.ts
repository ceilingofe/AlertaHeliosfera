import Phaser from 'phaser';
import VirtualJoyStick from 'phaser3-rex-plugins/plugins/virtualjoystick.js';
import uiText from '../../content/ui_text.json';
import { bus } from '../state/bus';

export interface JoystickVector {
  x: number;
  y: number;
}

let activeControls: TouchControls | null = null;

export function getSharedJoystickVector(): JoystickVector {
  if (!activeControls) {
    return { x: 0, y: 0 };
  }
  return activeControls.getVector();
}

/**
 * Control táctil con VirtualJoystick (phaser3-rex-plugins) encima del panel del astronauta
 * a la izquierda y botón de acción abajo a la derecha. Funciona con dedo y con ratón.
 */
export class TouchControls {
  private joyStick: VirtualJoyStick;
  private actionBg: Phaser.GameObjects.Arc;
  private actionText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x = 44, y = 238, actionX = 598, actionY = 316) {
    const base = scene.add.circle(0, 0, 26, 0x262b44, 0.78).setStrokeStyle(2, 0x181425);
    const thumb = scene.add.circle(0, 0, 12, 0xfee761, 0.92).setStrokeStyle(2, 0x181425);

    this.joyStick = new VirtualJoyStick(scene, {
      x,
      y,
      radius: 24,
      base,
      thumb,
      dir: '8dir',
      forceMin: 6,
      fixed: true,
      enable: true,
    });

    this.actionBg = scene.add
      .circle(actionX, actionY, 20, 0xf77622, 0.88)
      .setStrokeStyle(2, 0x181425)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    this.actionText = scene.add
      .text(actionX, actionY, uiText.hud.actionButton, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.actionBg.on('pointerdown', () => {
      this.actionBg.setFillStyle(0xfee761, 1);
      bus.emit('input:action');
    });

    this.actionBg.on('pointerup', () => {
      this.actionBg.setFillStyle(0xf77622, 0.88);
    });

    this.actionBg.on('pointerout', () => {
      this.actionBg.setFillStyle(0xf77622, 0.88);
    });

    // The singleton is used by scenes to read the currently mounted controls.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    activeControls = this;
  }

  getVector(): JoystickVector {
    let vx = 0;
    let vy = 0;
    if (this.joyStick.left) vx -= 1;
    if (this.joyStick.right) vx += 1;
    if (this.joyStick.up) vy -= 1;
    if (this.joyStick.down) vy += 1;
    return { x: vx, y: vy };
  }

  destroy(): void {
    if (activeControls === this) {
      activeControls = null;
    }
    this.joyStick.destroy();
    this.actionBg.destroy();
    this.actionText.destroy();
  }
}
