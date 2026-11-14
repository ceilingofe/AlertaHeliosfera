import Phaser from 'phaser';
import balance from '../../content/balance.json';
import uiText from '../../content/ui_text.json';
import { bus } from '../state/bus';
import { gameStore } from '../state/GameState';
import { Save } from '../state/Save';
import { BaseSystem } from '../systems/BaseSystem';
import { Clock } from '../systems/Clock';
import { Vitals } from '../systems/Vitals';
import type { SampleType } from '../types';
import { getSharedJoystickVector } from '../ui/Joystick';

interface InteractPoint {
  kind: 'door' | 'panel' | 'antenna' | 'moxie' | 'refuge' | 'sample';
  x: number;
  y: number;
  prompt: string;
  sampleType?: SampleType;
  marker?: Phaser.GameObjects.Image;
  collected?: boolean;
}

interface ZoneRect {
  name: string;
  bounds: Phaser.Geom.Rectangle;
}

/**
 * Escena exterior en el cráter Jezero (1280×960 px, zoom ×2 sobre 640×360).
 * Conecta movimiento, entrada a la base o refugio, minijuego de roca, noche y signos vitales.
 */
export class Mundo extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;

  private nightOverlay!: Phaser.GameObjects.Rectangle;
  private promptContainer!: Phaser.GameObjects.Container;
  private promptBg!: Phaser.GameObjects.Rectangle;
  private promptLabel!: Phaser.GameObjects.Text;
  private interactPoints: InteractPoint[] = [];
  private activeSamplePoint: InteractPoint | null = null;
  private zones: ZoneRect[] = [];
  private currentZoneName = '';
  private rescueTriggered = false;
  private unsubscribers: (() => void)[] = [];

  constructor() {
    super('Mundo');
  }

  create(): void {
    const state = gameStore.state;
    state.location = 'mundo';
    this.rescueTriggered = false;
    this.interactPoints = [];
    this.activeSamplePoint = null;
    this.unsubscribers = [];

    const mapWidth = 1280;
    const mapHeight = 960;

    // 1. Suelo provisional repetido (sin marca de agua MARU)
    this.add.tileSprite(0, 0, mapWidth, mapHeight, 'ground_placeholder').setOrigin(0, 0);

    // 2. Decoración del terreno (sendero hacia Bright Angel y cráteres estilo s03_mapa)
    const deco = this.add.graphics();
    deco.fillStyle(0xe4a672, 0.55);
    for (let y = 160; y < 450; y += 10) {
      deco.fillRect(637, y, 6, 5);
    }
    this.drawCrater(deco, 718, 396, 36, 22);
    this.drawCrater(deco, 760, 548, 52, 34);
    this.drawCrater(deco, 420, 610, 60, 38);
    this.drawCrater(deco, 880, 340, 48, 30);

    // Cables y tuberías exteriores de la base
    deco.fillStyle(0x181425, 1);
    deco.fillRect(606, 482, 20, 5);
    deco.fillStyle(0xfee761, 1);
    deco.fillRect(606, 483, 20, 3);

    deco.fillStyle(0x181425, 1);
    deco.fillRect(660, 485, 28, 5);
    deco.fillStyle(0x8b9bb4, 1);
    deco.fillRect(660, 486, 28, 3);

    // 3. Grupo estático de colisiones
    const obstacles = this.physics.add.staticGroup();

    const addColliderBox = (x: number, y: number, w: number, h: number): void => {
      const rect = this.add.rectangle(x, y, w, h, 0x000000, 0);
      this.physics.add.existing(rect, true);
      obstacles.add(rect);
    };

    const panelPositions = [
      { id: 'p1', x: 526, y: 486 },
      { id: 'p2', x: 584, y: 486 },
      { id: 'p3', x: 555, y: 522 },
    ];

    for (const p of panelPositions) {
      const panelData = state.base.panels.find((item) => item.id === p.id);
      const isDusty = (panelData?.dust ?? 0) > 0.2;
      this.add.image(p.x, p.y, isDusty ? 'solar_panel_dusty' : 'solar_panel');
      addColliderBox(p.x, p.y, 50, 26);
      this.interactPoints.push({
        kind: 'panel',
        x: p.x,
        y: p.y + 18,
        prompt: uiText.hud.interactPanel,
      });
    }

    const baseImg = this.add
      .image(640, 472, 'base_exterior')
      .setInteractive({ useHandCursor: true });
    baseImg.on('pointerdown', () => this.enterBase('base'));
    addColliderBox(640, 468, 40, 28);
    this.interactPoints.push({
      kind: 'door',
      x: 640,
      y: 494,
      prompt: uiText.hud.interactDoor,
    });

    this.add.image(692, 434, state.base.antennaOk ? 'antenna' : 'antenna_broken');
    addColliderBox(692, 444, 28, 28);
    this.interactPoints.push({
      kind: 'antenna',
      x: 692,
      y: 462,
      prompt: uiText.hud.interactAntenna,
    });

    this.add.image(696, 486, 'moxie');
    addColliderBox(696, 486, 20, 16);
    this.interactPoints.push({
      kind: 'moxie',
      x: 696,
      y: 500,
      prompt: uiText.hud.interactMoxie,
    });

    const refugeImg = this.add
      .image(748, 512, 'refuge')
      .setInteractive({ useHandCursor: true });
    refugeImg.on('pointerdown', () => this.enterBase('refugio'));
    addColliderBox(748, 510, 40, 20);
    this.interactPoints.push({
      kind: 'refuge',
      x: 748,
      y: 526,
      prompt: uiText.hud.interactRefuge,
    });

    // Rocas de manchas de leopardo (cerca de la base para gancho rápido < 60 s y en Bright Angel al norte)
    this.spawnSampleRock(684, 520, 'rock_leopard', 'roca');
    this.spawnSampleRock(640, 250, 'rock_leopard', 'roca');
    this.spawnSampleRock(460, 680, 'rock_volcanic', 'suelo');
    this.spawnSampleRock(860, 480, 'rock_sandstone', 'minerales');

    const decoRocks = [
      { x: 498, y: 518, key: 'rock_sandstone' },
      { x: 668, y: 506, key: 'rock_volcanic' },
      { x: 752, y: 466, key: 'rock_sparkle' },
      { x: 560, y: 380, key: 'rock_sandstone' },
      { x: 780, y: 390, key: 'rock_volcanic' },
    ];
    for (const r of decoRocks) {
      this.add.image(r.x, r.y, r.key);
    }

    this.zones = [
      { name: 'Bright Angel', bounds: new Phaser.Geom.Rectangle(360, 60, 560, 280) },
      { name: 'Séítah', bounds: new Phaser.Geom.Rectangle(80, 560, 440, 340) },
      { name: 'Three Forks', bounds: new Phaser.Geom.Rectangle(820, 340, 380, 340) },
      { name: 'Octavia E. Butler Landing', bounds: new Phaser.Geom.Rectangle(440, 340, 380, 300) },
    ];

    // 4. Astronauta mini (14×23 px)
    const hairKey =
      state.customization.hair === 2 ? 'astronaut_mini_hair2' : 'astronaut_mini_hair1';
    this.player = this.physics.add.sprite(
      state.astronaut.pos.x,
      state.astronaut.pos.y,
      hairKey
    );
    this.player.setCollideWorldBounds(true);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(10, 10);
    body.setOffset(2, 13);

    this.physics.add.collider(this.player, obstacles);

    // 5. Etiqueta flotante de interacción
    this.promptBg = this.add
      .rectangle(0, 0, 86, 14, 0x262b44, 0.95)
      .setStrokeStyle(1, 0x181425);
    this.promptLabel = this.add
      .text(0, 0, '', {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '8px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.promptContainer = this.add
      .container(0, 0, [this.promptBg, this.promptLabel])
      .setDepth(20)
      .setVisible(false);

    // 6. Overlay de noche (después de las 17:00 se tiñe de azul #124e89 con alpha 0.35)
    this.nightOverlay = this.add
      .rectangle(0, 0, mapWidth, mapHeight, 0x124e89, 0)
      .setOrigin(0, 0)
      .setDepth(30);

    // 7. Cámara con zoom ×2
    this.cameras.main.setZoom(2);
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
    this.cameras.main.startFollow(this.player, true);
    this.physics.world.setBounds(0, 0, mapWidth, mapHeight);

    // 8. Controles de teclado
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

      this.keyE.on('down', () => this.handleInteraction());
      this.keySpace.on('down', () => this.handleInteraction());
      this.keyEsc.on('down', () => {
        if (this.scene.isActive('MinijuegoRoca')) return;
        const paused = Clock.togglePause(gameStore.state);
        bus.emit('clock:pauseChanged', { paused });
      });
    }

    this.unsubscribers.push(
      bus.on('input:action', () => {
        this.handleInteraction();
      }),
      bus.on('minigame:finished', (res) => {
        if (res.ok && this.activeSamplePoint) {
          const emptyIdx = state.tubes.findIndex((t) => t === null);
          if (emptyIdx !== -1) {
            state.tubes[emptyIdx] = this.activeSamplePoint.sampleType ?? 'roca';
          }
          if (res.factId && !state.learnedToday.includes(res.factId)) {
            state.learnedToday.push(res.factId);
          }
          this.activeSamplePoint.collected = true;
          this.activeSamplePoint.marker?.setVisible(false);
          bus.emit('interact:prompt', { text: uiText.hud.radioSamplePicked });
        }
        this.activeSamplePoint = null;
      })
    );

    if (!this.scene.isActive('HUD')) {
      this.scene.launch('HUD');
    }
    if (!this.scene.isActive('Dialogo')) {
      this.scene.launch('Dialogo');
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const unsub of this.unsubscribers) {
        unsub();
      }
      this.unsubscribers = [];
    });
  }

  update(_time: number, delta: number): void {
    const state = gameStore.state;
    if (this.rescueTriggered) {
      return;
    }

    if (state.clock.paused || this.scene.isActive('MinijuegoRoca')) {
      this.player.setVelocity(0, 0);
      return;
    }

    const dt = delta / 1000;

    // 1. Movimiento en 4/8 direcciones con WASD, flechas o joystick virtual
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
      const speed = balance.player.speed;
      this.player.setVelocity((vx / len) * speed, (vy / len) * speed);
      if (vx < 0) {
        this.player.setFlipX(true);
      } else if (vx > 0) {
        this.player.setFlipX(false);
      }
    } else {
      this.player.setVelocity(0, 0);
    }

    state.astronaut.pos.x = Math.round(this.player.x);
    state.astronaut.pos.y = Math.round(this.player.y);

    this.updateInteractionPrompt();
    this.updateCurrentZone();

    // El Día 1 dura 150 s de reloj corriendo; días 2+ duran 300 s (sección 7.1 y Fase 3)
    const durationSec = Clock.getDayDurationSec(state.day, true);
    const clockRes = Clock.tick(state, dt, durationSec);
    if (clockRes.warned16) {
      bus.emit('clock:warn16');
    }
    if (clockRes.curfew17) {
      bus.emit('clock:curfew17');
    }
    if (clockRes.ended20) {
      state.supplyBonus = 'menos';
      bus.emit('interact:prompt', { text: uiText.hud.radioCurfewReturn });
      this.cameras.main.fadeOut(350, 24, 20, 37);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.enterBase('base');
      });
      return;
    }

    this.nightOverlay.setAlpha(Clock.isNight(state.clock.minutes) ? 0.35 : 0);

    BaseSystem.tick(state, dt, durationSec);

    const vitalsRes = Vitals.tick(state, dt);
    if (vitalsRes.warnedO2At40) {
      bus.emit('vitals:o2Warn40');
    }
    if (vitalsRes.dangerO2At20) {
      bus.emit('vitals:o2Danger20');
    }

    if (vitalsRes.rescueCause) {
      this.rescueTriggered = true;
      this.player.setVelocity(0, 0);
      bus.emit('rescue', { cause: vitalsRes.rescueCause });
      this.scene.stop('HUD');
      this.scene.stop('Dialogo');
      this.scene.start('Rescate', { cause: vitalsRes.rescueCause });
    }
  }

  private spawnSampleRock(
    x: number,
    y: number,
    spriteKey: string,
    sampleType: SampleType
  ): void {
    const rockImg = this.add
      .image(x, y, spriteKey)
      .setInteractive({ useHandCursor: true });
    const marker = this.add
      .image(x, y - 14, 'marker_sample')
      .setInteractive({ useHandCursor: true });

    this.tweens.add({
      targets: marker,
      y: y - 16,
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const pt: InteractPoint = {
      kind: 'sample',
      x,
      y,
      prompt: uiText.hud.interactRock,
      sampleType,
      marker,
      collected: false,
    };

    const onDirectClick = (): void => {
      if (pt.collected || this.scene.isActive('MinijuegoRoca')) return;
      this.startSampleCollection(pt);
    };

    rockImg.on('pointerdown', onDirectClick);
    marker.on('pointerdown', onDirectClick);

    this.interactPoints.push(pt);
  }

  private drawCrater(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number
  ): void {
    g.fillStyle(0x733e39, 0.85);
    g.fillEllipse(x, y, w, h);
    g.fillStyle(0xb86f50, 0.9);
    g.fillEllipse(x, y + 2, w - 6, h - 5);
  }

  private getNearestInteractPoint(): InteractPoint | null {
    const radius = balance.player.interactRadius;
    let nearest: InteractPoint | null = null;
    let bestDist = Infinity;

    for (const pt of this.interactPoints) {
      if (pt.collected) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, pt.x, pt.y);
      if (d <= radius && d < bestDist) {
        bestDist = d;
        nearest = pt;
      }
    }
    return nearest;
  }

  private updateInteractionPrompt(): void {
    const nearest = this.getNearestInteractPoint();
    if (nearest) {
      this.promptLabel.setText(nearest.prompt);
      const boxWidth = Math.max(76, Math.round(this.promptLabel.width + 12));
      this.promptBg.setSize(boxWidth, 14);
      this.promptContainer.setPosition(
        Math.round(this.player.x),
        Math.round(this.player.y - 22)
      );
      this.promptContainer.setVisible(true);
    } else {
      this.promptContainer.setVisible(false);
    }
  }

  private handleInteraction(): void {
    const state = gameStore.state;
    if (
      state.clock.paused ||
      this.rescueTriggered ||
      this.scene.isActive('MinijuegoRoca')
    ) {
      return;
    }

    const nearest = this.getNearestInteractPoint();
    if (!nearest) return;

    switch (nearest.kind) {
      case 'door':
        this.enterBase('base');
        break;
      case 'refuge':
        this.enterBase('refugio');
        break;
      case 'sample':
        this.startSampleCollection(nearest);
        break;
      default:
        break;
    }
  }

  private startSampleCollection(pt: InteractPoint): void {
    const state = gameStore.state;
    const emptyIdx = state.tubes.findIndex((t) => t === null);
    if (emptyIdx === -1) {
      bus.emit('interact:prompt', { text: uiText.hud.radioBoxFull });
      return;
    }

    this.activeSamplePoint = pt;
    this.player.setVelocity(0, 0);
    this.promptContainer.setVisible(false);

    if (pt.sampleType === 'roca' || !pt.sampleType) {
      this.scene.launch('MinijuegoRoca', {
        type: 'roca',
        day: state.day,
        difficulty: state.day <= 3 ? 1 : state.day <= 9 ? 2 : 3,
        zone: this.currentZoneName,
      });
    } else {
      state.tubes[emptyIdx] = pt.sampleType;
      pt.collected = true;
      pt.marker?.setVisible(false);
      this.activeSamplePoint = null;
      bus.emit('interact:prompt', { text: uiText.hud.radioSamplePicked });
    }
  }

  private enterBase(targetLocation: 'base' | 'refugio'): void {
    const state = gameStore.state;
    state.location = targetLocation;
    Save.save(state);
    this.scene.start('Base');
  }

  private updateCurrentZone(): void {
    let found = uiText.hud.zoneDefault;
    for (const z of this.zones) {
      if (z.bounds.contains(this.player.x, this.player.y)) {
        found = z.name;
        break;
      }
    }
    if (found !== this.currentZoneName) {
      this.currentZoneName = found;
      bus.emit('zone:changed', { name: found });
    }
  }
}
