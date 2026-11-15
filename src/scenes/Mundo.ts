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
import { generateSampleSites, type SampleSite } from '../systems/SampleSites';
import { Vitals } from '../systems/Vitals';
import type { SampleType } from '../types';
import { AstronautAppearance } from '../ui/AstronautAppearance';
import { getSharedJoystickVector } from '../ui/Joystick';
import { StaticEffect } from '../ui/StaticEffect';

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
  private playerOriginY = 0;
  private walkBobTime = 0;

  private nightOverlay!: Phaser.GameObjects.Rectangle;
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
  private dustMotes: Phaser.GameObjects.Image[] = [];
  private wasInMinigame = false;

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
    this.footprints = [];
    this.dustMotes = [];
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
    const sites = generateSampleSites(state.day, state.quotaToday);
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

    // 4. Astronauta con su color de traje y peinado actuales
    const hairKey = AstronautAppearance.getMiniTextureKey(this, state.customization.hair, state.customization.suit);
    this.player = this.physics.add.sprite(state.astronaut.pos.x, state.astronaut.pos.y, hairKey);
    this.player.setCollideWorldBounds(true).setDepth(10);
    this.playerOriginY = this.player.displayOriginY;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(10, 10);
    body.setOffset(2, 13);
    this.physics.add.collider(this.player, obstacles);

    // 5. Polvo que arrastra el viento
    for (let i = 0; i < 26; i++) {
      const m = this.add
        .image(Phaser.Math.Between(0, mapWidth), Phaser.Math.Between(0, mapHeight), 'dust_mote')
        .setAlpha(0.5)
        .setDepth(25);
      this.dustMotes.push(m);
    }

    // 6. Atardecer y noche: el cielo se oscurece poco a poco desde las 16:00
    this.nightOverlay = this.add.rectangle(0, 0, mapWidth, mapHeight, 0x124e89, 0).setOrigin(0, 0).setDepth(30);

    // 7. Cámara
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);
    this.cameras.main.fadeIn(250, 24, 20, 37);
    this.physics.world.setBounds(0, 0, mapWidth, mapHeight);

    // 8. Controles de teclado
    const keyboard = this.input.keyboard;
    if (keyboard) {
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

  private onMinigameFinished(res: { ok: boolean; quality: 0 | 1 | 2 | 3; factId?: string }): void {
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
      } else {
        state.stats.minigamesFailed += 1;
        this.markSiteUsed(pt, true);
        AudioSystem.play('fail');
        bus.emit('interact:prompt', { text: uiText.hud.radioSampleLost });
      }
    } else if (pt && !res.ok) {
      state.stats.minigamesFailed += 1;
      AudioSystem.play('fail');
      bus.emit('interact:prompt', { text: uiText.hud.radioRepairFailed });
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
    this.updateDust(delta);

    const inMinigame = this.isAnyMinigameActive();
    if (inMinigame !== this.wasInMinigame) {
      this.wasInMinigame = inMinigame;
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
      this.player.setDisplayOrigin(this.player.displayOriginX, this.playerOriginY);
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
      if (vx < 0) this.player.setFlipX(true);
      else if (vx > 0) this.player.setFlipX(false);
      this.walkBobTime += delta;
      const bob = Math.sin(this.walkBobTime * 0.018) * 0.8;
      this.player.setDisplayOrigin(this.player.displayOriginX, this.playerOriginY + bob);
      this.leaveFootprint(time);
    } else {
      this.player.setVelocity(0, 0);
      this.walkBobTime = 0;
      this.player.setDisplayOrigin(this.player.displayOriginX, this.playerOriginY);
    }
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

    // Tinte del cielo: atardecer desde las 16:00, noche a las 17:00
    const m = state.clock.minutes;
    const dusk = Phaser.Math.Clamp(
      (m - balance.dayClock.warnMin) / (balance.dayClock.curfewMin - balance.dayClock.warnMin),
      0,
      1
    );
    this.nightOverlay.setAlpha(Clock.isNight(m) ? 0.42 : dusk * 0.25);
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

  private updateDust(delta: number): void {
    const view = this.cameras.main.worldView;
    for (const m of this.dustMotes) {
      m.x += delta * 0.03;
      m.y += Math.sin((m.x + m.y) * 0.05) * delta * 0.004;
      if (m.x > view.right + 10) {
        m.x = view.left - 10;
        m.y = Phaser.Math.Between(Math.floor(view.top), Math.floor(view.bottom));
      }
      if (m.x < view.left - 20 || m.y < view.top - 20 || m.y > view.bottom + 20) {
        m.x = Phaser.Math.Between(Math.floor(view.left), Math.floor(view.right));
        m.y = Phaser.Math.Between(Math.floor(view.top), Math.floor(view.bottom));
      }
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
    if (state.clock.paused || this.rescueTriggered || this.isAnyMinigameActive()) return;
    const nearest = this.getNearestInteractPoint();
    if (!nearest) return;
    this.activatePoint(nearest);
  }

  private activatePoint(pt: InteractPoint): void {
    const state = gameStore.state;
    if (this.isAnyMinigameActive() || state.clock.paused) return;

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
