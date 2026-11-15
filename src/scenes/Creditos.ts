import Phaser from 'phaser';
import { AudioSystem } from '../systems/Audio';
import { I18n } from '../systems/I18n';

interface CreditosData {
  returnScene?: string;
}

/**
 * Escena Creditos (sección 10.9 y Fase 6):
 * Muestra todas las fuentes científicas de la NASA empleadas en Alerta Heliosfera,
 * las etiquetas de honestidad ("ARCHIVO REAL" / "SIMULADO") y el aviso oficial.
 */
export class Creditos extends Phaser.Scene {
  private returnScene = 'Despegue';

  constructor() {
    super('Creditos');
  }

  private page = 0;

  init(data?: CreditosData & { page?: number }): void {
    this.returnScene = data?.returnScene ?? 'Despegue';
    this.page = data?.page ?? 0;
  }

  create(): void {
    const uiText = I18n.ui();
    const creditsText = I18n.credits();
    AudioSystem.playMusic('starboard');
    // 1. Fondo espacial estrellado y contenedor principal sin empalmes
    this.add.rectangle(320, 180, 640, 360, 0x181425);
    const frame = this.add
      .rectangle(320, 180, 616, 336, 0x262b44)
      .setStrokeStyle(2, 0x5a6988);
    void frame;

    // 2. Encabezado superior
    this.add.rectangle(320, 26, 612, 26, 0x124e89);
    this.add
      .text(320, 26, creditsText.headerTitle, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '14px',
        color: '#fee761',
      })
      .setOrigin(0.5);

    this.add
      .text(320, 48, `${uiText.gameTitle} · ${uiText.subtitle}`, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#ead4aa',
      })
      .setOrigin(0.5);

    // 3. Tarjetas (página 0: fuentes NASA · página 1: equipo y audio)
    const list = this.page === 0 ? creditsText.nasaSources : creditsText.teamAndAudio;
    list.forEach((item, idx) => {
      const cy = 64 + idx * 41;
      this.add
        .rectangle(24, cy, 592, 37, 0x181425)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x3a4466);

      this.add.text(34, cy + 4, `★ ${item.title}`, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#fee761',
      });

      this.add.text(34, cy + 19, item.detail, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '10px',
        color: '#c0cbdc',
      });

      const badge = this.add
        .rectangle(506, cy + 6, 102, 14, 0xffffff)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x5a6988);
      void badge;
      this.add.text(512, cy + 8, `▪ ${item.tag}`, {
        fontFamily: 'PixelifySans, monospace',
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
        fontSize: '11px',
        color: '#181425',
      })
      .setOrigin(0.5);

    // Cambiar de página
    const pageBtn = this.add
      .rectangle(520, 322, 170, 28, 0x124e89)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(520, 322, this.page === 0 ? creditsText.teamAudioBtn : creditsText.nasaSourcesBtn, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const flip = (): void => {
      AudioSystem.play('ui_switch');
      this.scene.restart({ returnScene: this.returnScene, page: this.page === 0 ? 1 : 0 });
    };
    pageBtn.on('pointerdown', flip);
    this.input.keyboard?.once('keydown-RIGHT', flip);
    this.input.keyboard?.once('keydown-LEFT', flip);

    // 5. Botón Volver
    const backBtn = this.add
      .rectangle(320, 322, 200, 28, 0x3e8948)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(320, 322, creditsText.backBtn, {
        fontFamily: 'PixelifySans, monospace',
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
