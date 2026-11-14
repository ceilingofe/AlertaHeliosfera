import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { gameStore } from '../state/GameState';
import { Data } from '../systems/Data';
import { Events } from '../systems/Events';
import { DialogBox } from '../ui/DialogBox';
import { MinigameBase } from './MinigameBase';

interface PipeCell {
  row: number;
  col: number;
  isOnPath: boolean;
  targetRot: number;
  currentRot: number;
  clogCount: number;
  container: Phaser.GameObjects.Container;
  pipeGraphic: Phaser.GameObjects.Graphics;
  clogBadge?: Phaser.GameObjects.Rectangle;
}

/**
 * Minijuego de Tuberías de MOXIE / Reparación de Antena (sección 9.1):
 * Cuadrícula de 4×4 (o 5×5 en dificultad 3) donde se rotan los tramos de tubería
 * para conectar: Toma de aire -> Calentador 800 °C -> MOXIE -> Tanque de O₂.
 * En dificultad >= 2 incluye un filtro tapado que se sacude antes de rotar.
 */
export class MinijuegoTuberias extends MinigameBase {
  private cells: PipeCell[] = [];
  private activeDialog: DialogBox | null = null;
  private isDone = false;
  private targetSystem: 'moxie_pipes' | 'antenna' = 'moxie_pipes';

  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('MinijuegoTuberias');
  }

  create(): void {
    this.isDone = false;
    this.cells = [];
    this.targetSystem =
      this.inputData.type === 'antenna' ? 'antenna' : 'moxie_pipes';

    const title =
      this.targetSystem === 'antenna'
        ? uiText.minigamePipes.titleAntenna
        : uiText.minigamePipes.titleMoxie;

    this.drawHeader(
      title,
      [uiText.minigamePipes.step1, uiText.minigamePipes.step2],
      uiText.minigamePipes.instRotate
    );

    if (this.input.keyboard) {
      this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    }

    const gridSize = this.inputData.difficulty >= 3 ? 5 : 4;
    const cellSize = gridSize === 5 ? 34 : 42;
    const startX = 216;
    const startY = 76;

    // Etiquetas de entrada y salida
    this.add
      .text(
        startX - 12,
        startY + cellSize / 2,
        this.targetSystem === 'antenna'
          ? uiText.minigamePipes.antennaInLabel
          : uiText.minigamePipes.inLabel,
        {
          fontFamily: 'PixelifySans, monospace',
          fontSize: '12px',
          color: '#fee761',
        }
      )
      .setOrigin(1, 0.5);

    this.add
      .text(
        startX + gridSize * cellSize + 12,
        startY + (gridSize - 0.5) * cellSize,
        this.targetSystem === 'antenna'
          ? uiText.minigamePipes.antennaOutLabel
          : uiText.minigamePipes.outLabel,
        {
          fontFamily: 'PixelifySans, monospace',
          fontSize: '12px',
          color: '#2ce8f5',
        }
      )
      .setOrigin(0, 0.5);

    // Definir camino escalonado desde (0,0) hasta (gridSize-1, gridSize-1)
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        // Camino principal: fila 0 hasta col 2, baja a última fila, va a última col
        const isOnPath =
          (r === 0 && c <= 2) ||
          (c === 2 && r >= 0 && r <= gridSize - 1) ||
          (r === gridSize - 1 && c >= 2);

        const mismatch = isOnPath && (r + c) % 2 === 1 ? 90 : 0;
        const clogCount =
          this.inputData.difficulty >= 2 && r === 1 && c === 2 ? 2 : 0;

        const cx = startX + c * cellSize + cellSize / 2;
        const cy = startY + r * cellSize + cellSize / 2;

        const tileBg = this.add
          .rectangle(0, 0, cellSize - 4, cellSize - 4, isOnPath ? 0x262b44 : 0x3a4466)
          .setStrokeStyle(2, 0x181425)
          .setInteractive({ useHandCursor: true });

        const pipeGraphic = this.add.graphics();
        this.drawPipeSegment(pipeGraphic, cellSize, isOnPath, false);
        pipeGraphic.setAngle(mismatch);

        const container = this.add.container(cx, cy, [tileBg, pipeGraphic]);

        let clogBadge: Phaser.GameObjects.Rectangle | undefined;
        if (clogCount > 0) {
          clogBadge = this.add
            .rectangle(0, 0, cellSize - 12, cellSize - 12, 0xb86f50)
            .setStrokeStyle(2, 0xfee761);
          container.add(clogBadge);
        }

        const cellObj: PipeCell = {
          row: r,
          col: c,
          isOnPath,
          targetRot: 0,
          currentRot: mismatch,
          clogCount,
          container,
          pipeGraphic,
          clogBadge,
        };

        tileBg.on('pointerdown', () => this.rotateOrUnclogCell(cellObj, cellSize));
        this.cells.push(cellObj);
      }
    }

    // Diálogo grande de Corvi con sello NASA
    this.activeDialog = new DialogBox(this, {
      mode: 'big',
      mood: 'think',
      text: uiText.minigamePipes.corviMoxie,
      source: uiText.minigamePipes.corviSource,
      label: 'ARCHIVO REAL',
    });
  }

  private drawPipeSegment(
    g: Phaser.GameObjects.Graphics,
    cellSize: number,
    isOnPath: boolean,
    connected: boolean
  ): void {
    g.clear();
    const half = (cellSize - 6) / 2;
    g.fillStyle(connected ? 0x2ce8f5 : isOnPath ? 0xc0cbdc : 0x5a6988, 1);
    g.fillRect(-half, -5, half * 2, 10);
    g.fillRect(-5, -half, 10, half * 2);
  }

  private rotateOrUnclogCell(cell: PipeCell, cellSize: number): void {
    if (this.isDone) return;

    if (cell.clogCount > 0) {
      cell.clogCount -= 1;
      this.setInstruction(uiText.minigamePipes.instBlocked);
      this.tweens.add({
        targets: cell.container,
        x: cell.container.x + 4,
        duration: 50,
        yoyo: true,
      });
      if (cell.clogCount <= 0) {
        cell.clogBadge?.destroy();
        this.setInstruction(uiText.minigamePipes.instRotate);
      }
      return;
    }

    cell.currentRot = (cell.currentRot + 90) % 180;
    cell.pipeGraphic.setAngle(cell.currentRot);

    this.checkAllConnected(cellSize);
  }

  private checkAllConnected(cellSize: number): void {
    const allReady = this.cells.every(
      (c) => !c.isOnPath || (c.clogCount === 0 && c.currentRot % 180 === c.targetRot)
    );

    if (!allReady) return;

    this.isDone = true;
    this.setActiveStep(1);

    for (const c of this.cells) {
      if (c.isOnPath) {
        this.drawPipeSegment(c.pipeGraphic, cellSize, true, true);
      }
    }

    Events.resolveMaintenanceEvent(gameStore.state, this.targetSystem);
    const factId = this.targetSystem === 'antenna' ? 'luz' : 'moxie';
    const fact = Data.getFactById(factId);
    if (!gameStore.state.learnedToday.includes(factId)) {
      gameStore.state.learnedToday.push(factId);
    }

    this.activeDialog?.destroy();
    this.activeDialog = new DialogBox(this, {
      mode: 'small',
      mood: 'proud',
      text: fact.text,
      source: fact.source,
      label: fact.label,
      autoCloseMs: 1800,
      onComplete: () => {
        this.completeMinigame({
          ok: true,
          quality: 3,
          factId,
        });
      },
    });
  }

  update(): void {
    if (
      Phaser.Input.Keyboard.JustDown(this.keySpace) ||
      Phaser.Input.Keyboard.JustDown(this.keyE)
    ) {
      if (this.isDone) {
        this.activeDialog?.advanceOrFinish();
        return;
      }
      // Con Espacio/E alinea el siguiente tramo pendiente de la ruta
      const pending = this.cells.find(
        (c) => c.isOnPath && (c.clogCount > 0 || c.currentRot % 180 !== c.targetRot)
      );
      if (pending) {
        const gridSize = this.inputData.difficulty >= 3 ? 5 : 4;
        const cellSize = gridSize === 5 ? 34 : 42;
        this.rotateOrUnclogCell(pending, cellSize);
      }
    }
  }
}
