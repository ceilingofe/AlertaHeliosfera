import Phaser from 'phaser';
import balance from '../../content/balance.json';
import uiText from '../../content/ui_text.json';
import { bus } from '../state/bus';
import { gameStore } from '../state/GameState';
import { mapMarkers, SAMPLE_NAMES, type MapMarker } from '../state/mapMarkers';
import { Save } from '../state/Save';
import { AudioSystem } from '../systems/Audio';
import { BaseSystem } from '../systems/BaseSystem';
import { Clock } from '../systems/Clock';
import { Events } from '../systems/Events';
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
  r: number;
  color: number;
  speed: number;
  phase: number;
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
  roca: 'rock_leopard',
  suelo: 'rock_sandstone',
  minerales: 'rock_sparkle',
  aire: 'air_station',
};

/** Dificultad de los minijuegos según el día (1 = aprendiz, 3 = experto). */
export function difficultyForDay(day: number): 1 | 2 | 3 {
  return day <= 2 ? 1 : day <= 5 ? 2 : 3;
}

/**
 * Escena exterior en el cráter Jezero (1280×960 px).
 * Conecta movimiento, zonas reales, sitios de muestra que cambian cada día, los minijuegos,
 * eventos diarios, tormenta solar y signos vitales. Publica los puntos del mapa para el radar.
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
  private sceneEnteredAt = 0;

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

  create(): void {
    const state = gameStore.state;
    state.location = 'mundo';
    Clock.setPaused(state, false);
    this.sceneEnteredAt = this.time.now;
    this.facingDir = 'down';
    this.walkBobTime = 0;
    this.rescueTriggered = false;
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

    // 1. Suelo: sprite base de Karmin + capa de variación para que no se note la repetición
    this.add.tileSprite(0, 0, mapWidth, mapHeight, 'ground_placeholder').setOrigin(0, 0);
    this.add.tileSprite(0, 0, mapWidth, mapHeight, 'ground_var').setOrigin(0, 0).setAlpha(0.9);

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

    // 4. Astronauta con su color de traje, peinado y vista en 4 direcciones
    const hairKey = AstronautAppearance.getDirectionalMiniKey(
      this,
      state.customization.hair,
      state.customization.suit,
      'down',
      0
    );
    this.player = this.physics.add.sprite(state.astronaut.pos.x, state.astronaut.pos.y, hairKey);
    this.player.setCollideWorldBounds(true).setDepth(10);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(10, 10);
    body.setOffset(2, 13);
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

    // 6. Atardecer y noche estrellada: cielo nocturno con estrellas, Vía Láctea, Fobos/Deimos y halo del traje
    this.nightOverlay = this.add.rectangle(0, 0, mapWidth, mapHeight, 0x0b1026, 0).setOrigin(0, 0).setDepth(30);
    this.nightCosmosGfx = this.add.graphics().setDepth(31);
    this.playerLightGfx = this.add.graphics().setDepth(32);

    const starPalette = [0xffffff, 0xc0cbdc, 0x2ce8f5, 0xfee761, 0xf4b4b4];
    const starRnd = new Phaser.Math.RandomDataGenerator(['jezero-cosmos-stars']);
    for (let i = 0; i < 84; i++) {
      this.nightStars.push({
        ox: starRnd.realInRange(0, 420),
        oy: starRnd.realInRange(2, 60),
        r: i % 9 === 0 ? 1.25 : i % 3 === 0 ? 0.85 : 0.55,
        color: starPalette[i % starPalette.length],
        speed: starRnd.realInRange(0.0018, 0.0052),
        phase: starRnd.realInRange(0, Math.PI * 2),
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

    for (const key of ['HUD', 'Dialogo', 'Tormenta']) {
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

    // Senderos marcados hacia Bright Angel y Three Forks
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

    // Huellas del rover Perseverance cruzando el cráter
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
    for (let i = 0; i < 160; i++) {
      const x = rnd.between(10, 1270);
      const y = rnd.between(10, 950);
      if (Math.abs(x - 640) < 140 && Math.abs(y - 490) < 70) continue;
      this.add.image(x, y, rnd.pick(['pebble_a', 'pebble_b', 'pebble_c']));
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
    this.add.ellipse(site.x, site.y + 6, 14, 4, 0x3e2731, 0.4);
    const rockImg = this.add.image(site.x, site.y, SAMPLE_SPRITES[site.type]).setInteractive({ useHandCursor: true });
    const marker = this.add.image(site.x, site.y - 14, 'marker_sample').setInteractive({ useHandCursor: true });
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
      // Con clic también hay que estar cerca, igual que con el teclado
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, pt.x, pt.y);
      if (d > balance.player.interactRadius + 26) {
        bus.emit('interact:prompt', { text: uiText.hud.radioTooFar });
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
        // Misión abortada: ese sitio se pierde y aparece un punto nuevo del mismo tipo en otra zona
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
          label: SAMPLE_NAMES[type],
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
    const state = gameStore.state;
    if (this.rescueTriggered) return;

    mapMarkers.player.x = this.player.x;
    mapMarkers.player.y = this.player.y;
    this.updateDust(delta, time);
    this.updateNightSky(time, state.clock.minutes);

    const inMinigame = this.isAnyMinigameActive();
    if (inMinigame !== this.wasInMinigame) {
      this.wasInMinigame = inMinigame;
      this.input.keyboard?.resetKeys();
      AudioSystem.setMusicDuck(inMinigame ? 0.45 : 1);
      if (inMinigame) bus.emit('prompt:near', { text: null });
    }

    if (inMinigame) {
      this.player.setVelocity(0, 0);
      // El trabajo de campo gasta oxígeno aunque el reloj del día esté detenido
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

    // 1. Movimiento (WASD, flechas o joystick) con vistas en 4 direcciones y pasos animados
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
      // Quedarse afuera hasta las 20:00 es una falla de seguridad: Control de Misión lo registra.
      state.supplyBonus = 'menos';
      state.missionTrust = Math.max(0, state.missionTrust - 1);
      bus.emit('interact:prompt', { text: uiText.hud.radioCurfewReturn });
      this.rescueTriggered = true;
      this.cameras.main.fadeOut(350, 24, 20, 37);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.enterBase('base'));
      return;
    }

    // Tinte del cielo: atardecer desde las 16:00, noche estrellada desde las 17:00
    const m = state.clock.minutes;
    this.updateNightSky(time, m);
    AudioSystem.startLoop('ambient', 'wind_loop', Clock.isNight(m) ? 1.1 : 0.8);

    // 3. Eventos diarios y tormenta solar
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

  private updateNightSky(time: number, minutes: number): void {
    const state = gameStore.state;
    const dusk = Phaser.Math.Clamp(
      (minutes - balance.dayClock.warnMin) / (balance.dayClock.curfewMin - balance.dayClock.warnMin),
      0,
      1
    );
    const night = Clock.isNight(minutes);
    const skyBlend = night ? 1 : dusk * 0.65;

    // Color de atardecer azulado-violáceo en Marte -> noche estelar profunda (#0b1026)
    this.nightOverlay.setFillStyle(night ? 0x0b1026 : 0x1c2559, night ? 0.44 : dusk * 0.24);

    const cg = this.nightCosmosGfx;
    const lg = this.playerLightGfx;
    cg.clear();
    lg.clear();
    if (skyBlend <= 0.02) return;

    const view = this.cameras.main.worldView;
    const camCx = view.centerX;

    // 1. Bóveda celeste superior con gradiente suave hacia el horizonte marciano
    const canopyH = 56;
    const bands = 7;
    const bandH = canopyH / bands;
    for (let b = 0; b < bands; b++) {
      const bandAlpha = (1 - b / bands) * 0.66 * skyBlend;
      cg.fillStyle(b < 3 ? 0x060919 : 0x0f1636, bandAlpha);
      cg.fillRect(view.left - 4, view.top + b * bandH, view.width + 8, bandH + 0.5);
    }

    // 2. Banda luminosa de la Vía Láctea cruzando en diagonal la bóveda
    const mwShift = ((camCx * 0.1) % 320);
    for (let i = 0; i < 12; i++) {
      const mx = view.left + ((i * 28 - mwShift + 640) % 340) - 10;
      const my = view.top + 38 - i * 2.4 + Math.sin(i * 0.7) * 3;
      cg.fillStyle(i % 2 === 0 ? 0x3b4d8f : 0x6c4c8f, 0.13 * skyBlend);
      cg.fillEllipse(mx, my, 42, 16);
    }

    // 3. Estrellas multicolores con paralaje suave y parpadeo natural
    const parallaxX = camCx * 0.16;
    for (const s of this.nightStars) {
      const sx = view.left + (((s.ox - parallaxX) % 330) + 330) % 330 - 5;
      const sy = view.top + s.oy;
      const horizonFade = s.oy < 42 ? 1 : Phaser.Math.Clamp(1 - (s.oy - 42) / 18, 0, 1);
      const twinkle = 0.45 + 0.55 * Math.sin(time * s.speed + s.phase);
      const alpha = horizonFade * twinkle * skyBlend;
      if (alpha <= 0.04) continue;
      cg.fillStyle(s.color, alpha);
      cg.fillCircle(sx, sy, s.r);
      if (s.r >= 1.2) {
        cg.fillStyle(s.color, alpha * 0.35);
        cg.fillRect(sx - 2, sy - 0.3, 4, 0.6);
        cg.fillRect(sx - 0.3, sy - 2, 0.6, 4);
      }
    }

    // 4. Auroras marcianas discretas cuando una CME roza el planeta (aurora_tonight)
    if (night && state.activeEvents.includes('aurora_tonight')) {
      for (let i = 0; i < 16; i++) {
        const ax = view.left + 12 + i * 20;
        const wave = Math.sin(time * 0.0022 + i * 0.55);
        const ay = view.top + 14 + wave * 5;
        const ah = 14 + Math.cos(time * 0.0017 + i) * 5;
        cg.fillStyle(i % 3 === 0 ? 0xb55088 : 0x63c74d, (0.22 + wave * 0.08) * skyBlend);
        cg.fillRect(ax, ay, 8, ah);
      }
    }

    // 5. Fobos (grande e irregular, con cráteres) y Deimos (brillante punto lejano)
    const phobosX = view.left + 252 - (camCx * 0.03) % 40;
    const phobosY = view.top + 15;
    cg.fillStyle(0xead4aa, 0.16 * skyBlend);
    cg.fillCircle(phobosX, phobosY, 9);
    cg.fillStyle(0xead4aa, 0.92 * skyBlend);
    cg.fillCircle(phobosX - 1, phobosY, 4.2);
    cg.fillCircle(phobosX + 2.5, phobosY + 0.8, 2.8);
    cg.fillStyle(0xb86f50, 0.7 * skyBlend);
    cg.fillCircle(phobosX - 2, phobosY - 1, 1.1);
    cg.fillCircle(phobosX + 1.5, phobosY + 1.2, 0.8);

    const deimosX = view.left + 84 - (camCx * 0.02) % 30;
    const deimosY = view.top + 20;
    cg.fillStyle(0xc0cbdc, 0.2 * skyBlend);
    cg.fillCircle(deimosX, deimosY, 4.5);
    cg.fillStyle(0xffffff, 0.95 * skyBlend);
    cg.fillCircle(deimosX, deimosY, 1.5);

    // 6. Estrellas fugaces ocasionales durante la noche
    if (night) {
      if (!this.meteorState.active && time >= this.meteorState.nextAt) {
        this.meteorState.active = true;
        this.meteorState.startedAt = time;
        this.meteorState.sx = Phaser.Math.Between(35, 280);
        this.meteorState.sy = Phaser.Math.Between(4, 24);
        this.meteorState.dx = Phaser.Math.Between(-58, -32);
        this.meteorState.dy = Phaser.Math.Between(14, 24);
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
          cg.fillCircle(hx, hy, 1.3);
        }
      }
    }

    // 7. Luz del visor del astronauta y faros cálidos en la Base, Refugio y Depósito
    const px = this.player.x;
    const py = this.player.y;
    lg.fillStyle(0xfee761, 0.055 * skyBlend);
    lg.fillCircle(px, py, 32);
    lg.fillStyle(0xead4aa, 0.08 * skyBlend);
    lg.fillCircle(px, py, 19);
    const dirVec =
      this.facingDir === 'left'
        ? [-14, 0]
        : this.facingDir === 'right'
          ? [14, 0]
          : this.facingDir === 'up'
            ? [0, -14]
            : [0, 14];
    lg.fillStyle(0x2ce8f5, 0.085 * skyBlend);
    lg.fillCircle(px + dirVec[0], py + dirVec[1], 14);

    const beacons: [number, number, number][] = [
      [640, 480, 0xfee761],
      [748, 514, 0x63c74d],
      [940, 490, 0x2ce8f5],
    ];
    for (const [bx, by, col] of beacons) {
      lg.fillStyle(col, 0.08 * skyBlend);
      lg.fillCircle(bx, by, 24);
      lg.fillStyle(col, 0.12 * skyBlend);
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

    // Ráfagas dinámicas y velos móviles de arena por toda la cámara visible
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
