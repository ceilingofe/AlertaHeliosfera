import Phaser from 'phaser';
import balance from '../../content/balance.json';
import { bus } from '../state/bus';
import { gameStore } from '../state/GameState';
import { mapMarkers, type MapMarker } from '../state/mapMarkers';
import { Save } from '../state/Save';
import { AudioSystem } from '../systems/Audio';
import { BaseSystem } from '../systems/BaseSystem';
import { Clock } from '../systems/Clock';
import { Events } from '../systems/Events';
import { I18n } from '../systems/I18n';
import { createReplacementSampleSite, generateSampleSites, type SampleSite } from '../systems/SampleSites';
import { Vitals } from '../systems/Vitals';
import type { SampleType } from '../types';
import { AstronautAppearance, type AstronautDirection } from '../ui/AstronautAppearance';
import { getSharedJoystickVector } from '../ui/Joystick';
import { StaticEffect } from '../ui/StaticEffect';
import { Dialogo } from './Dialogo';

interface InteractPoint {
  id: string;
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

interface Footprint {
  img: Phaser.GameObjects.Image;
  born: number;
}

interface DustMote {
  img: Phaser.GameObjects.Image;
  speed: number;
  wavePhase: number;
}

interface WindStreak {
  ox: number;
  oy: number;
  len: number;
  speed: number;
  color: number;
}

interface NightStar {
  ox: number;
  oy: number;
  size: number;
  color: number;
  speed: number;
  phase: number;
  sparkle: boolean;
}

export const MINIGAME_KEYS = [
  'MinijuegoRoca',
  'MinijuegoSuelo',
  'MinijuegoMinerales',
  'MinijuegoAire',
  'MinijuegoPaneles',
  'MinijuegoTuberias',
  'Trivia',
] as const;

const SAMPLE_SPRITES: Record<SampleType, string> = {
  roca: 'rock_mars',
  suelo: 'rock_sandstone',
  minerales: 'rock_sparkle',
  aire: 'air_pump',
};

const SAMPLE_SPRITE_VARIANTS: Record<SampleType, readonly string[]> = {
  roca: ['rock_mars', 'rock_mars_2'],
  suelo: ['rock_sandstone', 'rock_sandstone_2'],
  minerales: ['rock_sparkle', 'rock_sparkle_2'],
  aire: ['air_pump'],
};

/** Dificultad de los minijuegos según el día (1 = aprendiz, 3 = experto). */
export function difficultyForDay(day: number): 1 | 2 | 3 {
  return day <= 2 ? 1 : day <= 5 ? 2 : 3;
}

/**
 * Escena exterior en el cráter Jezero (1280×960 px).
 */
export class Mundo extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private walkBobTime = 0;
  private facingDir: AstronautDirection = 'down';
  private flashAngle = Math.PI / 2;
  private sceneEnteredAt = 0;
  private openPauseAfterRestart = false;
  private warnedNightFirst = false;
  private warnedHeaterEmpty = false;

  private nightGroundTile!: Phaser.GameObjects.TileSprite;
  private nightOverlay!: Phaser.GameObjects.Rectangle;
  private nightCosmosGfx!: Phaser.GameObjects.Graphics;
  private playerLightGfx!: Phaser.GameObjects.Graphics;
  private windGfx!: Phaser.GameObjects.Graphics;
  private interactPoints: InteractPoint[] = [];
  private activeSamplePoint: InteractPoint | null = null;
  private zones: ZoneRect[] = [];
  private currentZoneName = '';
  private lastToolIndex = -1;
  private lastPromptText: string | null = null;
  private rescueTriggered = false;
  private staticEffect!: StaticEffect;
  private unsubscribers: (() => void)[] = [];
  private footprints: Footprint[] = [];
  private lastFootAt = 0;
  private footSide = 0;
  private dustMotes: DustMote[] = [];
  private windStreaks: WindStreak[] = [];
  private nightStars: NightStar[] = [];
  private meteorState = {
    active: false,
    nextAt: 2500,
    startedAt: 0,
    sx: 0,
    sy: 0,
    dx: 0,
    dy: 0,
  };
  private wasInMinigame = false;

  constructor() {
    super('Mundo');
  }

  init(data?: { openPauseAfterRestart?: boolean }): void {
    this.openPauseAfterRestart = data?.openPauseAfterRestart ?? false;
  }

  create(): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    state.location = 'mundo';
    Clock.setPaused(state, this.openPauseAfterRestart);
    this.sceneEnteredAt = this.time.now;
    this.facingDir = 'down';
    this.flashAngle = Math.PI / 2;
    this.walkBobTime = 0;
    this.rescueTriggered = false;
    this.warnedNightFirst = Clock.isNight(state.clock.minutes);
    this.warnedHeaterEmpty = false;
    this.interactPoints = [];
    this.activeSamplePoint = null;
    this.unsubscribers = [];
    this.footprints = [];
    this.dustMotes = [];
    this.windStreaks = [];
    this.nightStars = [];
    this.meteorState = { active: false, nextAt: this.time.now + 2400, startedAt: 0, sx: 0, sy: 0, dx: 0, dy: 0 };
    this.lastToolIndex = -1;
    this.lastPromptText = null;
    this.wasInMinigame = false;

    const mapWidth = 1280;
    const mapHeight = 960;
    this.cameras.main.setOrigin(0.5, 0.5).setZoom(4);

    // 1. Terreno de Karmin: mosaico de día + mosaico nocturno que se funde suavemente al atardecer
    this.add
      .tileSprite(0, 0, mapWidth, mapHeight, 'ground_day')
      .setOrigin(0, 0)
      .setTileScale(0.5, 0.5);
    this.nightGroundTile = this.add
      .tileSprite(0, 0, mapWidth, mapHeight, 'ground_night')
      .setOrigin(0, 0)
      .setTileScale(0.5, 0.5)
      .setAlpha(0);

    const deco = this.add.graphics();
    this.drawTerrain(deco);

    // Cables y tuberías exteriores de la base
    deco.fillStyle(0x181425, 1);
    deco.fillRect(606, 482, 20, 5);
    deco.fillStyle(0xfee761, 1);
    deco.fillRect(606, 483, 20, 3);
    deco.fillStyle(0x181425, 1);
    deco.fillRect(660, 485, 28, 5);
    deco.fillStyle(0x8b9bb4, 1);
    deco.fillRect(660, 486, 28, 3);

    // 2. Colisiones
    const obstacles = this.physics.add.staticGroup();
    const addColliderBox = (x: number, y: number, w: number, h: number): void => {
      const rect = this.add.rectangle(x, y, w, h, 0x000000, 0);
      this.physics.add.existing(rect, true);
      obstacles.add(rect);
    };

    // Sombras suaves bajo los equipos para dar volumen
    const shadows = this.add.graphics();
    shadows.fillStyle(0x3e2731, 0.35);

    const panelPositions = [
      { id: 'p1', x: 526, y: 486 },
      { id: 'p2', x: 584, y: 486 },
      { id: 'p3', x: 555, y: 522 },
    ];
    for (const p of panelPositions) {
      shadows.fillEllipse(p.x + 2, p.y + 14, 48, 8);
      const panelImg = this.add.image(p.x, p.y, 'solar_panel').setInteractive({ useHandCursor: true });
      const evMarker = this.add.image(p.x, p.y - 18, 'marker_event').setVisible(false);
      this.bob(evMarker);
      addColliderBox(p.x, p.y, 50, 26);
      const pt: InteractPoint = {
        id: p.id,
        kind: 'panel',
        panelId: p.id,
        x: p.x,
        y: p.y + 18,
        prompt: '',
        sprite: panelImg,
        marker: evMarker,
      };
      panelImg.on('pointerdown', () => this.activatePoint(pt));
      this.interactPoints.push(pt);
    }

    shadows.fillEllipse(642, 486, 52, 10);
    const baseImg = this.add.image(640, 472, 'base_exterior').setInteractive({ useHandCursor: true });
    baseImg.on('pointerdown', () => this.enterBase('base'));
    addColliderBox(640, 468, 40, 28);
    this.interactPoints.push({ id: 'door', kind: 'door', x: 640, y: 494, prompt: uiText.hud.interactDoor });

    shadows.fillEllipse(694, 452, 26, 6);
    const antImg = this.add.image(692, 434, 'antenna').setInteractive({ useHandCursor: true });
    const antMarker = this.add.image(692, 404, 'marker_event').setVisible(false);
    this.bob(antMarker);
    addColliderBox(692, 444, 28, 28);
    const antPt: InteractPoint = {
      id: 'antenna',
      kind: 'antenna',
      x: 692,
      y: 462,
      prompt: '',
      sprite: antImg,
      marker: antMarker,
    };
    antImg.on('pointerdown', () => this.activatePoint(antPt));
    this.interactPoints.push(antPt);

    shadows.fillEllipse(697, 494, 22, 5);
    const moxieImg = this.add.image(696, 486, 'moxie').setInteractive({ useHandCursor: true });
    const moxieMarker = this.add.image(696, 468, 'marker_event').setVisible(false);
    this.bob(moxieMarker);
    addColliderBox(696, 486, 20, 16);
    const moxiePt: InteractPoint = {
      id: 'moxie',
      kind: 'moxie',
      x: 696,
      y: 500,
      prompt: '',
      sprite: moxieImg,
      marker: moxieMarker,
    };
    moxieImg.on('pointerdown', () => this.activatePoint(moxiePt));
    this.interactPoints.push(moxiePt);

    shadows.fillEllipse(750, 520, 44, 8);
    const refugeImg = this.add.image(748, 512, 'refuge').setInteractive({ useHandCursor: true });
    refugeImg.on('pointerdown', () => this.enterBase('refugio'));
    addColliderBox(748, 510, 40, 20);
    this.interactPoints.push({ id: 'refuge', kind: 'refuge', x: 748, y: 526, prompt: uiText.hud.interactRefuge });

    // Depósito de Three Forks (lo entregado aquí cuenta doble, pero está lejos)
    shadows.fillEllipse(941, 500, 36, 6);
    const depotBase = this.add
      .rectangle(940, 490, 32, 22, 0xc0cbdc)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    this.add.image(934, 488, 'tube_full');
    this.add.image(946, 488, 'tube_empty');
    const depotPt: InteractPoint = {
      id: 'depot',
      kind: 'threeForks',
      x: 940,
      y: 504,
      prompt: uiText.hud.interactThreeForks,
    };
    depotBase.on('pointerdown', () => this.activatePoint(depotPt));
    this.interactPoints.push(depotPt);

    // 3. Sitios de muestra del día (cambian cada día y no reaparecen al volver a salir)
    const sites = [
      ...generateSampleSites(state.day, state.quotaToday),
      ...(state.extraSitesToday ?? []),
    ];
    for (const site of sites) {
      this.spawnSampleSite(site, state.sitesUsedToday.includes(site.id));
    }

    this.zones = [
      { name: 'Bright Angel', bounds: new Phaser.Geom.Rectangle(360, 60, 560, 280) },
      { name: 'Séítah', bounds: new Phaser.Geom.Rectangle(80, 540, 460, 360) },
      { name: 'Three Forks', bounds: new Phaser.Geom.Rectangle(800, 340, 400, 340) },
      { name: 'Octavia E. Butler Landing', bounds: new Phaser.Geom.Rectangle(440, 340, 360, 300) },
    ];
    this.drawZoneSigns();

    // 4. Astronauta con su color de traje, peinado y vista en 4 direcciones (sprite 32×64 a escala 0.5 = 16×32 mundo)
    const hairKey = AstronautAppearance.getDirectionalMiniKey(
      this,
      state.customization.hair,
      state.customization.suit,
      'down',
      0
    );
    this.player = this.physics.add.sprite(state.astronaut.pos.x, state.astronaut.pos.y, hairKey);
    this.player.setScale(0.5).setCollideWorldBounds(true).setDepth(10);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(20, 20);
    body.setOffset(6, 28);
    this.physics.add.collider(this.player, obstacles);

    // 5. Polvo dinámico y ráfagas de viento marciano
    const moteColors = [0xead4aa, 0xe4a672, 0xd77643];
    for (let i = 0; i < 46; i++) {
      const m = this.add
        .image(Phaser.Math.Between(0, mapWidth), Phaser.Math.Between(0, mapHeight), 'dust_mote')
        .setTint(moteColors[i % moteColors.length])
        .setScale(0.65 + (i % 4) * 0.25)
        .setAlpha(0.35 + (i % 3) * 0.16)
        .setDepth(25);
      this.dustMotes.push({
        img: m,
        speed: 42 + (i % 7) * 14,
        wavePhase: i * 0.7,
      });
    }
    this.windGfx = this.add.graphics().setDepth(26);
    const streakColors = [0xead4aa, 0xe4a672, 0xb86f50];
    for (let i = 0; i < 42; i++) {
      this.windStreaks.push({
        ox: (i * 53) % 340,
        oy: (i * 37) % 190,
        len: 7 + (i % 5) * 4,
        speed: 110 + (i % 6) * 28,
        color: streakColors[i % streakColors.length],
      });
    }

    // 6. Atardecer y noche estrellada
    this.nightOverlay = this.add.rectangle(0, 0, mapWidth, mapHeight, 0x0b1026, 0).setOrigin(0, 0).setDepth(30);
    this.nightCosmosGfx = this.add.graphics().setDepth(31);
    this.playerLightGfx = this.add.graphics().setDepth(32);

    const starPalette = [0xffffff, 0xc0cbdc, 0x2ce8f5, 0xfee761, 0xf4b4b4];
    const starRnd = new Phaser.Math.RandomDataGenerator(['jezero-cosmos-stars']);
    for (let i = 0; i < 115; i++) {
      this.nightStars.push({
        ox: starRnd.realInRange(0, 340),
        oy: starRnd.realInRange(2, 52),
        size: i % 11 === 0 ? 1.5 : 1,
        color: starPalette[i % starPalette.length],
        speed: starRnd.realInRange(0.0018, 0.0052),
        phase: starRnd.realInRange(0, Math.PI * 2),
        sparkle: i % 22 === 0,
      });
    }

    // 7. Cámara
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);
    this.cameras.main.fadeIn(250, 24, 20, 37);
    this.physics.world.setBounds(0, 0, mapWidth, mapHeight);

    // 8. Controles de teclado
    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.resetKeys();
      this.cursors = keyboard.createCursorKeys();
      this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyS = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E).on('down', () => this.handleInteraction());
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE).on('down', () => this.handleInteraction());
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M).on('down', () => {
        if (!this.isAnyMinigameActive()) bus.emit('map:toggle');
      });
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => {
        if (this.isAnyMinigameActive()) return;
        const paused = Clock.togglePause(gameStore.state);
        bus.emit('clock:pauseChanged', { paused });
      });
    }

    const onBlur = (): void => {
      this.input.keyboard?.resetKeys();
    };
    window.addEventListener('blur', onBlur);

    this.unsubscribers.push(
      bus.on('input:action', () => this.handleInteraction()),
      bus.on('minigame:finished', (res) => this.onMinigameFinished(res))
    );

    this.staticEffect = new StaticEffect(this, { intervalMs: 4200, burstDurationMs: 240, maxAlpha: 0.14 });
    this.refreshEquipmentVisuals();

    if (!this.scene.isActive('HUD')) {
      this.scene.launch('HUD', { startPaused: this.openPauseAfterRestart });
    } else if (this.openPauseAfterRestart) {
      bus.emit('clock:pauseChanged', { paused: true });
    }
    this.openPauseAfterRestart = false;
    for (const key of ['Dialogo', 'Tormenta']) {
      if (!this.scene.isActive(key)) this.scene.launch(key);
    }

    AudioSystem.playMusic('sunsets');
    AudioSystem.startLoop('ambient', 'wind_loop', 0.8);
    AudioSystem.play('airlock', { volume: 0.6 });

    this.publishMarkers();

    // Primer día: Corvi explica el radar una sola vez
    if (state.day === 1 && state.stats.samples.roca === 0 && state.tubes.every((t) => t === null)) {
      this.time.delayedCall(700, () => {
        bus.emit('dialog:open', {
          mode: 'big',
          mood: 'happy',
          text: uiText.hud.corviRadarTutorial,
        });
      });
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('blur', onBlur);
      for (const unsub of this.unsubscribers) unsub();
      this.unsubscribers = [];
      this.staticEffect?.destroy();
      AudioSystem.stopLoop('ambient');
      AudioSystem.setMusicDuck(1);
      bus.emit('prompt:near', { text: null });
      mapMarkers.clear();
    });
  }

  // ------------------------------------------------------------------ terreno

  private drawTerrain(deco: Phaser.GameObjects.Graphics): void {
    const rnd = new Phaser.Math.RandomDataGenerator(['jezero-terreno']);

    deco.fillStyle(0xe4a672, 0.5);
    for (let y = 160; y < 450; y += 10) deco.fillRect(637, y, 6, 5);
    for (let x = 700; x < 960; x += 12) deco.fillRect(x, 490, 6, 4);

    const craters: [number, number, number, number][] = [
      [718, 396, 36, 22],
      [760, 548, 52, 34],
      [420, 610, 60, 38],
      [880, 340, 48, 30],
      [260, 300, 70, 44],
      [1080, 760, 90, 54],
      [1150, 200, 40, 26],
      [300, 820, 50, 30],
      [980, 120, 34, 20],
    ];
    for (const c of craters) this.drawCrater(deco, c[0], c[1], c[2], c[3]);

    for (let i = 0; i < 70; i++) {
      const x = 120 + i * 15;
      const y = 700 - Math.sin(i * 0.12) * 60 - i * 3;
      this.add.image(x, y, 'rover_track').setRotation(-0.25 + Math.cos(i * 0.12) * 0.2).setAlpha(0.8);
    }

    for (let i = 0; i < 26; i++) {
      this.add.image(rnd.between(40, 1240), rnd.between(40, 920), 'dune').setAlpha(0.9);
    }
    const outcrops: [number, number][] = [
      [480, 150], [820, 210], [180, 640], [1040, 520], [1180, 380], [340, 430], [760, 860], [140, 140],
    ];
    for (const [x, y] of outcrops) this.add.image(x, y, 'outcrop');
    for (let i = 0; i < 120; i++) {
      const x = rnd.between(10, 1270);
      const y = rnd.between(10, 950);
      if (Math.abs(x - 640) < 140 && Math.abs(y - 490) < 70) continue;
      if (Math.abs(x - 940) < 44 && Math.abs(y - 490) < 34) continue;
      this.add.image(x, y, rnd.pick(['pebble_a', 'pebble_b', 'pebble_c']));
    }
    const terrainRocks = [
      'rock_mars',
      'rock_mars_2',
      'rock_sandstone',
      'rock_sandstone_2',
      'rock_sparkle',
      'rock_sparkle_2',
    ];
    for (let i = 0; i < 64; i++) {
      const x = rnd.between(24, 1256);
      const y = rnd.between(24, 936);
      if (Math.abs(x - 640) < 150 && Math.abs(y - 490) < 80) continue;
      if (Math.abs(x - 940) < 52 && Math.abs(y - 490) < 40) continue;
      this.add
        .image(x, y, rnd.pick(terrainRocks))
        .setScale(rnd.pick([0.75, 0.9, 1]))
        .setAlpha(0.9);
    }
  }

  private drawZoneSigns(): void {
    const signs: [string, number, number][] = [
      ['BRIGHT ANGEL', 640, 120],
      ['SÉÍTAH', 250, 700],
      ['THREE FORKS', 1000, 430],
    ];
    for (const [label, x, y] of signs) {
      this.add
        .text(x, y, label, { fontFamily: 'PixelifySans, monospace', fontSize: '8px', color: '#ead4aa' })
        .setOrigin(0.5)
        .setAlpha(0.75);
    }
  }

  private bob(img: Phaser.GameObjects.Image): void {
    this.tweens.add({ targets: img, y: img.y - 2, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private drawCrater(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    g.fillStyle(0xe4a672, 0.5);
    g.fillEllipse(x, y - 2, w + 6, h + 4);
    g.fillStyle(0x733e39, 0.85);
    g.fillEllipse(x, y, w, h);
    g.fillStyle(0xb86f50, 0.9);
    g.fillEllipse(x, y + 2, w - 6, h - 5);
    g.fillStyle(0x733e39, 0.35);
    g.fillEllipse(x - w * 0.12, y + 1, w * 0.5, h * 0.4);
  }

  // ------------------------------------------------------------------ sitios de muestra

  private spawnSampleSite(site: SampleSite, used: boolean): void {
    const uiText = I18n.ui();
    const variants = SAMPLE_SPRITE_VARIANTS[site.type];
    const hash = site.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const spriteKey = variants[hash % variants.length] ?? SAMPLE_SPRITES[site.type];
    this.add.ellipse(site.x, site.y + 6, spriteKey === 'air_pump' ? 20 : 14, 4, 0x3e2731, 0.4);
    const rockImg = this.add
      .image(site.x, site.y, spriteKey)
      .setScale(spriteKey === 'air_pump' ? 0.5 : 1.05)
      .setInteractive({ useHandCursor: true });
    const marker = this.add.image(site.x, site.y - (spriteKey === 'air_pump' ? 17 : 14), 'marker_sample').setInteractive({ useHandCursor: true });
    this.bob(marker);

    const promptMap: Record<SampleType, string> = {
      roca: uiText.hud.interactRock,
      suelo: uiText.hud.interactSoil,
      minerales: uiText.hud.interactMinerals,
      aire: uiText.hud.interactAir,
    };

    const pt: InteractPoint = {
      id: site.id,
      kind: 'sample',
      x: site.x,
      y: site.y,
      prompt: promptMap[site.type],
      sampleType: site.type,
      marker,
      sprite: rockImg,
      collected: used,
    };

    if (used) {
      marker.setVisible(false);
      rockImg.setAlpha(0.45);
      this.add.image(site.x, site.y + 2, 'site_lost').setAlpha(0.7);
    }

    const onDirectClick = (): void => {
      if (pt.collected || this.isAnyMinigameActive()) return;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, pt.x, pt.y);
      if (d > balance.player.interactRadius + 26) {
        bus.emit('interact:prompt', { text: I18n.ui().hud.radioTooFar });
        return;
      }
      this.activatePoint(pt);
    };
    rockImg.on('pointerdown', onDirectClick);
    marker.on('pointerdown', onDirectClick);
    this.interactPoints.push(pt);
  }

  private markSiteUsed(pt: InteractPoint, failed: boolean): void {
    const state = gameStore.state;
    pt.collected = true;
    pt.marker?.setVisible(false);
    if (!state.sitesUsedToday.includes(pt.id)) state.sitesUsedToday.push(pt.id);
    pt.sprite?.setAlpha(failed ? 0.45 : 0.6);
    if (failed) this.add.image(pt.x, pt.y + 2, 'site_lost').setAlpha(0.8);
    this.publishMarkers();
  }

  private onMinigameFinished(res: {
    ok: boolean;
    quality: 0 | 1 | 2 | 3;
    factId?: string;
    aborted?: boolean;
  }): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    const pt = this.activeSamplePoint;
    this.activeSamplePoint = null;

    if (pt?.kind === 'sample') {
      if (res.ok) {
        const emptyIdx = state.tubes.findIndex((t) => t === null);
        if (emptyIdx !== -1) state.tubes[emptyIdx] = pt.sampleType ?? 'roca';
        const pts = balance.science.sampleBase + res.quality * balance.science.perQualityStar;
        state.sciencePoints += pts;
        this.markSiteUsed(pt, false);
        AudioSystem.play('pickup');
        bus.emit('interact:prompt', { text: uiText.hud.radioSamplePicked });
        bus.emit('toast', { text: `+${pts} ${uiText.hud.sciencePointsShort}`, color: '#fee761' });
      } else if (res.aborted) {
        this.markSiteUsed(pt, true);
        const sType = pt.sampleType ?? 'roca';
        const existingCoords = this.interactPoints.map((p) => ({ x: p.x, y: p.y }));
        state.extraSitesToday ??= [];
        const replId = `d${state.day}-${sType}-re-${state.extraSitesToday.length + 1}`;
        const newSite = createReplacementSampleSite(
          sType,
          existingCoords,
          replId,
          state.day * 997 + this.interactPoints.length * 41 + state.extraSitesToday.length * 17
        );
        state.extraSitesToday.push(newSite);
        this.spawnSampleSite(newSite, false);
        this.publishMarkers();
        AudioSystem.play('ui_close');
        bus.emit('interact:prompt', { text: uiText.hud.radioSampleAborted });
      } else {
        state.stats.minigamesFailed += 1;
        this.markSiteUsed(pt, true);
        AudioSystem.play('fail');
        bus.emit('interact:prompt', { text: uiText.hud.radioSampleLost });
      }
    } else if (pt && !res.ok) {
      if (res.aborted) {
        AudioSystem.play('ui_close');
      } else {
        state.stats.minigamesFailed += 1;
        AudioSystem.play('fail');
        bus.emit('interact:prompt', { text: uiText.hud.radioRepairFailed });
      }
    } else if (pt && res.ok) {
      state.sciencePoints += 5;
      bus.emit('toast', { text: `+5 ${uiText.hud.sciencePointsShort}`, color: '#fee761' });
    }

    if (res.ok && res.factId && !state.learnedToday.includes(res.factId)) {
      state.learnedToday.push(res.factId);
    }
    this.refreshEquipmentVisuals();
    Save.save(state);
  }

  // ------------------------------------------------------------------ marcadores para el radar

  private publishMarkers(): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    const list: MapMarker[] = [
      { id: 'base', kind: 'base', x: 640, y: 472, label: uiText.hud.mapBase, active: true },
      { id: 'refuge', kind: 'refuge', x: 748, y: 512, label: uiText.hud.mapRefuge, active: true },
      { id: 'depot', kind: 'depot', x: 940, y: 490, label: uiText.hud.mapDepot, active: true },
    ];
    for (const pt of this.interactPoints) {
      if (pt.kind === 'sample' && pt.sampleType) {
        const type = pt.sampleType;
        const remaining =
          (state.quotaToday[type] ?? 0) -
          (state.deliveredToday[type] ?? 0) -
          state.tubes.filter((t) => t === type).length;
        list.push({
          id: pt.id,
          kind: 'sample',
          x: pt.x,
          y: pt.y,
          sampleType: type,
          label: I18n.sampleName(type),
          active: !pt.collected,
          needed: remaining > 0,
        });
      } else if (pt.kind === 'panel' || pt.kind === 'antenna' || pt.kind === 'moxie') {
        list.push({
          id: pt.id,
          kind: 'repair',
          x: pt.x,
          y: pt.y - 18,
          label:
            pt.kind === 'panel'
              ? uiText.hud.mapPanel
              : pt.kind === 'antenna'
                ? uiText.hud.mapAntenna
                : uiText.hud.mapMoxie,
          active: pt.marker?.visible ?? false,
        });
      }
    }
    mapMarkers.set(list);
  }

  private isAnyMinigameActive(): boolean {
    return MINIGAME_KEYS.some((k) => this.scene.isActive(k));
  }

  private refreshEquipmentVisuals(): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    this.staticEffect?.setEnabled(!state.base.antennaOk, false);
    for (const pt of this.interactPoints) {
      if (pt.kind === 'panel' && pt.panelId) {
        const pData = state.base.panels.find((p) => p.id === pt.panelId);
        const isDusty = (pData?.dust ?? 0) > balance.dust.dirtyThreshold;
        pt.sprite?.setTexture(isDusty ? 'solar_panel_dusty' : 'solar_panel');
        pt.marker?.setVisible(isDusty);
        const pct = Math.round(100 * (1 - (pData?.dust ?? 0)));
        pt.prompt = isDusty ? uiText.hud.interactPanel : `${uiText.hud.interactPanelCleanPrefix} (${pct} %)`;
      } else if (pt.kind === 'moxie') {
        pt.marker?.setVisible(!state.base.moxieOk);
        pt.prompt = state.base.moxieOk ? uiText.hud.interactMoxieOk : uiText.hud.interactMoxie;
      } else if (pt.kind === 'antenna') {
        pt.sprite?.setTexture(state.base.antennaOk ? 'antenna' : 'antenna_broken');
        pt.marker?.setVisible(!state.base.antennaOk);
        pt.prompt = state.base.antennaOk ? uiText.hud.interactAntennaOk : uiText.hud.interactAntenna;
      }
    }
    this.lastPromptText = null;
    this.publishMarkers();
  }

  // ------------------------------------------------------------------ bucle

  update(time: number, delta: number): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    if (this.rescueTriggered) return;

    mapMarkers.player.x = this.player.x;
    mapMarkers.player.y = this.player.y;
    this.updateDust(delta, time);
    this.updateNightSky(time, state.clock.minutes, delta);

    const inMinigame = this.isAnyMinigameActive();
    if (inMinigame !== this.wasInMinigame) {
      this.wasInMinigame = inMinigame;
      this.input.keyboard?.resetKeys();
      AudioSystem.setMusicDuck(inMinigame ? 0.45 : 1);
      if (inMinigame) bus.emit('prompt:near', { text: null });
    }

    if (inMinigame) {
      this.player.setVelocity(0, 0);
      const fieldRes = Vitals.tickFieldWork(state, delta / 1000);
      if (fieldRes.warnedO2At40) bus.emit('vitals:o2Warn40');
      if (fieldRes.dangerO2At20) bus.emit('vitals:o2Danger20');
      return;
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

    this.staticEffect?.update(time);
    const dt = delta / 1000;

    // 1. Movimiento (WASD, flechas o joystick)
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
      this.walkBobTime += delta;
      this.leaveFootprint(time);
      const targetAngle = Math.atan2(vy, vx);
      const diff = Math.atan2(Math.sin(targetAngle - this.flashAngle), Math.cos(targetAngle - this.flashAngle));
      this.flashAngle += diff * Math.min(1, dt * 12);
    } else {
      this.player.setVelocity(0, 0);
      this.walkBobTime = 0;
      const idleTarget =
        this.facingDir === 'right'
          ? 0
          : this.facingDir === 'left'
            ? Math.PI
            : this.facingDir === 'up'
              ? -Math.PI / 2
              : Math.PI / 2;
      const diff = Math.atan2(Math.sin(idleTarget - this.flashAngle), Math.cos(idleTarget - this.flashAngle));
      this.flashAngle += diff * Math.min(1, dt * 10);
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
    this.fadeFootprints(time);

    state.astronaut.pos.x = Math.round(this.player.x);
    state.astronaut.pos.y = Math.round(this.player.y);

    this.updateInteractionPrompt();
    this.updateCurrentZone();

    // 2. Reloj
    const durationSec = Clock.getDayDurationSec(state.day, true);
    const clockRes = Clock.tick(state, dt, durationSec);
    if (clockRes.warned16) bus.emit('clock:warn16');
    if (clockRes.curfew17) bus.emit('clock:curfew17');
    if (clockRes.ended20) {
      state.supplyBonus = 'menos';
      state.missionTrust = Math.max(0, state.missionTrust - 1);
      bus.emit('interact:prompt', { text: uiText.hud.radioCurfewReturn });
      this.rescueTriggered = true;
      this.cameras.main.fadeOut(350, 24, 20, 37);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.enterBase('base'));
      return;
    }

    // 3. Cielo nocturno y avisos nocturnos
    const m = state.clock.minutes;
    const night = Clock.isNight(m);
    if (night && !this.warnedNightFirst) {
      this.warnedNightFirst = true;
      bus.emit('interact:prompt', { text: uiText.hud.radioNightFirst });
    }
    if (night && state.astronaut.heaterBattery <= 0 && !this.warnedHeaterEmpty) {
      this.warnedHeaterEmpty = true;
      bus.emit('interact:prompt', { text: uiText.hud.radioHeaterEmpty });
    }
    AudioSystem.startLoop('ambient', 'wind_loop', night ? 1.1 : 0.8);

    // 4. Eventos diarios y tormenta solar
    const evRes = Events.tick(state, dt);
    if (evRes.triggeredEvents.length > 0) {
      this.refreshEquipmentVisuals();
      for (const ev of evRes.triggeredEvents) {
        AudioSystem.play('radio_in');
        if (ev.type === 'dust') bus.emit('interact:prompt', { text: uiText.hud.radioDustEvent });
        else if (ev.type === 'moxie_pipes') bus.emit('interact:prompt', { text: uiText.hud.radioMoxieEvent });
        else if (ev.type === 'cold_night') bus.emit('interact:prompt', { text: uiText.hud.radioColdNightEvent });
        else if (ev.type === 'antenna') bus.emit('interact:prompt', { text: uiText.hud.radioAntennaEvent });
      }
    }
    if (evRes.antennaDamaged) {
      this.refreshEquipmentVisuals();
      bus.emit('interact:prompt', { text: uiText.hud.radioAntennaStorm });
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
    if (vitalsRes.warnedO2At40) bus.emit('vitals:o2Warn40');
    if (vitalsRes.dangerO2At20) bus.emit('vitals:o2Danger20');

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

  private updateNightSky(time: number, minutes: number, _delta?: number): void {
    const state = gameStore.state;
    const dusk = Phaser.Math.Clamp(
      (minutes - balance.dayClock.warnMin) / (balance.dayClock.curfewMin - balance.dayClock.warnMin),
      0,
      1
    );
    const night = Clock.isNight(minutes);
    const skyBlend = night ? 1 : dusk * 0.72;

    // Transición suave al terreno azul nocturno de Karmin + veladura sutil
    this.nightGroundTile.setAlpha(skyBlend);
    this.nightOverlay.setFillStyle(night ? 0x0b1026 : 0x1c2559, night ? 0.24 : dusk * 0.12);

    const cg = this.nightCosmosGfx;
    const lg = this.playerLightGfx;
    cg.clear();
    lg.clear();
    if (skyBlend <= 0.02) return;

    const view = this.cameras.main.worldView;
    const camCx = view.centerX;
    // Bóveda superior inspirada en image_4.png: ~54 u arriba de view.top, elevándose si el jugador está al borde norte
    const horizonY = Math.min(view.top + 54, Math.max(view.top + 22, this.player.y - 20));
    const canopyH = Math.max(22, horizonY - view.top);

    // 1. Fondo celeste espacial profundo con franjas de degradado nítido
    const skyAlpha = Math.min(0.97, skyBlend * 0.97);
    cg.fillStyle(0x0b0a1c, skyAlpha);
    cg.fillRect(view.left - 4, view.top - 2, view.width + 8, canopyH * 0.45 + 2);
    cg.fillStyle(0x161228, skyAlpha);
    cg.fillRect(view.left - 4, view.top + canopyH * 0.45, view.width + 8, canopyH * 0.35);
    cg.fillStyle(0x241634, skyAlpha);
    cg.fillRect(view.left - 4, view.top + canopyH * 0.8, view.width + 8, canopyH * 0.24);

    // 2. Banda pixel-art diagonal de la Vía Láctea (izquierda abajo -> arriba centro-derecha)
    const mwShift = (camCx * 0.06) % 320;
    const bandSteps = 22;
    for (let i = 0; i < bandSteps; i++) {
      const t = i / (bandSteps - 1);
      const bx = Math.round(view.left + 16 + t * 204 - (mwShift * 0.15));
      const by = Math.round(horizonY - 5 - t * (canopyH - 8) + Math.sin(i * 0.9) * 2.5);
      // Halo púrpura exterior
      cg.fillStyle(0x3a2a6a, 0.48 * skyBlend);
      cg.fillRect(bx - 8, by - 5, 18, 10);
      // Nube magenta/violeta intermedia
      cg.fillStyle(i % 2 === 0 ? 0x6b3fa0 : 0xb55088, 0.42 * skyBlend);
      cg.fillRect(bx - 5, by - 3, 12, 6);
      // Núcleo luminoso crema / cian
      if (i % 2 === 0) {
        cg.fillStyle(i % 4 === 0 ? 0xead4aa : 0x2ce8f5, 0.42 * skyBlend);
        cg.fillRect(bx - 2, by - 1, 5, 2);
      }
    }

    // 3. Estrellas en píxeles nítidos y destellos de 4 puntas
    const parallaxX = camCx * 0.14;
    for (const s of this.nightStars) {
      const sx = Math.round(view.left + ((((s.ox - parallaxX) % 330) + 330) % 330) - 4);
      const sy = Math.round(view.top + (s.oy / 54) * (canopyH - 3));
      const twinkle = 0.5 + 0.5 * Math.sin(time * s.speed + s.phase);
      const alpha = twinkle * skyBlend;
      if (alpha <= 0.08) continue;
      cg.fillStyle(s.color, alpha);
      cg.fillRect(sx, sy, s.size, s.size);
      if (s.sparkle) {
        cg.fillStyle(0xffffff, alpha * 0.85);
        cg.fillRect(sx - 2, sy, 5, 1);
        cg.fillRect(sx, sy - 2, 1, 5);
        cg.fillStyle(s.color, alpha * 0.45);
        cg.fillRect(sx - 3, sy, 1, 1);
        cg.fillRect(sx + 3, sy, 1, 1);
      }
    }

    // 4. Auroras marcianas cuando una CME roza el planeta (aurora_tonight)
    if (night && state.activeEvents.includes('aurora_tonight')) {
      for (let i = 0; i < 18; i++) {
        const ax = Math.round(view.left + 8 + i * 18);
        const wave = Math.sin(time * 0.0022 + i * 0.55);
        const ay = Math.round(view.top + 10 + wave * 4);
        const ah = Math.round(Math.min(canopyH - 14, 14 + Math.cos(time * 0.0017 + i) * 5));
        cg.fillStyle(i % 3 === 0 ? 0xb55088 : i % 2 === 0 ? 0x63c74d : 0x2ce8f5, (0.24 + wave * 0.08) * skyBlend);
        cg.fillRect(ax, ay, 8, Math.max(4, ah));
      }
    }

    // 5. Fobos (pequeña e irregular con cráteres) y Deimos / luna marciana visible entre el banner y el radar
    const m1x = Math.round(view.left + 206 - ((camCx * 0.02) % 14));
    const m1y = Math.round(view.top + Math.min(20, canopyH * 0.36));
    cg.fillStyle(0xc0cbdc, 0.92 * skyBlend);
    cg.fillCircle(m1x, m1y, 3.2);
    cg.fillCircle(m1x + 2, m1y + 0.6, 2.1);
    cg.fillStyle(0x5a6988, 0.8 * skyBlend);
    cg.fillRect(m1x - 1, m1y - 1, 1, 1);
    cg.fillRect(m1x + 1, m1y + 1, 1, 1);

    const m2x = Math.round(view.left + 234 - ((camCx * 0.025) % 18));
    const m2y = Math.round(view.top + Math.min(21, canopyH * 0.38));
    cg.fillStyle(0xead4aa, 0.16 * skyBlend);
    cg.fillCircle(m2x, m2y, 8);
    cg.fillStyle(0x8b9bb4, 0.95 * skyBlend);
    cg.fillCircle(m2x, m2y, 5);
    cg.fillStyle(0x5a6988, 0.85 * skyBlend);
    cg.fillRect(m2x - 2, m2y - 2, 2, 2);
    cg.fillRect(m2x + 1, m2y + 1, 2, 1);
    cg.fillStyle(0xc0cbdc, 0.75 * skyBlend);
    cg.fillRect(m2x - 3, m2y + 1, 1, 1);

    // 6. Estrellas fugaces ocasionales durante la noche
    if (night) {
      if (!this.meteorState.active && time >= this.meteorState.nextAt) {
        this.meteorState.active = true;
        this.meteorState.startedAt = time;
        this.meteorState.sx = Phaser.Math.Between(35, 250);
        this.meteorState.sy = Phaser.Math.Between(4, 22);
        this.meteorState.dx = Phaser.Math.Between(-58, -32);
        this.meteorState.dy = Phaser.Math.Between(12, 22);
      }
      if (this.meteorState.active) {
        const p = (time - this.meteorState.startedAt) / 520;
        if (p >= 1) {
          this.meteorState.active = false;
          this.meteorState.nextAt = time + Phaser.Math.Between(3200, 6400);
        } else {
          const hx = view.left + this.meteorState.sx + this.meteorState.dx * p;
          const hy = view.top + this.meteorState.sy + this.meteorState.dy * p;
          const tail = Math.max(0, p - 0.22);
          const tx = view.left + this.meteorState.sx + this.meteorState.dx * tail;
          const ty = view.top + this.meteorState.sy + this.meteorState.dy * tail;
          cg.lineStyle(1.4, 0x2ce8f5, (1 - p) * 0.85);
          cg.lineBetween(tx, ty, hx, hy);
          cg.fillStyle(0xffffff, 1 - p * 0.7);
          cg.fillRect(Math.round(hx), Math.round(hy), 2, 2);
        }
      }
    }

    // 7. Silueta de cordillera/meseta marciana dividiendo cielo estelar y superficie
    const ridgeBaseY = Math.round(horizonY);
    const stepW = 8;
    const startCol = Math.floor((view.left - 8) / stepW);
    const endCol = Math.ceil((view.right + 8) / stepW);
    for (let col = startCol; col <= endCol; col++) {
      const rx = col * stepW;
      const hOff = Math.round(Math.sin(col * 0.35) * 2.5 + Math.cos(col * 0.78) * 1.5);
      const topY = ridgeBaseY + hOff;
      cg.fillStyle(0x2b1b24, skyAlpha);
      cg.fillRect(rx, topY, stepW + 1, 7);
      cg.fillStyle(0x4a2c31, skyAlpha * 0.85);
      cg.fillRect(rx, topY, stepW + 1, 1.5);
      cg.fillStyle(0x181425, 0.32 * skyBlend);
      cg.fillRect(rx, topY + 6, stepW + 1, 3);
    }

    // 8. Haz direccional cálido de la linterna del traje (como en image_4.png)
    const px = this.player.x;
    const py = this.player.y;
    const handX = px + Math.cos(this.flashAngle + 0.5) * 4;
    const handY = py + 2 + Math.sin(this.flashAngle + 0.5) * 3;
    const maxReach = 78;
    const halfCone = 0.32;

    // Aro suave alrededor del traje + foco en la mano
    lg.fillStyle(0xead4aa, 0.08 * skyBlend);
    lg.fillCircle(px, py + 2, 16);
    lg.fillStyle(0xfee761, 0.9 * skyBlend);
    lg.fillRect(Math.round(handX) - 1, Math.round(handY) - 1, 2, 2);

    const layers: [number, number, number][] = [
      [1.0, 0.045, 0xead4aa],
      [0.78, 0.065, 0xead4aa],
      [0.54, 0.09, 0xfee761],
      [0.32, 0.13, 0xfee761],
      [0.16, 0.18, 0xffffff],
    ];
    for (const [reachFrac, alpha, col] of layers) {
      const r = maxReach * reachFrac;
      const a1 = this.flashAngle - halfCone * (0.7 + reachFrac * 0.3);
      const a2 = this.flashAngle + halfCone * (0.7 + reachFrac * 0.3);
      const x1 = handX + Math.cos(a1) * r;
      const y1 = Math.max(horizonY + 1, handY + Math.sin(a1) * r);
      const x2 = handX + Math.cos(a2) * r;
      const y2 = Math.max(horizonY + 1, handY + Math.sin(a2) * r);
      lg.fillStyle(col, alpha * skyBlend);
      lg.fillTriangle(handX, handY, x1, y1, x2, y2);
    }

    // Parche iluminado en tierra al extremo del haz
    const spotX = handX + Math.cos(this.flashAngle) * (maxReach * 0.72);
    const spotY = Math.max(horizonY + 4, handY + Math.sin(this.flashAngle) * (maxReach * 0.72));
    lg.fillStyle(0xead4aa, 0.11 * skyBlend);
    lg.fillEllipse(spotX, spotY, 28, 12);

    // 9. Resplandor cian suave en sitios de muestras activos + luces de Base, Refugio y Depósito
    for (const pt of this.interactPoints) {
      if (pt.kind !== 'sample' || pt.collected) continue;
      if (pt.x < view.left - 24 || pt.x > view.right + 24) continue;
      if (pt.y < horizonY - 4 || pt.y > view.bottom + 24) continue;
      lg.fillStyle(0x2ce8f5, 0.09 * skyBlend);
      lg.fillCircle(pt.x, pt.y - 4, 16);
      lg.fillStyle(0x2ce8f5, 0.16 * skyBlend);
      lg.fillCircle(pt.x, pt.y - 12, 9);
    }

    const beacons: [number, number, number][] = [
      [640, 480, 0xfee761],
      [748, 514, 0x63c74d],
      [940, 490, 0x2ce8f5],
    ];
    for (const [bx, by, col] of beacons) {
      if (by < horizonY - 6) continue;
      lg.fillStyle(col, 0.09 * skyBlend);
      lg.fillCircle(bx, by, 24);
      lg.fillStyle(col, 0.14 * skyBlend);
      lg.fillCircle(bx, by, 11);
    }
  }

  private updateDust(delta: number, time: number): void {
    const view = this.cameras.main.worldView;
    const dt = delta / 1000;
    const hasDustEvent = gameStore.state.activeEvents.includes('dust');
    const gustWave = 0.55 + 0.35 * Math.sin(time * 0.0014) + 0.25 * Math.sin(time * 0.0033);
    const intensity = gustWave * (hasDustEvent ? 1.85 : 1.0);

    for (const m of this.dustMotes) {
      m.img.x += dt * m.speed * (0.75 + intensity * 0.65);
      m.img.y += dt * (9 * intensity) + Math.sin(time * 0.004 + m.wavePhase) * 0.12;
      if (m.img.x > view.right + 12) {
        m.img.x = view.left - 10;
        m.img.y = Phaser.Math.Between(Math.floor(view.top), Math.floor(view.bottom));
      }
      if (m.img.x < view.left - 24 || m.img.y < view.top - 20 || m.img.y > view.bottom + 20) {
        m.img.x = Phaser.Math.Between(Math.floor(view.left), Math.floor(view.right));
        m.img.y = Phaser.Math.Between(Math.floor(view.top), Math.floor(view.bottom));
      }
    }

    const wg = this.windGfx;
    wg.clear();

    const cloudCount = hasDustEvent ? 6 : 3;
    for (let c = 0; c < cloudCount; c++) {
      const cx = view.left + (((time * (0.045 + c * 0.012) + c * 95) % (view.width + 120)) - 60);
      const cy = view.top + 22 + ((c * 31) % Math.max(40, view.height - 30)) + Math.sin(time * 0.0016 + c) * 8;
      const cw = 72 + (c % 3) * 26;
      const ch = 16 + (c % 2) * 8;
      wg.fillStyle(c % 2 === 0 ? 0xe4a672 : 0xb86f50, Math.min(0.24, (0.06 + intensity * 0.055)));
      wg.fillEllipse(cx, cy, cw, ch);
    }

    const activeStreaks = hasDustEvent ? this.windStreaks.length : 22;
    const viewW = Math.max(1, view.width + 40);
    const viewH = Math.max(1, view.height + 20);
    for (let i = 0; i < activeStreaks; i++) {
      const st = this.windStreaks[i];
      st.ox = (st.ox + dt * st.speed * (0.8 + intensity * 0.65)) % viewW;
      st.oy = (st.oy + dt * 16 * intensity) % viewH;
      const sx = view.left - 20 + st.ox;
      const sy = view.top - 10 + st.oy;
      const len = st.len * (0.7 + intensity * 0.5);
      wg.lineStyle(1, st.color, Math.min(0.55, 0.16 + intensity * 0.16));
      wg.lineBetween(sx, sy, sx + len, sy + len * 0.22);
    }
  }

  private leaveFootprint(time: number): void {
    if (time - this.lastFootAt < 160) return;
    this.lastFootAt = time;
    this.footSide = 1 - this.footSide;
    const img = this.add
      .image(this.player.x + (this.footSide ? 2 : -2), this.player.y + 10, 'footprint')
      .setAlpha(0.7)
      .setDepth(1);
    this.footprints.push({ img, born: time });
    if (this.footprints.length > 60) this.footprints.shift()?.img.destroy();
  }

  private fadeFootprints(time: number): void {
    for (const f of this.footprints) {
      f.img.setAlpha(Math.max(0, 0.7 - (time - f.born) / 9000));
    }
  }

  // ------------------------------------------------------------------ interacción

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
    if (!pt) return -1;
    if (pt.kind === 'sample') {
      if (pt.sampleType === 'roca') return 0;
      if (pt.sampleType === 'suelo') return 1;
      if (pt.sampleType === 'minerales') return 2;
      if (pt.sampleType === 'aire') return 3;
    }
    if (pt.kind === 'panel') return 4;
    if (pt.kind === 'moxie' || pt.kind === 'antenna') return 5;
    return -1;
  }

  private updateInteractionPrompt(): void {
    const nearest = this.getNearestInteractPoint();
    const toolIdx = this.getToolIndexForPoint(nearest);
    if (toolIdx !== this.lastToolIndex) {
      this.lastToolIndex = toolIdx;
      bus.emit('tool:changed', { index: toolIdx });
    }
    const text = nearest ? nearest.prompt : null;
    if (text !== this.lastPromptText) {
      this.lastPromptText = text;
      bus.emit('prompt:near', { text });
    }
  }

  private handleInteraction(): void {
    const state = gameStore.state;
    if (
      state.clock.paused ||
      this.rescueTriggered ||
      this.isAnyMinigameActive() ||
      Dialogo.isDialogBlocking() ||
      this.time.now - this.sceneEnteredAt < 350
    ) {
      return;
    }
    const nearest = this.getNearestInteractPoint();
    if (!nearest) return;
    this.activatePoint(nearest);
  }

  private activatePoint(pt: InteractPoint): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    if (this.isAnyMinigameActive() || state.clock.paused || Dialogo.isDialogBlocking()) return;

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
          AudioSystem.play('ui_drop');
          Save.save(state);
          bus.emit('interact:prompt', { text: uiText.hud.radioThreeForks });
          this.publishMarkers();
        } else {
          bus.emit('interact:prompt', { text: uiText.base.noTubesMsg });
        }
        break;
      }
      case 'panel': {
        const pData = state.base.panels.find((p) => p.id === pt.panelId);
        if ((pData?.dust ?? 0) <= balance.dust.dirtyThreshold) {
          bus.emit('interact:prompt', { text: pt.prompt });
          return;
        }
        this.launchMinigame(pt, 'MinijuegoPaneles', { type: 'panel', panelId: pt.panelId });
        break;
      }
      case 'moxie':
        if (state.base.moxieOk) {
          bus.emit('interact:prompt', { text: uiText.hud.interactMoxieOk });
          return;
        }
        this.launchMinigame(pt, 'MinijuegoTuberias', { type: 'moxie_pipes' });
        break;
      case 'antenna':
        if (state.base.antennaOk) {
          bus.emit('interact:prompt', { text: uiText.hud.interactAntennaOk });
          return;
        }
        this.launchMinigame(pt, 'MinijuegoTuberias', { type: 'antenna' });
        break;
      case 'sample':
        this.startSampleCollection(pt);
        break;
    }
  }

  private launchMinigame(pt: InteractPoint, key: string, extra: Record<string, unknown>): void {
    const state = gameStore.state;
    this.activeSamplePoint = pt;
    this.player.setVelocity(0, 0);
    bus.emit('prompt:near', { text: null });
    this.scene.launch(key, {
      day: state.day,
      difficulty: difficultyForDay(state.day),
      zone: this.currentZoneName,
      ...extra,
    });
  }

  private startSampleCollection(pt: InteractPoint): void {
    const uiText = I18n.ui();
    const state = gameStore.state;
    if (state.tubes.findIndex((t) => t === null) === -1) {
      bus.emit('interact:prompt', { text: uiText.hud.radioBoxFull });
      return;
    }
    const sceneMap: Record<SampleType, string> = {
      roca: 'MinijuegoRoca',
      suelo: 'MinijuegoSuelo',
      minerales: 'MinijuegoMinerales',
      aire: 'MinijuegoAire',
    };
    this.launchMinigame(pt, sceneMap[pt.sampleType ?? 'roca'], { type: pt.sampleType ?? 'roca' });
  }

  private enterBase(targetLocation: 'base' | 'refugio'): void {
    const state = gameStore.state;
    state.location = targetLocation;
    Save.save(state);
    AudioSystem.play('airlock', { volume: 0.7 });
    this.scene.start(targetLocation === 'refugio' ? 'Refugio' : 'Base');
  }

  private updateCurrentZone(): void {
    const uiText = I18n.ui();
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
