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
 * Conecta movimiento, entrada a la base o refugio, recolección de muestras, noche y signos vitales.
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
    this.unsubscribers = [];

    const mapWidth = 1280;
    const mapHeight = 960;

    // 1. Suelo provisional repetido (sin marca de agua MARU)
    this.add.tileSprite(0, 0, mapWidth, mapHeight, 'ground_placeholder').setOrigin(0, 0);

    // 2. Decoración del terreno (sendero hacia el norte y cráteres estilo storyboard s03_mapa)
    const deco = this.add.graphics();
    deco.fillStyle(0xe4a672, 0.55);
    for (let y = 160; y < 450; y += 10) {
      deco.fillRect(637, y, 6, 5);
    }
    this.drawCrater(deco, 718, 396, 36, 22);
    this.drawCrater(deco, 760, 548, 52, 34);
    this.drawCrater(deco, 420, 610, 60, 38);
    this.drawCrater(deco, 880, 340, 48, 30);

    // Cables y tuberías exteriores de la base (como en s03_mapa.png)
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

    // Paneles solares (3 paneles de 54×32 px)
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

    // Base exterior (44×40 px) con clic directo o tecla E en la puerta
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

    // Antena (34×54 px)
    this.add.image(692, 434, state.base.antennaOk ? 'antenna' : 'antenna_broken');
    addColliderBox(692, 444, 28, 28);
    this.interactPoints.push({
      kind: 'antenna',
      x: 692,
      y: 462,
      prompt: uiText.hud.interactAntenna,
    });

    // MOXIE (20×18 px)
    this.add.image(696, 486, 'moxie');
    addColliderBox(696, 486, 20, 16);
    this.interactPoints.push({
      kind: 'moxie',
      x: 696,
      y: 500,
      prompt: uiText.hud.interactMoxie,
    });

    // Refugio blindado (44×24 px)
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

    // Puntos de muestra en el mapa
    this.spawnSampleRock(692, 524, 'rock_leopard', 'roca');
    this.spawnSampleRock(640, 250, 'rock_leopard', 'roca');
    this.spawnSampleRock(460, 680, 'rock_volcanic', 'suelo');
    this.spawnSampleRock(860, 480, 'rock_sandstone', 'minerales');

    // Rocas decorativas
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

    // Zonas reales de Jezero (sección 8)
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

    // 5. Etiqueta flotante de interacción en coordenadas del mundo
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

    // 7. Cámara con zoom ×2 (el jugador ve 320×180 px del mundo sobre el lienzo de 640×360)
    this.cameras.main.setZoom(2);
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
    this.cameras.main.startFollow(this.player, true);
    this.physics.world.setBounds(0, 0, mapWidth, mapHeight);

    // 8. Controles de teclado: WASD, flechas, E/Espacio para interactuar y Esc para pausa
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
        const paused = Clock.togglePause(gameStore.state);
        bus.emit('clock:pauseChanged', { paused });
      });
    }

    this.unsubscribers.push(
      bus.on('input:action', () => {
        this.handleInteraction();
      })
    );

    // 9. Lanzar escena HUD en paralelo
    if (!this.scene.isActive('HUD')) {
      this.scene.launch('HUD');
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

    if (state.clock.paused) {
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

    // 2. Actualizar etiqueta de interacción a menos de 20 px
    this.updateInteractionPrompt();

    // 3. Actualizar zona actual del cráter Jezero
    this.updateCurrentZone();

    // 4. Avanzar reloj, signos vitales y sistema de la base
    const durationSec = Clock.getDayDurationSec(state.day, false);
    const clockRes = Clock.tick(state, dt, durationSec);
    if (clockRes.warned16) {
      bus.emit('clock:warn16');
    }
    if (clockRes.curfew17) {
      bus.emit('clock:curfew17');
    }
    if (clockRes.ended20) {
      // Sección 7.1: a las 20:00 si sigue afuera, Corvi lo guía a la base con fundido a negro y envío 'menos'
      state.supplyBonus = 'menos';
      bus.emit('interact:prompt', { text: uiText.hud.radioCurfewReturn });
      this.cameras.main.fadeOut(350, 24, 20, 37);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.enterBase('base');
      });
      return;
    }

    // Cielo azul nocturno después de las 17:00 (#124e89, alpha 0.35)
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
      this.scene.start('Rescate', { cause: vitalsRes.rescueCause });
    }
  }

  private spawnSampleRock(
    x: number,
    y: number,
    spriteKey: string,
    sampleType: SampleType
  ): void {
    this.add.image(x, y, spriteKey);
    const marker = this.add.image(x, y - 14, 'marker_sample');
    this.tweens.add({
      targets: marker,
      y: y - 16,
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.interactPoints.push({
      kind: 'sample',
      x,
      y,
      prompt: uiText.hud.interactRock,
      sampleType,
      marker,
      collected: false,
    });
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
    if (state.clock.paused || this.rescueTriggered) return;

    const nearest = this.getNearestInteractPoint();
    if (!nearest) return;

    switch (nearest.kind) {
      case 'door':
        this.enterBase('base');
        break;
      case 'refuge':
        this.enterBase('refugio');
        break;
      case 'sample': {
        const emptyIdx = state.tubes.findIndex((t) => t === null);
        if (emptyIdx === -1) {
          bus.emit('interact:prompt', { text: uiText.hud.radioBoxFull });
          return;
        }
        state.tubes[emptyIdx] = nearest.sampleType ?? 'roca';
        nearest.collected = true;
        nearest.marker?.setVisible(false);
        bus.emit('interact:prompt', { text: uiText.hud.radioSamplePicked });
        break;
      }
      default:
        break;
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
