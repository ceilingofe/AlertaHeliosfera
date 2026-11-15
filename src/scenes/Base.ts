import Phaser from 'phaser';
import balance from '../../content/balance.json';
import { bus } from '../state/bus';
import { gameStore } from '../state/GameState';
import { Save } from '../state/Save';
import { AudioSystem } from '../systems/Audio';
import { BaseSystem } from '../systems/BaseSystem';
import { Clock } from '../systems/Clock';
import { Data, type CorviQAEntry } from '../systems/Data';
import { Events } from '../systems/Events';
import { I18n } from '../systems/I18n';
import { Quota } from '../systems/Quota';
import { Vitals } from '../systems/Vitals';
import { AstronautAppearance, type AstronautDirection } from '../ui/AstronautAppearance';
import { DialogBox } from '../ui/DialogBox';
import { getSharedJoystickVector } from '../ui/Joystick';
import type { SampleType } from '../types';
import { Dialogo } from './Dialogo';

type StationId =
  | 'bed'
  | 'corvi'
  | 'o2Station'
  | 'heaterStation'
  | 'console'
  | 'journalDesk'
  | 'suitLocker'
  | 'table'
  | 'refugeDoor'
  | 'exitDoor';

interface BaseStation {
  id: StationId;
  x: number;
  y: number;
  prompt: string;
}

/**
 * Escena interior de la base marciana (fiel al storyboard s04_base.png) + Cámara del Refugio Blindado.
 */
export class Base extends Phaser.Scene {
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

  private energyText!: Phaser.GameObjects.Text;
  private energyBarFill!: Phaser.GameObjects.Rectangle;
  private moxieText!: Phaser.GameObjects.Text;
  private moxieBarFill!: Phaser.GameObjects.Rectangle;

  private corviSprite!: Phaser.GameObjects.Image;
  private nextBlinkAt = 0;
  private tableTubeSprites: Phaser.GameObjects.Image[] = [];
  private refugeBanner!: Phaser.GameObjects.Container;
  private refugeChamberGlow!: Phaser.GameObjects.Rectangle;
  private refugeDoorPanel!: Phaser.GameObjects.Rectangle;

  private promptContainer!: Phaser.GameObjects.Container;
  private promptBg!: Phaser.GameObjects.Rectangle;
  private promptLabel!: Phaser.GameObjects.Text;

  private faqContainer: Phaser.GameObjects.Container | null = null;
  private activeQaDialog: DialogBox | null = null;

  private stations: BaseStation[] = [];
  private activeRefill = false;
  private activeHeat = false;
  private unsubscribers: (() => void)[] = [];
  private modal: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Base');
  }

  init(data?: { openPauseAfterRestart?: boolean }): void {
    this.openPauseAfterRestart = data?.openPauseAfterRestart ?? false;
  }

  create(): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    if (state.location !== 'refugio') {
      state.location = 'base';
    }
    Clock.setPaused(state, this.openPauseAfterRestart);
    state.astronaut.suitTempC = balance.heater.suitC;
    this.sceneEnteredAt = this.time.now;

    // Guardar automáticamente al entrar a la base (sección 6)
    Save.save(state);

    this.activeRefill = false;
    this.activeHeat = false;
    this.tableTubeSprites = [];
    this.faqContainer = null;
    this.activeQaDialog = null;
    this.unsubscribers = [];
    this.modal = null;
    this.facingDir = 'down';
    this.walkBobTime = 0;

    // 1. Piso embaldosado cálido del hábitat principal (x = 0..500) y pared superior (y = 0..88)
    const g = this.add.graphics();
    g.fillStyle(0x5a6988, 1);
    g.fillRect(0, 0, 640, 88);
    g.fillStyle(0x3a4466, 1);
    g.fillRect(0, 74, 500, 12);
    g.fillStyle(0x181425, 1);
    g.fillRect(0, 86, 640, 4);

    for (let y = 90; y < 360; y += 28) {
      for (let x = 0; x < 504; x += 32) {
        const isAlt = ((x / 32) + Math.floor((y - 90) / 28)) % 2 === 0;
        g.fillStyle(isAlt ? 0x8b9bb4 : 0x7a8ba6, 1);
        g.fillRect(x, y, 30, 26);
        g.fillStyle(0x5a6988, 1);
        g.fillRect(x + 30, y, 2, 28);
        g.fillRect(x, y + 26, 32, 2);
      }
    }

    // Tapetes acogedores en el piso (junto a la cama/calentador y bajo la mesa/estación de Corvi)
    g.fillStyle(0x733e39, 0.85);
    g.fillRect(108, 218, 62, 66);
    g.lineStyle(2, 0xe4a672, 0.9);
    g.strokeRect(110, 220, 58, 62);

    g.fillStyle(0x262b44, 0.45);
    g.fillEllipse(228, 214, 58, 26);

    // Póster espacial en la pared izquierda (Tierra y Marte)
    this.add.rectangle(152, 48, 38, 42, 0x181425).setStrokeStyle(2, 0xead4aa);
    this.add.circle(144, 42, 6, 0x0099db);
    this.add.circle(142, 40, 2, 0x63c74d);
    this.add.circle(160, 54, 5, 0xb86f50);

    // 2. CÁMARA DEL REFUGIO BLINDADO (x = 500..632, y = 88..296)
    // Claramente diferenciada de la base con muros gruesos de ladrillos de regolito compactado
    this.drawRefugeChamber(g, state.location === 'refugio');

    // 3. Monitor central en la pared: estado de la base + Examen diario (x = 318, y = 55)
    const consoleMonitor = this.add
      .rectangle(318, 55, 148, 56, 0x262b44)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    this.add.rectangle(318, 55, 138, 46, 0x124e89);
    this.add.text(253, 33, uiText.base.panelTitle, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '9px',
      color: '#2ce8f5',
    });
    this.add.image(259, 52, 'icon_bolt').setScale(1.3);
    this.energyText = this.add
      .text(383, 46, '100 %', { fontFamily: 'PixelifySans, monospace', fontSize: '9px', color: '#ffffff' })
      .setOrigin(1, 0);
    this.add.rectangle(268, 52, 82, 6, 0x3a4466).setOrigin(0, 0.5);
    this.energyBarFill = this.add.rectangle(268, 52, 82, 6, 0xfee761).setOrigin(0, 0.5);
    this.add.image(259, 68, 'icon_o2').setScale(1.3);
    this.moxieText = this.add
      .text(383, 62, '80 %', { fontFamily: 'PixelifySans, monospace', fontSize: '9px', color: '#ffffff' })
      .setOrigin(1, 0);
    this.add.rectangle(268, 68, 82, 6, 0x3a4466).setOrigin(0, 0.5);
    this.moxieBarFill = this.add.rectangle(268, 68, 82, 6, 0x2ce8f5).setOrigin(0, 0.5);
    consoleMonitor.on('pointerdown', () => this.openTrivia());

    // 4. Estaciones físicas interactivas del hábitat
    const obstacles = this.physics.add.staticGroup();
    const addBlock = (x: number, y: number, w: number, h: number): void => {
      const r = this.add.rectangle(x, y, w, h, 0x000000, 0);
      this.physics.add.existing(r, true);
      obstacles.add(r);
    };

    // Pared superior
    addBlock(320, 44, 640, 88);

    // 4a. Estación de Oxígeno MOXIE (tanques cian con manómetro en la pared norte, x = 218, y = 84)
    const o2Pad = this.add.ellipse(218, 108, 42, 16, 0x124e89, 0.55).setStrokeStyle(1, 0x2ce8f5);
    const o2TankLeft = this.add
      .rectangle(209, 76, 14, 34, 0x0099db)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    const o2TankRight = this.add
      .rectangle(227, 76, 14, 34, 0x2ce8f5)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    this.add.circle(218, 66, 5, 0xffffff).setStrokeStyle(1, 0x181425);
    this.add.image(218, 84, 'icon_o2').setScale(1.2);
    this.add
      .text(218, 127, uiText.base.o2StationSign, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '8px',
        color: '#2ce8f5',
      })
      .setOrigin(0.5);
    addBlock(218, 82, 38, 22);
    o2TankLeft.on('pointerdown', () => this.triggerRefillO2());
    o2TankRight.on('pointerdown', () => this.triggerRefillO2());
    o2Pad.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.triggerRefillO2());

    // 4b. Calentador Térmico junto a la cama (radiador naranja cálido, x = 138, y = 188)
    const heaterGlow = this.add.circle(138, 192, 24, 0xf77622, 0.22);
    this.tweens.add({
      targets: heaterGlow,
      alpha: 0.42,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    const heaterBody = this.add
      .rectangle(138, 188, 34, 28, 0x3a4466)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    // Bobinas térmicas naranjas
    for (let i = 0; i < 3; i++) {
      this.add.rectangle(130 + i * 8, 188, 5, 18, 0xf77622);
    }
    this.add
      .text(138, 166, uiText.base.heaterStationSign, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '8px',
        color: '#feae34',
      })
      .setOrigin(0.5);
    addBlock(138, 188, 34, 28);
    heaterBody.on('pointerdown', () => this.triggerHeatSuit());

    // 4c. Escritorio de Bitácora con lámpara cálida, taza y planta hidropónica (x = 420, y = 84)
    const deskRect = this.add
      .rectangle(420, 84, 46, 26, 0x733e39)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    // Cuaderno abierto
    this.add.rectangle(414, 83, 18, 13, 0xead4aa).setStrokeStyle(1, 0x181425);
    this.add.rectangle(414, 83, 2, 13, 0xbe4a2f);
    // Lámpara cálida de escritorio
    this.add.circle(433, 78, 10, 0xfee761, 0.28);
    this.add.circle(433, 78, 4, 0xfee761).setStrokeStyle(1, 0x181425);
    // Planta hidropónica marciana junto al escritorio (toque de vida en la base)
    this.add.rectangle(450, 86, 12, 10, 0xb86f50).setStrokeStyle(1, 0x181425);
    this.add.circle(450, 78, 6, 0x3e8948);
    this.add.circle(447, 76, 4, 0x63c74d);
    this.add.circle(453, 76, 4, 0x63c74d);
    this.add
      .text(420, 60, uiText.base.journalButton, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '8px',
        color: '#ead4aa',
      })
      .setOrigin(0.5);
    addBlock(420, 86, 48, 24);
    deskRect.on('pointerdown', () => this.openJournal());

    // 4d. Armario de Trajes (x = 476, y = 78)
    const suitLocker = this.add
      .rectangle(476, 74, 36, 48, 0x3a4466)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    this.add.rectangle(476, 76, 26, 36, 0x262b44);
    const miniSuitPreview = AstronautAppearance.getMiniTextureKey(
      this,
      state.customization.hair,
      state.customization.suit
    );
    this.add.image(476, 77, miniSuitPreview).setScale(0.65);
    this.add
      .text(476, 42, uiText.base.suitButton, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '8px',
        color: '#fee761',
      })
      .setOrigin(0.5);
    addBlock(476, 82, 36, 28);
    suitLocker.on('pointerdown', () => this.openSuitCustomization());

    // 4e. Cama a la izquierda (sprite Cama_base.png de Karmin)
    let bedFrame: Phaser.GameObjects.GameObject;
    if (this.textures.exists('bed_base')) {
      bedFrame = this.add
        .image(64, 252, 'bed_base')
        .setScale(2)
        .setInteractive({ useHandCursor: true });
    } else {
      bedFrame = this.add
        .rectangle(64, 252, 82, 74, 0x181425)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      this.add.rectangle(64, 226, 78, 18, 0xffffff).setOrigin(0.5);
      this.add.rectangle(64, 265, 78, 42, 0xb55088).setOrigin(0.5);
    }
    addBlock(64, 252, 72, 78);
    bedFrame.on('pointerdown', () => this.goToSleep());

    // 4f. Corvi en su percha: diseño original de Corvi, a tamaño de cuervito
    this.add.rectangle(228, 212, 36, 6, 0xe4a672).setStrokeStyle(2, 0x181425);
    this.add.rectangle(228, 224, 8, 20, 0x262b44).setStrokeStyle(2, 0x181425);
    this.add.rectangle(228, 234, 22, 5, 0x3a4466).setStrokeStyle(1, 0x181425);
    const corviKey = this.textures.exists('corvi_neutral') ? 'corvi_neutral' : 'corvi_perch';
    this.corviSprite = this.add
      .image(228, 194, corviKey)
      .setScale(corviKey === 'corvi_neutral' ? 0.8 : 1.6)
      .setInteractive({ useHandCursor: true });
    this.tweens.add({
      targets: this.corviSprite,
      y: 192,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.nextBlinkAt = this.time.now + 2400;
    addBlock(228, 212, 36, 36);
    this.corviSprite.on('pointerdown', () => {
      this.openCorviFaqMenu();
    });

    // 4g. Mesa de laboratorio: 6 tubos de ensayo para las muestras entregadas, matraces y microscopio
    const tableTop = this.add
      .rectangle(382, 204, 148, 34, 0xc0cbdc)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    this.add.rectangle(382, 224, 148, 10, 0x181425);
    this.add.rectangle(366, 206, 80, 6, 0x5a6988).setStrokeStyle(1, 0x181425);
    this.add.rectangle(444, 192, 12, 16, 0x3a4466).setStrokeStyle(1, 0x181425);
    this.add.circle(444, 184, 4, 0x2ce8f5);
    if (this.textures.exists('flask_conical')) {
      this.add.image(424, 198, 'flask_conical').setTint(0x63c74d);
    }
    if (this.textures.exists('flask_blue')) {
      this.add.image(312, 198, 'flask_blue');
    }
    addBlock(382, 208, 148, 40);

    const tubeKey = this.textures.exists('tube_sample') ? 'tube_sample' : 'tube_empty';
    for (let i = 0; i < 6; i++) {
      const tx = 336 + i * 12;
      const tSprite = this.add
        .image(tx, 194, tubeKey)
        .setScale(tubeKey === 'tube_sample' ? 1 : 2);
      this.tableTubeSprites.push(tSprite);
    }
    this.refreshTableTubes();
    tableTop.on('pointerdown', () => this.deliverSamplesAtTable());

    // 4h. Puerta de salida al exterior (abajo al centro, arriba de la barra de herramientas del HUD)
    const exitDoor = this.add
      .rectangle(284, 298, 82, 20, 0x3a4466)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(284, 298, uiText.base.exitSign, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '10px',
        color: '#fee761',
      })
      .setOrigin(0.5);
    exitDoor.on('pointerdown', () => this.tryExitToWorld());

    // 5. Indicador visual superior cuando el astronauta está dentro del Refugio Blindado
    const refBg = this.add
      .rectangle(300, 118, 286, 24, 0x265c42, 0.95)
      .setStrokeStyle(2, 0x63c74d);
    const refTxt = this.add
      .text(300, 118, uiText.base.refugeEnteredMsg, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.refugeBanner = this.add
      .container(0, 0, [refBg, refTxt])
      .setVisible(state.location === 'refugio')
      .setDepth(25);

    this.stations = [
      { id: 'bed', x: 112, y: 252, prompt: uiText.base.interactBed },
      { id: 'heaterStation', x: 138, y: 214, prompt: uiText.base.interactHeaterStation },
      { id: 'o2Station', x: 218, y: 110, prompt: uiText.base.interactO2Station },
      { id: 'corvi', x: 228, y: 232, prompt: uiText.base.interactCorvi },
      { id: 'console', x: 318, y: 108, prompt: uiText.base.interactConsole },
      { id: 'journalDesk', x: 420, y: 112, prompt: uiText.base.interactJournalDesk },
      { id: 'suitLocker', x: 476, y: 112, prompt: uiText.base.interactSuitLocker },
      { id: 'table', x: 382, y: 242, prompt: uiText.base.interactTable },
      { id: 'refugeDoor', x: 484, y: 190, prompt: uiText.base.interactRefugeDoor },
      { id: 'exitDoor', x: 284, y: 280, prompt: uiText.base.interactExitDoor },
    ];

    // 6. Astronauta en el interior (sprite 32×64 a escala 1 = 32×64 px)
    const startKey = AstronautAppearance.getDirectionalMiniKey(
      this,
      state.customization.hair,
      state.customization.suit,
      'down',
      0
    );
    const startX = state.location === 'refugio' ? 566 : 284;
    const startY = state.location === 'refugio' ? 192 : 164;
    this.player = this.physics.add
      .sprite(startX, startY, startKey)
      .setScale(1)
      .setCollideWorldBounds(true)
      .setDepth(15);

    this.applyLocationBounds(state.location === 'refugio');
    this.physics.add.collider(this.player, obstacles);

    // 7. Etiqueta flotante de interacción
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
      .setDepth(30)
      .setVisible(false);

    // 8. Teclado: WASD, flechas, E, Espacio y Esc
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

      this.keyE.on('down', () => {
        if (this.activeQaDialog) {
          this.activeQaDialog.advanceOrFinish();
          return;
        }
        this.handleStationInteraction();
      });
      this.keySpace.on('down', () => {
        if (this.activeQaDialog) {
          this.activeQaDialog.advanceOrFinish();
          return;
        }
        this.handleStationInteraction();
      });
      this.keyEsc.on('down', () => {
        if (this.modal) {
          this.closeModal();
          return;
        }
        if (this.faqContainer) {
          this.closeCorviFaqMenu();
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
      bus.on('input:action', () => {
        if (this.activeQaDialog) {
          this.activeQaDialog.advanceOrFinish();
          return;
        }
        this.handleStationInteraction();
      })
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
    AudioSystem.startLoop('ambient', 'base_hum_loop', 0.5);
    this.unsubscribers.push(
      bus.on('trivia:finished', () => {
        this.input.keyboard?.resetKeys();
      })
    );

    bus.emit('zone:changed', {
      name:
        state.location === 'refugio'
          ? uiText.base.refugeZoneName
          : uiText.base.zoneName,
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('blur', onBlur);
      for (const unsub of this.unsubscribers) {
        unsub();
      }
      this.unsubscribers = [];
      this.closeCorviFaqMenu();
      AudioSystem.stopLoop('ambient');
    });
  }

  /**
   * Dibuja la Cámara del Refugio Blindado a la derecha (x = 500..632, y = 90..294)
   */
  private drawRefugeChamber(g: Phaser.GameObjects.Graphics, insideRefuge: boolean): void {
    const uiText = I18n.ui();
    g.fillStyle(0x262b44, 1);
    g.fillRect(504, 90, 128, 204);
    for (let ry = 98; ry < 288; ry += 24) {
      g.fillStyle(0x181425, 0.6);
      g.fillRect(512, ry, 112, 2);
    }

    this.refugeChamberGlow = this.add
      .rectangle(568, 192, 112, 184, 0x3e8948, insideRefuge ? 0.28 : 0.06)
      .setStrokeStyle(1, 0x63c74d, insideRefuge ? 0.85 : 0.3);

    const drawBrickWall = (wx: number, wy: number, ww: number, wh: number): void => {
      g.fillStyle(0x733e39, 1);
      g.fillRect(wx, wy, ww, wh);
      g.lineStyle(2, 0x181425, 1);
      g.strokeRect(wx, wy, ww, wh);
      g.fillStyle(0xb86f50, 0.85);
      for (let by = wy + 3; by < wy + wh - 4; by += 8) {
        for (let bx = wx + 3; bx < wx + ww - 6; bx += 14) {
          g.fillRect(bx, by, 10, 5);
        }
      }
    };

    drawBrickWall(500, 88, 134, 14);
    drawBrickWall(500, 282, 134, 14);
    drawBrickWall(622, 88, 12, 208);
    drawBrickWall(498, 88, 14, 78);
    drawBrickWall(498, 214, 14, 82);

    this.add.rectangle(604, 152, 18, 52, 0x0099db).setStrokeStyle(2, 0x181425);
    this.add
      .text(604, 152, 'H₂O', {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '8px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.add.rectangle(568, 256, 72, 18, 0x5a6988).setStrokeStyle(2, 0x181425);
    this.add.circle(564, 152, 16, 0x181425).setStrokeStyle(2, 0x63c74d);
    this.add.image(564, 152, 'icon_rad').setScale(1.5);

    this.add
      .text(566, 112, uiText.base.refugeSign, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '9px',
        color: '#63c74d',
      })
      .setOrigin(0.5);
    this.add
      .text(566, 224, uiText.base.refugeDoseBadge, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '9px',
        color: '#fee761',
      })
      .setOrigin(0.5);

    this.refugeDoorPanel = this.add
      .rectangle(505, 190, 16, 48, insideRefuge ? 0x3e8948 : 0xe4a672)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    this.add.circle(505, 190, 4, 0x181425);
    this.refugeDoorPanel.on('pointerdown', () => this.toggleRefuge());
    this.refugeChamberGlow.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.toggleRefuge());
  }

  private applyLocationBounds(insideRefuge: boolean): void {
    if (insideRefuge) {
      this.physics.world.setBounds(514, 108, 104, 168);
    } else {
      this.physics.world.setBounds(16, 94, 476, 198);
    }
  }

  update(time: number, delta: number): void {
    const uiText = I18n.ui();
    const state = gameStore.state;

    // Parpadeo periódico de Corvi en su percha
    if (this.corviSprite && time >= this.nextBlinkAt) {
      const original = this.corviSprite.texture.key === 'corvi_neutral';
      this.corviSprite.setTexture(original ? 'corvi_blink' : 'corvi_perch_blink');
      this.time.delayedCall(150, () => {
        if (this.corviSprite?.active) this.corviSprite.setTexture(original ? 'corvi_neutral' : 'corvi_perch');
      });
      this.nextBlinkAt = time + Phaser.Math.Between(2800, 4600);
    }

    // Actualizar barras del Panel de la Base
    const energy = Math.round(state.base.energy);
    const reserve = Math.round(state.base.o2Reserve);
    this.energyText.setText(`${energy} %`);
    const ew = Math.round((82 * energy) / 100);
    this.energyBarFill
      .setVisible(ew > 0)
      .setSize(Math.max(1, ew), 6)
      .updateDisplayOrigin();
    this.moxieText.setText(`${reserve} %`);
    const rw = Math.round((82 * reserve) / 100);
    this.moxieBarFill
      .setVisible(rw > 0)
      .setSize(Math.max(1, rw), 6)
      .updateDisplayOrigin();

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

    // 1. Movimiento del astronauta dentro de la base (con vistas en 4 direcciones y pasos animados)
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

    // 2. Recarga continua de oxígeno y calefactor cuando están activas
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

    // 3. Reloj, eventos (incluyendo impacto de tormenta en base/refugio), signos vitales y base
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

  private openSuitCustomization(): void {
    this.player.setVelocity(0, 0);
    this.scene.stop('HUD');
    this.scene.stop('Dialogo');
    this.scene.stop('Tormenta');
    this.scene.start('Personaliza', { nextScene: 'Base' });
  }

  /**
   * Abre el menú de preguntas científicas de Corvi (sección 9.5 y 10.6).
   */
  private openCorviFaqMenu(): void {
    const uiText = I18n.ui();
    this.closeCorviFaqMenu();
    const state = gameStore.state;
    Clock.setPaused(state, true);
    this.input.keyboard?.resetKeys();

    const questions = Data.getUnlockedCorviQA(state);
    const dim = this.add
      .rectangle(320, 180, 640, 360, 0x181425, 0.72)
      .setInteractive();

    const panel = this.add
      .rectangle(320, 166, 460, 250, 0x262b44)
      .setStrokeStyle(3, 0xfee761);

    const title = this.add
      .text(320, 56, uiText.corviFaq.menuTitle, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '16px',
        color: '#fee761',
      })
      .setOrigin(0.5);

    const closeBtn = this.add
      .rectangle(504, 56, 82, 22, 0x181425)
      .setStrokeStyle(1, 0xc0cbdc)
      .setInteractive({ useHandCursor: true });
    const closeTxt = this.add
      .text(504, 56, uiText.corviFaq.closeButton, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '10px',
        color: '#c0cbdc',
      })
      .setOrigin(0.5);

    closeBtn.on('pointerdown', () => this.closeCorviFaqMenu());

    const items: Phaser.GameObjects.GameObject[] = [
      dim,
      panel,
      title,
      closeBtn,
      closeTxt,
    ];

    questions.slice(0, 8).forEach((qa, idx) => {
      const qy = 82 + idx * 24;
      const isNew = !state.corviSeen.includes(qa.id);

      const rowBg = this.add
        .rectangle(320, qy, 432, 20, 0x3a4466)
        .setStrokeStyle(1, 0x181425)
        .setInteractive({ useHandCursor: true });

      const qText = this.add.text(114, qy - 6, `▶ ${qa.q}`, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#ffffff',
      });

      items.push(rowBg, qText);

      if (isNew) {
        const badgeBg = this.add
          .rectangle(508, qy, 44, 14, 0xfee761)
          .setStrokeStyle(1, 0x181425);
        const badgeTxt = this.add
          .text(508, qy, uiText.corviFaq.newBadge, {
            fontFamily: 'PixelifySans, monospace',
            fontSize: '9px',
            color: '#181425',
          })
          .setOrigin(0.5);
        items.push(badgeBg, badgeTxt);
      }

      rowBg.on('pointerdown', () => {
        this.playCorviAnswerSequence(qa);
      });
    });

    this.faqContainer = this.add.container(0, 0, items).setDepth(85);
    this.scene.setVisible(false, 'HUD');
  }

  private playCorviAnswerSequence(qa: CorviQAEntry): void {
    const state = gameStore.state;
    if (!state.corviSeen.includes(qa.id)) {
      state.corviSeen.push(qa.id);
      Save.save(state);
    }

    this.faqContainer?.destroy(true);
    this.faqContainer = null;

    let pageIdx = 0;
    const showNextPage = (): void => {
      this.activeQaDialog?.destroy();
      this.activeQaDialog = null;

      if (pageIdx >= qa.a.length) {
        this.sceneEnteredAt = this.time.now;
        Clock.setPaused(state, false);
        this.input.keyboard?.resetKeys();
        this.scene.setVisible(true, 'HUD');
        return;
      }

      const page = qa.a[pageIdx];
      pageIdx += 1;

      this.activeQaDialog = new DialogBox(this, {
        mode: 'big',
        mood: page.mood,
        text: page.text,
        source: page.source,
        label: page.source ? 'ARCHIVO REAL' : undefined,
        onComplete: () => {
          showNextPage();
        },
      });
    };

    showNextPage();
  }

  private closeCorviFaqMenu(): void {
    if (this.scene.isActive('HUD') || this.scene.isPaused('HUD')) this.scene.setVisible(true, 'HUD');
    this.faqContainer?.destroy(true);
    this.faqContainer = null;
    this.activeQaDialog?.destroy();
    this.activeQaDialog = null;
    this.sceneEnteredAt = this.time.now;
    this.input.keyboard?.resetKeys();
    Clock.setPaused(gameStore.state, false);
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

  private deliverSamplesAtTable(): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    const count = BaseSystem.deliverTubes(state, 1);
    if (count > 0) {
      this.refreshTableTubes();
      Save.save(state);
      bus.emit('interact:prompt', { text: uiText.base.deliveredMsg });
    } else {
      bus.emit('interact:prompt', { text: uiText.base.noTubesMsg });
    }
  }

  private refreshTableTubes(): void {
    const state = gameStore.state;
    const colors: Record<SampleType, number> = {
      roca: 0xb86f50,
      suelo: 0xe4a672,
      minerales: 0xb55088,
      aire: 0x2ce8f5,
    };
    const filled: number[] = [];
    for (const t of ['roca', 'suelo', 'minerales', 'aire'] as SampleType[]) {
      for (let i = 0; i < state.deliveredToday[t]; i++) filled.push(colors[t]);
    }

    this.tableTubeSprites.forEach((sp, idx) => {
      if (sp.texture.key === 'tube_sample') {
        if (idx < filled.length) sp.setTint(filled[idx]).setAlpha(1);
        else sp.clearTint().setAlpha(0.7);
      } else {
        sp.setTexture(idx < filled.length ? 'tube_full' : 'tube_empty');
      }
    });
  }

  private toggleRefuge(): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    this.player.setVelocity(0, 0);
    if (state.location === 'refugio') {
      state.location = 'base';
      this.applyLocationBounds(false);
      this.player.setPosition(468, 190);
      this.facingDir = 'left';
      this.refugeBanner.setVisible(false);
      this.refugeChamberGlow.setFillStyle(0x3e8948, 0.06);
      this.refugeDoorPanel.setFillStyle(0xe4a672, 1);
      bus.emit('zone:changed', { name: uiText.base.zoneName });
      bus.emit('interact:prompt', { text: uiText.base.refugeExitedMsg });
    } else {
      state.location = 'refugio';
      this.applyLocationBounds(true);
      this.player.setPosition(564, 190);
      this.facingDir = 'down';
      this.refugeBanner.setVisible(true);
      this.refugeChamberGlow.setFillStyle(0x3e8948, 0.28);
      this.refugeDoorPanel.setFillStyle(0x3e8948, 1);
      bus.emit('zone:changed', { name: uiText.base.refugeZoneName });
      bus.emit('interact:prompt', { text: uiText.base.refugeEnteredMsg });
    }
    AudioSystem.play('airlock', { volume: 0.5 });
    Save.save(state);
  }

  private tryExitToWorld(confirmedNight = false): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    if (!BaseSystem.canExitToWorld(state)) {
      bus.emit('interact:prompt', { text: uiText.base.curfewBlocked });
      return;
    }
    if (BaseSystem.isNightExit(state) && !confirmedNight) {
      this.openConfirm(uiText.base.nightExitConfirm, uiText.base.nightExitYes, () =>
        this.tryExitToWorld(true)
      );
      return;
    }
    this.closeModal();
    state.location = 'mundo';
    state.astronaut.pos = { x: 640, y: 512 };
    Save.save(state);
    this.scene.start('Mundo');
  }

  private goToSleep(confirmed = false): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    if (this.tubesPending() > 0) this.deliverSamplesAtTable();
    if (!confirmed && !Quota.isAllMet(state)) {
      this.openConfirm(uiText.base.sleepConfirmText, uiText.base.sleepConfirmYes, () => this.goToSleep(true));
      return;
    }
    this.closeModal();
    AudioSystem.stopLoop('ambient');
    this.scene.stop('HUD');
    this.scene.stop('Dialogo');
    this.scene.stop('Tormenta');
    this.scene.start('Noche');
  }

  private getNearestStation(): BaseStation | null {
    const state = gameStore.state;
    if (state.location === 'refugio') {
      return this.stations.find((s) => s.id === 'refugeDoor') ?? null;
    }
    let best: BaseStation | null = null;
    let bestDist = Infinity;
    for (const st of this.stations) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, st.x, st.y);
      if (d <= 44 && d < bestDist) {
        bestDist = d;
        best = st;
      }
    }
    return best;
  }

  private updateNearestPrompt(): void {
    const uiText = I18n.ui();
    const st = this.getNearestStation();
    if (st) {
      const label =
        st.id === 'refugeDoor' && gameStore.state.location === 'refugio'
          ? uiText.base.interactExitRefuge
          : st.prompt;
      this.promptLabel.setText(label);
      const w = Math.max(120, Math.round(this.promptLabel.width + 20));
      this.promptBg.setSize(w, 20).updateDisplayOrigin();
      this.promptContainer.setPosition(
        Math.min(540, Math.max(100, Math.round(this.player.x))),
        Math.max(96, Math.round(this.player.y - 34))
      );
      this.promptContainer.setVisible(true);
    } else {
      this.promptContainer.setVisible(false);
    }
  }

  private handleStationInteraction(): void {
    if (
      gameStore.state.clock.paused ||
      this.faqContainer ||
      this.modal ||
      Dialogo.isDialogBlocking() ||
      this.time.now - this.sceneEnteredAt < 350
    ) {
      return;
    }
    const st = this.getNearestStation();
    if (!st) return;

    switch (st.id) {
      case 'bed':
        this.goToSleep();
        break;
      case 'o2Station':
        this.triggerRefillO2();
        break;
      case 'heaterStation':
        this.triggerHeatSuit();
        break;
      case 'console':
        this.openTrivia();
        break;
      case 'journalDesk':
        this.openJournal();
        break;
      case 'suitLocker':
        this.openSuitCustomization();
        break;
      case 'table':
        this.deliverSamplesAtTable();
        break;
      case 'refugeDoor':
        this.toggleRefuge();
        break;
      case 'exitDoor':
        this.tryExitToWorld();
        break;
      case 'corvi':
        this.openCorviFaqMenu();
        break;
    }
  }

  private tubesPending(): number {
    return gameStore.state.tubes.filter((t) => t !== null).length;
  }

  private openTrivia(): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    if (state.triviaDoneDay === state.day) {
      bus.emit('interact:prompt', { text: uiText.trivia.alreadyDone });
      AudioSystem.play('ui_error');
      return;
    }
    AudioSystem.play('ui_open');
    this.player.setVelocity(0, 0);
    this.input.keyboard?.resetKeys();
    this.scene.launch('Trivia', { returnScene: 'Base' });
    this.scene.pause();
  }

  /** Bitácora visual: todo lo aprendido en la misión, con iconos grandes y sello de fuente sin empalmes. */
  private openJournal(page = 0): void {
    const uiText = I18n.ui();
    const factsData = I18n.facts();
    this.closeModal();
    const state = gameStore.state;
    const ids = [...state.journal, ...state.learnedToday.filter((id) => !state.journal.includes(id))];
    const facts = factsData.filter((f) => ids.includes(f.id));
    Clock.setPaused(state, true);
    this.input.keyboard?.resetKeys();
    AudioSystem.play('ui_open');
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(this.add.rectangle(320, 180, 640, 360, 0x181425, 0.75).setInteractive());
    items.push(this.add.rectangle(320, 184, 484, 286, 0xead4aa).setStrokeStyle(3, 0x181425));
    items.push(
      this.add.text(92, 52, `${uiText.base.journalTitle} · ${facts.length}/${factsData.length}`, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '15px',
        color: '#733e39',
      })
    );
    const perPage = 4;
    const pages = Math.max(1, Math.ceil(facts.length / perPage));
    const p = Math.min(page, pages - 1);
    if (facts.length === 0) {
      items.push(
        this.add.text(96, 92, uiText.base.journalEmpty, {
          fontFamily: 'PixelifySans, monospace',
          fontSize: '11px',
          color: '#181425',
          wordWrap: { width: 444 },
        })
      );
    }
    facts.slice(p * perPage, p * perPage + perPage).forEach((f, i) => {
      const y = 78 + i * 54;
      items.push(this.add.rectangle(92, y, 456, 48, 0xffffff).setOrigin(0, 0).setStrokeStyle(1, 0xc0cbdc));
      items.push(this.add.rectangle(92, y, 36, 48, 0x262b44).setOrigin(0, 0));
      items.push(this.add.image(110, y + 24, `icon_${f.icon}`).setScale(1.8));
      items.push(
        this.add
          .text(542, y + 4, `★ ${I18n.formatLabel(f.label)} · ${f.source}`, {
            fontFamily: 'PixelifySans, monospace',
            fontSize: '8px',
            color: '#124e89',
          })
          .setOrigin(1, 0)
      );
      items.push(
        this.add.text(136, y + 17, f.text, {
          fontFamily: 'PixelifySans, monospace',
          fontSize: '10px',
          color: '#181425',
          wordWrap: { width: 404 },
        })
      );
    });
    const mkBtn = (x: number, label: string, cb: () => void): void => {
      const bg = this.add.rectangle(x, 308, 96, 22, 0x262b44).setStrokeStyle(2, 0x181425).setInteractive({ useHandCursor: true });
      const t = this.add.text(x, 308, label, { fontFamily: 'PixelifySans, monospace', fontSize: '11px', color: '#ffffff' }).setOrigin(0.5);
      bg.on('pointerdown', cb);
      items.push(bg, t);
    };
    if (p > 0) mkBtn(160, '◄', () => this.openJournal(p - 1));
    if (p < pages - 1) mkBtn(480, '►', () => this.openJournal(p + 1));
    mkBtn(320, uiText.corviFaq.closeButton, () => this.closeModal());
    this.modal = this.add.container(0, 0, items).setDepth(86);
    this.scene.setVisible(false, 'HUD');
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
    this.modal = this.add.container(0, 0, items).setDepth(86);
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
