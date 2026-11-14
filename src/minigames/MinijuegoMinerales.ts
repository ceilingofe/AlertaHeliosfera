import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { Data } from '../systems/Data';
import { DialogBox } from '../ui/DialogBox';
import { MinigameBase } from './MinigameBase';

type MineralsPhase = 'scan' | 'extract' | 'seal' | 'done';

/**
 * Minijuego de minerales hidratados (fiel al storyboard s07_minerales.png):
 * Paso 1 (Escanear): alternar entre los filtros 1 UV, 2 IR y 3 RX (teclas 1, 2, 3 o botones)
 *   y mover la franja cian del escáner sobre la roca hasta encender las vetas con agua ("¡clic!").
 * Paso 2 (Extraer veta): tocar los nodos brillantes de la veta antes de que baje la batería.
 * Paso 3 (Sellar): sellar la muestra en el tubo y mostrar cápsula científica de Perseverance.
 */
export class MinijuegoMinerales extends MinigameBase {
  private phase: MineralsPhase = 'scan';
  private stageContainer!: Phaser.GameObjects.Container;
  private activeDialog: DialogBox | null = null;

  private activeFilter: 1 | 2 | 3 = 1;
  private targetFilter: 1 | 2 | 3 = 1;
  private filterBtnBgs: Phaser.GameObjects.Rectangle[] = [];
  private filterBtnTexts: Phaser.GameObjects.Text[] = [];

  private scannerBeam!: Phaser.GameObjects.Container;
  private waterBarFill?: Phaser.GameObjects.Rectangle;
  private clickPopupText?: Phaser.GameObjects.Text;

  private batteryRemaining = 100;
  private batteryBarFill?: Phaser.GameObjects.Rectangle;
  private nodesRemaining = 0;

  private key1!: Phaser.Input.Keyboard.Key;
  private key2!: Phaser.Input.Keyboard.Key;
  private key3!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('MinijuegoMinerales');
  }

  create(): void {
    this.phase = 'scan';
    this.activeFilter = 1;
    // En día <= 3 el filtro 1 UV ilumina la veta inmediatamente como en s07_minerales.png;
    // en dificultad >= 2 el filtro correcto es 2 IR.
    this.targetFilter = this.inputData.difficulty >= 2 ? 2 : 1;

    this.drawHeader(
      uiText.minigameMinerals.title,
      [
        uiText.minigameMinerals.step1,
        uiText.minigameMinerals.step2,
        uiText.minigameMinerals.step3,
      ],
      uiText.minigameMinerals.instScan
    );

    this.stageContainer = this.add.container(0, 0);

    if (this.input.keyboard) {
      this.key1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
      this.key2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
      this.key3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
      this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    }

    this.buildScanStep();
  }

  private buildScanStep(): void {
    this.phase = 'scan';
    this.setActiveStep(0);
    this.setInstruction(uiText.minigameMinerals.instScan);
    this.stageContainer.removeAll(true);
    this.activeDialog?.destroy();
    this.activeDialog = null;
    this.filterBtnBgs = [];
    this.filterBtnTexts = [];

    // 1. Losa de roca rojiza en el centro con vetas claras onduladas (s07_minerales.png)
    const rockSlab = this.add
      .rectangle(300, 198, 318, 196, 0xb86f50)
      .setStrokeStyle(4, 0x181425)
      .setInteractive({ useHandCursor: true });

    const veins = this.add.graphics();
    this.drawWavyVeins(veins);

    // 2. Franja vertical cian del escáner (#2ce8f5) con chispas amarillas (s07_minerales.png)
    this.scannerBeam = this.add.container(350, 192);
    const beamLines = this.add.graphics();
    beamLines.lineStyle(2, 0x2ce8f5, 1);
    beamLines.strokeRect(-30, -110, 60, 210);
    for (let y = -100; y <= 96; y += 14) {
      beamLines.lineBetween(-30, y, 30, y);
    }
    // Puntos amarillos de resonancia dentro de la veta
    beamLines.fillStyle(0xfee761, 1);
    beamLines.fillRect(-10, 12, 4, 4);
    beamLines.fillRect(8, 28, 4, 4);
    beamLines.fillRect(-16, 40, 4, 4);
    this.scannerBeam.add(beamLines);

    this.clickPopupText = this.add.text(422, 168, uiText.minigameMinerals.clickPopup, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '14px',
      color: '#fee761',
    });

    // 3. Tarjeta superior derecha "Agua en la veta" (s07_minerales.png)
    const waterCard = this.add
      .rectangle(496, 70, 136, 92, 0xc0cbdc)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x181425);
    const waterTitle = this.add.text(508, 80, uiText.minigameMinerals.waterLabel, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '12px',
      color: '#181425',
    });
    const waterTrack = this.add
      .rectangle(508, 102, 114, 10, 0x3a4466)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x181425);
    this.waterBarFill = this.add
      .rectangle(509, 102, 64, 8, 0x2ce8f5)
      .setOrigin(0, 0.5);
    const clayText = this.add.text(508, 116, uiText.minigameMinerals.claySub, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#5a6988',
      lineSpacing: 2,
    });

    // 4. Tarjeta media derecha "Filtro de luz" con botones 1 UV, 2 IR, 3 RX (s07_minerales.png)
    const filterCard = this.add
      .rectangle(496, 186, 136, 66, 0xc0cbdc)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x181425);
    const filterTitle = this.add.text(508, 194, uiText.minigameMinerals.filterTitle, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#181425',
    });

    const filterLabels = [
      uiText.minigameMinerals.filter1,
      uiText.minigameMinerals.filter2,
      uiText.minigameMinerals.filter3,
    ];
    filterLabels.forEach((lbl, idx) => {
      const fNum = (idx + 1) as 1 | 2 | 3;
      const fx = 508 + idx * 38;
      const btnBg = this.add
        .rectangle(fx, 214, 34, 26, 0x124e89)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      const btnTxt = this.add
        .text(fx + 17, 227, lbl, {
          fontFamily: 'PixelifySans, monospace',
          fontSize: '11px',
          color: '#ffffff',
        })
        .setOrigin(0.5);

      btnBg.on('pointerdown', () => this.selectFilter(fNum));
      this.filterBtnBgs.push(btnBg);
      this.filterBtnTexts.push(btnTxt);
    });

    // Botón para pasar al paso 2 cuando el filtro correcto está activo
    const extractBtn = this.add
      .rectangle(564, 272, 136, 28, 0x181425)
      .setStrokeStyle(2, 0x2ce8f5)
      .setInteractive({ useHandCursor: true });
    const extractTxt = this.add
      .text(564, 272, uiText.minigameMinerals.extractButton, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '10px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const tryAdvance = (): void => {
      if (this.activeFilter !== this.targetFilter) {
        this.setInstruction(uiText.minigameMinerals.wrongFilterHint);
        return;
      }
      this.buildExtractStep();
    };

    rockSlab.on('pointerdown', tryAdvance);
    extractBtn.on('pointerdown', tryAdvance);

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.phase === 'scan') {
        this.scannerBeam.x = Phaser.Math.Clamp(p.x, 180, 420);
      }
    });

    // 5. Diálogo grande de Corvi con sello NASA (s07_minerales.png)
    this.activeDialog = new DialogBox(this, {
      mode: 'big',
      mood: 'think',
      text: uiText.minigameMinerals.corviWater,
      source: uiText.minigameMinerals.corviSource,
      label: 'ARCHIVO REAL',
    });

    this.stageContainer.add([
      rockSlab,
      veins,
      this.scannerBeam,
      this.clickPopupText,
      waterCard,
      waterTitle,
      waterTrack,
      this.waterBarFill,
      clayText,
      filterCard,
      filterTitle,
      ...this.filterBtnBgs,
      ...this.filterBtnTexts,
      extractBtn,
      extractTxt,
    ]);

    this.refreshFilterButtons();
  }

  private drawWavyVeins(g: Phaser.GameObjects.Graphics): void {
    g.lineStyle(3, 0xc0cbdc, 1);
    const rows = [156, 206, 256];
    for (const ry of rows) {
      g.beginPath();
      for (let x = 156; x <= 444; x += 12) {
        const y = ry + Math.sin((x - 156) * 0.045) * 9;
        if (x === 156) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
    }
  }

  private selectFilter(filter: 1 | 2 | 3): void {
    this.activeFilter = filter;
    this.refreshFilterButtons();
  }

  private refreshFilterButtons(): void {
    const isCorrect = this.activeFilter === this.targetFilter;
    this.filterBtnBgs.forEach((bg, idx) => {
      const selected = idx + 1 === this.activeFilter;
      bg.setFillStyle(selected ? 0x124e89 : 0xc0cbdc);
      this.filterBtnTexts[idx].setColor(selected ? '#ffffff' : '#181425');
    });

    if (this.clickPopupText) {
      this.clickPopupText.setVisible(isCorrect);
    }
    if (this.waterBarFill) {
      this.waterBarFill.width = isCorrect ? 78 : 22;
    }
  }

  private buildExtractStep(): void {
    this.phase = 'extract';
    this.setActiveStep(1);
    this.setInstruction(uiText.minigameMinerals.instExtract);
    this.stageContainer.removeAll(true);
    this.activeDialog?.destroy();
    this.activeDialog = null;

    this.batteryRemaining = 100;

    const rockSlab = this.add
      .rectangle(260, 198, 320, 190, 0xb86f50)
      .setStrokeStyle(4, 0x181425);
    const veins = this.add.graphics();
    this.drawWavyVeins(veins);

    // Panel derecho de batería del escáner
    const batCard = this.add
      .rectangle(460, 120, 160, 64, 0x262b44)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x181425);
    const batTitle = this.add.text(472, 130, uiText.minigameMinerals.batteryLabel, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#fee761',
    });
    const batTrack = this.add
      .rectangle(472, 156, 136, 12, 0x3a4466)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x181425);
    this.batteryBarFill = this.add
      .rectangle(473, 156, 134, 10, 0x2ce8f5)
      .setOrigin(0, 0.5);

    this.stageContainer.add([rockSlab, veins, batCard, batTitle, batTrack, this.batteryBarFill]);

    // 4 nodos brillantes a lo largo de la veta hidratada
    const nodeCoords = [
      { x: 185, y: 202 },
      { x: 240, y: 196 },
      { x: 300, y: 212 },
      { x: 360, y: 200 },
    ];
    this.nodesRemaining = nodeCoords.length;

    nodeCoords.forEach((nc) => {
      const nodeCircle = this.add
        .circle(nc.x, nc.y, 14, 0x2ce8f5, 0.9)
        .setStrokeStyle(2, 0xfee761)
        .setInteractive({ useHandCursor: true });

      nodeCircle.on('pointerdown', () => {
        if (!nodeCircle.active) return;
        nodeCircle.destroy();
        this.nodesRemaining -= 1;
        if (this.nodesRemaining <= 0) {
          this.buildSealStep();
        }
      });

      this.stageContainer.add(nodeCircle);
    });
  }

  private buildSealStep(): void {
    this.phase = 'seal';
    this.setActiveStep(2);
    this.setInstruction(uiText.minigameMinerals.instSeal);
    this.stageContainer.removeAll(true);

    const tubeImg = this.add.image(230, 186, 'tube_full').setScale(8);

    const sealBtn = this.add
      .rectangle(400, 186, 220, 42, 0x63c74d)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    const sealTxt = this.add
      .text(400, 186, uiText.minigameMinerals.sealButton, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '16px',
        color: '#181425',
      })
      .setOrigin(0.5);

    sealBtn.on('pointerdown', () => this.finishMinerals());

    this.stageContainer.add([tubeImg, sealBtn, sealTxt]);
  }

  private finishMinerals(): void {
    if (this.phase === 'done') return;
    this.phase = 'done';

    const fact = Data.getFactById('agua_rocas');
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
          factId: 'agua_rocas',
        });
      },
    });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    if (this.phase === 'scan') {
      if (Phaser.Input.Keyboard.JustDown(this.key1)) this.selectFilter(1);
      if (Phaser.Input.Keyboard.JustDown(this.key2)) this.selectFilter(2);
      if (Phaser.Input.Keyboard.JustDown(this.key3)) this.selectFilter(3);

      if (
        Phaser.Input.Keyboard.JustDown(this.keySpace) ||
        Phaser.Input.Keyboard.JustDown(this.keyE)
      ) {
        if (this.activeFilter === this.targetFilter) {
          this.buildExtractStep();
        } else {
          this.selectFilter(this.targetFilter);
        }
      }
      return;
    }

    if (this.phase === 'extract') {
      const drainRate = 10 + (this.inputData.difficulty - 1) * 5;
      this.batteryRemaining = Math.max(0, this.batteryRemaining - drainRate * dt);
      if (this.batteryBarFill) {
        this.batteryBarFill.width = Math.round((134 * this.batteryRemaining) / 100);
      }

      if (
        Phaser.Input.Keyboard.JustDown(this.keySpace) ||
        Phaser.Input.Keyboard.JustDown(this.keyE)
      ) {
        this.buildSealStep();
        return;
      }

      if (this.batteryRemaining <= 0) {
        this.failures += 1;
        if (this.failures >= 2) {
          this.completeMinigame({ ok: false, quality: 0 });
        } else {
          this.batteryRemaining = 100;
          this.setInstruction(uiText.minigameMinerals.batteryRetry);
        }
      }
      return;
    }

    if (this.phase === 'seal') {
      if (
        Phaser.Input.Keyboard.JustDown(this.keySpace) ||
        Phaser.Input.Keyboard.JustDown(this.keyE)
      ) {
        this.finishMinerals();
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
