import Phaser from 'phaser';
import MG from '../../content/minigames.json';
import { AudioSystem } from '../systems/Audio';
import { MinigameBase } from './MinigameBase';
import { TimingBar, button, panel, shuffle, txt } from './widgets';

type Phase = 'tool' | 'extract' | 'seal' | 'done';
type Objective = 'organicos' | 'agua' | 'elementos';
type Tool = 'sherloc' | 'supercam' | 'pixl';

const T = MG.minerales;
const CORRECT: Record<Objective, Tool> = { organicos: 'sherloc', agua: 'supercam', elementos: 'pixl' };
const TOOL_COLOR: Record<Tool, number> = { sherloc: 0xb55088, supercam: 0xe43b44, pixl: 0x2ce8f5 };

interface Node {
  n: number;
  circle: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  done: boolean;
}

/**
 * Análisis de veta con los instrumentos reales de Perseverance.
 * 1) Elegir instrumento según un objetivo al azar (SHERLOC, SuperCam o PIXL).
 * 2) Extraer: tocar los puntos de la veta en orden antes de que se acabe la batería
 *    (en dificultad 3 los números se apagan: hay que memorizar).
 * 3) Sellar con barra de tiempo.
 */
export class MinijuegoMinerales extends MinigameBase {
  private phase: Phase = 'tool';
  private stage!: Phaser.GameObjects.Container;
  private objective: Objective = 'agua';
  private tool: Tool = 'supercam';
  private nodes: Node[] = [];
  private nextNode = 1;
  private battery = 100;
  private batteryFill!: Phaser.GameObjects.Rectangle;
  private bar: TimingBar | null = null;

  constructor() {
    super('MinijuegoMinerales');
  }

  create(): void {
    this.objective = shuffle<Objective>(['organicos', 'agua', 'elementos'])[0];
    this.drawHeader(T.title, T.steps, T.instTool);
    this.stage = this.add.container(0, 0);
    this.buildTool();
  }

  private drawRock(): void {
    this.stage.add(this.add.image(170, 186, 'rock_sparkle').setScale(11));
    // Veta clara a través de la roca
    const g = this.add.graphics();
    g.lineStyle(5, 0xead4aa, 0.85);
    g.beginPath();
    g.moveTo(90, 140);
    g.lineTo(140, 170);
    g.lineTo(180, 165);
    g.lineTo(220, 205);
    g.lineTo(255, 225);
    g.strokePath();
    this.stage.add(g);
  }

  // ------------------------------------------------------------------ 1. instrumento

  private buildTool(): void {
    this.phase = 'tool';
    this.setActiveStep(0);
    this.stage.removeAll(true);
    this.drawRock();
    this.stage.add(panel(this, 320, 70, 306, 50));
    this.stage.add(txt(this, 332, 78, T.objectives[this.objective], 12, '#fee761', 284));

    (['sherloc', 'supercam', 'pixl'] as Tool[]).forEach((tool, i) => {
      const y = 148 + i * 58;
      const b = button(this, 473, y, 306, 50, '', () => this.pickTool(tool), 0x3a4466);
      this.stage.add([b.bg, b.label]);
      this.stage.add(this.add.rectangle(334, y, 12, 30, TOOL_COLOR[tool]).setStrokeStyle(1, 0x181425));
      this.stage.add(txt(this, 348, y - 18, T.tools[tool].name, 13, '#ffffff'));
      this.stage.add(txt(this, 348, y, T.tools[tool].desc, 10, '#c0cbdc', 270));
    });
  }

  private pickTool(tool: Tool): void {
    if (this.phase !== 'tool' || this.finished) return;
    AudioSystem.play('scan_beep');
    if (tool !== CORRECT[this.objective]) {
      this.addStrike(T.wrongTool, T.fail);
      return;
    }
    this.tool = tool;
    this.buildExtract();
  }

  // ------------------------------------------------------------------ 2. extraer

  private buildExtract(): void {
    this.phase = 'extract';
    this.setActiveStep(1);
    const d = this.inputData.difficulty;
    this.setInstruction(d >= 3 ? `${T.instExtract} ${T.instExtractMemory}` : T.instExtract);
    this.stage.removeAll(true);
    this.drawRock();

    this.stage.add(panel(this, 340, 76, 286, 52));
    this.stage.add(txt(this, 352, 84, T.battery, 11, '#ead4aa'));
    this.stage.add(this.add.rectangle(352, 110, 260, 12, 0x3a4466).setOrigin(0, 0.5).setStrokeStyle(2, 0x181425));
    this.batteryFill = this.add.rectangle(354, 110, 256, 8, 0x63c74d).setOrigin(0, 0.5);
    this.stage.add(this.batteryFill);

    this.layoutNodes();
  }

  private layoutNodes(): void {
    for (const n of this.nodes) {
      n.circle.destroy();
      n.label.destroy();
    }
    this.clearCursorTargets();
    this.nodes = [];
    this.nextNode = 1;
    this.battery = 100;
    const d = this.inputData.difficulty;
    const count = 3 + d;
    const pts: { x: number; y: number }[] = [];
    let guard = 0;
    while (pts.length < count && guard < 300) {
      guard++;
      const x = 70 + Math.random() * 520;
      const y = 150 + Math.random() * 120;
      if (x > 330 && y < 140) continue;
      if (pts.some((p) => Math.hypot(p.x - x, p.y - y) < 46)) continue;
      pts.push({ x, y });
    }
    pts.forEach((p, i) => {
      const circle = this.add.circle(p.x, p.y, 14, TOOL_COLOR[this.tool], 0.85).setStrokeStyle(2, 0xffffff).setInteractive({ useHandCursor: true });
      const label = txt(this, p.x, p.y, String(i + 1), 13, '#181425').setOrigin(0.5);
      const node: Node = { n: i + 1, circle, label, done: false };
      const tap = (): void => this.tapNode(node);
      circle.on('pointerdown', tap);
      this.addCursorTarget(circle, tap);
      this.nodes.push(node);
      this.stage.add([circle, label]);
      this.tweens.add({ targets: circle, scale: 1.12, duration: 500 + i * 60, yoyo: true, repeat: -1 });
    });
    if (d >= 3) {
      this.time.delayedCall(1800, () => {
        for (const n of this.nodes) if (!n.done) n.label.setVisible(false);
      });
    }
  }

  private tapNode(node: Node): void {
    if (this.phase !== 'extract' || this.finished || node.done) return;
    if (node.n === this.nextNode) {
      node.done = true;
      node.circle.setFillStyle(0x63c74d).disableInteractive();
      node.label.setVisible(true).setText('✓');
      AudioSystem.play('ui_tick', { rate: 1 + node.n * 0.08 });
      this.nextNode += 1;
      if (this.nextNode > this.nodes.length) this.buildSeal();
    } else {
      this.battery = Math.max(0, this.battery - 18);
      this.addStrike(T.wrongNode, T.fail);
    }
  }

  private updateExtract(dt: number): void {
    this.updateKeyboardCursor(dt);
    if (this.actionJustDown()) this.pickWithReticle();
    const drain = 7 + this.inputData.difficulty * 3;
    this.battery = Math.max(0, this.battery - drain * dt);
    this.batteryFill.width = Math.round((256 * this.battery) / 100);
    this.batteryFill.setFillStyle(this.battery < 25 ? 0xe43b44 : this.battery < 50 ? 0xfee761 : 0x63c74d);
    if (this.battery <= 0) {
      if (this.addStrike(T.batteryOut, T.fail)) this.layoutNodes();
    }
  }

  // ------------------------------------------------------------------ 3. sellar

  private buildSeal(): void {
    this.phase = 'seal';
    this.clearCursorTargets();
    this.setActiveStep(2);
    this.setInstruction(T.instSeal);
    this.stage.removeAll(true);
    this.nodes = [];
    const d = this.inputData.difficulty;
    const tubeKey = this.textures.exists('tube_sample') ? 'tube_sample' : 'tube_full';
    this.stage.add(
      this.add.image(112, 180, tubeKey).setScale(tubeKey === 'tube_sample' ? 4 : 8).setTint(TOOL_COLOR[this.tool])
    );
    if (this.textures.exists('flask_blue')) {
      this.stage.add(this.add.image(174, 194, 'flask_blue').setScale(3.2));
    }
    this.stage.add(panel(this, 236, 110, 380, 130));
    this.bar = new TimingBar(this, 256, 176, 340, d === 1 ? 0.26 : d === 2 ? 0.19 : 0.14, 0.8 + d * 0.15, T.sealTitle);
    this.stage.add(this.bar.objects);
    const b = button(this, 426, 290, 200, 36, T.sealButton, () => this.trySeal(), 0x63c74d, '#181425');
    this.stage.add([b.bg, b.label]);
  }

  private trySeal(): void {
    if (this.phase !== 'seal' || this.finished || !this.bar) return;
    if (this.bar.hit()) {
      this.phase = 'done';
      this.succeed('agua_rocas', T.success, T.source);
    } else {
      this.bar.moveZone();
      this.addStrike(T.sealMiss, T.fail);
    }
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    if (this.finished) {
      this.actionJustDown();
      return;
    }
    if (this.phase === 'tool') {
      const tools: Tool[] = ['sherloc', 'supercam', 'pixl'];
      for (let i = 0; i < 3; i++) if (this.numberJustDown(i + 1)) this.pickTool(tools[i]);
    } else if (this.phase === 'extract') {
      this.updateExtract(dt);
    } else if (this.phase === 'seal') {
      this.bar?.update(dt);
      if (this.actionJustDown()) this.trySeal();
    }
  }
}
