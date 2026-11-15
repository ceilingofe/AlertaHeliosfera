import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { Data } from '../systems/Data';
import { DialogBox } from '../ui/DialogBox';
import { MinigameBase } from './MinigameBase';

type SoilPhase = 'scoop' | 'sieve' | 'save' | 'done';

/**
 * Minijuego de suelo / regolito (fiel al storyboard s06_suelo.png):
 * Paso 1 (Palear): servir regolito con la pala al tamiz circular.
 * Paso 2 (Tamizar): deslizar a los lados (o usar A/D, flechas o botones) para agitar el tamiz
 *   y llenar la barra "Grano fino". En dificultad >= 2 aparecen piedras que hay que tocar para quitar.
 * Paso 3 (Guardar): guardar el grano fino en el tubo y mostrar cápsula de percloratos.
 */
export class MinijuegoSuelo extends MinigameBase {
  private phase: SoilPhase = 'scoop';
  private stageContainer!: Phaser.GameObjects.Container;
  private activeDialog: DialogBox | null = null;

  private sieveContainer!: Phaser.GameObjects.Container;
  private fineGrainProgress = 0;
  private fineBarFill?: Phaser.GameObjects.Rectangle;
  private pebblesRemaining = 0;
  private lastPointerX: number | null = null;

  private keyLeft!: Phaser.Input.Keyboard.Key;
  private keyRight!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('MinijuegoSuelo');
  }

  create(): void {
    this.phase = 'scoop';
    this.fineGrainProgress = 0;
    this.pebblesRemaining = 0;
    this.lastPointerX = null;

    this.drawHeader(
      uiText.minigameSoil.title,
      [
        uiText.minigameSoil.step1,
        uiText.minigameSoil.step2,
        uiText.minigameSoil.step3,
      ],
      uiText.minigameSoil.instScoop
    );

    this.stageContainer = this.add.container(0, 0);

    if (this.input.keyboard) {
      this.keyLeft = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
      this.keyRight = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
      this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    }

    this.buildScoopStep();
  }

  private buildScoopStep(): void {
    this.phase = 'scoop';
    this.setActiveStep(0);
    this.setInstruction(uiText.minigameSoil.instScoop);
    this.stageContainer.removeAll(true);
    this.activeDialog?.destroy();
    this.activeDialog = null;

    // Montículo de regolito marciano y pala
    const moundOuter = this.add
      .ellipse(300, 195, 220, 110, 0x733e39)
      .setStrokeStyle(3, 0x181425)
      .setInteractive({ useHandCursor: true });
    const moundInner = this.add.ellipse(300, 190, 190, 88, 0xb86f50);
    const shovelIcon = this.add.image(300, 152, 'icon_shovel').setScale(5);

    const scoopBtn = this.add
      .rectangle(300, 292, 220, 36, 0x181425)
      .setStrokeStyle(2, 0xfee761)
      .setInteractive({ useHandCursor: true });
    const scoopTxt = this.add
      .text(300, 292, uiText.minigameSoil.scoopButton, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '15px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const goNext = (): void => this.buildSieveStep();
    moundOuter.on('pointerdown', goNext);
    scoopBtn.on('pointerdown', goNext);

    this.stageContainer.add([moundOuter, moundInner, shovelIcon, scoopBtn, scoopTxt]);
  }

  private buildSieveStep(): void {
    this.phase = 'sieve';
    this.setActiveStep(1);
    this.setInstruction(uiText.minigameSoil.instSieve);
    this.stageContainer.removeAll(true);

    this.fineGrainProgress = 0;

    // 1. Tarjeta derecha "Grano fino" (fiel a s06_suelo.png)
    const cardBg = this.add
      .rectangle(454, 70, 176, 52, 0xc0cbdc)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x181425);
    const cardTitle = this.add.text(466, 78, uiText.minigameSoil.fineGrainLabel, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '12px',
      color: '#181425',
    });
    const barTrack = this.add
      .rectangle(466, 102, 154, 10, 0x3a4466)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x181425);
    this.fineBarFill = this.add
      .rectangle(467, 102, 0, 8, 0xe4a672)
      .setOrigin(0, 0.5);

    // 2. Flechas amarillas laterales ◄ y ► (s06_suelo.png)
    const leftArrow = this.add
      .triangle(64, 186, 0, 10, 18, 0, 18, 20, 0xfee761)
      .setInteractive({ useHandCursor: true });
    const rightArrow = this.add
      .triangle(540, 186, 0, 0, 0, 20, 18, 10, 0xfee761)
      .setInteractive({ useHandCursor: true });

    leftArrow.on('pointerdown', () => this.shakeSieve(-16));
    rightArrow.on('pointerdown', () => this.shakeSieve(16));

    // 3. Tamiz circular en el centro con malla cuadriculada (#5a6988 / #3a4466) y borde #8b9bb4 / #181425
    this.sieveContainer = this.add.container(300, 188);
    const rimOuter = this.add
      .ellipse(0, 0, 280, 174, 0x8b9bb4)
      .setStrokeStyle(5, 0x181425)
      .setInteractive({ useHandCursor: true });
    const meshBg = this.add
      .ellipse(0, 0, 244, 146, 0x5a6988)
      .setStrokeStyle(2, 0x3a4466);

    const meshLines = this.add.graphics();
    meshLines.lineStyle(1, 0x3a4466, 0.9);
    for (let x = -100; x <= 100; x += 10) {
      meshLines.lineBetween(x, -64, x, 64);
    }
    for (let y = -56; y <= 56; y += 10) {
      meshLines.lineBetween(-108, y, 108, y);
    }

    // Granos de regolito dentro del tamiz
    const grains = this.add.graphics();
    const grainPositions = [
      { x: -76, y: -22, c: 0x733e39 },
      { x: -48, y: 12, c: 0xb86f50 },
      { x: -24, y: -6, c: 0xd77643 },
      { x: 12, y: -12, c: 0xb86f50 },
      { x: 24, y: 28, c: 0xd77643 },
      { x: 48, y: -20, c: 0x733e39 },
      { x: 74, y: 36, c: 0xd77643 },
      { x: -12, y: 42, c: 0xb86f50 },
    ];
    for (const gp of grainPositions) {
      grains.fillStyle(gp.c, 1);
      grains.fillRect(gp.x, gp.y, 9, 7);
    }

    this.sieveContainer.add([rimOuter, meshBg, meshLines, grains]);

    // En dificultad >= 2 agregamos piedras grandes que hay que tocar para quitar
    this.pebblesRemaining = this.inputData.difficulty >= 2 ? 2 : 0;
    if (this.pebblesRemaining > 0) {
      this.setInstruction(uiText.minigameSoil.removePebbleHint);
      for (let i = 0; i < this.pebblesRemaining; i++) {
        const px = -35 + i * 70;
        const py = -8 + i * 16;
        const pebble = this.add
          .image(px, py, 'rock_volcanic')
          .setScale(4)
          .setInteractive({ useHandCursor: true });
        pebble.on('pointerdown', () => {
          pebble.destroy();
          this.pebblesRemaining = Math.max(0, this.pebblesRemaining - 1);
          if (this.pebblesRemaining === 0) {
            this.setInstruction(uiText.minigameSoil.instSieve);
          }
        });
        this.sieveContainer.add(pebble);
      }
    }

    // Arrastrar o deslizar a los lados agita el tamiz
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.phase !== 'sieve') return;
      if (this.lastPointerX !== null) {
        const dx = pointer.worldX - this.lastPointerX;
        if (Math.abs(dx) >= 6) {
          this.shakeSieve(dx > 0 ? 10 : -10, Math.min(8, Math.abs(dx) * 0.25));
          this.lastPointerX = pointer.worldX;
        }
      } else {
        this.lastPointerX = pointer.worldX;
      }
    });

    rimOuter.on('pointerdown', () => {
      this.shakeSieve(this.sieveContainer.x >= 300 ? -14 : 14, 12);
    });

    // 4. Diálogo grande de Corvi con sello NASA (s06_suelo.png)
    this.activeDialog = new DialogBox(this, {
      mode: 'big',
      mood: 'neutral',
      text: uiText.minigameSoil.corviPerchlorates,
      source: uiText.minigameSoil.corviSource,
      label: 'ARCHIVO REAL',
    });

    this.stageContainer.add([
      cardBg,
      cardTitle,
      barTrack,
      this.fineBarFill,
      leftArrow,
      rightArrow,
      this.sieveContainer,
    ]);
  }

  private shakeSieve(offsetX: number, amount = 14): void {
    if (this.phase !== 'sieve') return;
    if (this.pebblesRemaining > 0) {
      this.setInstruction(uiText.minigameSoil.removePebbleHint);
      return;
    }

    this.sieveContainer.x = 300 + offsetX;
    this.tweens.add({
      targets: this.sieveContainer,
      x: 300,
      duration: 90,
    });

    const difficultyFactor = this.inputData.difficulty === 1 ? 1 : 0.78;
    this.fineGrainProgress = Math.min(
      100,
      this.fineGrainProgress + amount * difficultyFactor
    );

    if (this.fineBarFill) {
      this.fineBarFill.width = Math.round((152 * this.fineGrainProgress) / 100);
    }

    if (this.fineGrainProgress >= 100) {
      this.buildSaveStep();
    }
  }

  private buildSaveStep(): void {
    this.phase = 'save';
    this.setActiveStep(2);
    this.setInstruction(uiText.minigameSoil.instSave);
    this.stageContainer.removeAll(true);
    this.activeDialog?.destroy();
    this.activeDialog = null;

    const tubeImg = this.add.image(250, 186, 'tube_full').setScale(8);

    const saveBtn = this.add
      .rectangle(410, 186, 220, 42, 0x63c74d)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    const saveTxt = this.add
      .text(410, 186, uiText.minigameSoil.saveButton, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '15px',
        color: '#181425',
      })
      .setOrigin(0.5);

    saveBtn.on('pointerdown', () => this.finishSoilSample());

    this.stageContainer.add([tubeImg, saveBtn, saveTxt]);
  }

  private finishSoilSample(): void {
    if (this.phase === 'done') return;
    this.phase = 'done';

    const fact = Data.getFactById('percloratos');
    this.activeDialog = new DialogBox(this, {
      mode: 'small',
      mood: 'proud',
      text: fact.text,
      source: fact.source,
      label: fact.label,
      autoCloseMs: 2000,
      onComplete: () => {
        this.completeMinigame({
          ok: true,
          quality: 3,
          factId: 'percloratos',
        });
      },
    });
  }

  update(): void {
    if (this.phase === 'scoop') {
      if (
        Phaser.Input.Keyboard.JustDown(this.keySpace) ||
        Phaser.Input.Keyboard.JustDown(this.keyE)
      ) {
        this.buildSieveStep();
      }
      return;
    }

    if (this.phase === 'sieve') {
      if (
        Phaser.Input.Keyboard.JustDown(this.keyLeft) ||
        Phaser.Input.Keyboard.JustDown(this.keyA)
      ) {
        this.shakeSieve(-16, 15);
      } else if (
        Phaser.Input.Keyboard.JustDown(this.keyRight) ||
        Phaser.Input.Keyboard.JustDown(this.keyD) ||
        Phaser.Input.Keyboard.JustDown(this.keySpace) ||
        Phaser.Input.Keyboard.JustDown(this.keyE)
      ) {
        this.shakeSieve(16, 15);
      }
      return;
    }

    if (this.phase === 'save') {
      if (
        Phaser.Input.Keyboard.JustDown(this.keySpace) ||
        Phaser.Input.Keyboard.JustDown(this.keyE)
      ) {
        this.finishSoilSample();
      }
      return;
    }

    if (this.phase === 'done') {
      if (
        Phaser.Input.Keyboard.JustDown(this.keySpace) ||
        Phaser.Input.Keyboard.JustDown(this.keyE)
      ) {
        this.activeDialog?.advanceOrFinish();
      }
    }
  }
}
