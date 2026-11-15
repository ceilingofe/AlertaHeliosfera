import Phaser from 'phaser';
import { AudioSystem } from '../systems/Audio';
import { I18n } from '../systems/I18n';
import { MinigameBase } from './MinigameBase';
import { TimingBar, button, panel, shuffle, txt } from './widgets';

type Phase = 'scoop' | 'sieve' | 'choose' | 'done';
type Grain = 'coarse' | 'medium' | 'fine';

/**
 * Muestra de regolito.
 * 1) Palear: detener la cantidad en la zona verde.
 * 2) Tamizar: alternar ◄ ► con ritmo; quitar piedras grandes antes de que rompan la malla.
 * 3) Elegir grano: tres frascos en orden aleatorio; hay que leer la escala y elegir el fino.
 */
export class MinijuegoSuelo extends MinigameBase {
  private phase: Phase = 'scoop';
  private stage!: Phaser.GameObjects.Container;
  private bar: TimingBar | null = null;

  private progress = 0;
  private lastSide: -1 | 0 | 1 = 0;
  private sieve!: Phaser.GameObjects.Container;
  private progressFill!: Phaser.GameObjects.Rectangle;
  private pebbles: { obj: Phaser.GameObjects.Image; ttl: number; ring: Phaser.GameObjects.Arc }[] = [];
  private pebbleTimer = 0;
  private grains: Phaser.GameObjects.Rectangle[] = [];

  private get t() {
    return I18n.mg().suelo;
  }

  constructor() {
    super('MinijuegoSuelo');
  }

  create(): void {
    const T = this.t;
    this.pebbles = [];
    this.drawHeader(T.title, T.steps, T.instScoop);
    this.stage = this.add.container(0, 0);
    this.buildScoop();
  }

  // ------------------------------------------------------------------ 1. palear

  private buildScoop(): void {
    const T = this.t;
    this.phase = 'scoop';
    this.setActiveStep(0);
    this.stage.removeAll(true);
    this.stage.add(txt(this, 14, 72, T.objective, 11, '#fee761', 612));
    this.stage.add(this.add.ellipse(140, 220, 170, 70, 0xb86f50).setStrokeStyle(2, 0x733e39));
    this.stage.add(this.add.ellipse(140, 208, 120, 40, 0xe4a672));
    this.stage.add(this.add.image(140, 150, 'icon_shovel').setScale(4));
    const d = this.inputData.difficulty;
    this.stage.add(panel(this, 250, 120, 370, 120));
    this.bar = new TimingBar(this, 270, 186, 330, d === 1 ? 0.28 : d === 2 ? 0.2 : 0.15, 0.7 + d * 0.15, T.scoopTitle);
    this.stage.add(this.bar.objects);
    this.stage.add(txt(this, 270, 204, T.lowLabel, 10, '#8b9bb4'));
    this.stage.add(txt(this, 600, 204, T.highLabel, 10, '#8b9bb4').setOrigin(1, 0));
    const b = button(this, 435, 280, 180, 34, T.scoopButton, () => this.tryScoop());
    this.stage.add([b.bg, b.label]);
  }

  private tryScoop(): void {
    const T = this.t;
    if (this.phase !== 'scoop' || this.finished || !this.bar) return;
    AudioSystem.play('brush', { volume: 0.7 });
    if (this.bar.hit()) {
      this.buildSieve();
    } else {
      this.bar.moveZone();
      this.addStrike(T.scoopMiss, T.fail);
    }
  }

  // ------------------------------------------------------------------ 2. tamizar

  private buildSieve(): void {
    const T = this.t;
    this.phase = 'sieve';
    this.setActiveStep(1);
    this.setInstruction(T.instSieve);
    this.stage.removeAll(true);
    this.progress = 0;
    this.lastSide = 0;
    this.pebbleTimer = 1.4;
    this.pebbles = [];

    // Tamiz: aro con malla
    const g = this.add.graphics();
    g.fillStyle(0x8b9bb4).fillEllipse(0, 0, 230, 120);
    g.fillStyle(0x3a4466).fillEllipse(0, 0, 210, 104);
    g.lineStyle(1, 0x5a6988, 0.9);
    for (let i = -100; i <= 100; i += 10) g.lineBetween(i, -50, i, 50);
    for (let j = -50; j <= 50; j += 10) g.lineBetween(-100, j, 100, j);
    this.grains = [];
    const children: Phaser.GameObjects.GameObject[] = [g];
    for (let i = 0; i < 46; i++) {
      const r = this.add.rectangle((Math.random() - 0.5) * 180, (Math.random() - 0.5) * 80, 3, 2, Math.random() < 0.5 ? 0xe4a672 : 0xb86f50);
      this.grains.push(r);
      children.push(r);
    }
    this.sieve = this.add.container(250, 170, children);
    this.stage.add(this.sieve);

    // Tubo de muestra y matraz debajo del tamiz
    const tubeKey = this.textures.exists('tube_sample') ? 'tube_sample' : 'tube_empty';
    this.stage.add(
      this.add.image(250, 270, tubeKey).setScale(tubeKey === 'tube_sample' ? 2.5 : 3).setAngle(90).setTint(0xe4a672)
    );
    if (this.textures.exists('flask_conical')) {
      this.stage.add(this.add.image(348, 266, 'flask_conical').setScale(2).setTint(0xe4a672));
    }

    this.stage.add(panel(this, 420, 84, 206, 186));
    this.stage.add(txt(this, 432, 94, T.sieveProgress, 12, '#ead4aa'));
    this.stage.add(this.add.rectangle(432, 122, 180, 14, 0x3a4466).setOrigin(0, 0.5).setStrokeStyle(2, 0x181425));
    this.progressFill = this.add.rectangle(434, 122, 1, 10, 0x63c74d).setOrigin(0, 0.5).setVisible(false);
    this.stage.add(this.progressFill);
    this.stage.add(txt(this, 432, 140, T.sameSide, 10, '#c0cbdc', 184));
    const l = button(this, 470, 238, 84, 32, T.left, () => this.shake(-1), 0x5a6988);
    const r = button(this, 580, 238, 84, 32, T.right, () => this.shake(1), 0x5a6988);
    this.stage.add([l.bg, l.label, r.bg, r.label]);
  }

  private updateProgressFill(): void {
    const pw = Math.round((176 * this.progress) / 100);
    this.progressFill.setVisible(pw > 0);
    if (pw > 0) this.progressFill.setSize(pw, 10).updateDisplayOrigin();
  }

  private shake(side: -1 | 1): void {
    const T = this.t;
    if (this.phase !== 'sieve' || this.finished) return;
    AudioSystem.play('sieve', { volume: 0.5, pitchJitter: 0.1 });
    this.tweens.add({ targets: this.sieve, x: 250 + side * 14, duration: 70, yoyo: true });
    if (side === this.lastSide) {
      this.progress = Math.max(0, this.progress - 3);
      this.setInstruction(T.sameSide, '#feae34');
    } else {
      // Si hay piedras sobre la malla el tamiz casi no avanza
      const gain = this.pebbles.length > 0 ? 1.5 : 6 - this.inputData.difficulty;
      this.progress = Math.min(100, this.progress + gain);
      this.setInstruction(T.instSieve);
    }
    this.lastSide = side;
    const remaining = Math.round(this.grains.length * (1 - this.progress / 100));
    this.grains.forEach((gr, i) => gr.setVisible(i < remaining));
    this.updateProgressFill();
    if (this.progress >= 100) this.buildChoose();
  }

  private spawnPebble(): void {
    const x = 250 + (Math.random() - 0.5) * 160;
    const y = 170 + (Math.random() - 0.5) * 60;
    const ttl = this.inputData.difficulty === 1 ? 3 : this.inputData.difficulty === 2 ? 2.3 : 1.7;
    const obj = this.add.image(x, y, 'pebble_c').setScale(4).setInteractive({ useHandCursor: true });
    const ring = this.add.circle(x, y, 18).setStrokeStyle(2, 0xfeae34);
    const p = { obj, ttl, ring };
    const remove = (): void => {
      AudioSystem.play('ui_pluck', { volume: 0.6 });
      this.removePebble(p);
    };
    obj.on('pointerdown', remove);
    this.addCursorTarget(obj, remove);
    this.pebbles.push(p);
    this.stage.add([obj, ring]);
  }

  private removePebble(p: { obj: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Arc }): void {
    this.pebbles = this.pebbles.filter((q) => q !== p);
    p.obj.destroy();
    p.ring.destroy();
  }

  private updateSieve(dt: number): void {
    const T = this.t;
    if (this.keyJustDown('left') || this.keyJustDown('a')) this.shake(-1);
    if (this.keyJustDown('right') || this.keyJustDown('d')) this.shake(1);
    // ↓/S o la mira sirven para quitar piedras con el teclado
    if (this.keyJustDown('down') || this.keyJustDown('s') || this.actionJustDown()) {
      const p = this.pebbles[0];
      if (p) {
        AudioSystem.play('ui_pluck', { volume: 0.6 });
        this.removePebble(p);
      }
    }
    this.pebbleTimer -= dt;
    if (this.pebbleTimer <= 0) {
      this.spawnPebble();
      this.pebbleTimer = (this.inputData.difficulty === 1 ? 3.2 : 2.4) + Math.random() * 1.2;
    }
    for (const p of this.pebbles.slice()) {
      p.ttl -= dt;
      p.ring.setRadius(8 + Math.max(0, p.ttl) * 4).setStrokeStyle(2, p.ttl < 0.8 ? 0xe43b44 : 0xfeae34);
      if (p.ttl <= 0) {
        this.removePebble(p);
        this.progress = Math.max(0, this.progress - 15);
        this.updateProgressFill();
        if (!this.addStrike(T.pebbleTore, T.fail)) return;
      }
    }
  }

  // ------------------------------------------------------------------ 3. elegir grano

  private buildChoose(): void {
    const T = this.t;
    this.phase = 'choose';
    for (const p of this.pebbles.slice()) this.removePebble(p);
    this.clearCursorTargets();
    this.setActiveStep(2);
    this.setInstruction(T.instChoose);
    this.stage.removeAll(true);
    const labels: Record<Grain, string> = { coarse: T.jarCoarse, medium: T.jarMedium, fine: T.jarFine };
    const size: Record<Grain, number> = { coarse: 6, medium: 3, fine: 1 };
    const order = shuffle<Grain>(['coarse', 'medium', 'fine']);
    order.forEach((grain, i) => {
      const x = 120 + i * 200;
      const jar = this.add.rectangle(x, 170, 110, 120, 0x3a4466).setStrokeStyle(3, 0xc0cbdc).setInteractive({ useHandCursor: true });
      this.stage.add(jar);
      const s = size[grain];
      for (let yy = 0; yy < 60; yy += s + 1) {
        for (let xx = 0; xx < 90; xx += s + 1) {
          if (Math.random() < 0.82) {
            this.stage.add(this.add.rectangle(x - 45 + xx, 198 - yy, s, s, (xx + yy) % 3 === 0 ? 0xb86f50 : 0xe4a672).setOrigin(0, 0));
          }
        }
      }
      if (this.textures.exists('tube_sample')) {
        this.stage.add(this.add.image(x + 42, 128, 'tube_sample').setScale(1.3).setTint(0xe4a672));
      }
      // Diferencia sutil: la etiqueta sólo dice el tamaño; en dificultad 3 se omite el adjetivo
      const label = this.inputData.difficulty >= 3 ? labels[grain].split('·')[1].trim() : labels[grain];
      this.stage.add(txt(this, x, 240, label, 11, '#ffffff').setOrigin(0.5));
      this.stage.add(txt(this, x, 256, `[${i + 1}]`, 10, '#8b9bb4').setOrigin(0.5));
      const pick = (): void => this.pickJar(grain);
      jar.on('pointerdown', pick);
      this.addCursorTarget(jar, pick);
    });
    this.chooseOrder = order;
  }

  private chooseOrder: Grain[] = [];

  private pickJar(grain: Grain): void {
    const T = this.t;
    if (this.phase !== 'choose' || this.finished) return;
    if (grain === 'fine') {
      this.phase = 'done';
      this.succeed('percloratos', T.success, T.source);
    } else {
      this.addStrike(T.wrongJar, T.fail);
    }
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    if (this.finished) {
      this.actionJustDown();
      return;
    }
    if (this.phase === 'scoop') {
      this.bar?.update(dt);
      if (this.actionJustDown()) this.tryScoop();
    } else if (this.phase === 'sieve') {
      this.updateSieve(dt);
    } else if (this.phase === 'choose') {
      this.updateKeyboardCursor(dt);
      for (let i = 0; i < 3; i++) {
        if (this.numberJustDown(i + 1) && this.chooseOrder[i]) this.pickJar(this.chooseOrder[i]);
      }
      if (this.actionJustDown()) this.pickWithReticle();
    }
  }
}
