import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { gameStore } from '../state/GameState';
import { Save } from '../state/Save';
import { Customization } from '../systems/Customization';
import { Data, type FactEntry } from '../systems/Data';
import type { RescueCause } from '../types';
import { AstronautAppearance } from '../ui/AstronautAppearance';

interface DiplomaData {
  cause?: RescueCause;
  zoneName?: string;
}

/**
 * Escena Diploma (fiel al storyboard s13_diploma.png y sección 9.8):
 * Muestra el certificado final de la misión LUNA-7 con la personalización del astronauta a ×2,
 * días sobrevividos, muestras por tipo, kg de O₂ de MOXIE, tormentas en refugio,
 * % del límite de radiación del juego, dato favorito y descarga como PNG.
 */
export class Diploma extends Phaser.Scene {
  private cause: RescueCause = 'oxigeno';
  private zoneName = 'Bright Angel';
  private allFacts: FactEntry[] = [];
  private factIndex = 0;
  private favFactTextObj?: Phaser.GameObjects.Text;
  private downloadFeedbackText?: Phaser.GameObjects.Text;

  constructor() {
    super('Diploma');
  }

  init(data?: DiplomaData): void {
    this.cause = data?.cause ?? 'oxigeno';
    this.zoneName = data?.zoneName ?? 'Bright Angel';
  }

  create(): void {
    const state = gameStore.state;
    state.clock.paused = true;

    this.allFacts = Data.getAllFacts();
    if (state.learnedToday.length > 0) {
      const idx = this.allFacts.findIndex((f) => f.id === state.learnedToday[0]);
      this.factIndex = idx >= 0 ? idx : 0;
    }

    const summary = Customization.computeDiplomaSummary(
      state,
      this.cause,
      this.zoneName,
      this.allFacts[this.factIndex]?.id
    );

    // 1. Fondo espacial estrellado (#181425)
    this.add.rectangle(320, 180, 640, 360, 0x181425);
    const stars = this.add.graphics();
    for (let i = 0; i < 45; i++) {
      const sx = (i * 97 + 13) % 636;
      const sy = (i * 53 + 7) % 356;
      stars.fillStyle(i % 4 === 0 ? 0xfee761 : 0xffffff, 0.9);
      stars.fillRect(sx, sy, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
    }

    // 2. Pliego del diploma color crema (#ead4aa) con doble marco interior (#be4a2f / #e4a672)
    this.add.rectangle(320, 180, 560, 324, 0xead4aa);
    const outerBorder = this.add.rectangle(320, 180, 544, 308);
    outerBorder.setStrokeStyle(2, 0xc28569);
    const innerBorder = this.add.rectangle(320, 180, 538, 302);
    innerBorder.setStrokeStyle(1, 0xe4a672);

    // 3. Encabezado del diploma
    this.add
      .text(320, 46, uiText.diploma.title, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '18px',
        color: '#733e39',
      })
      .setOrigin(0.5);

    this.add
      .text(320, 67, uiText.diploma.subtitle, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#b86f50',
      })
      .setOrigin(0.5);

    // 4. Medallón espacial arriba a la derecha (Sol, Marte y arco de trayectoria)
    const badgeX = 538;
    const badgeY = 114;
    this.add.circle(badgeX, badgeY, 34, 0x262b44).setStrokeStyle(2, 0x181425);
    const orbit = this.add.graphics();
    orbit.lineStyle(2, 0x2ce8f5, 1);
    orbit.beginPath();
    orbit.arc(badgeX - 2, badgeY + 4, 24, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(330), false);
    orbit.strokePath();
    this.add.circle(badgeX - 9, badgeY - 9, 10, 0xfee761);
    this.add.circle(badgeX + 9, badgeY + 9, 12, 0xb86f50);

    // 5. Columna izquierda: Astronauta personalizado a ×2 y Corvi orgulloso abajo
    AstronautAppearance.createFullAstronautContainer(
      this,
      118,
      184,
      2.6,
      state.customization
    );

    this.add.image(118, 294, 'corvi_proud').setScale(1.1);
    const sparkles = this.add.graphics();
    sparkles.fillStyle(0xfee761, 1);
    sparkles.fillRect(98, 270, 4, 4);
    sparkles.fillRect(136, 274, 4, 4);

    // 6. Centro: Nombre de misión y días sobrevividos
    this.add
      .text(320, 96, summary.missionCode, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '20px',
        color: '#181425',
      })
      .setOrigin(0.5);

    const daysWord =
      summary.daysSurvived === 1
        ? uiText.diploma.daysSingular
        : uiText.diploma.daysPlural;
    this.add
      .text(
        320,
        122,
        `${uiText.diploma.daysPrefix} ${summary.daysSurvived} ${daysWord}`,
        {
          fontFamily: 'PixelifySans, monospace',
          resolution: 2,
          fontSize: '15px',
          color: '#be4a2f',
        }
      )
      .setOrigin(0.5);

    // 7. Tabla de estadísticas de la misión
    const labelX = 200;
    const valueX = 334;
    const rowStart = 144;
    const rowStep = 20;

    const s = summary.samplesByType;
    const samplesBreakdown = `${summary.totalSamples}: ${s.roca} rocas, ${s.suelo} suelo, ${s.minerales} minerales y ${s.aire} aire`;

    const rows: [string, string][] = [
      [uiText.diploma.samplesLabel, samplesBreakdown],
      [
        uiText.diploma.moxieLabel,
        `Tu base produjo ${summary.moxieKgFormatted} kg de O₂`,
      ],
      [
        uiText.diploma.stormsLabel,
        `${summary.stormsSheltered} ${uiText.diploma.stormsUnit}`,
      ],
      [
        uiText.diploma.doseLabel,
        `${summary.dosePercent} ${uiText.diploma.doseUnit}`,
      ],
    ];

    rows.forEach(([lbl, val], i) => {
      const ry = rowStart + i * rowStep;
      this.add.text(labelX, ry, lbl, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#733e39',
      });
      this.add.text(valueX, ry, val, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#181425',
      });
    });

    // Nota de honestidad sobre la escala de radiación del juego vs NASA
    this.add.text(labelX, 222, uiText.diploma.doseScaleNote, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '9px',
      color: '#5a6988',
    });

    // Selector de dato favorito
    this.favFactTextObj = this.add
      .text(
        labelX,
        235,
        `${uiText.diploma.favoriteFactLabel} ${summary.favoriteFact.text} (◄/►)`,
        {
          fontFamily: 'PixelifySans, monospace',
          resolution: 2,
          fontSize: '9px',
          color: '#3e8948',
        }
      )
      .setInteractive({ useHandCursor: true });

    this.favFactTextObj.on('pointerdown', () => {
      this.factIndex = (this.factIndex + 1) % this.allFacts.length;
      const nextFact = this.allFacts[this.factIndex];
      this.favFactTextObj?.setText(
        `${uiText.diploma.favoriteFactLabel} ${nextFact.text} (◄/►)`
      );
    });

    // 8. Recuadro salmón de causa de rescate y consejo positivo (nunca dice "perdiste")
    this.add.rectangle(386, 272, 374, 44, 0xe8b796);
    const summaryLine =
      this.cause === 'radiacion'
        ? uiText.diploma.rescueRadSummary
        : uiText.diploma.rescueO2Summary;
    const adviceLine =
      this.cause === 'radiacion'
        ? uiText.diploma.rescueRadAdvice
        : uiText.diploma.rescueO2Advice;

    this.add.text(208, 253, summaryLine, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '10px',
      color: '#181425',
      lineSpacing: 1,
    });
    this.add.text(208, 281, adviceLine, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '10px',
      color: '#733e39',
    });

    // 9. Botones inferiores: "Descargar diploma" y "Jugar otra vez"
    const downloadBtn = this.add
      .rectangle(286, 316, 174, 26, 0x181425)
      .setStrokeStyle(1, 0x5a6988)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(286, 316, uiText.diploma.downloadButton, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const playAgainBtn = this.add
      .rectangle(452, 316, 134, 26, 0xc0cbdc)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(452, 316, uiText.diploma.playAgainButton, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#181425',
      })
      .setOrigin(0.5);

    this.downloadFeedbackText = this.add
      .text(535, 316, '', {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '9px',
        color: '#3e8948',
      })
      .setOrigin(0, 0.5);

    downloadBtn.on('pointerdown', () => this.exportDiplomaPng());
    playAgainBtn.on('pointerdown', () => this.restartGame());
    this.input.keyboard?.once('keydown-ENTER', () => this.restartGame());
  }

  private exportDiplomaPng(): void {
    this.game.renderer.snapshot((image: HTMLImageElement | Phaser.Display.Color) => {
      if (image instanceof HTMLImageElement && typeof document !== 'undefined') {
        const a = document.createElement('a');
        a.href = image.src;
        a.download = 'diploma-luna-7-alerta-heliosfera.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        this.downloadFeedbackText?.setText('✓ PNG');
      }
    });
  }

  private restartGame(): void {
    const prevUnlocks = {
      customization: gameStore.state.unlocks.customization,
      accessories: [...gameStore.state.unlocks.accessories],
    };
    const prevCustom = { ...gameStore.state.customization };

    Save.clear();
    gameStore.reset();

    // Conservar los desbloqueos logrados para que el jugador pueda usar su traje personalizado
    gameStore.state.unlocks = prevUnlocks;
    gameStore.state.customization = prevCustom;
    Save.save(gameStore.state);

    this.scene.start('Despegue');
  }
}
