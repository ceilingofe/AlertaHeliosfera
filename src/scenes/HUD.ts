import Phaser from 'phaser';
import balance from '../../content/balance.json';
import uiText from '../../content/ui_text.json';
import { bus } from '../state/bus';
import { gameStore } from '../state/GameState';
import { AudioSystem } from '../systems/Audio';
import { Clock } from '../systems/Clock';
import { Events } from '../systems/Events';
import { Quota } from '../systems/Quota';
import type { SampleType } from '../types';
import { AstronautAppearance } from '../ui/AstronautAppearance';
import { TouchControls } from '../ui/Joystick';

const MINIGAME_KEYS = [
  'MinijuegoRoca',
  'MinijuegoSuelo',
  'MinijuegoMinerales',
  'MinijuegoAire',
  'MinijuegoPaneles',
  'MinijuegoTuberias',
] as const;

/**
 * Escena HUD en paralelo a zoom ×1 sobre el lienzo de 640×360.
 * Dibuja misiones con casillas dinámicas, reloj, signos vitales, herramientas, tubos y joystick.
 */
export class HUD extends Phaser.Scene {
  private missionsContainer!: Phaser.GameObjects.Container;
  private missionCheckBoxes: Phaser.GameObjects.Rectangle[] = [];
  private missionLabels: Phaser.GameObjects.Text[] = [];

  private dayText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private dayBarFill!: Phaser.GameObjects.Rectangle;
  private skyIcon!: Phaser.GameObjects.Image;

  private zoneContainer!: Phaser.GameObjects.Container;
  private zoneText!: Phaser.GameObjects.Text;

  private o2ValueText!: Phaser.GameObjects.Text;
  private o2BarFill!: Phaser.GameObjects.Rectangle;

  private tempValueText!: Phaser.GameObjects.Text;
  private tempBarFill!: Phaser.GameObjects.Rectangle;

  private radValueText!: Phaser.GameObjects.Text;
  private radTodayFill!: Phaser.GameObjects.Rectangle;
  private radTotalFill!: Phaser.GameObjects.Rectangle;

  private toolSlots: Phaser.GameObjects.Rectangle[] = [];

  private boxCountText!: Phaser.GameObjects.Text;
  private tubeSprites: Phaser.GameObjects.Image[] = [];

  private radioContainer!: Phaser.GameObjects.Container;
  private radioText!: Phaser.GameObjects.Text;
  private radioTimer: Phaser.Time.TimerEvent | null = null;

  private pauseContainer!: Phaser.GameObjects.Container;
  private touchControls: TouchControls | null = null;
  private unsubscribers: (() => void)[] = [];

  constructor() {
    super('HUD');
  }

  create(): void {
    this.tubeSprites = [];
    this.missionCheckBoxes = [];
    this.missionLabels = [];
    this.toolSlots = [];
    this.unsubscribers = [];

    // 1. Arriba izquierda: MISIONES DEL DÍA
    const mBg = this.createPanel(8, 6, 198, 68, 0xc0cbdc);
    const mTitle = this.add.text(16, 11, uiText.hud.missionsTitle, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '12px',
      color: '#5a6988',
    });

    const missionChildren: Phaser.GameObjects.GameObject[] = [mBg, mTitle];
    for (let idx = 0; idx < 3; idx++) {
      const y = 28 + idx * 14;
      const box = this.add
        .rectangle(20, y + 5, 9, 9, 0xffffff)
        .setOrigin(0.5)
        .setStrokeStyle(1, 0x181425);
      const txt = this.add.text(30, y, '', {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#181425',
      });
      this.missionCheckBoxes.push(box);
      this.missionLabels.push(txt);
      missionChildren.push(box, txt);
    }
    this.missionsContainer = this.add.container(0, 0, missionChildren);

    // 2. Arriba centro: cartel de zona actual (se oculta durante tormenta para no empalmarse)
    const zoneBg = this.add
      .rectangle(316, 16, 178, 20, 0x262b44, 0.95)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x181425);
    this.zoneText = this.add
      .text(316, zoneBg.y, `↑ ${uiText.hud.zoneDefault}`, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#ead4aa',
      })
      .setOrigin(0.5);
    this.zoneContainer = this.add.container(0, 0, [zoneBg, this.zoneText]);

    // 3. Arriba derecha: DÍA N, reloj HH:MM, sol/luna y barra de progreso del día (tocar pausa)
    const clockPanel = this.createPanel(510, 6, 122, 50, 0xc0cbdc).setInteractive({
      useHandCursor: true,
    });
    clockPanel.on('pointerdown', () => {
      const paused = Clock.togglePause(gameStore.state);
      bus.emit('clock:pauseChanged', { paused });
    });
    this.dayText = this.add.text(518, 10, `${uiText.hud.dayPrefix} 1`, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '15px',
      color: '#181425',
    });
    this.skyIcon = this.add.image(616, 18, 'icon_sun').setScale(2);

    this.timeText = this.add.text(518, 32, '09:00', {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '13px',
      color: '#181425',
    });

    this.add
      .rectangle(566, 40, 58, 8, 0x3a4466)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x181425);
    this.dayBarFill = this.add
      .rectangle(567, 40, 0, 6, 0xfee761)
      .setOrigin(0, 0.5);

    // 4. Panel del astronauta (abajo a la izquierda, alineado con barra de herramientas)
    const panelY = 276;
    this.createPanel(8, panelY, 236, 78, 0xc0cbdc);

    this.add
      .rectangle(31, panelY + 33, 36, 46, 0x262b44)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0x181425);
    const hudMiniKey = AstronautAppearance.getMiniTextureKey(
      this,
      gameStore.state.customization.character,
      gameStore.state.customization.suit
    );
    this.add.image(31, panelY + 34, hudMiniKey).setScale(1.5);
    this.add
      .text(31, panelY + 64, uiText.hud.youLabel, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#3a4466',
      })
      .setOrigin(0.5);

    const row1Y = panelY + 8;
    this.add.image(60, row1Y + 6, 'icon_o2').setScale(1.5);
    this.add.text(70, row1Y, uiText.hud.o2Label, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '11px',
      color: '#181425',
    });
    this.o2ValueText = this.add
      .text(236, row1Y, '100 %', {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#181425',
      })
      .setOrigin(1, 0);
    this.add
      .rectangle(70, row1Y + 16, 166, 7, 0x3a4466)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x181425);
    this.o2BarFill = this.add
      .rectangle(71, row1Y + 16, 164, 5, 0x2ce8f5)
      .setOrigin(0, 0.5);

    const row2Y = panelY + 31;
    this.add.image(60, row2Y + 6, 'icon_temp').setScale(1.5);
    this.add.text(70, row2Y, uiText.hud.tempLabel, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '11px',
      color: '#181425',
    });
    this.tempValueText = this.add
      .text(236, row2Y, '21 °C · 100 %', {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#181425',
      })
      .setOrigin(1, 0);
    this.add
      .rectangle(70, row2Y + 16, 166, 7, 0x3a4466)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x181425);
    this.tempBarFill = this.add
      .rectangle(71, row2Y + 16, 164, 5, 0xe43b44)
      .setOrigin(0, 0.5);
    this.add.rectangle(168, row2Y + 16, 2, 9, 0x63c74d).setOrigin(0.5);
    this.add.rectangle(202, row2Y + 16, 2, 9, 0x63c74d).setOrigin(0.5);

    const row3Y = panelY + 54;
    this.add.image(60, row3Y + 6, 'icon_rad').setScale(1.5);
    this.add.text(70, row3Y, uiText.hud.radLabel, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '11px',
      color: '#181425',
    });
    this.radValueText = this.add
      .text(236, row3Y, '0.00 / 0.00 DR', {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '10px',
        color: '#3a4466',
      })
      .setOrigin(1, 0);

    this.add
      .rectangle(70, row3Y + 16, 78, 7, 0x3a4466)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x181425);
    this.radTodayFill = this.add
      .rectangle(71, row3Y + 16, 0, 5, 0xfeae34)
      .setOrigin(0, 0.5);

    this.add
      .rectangle(156, row3Y + 16, 80, 7, 0x3a4466)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x181425);
    this.radTotalFill = this.add
      .rectangle(157, row3Y + 16, 0, 5, 0xf77622)
      .setOrigin(0, 0.5);

    // 5. Abajo centro: Barra de herramientas
    this.createPanel(252, 322, 164, 32, 0x8b9bb4);
    const toolIcons = [
      'icon_drill',
      'icon_shovel',
      'icon_scanner',
      'icon_valve',
      'icon_brush',
      'icon_wrench',
    ];
    toolIcons.forEach((iconKey, idx) => {
      const slotX = 268 + idx * 26;
      const slotY = 338;
      const slotBg = this.add
        .rectangle(slotX, slotY, 22, 22, idx === 0 ? 0xfee761 : 0xffffff)
        .setOrigin(0.5)
        .setStrokeStyle(1, 0x181425);
      this.add.image(slotX, slotY, iconKey).setScale(2);
      this.toolSlots.push(slotBg);
    });

    // 6. Abajo derecha: Caja de tubos (CAJA n/6)
    this.createPanel(424, 322, 138, 32, 0x733e39);
    this.add.text(431, 325, uiText.hud.boxLabel, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '10px',
      color: '#ead4aa',
    });
    this.boxCountText = this.add.text(431, 338, '0/6', {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '12px',
      color: '#ffffff',
    });

    for (let i = 0; i < 6; i++) {
      const tx = 472 + i * 14;
      const tubeImg = this.add.image(tx, 338, 'tube_empty').setScale(1.6);
      this.tubeSprites.push(tubeImg);
    }

    // 7. Controles táctiles (joystick encima del panel del astronauta)
    this.touchControls = new TouchControls(this, 44, 238, 598, 316);

    // 8. Banner de radio de Corvi
    const radioBg = this.add
      .rectangle(320, 176, 396, 28, 0xead4aa, 0.98)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x181425);
    const radioIcon = this.add.image(138, 176, 'corvi_alert').setScale(0.55);
    this.radioText = this.add.text(154, 169, '', {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '12px',
      color: '#181425',
    });
    this.radioContainer = this.add
      .container(0, 0, [radioBg, radioIcon, this.radioText])
      .setVisible(false)
      .setDepth(50);

    // 9. Cartel de pausa con botón de Silencio y Créditos NASA
    const pauseDim = this.add
      .rectangle(320, 180, 640, 360, 0x181425, 0.65)
      .setInteractive();
    const pauseBox = this.add
      .rectangle(320, 180, 316, 128, 0x262b44, 0.98)
      .setStrokeStyle(2, 0xfee761);
    const pauseTitle = this.add
      .text(320, 134, uiText.hud.pausedTitle, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '18px',
        color: '#fee761',
      })
      .setOrigin(0.5);
    const pauseHint = this.add
      .text(320, 158, uiText.hud.pausedHint, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#ead4aa',
      })
      .setOrigin(0.5);

    const muteBtn = this.add
      .rectangle(242, 198, 134, 26, 0x3a4466)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    const muteBtnText = this.add
      .text(
        242,
        198,
        AudioSystem.isMuted() ? 'Sonido: SILENCIO' : 'Sonido: ACTIVO',
        {
          fontFamily: 'PixelifySans, monospace',
          resolution: 2,
          fontSize: '11px',
          color: '#ffffff',
        }
      )
      .setOrigin(0.5);
    muteBtn.on('pointerdown', () => {
      const muted = AudioSystem.toggleMute();
      muteBtnText.setText(muted ? 'Sonido: SILENCIO' : 'Sonido: ACTIVO');
    });

    const creditsBtn = this.add
      .rectangle(398, 198, 134, 26, 0x124e89)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    const creditsBtnText = this.add
      .text(398, 198, 'Fuentes NASA', {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#fee761',
      })
      .setOrigin(0.5);
    creditsBtn.on('pointerdown', () => {
      const returnScene = gameStore.state.location === 'mundo' ? 'Mundo' : 'Base';
      this.scene.stop('HUD');
      this.scene.stop('Dialogo');
      this.scene.stop('Tormenta');
      this.scene.stop(returnScene);
      this.scene.start('Creditos', { returnScene });
    });

    pauseDim.on('pointerdown', () => {
      Clock.setPaused(gameStore.state, false);
      bus.emit('clock:pauseChanged', { paused: false });
    });

    this.pauseContainer = this.add
      .container(0, 0, [
        pauseDim,
        pauseBox,
        pauseTitle,
        pauseHint,
        muteBtn,
        muteBtnText,
        creditsBtn,
        creditsBtnText,
      ])
      .setVisible(false)
      .setDepth(100);

    this.unsubscribers.push(
      bus.on('zone:changed', ({ name }) => {
        this.zoneText.setText(`↑ ${name}`);
      }),
      bus.on('tool:changed', ({ index }) => {
        this.toolSlots.forEach((slot, idx) => {
          slot.setFillStyle(idx === index ? 0xfee761 : 0xffffff);
        });
      }),
      bus.on('clock:warn16', () => {
        this.showRadioMessage(uiText.hud.radioWarn16);
      }),
      bus.on('clock:curfew17', () => {
        this.showRadioMessage(uiText.hud.radioCurfew17);
      }),
      bus.on('vitals:o2Warn40', () => {
        AudioSystem.play('o2Beep');
        this.showRadioMessage(uiText.hud.radioO2Warn40);
      }),
      bus.on('vitals:o2Danger20', () => {
        AudioSystem.play('o2Beep');
        this.showRadioMessage(uiText.hud.radioO2Danger20);
      }),
      bus.on('interact:prompt', ({ text }) => {
        if (text) {
          this.showRadioMessage(text);
        }
      }),
      bus.on('clock:pauseChanged', ({ paused }) => {
        this.pauseContainer.setVisible(paused);
      })
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const unsub of this.unsubscribers) {
        unsub();
      }
      this.unsubscribers = [];
      this.touchControls?.destroy();
      this.touchControls = null;
    });
  }

  update(time: number): void {
    const state = gameStore.state;

    // Ocultar el HUD cuando corre cualquiera de los 6 minijuegos encima
    const inMinigame = MINIGAME_KEYS.some((k) => this.scene.isActive(k));
    this.cameras.main.setVisible(!inMinigame);
    if (inMinigame) return;

    const stormActive = Events.getActiveStorm(state) !== null;
    this.missionsContainer.setVisible(state.location === 'mundo' && !stormActive);
    this.zoneContainer.setVisible(!stormActive);

    // Actualizar texto y casillas de MISIONES DEL DÍA según la cuota y eventos activos
    const dynamicMissions: { label: string; done: boolean }[] = [];
    const typeNameMap: Record<SampleType, string> = {
      roca: uiText.hud.missionRockUnit,
      suelo: uiText.hud.missionSoilUnit,
      minerales: uiText.hud.missionMineralsUnit,
      aire: uiText.hud.missionAirUnit,
    };

    for (const t of ['roca', 'suelo', 'minerales', 'aire'] as SampleType[]) {
      const req = state.quotaToday[t] ?? 0;
      if (req > 0) {
        const unitLabel =
          t === 'roca' && req > 1 ? uiText.hud.missionRocksUnit : typeNameMap[t];
        dynamicMissions.push({
          label: `${uiText.hud.missionRockPrefix} ${req} ${unitLabel}`,
          done: Quota.isTypeMet(state, t),
        });
      }
    }

    if (state.activeEvents.includes('dust')) {
      dynamicMissions.push({
        label: uiText.hud.missionCleanPanel,
        done: false,
      });
    }
    if (!state.base.moxieOk) {
      dynamicMissions.push({
        label: uiText.hud.missionFixMoxie,
        done: false,
      });
    }

    while (dynamicMissions.length < 3) {
      if (dynamicMissions.length === 1) {
        dynamicMissions.push({
          label: uiText.hud.defaultMissionExplore,
          done:
            state.deliveredToday.roca +
              state.tubes.filter((t) => t !== null).length >
            0,
        });
      } else {
        dynamicMissions.push({
          label: uiText.hud.defaultMissionReturn,
          done:
            state.location !== 'mundo' &&
            state.clock.minutes < balance.dayClock.curfewMin,
        });
      }
    }

    this.missionCheckBoxes.forEach((box, idx) => {
      const item = dynamicMissions[idx];
      this.missionLabels[idx].setText(item.label);
      box.setFillStyle(item.done ? 0x2ce8f5 : 0xffffff);
      this.missionLabels[idx].setColor(item.done ? '#5a6988' : '#181425');
    });

    // Actualizar día y reloj
    this.dayText.setText(`${uiText.hud.dayPrefix} ${state.day}`);
    this.timeText.setText(Clock.formatTime(state.clock.minutes));
    this.dayBarFill.width = Math.round(56 * Clock.getProgress(state.clock.minutes));
    this.skyIcon.setTexture(Clock.isNight(state.clock.minutes) ? 'icon_moon' : 'icon_sun');

    // Actualizar barra de oxígeno
    const o2 = Math.max(0, Math.min(100, state.astronaut.o2));
    this.o2ValueText.setText(`${Math.ceil(o2)} %`);
    this.o2BarFill.width = Math.round((164 * o2) / 100);

    if (o2 <= balance.o2.dangerAt) {
      const blinkOn = Math.floor(time / 200) % 2 === 0;
      this.o2BarFill.setFillStyle(blinkOn ? 0xe43b44 : 0xff0044);
    } else if (o2 <= balance.o2.warnAt) {
      this.o2BarFill.setFillStyle(0xfee761);
    } else {
      this.o2BarFill.setFillStyle(0x2ce8f5);
    }

    // Actualizar barra de temperatura del traje y batería del calefactor
    const tempC = Math.round(state.astronaut.suitTempC);
    const bat = Math.ceil(state.astronaut.heaterBattery);
    this.tempValueText.setText(`${tempC} °C · ${bat} %`);
    this.tempBarFill.width = Math.round((164 * bat) / 100);
    this.tempBarFill.setFillStyle(
      state.astronaut.suitTempC >= balance.heater.comfortMinC ? 0xe43b44 : 0x2ce8f5
    );

    // Actualizar barras de radiación hoy y total
    const doseToday = state.astronaut.doseToday;
    const doseTotal = state.astronaut.doseTotal;
    this.radValueText.setText(`${doseToday.toFixed(2)} / ${doseTotal.toFixed(2)} DR`);

    const todayRatio = Math.min(1, doseToday / 5);
    const totalRatio = Math.min(1, doseTotal / balance.radiation.doseLimit);
    this.radTodayFill.width = Math.max(
      doseToday > 0 ? 2 : 0,
      Math.round(76 * todayRatio)
    );
    this.radTotalFill.width = Math.max(
      doseTotal > 0 ? 2 : 0,
      Math.round(78 * totalRatio)
    );

    // Actualizar caja de tubos
    const filledCount = state.tubes.filter((t) => t !== null).length;
    this.boxCountText.setText(`${filledCount}/6`);
    this.tubeSprites.forEach((sprite, idx) => {
      sprite.setTexture(state.tubes[idx] ? 'tube_full' : 'tube_empty');
    });
  }

  private createPanel(
    x: number,
    y: number,
    w: number,
    h: number,
    fillColor: number
  ): Phaser.GameObjects.Rectangle {
    const rect = this.add.rectangle(x, y, w, h, fillColor).setOrigin(0, 0);
    rect.setStrokeStyle(2, 0x181425);
    return rect;
  }

  private showRadioMessage(msg: string): void {
    this.radioText.setText(msg);
    this.radioContainer.setVisible(true);
    if (this.radioTimer) {
      this.radioTimer.remove(false);
    }
    this.radioTimer = this.time.delayedCall(3000, () => {
      this.radioContainer.setVisible(false);
    });
  }
}
