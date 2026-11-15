import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { bus } from '../state/bus';
import { gameStore } from '../state/GameState';
import { AudioSystem } from '../systems/Audio';
import { Clock } from '../systems/Clock';
import type { MinigameInput, MinigameResult } from '../types';

/**
 * Clase base para los minijuegos (sección 9.1):
 * Dibuja el marco superior con título, pasos numerados (actual en #fee761, hechos en #63c74d),
 * línea de instrucción y etiqueta "⏸ reloj en pausa".
 */
export abstract class MinigameBase extends Phaser.Scene {
  protected inputData: MinigameInput = {
    type: 'roca',
    day: 1,
    difficulty: 1,
  };

  private stepBgs: Phaser.GameObjects.Rectangle[] = [];
  private stepTexts: Phaser.GameObjects.Text[] = [];
  private instructionText!: Phaser.GameObjects.Text;
  protected failures = 0;

  init(data?: Partial<MinigameInput>): void {
    const day = data?.day ?? gameStore.state.day;
    const difficulty: 1 | 2 | 3 = day <= 3 ? 1 : day <= 9 ? 2 : 3;
    this.inputData = {
      type: data?.type ?? 'roca',
      day,
      difficulty: data?.difficulty ?? difficulty,
      zone: data?.zone,
      panelId: data?.panelId,
    };
    this.failures = 0;
  }

  protected drawHeader(title: string, steps: string[], initialInstruction: string): void {
    Clock.setPaused(gameStore.state, true);
    this.stepBgs = [];
    this.stepTexts = [];

    // Fondo marciano a escala ×2
    const ground = this.add
      .tileSprite(0, 0, 640, 360, 'ground_placeholder')
      .setOrigin(0, 0);
    ground.setTileScale(2, 2);

    // Barra superior oscura #262b44 con borde #181425 (como en s05_roca.png)
    this.add
      .rectangle(320, 20, 632, 34, 0x262b44)
      .setStrokeStyle(2, 0x181425);

    this.add.text(16, 10, title, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '16px',
      color: '#ffffff',
    });

    // Pasos numerados a la derecha
    steps.forEach((stepLabel, idx) => {
      const sx = 382 + idx * 84;
      const bg = this.add
        .rectangle(sx, 11, 80, 20, 0x5a6988)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x181425);
      const txt = this.add
        .text(sx + 40, 21, stepLabel, {
          fontFamily: 'PixelifySans, monospace',
          fontSize: '11px',
          color: '#c0cbdc',
        })
        .setOrigin(0.5);

      this.stepBgs.push(bg);
      this.stepTexts.push(txt);
    });

    // Línea de instrucción e indicador de reloj en pausa
    this.instructionText = this.add.text(16, 44, initialInstruction, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '12px',
      color: '#ffffff',
    });

    this.add
      .rectangle(562, 52, 138, 16, 0x262b44)
      .setStrokeStyle(1, 0x181425);
    this.add
      .text(562, 52, uiText.minigameRock.clockPaused, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '10px',
        color: '#c0cbdc',
      })
      .setOrigin(0.5);

    this.setActiveStep(0);
  }

  protected setActiveStep(activeIndex: number): void {
    if (activeIndex > 0) {
      AudioSystem.play('scanClick');
    }
    this.stepBgs.forEach((bg, idx) => {
      const txt = this.stepTexts[idx];
      if (idx < activeIndex) {
        bg.setFillStyle(0x63c74d);
        txt.setColor('#181425');
      } else if (idx === activeIndex) {
        bg.setFillStyle(0xfee761);
        txt.setColor('#181425');
      } else {
        bg.setFillStyle(0x5a6988);
        txt.setColor('#c0cbdc');
      }
    });
  }

  protected setInstruction(text: string): void {
    this.instructionText.setText(text);
  }

  protected completeMinigame(result: MinigameResult): void {
    if (result.ok) {
      AudioSystem.play('seal');
    }
    Clock.setPaused(gameStore.state, false);
    bus.emit('minigame:finished', result);
    this.scene.stop();
  }
}
