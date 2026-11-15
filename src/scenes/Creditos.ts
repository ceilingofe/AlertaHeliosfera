import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { AudioSystem } from '../systems/Audio';

interface CreditosData {
  returnScene?: string;
}

const NASA_SOURCES_LIST: { title: string; detail: string; tag: string }[] = [
  {
    title: 'NASA DONKI & Modelo WSA-Enlil (CCMC)',
    detail: 'Eyecciones de masa coronal (CME de mayo de 2024 y trayectorias en el sistema solar).',
    tag: 'ARCHIVO REAL',
  },
  {
    title: 'Curiosity RAD (Radiation Assessment Detector)',
    detail: 'Dosis de radiación en la superficie marciana (~0,21 mGy/día y pico de 8,1 mGy).',
    tag: 'ARCHIVO REAL',
  },
  {
    title: 'Perseverance MEDA, MOXIE, SHERLOC y PIXL',
    detail: 'Clima del cráter Jezero, producción de O₂ (hasta 12 g/h) y roca Cheyava Falls (2024).',
    tag: 'ARCHIVO REAL',
  },
  {
    title: 'JPL Horizons (Solar System Dynamics)',
    detail: 'Distancia Tierra–Marte y retraso de transmisión de luz (3 a 22 minutos).',
    tag: 'ARCHIVO REAL',
  },
  {
    title: 'Misiones InSight, Phoenix y MAVEN',
    detail: 'Polvo en paneles solares (2022), percloratos en regolito y auroras marcianas.',
    tag: 'ARCHIVO REAL',
  },
];

/**
 * Escena Creditos (sección 10.9 y Fase 6):
 * Muestra todas las fuentes científicas de la NASA empleadas en Alerta Heliosfera,
 * las etiquetas de honestidad ("ARCHIVO REAL" / "SIMULADO") y el aviso oficial:
 * "Este juego usa datos abiertos de la NASA. No está avalado por la NASA."
 */
export class Creditos extends Phaser.Scene {
  private returnScene = 'Despegue';

  constructor() {
    super('Creditos');
  }

  init(data?: CreditosData): void {
    this.returnScene = data?.returnScene ?? 'Despegue';
  }

  create(): void {
    // 1. Fondo espacial estrellado y contenedor principal sin empalmes
    this.add.rectangle(320, 180, 640, 360, 0x181425);
    const frame = this.add
      .rectangle(320, 180, 616, 336, 0x262b44)
      .setStrokeStyle(2, 0x5a6988);
    void frame;

    // 2. Encabezado superior
    this.add.rectangle(320, 26, 612, 26, 0x124e89);
    this.add
      .text(320, 26, 'CRÉDITOS Y FUENTES DE DATOS ABIERTOS NASA', {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '14px',
        color: '#fee761',
      })
      .setOrigin(0.5);

    this.add
      .text(320, 48, `${uiText.gameTitle} · ${uiText.subtitle}`, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#ead4aa',
      })
      .setOrigin(0.5);

    // 3. Tarjetas de fuentes NASA con sus etiquetas de honestidad (y = 64..264)
    NASA_SOURCES_LIST.forEach((item, idx) => {
      const cy = 64 + idx * 41;
      this.add
        .rectangle(24, cy, 592, 37, 0x181425)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x3a4466);

      this.add.text(34, cy + 4, `★ ${item.title}`, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#fee761',
      });

      this.add.text(34, cy + 19, item.detail, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '10px',
        color: '#c0cbdc',
      });

      const badge = this.add
        .rectangle(512, cy + 6, 96, 14, 0xffffff)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x5a6988);
      void badge;
      this.add.text(518, cy + 8, `▪ ${item.tag}`, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '9px',
        color: '#262b44',
      });
    });

    // 4. Franja de aviso obligatorio (sección 10.9)
    this.add
      .rectangle(320, 284, 592, 22, 0xfee761)
      .setStrokeStyle(1, 0x181425);
    this.add
      .text(320, 284, uiText.honestyNotice, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#181425',
      })
      .setOrigin(0.5);

    // 5. Botón Volver
    const backBtn = this.add
      .rectangle(320, 322, 200, 28, 0x3e8948)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(320, 322, 'Volver (Espacio / Esc)', {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const goBack = (): void => {
      AudioSystem.play('scanClick');
      this.scene.start(this.returnScene);
    };

    backBtn.on('pointerdown', goBack);
    this.input.keyboard?.once('keydown-SPACE', goBack);
    this.input.keyboard?.once('keydown-ESC', goBack);
    this.input.keyboard?.once('keydown-ENTER', goBack);
  }
}
