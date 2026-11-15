import Phaser from 'phaser';
import balance from '../../content/balance.json';
import uiText from '../../content/ui_text.json';
import { bus } from '../state/bus';
import { gameStore } from '../state/GameState';
import { Save } from '../state/Save';
import { AudioSystem } from '../systems/Audio';
import { BaseSystem } from '../systems/BaseSystem';
import { Clock } from '../systems/Clock';
import { Events } from '../systems/Events';
import { Vitals } from '../systems/Vitals';
import type { SampleType } from '../types';
import { AstronautAppearance } from '../ui/AstronautAppearance';
import { getSharedJoystickVector } from '../ui/Joystick';
import { StaticEffect } from '../ui/StaticEffect';

interface InteractPoint {
  kind: 'door' | 'panel' | 'antenna' | 'moxie' | 'refuge' | 'sample' | 'threeForks';
  x: number;
  y: number;
  prompt: string;
  panelId?: string;
  sampleType?: SampleType;
  marker?: Phaser.GameObjects.Image;
  sprite?: Phaser.GameObjects.Image;
  collected?: boolean;
}

interface ZoneRect {
  name: string;
  bounds: Phaser.Geom.Rectangle;
}

const MINIGAME_KEYS = [
  'MinijuegoRoca',
  'MinijuegoSuelo',
  'MinijuegoMinerales',
  'MinijuegoAire',
  'MinijuegoPaneles',
  'MinijuegoTuberias',
] as const;

/**
 * Escena exterior en el cráter Jezero (1280×960 px, zoom ×2 sobre 640×360).
 * Conecta movimiento, zonas reales, los 6 minijuegos, eventos diarios, tormenta solar y signos vitales.
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
  private playerOriginY = 0;
  private walkBobTime = 0;

  private nightOverlay!: Phaser.GameObjects.Rectangle;
  private promptContainer!: Phaser.GameObjects.Container;
  private promptBg!: Phaser.GameObjects.Rectangle;
  private promptLabel!: Phaser.GameObjects.Text;
  private interactPoints: InteractPoint[] = [];
  private activeSamplePoint: InteractPoint | null = null;
  private zones: ZoneRect[] = [];
  private currentZoneName = '';
  private lastToolIndex = 0;
  private rescueTriggered = false;
  private staticEffect!: StaticEffect;
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

    // 2. Decoración del terreno (sendero hacia Bright Angel, Séítah y Three Forks)
    const deco = this.add.graphics();
    deco.fillStyle(0xe4a672, 0.55);
    for (let y = 160; y < 450; y += 10) {
      deco.fillRect(637, y, 6, 5);
    }
    for (let x = 700; x < 960; x += 12) {
      deco.fillRect(x, 490, 6, 4);
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
      const panelImg = this.add
        .image(p.x, p.y, isDusty ? 'solar_panel_dusty' : 'solar_panel')
        .setInteractive({ useHandCursor: true });
      const evMarker = this.add
        .image(p.x, p.y - 18, 'marker_event')
        .setVisible(isDusty);
      addColliderBox(p.x, p.y, 50, 26);

      const pt: InteractPoint = {
        kind: 'panel',
        panelId: p.id,
        x: p.x,
        y: p.y + 18,
        prompt: isDusty ? uiText.hud.interactPanel : uiText.hud.interactPanelClean,
        sprite: panelImg,
        marker: evMarker,
      };
      panelImg.on('pointerdown', () => this.activatePoint(pt));
      this.interactPoints.push(pt);
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

    const antImg = this.add
      .image(692, 434, state.base.antennaOk ? 'antenna' : 'antenna_broken')
      .setInteractive({ useHandCursor: true });
    const antMarker = this.add
      .image(692, 404, 'marker_event')
      .setVisible(!state.base.antennaOk);
    addColliderBox(692, 444, 28, 28);
    const antPt: InteractPoint = {
      kind: 'antenna',
      x: 692,
      y: 462,
      prompt: state.base.antennaOk
        ? uiText.hud.interactAntennaOk
        : uiText.hud.interactAntenna,
      sprite: antImg,
      marker: antMarker,
    };
    antImg.on('pointerdown', () => this.activatePoint(antPt));
    this.interactPoints.push(antPt);

    const moxieImg = this.add
      .image(696, 486, 'moxie')
      .setInteractive({ useHandCursor: true });
    const moxieMarker = this.add
      .image(696, 468, 'marker_event')
      .setVisible(!state.base.moxieOk);
    addColliderBox(696, 486, 20, 16);
    const moxiePt: InteractPoint = {
      kind: 'moxie',
      x: 696,
      y: 500,
      prompt: state.base.moxieOk ? uiText.hud.interactMoxieOk : uiText.hud.interactMoxie,
      sprite: moxieImg,
      marker: moxieMarker,
    };
    moxieImg.on('pointerdown', () => this.activatePoint(moxiePt));
    this.interactPoints.push(moxiePt);

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

    // Depósito de tubos en Three Forks al este (sección 8: lo entregado aquí cuenta doble)
    const depotBase = this.add
      .rectangle(940, 490, 32, 22, 0xc0cbdc)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    this.add.image(934, 488, 'tube_full');
    this.add.image(946, 488, 'tube_empty');
    const depotPt: InteractPoint = {
      kind: 'threeForks',
      x: 940,
      y: 504,
      prompt: uiText.hud.interactThreeForks,
    };
    depotBase.on('pointerdown', () => this.activatePoint(depotPt));
    this.interactPoints.push(depotPt);

    // Puntos de muestra por zona (sección 8):
    // - Cerca de la base y Bright Angel (norte): roca (Cheyava Falls) y minerales hidratados
    this.spawnSampleRock(684, 520, 'rock_leopard', 'roca');
    this.spawnSampleRock(640, 250, 'rock_leopard', 'roca');
    this.spawnSampleRock(580, 230, 'rock_sparkle', 'minerales');
    // - Octavia E. Butler Landing (centro): suelo (regolito)
    this.spawnSampleRock(612, 544, 'rock_sandstone', 'suelo');
    this.spawnSampleRock(720, 558, 'rock_sandstone', 'suelo');
    // - Séítah (suroeste): roca volcánica y aire
    this.spawnSampleRock(430, 650, 'rock_volcanic', 'roca');
    this.spawnSampleRock(510, 580, 'rock_volcanic', 'aire');
    // - Three Forks (este): minerales y aire
    this.spawnSampleRock(860, 480, 'rock_sparkle', 'minerales');
    this.spawnSampleRock(830, 535, 'rock_sandstone', 'aire');

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
      { name: 'Séítah', bounds: new Phaser.Geom.Rectangle(80, 540, 460, 360) },
      { name: 'Three Forks', bounds: new Phaser.Geom.Rectangle(800, 340, 400, 340) },
      { name: 'Octavia E. Butler Landing', bounds: new Phaser.Geom.Rectangle(440, 340, 360, 300) },
    ];

    // 4. Astronauta mini (14×23 px) con su color de traje y peinado actuales
    const hairKey = AstronautAppearance.getMiniTextureKey(
      this,
      state.customization.hair,
      state.customization.suit
    );
    this.player = this.physics.add.sprite(
      state.astronaut.pos.x,
      state.astronaut.pos.y,
      hairKey
    );
    this.player.setCollideWorldBounds(true);
    this.playerOriginY = this.player.displayOriginY;
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
        resolution: 2,
        fontSize: '10px',
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
        if (this.isAnyMinigameActive()) return;
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
          if (this.activeSamplePoint.kind === 'sample') {
            const emptyIdx = state.tubes.findIndex((t) => t === null);
            if (emptyIdx !== -1) {
              state.tubes[emptyIdx] = this.activeSamplePoint.sampleType ?? 'roca';
            }
            this.activeSamplePoint.collected = true;
            this.activeSamplePoint.marker?.setVisible(false);
            bus.emit('interact:prompt', { text: uiText.hud.radioSamplePicked });
          }
          if (res.factId && !state.learnedToday.includes(res.factId)) {
            state.learnedToday.push(res.factId);
          }
        }
        this.activeSamplePoint = null;
        this.refreshEquipmentVisuals();
      })
    );

    this.staticEffect = new StaticEffect(this, {
      intervalMs: 4200,
      burstDurationMs: 240,
      maxAlpha: 0.14,
    });
    this.staticEffect.setEnabled(!state.base.antennaOk, false);

    if (!this.scene.isActive('HUD')) {
      this.scene.launch('HUD');
    }
    if (!this.scene.isActive('Dialogo')) {
      this.scene.launch('Dialogo');
    }
    if (!this.scene.isActive('Tormenta')) {
      this.scene.launch('Tormenta');
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const unsub of this.unsubscribers) {
        unsub();
      }
      this.unsubscribers = [];
      this.staticEffect?.destroy();
    });
  }

  private isAnyMinigameActive(): boolean {
    return MINIGAME_KEYS.some((k) => this.scene.isActive(k));
  }

  private refreshEquipmentVisuals(): void {
    const state = gameStore.state;
    this.staticEffect?.setEnabled(!state.base.antennaOk, false);
    for (const pt of this.interactPoints) {
      if (pt.kind === 'panel' && pt.panelId) {
        const pData = state.base.panels.find((p) => p.id === pt.panelId);
        const isDusty = (pData?.dust ?? 0) > 0.2;
        pt.sprite?.setTexture(isDusty ? 'solar_panel_dusty' : 'solar_panel');
        pt.marker?.setVisible(isDusty);
        pt.prompt = isDusty
          ? uiText.hud.interactPanel
          : uiText.hud.interactPanelClean;
      } else if (pt.kind === 'moxie') {
        pt.marker?.setVisible(!state.base.moxieOk);
        pt.prompt = state.base.moxieOk
          ? uiText.hud.interactMoxieOk
          : uiText.hud.interactMoxie;
      } else if (pt.kind === 'antenna') {
        pt.sprite?.setTexture(
          state.base.antennaOk ? 'antenna' : 'antenna_broken'
        );
        pt.marker?.setVisible(!state.base.antennaOk);
        pt.prompt = state.base.antennaOk
          ? uiText.hud.interactAntennaOk
          : uiText.hud.interactAntenna;
      }
    }
  }

  update(time: number, delta: number): void {
    const state = gameStore.state;
    if (this.rescueTriggered) {
      return;
    }

    if (state.clock.paused || this.isAnyMinigameActive()) {
      this.player.setVelocity(0, 0);
      this.walkBobTime = 0;
      this.player.setDisplayOrigin(this.player.displayOriginX, this.playerOriginY);
      return;
    }

    this.staticEffect?.update(time);
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

    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      AudioSystem.play('step');
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

    if (moving) {
      this.walkBobTime += delta;
      const bob = Math.sin(this.walkBobTime * 0.018) * 0.8;
      this.player.setDisplayOrigin(this.player.displayOriginX, this.playerOriginY + bob);
    } else {
      this.walkBobTime = 0;
      this.player.setDisplayOrigin(this.player.displayOriginX, this.playerOriginY);
    }

    state.astronaut.pos.x = Math.round(this.player.x);
    state.astronaut.pos.y = Math.round(this.player.y);

    this.updateInteractionPrompt();
    this.updateCurrentZone();

    // 2. Reloj del día (Día 1 = 150 s, Día 2+ = 300 s)
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

    // 3. Eventos diarios y tormenta solar
    const evRes = Events.tick(state, dt);
    if (evRes.triggeredEvents.length > 0) {
      this.refreshEquipmentVisuals();
      for (const ev of evRes.triggeredEvents) {
        if (ev.type === 'dust') {
          bus.emit('interact:prompt', { text: uiText.hud.radioDustEvent });
        } else if (ev.type === 'moxie_pipes') {
          bus.emit('interact:prompt', { text: uiText.hud.radioMoxieEvent });
        } else if (ev.type === 'cold_night') {
          bus.emit('interact:prompt', { text: uiText.hud.radioColdNightEvent });
        }
      }
    }

    if (evRes.stormFalseAlarmResolved) {
      bus.emit('dialog:open', {
        mode: 'big',
        mood: 'happy',
        text: uiText.storm.corviAlertMiss,
        source: uiText.storm.sealSourceMiss,
        label: 'ARCHIVO REAL',
      });
    }

    BaseSystem.tick(state, dt, durationSec);

    const vitalsRes = Vitals.tick(state, dt);
    if (vitalsRes.warnedO2At40) {
      bus.emit('vitals:o2Warn40');
    }
    if (vitalsRes.dangerO2At20) {
      bus.emit('vitals:o2Danger20');
    }

    const rescueCause = vitalsRes.rescueCause ?? evRes.rescueCause;
    if (rescueCause) {
      this.rescueTriggered = true;
      this.player.setVelocity(0, 0);
      bus.emit('rescue', { cause: rescueCause });
      this.scene.stop('HUD');
      this.scene.stop('Dialogo');
      this.scene.stop('Tormenta');
      this.scene.start('Rescate', { cause: rescueCause });
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

    const promptMap: Record<SampleType, string> = {
      roca: uiText.hud.interactRock,
      suelo: uiText.hud.interactSoil,
      minerales: uiText.hud.interactMinerals,
      aire: uiText.hud.interactAir,
    };

    const pt: InteractPoint = {
      kind: 'sample',
      x,
      y,
      prompt: promptMap[sampleType],
      sampleType,
      marker,
      sprite: rockImg,
      collected: false,
    };

    const onDirectClick = (): void => {
      if (pt.collected || this.isAnyMinigameActive()) return;
      this.activatePoint(pt);
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
    const radius = balance.player.interactRadius + 6;
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

  private getToolIndexForPoint(pt: InteractPoint | null): number {
    if (!pt) return 0;
    if (pt.kind === 'sample') {
      if (pt.sampleType === 'roca') return 0; // icon_drill
      if (pt.sampleType === 'suelo') return 1; // icon_shovel
      if (pt.sampleType === 'minerales') return 2; // icon_scanner
      if (pt.sampleType === 'aire') return 3; // icon_valve
    }
    if (pt.kind === 'panel') return 4; // icon_brush
    if (pt.kind === 'moxie' || pt.kind === 'antenna') return 5; // icon_wrench
    return 0;
  }

  private updateInteractionPrompt(): void {
    const nearest = this.getNearestInteractPoint();
    const toolIdx = this.getToolIndexForPoint(nearest);
    if (toolIdx !== this.lastToolIndex) {
      this.lastToolIndex = toolIdx;
      bus.emit('tool:changed', { index: toolIdx });
    }

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
      this.isAnyMinigameActive()
    ) {
      return;
    }

    const nearest = this.getNearestInteractPoint();
    if (!nearest) return;

    this.activatePoint(nearest);
  }

  private activatePoint(pt: InteractPoint): void {
    const state = gameStore.state;
    if (this.isAnyMinigameActive()) return;

    switch (pt.kind) {
      case 'door':
        this.enterBase('base');
        break;
      case 'refuge':
        this.enterBase('refugio');
        break;
      case 'threeForks': {
        const count = BaseSystem.deliverTubes(state, 2);
        if (count > 0) {
          Save.save(state);
          bus.emit('interact:prompt', { text: uiText.hud.radioThreeForks });
        } else {
          bus.emit('interact:prompt', { text: uiText.base.noTubesMsg });
        }
        break;
      }
      case 'panel': {
        this.activeSamplePoint = pt;
        this.player.setVelocity(0, 0);
        this.scene.launch('MinijuegoPaneles', {
          type: 'panel',
          day: state.day,
          difficulty: state.day <= 3 ? 1 : state.day <= 9 ? 2 : 3,
        });
        break;
      }
      case 'moxie': {
        this.activeSamplePoint = pt;
        this.player.setVelocity(0, 0);
        this.scene.launch('MinijuegoTuberias', {
          type: 'moxie_pipes',
          day: state.day,
          difficulty: state.day <= 3 ? 1 : state.day <= 9 ? 2 : 3,
        });
        break;
      }
      case 'antenna': {
        if (!state.base.antennaOk) {
          this.activeSamplePoint = pt;
          this.player.setVelocity(0, 0);
          this.scene.launch('MinijuegoTuberias', {
            type: 'antenna',
            day: state.day,
            difficulty: state.day <= 3 ? 1 : state.day <= 9 ? 2 : 3,
          });
        } else {
          bus.emit('interact:prompt', { text: uiText.hud.interactAntennaOk });
        }
        break;
      }
      case 'sample':
        this.startSampleCollection(pt);
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

    const difficulty: 1 | 2 | 3 = state.day <= 3 ? 1 : state.day <= 9 ? 2 : 3;
    const sceneMap: Record<SampleType, string> = {
      roca: 'MinijuegoRoca',
      suelo: 'MinijuegoSuelo',
      minerales: 'MinijuegoMinerales',
      aire: 'MinijuegoAire',
    };

    const targetScene = sceneMap[pt.sampleType ?? 'roca'];
    this.scene.launch(targetScene, {
      type: pt.sampleType ?? 'roca',
      day: state.day,
      difficulty,
      zone: this.currentZoneName,
    });
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
