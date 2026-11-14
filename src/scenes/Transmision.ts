import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { gameStore } from '../state/GameState';
import { Clock } from '../systems/Clock';
import { Data } from '../systems/Data';
import { Quota } from '../systems/Quota';
import type { Label } from '../types';

/**
 * Escena Transmision (08:00, fiel al storyboard s02_transmision.png):
 * Animación del sobre viajando de la Tierra a Marte con el retraso real,
 * 4 tarjetas (Pronóstico de Jezero con ventana segura 09:00-17:00, Alerta Solar DONKI,
 * Cuota y envío, Dato del día) con sus etiquetas de honestidad y fuentes.
 */
export class Transmision extends Phaser.Scene {
  private envelopeContainer!: Phaser.GameObjects.Container;

  constructor() {
    super('Transmision');
  }

  create(): void {
    const state = gameStore.state;
    Clock.setPaused(state, true);
    Quota.applyDailyQuota(state);

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
    this.add.rectangle(320, 76, 596, 64, 0x262b44).setStrokeStyle(1, 0x3a4466);

    // Planeta Tierra (izquierda)
    this.add.circle(60, 76, 24, 0x0099db);
    this.add.circle(54, 70, 9, 0x63c74d);
    this.add.circle(68, 84, 7, 0x63c74d);

    // Planeta Marte (derecha)
    this.add.circle(580, 76, 22, 0xb86f50);
    this.add.circle(573, 71, 6, 0x733e39);

    // Línea punteada entre Tierra y Marte
    const dots = this.add.graphics();
    for (let x = 96; x <= 544; x += 14) {
      dots.fillStyle(x < 380 ? 0xfee761 : 0x5a6988, 1);
      dots.fillRect(x, 75, 6, 3);
    }

    // Sobre animado cruzando de la Tierra a Marte
    const envRect = this.add
      .rectangle(0, 0, 22, 15, 0xffffff)
      .setStrokeStyle(1, 0x181425);
    const envFlap = this.add.graphics();
    envFlap.lineStyle(1, 0x181425, 1);
    envFlap.strokeTriangle(-10, -7, 10, -7, 0, 2);
    this.envelopeContainer = this.add.container(110, 76, [envRect, envFlap]);

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
        `${uiText.transmision.delayPrefix} ${delayInfo.minutes} ${uiText.transmision.delaySuffix}`,
        {
          fontFamily: 'PixelifySans, monospace',
          fontSize: '12px',
          color: '#ffffff',
        }
      )
      .setOrigin(0.5);

    this.drawHonestyTag(226, 90, delayInfo.label, delayInfo.source);

    // 3. Tarjeta 1 (izquierda): PRONÓSTICO DE JEZERO (meda_jezero.json)
    const meda = Data.getMedaForecast(state.day);
    this.add
      .rectangle(22, 116, 294, 150, 0x262b44)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a4466);

    this.add.text(34, 122, uiText.transmision.forecastTitle, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '12px',
      color: '#fee761',
    });

    this.add
      .text(192, 138, uiText.transmision.safeWindowLabel, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#fee761',
      })
      .setOrigin(0.5, 0);

    // Barras horarias de 06:00 a 18:00 (09:00 a 17:00 resaltadas en verde #63c74d)
    const chartBaseY = 222;
    meda.tempsC.forEach((tempC, idx) => {
      const bx = 44 + idx * 19;
      // Normalizamos de -90..0 °C a altura 8..62 px
      const barH = Math.max(6, Math.round(((tempC + 90) / 90) * 62));
      const hourNum = Number(meda.hours[idx]);
      const isSafe = hourNum >= 9 && hourNum <= 17;
      this.add
        .rectangle(bx, chartBaseY, 14, barH, isSafe ? 0x63c74d : 0x5a6988)
        .setOrigin(0, 1);
    });

    // Marco amarillo de ventana segura (09:00 a 17:00 = índices 3 a 11)
    this.add
      .rectangle(99, 154, 174, 69)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xfee761);

    // Etiquetas de horas 06, 09, 12, 15, 18
    const hourLabels = [
      { h: '06', x: 44 },
      { h: '09', x: 101 },
      { h: '12', x: 158 },
      { h: '15', x: 215 },
      { h: '18', x: 272 },
    ];
    for (const hl of hourLabels) {
      this.add.text(hl.x, 225, hl.h, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '10px',
        color: '#c0cbdc',
      });
    }

    this.drawHonestyTag(34, 244, meda.label, meda.source);

    // 4. Tarjeta 2 (arriba derecha): ALERTA SOLAR (events.json DONKI)
    const solar = Data.getSolarAlert(state.day);
    this.add
      .rectangle(326, 116, 292, 64, 0x262b44)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a4466);

    this.add.text(336, 121, uiText.transmision.solarAlertTitle, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '12px',
      color: '#fee761',
    });

    this.add.text(
      336,
      136,
      solar.hasAlert
        ? uiText.transmision.solarAlertStorm
        : uiText.transmision.solarAlertCalm,
      {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#ffffff',
        lineSpacing: 1,
      }
    );

    this.drawHonestyTag(
      336,
      162,
      solar.label,
      `${solar.source} · ${solar.activityId} · ${solar.speedText}`
    );

    // 5. Tarjeta 3 (centro derecha): CUOTA Y ENVÍO (SIMULADO)
    this.add
      .rectangle(326, 186, 292, 64, 0x262b44)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a4466);

    this.add.text(336, 191, uiText.transmision.quotaTitle, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '12px',
      color: '#fee761',
    });

    const quotaParts: string[] = [];
    if (state.quotaToday.roca > 0) quotaParts.push(`${state.quotaToday.roca} roca`);
    if (state.quotaToday.suelo > 0) quotaParts.push(`${state.quotaToday.suelo} suelo`);
    if (state.quotaToday.minerales > 0)
      quotaParts.push(`${state.quotaToday.minerales} minerales`);
    if (state.quotaToday.aire > 0) quotaParts.push(`${state.quotaToday.aire} aire`);

    const supplyLine =
      state.supplyBonus === 'extra'
        ? uiText.transmision.supplyExtra
        : state.supplyBonus === 'menos'
          ? uiText.transmision.supplyMenos
          : uiText.transmision.supplyNormal;

    this.add.text(336, 206, `${quotaParts.join(' + ')}.\n${supplyLine}`, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#ffffff',
      lineSpacing: 1,
    });

    this.drawHonestyTag(336, 232, 'SIMULADO', 'Regla del juego');

    // 6. Tarjeta 4 (abajo derecha): DATO DEL DÍA (facts.json)
    const dayFacts = Data.getFactsForDay(state.day);
    const mainFact = dayFacts[0];
    this.add
      .rectangle(326, 256, 292, 72, 0x262b44)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a4466);

    this.add.text(336, 260, uiText.transmision.factTitle, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '12px',
      color: '#fee761',
    });

    this.add.text(336, 275, mainFact.text, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#ffffff',
      wordWrap: { width: 274 },
    });

    this.drawNasaSealAndTag(336, 308, mainFact.source, mainFact.label);

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

    const beginDay = (): void => {
      Clock.setPaused(state, false);
      state.location = 'mundo';
      this.scene.start('Mundo');
    };

    startBtn.on('pointerdown', beginDay);
    this.input.keyboard?.once('keydown-SPACE', beginDay);
    this.input.keyboard?.once('keydown-E', beginDay);
    this.input.keyboard?.once('keydown-ENTER', beginDay);
  }

  private drawHonestyTag(x: number, y: number, label: Label, source: string): void {
    const textObj = this.add.text(x + 6, y + 2, `▪ ${label} · ${source}`, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '9px',
      color: '#262b44',
    });
    const w = Math.round(textObj.width + 12);
    const bg = this.add
      .rectangle(x, y, w, 14, 0xffffff)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x5a6988);
    textObj.setDepth(bg.depth + 1);
  }

  private drawNasaSealAndTag(
    x: number,
    y: number,
    source: string,
    label: Label
  ): void {
    const sealTxt = this.add.text(
      x + 15,
      y + 2,
      `${uiText.transmision.nasaSealPrefix} · ${source}`,
      {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '9px',
        color: '#181425',
      }
    );
    const sealW = Math.round(sealTxt.width + 20);
    const sealBg = this.add
      .rectangle(x, y, sealW, 14, 0xfee761)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x181425);
    const star = this.add.text(x + 3, y + 1, '★', {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '9px',
      color: '#f77622',
    });
    sealTxt.setDepth(sealBg.depth + 1);
    star.setDepth(sealBg.depth + 1);

    this.drawHonestyTag(x + sealW + 6, y, label, source);
  }
}
