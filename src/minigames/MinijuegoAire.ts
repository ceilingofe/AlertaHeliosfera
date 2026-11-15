import Phaser from 'phaser';
import MG from '../../content/minigames.json';
import { AudioSystem } from '../systems/Audio';
import { MinigameBase } from './MinigameBase';
import { button, panel, txt } from './widgets';

type Phase = 'couple' | 'fill' | 'close' | 'done';

const T = MG.aire;
const MAX_MBAR = 10;

/**
 * Muestra de atmósfera.
 * 1) Acoplar: un anillo gira; hay que detener la muesca arriba (tolerancia según dificultad).
 * 2) Llenar: mantener la válvula sube la presión, soltarla la deja escapar. Hay ráfagas de
 *    remolinos de polvo. Hay que sostener la aguja en la zona verde (~6 mbar) hasta llenar
 *    la barra de estabilidad. Pasar de 9 mbar purga el tubo (error).
 * 3) Cerrar: ventana corta para cerrar antes de que la presión se escape.
 */
export class MinijuegoAire extends MinigameBase {
  private phase: Phase = 'couple';
  private stage!: Phaser.GameObjects.Container;

  private ring!: Phaser.GameObjects.Container;
  private ringAngle = 0;

  private holding = false;
  private pressure = 0;
  private stable = 0;
  private gustTimer = 0;
  private needle!: Phaser.GameObjects.Rectangle;
  private stableFill!: Phaser.GameObjects.Rectangle;
  private pressureText!: Phaser.GameObjects.Text;
  private bandLow = 5.4;
  private bandHigh = 6.6;

  private closeWindow = 0;
  private closeFill!: Phaser.GameObjects.Rectangle;
  private pumpPiston: Phaser.GameObjects.Rectangle | null = null;
  private pumpTime = 0;

  constructor() {
    super('MinijuegoAire');
  }

  create(): void {
    this.drawHeader(T.title, T.steps, T.instCouple);
    this.stage = this.add.container(0, 0);
    this.buildCouple();
  }

  // ------------------------------------------------------------------ 1. acoplar

  private buildCouple(): void {
    this.phase = 'couple';
    this.setActiveStep(0);
    this.stage.removeAll(true);
    this.stage.add(txt(this, 14, 72, T.objective, 11, '#fee761', 612));
    this.stage.add(this.add.image(118, 196, 'air_station').setScale(6.5));
    if (this.textures.exists('tube_sample')) {
      this.stage.add(this.add.image(186, 206, 'tube_sample').setScale(2.5).setTint(0x2ce8f5));
    }

    const g = this.add.graphics();
    g.lineStyle(10, 0x8b9bb4).strokeCircle(0, 0, 58);
    g.lineStyle(2, 0x181425).strokeCircle(0, 0, 64).strokeCircle(0, 0, 52);
    g.fillStyle(0xfee761).fillRect(-6, -68, 12, 18);
    this.ring = this.add.container(380, 190, [g]);
    this.stage.add(this.add.circle(380, 190, 44, 0x262b44).setStrokeStyle(2, 0x181425));
    this.stage.add(this.add.image(380, 190, 'icon_valve').setScale(3));
    this.stage.add(this.ring);
    // Llave fija arriba
    this.stage.add(this.add.triangle(380, 112, 0, 0, 16, 0, 8, 12, 0x63c74d).setStrokeStyle(1, 0x181425));
    this.ringAngle = Math.random() * 360;
    const b = button(this, 540, 300, 150, 34, T.coupleButton, () => this.tryCouple());
    this.stage.add([b.bg, b.label]);
  }

  private tryCouple(): void {
    if (this.phase !== 'couple' || this.finished) return;
    const tol = [16, 11, 8][this.inputData.difficulty - 1];
    const a = Phaser.Math.Angle.WrapDegrees(this.ringAngle);
    AudioSystem.play('clank', { volume: 0.6 });
    if (Math.abs(a) <= tol) {
      this.buildFill();
    } else {
      this.addStrike(T.coupleMiss, T.fail);
    }
  }

  // ------------------------------------------------------------------ 2. llenar

  private buildFill(): void {
    this.phase = 'fill';
    this.setActiveStep(1);
    this.setInstruction(T.instFill);
    this.stage.removeAll(true);
    this.pressure = 0;
    this.stable = 0;
    this.holding = false;
    this.pumpTime = 0;
    this.gustTimer = 2 + Math.random() * 2;
    const d = this.inputData.difficulty;
    const half = [0.7, 0.5, 0.38][d - 1];
    this.bandLow = 6 - half;
    this.bandHigh = 6 + half;

    // Manómetro vertical
    this.stage.add(panel(this, 36, 76, 120, 210));
    this.stage.add(txt(this, 96, 84, T.fillTitle, 10, '#ead4aa', 110).setOrigin(0.5, 0).setAlign('center'));
    const top = 112;
    const h = 160;
    this.stage.add(this.add.rectangle(96, top, 30, h, 0x3a4466).setOrigin(0.5, 0).setStrokeStyle(2, 0x181425));
    const yOf = (mbar: number): number => top + h - (h * mbar) / MAX_MBAR;
    this.stage.add(this.add.rectangle(96, yOf(this.bandHigh), 30, yOf(this.bandLow) - yOf(this.bandHigh), 0x63c74d).setOrigin(0.5, 0));
    this.stage.add(this.add.rectangle(96, yOf(MAX_MBAR), 30, yOf(9) - yOf(MAX_MBAR), 0xa22633).setOrigin(0.5, 0));
    for (let m = 0; m <= 10; m += 2) this.stage.add(txt(this, 118, yOf(m) - 6, String(m), 9, '#8b9bb4'));
    this.needle = this.add.rectangle(96, yOf(0), 40, 4, 0xfee761).setStrokeStyle(1, 0x181425);
    this.stage.add(this.needle);
    this.pressureText = txt(this, 96, 274, '0.0 mbar', 11, '#ffffff').setOrigin(0.5, 0);
    this.stage.add(this.pressureText);

    // Panel derecho con barra estable + bomba de aire animada y tubo/matraz
    this.stage.add(panel(this, 174, 76, 448, 134));
    this.stage.add(txt(this, 188, 86, T.holdTitle, 11, '#ead4aa'));
    this.stage.add(this.add.rectangle(188, 112, 320, 14, 0x3a4466).setOrigin(0, 0.5).setStrokeStyle(2, 0x181425));
    this.stableFill = this.add.rectangle(190, 112, 0, 10, 0x2ce8f5).setOrigin(0, 0.5);
    this.stage.add(this.stableFill);
    this.stage.add(txt(this, 188, 134, `${T.co2}   ${T.n2}   ${T.ar}`, 11, '#c0cbdc'));
    this.stage.add(txt(this, 188, 154, 'Tierra: 1 013 mbar · Marte: ~6 mbar', 10, '#8b9bb4'));

    // Bomba neumática y tubo de muestra a la derecha del panel
    this.stage.add(this.add.rectangle(544, 154, 24, 48, 0x5a6988).setStrokeStyle(2, 0x181425));
    this.stage.add(this.add.rectangle(544, 154, 16, 40, 0x181425));
    this.pumpPiston = this.add.rectangle(544, 144, 14, 12, 0x2ce8f5).setStrokeStyle(1, 0xffffff);
    this.stage.add(this.pumpPiston);
    this.stage.add(txt(this, 544, 186, 'BOMBA', 8, '#ead4aa').setOrigin(0.5));
    if (this.textures.exists('tube_sample')) {
      this.stage.add(this.add.image(586, 154, 'tube_sample').setScale(2.4).setTint(0x2ce8f5));
    }

    const b = button(this, 408, 256, 260, 40, T.valveButton, () => (this.holding = true));
    b.bg.on('pointerup', () => (this.holding = false));
    b.bg.on('pointerout', () => (this.holding = false));
    this.input.on('pointerup', () => (this.holding = false));
    this.stage.add([b.bg, b.label]);
  }

  private updateFill(dt: number): void {
    const d = this.inputData.difficulty;
    const open = this.holding || this.actionHeld();
    if (open) {
      this.pressure += (1.6 + d * 0.2) * dt;
      this.pumpTime += dt * 10;
      AudioSystem.startLoop('minigame', 'valve_loop', 0.5);
    } else {
      this.pressure -= (0.55 + d * 0.15) * dt;
      AudioSystem.stopLoop('minigame');
    }
    if (this.pumpPiston) {
      this.pumpPiston.y = 148 + Math.sin(this.pumpTime) * 12;
    }

    this.gustTimer -= dt;
    if (this.gustTimer <= 0) {
      const sign = Math.random() < 0.5 ? -1 : 1;
      this.pressure += sign * (0.6 + Math.random() * 0.5 * d);
      this.gustTimer = (d === 1 ? 4 : 2.6) + Math.random() * 2;
      AudioSystem.play('whoosh', { volume: 0.4 });
      this.setInstruction(T.gust, '#feae34');
      this.cameras.main.shake(120, 0.003);
    }
    this.pressure = Phaser.Math.Clamp(this.pressure, 0, MAX_MBAR);

    const inBand = this.pressure >= this.bandLow && this.pressure <= this.bandHigh;
    if (inBand) this.stable = Math.min(1, this.stable + dt / (2 + d * 0.6));
    else this.stable = Math.max(0, this.stable - dt * 0.25);

    this.needle.y = 112 + 160 - (160 * this.pressure) / MAX_MBAR;
    this.needle.setFillStyle(inBand ? 0x63c74d : 0xfee761);
    this.pressureText.setText(`${this.pressure.toFixed(1)} mbar`);
    this.stableFill.width = Math.round(316 * this.stable);

    if (this.pressure >= 9) {
      this.pressure = 2;
      this.stable = 0;
      this.holding = false;
      AudioSystem.play('o2_hiss');
      if (this.addStrike(T.overPressure, T.fail)) this.setInstruction(T.overPressure, '#feae34');
      return;
    }
    if (this.stable >= 1) this.buildClose();
  }

  // ------------------------------------------------------------------ 3. cerrar

  private buildClose(): void {
    this.phase = 'close';
    this.holding = false;
    this.pumpPiston = null;
    AudioSystem.stopLoop('minigame');
    this.setActiveStep(2);
    this.setInstruction(T.instClose, '#fee761');
    this.stage.removeAll(true);
    this.closeWindow = [2.0, 1.4, 1.0][this.inputData.difficulty - 1];
    this.stage.add(this.add.image(160, 190, 'icon_valve').setScale(5.5));
    if (this.textures.exists('tube_sample')) {
      this.stage.add(this.add.image(234, 190, 'tube_sample').setScale(3.5).setTint(0x2ce8f5));
    }
    this.stage.add(this.add.rectangle(330, 170, 280, 14, 0x3a4466).setOrigin(0, 0.5).setStrokeStyle(2, 0x181425));
    this.closeFill = this.add.rectangle(332, 170, 276, 10, 0xe43b44).setOrigin(0, 0.5);
    this.stage.add(this.closeFill);
    const b = button(this, 470, 250, 200, 40, T.closeButton, () => this.tryClose(), 0x63c74d, '#181425');
    this.stage.add([b.bg, b.label]);
    AudioSystem.play('o2_beep');
  }

  private closeTotal(): number {
    return [2.0, 1.4, 1.0][this.inputData.difficulty - 1];
  }

  private tryClose(): void {
    if (this.phase !== 'close' || this.finished) return;
    this.phase = 'done';
    AudioSystem.play('tube_seal');
    this.succeed('aire', T.success, T.source);
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    if (this.finished) {
      this.actionJustDown();
      return;
    }
    if (this.phase === 'couple') {
      const speed = [110, 150, 190][this.inputData.difficulty - 1];
      this.ringAngle = (this.ringAngle + speed * dt) % 360;
      this.ring.setAngle(this.ringAngle);
      if (this.actionJustDown()) this.tryCouple();
    } else if (this.phase === 'fill') {
      this.updateFill(dt);
    } else if (this.phase === 'close') {
      this.closeWindow -= dt;
      this.closeFill.width = Math.max(0, Math.round((276 * this.closeWindow) / this.closeTotal()));
      if (this.actionJustDown()) {
        this.tryClose();
        return;
      }
      if (this.closeWindow <= 0) {
        if (this.addStrike(T.closeLate, T.fail)) this.buildFill();
      }
    }
  }
}
