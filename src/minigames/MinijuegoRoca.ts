import Phaser from 'phaser';
import MG from '../../content/minigames.json';
import { AudioSystem } from '../systems/Audio';
import { MinigameBase } from './MinigameBase';
import { TimingBar, button, panel, shuffle, txt } from './widgets';

type RockKind = 'leopard' | 'sandstone' | 'volcanic' | 'sparkle';
type Phase = 'scan' | 'drill' | 'seal' | 'done';

interface RockSlot {
  kind: RockKind;
  img: Phaser.GameObjects.Image;
  scan: number; // 0..1
  read: Phaser.GameObjects.Text;
  frame: Phaser.GameObjects.Rectangle;
}

const T = MG.roca;
const TEX: Record<RockKind, string> = {
  leopard: 'rock_leopard',
  sandstone: 'rock_sandstone',
  volcanic: 'rock_volcanic',
  sparkle: 'rock_sparkle',
};

/**
 * Núcleo de roca.
 * 1) Escanear: las rocas están cubiertas de polvo; hay que pasar el escáner para leerlas.
 *    Sólo la sedimentaria con capas responde la pregunta científica. Elegir mal = error.
 * 2) Perforar: hay capas duras al azar que calientan la broca. Pasarse = error y retroceso.
 * 3) Sellar: barra de tiempo con zona angosta que cambia de lugar (2 sellos en dificultad 3).
 */
export class MinijuegoRoca extends MinigameBase {
  private phase: Phase = 'scan';
  private stage!: Phaser.GameObjects.Container;
  private rocks: RockSlot[] = [];
  private selected: RockSlot | null = null;
  private scanner!: Phaser.GameObjects.Container;

  private drilling = false;
  private depth = 0;
  private heat = 0;
  private safeDepth = 0;
  private hardLayers: { from: number; to: number }[] = [];
  private depthFill!: Phaser.GameObjects.Rectangle;
  private heatFill!: Phaser.GameObjects.Rectangle;
  private bit!: Phaser.GameObjects.Rectangle;
  private drillStatus!: Phaser.GameObjects.Text;

  private bar: TimingBar | null = null;
  private sealsNeeded = 1;
  private sealsDone = 0;
  private sealStatus!: Phaser.GameObjects.Text;

  constructor() {
    super('MinijuegoRoca');
  }

  create(): void {
    this.phase = 'scan';
    this.rocks = [];
    this.selected = null;
    this.drawHeader(T.title, T.steps, T.instScan);
    this.stage = this.add.container(0, 0);
    this.buildScan();
  }

  // ------------------------------------------------------------------ 1. escanear

  private buildScan(): void {
    this.phase = 'scan';
    this.setActiveStep(0);
    this.stage.removeAll(true);
    this.stage.add(txt(this, 14, 72, T.objective, 11, '#fee761', 612));

    const d = this.inputData.difficulty;
    const distractors = shuffle<RockKind>(['sandstone', 'volcanic', 'sparkle']).slice(0, d === 1 ? 2 : 3);
    const kinds = shuffle<RockKind>(['leopard', ...distractors]);
    const spacing = 600 / kinds.length;

    kinds.forEach((kind, i) => {
      const x = 20 + spacing * (i + 0.5);
      const frame = this.add.rectangle(x, 160, spacing - 18, 112, 0x181425, 0.35).setStrokeStyle(2, 0x3a4466);
      const img = this.add.image(x, 156, TEX[kind]).setScale(7).setTint(0x733e39).setInteractive({ useHandCursor: true });
      const read = txt(this, x, 226, '???', 10, '#c0cbdc', spacing - 24).setOrigin(0.5, 0).setAlign('center');
      const slot: RockSlot = { kind, img, scan: 0, read, frame };
      img.on('pointerdown', () => this.selectRock(slot));
      this.rocks.push(slot);
      this.stage.add([frame, img, read]);
    });

    // Escáner arrastrable (lupa)
    const g = this.add.graphics();
    g.lineStyle(4, 0x181425).strokeCircle(0, 0, 22);
    g.lineStyle(2, 0x2ce8f5).strokeCircle(0, 0, 20);
    g.fillStyle(0x2ce8f5, 0.12).fillCircle(0, 0, 20);
    g.lineStyle(5, 0x8b9bb4).lineBetween(15, 15, 32, 32);
    this.scanner = this.add.container(320, 300, [g]).setSize(48, 48).setDepth(40);
    this.scanner.setInteractive({ draggable: true, useHandCursor: true });
    this.input.setDraggable(this.scanner);
    this.scanner.on('drag', (_p: Phaser.Input.Pointer, x: number, y: number) => {
      this.scanner.setPosition(Phaser.Math.Clamp(x, 10, 630), Phaser.Math.Clamp(y, 70, 350));
    });
    this.stage.add(this.scanner);

    const b = button(this, 520, 330, 196, 30, T.chooseButton, () => this.confirmRock());
    this.stage.add([b.bg, b.label]);
  }

  private selectRock(slot: RockSlot): void {
    if (this.phase !== 'scan' || this.finished) return;
    AudioSystem.play('ui_select', { volume: 0.6 });
    this.selected = slot;
    for (const r of this.rocks) r.frame.setStrokeStyle(2, r === slot ? 0xfee761 : 0x3a4466);
  }

  private confirmRock(): void {
    if (this.phase !== 'scan' || this.finished) return;
    if (!this.selected) {
      this.setInstruction(T.pickFirst, '#feae34');
      AudioSystem.play('ui_error');
      return;
    }
    if (this.selected.scan < 1) {
      this.addStrike(T.notScanned, T.wrongRockFail);
      return;
    }
    if (this.selected.kind !== 'leopard') {
      this.addStrike(T.wrongRock, T.wrongRockFail);
      return;
    }
    this.buildDrill();
  }

  private updateScan(dt: number): void {
    // Teclado: las flechas mueven el escáner
    let vx = 0;
    let vy = 0;
    if (this.keyDown('left') || this.keyDown('a')) vx -= 1;
    if (this.keyDown('right') || this.keyDown('d')) vx += 1;
    if (this.keyDown('up') || this.keyDown('w')) vy -= 1;
    if (this.keyDown('down') || this.keyDown('s')) vy += 1;
    if (vx || vy) {
      this.scanner.x = Phaser.Math.Clamp(this.scanner.x + vx * 200 * dt, 10, 630);
      this.scanner.y = Phaser.Math.Clamp(this.scanner.y + vy * 200 * dt, 70, 350);
    }
    if (this.actionJustDown()) {
      const under = this.rocks.find((r) => r.img.getBounds().contains(this.scanner.x, this.scanner.y));
      if (under && this.selected !== under) this.selectRock(under);
      else this.confirmRock();
    }

    let scanningAny = false;
    for (const r of this.rocks) {
      if (r.scan >= 1) continue;
      if (r.img.getBounds().contains(this.scanner.x, this.scanner.y)) {
        scanningAny = true;
        r.scan = Math.min(1, r.scan + dt / (this.inputData.difficulty === 1 ? 0.8 : 1.2));
        r.read.setText(`${T.scanning} ${Math.round(r.scan * 100)}%`);
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.ValueToColor(0x733e39),
          Phaser.Display.Color.ValueToColor(0xffffff),
          100,
          Math.round(r.scan * 100)
        );
        r.img.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
        if (r.scan >= 1) {
          r.img.clearTint();
          const info = T.rocks[r.kind];
          r.read.setText(`${info.name}\n${info.read}`).setColor('#ffffff');
          AudioSystem.play('scan_beep');
        }
      }
    }
    if (scanningAny) AudioSystem.startLoop('minigame', 'scan_loop', 0.35);
    else AudioSystem.stopLoop('minigame');
  }

  // ------------------------------------------------------------------ 2. perforar

  private buildDrill(): void {
    this.phase = 'drill';
    AudioSystem.stopLoop('minigame');
    this.clearCursorTargets();
    this.setActiveStep(1);
    this.setInstruction(T.instDrill);
    this.stage.removeAll(true);
    this.depth = 0;
    this.heat = 0;
    this.safeDepth = 0;
    this.drilling = false;

    const d = this.inputData.difficulty;
    const layers = d === 1 ? 1 : d === 2 ? 2 : 3;
    this.hardLayers = [];
    for (let i = 0; i < layers; i++) {
      const from = 15 + ((i + Math.random() * 0.6) * 75) / layers;
      this.hardLayers.push({ from, to: from + 8 + d * 2 });
    }

    const rock = this.add.image(150, 196, 'rock_leopard').setScale(10);
    this.bit = this.add.rectangle(150, 112, 12, 44, 0xc0cbdc).setStrokeStyle(2, 0x181425);
    const icon = this.add.image(150, 84, 'icon_drill').setScale(3);
    this.stage.add([rock, this.bit, icon]);

    this.stage.add(panel(this, 286, 76, 340, 196));
    this.stage.add(txt(this, 300, 86, T.depth, 12, '#ead4aa'));
    this.stage.add(this.add.rectangle(300, 112, 310, 16, 0x3a4466).setOrigin(0, 0.5).setStrokeStyle(2, 0x181425));
    for (const l of this.hardLayers) {
      this.stage.add(
        this.add.rectangle(300 + (310 * l.from) / 100, 112, (310 * (l.to - l.from)) / 100, 16, 0x5a6988).setOrigin(0, 0.5)
      );
    }
    this.depthFill = this.add.rectangle(302, 112, 0, 10, 0x63c74d).setOrigin(0, 0.5);
    this.stage.add(this.depthFill);
    this.stage.add(txt(this, 300, 124, '▒ = capa dura', 10, '#8b9bb4'));

    this.stage.add(txt(this, 300, 146, T.heat, 12, '#fee761'));
    this.stage.add(this.add.rectangle(300, 172, 310, 16, 0x3a4466).setOrigin(0, 0.5).setStrokeStyle(2, 0x181425));
    this.stage.add(this.add.rectangle(300 + 310 * 0.82, 172, 310 * 0.18, 12, 0xa22633).setOrigin(0, 0.5));
    this.heatFill = this.add.rectangle(302, 172, 0, 10, 0xfeae34).setOrigin(0, 0.5);
    this.stage.add(this.heatFill);
    this.drillStatus = txt(this, 300, 192, '', 11, '#fee761', 316);
    this.stage.add(this.drillStatus);

    const b = button(this, 456, 246, 240, 34, T.drillButton, () => (this.drilling = true));
    b.bg.on('pointerup', () => (this.drilling = false));
    b.bg.on('pointerout', () => (this.drilling = false));
    this.input.on('pointerup', () => (this.drilling = false));
    this.stage.add([b.bg, b.label]);
  }

  private inHardLayer(): boolean {
    return this.hardLayers.some((l) => this.depth >= l.from && this.depth <= l.to);
  }

  private updateDrill(dt: number): void {
    const d = this.inputData.difficulty;
    const active = this.drilling || this.actionHeld();
    const hard = this.inHardLayer();
    if (active) {
      this.depth = Math.min(100, this.depth + (hard ? 9 : 24) * dt);
      this.heat = Math.min(100, this.heat + (hard ? 44 + d * 8 : 18 + d * 5) * dt);
      AudioSystem.startLoop('minigame', 'drill_loop', hard ? 0.7 : 0.5);
    } else {
      this.heat = Math.max(0, this.heat - 40 * dt);
      AudioSystem.stopLoop('minigame');
    }
    if (!hard) this.safeDepth = Math.max(this.safeDepth, this.depth);
    this.drillStatus.setText(hard ? T.hardLayer : '');

    this.depthFill.width = Math.round((306 * this.depth) / 100);
    this.heatFill.width = Math.round((306 * this.heat) / 100);
    this.heatFill.setFillStyle(this.heat >= 82 ? 0xe43b44 : this.heat >= 55 ? 0xf77622 : 0xfeae34);
    this.bit.y = 112 + (this.depth / 100) * 40;
    if (active) this.bit.x = 150 + (Math.random() - 0.5) * (hard ? 3 : 1.5);

    if (this.heat >= 100) {
      this.drilling = false;
      AudioSystem.stopLoop('minigame');
      AudioSystem.play('overheat');
      // Retrocede a la última capa segura antes de la capa dura
      const layer = this.hardLayers.find((l) => this.depth >= l.from - 0.01);
      this.depth = Math.min(this.safeDepth, layer ? layer.from - 1 : this.safeDepth);
      this.heat = 0;
      if (this.addStrike(T.overheat, T.overheatFail)) this.setInstruction(T.overheat, '#feae34');
      return;
    }
    if (this.depth >= 100) this.buildSeal();
  }

  // ------------------------------------------------------------------ 3. sellar

  private buildSeal(): void {
    this.phase = 'seal';
    this.drilling = false;
    AudioSystem.stopLoop('minigame');
    this.setActiveStep(2);
    const d = this.inputData.difficulty;
    this.sealsNeeded = d >= 3 ? 2 : 1;
    this.sealsDone = 0;
    this.setInstruction(d >= 3 ? `${T.instSeal} ${T.sealTwice}` : T.instSeal);
    this.stage.removeAll(true);
    this.stage.add(this.add.image(130, 180, 'tube_full').setScale(8));
    this.stage.add(panel(this, 236, 110, 380, 130));
    this.bar = new TimingBar(this, 256, 176, 340, d === 1 ? 0.26 : d === 2 ? 0.19 : 0.14, 0.75 + d * 0.15, T.sealTitle);
    this.stage.add(this.bar.objects);
    this.sealStatus = txt(this, 426, 210, '', 11, '#fee761').setOrigin(0.5);
    this.stage.add(this.sealStatus);
    const b = button(this, 426, 290, 200, 36, T.sealButton, () => this.trySeal(), 0x63c74d, '#181425');
    this.stage.add([b.bg, b.label]);
  }

  private trySeal(): void {
    if (this.phase !== 'seal' || this.finished || !this.bar) return;
    if (this.bar.hit()) {
      this.sealsDone += 1;
      AudioSystem.play('tube_seal', { volume: 0.6 });
      if (this.sealsDone >= this.sealsNeeded) {
        this.phase = 'done';
        this.succeed('cheyava', T.success, T.source);
        return;
      }
      this.sealStatus.setText(`${this.sealsDone}/${this.sealsNeeded}`);
      this.bar.moveZone();
    } else {
      this.sealsDone = 0;
      this.bar.moveZone();
      this.addStrike(T.sealMiss, T.sealFail);
    }
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    if (this.finished) {
      this.actionJustDown();
      return;
    }
    if (this.phase === 'scan') this.updateScan(dt);
    else if (this.phase === 'drill') this.updateDrill(dt);
    else if (this.phase === 'seal') {
      this.bar?.update(dt);
      if (this.actionJustDown()) this.trySeal();
    }
  }
}
