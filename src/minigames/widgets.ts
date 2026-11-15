import Phaser from 'phaser';

export const FONT = 'PixelifySans, monospace';

/** Texto con la fuente del juego. */
export function txt(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 11,
  color = '#ffffff',
  wrap?: number
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    ...(wrap ? { wordWrap: { width: wrap } } : {}),
  });
}

/** Botón rectangular con texto centrado. Devuelve el rectángulo (interactivo). */
export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  fill = 0xf77622,
  textColor = '#ffffff'
): { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text } {
  const bg = scene.add
    .rectangle(x, y, w, h, fill)
    .setStrokeStyle(2, 0x181425)
    .setInteractive({ useHandCursor: true });
  const t = scene.add.text(x, y, label, { fontFamily: FONT, fontSize: '12px', color: textColor }).setOrigin(0.5);
  bg.on('pointerover', () => bg.setStrokeStyle(2, 0xfee761));
  bg.on('pointerout', () => bg.setStrokeStyle(2, 0x181425));
  bg.on('pointerdown', onClick);
  return { bg, label: t };
}

/** Panel oscuro de fondo. */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(x, y, w, h, 0x262b44, 0.94).setOrigin(0, 0).setStrokeStyle(2, 0x181425);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Barra de tiempo: un marcador va y viene; hay que detenerlo dentro de la zona verde.
 * La zona se hace más angosta con la dificultad y cambia de lugar después de cada intento.
 */
export class TimingBar {
  readonly objects: Phaser.GameObjects.GameObject[] = [];
  private pos = 0;
  private dir = 1;
  private zoneStart = 0.4;
  private marker: Phaser.GameObjects.Rectangle;
  private zone: Phaser.GameObjects.Rectangle;

  constructor(
    private scene: Phaser.Scene,
    private x: number,
    y: number,
    private w: number,
    private zoneW: number,
    private speed: number,
    title?: string
  ) {
    if (title) this.objects.push(txt(scene, x + w / 2, y - 24, title, 12, '#ead4aa').setOrigin(0.5));
    this.objects.push(scene.add.rectangle(x, y, w, 22, 0x3a4466).setOrigin(0, 0.5).setStrokeStyle(2, 0x181425));
    this.zone = scene.add.rectangle(x, y, w * zoneW, 18, 0x63c74d).setOrigin(0, 0.5);
    this.marker = scene.add.rectangle(x, y, 6, 30, 0xfee761).setStrokeStyle(1, 0x181425);
    this.objects.push(this.zone, this.marker);
    this.moveZone();
  }

  moveZone(): void {
    this.zoneStart = 0.08 + Math.random() * (0.84 - this.zoneW);
    this.zone.x = this.x + this.w * this.zoneStart;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  update(dt: number): void {
    this.pos += this.dir * this.speed * dt;
    if (this.pos >= 1) {
      this.pos = 1;
      this.dir = -1;
    } else if (this.pos <= 0) {
      this.pos = 0;
      this.dir = 1;
    }
    this.marker.x = this.x + this.w * this.pos;
  }

  /** ¿El marcador está dentro de la zona? */
  hit(): boolean {
    const ok = this.pos >= this.zoneStart && this.pos <= this.zoneStart + this.zoneW;
    this.scene.tweens.add({ targets: this.marker, scaleY: 1.4, duration: 80, yoyo: true });
    return ok;
  }
}
