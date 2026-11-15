import Phaser from 'phaser';
import balance from '../../content/balance.json';
import uiText from '../../content/ui_text.json';
import { bus } from '../state/bus';
import { gameStore } from '../state/GameState';
import { mapMarkers, SAMPLE_COLORS, type MapMarker } from '../state/mapMarkers';
import { AudioSystem } from '../systems/Audio';
import { Clock } from '../systems/Clock';
import { Events } from '../systems/Events';
import { Quota } from '../systems/Quota';
import type { SampleType } from '../types';
import { TouchControls } from '../ui/Joystick';
import { MINIGAME_KEYS } from './Mundo';

const FONT = 'PixelifySans, monospace';

const RADAR = { x: 576, y: 104, r: 44, range: 360 };

/**
 * HUD en paralelo (diseño 640×360). Reorganizado para que nada se empalme:
 * - Arriba izquierda: signos vitales (O₂, temperatura, radiación) y misiones del día.
 * - Arriba centro: zona actual y avisos de radio de Corvi.
 * - Arriba derecha: día y reloj, confianza de Control de Misión, puntos de ciencia y radar.
 * - Abajo: acción disponible, herramientas y caja de tubos.
 */
export class HUD extends Phaser.Scene {
  private missionsBg!: Phaser.GameObjects.Rectangle;
  private missionsHeaderTitle!: Phaser.GameObjects.Text;
  private missionsToggleText!: Phaser.GameObjects.Text;
  private missionsCollapsed = false;
  private missionRows: { box: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];

  private dayText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private windowBadgeBg!: Phaser.GameObjects.Rectangle;
  private windowBadgeText!: Phaser.GameObjects.Text;
  private dayBarFill!: Phaser.GameObjects.Rectangle;
  private dialGfx!: Phaser.GameObjects.Graphics;
  private dialSun!: Phaser.GameObjects.Image;
  private dialMoon!: Phaser.GameObjects.Image;

  private zoneText!: Phaser.GameObjects.Text;
  private zoneBg!: Phaser.GameObjects.Rectangle;

  private o2ValueText!: Phaser.GameObjects.Text;
  private o2BarFill!: Phaser.GameObjects.Rectangle;
  private tempValueText!: Phaser.GameObjects.Text;
  private tempBarFill!: Phaser.GameObjects.Rectangle;
  private radValueText!: Phaser.GameObjects.Text;
  private radBarFill!: Phaser.GameObjects.Rectangle;

  private trustStars: Phaser.GameObjects.Text[] = [];
  private scienceText!: Phaser.GameObjects.Text;

  private toolSlots: Phaser.GameObjects.Rectangle[] = [];
  private boxCountText!: Phaser.GameObjects.Text;
  private tubeSprites: Phaser.GameObjects.Image[] = [];

  private radioContainer!: Phaser.GameObjects.Container;
  private radioText!: Phaser.GameObjects.Text;
  private radioBg!: Phaser.GameObjects.Rectangle;
  private radioTimer: Phaser.Time.TimerEvent | null = null;

  private promptContainer!: Phaser.GameObjects.Container;
  private promptBg!: Phaser.GameObjects.Rectangle;
  private promptText!: Phaser.GameObjects.Text;

  private radarContainer!: Phaser.GameObjects.Container;
  private radarGfx!: Phaser.GameObjects.Graphics;
  private radarSweep = 0;

  private mapContainer: Phaser.GameObjects.Container | null = null;
  private mapGfx: Phaser.GameObjects.Graphics | null = null;

  private dangerVignette!: Phaser.GameObjects.Graphics;
  private lastHeartbeat = 0;

  private pauseContainer!: Phaser.GameObjects.Container;
  private touchControls: TouchControls | null = null;
  private unsubscribers: (() => void)[] = [];

  constructor() {
    super('HUD');
  }

  create(): void {
    this.tubeSprites = [];
    this.missionRows = [];
    this.toolSlots = [];
    this.trustStars = [];
    this.unsubscribers = [];
    this.mapContainer = null;
    this.mapGfx = null;

    this.buildVitals();
    this.buildMissions();
    this.buildClock();
    this.buildZoneAndRadio();
    this.buildRadar();
    this.buildBottomBar();
    this.buildPrompt();

    this.dangerVignette = this.add.graphics().setDepth(40);

    // Controles táctiles sólo en pantallas táctiles: en computadora estorban.
    if (this.sys.game.device.input.touch) {
      this.touchControls = new TouchControls(this, 44, 300, 600, 300);
    }

    this.buildPauseMenu();

    this.unsubscribers.push(
      bus.on('zone:changed', ({ name }) => {
        this.zoneText.setText(name);
        this.zoneBg.width = Math.round(this.zoneText.width + 16);
      }),
      bus.on('tool:changed', ({ index }) => {
        this.toolSlots.forEach((slot, idx) => slot.setFillStyle(idx === index ? 0xfee761 : 0xffffff));
      }),
      bus.on('clock:warn16', () => this.showRadioMessage(uiText.hud.radioWarn16)),
      bus.on('clock:curfew17', () => this.showRadioMessage(uiText.hud.radioCurfew17)),
      bus.on('vitals:o2Warn40', () => {
        AudioSystem.play('o2_beep');
        this.showRadioMessage(uiText.hud.radioO2Warn40);
      }),
      bus.on('vitals:o2Danger20', () => {
        AudioSystem.play('o2_beep');
        this.showRadioMessage(uiText.hud.radioO2Danger20);
      }),
      bus.on('interact:prompt', ({ text }) => {
        if (text) this.showRadioMessage(text);
      }),
      bus.on('prompt:near', ({ text }) => this.setPrompt(text)),
      bus.on('toast', ({ text, color }) => this.showToast(text, color)),
      bus.on('map:toggle', () => this.toggleMap()),
      bus.on('clock:pauseChanged', ({ paused }) => {
        this.pauseContainer.setVisible(paused);
        AudioSystem.play(paused ? 'ui_open' : 'ui_close', { volume: 0.6 });
      })
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const unsub of this.unsubscribers) unsub();
      this.unsubscribers = [];
      this.touchControls?.destroy();
      this.touchControls = null;
    });
  }

  // ------------------------------------------------------------------ construcción

  private panel(x: number, y: number, w: number, h: number, fill = 0xc0cbdc): Phaser.GameObjects.Rectangle {
    return this.add.rectangle(x, y, w, h, fill, 0.96).setOrigin(0, 0).setStrokeStyle(2, 0x181425);
  }

  private label(x: number, y: number, text: string, size: number, color: string): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color });
  }

  private buildVitals(): void {
    this.panel(6, 6, 184, 64);
    const rows: { icon: string; label: string; y: number }[] = [
      { icon: 'icon_o2', label: uiText.hud.o2Label, y: 10 },
      { icon: 'icon_temp', label: uiText.hud.tempLabel, y: 29 },
      { icon: 'icon_rad', label: uiText.hud.radLabel, y: 48 },
    ];
    for (const r of rows) {
      this.add.image(17, r.y + 7, r.icon).setScale(1.2);
      this.label(27, r.y, r.label, 11, '#181425');
    }
    this.o2ValueText = this.label(184, 10, '100 %', 11, '#181425').setOrigin(1, 0);
    this.tempValueText = this.label(184, 29, '21 °C', 11, '#181425').setOrigin(1, 0);
    this.radValueText = this.label(184, 48, '0 %', 11, '#181425').setOrigin(1, 0);

    const bar = (y: number, color: number): Phaser.GameObjects.Rectangle => {
      this.add.rectangle(27, y, 157, 5, 0x3a4466).setOrigin(0, 0.5);
      return this.add.rectangle(27, y, 157, 5, color).setOrigin(0, 0.5);
    };
    this.o2BarFill = bar(24, 0x2ce8f5);
    this.tempBarFill = bar(43, 0xf77622);
    this.radBarFill = bar(62, 0xfeae34);
  }

  private buildMissions(): void {
    this.missionsBg = this.panel(6, 74, 184, 20, 0x262b44);
    const headerHit = this.add
      .rectangle(6, 74, 184, 20, 0xffffff, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.missionsHeaderTitle = this.label(12, 77, `▼ ${uiText.hud.missionsTitle}`, 10, '#fee761');
    this.missionsToggleText = this.label(184, 77, '[−]', 10, '#ead4aa').setOrigin(1, 0);

    const toggleMissions = (): void => {
      this.missionsCollapsed = !this.missionsCollapsed;
      AudioSystem.play('ui_switch', { volume: 0.4 });
      this.updateMissions();
    };
    headerHit.on('pointerdown', toggleMissions);
    this.input.keyboard?.on('keydown-TAB', (ev: KeyboardEvent) => {
      ev.preventDefault?.();
      toggleMissions();
    });

    for (let i = 0; i < 6; i++) {
      const y = 94 + i * 14;
      const box = this.add.rectangle(16, y + 6, 8, 8, 0xffffff).setStrokeStyle(1, 0x181425);
      const label = this.label(24, y, '', 11, '#ffffff');
      this.missionRows.push({ box, label });
    }
  }

  private buildClock(): void {
    const clockPanel = this.panel(512, 6, 122, 36).setInteractive({ useHandCursor: true });
    clockPanel.on('pointerdown', () => {
      const paused = Clock.togglePause(gameStore.state);
      bus.emit('clock:pauseChanged', { paused });
    });
    this.dayText = this.label(518, 8, `${uiText.hud.dayPrefix} 1`, 11, '#181425');
    this.timeText = this.label(594, 8, '08:00', 11, '#181425').setOrigin(1, 0);

    // Indicador visual de tiempo disponible AFUERA vs ADENTRO + barra dividida en las 17:00
    this.windowBadgeBg = this.add
      .rectangle(518, 21, 76, 10, 0x265c42)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x181425);
    this.windowBadgeText = this.label(556, 21, uiText.hud.outdoorWindowLabel, 8, '#ffffff').setOrigin(0.5, 0);

    // Barra de tiempo del día: tramo verde/ámbar (08:00–17:00 afuera) y tramo nocturno (17:00–20:00 adentro)
    this.add.rectangle(518, 36, 57, 4, 0x3a4466).setOrigin(0, 0.5);
    this.add.rectangle(575, 36, 19, 4, 0x181425).setOrigin(0, 0.5);
    this.dayBarFill = this.add.rectangle(518, 36, 0, 4, 0x63c74d).setOrigin(0, 0.5);
    // Marca divisoria de las 17:00 (toque de queda térmico)
    this.add.rectangle(575, 36, 2, 6, 0xe43b44).setOrigin(0.5);

    // Reloj giratorio estilo Minecraft (Sol y Luna orbitando según la hora marciana)
    this.dialGfx = this.add.graphics();
    this.dialSun = this.add.image(614, 18, 'icon_sun').setScale(0.95);
    this.dialMoon = this.add.image(614, 30, 'icon_moon').setScale(0.9);

    // Confianza de Control de Misión + puntos de ciencia
    this.panel(512, 44, 122, 16, 0x262b44);
    for (let i = 0; i < balance.mission.maxTrust; i++) {
      this.trustStars.push(this.label(518 + i * 12, 45, '★', 12, '#fee761'));
    }
    this.scienceText = this.label(628, 46, '0 pts', 10, '#2ce8f5').setOrigin(1, 0);
    const trustHit = this.add.rectangle(512, 44, 60, 16, 0, 0).setOrigin(0, 0).setInteractive();
    trustHit.on('pointerdown', () => this.showRadioMessage(uiText.hud.trustExplain));
  }

  private buildZoneAndRadio(): void {
    this.zoneBg = this.add.rectangle(320, 14, 160, 16, 0x262b44, 0.92).setStrokeStyle(1, 0x181425);
    this.zoneText = this.label(320, 14, uiText.hud.zoneDefault, 11, '#ead4aa').setOrigin(0.5);
    this.zoneBg.width = Math.round(this.zoneText.width + 16);
    this.zoneBg.setOrigin(0.5);

    this.radioBg = this.add.rectangle(320, 26, 252, 30, 0xead4aa, 0.98).setOrigin(0.5, 0).setStrokeStyle(2, 0x181425);
    const radioIcon = this.add.image(209, 41, 'corvi_alert').setScale(0.36);
    this.radioText = this.add.text(222, 30, '', {
      fontFamily: FONT,
      fontSize: '11px',
      color: '#181425',
      wordWrap: { width: 218 },
      lineSpacing: 1,
    });
    this.radioContainer = this.add.container(0, 0, [this.radioBg, radioIcon, this.radioText]).setVisible(false).setDepth(50);
  }

  private buildRadar(): void {
    this.radarGfx = this.add.graphics();
    const hit = this.add.circle(RADAR.x, RADAR.y, RADAR.r, 0, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.toggleMap());
    const hint = this.label(RADAR.x, RADAR.y + RADAR.r + 2, uiText.hud.radarHint, 10, '#ead4aa').setOrigin(0.5, 0);
    const hintBg = this.add
      .rectangle(RADAR.x, RADAR.y + RADAR.r + 1, hint.width + 8, 13, 0x181425, 0.75)
      .setOrigin(0.5, 0);
    this.radarContainer = this.add.container(0, 0, [this.radarGfx, hit, hintBg, hint]);
  }

  private buildBottomBar(): void {
    this.panel(206, 324, 160, 30, 0x8b9bb4);
    const toolIcons = ['icon_drill', 'icon_shovel', 'icon_scanner', 'icon_valve', 'icon_brush', 'icon_wrench'];
    toolIcons.forEach((iconKey, idx) => {
      const slotX = 222 + idx * 26;
      const slotBg = this.add.rectangle(slotX, 339, 22, 22, 0xffffff).setStrokeStyle(1, 0x181425);
      this.add.image(slotX, 339, iconKey).setScale(2);
      this.toolSlots.push(slotBg);
    });

    this.panel(372, 324, 140, 30, 0x733e39);
    this.label(378, 326, uiText.hud.boxLabel, 10, '#ead4aa');
    this.boxCountText = this.label(378, 338, '0/6', 12, '#ffffff');
    for (let i = 0; i < 6; i++) {
      this.tubeSprites.push(this.add.image(420 + i * 15, 339, 'tube_empty').setScale(1.6));
    }
  }

  private buildPrompt(): void {
    this.promptBg = this.add.rectangle(320, 308, 200, 18, 0x181425, 0.92).setStrokeStyle(1, 0xfee761);
    this.promptText = this.label(320, 308, '', 12, '#fee761').setOrigin(0.5);
    this.promptContainer = this.add.container(0, 0, [this.promptBg, this.promptText]).setVisible(false).setDepth(20);
  }

  private setPrompt(text: string | null): void {
    if (!text) {
      this.promptContainer.setVisible(false);
      return;
    }
    this.promptText.setText(text);
    this.promptBg.width = Math.round(this.promptText.width + 18);
    this.promptContainer.setVisible(true);
  }

  private buildPauseMenu(): void {
    const dim = this.add.rectangle(320, 180, 640, 360, 0x181425, 0.75).setInteractive();
    const box = this.add.rectangle(320, 180, 340, 228, 0x262b44, 0.98).setStrokeStyle(2, 0xfee761);
    const title = this.label(320, 84, uiText.hud.pausedTitle, 18, '#fee761').setOrigin(0.5);
    const controls = this.add
      .text(320, 104, uiText.hud.controlsHelp, {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#c0cbdc',
        align: 'center',
        lineSpacing: 2,
      })
      .setOrigin(0.5, 0);

    const items: Phaser.GameObjects.GameObject[] = [dim, box, title, controls];
    const button = (
      x: number,
      y: number,
      text: () => string,
      fill: number,
      onClick: (t: Phaser.GameObjects.Text) => void
    ): void => {
      const bg = this.add.rectangle(x, y, 150, 24, fill).setStrokeStyle(2, 0x181425).setInteractive({ useHandCursor: true });
      const t = this.label(x, y, text(), 11, '#ffffff').setOrigin(0.5);
      bg.on('pointerdown', () => {
        AudioSystem.play('ui_click');
        onClick(t);
      });
      items.push(bg, t);
    };

    button(242, 196, () => uiText.hud.resumeButton, 0x3e8948, () => {
      Clock.setPaused(gameStore.state, false);
      bus.emit('clock:pauseChanged', { paused: false });
    });
    button(398, 196, () => uiText.hud.mapButton, 0x124e89, () => {
      Clock.setPaused(gameStore.state, false);
      bus.emit('clock:pauseChanged', { paused: false });
      if (gameStore.state.location === 'mundo') this.toggleMap();
    });
    button(242, 226, () => (AudioSystem.isMusicOn() ? uiText.hud.musicOn : uiText.hud.musicOff), 0x3a4466, (t) => {
      AudioSystem.toggleMusic();
      t.setText(AudioSystem.isMusicOn() ? uiText.hud.musicOn : uiText.hud.musicOff);
    });
    button(398, 226, () => (AudioSystem.isSfxOn() ? uiText.hud.sfxOn : uiText.hud.sfxOff), 0x3a4466, (t) => {
      AudioSystem.toggleSfx();
      t.setText(AudioSystem.isSfxOn() ? uiText.hud.sfxOn : uiText.hud.sfxOff);
    });
    button(242, 256, () => uiText.hud.creditsButton, 0x5a6988, () => {
      const returnScene = gameStore.state.location === 'mundo' ? 'Mundo' : 'Base';
      this.scene.stop('Dialogo');
      this.scene.stop('Tormenta');
      this.scene.stop(returnScene);
      this.scene.start('Creditos', { returnScene });
    });
    button(398, 256, () => uiText.hud.titleButton, 0x733e39, () => {
      const current = gameStore.state.location === 'mundo' ? 'Mundo' : 'Base';
      Clock.setPaused(gameStore.state, false);
      this.scene.stop('Dialogo');
      this.scene.stop('Tormenta');
      this.scene.stop(current);
      this.scene.start('Titulo');
    });

    this.pauseContainer = this.add.container(0, 0, items).setVisible(false).setDepth(100);
  }

  // ------------------------------------------------------------------ bucle

  update(time: number, delta: number): void {
    const state = gameStore.state;

    // Ocultar el HUD cuando corre un minijuego encima
    const inMinigame = MINIGAME_KEYS.some((k) => this.scene.isActive(k));
    this.cameras.main.setVisible(!inMinigame);
    if (inMinigame) return;

    const stormActive = Events.getActiveStorm() !== null;
    const outside = state.location === 'mundo';
    this.zoneBg.setVisible(!stormActive);
    this.zoneText.setVisible(!stormActive);
    this.radarContainer.setVisible(outside);

    this.updateMissions();
    this.updateVitals(time);
    this.updateClockAndTrust();
    this.updateBox();
    if (outside) this.drawRadar(delta);
    if (this.mapContainer && this.mapGfx) this.drawFullMap();
  }

  private updateMissions(): void {
    const state = gameStore.state;
    const missions: { label: string; done: boolean }[] = [];
    const names: Record<SampleType, string> = {
      roca: uiText.hud.missionRockUnit,
      suelo: uiText.hud.missionSoilUnit,
      minerales: uiText.hud.missionMineralsUnit,
      aire: uiText.hud.missionAirUnit,
    };
    for (const t of ['roca', 'suelo', 'minerales', 'aire'] as SampleType[]) {
      const req = state.quotaToday[t] ?? 0;
      if (req > 0) {
        const got = Math.min(req, state.deliveredToday[t] ?? 0);
        const unit = t === 'roca' && req > 1 ? uiText.hud.missionRocksUnit : names[t];
        missions.push({
          label: `${uiText.hud.missionRockPrefix} ${unit}  ${got}/${req}`,
          done: Quota.isTypeMet(state, t),
        });
      }
    }
    if (state.base.panels.some((p) => p.dust > balance.dust.dirtyThreshold)) {
      missions.push({ label: uiText.hud.missionCleanPanel, done: false });
    }
    if (!state.base.moxieOk) missions.push({ label: uiText.hud.missionFixMoxie, done: false });
    if (!state.base.antennaOk) missions.push({ label: uiText.hud.missionFixAntenna, done: false });
    const storm = Events.getActiveStorm();
    if (storm && storm.phase !== 'resolved' && storm.type === 'cme_hit') {
      missions.push({ label: uiText.hud.missionStormShelter, done: state.location === 'refugio' });
    }
    if (missions.length < 6) {
      missions.push({
        label: uiText.hud.defaultMissionReturn,
        done: state.location !== 'mundo' && state.clock.minutes < balance.dayClock.curfewMin,
      });
    }

    const shown = missions.slice(0, 6);
    const doneCount = shown.filter((m) => m.done).length;
    const arrow = this.missionsCollapsed ? '►' : '▼';
    this.missionsHeaderTitle.setText(`${arrow} ${uiText.hud.missionsTitle} (${doneCount}/${shown.length})`);
    this.missionsToggleText.setText(this.missionsCollapsed ? '[+]' : '[−]');
    this.missionsBg.height = this.missionsCollapsed ? 20 : 22 + shown.length * 14;

    this.missionRows.forEach((row, idx) => {
      const item = shown[idx];
      const visible = !this.missionsCollapsed && !!item;
      row.box.setVisible(visible);
      row.label.setVisible(visible);
      if (!item || !visible) return;
      row.label.setText(item.label);
      row.box.setFillStyle(item.done ? 0x63c74d : 0xffffff);
      row.label.setColor(item.done ? '#8b9bb4' : '#ffffff');
    });
  }

  private updateVitals(time: number): void {
    const state = gameStore.state;
    const o2 = Phaser.Math.Clamp(state.astronaut.o2, 0, 100);
    this.o2ValueText.setText(`${Math.ceil(o2)} %`);
    this.o2BarFill.width = Math.round((157 * o2) / 100);
    if (o2 <= balance.o2.dangerAt) {
      this.o2BarFill.setFillStyle(Math.floor(time / 200) % 2 === 0 ? 0xe43b44 : 0xff0044);
    } else if (o2 <= balance.o2.warnAt) {
      this.o2BarFill.setFillStyle(0xfee761);
    } else {
      this.o2BarFill.setFillStyle(0x2ce8f5);
    }

    const tempC = Math.round(state.astronaut.suitTempC);
    const bat = Math.ceil(state.astronaut.heaterBattery);
    this.tempValueText.setText(`${tempC} °C · ${bat} %`);
    this.tempBarFill.width = Math.round((157 * bat) / 100);
    this.tempBarFill.setFillStyle(state.astronaut.suitTempC >= balance.heater.comfortMinC ? 0xf77622 : 0x2ce8f5);

    const radPct = Math.min(100, (state.astronaut.doseTotal / balance.radiation.doseLimit) * 100);
    this.radValueText.setText(`${radPct.toFixed(radPct < 10 ? 1 : 0)} %`);
    this.radBarFill.width = Math.max(state.astronaut.doseTotal > 0 ? 2 : 0, Math.round((157 * radPct) / 100));
    this.radBarFill.setFillStyle(radPct >= 66 ? 0xe43b44 : radPct >= 33 ? 0xf77622 : 0xfeae34);

    // Bordes rojos y latido cuando el oxígeno está en peligro
    this.dangerVignette.clear();
    if (state.location === 'mundo' && o2 <= balance.o2.dangerAt) {
      const a = 0.18 + 0.12 * Math.sin(time / 180);
      this.dangerVignette.fillStyle(0xe43b44, a);
      this.dangerVignette.fillRect(0, 0, 640, 6);
      this.dangerVignette.fillRect(0, 354, 640, 6);
      this.dangerVignette.fillRect(0, 0, 6, 360);
      this.dangerVignette.fillRect(634, 0, 6, 360);
      if (time - this.lastHeartbeat > 1100 && !state.clock.paused) {
        this.lastHeartbeat = time;
        AudioSystem.play('heartbeat');
      }
    }
  }

  private updateClockAndTrust(): void {
    const state = gameStore.state;
    const mins = state.clock.minutes;
    this.dayText.setText(`${uiText.hud.dayPrefix} ${state.day}`);
    this.timeText.setText(Clock.formatTime(mins));

    const progress = Clock.getProgress(mins);
    this.dayBarFill.width = Math.round(76 * progress);

    const isNight = Clock.isNight(mins);
    const isWarn = mins >= balance.dayClock.warnMin && !isNight;
    if (isNight) {
      this.dayBarFill.setFillStyle(0xe43b44);
      this.windowBadgeBg.setFillStyle(0x262b44);
      this.windowBadgeText.setText(`🌙 ${uiText.hud.indoorCurfewLabel}`).setColor('#2ce8f5');
    } else if (isWarn) {
      const remHrs = Math.max(0, Math.ceil((balance.dayClock.curfewMin - mins) / 60));
      this.dayBarFill.setFillStyle(0xfee761);
      this.windowBadgeBg.setFillStyle(0xb86f50);
      this.windowBadgeText.setText(`☀️ ${uiText.hud.outdoorWindowLabel} · ${remHrs}h`).setColor('#fee761');
    } else {
      const remHrs = Math.max(1, Math.ceil((balance.dayClock.curfewMin - mins) / 60));
      this.dayBarFill.setFillStyle(0x63c74d);
      this.windowBadgeBg.setFillStyle(0x265c42);
      this.windowBadgeText.setText(`☀️ ${uiText.hud.outdoorWindowLabel} · ${remHrs}h`).setColor('#ffffff');
    }

    // Dial giratorio estilo Minecraft: el Sol está arriba al mediodía (12:30) y se oculta a las 17:00
    const cx = 614;
    const cy = 24;
    const r = 13;
    const skyColor = isNight ? 0x181425 : isWarn ? 0xb86f50 : 0x0099db;
    this.dialGfx.clear();
    this.dialGfx.fillStyle(skyColor, 1).fillCircle(cx, cy, r);
    // Horizonte marciano en la parte baja del dial
    this.dialGfx.fillStyle(0x733e39, 1).slice(cx, cy, r, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160), false).fillPath();
    this.dialGfx.lineStyle(2, 0x181425, 1).strokeCircle(cx, cy, r);

    // Ángulo celeste: 08:00 -> -155°, 12:30 -> -90° (cenit), 17:00 -> -15° (ocaso), 20:00 -> +75° (noche)
    const sunAngle = Phaser.Math.DegToRad(-155 + progress * 230);
    const moonAngle = sunAngle + Math.PI;
    const orbitR = 7.5;
    const sx = cx + Math.cos(sunAngle) * orbitR;
    const sy = cy + Math.sin(sunAngle) * orbitR;
    const mx = cx + Math.cos(moonAngle) * orbitR;
    const my = cy + Math.sin(moonAngle) * orbitR;

    this.dialSun.setPosition(sx, sy).setVisible(sy <= cy + 4);
    this.dialMoon.setPosition(mx, my).setVisible(my <= cy + 4);

    this.trustStars.forEach((s, i) => s.setColor(i < state.missionTrust ? '#fee761' : '#3a4466'));
    this.scienceText.setText(`${state.sciencePoints} pts`);
  }

  private updateBox(): void {
    const state = gameStore.state;
    const filledCount = state.tubes.filter((t) => t !== null).length;
    this.boxCountText.setText(`${filledCount}/6`);
    this.tubeSprites.forEach((sprite, idx) => {
      const t = state.tubes[idx];
      sprite.setTexture(t ? 'tube_full' : 'tube_empty');
      if (t) sprite.setTint(SAMPLE_COLORS[t]);
      else sprite.clearTint();
    });
  }

  // ------------------------------------------------------------------ radar y mapa

  private drawMarkerShape(g: Phaser.GameObjects.Graphics, m: MapMarker, x: number, y: number, s: number, blink: boolean): void {
    switch (m.kind) {
      case 'base':
        g.fillStyle(0xfee761, 1).fillRect(x - s, y - s * 0.6, s * 2, s * 1.6);
        g.fillStyle(0x181425, 1).fillRect(x - s * 0.3, y, s * 0.6, s);
        break;
      case 'refuge':
        g.fillStyle(0x63c74d, 1).fillTriangle(x - s, y + s * 0.8, x + s, y + s * 0.8, x, y - s);
        break;
      case 'depot':
        g.fillStyle(0xb55088, 1).fillRect(x - s * 0.8, y - s * 0.8, s * 1.6, s * 1.6);
        break;
      case 'repair':
        if (blink) g.fillStyle(0xe43b44, 1).fillRect(x - s * 0.35, y - s, s * 0.7, s * 1.3);
        if (blink) g.fillRect(x - s * 0.35, y + s * 0.5, s * 0.7, s * 0.5);
        break;
      case 'sample': {
        const color = SAMPLE_COLORS[m.sampleType ?? 'roca'];
        g.fillStyle(0x181425, 1).fillCircle(x, y, s + 1);
        g.fillStyle(color, 1).fillCircle(x, y, s);
        if (m.needed) {
          g.lineStyle(1, 0xfee761, 1).strokeCircle(x, y, s + 2.5);
        }
        break;
      }
      default:
        break;
    }
  }

  private drawRadar(delta: number): void {
    const g = this.radarGfx;
    g.clear();
    const { x: cx, y: cy, r } = RADAR;
    g.fillStyle(0x0b1f2a, 0.92).fillCircle(cx, cy, r);
    g.lineStyle(2, 0x181425, 1).strokeCircle(cx, cy, r + 1);
    g.lineStyle(1, 0x265c42, 1).strokeCircle(cx, cy, r * 0.66).strokeCircle(cx, cy, r * 0.33);
    g.lineBetween(cx - r, cy, cx + r, cy).lineBetween(cx, cy - r, cx, cy + r);

    // Barrido verde
    this.radarSweep = (this.radarSweep + delta * 0.0025) % (Math.PI * 2);
    g.fillStyle(0x63c74d, 0.18).slice(cx, cy, r, this.radarSweep - 0.6, this.radarSweep, false).fillPath();
    g.lineStyle(1, 0x63c74d, 0.8).lineBetween(cx, cy, cx + Math.cos(this.radarSweep) * r, cy + Math.sin(this.radarSweep) * r);

    const scale = r / RADAR.range;
    const blink = Math.floor(this.time.now / 300) % 2 === 0;
    const px = mapMarkers.player.x;
    const py = mapMarkers.player.y;
    for (const m of mapMarkers.markers) {
      if (!m.active && m.kind !== 'base' && m.kind !== 'refuge' && m.kind !== 'depot') continue;
      let dx = (m.x - px) * scale;
      let dy = (m.y - py) * scale;
      const dist = Math.hypot(dx, dy);
      const edge = dist > r - 4;
      if (edge) {
        dx = (dx / dist) * (r - 4);
        dy = (dy / dist) * (r - 4);
      }
      const size = m.kind === 'sample' ? (edge ? 1.6 : 2.4) : edge ? 2 : 3;
      this.drawMarkerShape(g, m, cx + dx, cy + dy, size, m.kind === 'repair' ? blink : true);
    }
    // El astronauta en el centro
    g.fillStyle(0xffffff, 1).fillTriangle(cx, cy - 3, cx - 2.5, cy + 2.5, cx + 2.5, cy + 2.5);
  }

  private toggleMap(): void {
    if (this.mapContainer) {
      this.mapContainer.destroy(true);
      this.mapContainer = null;
      this.mapGfx = null;
      AudioSystem.play('ui_close', { volume: 0.6 });
      return;
    }
    if (gameStore.state.location !== 'mundo') return;
    AudioSystem.play('ui_open', { volume: 0.6 });
    const dim = this.add.rectangle(320, 180, 640, 360, 0x181425, 0.8).setInteractive();
    dim.on('pointerdown', () => this.toggleMap());
    const frame = this.add.rectangle(320, 166, 424, 304, 0x262b44).setStrokeStyle(2, 0xfee761);
    const title = this.label(320, 20, uiText.hud.mapTitle, 14, '#fee761').setOrigin(0.5, 0);
    this.mapGfx = this.add.graphics();
    const zoneLabels: [string, number, number][] = [
      ['Bright Angel', 640, 110],
      ['Séítah', 250, 760],
      ['Three Forks', 1000, 380],
      ['Octavia E. Butler', 640, 600],
    ];
    const items: Phaser.GameObjects.GameObject[] = [dim, frame, title, this.mapGfx];
    for (const [name, wx, wy] of zoneLabels) {
      const p = this.mapPoint(wx, wy);
      items.push(this.label(p.x, p.y, name, 10, '#ead4aa').setOrigin(0.5).setAlpha(0.85));
    }
    // Leyenda dentro del recuadro del mapa (arriba de la barra de herramientas inferior)
    const legend: [string, number][] = [
      [uiText.hud.legendRock, SAMPLE_COLORS.roca],
      [uiText.hud.legendSoil, SAMPLE_COLORS.suelo],
      [uiText.hud.legendMinerals, SAMPLE_COLORS.minerales],
      [uiText.hud.legendAir, SAMPLE_COLORS.aire],
    ];
    legend.forEach(([name, color], i) => {
      const lx = 136 + i * 92;
      items.push(this.add.circle(lx, 294, 4, color).setStrokeStyle(1, 0x181425));
      items.push(this.label(lx + 8, 288, name, 10, '#ffffff'));
    });
    items.push(this.label(320, 303, uiText.hud.mapLegendExtra, 9, '#c0cbdc').setOrigin(0.5, 0));
    this.mapContainer = this.add.container(0, 0, items).setDepth(90);
  }

  private mapPoint(wx: number, wy: number): { x: number; y: number } {
    // Mundo 1280×960 → caja de 384×244 centrada dentro del marco
    return { x: 128 + (wx / 1280) * 384, y: 38 + (wy / 960) * 244 };
  }

  private drawFullMap(): void {
    const g = this.mapGfx;
    if (!g) return;
    g.clear();
    const tl = this.mapPoint(0, 0);
    const br = this.mapPoint(1280, 960);
    g.fillStyle(0xb86f50, 1).fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    g.lineStyle(1, 0x733e39, 1);
    // Bordes de zonas
    const zones: [number, number, number, number][] = [
      [360, 60, 560, 280],
      [80, 540, 460, 360],
      [800, 340, 400, 340],
      [440, 340, 360, 300],
    ];
    for (const [x, y, w, h] of zones) {
      const a = this.mapPoint(x, y);
      const b = this.mapPoint(x + w, y + h);
      g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    const blink = Math.floor(this.time.now / 300) % 2 === 0;
    for (const m of mapMarkers.markers) {
      if (!m.active && m.kind === 'sample') continue;
      if (m.kind === 'repair' && !m.active) continue;
      const p = this.mapPoint(m.x, m.y);
      this.drawMarkerShape(g, m, p.x, p.y, m.kind === 'sample' ? 3.5 : 4.5, m.kind === 'repair' ? blink : true);
    }
    const pp = this.mapPoint(mapMarkers.player.x, mapMarkers.player.y);
    g.fillStyle(0xffffff, 1).fillTriangle(pp.x, pp.y - 5, pp.x - 4, pp.y + 4, pp.x + 4, pp.y + 4);
    g.lineStyle(1, 0x181425, 1).strokeTriangle(pp.x, pp.y - 5, pp.x - 4, pp.y + 4, pp.x + 4, pp.y + 4);
  }

  // ------------------------------------------------------------------ avisos

  private showRadioMessage(msg: string): void {
    this.radioText.setText(msg);
    this.radioBg.height = Math.max(30, Math.round(this.radioText.height + 10));
    this.radioContainer.setVisible(true);
    AudioSystem.play('radio_in', { volume: 0.5 });
    this.radioTimer?.remove(false);
    this.radioTimer = this.time.delayedCall(Math.max(3200, msg.length * 55), () => {
      this.radioContainer.setVisible(false);
    });
  }

  private showToast(text: string, color = '#fee761'): void {
    const t = this.add
      .text(574, 62, text, { fontFamily: FONT, fontSize: '12px', color, stroke: '#181425', strokeThickness: 3 })
      .setOrigin(1, 0)
      .setDepth(60);
    this.tweens.add({ targets: t, y: 50, alpha: 0, delay: 900, duration: 700, onComplete: () => t.destroy() });
  }
}
