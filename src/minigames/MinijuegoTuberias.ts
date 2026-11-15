import Phaser from 'phaser';
import MG from '../../content/minigames.json';
import { gameStore } from '../state/GameState';
import { AudioSystem } from '../systems/Audio';
import { Events } from '../systems/Events';
import { MinigameBase } from './MinigameBase';
import { button, panel, txt } from './widgets';
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
 * 1) Conectar: el camino se genera al azar cada vez; todas las piezas empiezan giradas.
 *    Desde dificultad 2 hay tramos tapados que se destapan con 3 toques.
 * 2) En MOXIE: tras conectar el flujo, se estabiliza la celda de electrólisis SOXE
 *    alrededor de 800 °C (2 CO₂ → 2 CO + O₂) sin dejarla enfriar ni coquizar por exceso térmico.
 */
export class MinijuegoTuberias extends MinigameBase {
  private phase: 'pipes' | 'soxe' | 'done' = 'pipes';
  private stage!: Phaser.GameObjects.Container;
  private puzzle!: PipePuzzle;
  private tiles: Tile[] = [];
  private system: 'moxie_pipes' | 'antenna' = 'moxie_pipes';
  private cell = 40;
  private ox = 0;
  private oy = 0;
  private cursor = { r: 0, c: 0 };
  private cursorRect!: Phaser.GameObjects.Rectangle;

  private soxeTemp = 735;
  private soxeProgress = 0;
  private soxeHeating = false;
  private soxePulseTimer = 0;
  private soxeTempMarker!: Phaser.GameObjects.Rectangle;
  private soxeTempText!: Phaser.GameObjects.Text;
  private soxeProgressFill!: Phaser.GameObjects.Rectangle;
  private soxeCoreGlow!: Phaser.GameObjects.Arc;
  private soxeStatusText!: Phaser.GameObjects.Text;

  constructor() {
    super('MinijuegoTuberias');
  }

  create(): void {
    this.phase = 'pipes';
    this.soxeHeating = false;
    this.system = this.inputData.type === 'antenna' ? 'antenna' : 'moxie_pipes';
    const d = this.inputData.difficulty;
    const steps = this.system === 'moxie_pipes' ? T.stepsMoxie : T.steps;
    this.drawHeader(
      this.system === 'antenna' ? T.titleAntenna : T.titleMoxie,
      steps,
      d >= 2 ? `${T.instRotate} ${T.instClog}` : T.instRotate
    );
    this.stage = this.add.container(0, 0);

    const rows = d === 1 ? 4 : 5;
    const cols = d === 1 ? 5 : d === 2 ? 6 : 7;
    this.puzzle = generatePipePuzzle(rows, cols, d >= 2 ? d - 1 : 0, Math.random);
    this.cell = d === 3 ? 36 : 40;
    this.ox = Math.round(320 - (cols * this.cell) / 2);
    this.oy = 72 + Math.round((236 - rows * this.cell) / 2);
    this.tiles = [];

    this.stage.add(this.add.rectangle(this.ox - 4, this.oy - 4, cols * this.cell + 8, rows * this.cell + 8, 0x181425).setOrigin(0, 0));
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
        this.stage.add([bg, g]);
        if (clogMark) this.stage.add(clogMark);
        this.drawTile(tile, false);
      }
    }

    const inLabel = this.system === 'antenna' ? T.inAntenna : T.inMoxie;
    const outLabel = this.system === 'antenna' ? T.outAntenna : T.outMoxie;
    const inY = this.oy + this.puzzle.entryRow * this.cell + this.cell / 2;
    const outY = this.oy + this.puzzle.exitRow * this.cell + this.cell / 2;
    this.stage.add(this.add.rectangle(this.ox - 4, inY, 14, 10, 0xfee761).setOrigin(1, 0.5));
    this.stage.add(txt(this, this.ox - 20, inY, inLabel, 11, '#fee761').setOrigin(1, 0.5));
    this.stage.add(this.add.rectangle(this.ox + cols * this.cell + 4, outY, 14, 10, 0x2ce8f5).setOrigin(0, 0.5));
    this.stage.add(txt(this, this.ox + cols * this.cell + 20, outY, outLabel, 11, '#2ce8f5').setOrigin(0, 0.5));

    this.cursorRect = this.add.rectangle(0, 0, this.cell - 1, this.cell - 1).setStrokeStyle(2, 0xfee761).setDepth(6).setVisible(false);
    this.stage.add(this.cursorRect);

    const b = button(this, 320, 330, 180, 30, T.testButton, () => this.test(), 0x63c74d, '#181425');
    this.stage.add([b.bg, b.label]);
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
      [-5, -half, 10, half],
      [0, -5, half, 10],
      [-5, 0, 10, half],
      [-half, -5, half, 10],
    ];
    arms.forEach((a, i) => {
      if (t.mask & (1 << i)) {
        g.fillStyle(0x181425).fillRect(a[0] - 1, a[1] - 1, a[2] + 2, a[3] + 2);
        g.fillStyle(color).fillRect(a[0], a[1], a[2], a[3]);
      }
    });
  }

  private tap(t: Tile): void {
    if (this.phase !== 'pipes' || this.finished) return;
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
    if (this.phase !== 'pipes' || this.finished) return;
    const flow = traceFlow(this.puzzle);
    for (const t of this.tiles) this.drawTile(t, flow.reached.has(t.r * this.puzzle.cols + t.c));
    if (flow.ok) {
      AudioSystem.play('valve_loop', { volume: 0.5 });
      if (this.system === 'antenna') {
        this.setActiveStep(1);
        Events.resolveMaintenanceEvent(gameStore.state, this.system);
        this.succeed('luz', T.successAntenna, T.sourceAntenna);
      } else {
        this.time.delayedCall(280, () => {
          if (!this.finished) this.buildSoxeStage();
        });
      }
    } else {
      AudioSystem.play('o2_hiss', { volume: 0.6 });
      this.addStrike(T.leak, this.system === 'antenna' ? T.failAntenna : T.failMoxie);
    }
  }

  // ------------------------------------------------------------------ 2. Electrólisis SOXE real (800 °C)

  private buildSoxeStage(): void {
    this.phase = 'soxe';
    this.setActiveStep(1);
    this.setInstruction(T.soxeInst);
    this.stage.removeAll(true);
    this.tiles = [];
    this.soxeTemp = 730;
    this.soxeProgress = 0;
    this.soxeHeating = false;
    this.soxePulseTimer = 1.6;

    // Izquierda: cámara de reactor SOXE + flujo a tubo O₂
    this.stage.add(panel(this, 18, 76, 176, 224));
    this.stage.add(this.add.image(106, 146, 'moxie').setScale(4));
    this.soxeCoreGlow = this.add.circle(106, 146, 28, 0xf77622, 0.25);
    this.stage.add(this.soxeCoreGlow);
    if (this.textures.exists('tube_sample')) {
      this.stage.add(this.add.image(106, 224, 'tube_sample').setScale(2.5).setTint(0x2ce8f5));
    }
    this.stage.add(txt(this, 106, 272, '2 CO₂ → 2 CO + O₂', 11, '#2ce8f5').setOrigin(0.5));

    // Derecha: control térmico del reactor (680 °C a 900 °C, zona segura 775–825 °C)
    this.stage.add(panel(this, 208, 76, 414, 224));
    this.stage.add(txt(this, 224, 86, T.soxeTitle, 11, '#fee761'));
    this.stage.add(txt(this, 224, 108, T.soxeTempLabel, 11, '#ead4aa'));

    const barX = 224;
    const barY = 138;
    const barW = 376;
    const fracOf = (c: number): number => Phaser.Math.Clamp((c - 680) / (900 - 680), 0, 1);

    this.stage.add(this.add.rectangle(barX, barY, barW, 20, 0x3a4466).setOrigin(0, 0.5).setStrokeStyle(2, 0x181425));
    // Zona verde segura 775..825 °C
    const zStart = fracOf(775);
    const zEnd = fracOf(825);
    this.stage.add(
      this.add.rectangle(barX + barW * zStart, barY, barW * (zEnd - zStart), 16, 0x63c74d).setOrigin(0, 0.5)
    );
    // Zona roja de coquización > 860 °C
    const hotStart = fracOf(860);
    this.stage.add(
      this.add.rectangle(barX + barW * hotStart, barY, barW * (1 - hotStart), 16, 0xa22633).setOrigin(0, 0.5)
    );
    this.soxeTempMarker = this.add.rectangle(barX + barW * fracOf(this.soxeTemp), barY, 6, 28, 0xfee761).setStrokeStyle(1, 0x181425);
    this.stage.add(this.soxeTempMarker);
    this.soxeTempText = txt(this, 600, 108, '730 °C', 13, '#ffffff').setOrigin(1, 0);
    this.stage.add(this.soxeTempText);

    // Barra de producción de oxígeno
    this.stage.add(txt(this, 224, 174, T.soxeFlowLabel, 11, '#ead4aa'));
    this.stage.add(this.add.rectangle(barX, 200, barW, 16, 0x3a4466).setOrigin(0, 0.5).setStrokeStyle(2, 0x181425));
    this.soxeProgressFill = this.add.rectangle(barX + 2, 200, 0, 12, 0x2ce8f5).setOrigin(0, 0.5);
    this.stage.add(this.soxeProgressFill);

    this.soxeStatusText = txt(this, 224, 218, '', 10, '#feae34', 376);
    this.stage.add(this.soxeStatusText);

    const heatBtn = button(this, 415, 266, 270, 34, T.soxeButton, () => (this.soxeHeating = true));
    heatBtn.bg.on('pointerup', () => (this.soxeHeating = false));
    heatBtn.bg.on('pointerout', () => (this.soxeHeating = false));
    this.input.on('pointerup', () => (this.soxeHeating = false));
    this.stage.add([heatBtn.bg, heatBtn.label]);
  }

  private updateSoxe(dt: number): void {
    const d = this.inputData.difficulty;
    const heating = this.soxeHeating || this.actionHeld();
    if (heating) {
      this.soxeTemp += (64 + d * 8) * dt;
      AudioSystem.startLoop('minigame', 'valve_loop', 0.45);
    } else {
      this.soxeTemp -= (38 + d * 6) * dt;
      AudioSystem.stopLoop('minigame');
    }

    // Pequeñas variaciones por ráfagas de compresión de CO₂
    this.soxePulseTimer -= dt;
    if (this.soxePulseTimer <= 0) {
      this.soxePulseTimer = 1.8 - d * 0.25 + Math.random() * 1.1;
      this.soxeTemp += (Math.random() < 0.5 ? -1 : 1) * (10 + d * 5);
    }
    this.soxeTemp = Phaser.Math.Clamp(this.soxeTemp, 680, 900);

    const frac = Phaser.Math.Clamp((this.soxeTemp - 680) / (900 - 680), 0, 1);
    this.soxeTempMarker.x = 224 + 376 * frac;
    this.soxeTempText.setText(`${Math.round(this.soxeTemp)} °C`);

    const inIdeal = this.soxeTemp >= 775 && this.soxeTemp <= 825;
    if (inIdeal) {
      this.soxeProgress = Math.min(1, this.soxeProgress + dt / (3.4 + d * 0.6));
      this.soxeStatusText.setText('✓ 800 °C óptimo · produciendo O₂').setColor('#63c74d');
      this.soxeTempText.setColor('#63c74d');
      this.soxeCoreGlow.setFillStyle(0x2ce8f5, 0.38);
    } else if (this.soxeTemp > 860) {
      this.soxeProgress = Math.max(0, this.soxeProgress - dt * 0.15);
      this.soxeStatusText.setText(T.soxeTooHot).setColor('#e43b44');
      this.soxeTempText.setColor('#e43b44');
      this.soxeCoreGlow.setFillStyle(0xe43b44, 0.45);
    } else if (this.soxeTemp < 760) {
      this.soxeStatusText.setText(T.soxeTooCold).setColor('#feae34');
      this.soxeTempText.setColor('#c0cbdc');
      this.soxeCoreGlow.setFillStyle(0xf77622, 0.15);
    } else {
      this.soxeProgress = Math.min(1, this.soxeProgress + dt * 0.08);
      this.soxeStatusText.setText('').setColor('#feae34');
      this.soxeTempText.setColor('#fee761');
      this.soxeCoreGlow.setFillStyle(0xfee761, 0.25);
    }

    this.soxeProgressFill.width = Math.round(372 * this.soxeProgress);

    if (this.soxeTemp >= 895) {
      this.soxeHeating = false;
      this.soxeTemp = 760;
      AudioSystem.stopLoop('minigame');
      AudioSystem.play('overheat');
      this.addStrike(T.soxeOverheatFail, T.failMoxie);
      return;
    }

    if (this.soxeProgress >= 1) {
      this.phase = 'done';
      this.soxeHeating = false;
      AudioSystem.stopLoop('minigame');
      Events.resolveMaintenanceEvent(gameStore.state, this.system);
      this.succeed('moxie', T.successMoxie, T.sourceMoxie);
    }
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    if (this.finished) {
      this.actionJustDown();
      return;
    }
    if (this.phase === 'soxe') {
      this.updateSoxe(dt);
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
