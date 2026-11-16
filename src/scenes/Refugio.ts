import Phaser from 'phaser';
import balance from '../../content/balance.json';
import { bus } from '../state/bus';
import { gameStore } from '../state/GameState';
import { Save } from '../state/Save';
import { AudioSystem } from '../systems/Audio';
import { BaseSystem } from '../systems/BaseSystem';
import { Clock } from '../systems/Clock';
import { Events } from '../systems/Events';
import { I18n } from '../systems/I18n';
import { Vitals } from '../systems/Vitals';
import { AstronautAppearance, type AstronautDirection } from '../ui/AstronautAppearance';
import { getSharedJoystickVector } from '../ui/Joystick';
import { Dialogo } from './Dialogo';

type RefugeStationId = 'o2Station' | 'heaterStation' | 'exitDoor';

interface RefugeStation {
  id: RefugeStationId;
  x: number;
  y: number;
  prompt: string;
}

/**
 * Escena independiente del Refugio Blindado: estructura externa de muros gruesos
 * de regolito compactado y tanques de agua (dosis solar ×0.05) frente a tormentas CME.
 */
export class Refugio extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private walkBobTime = 0;
  private facingDir: AstronautDirection = 'down';
  private sceneEnteredAt = 0;
  private openPauseAfterRestart = false;

  private stormStatusText!: Phaser.GameObjects.Text;
  private promptContainer!: Phaser.GameObjects.Container;
  private promptBg!: Phaser.GameObjects.Rectangle;
  private promptLabel!: Phaser.GameObjects.Text;

  private stations: RefugeStation[] = [];
  private activeRefill = false;
  private activeHeat = false;
  private unsubscribers: (() => void)[] = [];
  private modal: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Refugio');
  }

  init(data?: { openPauseAfterRestart?: boolean }): void {
    this.openPauseAfterRestart = data?.openPauseAfterRestart ?? false;
  }

  create(): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    state.location = 'refugio';
    Clock.setPaused(state, this.openPauseAfterRestart);
    state.astronaut.suitTempC = balance.heater.suitC;
    this.sceneEnteredAt = this.time.now;

    Save.save(state);

    this.activeRefill = false;
    this.activeHeat = false;
    this.unsubscribers = [];
    this.modal = null;
    this.facingDir = 'down';
    this.walkBobTime = 0;

    // 1. Fondo y muros gruesos de regolito compactado del Refugio Blindado
    const g = this.add.graphics();
    g.fillStyle(0x181425, 1);
    g.fillRect(0, 0, 640, 360);

    // Piso blindado metálico dentro de la cámara (x = 92..548, y = 92..300)
    for (let y = 92; y < 300; y += 26) {
      for (let x = 92; x < 548; x += 28) {
        const alt = ((x - 92) / 28 + Math.floor((y - 92) / 26)) % 2 === 0;
        g.fillStyle(alt ? 0x3a4466 : 0x262b44, 1);
        g.fillRect(x, y, 26, 24);
        g.fillStyle(0x181425, 0.7);
        g.fillRect(x + 26, y, 2, 26);
        g.fillRect(x, y + 24, 28, 2);
      }
    }

    // Franja antideslizante verde de seguridad al centro
    g.fillStyle(0x265c42, 0.45);
    g.fillRect(140, 174, 360, 44);
    g.lineStyle(2, 0x63c74d, 0.65);
    g.strokeRect(140, 174, 360, 44);

    // Muros gruesos de ladrillos de regolito compactado alrededor del búnker
    const drawBrickWall = (wx: number, wy: number, ww: number, wh: number): void => {
      g.fillStyle(0x733e39, 1);
      g.fillRect(wx, wy, ww, wh);
      g.lineStyle(2, 0x181425, 1);
      g.strokeRect(wx, wy, ww, wh);
      g.fillStyle(0xb86f50, 0.85);
      for (let by = wy + 4; by < wy + wh - 5; by += 9) {
        for (let bx = wx + 4; bx < wx + ww - 7; bx += 16) {
          g.fillRect(bx, by, 11, 5);
        }
      }
    };
    drawBrickWall(76, 66, 488, 24);
    drawBrickWall(76, 298, 200, 20);
    drawBrickWall(364, 298, 200, 20);
    drawBrickWall(76, 66, 20, 252);
    drawBrickWall(544, 66, 20, 252);

    // Monitor central de radiación y tormenta en la pared superior (x = 320, y = 70)
    this.add.rectangle(320, 70, 148, 36, 0x262b44).setStrokeStyle(2, 0x181425);
    this.add.rectangle(320, 70, 138, 28, 0x181425);
    this.add.image(266, 70, 'icon_rad').setScale(1.3);
    this.add
      .text(280, 63, uiText.base.refugeDoseBadge, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '9px',
        color: '#63c74d',
      })
      .setOrigin(0, 0.5);
    this.stormStatusText = this.add
      .text(280, 76, uiText.base.refugeSign, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '8px',
        color: '#fee761',
      })
      .setOrigin(0, 0.5);

    // 3. Calentador de emergencia (Karmin: heater_base + extensión heater_radiator) a la izquierda
    const obstacles = this.physics.add.staticGroup();
    const addBlock = (x: number, y: number, w: number, h: number): void => {
      const r = this.add.rectangle(x, y, w, h, 0x000000, 0);
      this.physics.add.existing(r, true);
      obstacles.add(r);
    };

    const heaterGlow = this.add.circle(208, 144, 26, 0xf77622, 0.2);
    this.tweens.add({
      targets: heaterGlow,
      alpha: 0.38,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    const heaterBase = this.add
      .image(186, 138, 'heater_base')
      .setScale(0.95)
      .setDepth(142)
      .setInteractive({ useHandCursor: true });
    this.add.rectangle(206, 140, 12, 5, 0x3a4466).setDepth(141);
    const heaterExtKey = this.textures.exists('heater_radiator') ? 'heater_radiator' : 'heater_base';
    const heaterExt = this.add
      .image(226, 142, heaterExtKey)
      .setScale(0.85)
      .setDepth(142)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(204, 165, uiText.base.heaterStationSign, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '8px',
        color: '#feae34',
      })
      .setOrigin(0.5);
    addBlock(205, 144, 62, 16);
    heaterBase.on('pointerdown', () => this.triggerHeatSuit());
    heaterExt.on('pointerdown', () => this.triggerHeatSuit());

    // 4. Estación de reserva de O₂ de emergencia a la derecha (x = 434, y = 134)
    const o2Left = this.add
      .rectangle(426, 132, 13, 30, 0x0099db)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    const o2Right = this.add
      .rectangle(442, 132, 13, 30, 0x2ce8f5)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    this.add.image(434, 136, 'icon_o2').setScale(1.1);
    this.add
      .text(434, 156, uiText.base.o2StationSign, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '8px',
        color: '#2ce8f5',
      })
      .setOrigin(0.5);
    addBlock(434, 138, 32, 16);
    o2Left.on('pointerdown', () => this.triggerRefillO2());
    o2Right.on('pointerdown', () => this.triggerRefillO2());

    // 5. Bancos de emergencia del búnker abajo a los lados
    this.add.rectangle(168, 258, 72, 20, 0x5a6988).setStrokeStyle(2, 0x181425).setDepth(258);
    this.add.rectangle(472, 258, 72, 20, 0x5a6988).setStrokeStyle(2, 0x181425).setDepth(258);
    addBlock(168, 260, 68, 16);
    addBlock(472, 260, 68, 16);

    // 6. Compuerta blindada de salida al exterior (regresa directo al mundo afuera del refugio)
    const exitDoor = this.add
      .rectangle(320, 304, 88, 22, 0x3e8948)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(320, 304, uiText.base.exitSign, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '10px',
        color: '#fee761',
      })
      .setOrigin(0.5);
    exitDoor.on('pointerdown', () => this.tryExitToWorld());

    this.stations = [
      { id: 'heaterStation', x: 204, y: 172, prompt: uiText.base.interactHeaterStation },
      { id: 'o2Station', x: 434, y: 168, prompt: uiText.base.interactO2Station },
      { id: 'exitDoor', x: 320, y: 282, prompt: uiText.base.interactExitRefuge },
    ];

    // 7. Astronauta en el Refugio (collider compacto en los pies)
    const startKey = AstronautAppearance.getDirectionalMiniKey(
      this,
      state.customization.hair,
      state.customization.suit,
      'down',
      0
    );
    this.player = this.physics.add
      .sprite(320, 210, startKey)
      .setScale(1)
      .setCollideWorldBounds(true)
      .setDepth(210);
    const pBody = this.player.body as Phaser.Physics.Arcade.Body;
    pBody.setSize(14, 14);
    pBody.setOffset(9, 44);

    this.physics.world.setBounds(96, 86, 448, 214);
    this.physics.add.collider(this.player, obstacles);

    // 8. Etiqueta flotante de interacción
    this.promptBg = this.add
      .rectangle(0, 0, 170, 20, 0x262b44, 0.96)
      .setStrokeStyle(2, 0x181425);
    this.promptLabel = this.add
      .text(0, 0, '', {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#fee761',
      })
      .setOrigin(0.5);
    this.promptContainer = this.add
      .container(0, 0, [this.promptBg, this.promptLabel])
      .setDepth(520)
      .setVisible(false);

    // 9. Controles
    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.resetKeys();
      this.cursors = keyboard.createCursorKeys();
      this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyS = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.keyE = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
      this.keySpace = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.keyEsc = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

      this.keyE.on('down', () => this.handleStationInteraction());
      this.keySpace.on('down', () => this.handleStationInteraction());
      this.keyEsc.on('down', () => {
        if (this.modal) {
          this.closeModal();
          return;
        }
        const paused = Clock.togglePause(gameStore.state);
        bus.emit('clock:pauseChanged', { paused });
      });
    }

    const onBlur = (): void => {
      this.input.keyboard?.resetKeys();
    };
    window.addEventListener('blur', onBlur);

    this.unsubscribers.push(
      bus.on('input:action', () => this.handleStationInteraction())
    );

    if (!this.scene.isActive('HUD')) {
      this.scene.launch('HUD', { startPaused: this.openPauseAfterRestart });
    } else if (this.openPauseAfterRestart) {
      bus.emit('clock:pauseChanged', { paused: true });
    }
    this.openPauseAfterRestart = false;
    if (!this.scene.isActive('Dialogo')) {
      this.scene.launch('Dialogo');
    }
    if (!this.scene.isActive('Tormenta')) {
      this.scene.launch('Tormenta');
    }

    AudioSystem.playMusic('blueprints');
    AudioSystem.startLoop('ambient', 'base_hum_loop', 0.45);
    bus.emit('zone:changed', { name: uiText.base.refugeZoneName });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('blur', onBlur);
      for (const unsub of this.unsubscribers) unsub();
      this.unsubscribers = [];
      AudioSystem.stopLoop('ambient');
    });
  }

  update(_time: number, delta: number): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    const storm = Events.getActiveStorm();
    if (storm && storm.phase === 'impact') {
      this.stormStatusText.setText(`${Math.ceil(storm.impactRemainingSec)}s`).setColor('#63c74d');
    } else if (storm && storm.phase === 'countdown') {
      this.stormStatusText.setText(`${Math.ceil(storm.countdownSec)}s`).setColor('#fee761');
    } else {
      this.stormStatusText.setText(uiText.base.refugeSign).setColor('#fee761');
    }

    if (state.clock.paused) {
      this.player.setVelocity(0, 0);
      this.walkBobTime = 0;
      AstronautAppearance.updatePlayerWalk(
        this,
        this.player,
        state.customization.hair,
        state.customization.suit,
        0,
        0,
        0,
        this.facingDir
      );
      return;
    }

    const dt = delta / 1000;
    let vx = 0;
    let vy = 0;
    if (this.cursors) {
      if (this.cursors.left.isDown || this.keyA.isDown) vx -= 1;
      if (this.cursors.right.isDown || this.keyD.isDown) vx += 1;
      if (this.cursors.up.isDown || this.keyW.isDown) vy -= 1;
      if (this.cursors.down.isDown || this.keyS.isDown) vy += 1;
    }
    const joy = getSharedJoystickVector();
    if (vx === 0 && vy === 0) {
      vx = joy.x;
      vy = joy.y;
    }

    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      const len = Math.hypot(vx, vy);
      const speed = balance.player.speed * 1.6;
      this.player.setVelocity((vx / len) * speed, (vy / len) * speed);
      this.walkBobTime += delta;
    } else {
      this.player.setVelocity(0, 0);
      this.walkBobTime = 0;
    }

    this.facingDir = AstronautAppearance.updatePlayerWalk(
      this,
      this.player,
      state.customization.hair,
      state.customization.suit,
      vx,
      vy,
      this.walkBobTime,
      this.facingDir
    );
    this.player.setDepth(Math.round(this.player.y));

    if (this.activeRefill) {
      const gained = BaseSystem.refillO2(state, dt);
      if (gained <= 0 || state.astronaut.o2 >= 100 || state.base.o2Reserve <= 0) {
        this.activeRefill = false;
        Save.save(state);
      }
    }
    if (this.activeHeat) {
      const added = BaseSystem.rechargeHeater(state, dt);
      if (added <= 0 || state.astronaut.heaterBattery >= 100) {
        this.activeHeat = false;
        Save.save(state);
      }
    }

    const durationSec = Clock.getDayDurationSec(state.day, true);
    const clockRes = Clock.tick(state, dt, durationSec);
    if (clockRes.warned16) bus.emit('clock:warn16');
    if (clockRes.curfew17) bus.emit('clock:curfew17');

    const evRes = Events.tick(state, dt);
    if (evRes.stormFalseAlarmResolved) {
      bus.emit('dialog:open', {
        mode: 'big',
        mood: 'happy',
        text: uiText.storm.corviAlertMiss,
        source: uiText.storm.sealSourceMiss,
        label: 'ARCHIVO REAL',
      });
    }

    const vitalsRes = Vitals.tick(state, dt);
    BaseSystem.tick(state, dt, durationSec);

    const rescueCause = vitalsRes.rescueCause ?? evRes.rescueCause;
    if (rescueCause) {
      this.player.setVelocity(0, 0);
      this.scene.stop('HUD');
      this.scene.stop('Dialogo');
      this.scene.stop('Tormenta');
      this.scene.start('Rescate', { cause: rescueCause });
      return;
    }

    this.updateNearestPrompt();
  }

  private triggerRefillO2(): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    if (state.base.energy <= 0 || state.base.o2Reserve <= 0) {
      bus.emit('interact:prompt', { text: uiText.base.noReserveMsg });
      return;
    }
    BaseSystem.refillO2(state, 1);
    this.activeRefill = true;
    Save.save(state);
    bus.emit('interact:prompt', { text: uiText.base.refilledMsg });
  }

  private triggerHeatSuit(): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    BaseSystem.rechargeHeater(state, 1);
    this.activeHeat = true;
    Save.save(state);
    bus.emit('interact:prompt', { text: uiText.base.heatedMsg });
  }

  private tryExitToWorld(confirmedNight = false): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    if (BaseSystem.isNightExit(state) && !confirmedNight) {
      this.openConfirm(uiText.base.nightExitConfirm, uiText.base.nightExitYes, () =>
        this.tryExitToWorld(true)
      );
      return;
    }
    this.closeModal();
    state.location = 'mundo';
    state.astronaut.pos = { x: 748, y: 534 };
    Save.save(state);
    this.scene.start('Mundo');
  }

  private getNearestStation(): RefugeStation | null {
    let best: RefugeStation | null = null;
    let bestDist = Infinity;
    for (const st of this.stations) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, st.x, st.y);
      if (d <= 48 && d < bestDist) {
        bestDist = d;
        best = st;
      }
    }
    return best;
  }

  private updateNearestPrompt(): void {
    const st = this.getNearestStation();
    if (st) {
      this.promptLabel.setText(st.prompt);
      const w = Math.max(120, Math.round(this.promptLabel.width + 20));
      this.promptBg.setSize(w, 20).updateDisplayOrigin();
      this.promptContainer.setPosition(
        Math.min(520, Math.max(120, Math.round(this.player.x))),
        Math.max(100, Math.round(this.player.y - 34))
      );
      this.promptContainer.setVisible(true);
    } else {
      this.promptContainer.setVisible(false);
    }
  }

  private handleStationInteraction(): void {
    if (
      gameStore.state.clock.paused ||
      this.modal ||
      Dialogo.isDialogBlocking() ||
      this.time.now - this.sceneEnteredAt < 350
    ) {
      return;
    }
    const st = this.getNearestStation();
    if (!st) return;
    if (st.id === 'heaterStation') this.triggerHeatSuit();
    else if (st.id === 'o2Station') this.triggerRefillO2();
    else if (st.id === 'exitDoor') this.tryExitToWorld();
  }

  private openConfirm(text: string, yesLabel: string, onYes: () => void): void {
    const uiText = I18n.ui();
    this.closeModal();
    Clock.setPaused(gameStore.state, true);
    this.input.keyboard?.resetKeys();
    AudioSystem.play('ui_question');
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(this.add.rectangle(320, 180, 640, 360, 0x181425, 0.7).setInteractive());
    items.push(this.add.rectangle(320, 180, 380, 130, 0x262b44).setStrokeStyle(3, 0xe43b44));
    items.push(
      this.add
        .text(320, 150, text, {
          fontFamily: 'PixelifySans, monospace',
          fontSize: '11px',
          color: '#ffffff',
          align: 'center',
          wordWrap: { width: 350 },
        })
        .setOrigin(0.5)
    );
    const yes = this.add.rectangle(240, 218, 150, 26, 0xa22633).setStrokeStyle(2, 0x181425).setInteractive({ useHandCursor: true });
    const yesT = this.add.text(240, 218, yesLabel, { fontFamily: 'PixelifySans, monospace', fontSize: '11px', color: '#ffffff' }).setOrigin(0.5);
    const no = this.add.rectangle(400, 218, 150, 26, 0x3e8948).setStrokeStyle(2, 0x181425).setInteractive({ useHandCursor: true });
    const noT = this.add.text(400, 218, uiText.base.sleepConfirmNo, { fontFamily: 'PixelifySans, monospace', fontSize: '11px', color: '#ffffff' }).setOrigin(0.5);
    yes.on('pointerdown', () => {
      this.closeModal();
      onYes();
    });
    no.on('pointerdown', () => this.closeModal());
    items.push(yes, yesT, no, noT);
    this.modal = this.add.container(0, 0, items).setDepth(600);
    this.scene.setVisible(false, 'HUD');
  }

  private closeModal(): void {
    if (!this.modal) return;
    this.modal.destroy(true);
    this.modal = null;
    this.sceneEnteredAt = this.time.now;
    this.input.keyboard?.resetKeys();
    this.scene.setVisible(true, 'HUD');
    Clock.setPaused(gameStore.state, false);
  }
}
