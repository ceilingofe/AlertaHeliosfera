import Phaser from 'phaser';
import balance from '../../content/balance.json';
import uiText from '../../content/ui_text.json';
import { bus } from '../state/bus';
import { gameStore } from '../state/GameState';
import { Save } from '../state/Save';
import { BaseSystem } from '../systems/BaseSystem';
import { Clock } from '../systems/Clock';
import { Vitals } from '../systems/Vitals';
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
 * entrar al refugio, salir al exterior (antes de las 17:00) y dormir en la cama.
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

  private energyText!: Phaser.GameObjects.Text;
  private energyBarFill!: Phaser.GameObjects.Rectangle;
  private moxieText!: Phaser.GameObjects.Text;
  private moxieBarFill!: Phaser.GameObjects.Rectangle;

  private tableTubeSprites: Phaser.GameObjects.Image[] = [];
  private refugeBanner!: Phaser.GameObjects.Container;

  private promptContainer!: Phaser.GameObjects.Container;
  private promptBg!: Phaser.GameObjects.Rectangle;
  private promptLabel!: Phaser.GameObjects.Text;

  private stations: BaseStation[] = [];
  private activeRefill = false;
  private activeHeat = false;
  private unsubscribers: (() => void)[] = [];

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
    this.unsubscribers = [];

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

    // 2. Panel de la Base arriba a la izquierda (s04_base.png)
    const basePanel = this.add.rectangle(8, 6, 198, 76, 0xc0cbdc).setOrigin(0, 0);
    basePanel.setStrokeStyle(2, 0x181425);

    this.add.text(18, 12, uiText.base.panelTitle, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '12px',
      color: '#5a6988',
    });

    this.add.image(22, 34, 'icon_bolt').setScale(1.8);
    this.add.text(34, 27, uiText.base.energyLabel, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '12px',
      color: '#181425',
    });
    this.energyText = this.add
      .text(198, 27, '100 %', {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '12px',
        color: '#181425',
      })
      .setOrigin(1, 0);

    this.add
      .rectangle(34, 46, 164, 8, 0x3a4466)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x181425);
    this.energyBarFill = this.add
      .rectangle(35, 46, 162, 6, 0xfee761)
      .setOrigin(0, 0.5);

    this.add.image(22, 61, 'icon_o2').setScale(1.8);
    this.add.text(34, 54, uiText.base.moxieLabel, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '12px',
      color: '#181425',
    });
    this.moxieText = this.add
      .text(198, 54, '80 %', {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '12px',
        color: '#181425',
      })
      .setOrigin(1, 0);

    this.add
      .rectangle(34, 72, 164, 8, 0x3a4466)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x181425);
    this.moxieBarFill = this.add
      .rectangle(35, 72, 130, 6, 0x2ce8f5)
      .setOrigin(0, 0.5);

    // 3. Consola central de telemetría (s04_base.png)
    const consoleFrame = this.add.rectangle(316, 54, 188, 76, 0x262b44).setOrigin(0.5);
    consoleFrame.setStrokeStyle(2, 0x181425);
    this.add.rectangle(272, 54, 78, 50, 0x124e89).setOrigin(0.5);
    this.add.rectangle(360, 54, 74, 50, 0x124e89).setOrigin(0.5);
    this.add.rectangle(360, 44, 56, 10, 0xfee761).setOrigin(0.5);

    const chartLine = this.add.graphics();
    chartLine.lineStyle(2, 0x2ce8f5, 1);
    chartLine.beginPath();
    chartLine.moveTo(238, 68);
    chartLine.lineTo(256, 54);
    chartLine.lineTo(274, 60);
    chartLine.lineTo(304, 38);
    chartLine.strokePath();

    // 4. Botones superiores "Recargar", "Calentarme" y "Dormir"
    this.createActionButton(460, 66, 86, 24, 0x262b44, '#ffffff', uiText.base.refillButton, () => {
      this.triggerRefillO2();
    });

    this.createActionButton(552, 66, 92, 24, 0xc0cbdc, '#181425', uiText.base.heatButton, () => {
      this.triggerHeatSuit();
    });

    this.createActionButton(460, 96, 86, 22, 0xb55088, '#ffffff', uiText.base.sleepButton, () => {
      this.goToSleep();
    });

    // 5. Estaciones e interior: Cama, Percha de Corvi, Mesa de muestras, Puerta al Refugio y Puerta de Salida
    const obstacles = this.physics.add.staticGroup();
    const addBlock = (x: number, y: number, w: number, h: number): void => {
      const r = this.add.rectangle(x, y, w, h, 0x000000, 0);
      this.physics.add.existing(r, true);
      obstacles.add(r);
    };

    // Pared superior
    addBlock(320, 44, 640, 88);

    // Cama a la izquierda (s04_base.png: cabecera blanca, sábana gris, cobija magenta #b55088)
    const bedFrame = this.add
      .rectangle(74, 148, 86, 86, 0x181425)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.add.rectangle(74, 118, 82, 22, 0xffffff).setOrigin(0.5);
    this.add.rectangle(74, 134, 82, 10, 0xc0cbdc).setOrigin(0.5);
    this.add.rectangle(74, 164, 82, 50, 0xb55088).setOrigin(0.5);
    addBlock(74, 148, 86, 86);
    bedFrame.on('pointerdown', () => this.goToSleep());

    // Corvi en su percha
    this.add.rectangle(198, 182, 52, 8, 0x8b9bb4).setStrokeStyle(2, 0x181425);
    this.add.rectangle(198, 196, 10, 20, 0x262b44).setStrokeStyle(2, 0x181425);
    const corviSprite = this.add
      .image(198, 142, 'corvi_neutral')
      .setScale(1.8)
      .setInteractive({ useHandCursor: true });
    addBlock(198, 160, 44, 48);
    corviSprite.on('pointerdown', () => {
      bus.emit('clock:warn16');
    });

    // Mesa de muestras a la derecha (s04_base.png)
    const tableTop = this.add
      .rectangle(512, 152, 152, 34, 0xc0cbdc)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    this.add.rectangle(512, 173, 152, 10, 0x181425);
    addBlock(512, 156, 152, 42);

    for (let i = 0; i < 6; i++) {
      const tx = 458 + i * 21;
      const tSprite = this.add.image(tx, 140, 'tube_empty').setScale(2);
      this.tableTubeSprites.push(tSprite);
    }
    this.refreshTableTubes();
    tableTop.on('pointerdown', () => this.deliverSamplesAtTable());

    // Puerta al refugio (arriba a la derecha, como en s04_base.png)
    const refugeFrame = this.add
      .rectangle(560, 118, 66, 44, 0x733e39)
      .setStrokeStyle(3, 0x181425)
      .setInteractive({ useHandCursor: true });
    this.add.rectangle(560, 120, 34, 38, 0x262b44);
    this.add.circle(570, 122, 2, 0xfee761);
    refugeFrame.on('pointerdown', () => this.toggleRefuge());

    // Puerta de salida al exterior (abajo al centro)
    const exitDoor = this.add
      .rectangle(334, 294, 68, 22, 0x3a4466)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(334, 294, uiText.base.interactExitDoor, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '10px',
        color: '#fee761',
      })
      .setOrigin(0.5);
    exitDoor.on('pointerdown', () => this.tryExitToWorld());

    // Indicador visual cuando el astronauta está dentro del Refugio Blindado
    const refBg = this.add
      .rectangle(320, 240, 290, 28, 0x265c42, 0.95)
      .setStrokeStyle(2, 0x63c74d);
    const refTxt = this.add
      .text(320, 240, uiText.base.refugeEnteredMsg, {
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
      { id: 'bed', x: 128, y: 156, prompt: uiText.base.interactBed },
      { id: 'corvi', x: 236, y: 166, prompt: uiText.base.interactCorvi },
      { id: 'console', x: 316, y: 112, prompt: uiText.base.interactConsole },
      { id: 'table', x: 512, y: 192, prompt: uiText.base.interactTable },
      { id: 'refugeDoor', x: 560, y: 132, prompt: uiText.base.interactRefugeDoor },
      { id: 'exitDoor', x: 334, y: 274, prompt: uiText.base.interactExitDoor },
    ];

    // 6. Astronauta en el interior (escala ×2 para coincidir con el interior de s04_base.png)
    const hairKey =
      state.customization.hair === 2 ? 'astronaut_mini_hair2' : 'astronaut_mini_hair1';
    this.player = this.physics.add
      .sprite(300, 168, hairKey)
      .setScale(2)
      .setCollideWorldBounds(true);

    this.physics.world.setBounds(16, 92, 608, 214);
    this.physics.add.collider(this.player, obstacles);

    // 7. Etiqueta flotante de interacción
    this.promptBg = this.add
      .rectangle(0, 0, 170, 20, 0x262b44, 0.96)
      .setStrokeStyle(2, 0x181425);
    this.promptLabel = this.add
      .text(0, 0, '', {
        fontFamily: 'PixelifySans, monospace',
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

      this.keyE.on('down', () => this.handleStationInteraction());
      this.keySpace.on('down', () => this.handleStationInteraction());
      this.keyEsc.on('down', () => {
        const paused = Clock.togglePause(gameStore.state);
        bus.emit('clock:pauseChanged', { paused });
      });
    }

    this.unsubscribers.push(
      bus.on('input:action', () => {
        this.handleStationInteraction();
      })
    );

    if (!this.scene.isActive('HUD')) {
      this.scene.launch('HUD');
    }
    if (!this.scene.isActive('Dialogo')) {
      this.scene.launch('Dialogo');
    }

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
    });
  }

  update(_time: number, delta: number): void {
    const state = gameStore.state;

    // Actualizar barras del Panel de la Base
    const energy = Math.round(state.base.energy);
    const reserve = Math.round(state.base.o2Reserve);
    this.energyText.setText(`${energy} %`);
    this.energyBarFill.width = Math.round((162 * energy) / 100);
    this.moxieText.setText(`${reserve} %`);
    this.moxieBarFill.width = Math.round((162 * reserve) / 100);

    if (state.clock.paused) {
      this.player.setVelocity(0, 0);
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

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy);
      const speed = balance.player.speed * 1.6;
      this.player.setVelocity((vx / len) * speed, (vy / len) * speed);
      if (vx < 0) this.player.setFlipX(true);
      else if (vx > 0) this.player.setFlipX(false);
    } else {
      this.player.setVelocity(0, 0);
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

    // 3. Reloj, signos vitales en base y sistemas de la base (paneles + MOXIE)
    const durationSec = Clock.getDayDurationSec(state.day, true);
    const clockRes = Clock.tick(state, dt, durationSec);
    if (clockRes.warned16) bus.emit('clock:warn16');
    if (clockRes.curfew17) bus.emit('clock:curfew17');

    Vitals.tick(state, dt);
    BaseSystem.tick(state, dt, durationSec);

    this.updateNearestPrompt();
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
    // Aplica un pulso inmediato de 1 s (+25 O2, -12.5 reserva) y continúa hasta llenar
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

  private goToSleep(): void {
    this.scene.stop('HUD');
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
        Math.min(540, Math.max(100, Math.round(this.player.x))),
        Math.max(96, Math.round(this.player.y - 34))
      );
      this.promptContainer.setVisible(true);
    } else {
      this.promptContainer.setVisible(false);
    }
  }

  private handleStationInteraction(): void {
    if (gameStore.state.clock.paused) return;
    const st = this.getNearestStation();
    if (!st) return;

    switch (st.id) {
      case 'bed':
        this.goToSleep();
        break;
      case 'console':
        this.triggerRefillO2();
        this.triggerHeatSuit();
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
        bus.emit('dialog:open', {
          mode: 'big',
          mood: 'happy',
          text: uiText.base.corviGreeting,
          source: 'Perseverance MOXIE',
          label: 'ARCHIVO REAL',
        });
        break;
    }
  }
}
