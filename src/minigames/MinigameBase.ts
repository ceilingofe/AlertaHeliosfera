import Phaser from 'phaser';
import MG from '../../content/minigames.json';
import { bus } from '../state/bus';
import { gameStore } from '../state/GameState';
import { AudioSystem } from '../systems/Audio';
import { Clock } from '../systems/Clock';
import type { MinigameInput, MinigameResult, Mood } from '../types';
import { DialogBox } from '../ui/DialogBox';

const FONT = 'PixelifySans, monospace';

interface CursorTarget {
  obj: Phaser.GameObjects.GameObject & { getBounds: () => Phaser.Geom.Rectangle; active: boolean };
  cb: () => void;
}

/**
 * Base de los minijuegos de campo.
 *
 * Reglas comunes que dan sentido de misión real:
 * - El reloj del día se detiene, pero el traje sigue gastando OXÍGENO (Mundo lo descuenta):
 *   tardarse cuesta. Si el O₂ llega a 0, el minijuego termina y llega el rescate.
 * - Hay INTENTOS limitados (3 en dificultad 1, 2 después). Cada error resta uno y Corvi
 *   explica la razón científica. Sin intentos, la muestra se arruina.
 * - La calidad (1–3 estrellas) depende de los errores y da puntos de ciencia.
 * - Todo se puede jugar con mouse/toque o con teclado (flechas mueven la mira, Espacio/E elige).
 */
export abstract class MinigameBase extends Phaser.Scene {
  protected inputData: MinigameInput = { type: 'roca', day: 1, difficulty: 1 };
  protected strikes = 0;
  protected maxStrikes = 3;
  protected finished = false;

  private stepBgs: Phaser.GameObjects.Rectangle[] = [];
  private stepTexts: Phaser.GameObjects.Text[] = [];
  private instructionText!: Phaser.GameObjects.Text;
  private heartTexts: Phaser.GameObjects.Text[] = [];
  private o2Fill!: Phaser.GameObjects.Rectangle;
  private o2Label!: Phaser.GameObjects.Text;

  private cursorTargets: CursorTarget[] = [];
  private reticle: Phaser.GameObjects.Container | null = null;
  private reticlePos = new Phaser.Math.Vector2(320, 200);
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  protected activeDialog: DialogBox | null = null;

  /** @deprecated Usar strikes. Se conserva para compatibilidad con código antiguo. */
  protected get failures(): number {
    return this.strikes;
  }

  init(data?: Partial<MinigameInput> & Record<string, unknown>): void {
    const day = data?.day ?? gameStore.state.day;
    const difficulty: 1 | 2 | 3 = day <= 2 ? 1 : day <= 5 ? 2 : 3;
    this.inputData = {
      type: data?.type ?? 'roca',
      day,
      difficulty: data?.difficulty ?? difficulty,
      zone: data?.zone,
      panelId: typeof data?.panelId === 'string' ? data.panelId : undefined,
    };
    this.strikes = 0;
    this.maxStrikes = this.inputData.difficulty === 1 ? 3 : 2;
    this.finished = false;
    this.cursorTargets = [];
    this.reticle = null;
    this.activeDialog = null;
  }

  protected drawHeader(title: string, steps: string[], initialInstruction: string): void {
    Clock.setPaused(gameStore.state, true);
    this.stepBgs = [];
    this.stepTexts = [];
    this.heartTexts = [];

    const ground = this.add.tileSprite(0, 0, 640, 360, 'ground_placeholder').setOrigin(0, 0);
    ground.setTileScale(2, 2);
    this.add.tileSprite(0, 0, 640, 360, 'ground_var').setOrigin(0, 0).setTileScale(2, 2).setAlpha(0.8);

    this.add.rectangle(320, 20, 632, 34, 0x262b44).setStrokeStyle(2, 0x181425);
    this.add.text(14, 10, title, { fontFamily: FONT, fontSize: '16px', color: '#ffffff' });

    const stepW = steps.length > 2 ? 78 : 96;
    const startX = 624 - steps.length * (stepW + 4);
    steps.forEach((stepLabel, idx) => {
      const sx = startX + idx * (stepW + 4);
      const bg = this.add.rectangle(sx, 11, stepW, 20, 0x5a6988).setOrigin(0, 0).setStrokeStyle(1, 0x181425);
      const txt = this.add
        .text(sx + stepW / 2, 21, stepLabel, { fontFamily: FONT, fontSize: '11px', color: '#c0cbdc' })
        .setOrigin(0.5);
      this.stepBgs.push(bg);
      this.stepTexts.push(txt);
    });

    // Instrucción (izquierda) + estado del traje (derecha), en una franja sin empalmes
    this.add.rectangle(320, 53, 632, 28, 0x181425, 0.8);
    this.instructionText = this.add.text(12, 40, initialInstruction, {
      fontFamily: FONT,
      fontSize: '10px',
      color: '#ffffff',
      wordWrap: { width: 440 },
    });

    this.add.image(470, 53, 'icon_o2').setScale(1.1);
    this.add.rectangle(480, 53, 64, 6, 0x3a4466).setOrigin(0, 0.5);
    this.o2Fill = this.add.rectangle(480, 53, 64, 6, 0x2ce8f5).setOrigin(0, 0.5);
    this.o2Label = this.add.text(548, 47, '100%', { fontFamily: FONT, fontSize: '10px', color: '#2ce8f5' });

    for (let i = 0; i < this.maxStrikes; i++) {
      this.heartTexts.push(
        this.add.text(590 + i * 14, 45, '♥', { fontFamily: FONT, fontSize: '13px', color: '#e43b44' })
      );
    }

    this.setActiveStep(0);
    this.setupKeyboardCursor();
    AudioSystem.play('ui_open', { volume: 0.6 });

    this.events.on(Phaser.Scenes.Events.UPDATE, this.baseUpdate, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.UPDATE, this.baseUpdate, this);
      AudioSystem.stopLoop('minigame');
      this.activeDialog?.destroy();
      this.activeDialog = null;
    });
  }

  protected setActiveStep(activeIndex: number): void {
    if (activeIndex > 0) AudioSystem.play('ui_confirm', { volume: 0.5 });
    this.stepBgs.forEach((bg, idx) => {
      const txt = this.stepTexts[idx];
      if (idx < activeIndex) {
        bg.setFillStyle(0x63c74d);
        txt.setColor('#181425');
      } else if (idx === activeIndex) {
        bg.setFillStyle(0xfee761);
        txt.setColor('#181425');
      } else {
        bg.setFillStyle(0x5a6988);
        txt.setColor('#c0cbdc');
      }
    });
  }

  protected setInstruction(text: string, color = '#ffffff'): void {
    this.instructionText.setText(text).setColor(color);
  }

  /** Calidad final según los errores cometidos: 3 sin errores, 2 con uno, 1 con más. */
  protected qualityFromStrikes(): 1 | 2 | 3 {
    return this.strikes === 0 ? 3 : this.strikes === 1 ? 2 : 1;
  }

  /**
   * Registra un error. Devuelve true si todavía quedan intentos.
   * Si se acaban, Corvi explica y la muestra se arruina.
   */
  protected addStrike(reason: string, explanation?: string): boolean {
    if (this.finished) return false;
    this.strikes += 1;
    AudioSystem.play('ui_error');
    this.cameras.main.shake(160, 0.006);
    this.heartTexts.forEach((h, i) => h.setColor(i < this.maxStrikes - this.strikes ? '#e43b44' : '#3a4466'));
    this.setInstruction(reason, '#feae34');
    if (this.strikes >= this.maxStrikes) {
      this.failWithExplanation(explanation ?? reason);
      return false;
    }
    return true;
  }

  protected failWithExplanation(text: string, mood: Mood = 'worried'): void {
    if (this.finished) return;
    this.finished = true;
    AudioSystem.stopLoop('minigame');
    AudioSystem.play('fail');
    this.clearCursorTargets();
    this.activeDialog?.destroy();
    this.activeDialog = new DialogBox(this, {
      mode: 'big',
      mood,
      text: `${MG.common.failPrefix} ${text}`,
      onComplete: () => this.completeMinigame({ ok: false, quality: 0 }),
    });
  }

  protected succeed(factId: string, text: string, source: string, label: 'ARCHIVO REAL' | 'SIMULADO' | 'CALCULADO' = 'ARCHIVO REAL'): void {
    if (this.finished) return;
    this.finished = true;
    AudioSystem.stopLoop('minigame');
    AudioSystem.play('success');
    this.clearCursorTargets();
    this.spawnSuccessParticles();
    const quality = this.qualityFromStrikes();
    const stars = '★'.repeat(quality) + '☆'.repeat(3 - quality);
    this.setInstruction(`${MG.common.qualityLabel} ${stars}`, '#fee761');
    this.activeDialog?.destroy();
    this.activeDialog = new DialogBox(this, {
      mode: 'big',
      mood: 'proud',
      text,
      source,
      label,
      onComplete: () => this.completeMinigame({ ok: true, quality, factId }),
    });
  }

  protected completeMinigame(result: MinigameResult): void {
    this.finished = true;
    if (result.ok) AudioSystem.play('tube_seal');
    Clock.setPaused(gameStore.state, false);
    bus.emit('minigame:finished', result);
    this.scene.stop();
  }

  protected spawnSuccessParticles(): void {
    for (let i = 0; i < 18; i++) {
      const p = this.add
        .rectangle(320 + (Math.random() - 0.5) * 80, 180 + (Math.random() - 0.5) * 50, 5, 5, i % 2 === 0 ? 0xfee761 : 0x63c74d)
        .setDepth(80);
      this.tweens.add({
        targets: p,
        x: p.x + (Math.random() - 0.5) * 140,
        y: p.y - 40 - Math.random() * 60,
        alpha: 0,
        duration: 800,
        onComplete: () => p.destroy(),
      });
    }
  }

  // ------------------------------------------------------------------ teclado / mira

  private setupKeyboardCursor(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      left: kb.addKey(K.LEFT),
      right: kb.addKey(K.RIGHT),
      up: kb.addKey(K.UP),
      down: kb.addKey(K.DOWN),
      a: kb.addKey(K.A),
      d: kb.addKey(K.D),
      w: kb.addKey(K.W),
      s: kb.addKey(K.S),
      space: kb.addKey(K.SPACE),
      e: kb.addKey(K.E),
      p: kb.addKey(K.P),
      n1: kb.addKey(K.ONE),
      n2: kb.addKey(K.TWO),
      n3: kb.addKey(K.THREE),
      n4: kb.addKey(K.FOUR),
    };
  }

  protected keyDown(name: 'left' | 'right' | 'up' | 'down' | 'space' | 'e' | 'a' | 'd' | 'w' | 's'): boolean {
    return this.keys[name]?.isDown ?? false;
  }

  protected keyJustDown(name: 'left' | 'right' | 'up' | 'down' | 'space' | 'e' | 'a' | 'd' | 'w' | 's'): boolean {
    const k = this.keys[name];
    return k ? Phaser.Input.Keyboard.JustDown(k) : false;
  }

  /** Tecla numérica 1–4 recién presionada. */
  protected numberJustDown(n: number): boolean {
    const k = this.keys[`n${n}`];
    return k ? Phaser.Input.Keyboard.JustDown(k) : false;
  }

  protected pJustDown(): boolean {
    const k = this.keys.p;
    return k ? Phaser.Input.Keyboard.JustDown(k) : false;
  }

  /** Espacio o E recién presionados (y avanza el diálogo si está abierto). */
  protected actionJustDown(): boolean {
    const pressed = this.keyJustDown('space') || this.keyJustDown('e');
    if (pressed && this.activeDialog) {
      this.activeDialog.advanceOrFinish();
      return false;
    }
    return pressed;
  }

  protected actionHeld(): boolean {
    return this.keyDown('space') || this.keyDown('e');
  }

  /** Registra un objeto que se puede elegir con la mira del teclado (además del clic). */
  protected addCursorTarget(obj: CursorTarget['obj'], cb: () => void): void {
    this.cursorTargets.push({ obj, cb });
    if (!this.reticle) {
      const g = this.add.graphics();
      g.lineStyle(2, 0xfee761, 1);
      g.strokeCircle(0, 0, 9);
      g.lineBetween(-14, 0, -6, 0).lineBetween(6, 0, 14, 0).lineBetween(0, -14, 0, -6).lineBetween(0, 6, 0, 14);
      this.reticle = this.add.container(this.reticlePos.x, this.reticlePos.y, [g]).setDepth(70).setVisible(false);
    }
  }

  protected clearCursorTargets(): void {
    this.cursorTargets = [];
    this.reticle?.setVisible(false);
  }

  /** Mueve la mira con flechas/WASD; Espacio/E elige el objetivo bajo la mira. */
  protected updateKeyboardCursor(dt: number): void {
    if (!this.reticle || this.cursorTargets.length === 0) return;
    let vx = 0;
    let vy = 0;
    if (this.keyDown('left') || this.keyDown('a')) vx -= 1;
    if (this.keyDown('right') || this.keyDown('d')) vx += 1;
    if (this.keyDown('up') || this.keyDown('w')) vy -= 1;
    if (this.keyDown('down') || this.keyDown('s')) vy += 1;
    if (vx !== 0 || vy !== 0) {
      this.reticle.setVisible(true);
      this.reticlePos.x = Phaser.Math.Clamp(this.reticlePos.x + vx * 220 * dt, 8, 632);
      this.reticlePos.y = Phaser.Math.Clamp(this.reticlePos.y + vy * 220 * dt, 64, 352);
      this.reticle.setPosition(this.reticlePos.x, this.reticlePos.y);
    }
  }

  /** Intenta elegir con la mira. Devuelve true si había algo bajo ella. */
  protected pickWithReticle(): boolean {
    if (!this.reticle || !this.reticle.visible) return false;
    for (let i = this.cursorTargets.length - 1; i >= 0; i--) {
      const t = this.cursorTargets[i];
      if (!t.obj.active) continue;
      if (t.obj.getBounds().contains(this.reticlePos.x, this.reticlePos.y)) {
        t.cb();
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ bucle común

  private baseUpdate(): void {
    const o2 = Math.max(0, gameStore.state.astronaut.o2);
    if (this.o2Fill) {
      this.o2Fill.width = Math.round((64 * o2) / 100);
      const color = o2 <= 20 ? 0xe43b44 : o2 <= 40 ? 0xfee761 : 0x2ce8f5;
      this.o2Fill.setFillStyle(color);
      this.o2Label.setText(`${Math.ceil(o2)}%`).setColor(o2 <= 20 ? '#e43b44' : o2 <= 40 ? '#fee761' : '#2ce8f5');
    }
    if (!this.finished && o2 <= 0) {
      // Sin oxígeno no se puede seguir trabajando: Mundo activará el rescate.
      this.finished = true;
      AudioSystem.stopLoop('minigame');
      this.completeMinigame({ ok: false, quality: 0 });
    }
  }
}
