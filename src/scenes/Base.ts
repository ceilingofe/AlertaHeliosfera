import Phaser from 'phaser';
import balance from '../../content/balance.json';
import uiText from '../../content/ui_text.json';
import { bus } from '../state/bus';
import { gameStore } from '../state/GameState';
import { Save } from '../state/Save';
import { BaseSystem } from '../systems/BaseSystem';
import { Clock } from '../systems/Clock';
import { Data, type CorviQAEntry } from '../systems/Data';
import { Events } from '../systems/Events';
import { Vitals } from '../systems/Vitals';
import { Quota } from '../systems/Quota';
import { AudioSystem } from '../systems/Audio';
import factsData from '../../content/facts.json';
import { AstronautAppearance } from '../ui/AstronautAppearance';
import { DialogBox } from '../ui/DialogBox';
import { getSharedJoystickVector } from '../ui/Joystick';

interface BaseStation {
  id: 'bed' | 'corvi' | 'console' | 'table' | 'refugeDoor' | 'exitDoor';
  x: number;
  y: number;
  prompt: string;
}

/**
 * Escena interior de la base marciana (fiel al storyboard s04_base.png).
 * Permite recargar oxígeno con reserva de MOXIE, calentarse, entregar muestras,
 * entrar al refugio, preguntar a Corvi (menú corvi_qa.json), salir al exterior y dormir.
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
  private playerOriginY = 0;
  private walkBobTime = 0;

  private energyText!: Phaser.GameObjects.Text;
  private energyBarFill!: Phaser.GameObjects.Rectangle;
  private moxieText!: Phaser.GameObjects.Text;
  private moxieBarFill!: Phaser.GameObjects.Rectangle;

  private tableTubeSprites: Phaser.GameObjects.Image[] = [];
  private refugeBanner!: Phaser.GameObjects.Container;

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

  create(): void {
    const state = gameStore.state;
    if (state.location !== 'refugio') {
      state.location = 'base';
    }
    state.astronaut.suitTempC = balance.heater.suitC;

    // Guardar automáticamente al entrar a la base (sección 6)
    Save.save(state);

    this.activeRefill = false;
    this.activeHeat = false;
    this.tableTubeSprites = [];
    this.faqContainer = null;
    this.activeQaDialog = null;
    this.unsubscribers = [];
    this.modal = null;

    // 1. Piso embaldosado y pared superior estilo s04_base.png (TODO_ARTE pendiente de Karmin)
    const g = this.add.graphics();
    g.fillStyle(0x5a6988, 1);
    g.fillRect(0, 0, 640, 88);
    g.fillStyle(0x181425, 1);
    g.fillRect(0, 86, 640, 4);

    for (let y = 90; y < 360; y += 28) {
      for (let x = 0; x < 640; x += 32) {
        const isAlt = ((x / 32) + Math.floor((y - 90) / 28)) % 2 === 0;
        g.fillStyle(isAlt ? 0x8b9bb4 : 0x7a8ba6, 1);
        g.fillRect(x, y, 30, 26);
        g.fillStyle(0x5a6988, 1);
        g.fillRect(x + 30, y, 2, 28);
        g.fillRect(x, y + 26, 32, 2);
      }
    }

    // 2. Monitor central en la pared: estado de la base (no choca con los paneles del HUD)
    this.add.rectangle(309, 57, 196, 58, 0x262b44).setStrokeStyle(2, 0x181425);
    this.add.rectangle(309, 57, 186, 48, 0x124e89);
    this.add.text(218, 34, uiText.base.panelTitle, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '10px',
      color: '#2ce8f5',
    });
    this.add.image(224, 54, 'icon_bolt').setScale(1.4);
    this.energyText = this.add
      .text(398, 47, '100 %', { fontFamily: 'PixelifySans, monospace', fontSize: '10px', color: '#ffffff' })
      .setOrigin(1, 0);
    this.add.rectangle(234, 54, 120, 6, 0x3a4466).setOrigin(0, 0.5);
    this.energyBarFill = this.add.rectangle(234, 54, 120, 6, 0xfee761).setOrigin(0, 0.5);
    this.add.image(224, 72, 'icon_o2').setScale(1.4);
    this.moxieText = this.add
      .text(398, 65, '80 %', { fontFamily: 'PixelifySans, monospace', fontSize: '10px', color: '#ffffff' })
      .setOrigin(1, 0);
    this.add.rectangle(234, 72, 120, 6, 0x3a4466).setOrigin(0, 0.5);
    this.moxieBarFill = this.add.rectangle(234, 72, 120, 6, 0x2ce8f5).setOrigin(0, 0.5);

    // 3. Columna de acciones a la derecha (debajo del reloj; el radar no se muestra adentro)
    this.add.rectangle(518, 62, 122, 134, 0x262b44, 0.92).setOrigin(0, 0).setStrokeStyle(2, 0x181425);
    const actions: [string, number, string, () => void][] = [
      [uiText.base.refillButton, 0x124e89, '#ffffff', () => this.triggerRefillO2()],
      [uiText.base.heatButton, 0xbe4a2f, '#ffffff', () => this.triggerHeatSuit()],
      [uiText.base.examButton, 0x3e8948, '#ffffff', () => this.openTrivia()],
      [uiText.base.journalButton, 0x5a6988, '#ffffff', () => this.openJournal()],
      [uiText.base.suitButton, 0x3a4466, '#fee761', () => {
        this.scene.stop('HUD');
        this.scene.stop('Dialogo');
        this.scene.stop('Tormenta');
        this.scene.start('Personaliza', { nextScene: 'Base' });
      }],
    ];
    actions.forEach(([label, color, textColor, cb], i) => {
      this.createActionButton(524, 68 + i * 25, 110, 21, color, textColor, label, cb);
    });

    // 5. Estaciones e interior: Cama, Percha de Corvi, Mesa de muestras, Puerta al Refugio y Puerta de Salida
    const obstacles = this.physics.add.staticGroup();
    const addBlock = (x: number, y: number, w: number, h: number): void => {
      const r = this.add.rectangle(x, y, w, h, 0x000000, 0);
      this.physics.add.existing(r, true);
      obstacles.add(r);
    };

    addBlock(320, 44, 640, 88);

    // Cama a la izquierda (s04_base.png: cabecera blanca, sábana gris, cobija magenta #b55088)
    const bedFrame = this.add
      .rectangle(64, 252, 86, 76, 0x181425)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.add.rectangle(64, 226, 82, 20, 0xffffff).setOrigin(0.5);
    this.add.rectangle(64, 241, 82, 8, 0xc0cbdc).setOrigin(0.5);
    this.add.rectangle(64, 266, 82, 44, 0xb55088).setOrigin(0.5);
    addBlock(64, 252, 86, 76);
    bedFrame.on('pointerdown', () => this.goToSleep());

    // Corvi en su percha (abre el menú de preguntas corvi_qa.json)
    this.add.rectangle(212, 222, 52, 8, 0x8b9bb4).setStrokeStyle(2, 0x181425);
    this.add.rectangle(212, 236, 10, 20, 0x262b44).setStrokeStyle(2, 0x181425);
    const corviSprite = this.add
      .image(212, 182, 'corvi_neutral')
      .setScale(1.8)
      .setInteractive({ useHandCursor: true });
    addBlock(212, 200, 44, 48);
    corviSprite.on('pointerdown', () => {
      this.openCorviFaqMenu();
    });

    // Mesa de muestras a la derecha (s04_base.png)
    const tableTop = this.add
      .rectangle(420, 196, 152, 34, 0xc0cbdc)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    this.add.rectangle(420, 217, 152, 10, 0x181425);
    addBlock(420, 200, 152, 42);

    for (let i = 0; i < 6; i++) {
      const tx = 366 + i * 21;
      const tSprite = this.add.image(tx, 184, 'tube_empty').setScale(2);
      this.tableTubeSprites.push(tSprite);
    }
    this.refreshTableTubes();
    tableTop.on('pointerdown', () => this.deliverSamplesAtTable());

    // Puerta al refugio (arriba a la derecha, debajo del botón Traje)
    const refugeFrame = this.add
      .rectangle(462, 60, 48, 56, 0x733e39)
      .setStrokeStyle(3, 0x181425)
      .setInteractive({ useHandCursor: true });
    this.add.rectangle(462, 64, 30, 46, 0x262b44);
    this.add.circle(472, 66, 2, 0xfee761);
    this.add
      .text(462, 26, uiText.base.refugeSign, { fontFamily: 'PixelifySans, monospace', fontSize: '9px', color: '#fee761' })
      .setOrigin(0.5);
    refugeFrame.on('pointerdown', () => this.toggleRefuge());

    // Puerta de salida al exterior (abajo al centro, arriba de la barra de herramientas del HUD)
    const exitDoor = this.add
      .rectangle(300, 296, 76, 20, 0x3a4466)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(300, 296, uiText.base.exitSign, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '10px',
        color: '#fee761',
      })
      .setOrigin(0.5);
    exitDoor.on('pointerdown', () => this.tryExitToWorld());

    // Indicador visual cuando el astronauta está dentro del Refugio Blindado
    const refBg = this.add
      .rectangle(300, 128, 286, 26, 0x265c42, 0.95)
      .setStrokeStyle(2, 0x63c74d);
    const refTxt = this.add
      .text(300, 128, uiText.base.refugeEnteredMsg, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.refugeBanner = this.add
      .container(0, 0, [refBg, refTxt])
      .setVisible(state.location === 'refugio')
      .setDepth(25);

    this.stations = [
      { id: 'bed', x: 124, y: 252, prompt: uiText.base.interactBed },
      { id: 'corvi', x: 250, y: 206, prompt: uiText.base.interactCorvi },
      { id: 'console', x: 309, y: 104, prompt: uiText.base.interactConsole },
      { id: 'table', x: 420, y: 238, prompt: uiText.base.interactTable },
      { id: 'refugeDoor', x: 462, y: 104, prompt: uiText.base.interactRefugeDoor },
      { id: 'exitDoor', x: 300, y: 278, prompt: uiText.base.interactExitDoor },
    ];

    // 6. Astronauta en el interior (escala ×2) con su color de traje y peinado actuales
    const hairKey = AstronautAppearance.getMiniTextureKey(
      this,
      state.customization.hair,
      state.customization.suit
    );
    this.player = this.physics.add
      .sprite(300, 168, hairKey)
      .setScale(2)
      .setCollideWorldBounds(true);
    this.playerOriginY = this.player.displayOriginY;

    this.physics.world.setBounds(16, 92, 494, 200);
    this.physics.add.collider(this.player, obstacles);

    // 7. Etiqueta flotante de interacción
    this.promptBg = this.add
      .rectangle(0, 0, 170, 20, 0x262b44, 0.96)
      .setStrokeStyle(2, 0x181425);
    this.promptLabel = this.add
      .text(0, 0, '', {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '12px',
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
      this.scene.launch('HUD');
    }
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
      for (const unsub of this.unsubscribers) {
        unsub();
      }
      this.unsubscribers = [];
      this.closeCorviFaqMenu();
      AudioSystem.stopLoop('ambient');
    });
  }

  update(_time: number, delta: number): void {
    const state = gameStore.state;

    // Actualizar barras del Panel de la Base
    const energy = Math.round(state.base.energy);
    const reserve = Math.round(state.base.o2Reserve);
    this.energyText.setText(`${energy} %`);
    this.energyBarFill.width = Math.round((120 * energy) / 100);
    this.moxieText.setText(`${reserve} %`);
    this.moxieBarFill.width = Math.round((120 * reserve) / 100);

    if (state.clock.paused) {
      this.player.setVelocity(0, 0);
      this.walkBobTime = 0;
      this.player.setDisplayOrigin(this.player.displayOriginX, this.playerOriginY);
      return;
    }

    const dt = delta / 1000;

    // 1. Movimiento del astronauta dentro de la base
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
      if (vx < 0) this.player.setFlipX(true);
      else if (vx > 0) this.player.setFlipX(false);
    } else {
      this.player.setVelocity(0, 0);
    }

    if (moving) {
      this.walkBobTime += delta;
      const bob = Math.sin(this.walkBobTime * 0.018) * 0.8;
      this.player.setDisplayOrigin(this.player.displayOriginX, this.playerOriginY + bob);
    } else {
      this.walkBobTime = 0;
      this.player.setDisplayOrigin(this.player.displayOriginX, this.playerOriginY);
    }

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

  /**
   * Abre el menú de preguntas científicas de Corvi (sección 9.5 y 10.6).
   */
  private openCorviFaqMenu(): void {
    this.closeCorviFaqMenu();
    const state = gameStore.state;
    Clock.setPaused(state, true);

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
        Clock.setPaused(state, false);
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
    Clock.setPaused(gameStore.state, false);
  }

  private createActionButton(
    x: number,
    y: number,
    w: number,
    h: number,
    bgColor: number,
    textColor: string,
    label: string,
    onClick: () => void
  ): void {
    const bg = this.add
      .rectangle(x, y, w, h, bgColor)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(x + w / 2, y + h / 2, label, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '12px',
        color: textColor,
      })
      .setOrigin(0.5);

    bg.on('pointerdown', onClick);
  }

  private triggerRefillO2(): void {
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
    const state = gameStore.state;
    BaseSystem.rechargeHeater(state, 1);
    this.activeHeat = true;
    Save.save(state);
    bus.emit('interact:prompt', { text: uiText.base.heatedMsg });
  }

  private deliverSamplesAtTable(): void {
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
    const totalDelivered =
      state.deliveredToday.roca +
      state.deliveredToday.suelo +
      state.deliveredToday.minerales +
      state.deliveredToday.aire;

    this.tableTubeSprites.forEach((sp, idx) => {
      sp.setTexture(idx < totalDelivered ? 'tube_full' : 'tube_empty');
    });
  }

  private toggleRefuge(): void {
    const state = gameStore.state;
    if (state.location === 'refugio') {
      state.location = 'base';
      this.refugeBanner.setVisible(false);
      bus.emit('zone:changed', { name: uiText.base.zoneName });
      bus.emit('interact:prompt', { text: uiText.base.refugeExitedMsg });
    } else {
      state.location = 'refugio';
      this.refugeBanner.setVisible(true);
      bus.emit('zone:changed', { name: uiText.base.refugeZoneName });
      bus.emit('interact:prompt', { text: uiText.base.refugeEnteredMsg });
    }
    Save.save(state);
  }

  private tryExitToWorld(): void {
    const state = gameStore.state;
    if (!BaseSystem.canExitToWorld(state)) {
      bus.emit('interact:prompt', { text: uiText.base.curfewBlocked });
      return;
    }
    state.location = 'mundo';
    state.astronaut.pos = { x: 640, y: 512 };
    Save.save(state);
    this.scene.start('Mundo');
  }

  private goToSleep(confirmed = false): void {
    const state = gameStore.state;
    // Los tubos en la caja se entregan solos antes de revisar la cuota
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
    let best: BaseStation | null = null;
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
      const w = Math.max(120, Math.round(this.promptLabel.width + 18));
      this.promptBg.setSize(w, 20);
      this.promptContainer.setPosition(
        Math.min(440, Math.max(100, Math.round(this.player.x))),
        Math.max(96, Math.round(this.player.y - 34))
      );
      this.promptContainer.setVisible(true);
    } else {
      this.promptContainer.setVisible(false);
    }
  }

  private handleStationInteraction(): void {
    if (gameStore.state.clock.paused || this.faqContainer || this.modal) return;
    const st = this.getNearestStation();
    if (!st) return;

    switch (st.id) {
      case 'bed':
        this.goToSleep();
        break;
      case 'console':
        this.openTrivia();
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
    const state = gameStore.state;
    if (state.triviaDoneDay === state.day) {
      bus.emit('interact:prompt', { text: uiText.trivia.alreadyDone });
      AudioSystem.play('ui_error');
      return;
    }
    AudioSystem.play('ui_open');
    this.player.setVelocity(0, 0);
    this.scene.launch('Trivia', { returnScene: 'Base' });
    this.scene.pause();
  }

  /** Bitácora: todo lo aprendido en la misión, con su fuente. */
  private openJournal(page = 0): void {
    this.closeModal();
    const state = gameStore.state;
    const ids = [...state.journal, ...state.learnedToday.filter((id) => !state.journal.includes(id))];
    const facts = (factsData as { id: string; text: string; source: string; label: string; icon: string }[]).filter((f) =>
      ids.includes(f.id)
    );
    Clock.setPaused(state, true);
    AudioSystem.play('ui_open');
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(this.add.rectangle(320, 180, 640, 360, 0x181425, 0.75).setInteractive());
    items.push(this.add.rectangle(320, 186, 470, 280, 0xead4aa).setStrokeStyle(3, 0x181425));
    items.push(
      this.add.text(100, 56, `${uiText.base.journalTitle} · ${facts.length}/${(factsData as unknown[]).length}`, {
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
        this.add.text(100, 90, uiText.base.journalEmpty, {
          fontFamily: 'PixelifySans, monospace',
          fontSize: '11px',
          color: '#181425',
          wordWrap: { width: 440 },
        })
      );
    }
    facts.slice(p * perPage, p * perPage + perPage).forEach((f, i) => {
      const y = 82 + i * 54;
      items.push(this.add.rectangle(100, y, 440, 48, 0xffffff).setOrigin(0, 0).setStrokeStyle(1, 0xc0cbdc));
      items.push(this.add.image(116, y + 18, `icon_${f.icon}`).setScale(1.8));
      items.push(
        this.add.text(132, y + 6, f.text, {
          fontFamily: 'PixelifySans, monospace',
          fontSize: '11px',
          color: '#181425',
          wordWrap: { width: 400 },
        })
      );
      items.push(
        this.add.text(132, y + 34, `★ ${f.label} · ${f.source}`, {
          fontFamily: 'PixelifySans, monospace',
          fontSize: '9px',
          color: '#5a6988',
        })
      );
    });
    const mkBtn = (x: number, label: string, cb: () => void): void => {
      const bg = this.add.rectangle(x, 306, 96, 22, 0x262b44).setStrokeStyle(2, 0x181425).setInteractive({ useHandCursor: true });
      const t = this.add.text(x, 306, label, { fontFamily: 'PixelifySans, monospace', fontSize: '11px', color: '#ffffff' }).setOrigin(0.5);
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
    this.closeModal();
    Clock.setPaused(gameStore.state, true);
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
    this.scene.setVisible(true, 'HUD');
    Clock.setPaused(gameStore.state, false);
  }
}
