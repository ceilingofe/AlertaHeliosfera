import Phaser from 'phaser';
import { gameStore } from '../state/GameState';
import { AudioSystem } from '../systems/Audio';
import { Clock } from '../systems/Clock';
import { Data, type SolarAlertInfo } from '../systems/Data';
import { Events } from '../systems/Events';
import { I18n } from '../systems/I18n';
import { LiveNasa } from '../systems/LiveNasa';
import { Quota } from '../systems/Quota';
import type { Label, SampleType } from '../types';
import { StaticEffect } from '../ui/StaticEffect';

/**
 * Escena Transmision (08:00, fiel al storyboard s02_transmision.png):
 * Animación del sobre viajando de la Tierra a Marte con el retraso real,
 * 4 tarjetas visuales con sus etiquetas de honestidad y fuentes bien contenidas sin empalmes.
 */
export class Transmision extends Phaser.Scene {
  private envelopeContainer!: Phaser.GameObjects.Container;
  private staticEffect!: StaticEffect;

  constructor() {
    super('Transmision');
  }

  create(): void {
    AudioSystem.playMusic('blueprints');
    const state = gameStore.state;
    const uiText = I18n.ui();
    Clock.setPaused(state, true);
    Quota.applyDailyQuota(state);
    Events.initDay(state);

    // 1. Marco general de la consola de transmisión (s02_transmision.png)
    this.add.rectangle(320, 180, 640, 360, 0x262b44);
    this.add
      .rectangle(320, 180, 616, 336, 0x181425)
      .setStrokeStyle(2, 0x5a6988);

    // Barra de título azul #124e89
    this.add.rectangle(320, 28, 600, 20, 0x124e89);
    this.add.text(
      26,
      20,
      `${uiText.transmision.headerPrefix} ${state.day} · ${uiText.transmision.headerTime}`,
      {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '12px',
        color: '#ffffff',
      }
    );
    this.add
      .text(612, 20, uiText.transmision.clockPaused, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#c0cbdc',
      })
      .setOrigin(1, 0);

    // 2. Panel superior: animación Tierra -> Marte con retraso de luz (horizons_delay.json)
    const delayInfo = Data.getLightDelay(state.day);
    this.add.rectangle(320, 74, 596, 60, 0x262b44).setStrokeStyle(1, 0x3a4466);

    if (this.textures.exists('planet_earth')) {
      this.add.image(60, 74, 'planet_earth').setDisplaySize(44, 42);
    } else {
      this.add.circle(60, 74, 22, 0x0099db);
      this.add.circle(54, 68, 8, 0x63c74d);
      this.add.circle(68, 82, 6, 0x63c74d);
    }

    if (this.textures.exists('planet_mars')) {
      this.add.image(580, 74, 'planet_mars').setDisplaySize(42, 40);
    } else {
      this.add.circle(580, 74, 20, 0xb86f50);
      this.add.circle(573, 69, 5, 0x733e39);
    }

    const dots = this.add.graphics();
    for (let x = 96; x <= 544; x += 14) {
      dots.fillStyle(x < 380 ? 0xfee761 : 0x5a6988, 1);
      dots.fillRect(x, 73, 6, 3);
    }

    const envRect = this.add
      .rectangle(0, 0, 22, 15, 0xffffff)
      .setStrokeStyle(1, 0x181425);
    const envFlap = this.add.graphics();
    envFlap.lineStyle(1, 0x181425, 1);
    envFlap.strokeTriangle(-10, -7, 10, -7, 0, 2);
    this.envelopeContainer = this.add.container(110, 74, [envRect, envFlap]);

    this.tweens.add({
      targets: this.envelopeContainer,
      x: 530,
      duration: 2600,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add
      .text(
        320,
        54,
        `${uiText.transmision.delayPrefix} ${delayInfo.minutes} ${uiText.transmision.delaySuffix} · ${delayInfo.distanceMkm ?? '?'} ${uiText.transmision.distanceSuffix}`,
        {
          fontFamily: 'PixelifySans, monospace',
          fontSize: '12px',
          color: '#ffffff',
        }
      )
      .setOrigin(0.5);

    this.drawHonestyTag(210, 86, delayInfo.label, delayInfo.source, 280);

    // 3. Tarjeta 1 (izquierda): PRONÓSTICO DE JEZERO (meda_jezero.json)
    const meda = Data.getMedaForecast(state.day);
    this.add
      .rectangle(22, 112, 294, 154, 0x262b44)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a4466);

    this.add.text(34, 118, uiText.transmision.forecastTitle, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '12px',
      color: '#fee761',
    });

    if (state.base.antennaOk) {
      this.add
        .text(192, 134, uiText.transmision.safeWindowLabel, {
          fontFamily: 'PixelifySans, monospace',
          fontSize: '10px',
          color: '#fee761',
        })
        .setOrigin(0.5, 0);

      const chartBaseY = 220;
      meda.tempsC.forEach((tempC, idx) => {
        const bx = 44 + idx * 19;
        const barH = Math.max(6, Math.round(((tempC + 90) / 90) * 60));
        const hourNum = Number(meda.hours[idx]);
        const isSafe = hourNum >= 9 && hourNum <= 17;
        this.add
          .rectangle(bx, chartBaseY, 14, barH, isSafe ? 0x63c74d : 0x5a6988)
          .setOrigin(0, 1);
      });

      this.add
        .rectangle(99, 152, 174, 69)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0xfee761);

      const hourLabels = [
        { h: '06', x: 44 },
        { h: '09', x: 101 },
        { h: '12', x: 158 },
        { h: '15', x: 215 },
        { h: '18', x: 272 },
      ];
      for (const hl of hourLabels) {
        this.add.text(hl.x, 223, hl.h, {
          fontFamily: 'PixelifySans, monospace',
          fontSize: '10px',
          color: '#c0cbdc',
        });
      }

      this.drawHonestyTag(34, 244, meda.label, meda.source, 270);
    } else {
      this.add.text(34, 156, uiText.transmision.antennaBrokenNotice, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#c0cbdc',
        wordWrap: { width: 266 },
      });
    }

    // 4. Tarjeta 2 (arriba derecha): ALERTA SOLAR (DONKI en vivo con respaldo en events.json) + Diagrama Sol -> CME -> Marte
    const solar = Data.getSolarAlert(state.day);
    this.add
      .rectangle(326, 112, 292, 68, 0x262b44)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a4466);

    this.add.text(336, 115, uiText.transmision.solarAlertTitle, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#fee761',
    });

    if (state.base.antennaOk) {
      const formatSolarDesc = (info: SolarAlertInfo): string => {
        if (state.day === 3) return uiText.transmision.solarAlertDay3;
        if (state.day === 5) return uiText.transmision.solarAlertDay5;
        const base = info.hasAlert ? uiText.transmision.solarAlertStorm : uiText.transmision.solarAlertCalm;
        if (info.isLive && info.speedText) {
          return `${base.split('\n')[0]}\nCME · ${info.speedText}`;
        }
        return base;
      };

      const solarDescText = this.add.text(336, 129, formatSolarDesc(solar), {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '9px',
        color: '#ffffff',
        lineSpacing: 1,
      });

      // Mini diagrama visual Sol -> onda CME -> Marte a la derecha de la tarjeta
      const sg = this.add.graphics();
      this.add.circle(558, 138, 7, 0xfee761);
      if (this.textures.exists('planet_mars')) {
        this.add.image(602, 138, 'planet_mars').setDisplaySize(13, 12);
      } else {
        this.add.circle(602, 138, 5, 0xb86f50);
      }
      if (state.day === 3 || solar.hasAlert) {
        sg.lineStyle(2, state.day === 5 ? 0x2ce8f5 : 0xe43b44, 1);
        sg.beginPath();
        sg.arc(
          558,
          138,
          24,
          Phaser.Math.DegToRad(state.day === 5 ? -55 : -30),
          Phaser.Math.DegToRad(state.day === 5 ? -10 : 30),
          false
        );
        sg.strokePath();
      } else {
        sg.lineStyle(1, 0x63c74d, 0.7);
        sg.lineBetween(568, 138, 594, 138);
      }

      let solarTagObjs = this.drawHonestyTag(
        336,
        162,
        solar.label,
        `${solar.source} · ${solar.activityId}`,
        274
      );

      let alive = true;
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        alive = false;
      });

      void LiveNasa.fetchLatestCme().then((liveSnapshot) => {
        if (!liveSnapshot || !alive || !this.sys?.isActive()) return;
        Data.setLiveCme(liveSnapshot);
        const updated = Data.getSolarAlert(state.day);
        if (!updated.isLive) return;
        solarDescText.setText(formatSolarDesc(updated));
        solarTagObjs.bg.destroy();
        solarTagObjs.txt.destroy();
        solarTagObjs = this.drawHonestyTag(
          336,
          162,
          updated.label,
          `${updated.source} · ${updated.activityId}`,
          274
        );
      });
    } else {
      this.add.text(336, 136, uiText.transmision.antennaBrokenNotice, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '10px',
        color: '#c0cbdc',
        wordWrap: { width: 274 },
      });
    }

    // 5. Tarjeta 3 (centro derecha): CUOTA Y ENVÍO con iconos visuales de muestras (×N)
    this.add
      .rectangle(326, 184, 292, 68, 0x262b44)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a4466);

    this.add.text(336, 187, uiText.transmision.quotaTitle, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#fee761',
    });

    const sampleSpriteMap: Record<SampleType, string> = {
      roca: 'rock_mars',
      suelo: 'rock_sandstone',
      minerales: 'rock_sparkle',
      aire: 'air_pump',
    };
    const isEs = I18n.getLang() === 'es';
    const sampleNameShort: Record<SampleType, string> = {
      roca: isEs ? 'Roca' : 'Rock',
      suelo: isEs ? 'Suelo' : 'Soil',
      minerales: isEs ? 'Min.' : 'Min.',
      aire: isEs ? 'Aire' : 'Air',
    };

    const quotaEntries = (['roca', 'suelo', 'minerales', 'aire'] as SampleType[]).filter(
      (k) => state.quotaToday[k] > 0
    );
    quotaEntries.forEach((type, idx) => {
      const chipX = 336 + idx * 68;
      this.add
        .rectangle(chipX, 201, 64, 16, 0x181425)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x5a6988);
      this.add.image(chipX + 9, 209, sampleSpriteMap[type]).setDisplaySize(13, 11);
      this.add.text(chipX + 18, 203, `×${state.quotaToday[type]} ${sampleNameShort[type]}`, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '9px',
        color: '#ffffff',
      });
    });

    const supplyLine =
      state.supplyBonus === 'extra'
        ? uiText.transmision.supplyExtra
        : state.supplyBonus === 'menos'
          ? uiText.transmision.supplyMenos
          : uiText.transmision.supplyNormal;

    this.add.text(336, 219, supplyLine, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '9px',
      color: '#ead4aa',
    });

    this.drawHonestyTag(336, 234, 'SIMULADO', uiText.transmision.gameRuleSource, 274);

    // 6. Tarjeta 4 (abajo derecha): DATO DEL DÍA (facts.json)
    const dayFacts = Data.getFactsForDay(state.day);
    const mainFact = dayFacts[0];
    this.add
      .rectangle(326, 256, 292, 74, 0x262b44)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a4466);

    this.add.text(336, 259, uiText.transmision.factTitle, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#fee761',
    });

    if (state.base.antennaOk) {
      this.add.image(346, 284, `icon_${mainFact.icon}`).setScale(1.4);
      this.add.text(360, 273, mainFact.text, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '9px',
        color: '#ffffff',
        wordWrap: { width: 250 },
      });

      this.drawNasaSealAndTag(336, 312, mainFact.source, mainFact.label);
    } else {
      this.add.text(336, 280, uiText.transmision.antennaBrokenNotice, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '10px',
        color: '#c0cbdc',
        wordWrap: { width: 274 },
      });
    }

    // 7. Nota inferior izquierda y botón "Empezar el día"
    this.add.text(24, 274, uiText.transmision.footerNote, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#c0cbdc',
    });

    const startBtn = this.add
      .rectangle(24, 298, 290, 30, 0xc0cbdc)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(169, 313, uiText.transmision.startDayButton, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '15px',
        color: '#181425',
      })
      .setOrigin(0.5);

    // 8. Efecto suave de estática tipo TV cada ciertos segundos si hay alerta solar o antena dañada
    this.staticEffect = new StaticEffect(this, {
      intervalMs: 4000,
      burstDurationMs: 240,
      maxAlpha: !state.base.antennaOk ? 0.18 : 0.12,
    });
    this.staticEffect.setEnabled(!state.base.antennaOk || solar.hasAlert, false);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.staticEffect?.destroy();
    });

    const beginDay = (): void => {
      AudioSystem.play('scanClick');
      Clock.setPaused(state, false);
      state.location = 'mundo';
      this.scene.start('Mundo');
    };

    startBtn.on('pointerdown', beginDay);
    this.input.keyboard?.once('keydown-SPACE', beginDay);
    this.input.keyboard?.once('keydown-E', beginDay);
    this.input.keyboard?.once('keydown-ENTER', beginDay);
  }

  update(time: number): void {
    this.staticEffect?.update(time);
  }

  private drawHonestyTag(
    x: number,
    y: number,
    label: Label,
    source: string,
    maxWidth = 274
  ): { bg: Phaser.GameObjects.Rectangle; txt: Phaser.GameObjects.Text } {
    const textObj = this.add.text(x + 5, y + 2, `▪ ${I18n.formatLabel(label)} · ${source}`, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '8px',
      color: label === 'EN VIVO' ? '#124e89' : '#262b44',
    });
    const w = Math.min(maxWidth, Math.round(textObj.width + 10));
    const bg = this.add
      .rectangle(x, y, w, 13, label === 'EN VIVO' ? 0xd9f9ff : 0xffffff)
      .setOrigin(0, 0)
      .setStrokeStyle(1, label === 'EN VIVO' ? 0x0099db : 0x5a6988);
    textObj.setDepth(bg.depth + 1);
    return { bg, txt: textObj };
  }

  private drawNasaSealAndTag(
    x: number,
    y: number,
    source: string,
    label: Label
  ): void {
    const uiText = I18n.ui();
    const sealTxt = this.add.text(
      x + 14,
      y + 2,
      `${uiText.transmision.nasaSealPrefix} · ${I18n.formatLabel(label)} · ${source}`,
      {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '8px',
        color: '#181425',
      }
    );
    const sealW = Math.min(274, Math.round(sealTxt.width + 18));
    const sealBg = this.add
      .rectangle(x, y, sealW, 13, 0xfee761)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x181425);
    const star = this.add.text(x + 3, y + 1, '★', {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '8px',
      color: '#f77622',
    });
    sealTxt.setDepth(sealBg.depth + 1);
    star.setDepth(sealBg.depth + 1);
  }
}
