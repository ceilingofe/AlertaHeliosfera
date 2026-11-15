import Phaser from 'phaser';
import MG from '../../content/minigames.json';
import { gameStore } from '../state/GameState';
import { AudioSystem } from '../systems/Audio';
import { Events } from '../systems/Events';
import { MinigameBase } from './MinigameBase';
import { panel, txt } from './widgets';

const T = MG.paneles;
const COLS = 10;
const ROWS = 5;
const PX = 150;
const PY = 96;
const CELL = 34;

/**
 * Limpiar panel solar.
 * - Hay un tiempo límite (más corto con la dificultad).
 * - El viento vuelve a cubrir celdas limpias (desde dificultad 2).
 * - Hay que dejarlo al 90 % antes de que se acabe el tiempo; si no, se pierde un intento.
 * - Mouse/dedo: arrastrar. Teclado: flechas mueven la brocha, Espacio barre.
 */
export class MinijuegoPaneles extends MinigameBase {
  private dust: number[] = [];
  private dustRects: Phaser.GameObjects.Rectangle[] = [];
  private brush!: Phaser.GameObjects.Image;
  private brushing = false;
  private timeLeft = 20;
  private windTimer = 0;
  private timeFill!: Phaser.GameObjects.Rectangle;
  private cleanText!: Phaser.GameObjects.Text;

  constructor() {
    super('MinijuegoPaneles');
  }

  private totalTime(): number {
    return [22, 17, 14][this.inputData.difficulty - 1];
  }

  create(): void {
    this.drawHeader(T.title, T.steps, T.instBrush);
    this.dust = [];
    this.dustRects = [];

    this.add.rectangle(PX - 6, PY - 6, COLS * CELL + 12, ROWS * CELL + 12, 0x181425).setOrigin(0, 0);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = PX + c * CELL;
        const y = PY + r * CELL;
        this.add.rectangle(x + 1, y + 1, CELL - 2, CELL - 2, (r + c) % 2 ? 0x124e89 : 0x0099db).setOrigin(0, 0);
        this.add.rectangle(x + 3, y + 3, CELL - 10, 2, 0x2ce8f5, 0.5).setOrigin(0, 0);
        const amount = 0.6 + Math.random() * 0.4;
        this.dust.push(amount);
        this.dustRects.push(this.add.rectangle(x, y, CELL, CELL, 0xb86f50, amount).setOrigin(0, 0));
      }
    }
    this.add.rectangle(PX + 40, PY + ROWS * CELL + 6, 30, 14, 0x5a6988).setOrigin(0, 0).setStrokeStyle(2, 0x181425);
    this.add.rectangle(PX + COLS * CELL - 70, PY + ROWS * CELL + 6, 30, 14, 0x5a6988).setOrigin(0, 0).setStrokeStyle(2, 0x181425);

    const hairKey = gameStore.state.customization.hair === 2 ? 'astronaut_mini_hair2' : 'astronaut_mini_hair1';
    this.add.image(90, 220, hairKey).setScale(3);

    panel(this, 14, 76, 126, 92);
    txt(this, 24, 84, T.time, 11, '#ead4aa');
    this.add.rectangle(24, 106, 106, 10, 0x3a4466).setOrigin(0, 0.5).setStrokeStyle(1, 0x181425);
    this.timeFill = this.add.rectangle(25, 106, 104, 8, 0x63c74d).setOrigin(0, 0.5);
    txt(this, 24, 122, T.clean, 11, '#ead4aa');
    this.cleanText = txt(this, 24, 138, '0 %', 16, '#ffffff');
    if (this.inputData.difficulty >= 2) txt(this, 150, 286, T.windHint, 10, '#feae34');

    this.brush = this.add.image(PX + 170, PY + 80, 'icon_brush').setScale(3).setDepth(50);
    this.timeLeft = this.totalTime();
    this.windTimer = 2.5;

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.brushing = true;
      this.brush.setPosition(p.worldX, p.worldY);
    });
    this.input.on('pointerup', () => (this.brushing = false));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.brush.setPosition(p.worldX, p.worldY);
      if (p.isDown || this.brushing) this.brushAt(p.worldX, p.worldY, 0.08);
    });
  }

  private brushAt(x: number, y: number, amount: number): void {
    if (this.finished) return;
    let touched = false;
    for (let i = 0; i < this.dust.length; i++) {
      const cx = PX + (i % COLS) * CELL + CELL / 2;
      const cy = PY + Math.floor(i / COLS) * CELL + CELL / 2;
      if (Math.abs(cx - x) < CELL * 0.9 && Math.abs(cy - y) < CELL * 0.9 && this.dust[i] > 0) {
        this.dust[i] = Math.max(0, this.dust[i] - amount);
        this.dustRects[i].setFillStyle(0xb86f50, this.dust[i]);
        touched = true;
      }
    }
    if (touched) AudioSystem.play('brush', { volume: 0.35, pitchJitter: 0.15 });
  }

  private cleanFraction(): number {
    const clean = this.dust.filter((d) => d < 0.15).length;
    return clean / this.dust.length;
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    if (this.finished) {
      this.actionJustDown();
      return;
    }
    // Teclado: mover brocha y barrer con Espacio/E
    let vx = 0;
    let vy = 0;
    if (this.keyDown('left') || this.keyDown('a')) vx -= 1;
    if (this.keyDown('right') || this.keyDown('d')) vx += 1;
    if (this.keyDown('up') || this.keyDown('w')) vy -= 1;
    if (this.keyDown('down') || this.keyDown('s')) vy += 1;
    if (vx || vy) {
      this.brush.x = Phaser.Math.Clamp(this.brush.x + vx * 240 * dt, PX, PX + COLS * CELL);
      this.brush.y = Phaser.Math.Clamp(this.brush.y + vy * 240 * dt, PY, PY + ROWS * CELL);
    }
    if (this.actionHeld()) this.brushAt(this.brush.x, this.brush.y, 2.6 * dt);

    // Viento: vuelve a ensuciar celdas limpias
    if (this.inputData.difficulty >= 2) {
      this.windTimer -= dt;
      if (this.windTimer <= 0) {
        this.windTimer = this.inputData.difficulty === 2 ? 2.4 : 1.6;
        const n = this.inputData.difficulty;
        for (let k = 0; k < n; k++) {
          const i = Math.floor(Math.random() * this.dust.length);
          this.dust[i] = Math.min(1, this.dust[i] + 0.5);
          this.dustRects[i].setFillStyle(0xb86f50, this.dust[i]);
        }
        AudioSystem.play('whoosh', { volume: 0.25 });
      }
    }

    this.timeLeft -= dt;
    const frac = Math.max(0, this.timeLeft / this.totalTime());
    this.timeFill.width = Math.round(104 * frac);
    this.timeFill.setFillStyle(frac < 0.25 ? 0xe43b44 : frac < 0.5 ? 0xfee761 : 0x63c74d);
    const clean = this.cleanFraction();
    this.cleanText.setText(`${Math.round(clean * 100)} %`).setColor(clean >= 0.9 ? '#63c74d' : '#ffffff');

    if (clean >= 0.9) {
      Events.resolveMaintenanceEvent(gameStore.state, 'dust', this.inputData.panelId);
      this.succeed('polvo', T.success, T.source);
      return;
    }
    if (this.timeLeft <= 0) {
      if (this.addStrike(T.timeOut, T.fail)) this.timeLeft = this.totalTime() * 0.7;
    }
  }
}
