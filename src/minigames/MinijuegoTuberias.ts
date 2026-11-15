import Phaser from 'phaser';
import MG from '../../content/minigames.json';
import { gameStore } from '../state/GameState';
import { AudioSystem } from '../systems/Audio';
import { Events } from '../systems/Events';
import { MinigameBase } from './MinigameBase';
import { button, txt } from './widgets';
import { generatePipePuzzle, rotateMask, traceFlow, type PipePuzzle } from './pipePuzzle';

const T = MG.tuberias;

interface Tile {
  r: number;
  c: number;
  mask: number;
  clog: number;
  bg: Phaser.GameObjects.Rectangle;
  g: Phaser.GameObjects.Graphics;
  clogMark: Phaser.GameObjects.Text | null;
}

/**
 * Tuberías de MOXIE / circuito de la antena.
 * El camino se genera al azar cada vez; todas las piezas empiezan giradas.
 * No hay pistas de qué pieza es la buena: hay que pensar el recorrido y luego PROBAR.
 * Probar con una fuga cuesta un intento, pero enseña hasta dónde llegó el flujo.
 * Desde dificultad 2 hay tramos tapados que se destapan con 3 toques.
 */
export class MinijuegoTuberias extends MinigameBase {
  private puzzle!: PipePuzzle;
  private tiles: Tile[] = [];
  private system: 'moxie_pipes' | 'antenna' = 'moxie_pipes';
  private cell = 40;
  private ox = 0;
  private oy = 0;
  private cursor = { r: 0, c: 0 };
  private cursorRect!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('MinijuegoTuberias');
  }

  create(): void {
    this.system = this.inputData.type === 'antenna' ? 'antenna' : 'moxie_pipes';
    const d = this.inputData.difficulty;
    this.drawHeader(
      this.system === 'antenna' ? T.titleAntenna : T.titleMoxie,
      T.steps,
      d >= 2 ? `${T.instRotate} ${T.instClog}` : T.instRotate
    );

    const rows = d === 1 ? 4 : 5;
    const cols = d === 1 ? 5 : d === 2 ? 6 : 7;
    this.puzzle = generatePipePuzzle(rows, cols, d >= 2 ? d - 1 : 0, Math.random);
    this.cell = d === 3 ? 36 : 40;
    this.ox = Math.round(320 - (cols * this.cell) / 2);
    this.oy = 72 + Math.round((236 - rows * this.cell) / 2);
    this.tiles = [];

    this.add.rectangle(this.ox - 4, this.oy - 4, cols * this.cell + 8, rows * this.cell + 8, 0x181425).setOrigin(0, 0);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = this.ox + c * this.cell + this.cell / 2;
        const y = this.oy + r * this.cell + this.cell / 2;
        const bg = this.add.rectangle(x, y, this.cell - 3, this.cell - 3, 0x3a4466).setStrokeStyle(1, 0x262b44).setInteractive({ useHandCursor: true });
        const g = this.add.graphics({ x, y });
        const clog = this.puzzle.clogged.has(r * cols + c) ? 3 : 0;
        const clogMark = clog ? txt(this, x, y, '✕', 16, '#feae34').setOrigin(0.5).setDepth(5) : null;
        const tile: Tile = { r, c, mask: this.puzzle.masks[r * cols + c], clog, bg, g, clogMark };
        bg.on('pointerdown', () => {
          this.cursor = { r, c };
          this.tap(tile);
        });
        this.tiles.push(tile);
        this.drawTile(tile, false);
      }
    }

    const inLabel = this.system === 'antenna' ? T.inAntenna : T.inMoxie;
    const outLabel = this.system === 'antenna' ? T.outAntenna : T.outMoxie;
    const inY = this.oy + this.puzzle.entryRow * this.cell + this.cell / 2;
    const outY = this.oy + this.puzzle.exitRow * this.cell + this.cell / 2;
    this.add.rectangle(this.ox - 4, inY, 14, 10, 0xfee761).setOrigin(1, 0.5);
    txt(this, this.ox - 20, inY, inLabel, 11, '#fee761').setOrigin(1, 0.5);
    this.add.rectangle(this.ox + cols * this.cell + 4, outY, 14, 10, 0x2ce8f5).setOrigin(0, 0.5);
    txt(this, this.ox + cols * this.cell + 20, outY, outLabel, 11, '#2ce8f5').setOrigin(0, 0.5);

    this.cursorRect = this.add.rectangle(0, 0, this.cell - 1, this.cell - 1).setStrokeStyle(2, 0xfee761).setDepth(6).setVisible(false);

    const b = button(this, 320, 330, 180, 30, T.testButton, () => this.test(), 0x63c74d, '#181425');
    void b;
  }

  private drawTile(t: Tile, flowing: boolean): void {
    const g = t.g;
    g.clear();
    const half = this.cell / 2 - 2;
    const color = flowing ? 0x2ce8f5 : t.clog ? 0x733e39 : 0xc0cbdc;
    g.fillStyle(0x181425);
    g.fillRect(-7, -7, 14, 14);
    g.fillStyle(color);
    g.fillRect(-5, -5, 10, 10);
    const arms: [number, number, number, number][] = [
      [-5, -half, 10, half], // N
      [0, -5, half, 10], // E
      [-5, 0, 10, half], // S
      [-half, -5, half, 10], // W
    ];
    arms.forEach((a, i) => {
      if (t.mask & (1 << i)) {
        g.fillStyle(0x181425).fillRect(a[0] - 1, a[1] - 1, a[2] + 2, a[3] + 2);
        g.fillStyle(color).fillRect(a[0], a[1], a[2], a[3]);
      }
    });
  }

  private tap(t: Tile): void {
    if (this.finished) return;
    if (t.clog > 0) {
      t.clog -= 1;
      AudioSystem.play('clank', { volume: 0.5, pitchJitter: 0.2 });
      this.tweens.add({ targets: [t.g, t.bg], x: '+=3', duration: 40, yoyo: true });
      if (t.clog === 0) {
        t.clogMark?.destroy();
        t.clogMark = null;
        this.puzzle.clogged.delete(t.r * this.puzzle.cols + t.c);
      } else {
        this.setInstruction(T.clogged, '#feae34');
      }
      this.drawTile(t, false);
      return;
    }
    t.mask = rotateMask(t.mask);
    this.puzzle.masks[t.r * this.puzzle.cols + t.c] = t.mask;
    AudioSystem.play('ui_switch', { volume: 0.4 });
    for (const tile of this.tiles) this.drawTile(tile, false);
  }

  private test(): void {
    if (this.finished) return;
    const flow = traceFlow(this.puzzle);
    for (const t of this.tiles) this.drawTile(t, flow.reached.has(t.r * this.puzzle.cols + t.c));
    if (flow.ok) {
      this.setActiveStep(1);
      AudioSystem.play('valve_loop', { volume: 0.5 });
      Events.resolveMaintenanceEvent(gameStore.state, this.system);
      if (this.system === 'antenna') this.succeed('luz', T.successAntenna, T.sourceAntenna);
      else this.succeed('moxie', T.successMoxie, T.sourceMoxie);
    } else {
      AudioSystem.play('o2_hiss', { volume: 0.6 });
      this.addStrike(T.leak, this.system === 'antenna' ? T.failAntenna : T.failMoxie);
    }
  }

  update(): void {
    if (this.finished) {
      this.actionJustDown();
      return;
    }
    const { rows, cols } = this.puzzle;
    let moved = false;
    if (this.keyJustDown('left') || this.keyJustDown('a')) (this.cursor.c = Math.max(0, this.cursor.c - 1)), (moved = true);
    if (this.keyJustDown('right') || this.keyJustDown('d')) (this.cursor.c = Math.min(cols - 1, this.cursor.c + 1)), (moved = true);
    if (this.keyJustDown('up') || this.keyJustDown('w')) (this.cursor.r = Math.max(0, this.cursor.r - 1)), (moved = true);
    if (this.keyJustDown('down') || this.keyJustDown('s')) (this.cursor.r = Math.min(rows - 1, this.cursor.r + 1)), (moved = true);
    if (moved) this.cursorRect.setVisible(true);
    this.cursorRect.setPosition(this.ox + this.cursor.c * this.cell + this.cell / 2, this.oy + this.cursor.r * this.cell + this.cell / 2);
    if (this.actionJustDown()) {
      this.cursorRect.setVisible(true);
      const t = this.tiles[this.cursor.r * cols + this.cursor.c];
      if (t) this.tap(t);
    }
    if (this.pJustDown()) this.test();
  }
}
