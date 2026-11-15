import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { Data } from '../systems/Data';
import { DialogBox } from '../ui/DialogBox';
import { MinigameBase } from './MinigameBase';

type RockPhase = 'scan' | 'drill' | 'seal' | 'done';

/**
 * Minijuego de muestra de roca (fiel al storyboard s05_roca.png):
 * Paso 1 (Escanear): elegir la roca con capas y manchas de leopardo (Cheyava Falls).
 * Paso 2 (Perforar): mantener presionado sube profundidad y temperatura de la broca;
 *   soltar enfría; si llega al rojo (100 %) se rompe (1 reintento permitido).
 * Paso 3 (Sellar): tocar a tiempo en la zona verde para sellar el núcleo en el tubo.
 */
export class MinijuegoRoca extends MinigameBase {
  private phase: RockPhase = 'scan';
  private stageContainer!: Phaser.GameObjects.Container;
  private activeDialog: DialogBox | null = null;

  // Variables del Paso 2 (Perforar)
  private isDrilling = false;
  private drillDepth = 0;
  private drillHeat = 0;
  private depthBarFill?: Phaser.GameObjects.Rectangle;
  private heatBarFill?: Phaser.GameObjects.Rectangle;
  private drillBitGraphic?: Phaser.GameObjects.Rectangle;
  private statusLabel?: Phaser.GameObjects.Text;

  // Variables del Paso 3 (Sellar)
  private sealMarkerPos = 0;
  private sealMarkerDir = 1;
  private sealMarkerRect?: Phaser.GameObjects.Rectangle;
  private rockSelected = false;

  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('MinijuegoRoca');
  }

  create(): void {
    this.phase = 'scan';
    this.isDrilling = false;
    this.drillDepth = 0;
    this.drillHeat = 0;
    this.rockSelected = false;

    this.drawHeader(
      uiText.minigameRock.title,
      [
        uiText.minigameRock.step1,
        uiText.minigameRock.step2,
        uiText.minigameRock.step3,
      ],
      uiText.minigameRock.instScan
    );

    this.stageContainer = this.add.container(0, 0);

    if (this.input.keyboard) {
      this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    }

    this.buildScanStep();
  }

  private buildScanStep(): void {
    this.phase = 'scan';
    this.setActiveStep(0);
    this.setInstruction(uiText.minigameRock.instScan);
    this.stageContainer.removeAll(true);
    this.activeDialog?.destroy();
    this.activeDialog = null;

    // 1. Roca izquierda: Volcánica · lisa (escala ×6)
    const rockLeft = this.add
      .image(112, 168, 'rock_volcanic')
      .setScale(9)
      .setInteractive({ useHandCursor: true });
    const tagLeftBg = this.add
      .rectangle(104, 240, 128, 22, 0x262b44)
      .setStrokeStyle(1, 0x181425);
    const tagLeftTxt = this.add
      .text(104, 240, uiText.minigameRock.rockVolcanic, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // 2. Roca central: Con capas y manchas (lupa del escáner como en s05_roca.png)
    const scannerLensOuter = this.add
      .circle(312, 162, 58, 0xb86f50)
      .setStrokeStyle(6, 0x181425)
      .setInteractive({ useHandCursor: true });
    const scannerHandle = this.add.graphics();
    scannerHandle.lineStyle(5, 0x8b9bb4, 1);
    scannerHandle.lineBetween(356, 204, 396, 246);

    const rockCenter = this.add
      .image(312, 162, 'rock_leopard')
      .setScale(8)
      .setInteractive({ useHandCursor: true });

    const tagCenterBg = this.add
      .rectangle(312, 240, 142, 28, 0x262b44)
      .setStrokeStyle(2, 0xfee761);
    const tagCenterTxt = this.add
      .text(312, 240, uiText.minigameRock.rockLeopard, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // 3. Roca derecha: Arenisca · sin capas (escala ×6)
    const rockRight = this.add
      .image(502, 168, 'rock_sandstone')
      .setScale(9)
      .setInteractive({ useHandCursor: true });
    const tagRightBg = this.add
      .rectangle(502, 240, 134, 22, 0x262b44)
      .setStrokeStyle(1, 0x181425);
    const tagRightTxt = this.add
      .text(502, 240, uiText.minigameRock.rockSandstone, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // 4. Botón "Perforar esta roca" abajo a la derecha (s05_roca.png)
    const drillBtnBg = this.add
      .rectangle(542, 326, 176, 34, 0x181425)
      .setStrokeStyle(2, 0xe4a672)
      .setInteractive({ useHandCursor: true });
    const drillBtnTxt = this.add
      .text(542, 326, uiText.minigameRock.drillButton, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.stageContainer.add([
      rockLeft,
      tagLeftBg,
      tagLeftTxt,
      scannerHandle,
      scannerLensOuter,
      rockCenter,
      tagCenterBg,
      tagCenterTxt,
      rockRight,
      tagRightBg,
      tagRightTxt,
      drillBtnBg,
      drillBtnTxt,
    ]);

    // Diálogo grande de Corvi con placa de nombre y sello NASA (s05_roca.png)
    this.activeDialog = new DialogBox(this, {
      mode: 'big',
      mood: 'alert',
      text: uiText.minigameRock.corviFoundLeopard,
      source: 'Perseverance (2024)',
      label: 'ARCHIVO REAL',
    });

    const showWrongRock = (): void => {
      this.activeDialog?.destroy();
      this.activeDialog = new DialogBox(this, {
        mode: 'big',
        mood: 'think',
        text: uiText.minigameRock.wrongRockMsg,
      });
    };

    const selectLeopardRock = (): void => {
      this.rockSelected = true;
      this.buildDrillStep();
    };

    rockLeft.on('pointerdown', showWrongRock);
    rockRight.on('pointerdown', showWrongRock);
    rockCenter.on('pointerdown', selectLeopardRock);
    scannerLensOuter.on('pointerdown', selectLeopardRock);
    drillBtnBg.on('pointerdown', () => {
      if (this.rockSelected) {
        this.buildDrillStep();
      } else {
        this.setInstruction(uiText.minigameRock.instScan);
      }
    });
  }

  private buildDrillStep(): void {
    this.phase = 'drill';
    this.setActiveStep(1);
    this.setInstruction(uiText.minigameRock.instDrill);
    this.stageContainer.removeAll(true);
    this.activeDialog?.destroy();
    this.activeDialog = null;

    this.drillDepth = 0;
    this.drillHeat = 0;
    this.isDrilling = false;

    // Roca objetivo al centro con broca encima
    const rockImg = this.add
      .image(206, 198, 'rock_leopard')
      .setScale(10)
      .setInteractive({ useHandCursor: true });

    this.drillBitGraphic = this.add
      .rectangle(206, 122, 14, 46, 0xc0cbdc)
      .setStrokeStyle(2, 0x181425);

    const drillIcon = this.add.image(206, 92, 'icon_drill').setScale(3);

    // Panel derecho con barras de Profundidad y Temperatura de la broca
    const panel = this.add
      .rectangle(448, 184, 310, 152, 0x262b44)
      .setStrokeStyle(2, 0x181425);

    const depthTitle = this.add.text(308, 122, uiText.minigameRock.depthLabel, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '12px',
      color: '#ead4aa',
    });
    const depthBg = this.add
      .rectangle(308, 148, 280, 16, 0x3a4466)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, 0x181425);
    this.depthBarFill = this.add
      .rectangle(310, 148, 0, 12, 0x63c74d)
      .setOrigin(0, 0.5);

    const heatTitle = this.add.text(308, 174, uiText.minigameRock.heatLabel, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '12px',
      color: '#fee761',
    });
    const heatBg = this.add
      .rectangle(308, 200, 280, 16, 0x3a4466)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, 0x181425);
    // Zona roja de peligro al final de la barra de calor
    const redZone = this.add
      .rectangle(532, 200, 54, 12, 0xa22633)
      .setOrigin(0, 0.5);
    this.heatBarFill = this.add
      .rectangle(310, 200, 0, 12, 0xfeae34)
      .setOrigin(0, 0.5);

    this.statusLabel = this.add.text(308, 224, '', {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#fee761',
      wordWrap: { width: 280 },
    });

    // Botón táctil grande para mantener presionado al perforar
    const holdBtn = this.add
      .rectangle(448, 304, 240, 38, 0xf77622)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    const holdTxt = this.add
      .text(448, 304, uiText.minigameRock.drillButton, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '15px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const startHold = (): void => {
      this.isDrilling = true;
    };
    const endHold = (): void => {
      this.isDrilling = false;
    };

    holdBtn.on('pointerdown', startHold);
    holdBtn.on('pointerup', endHold);
    holdBtn.on('pointerout', endHold);
    rockImg.on('pointerdown', startHold);
    rockImg.on('pointerup', endHold);
    this.input.on('pointerup', endHold);

    this.stageContainer.add([
      rockImg,
      this.drillBitGraphic,
      drillIcon,
      panel,
      depthTitle,
      depthBg,
      this.depthBarFill,
      heatTitle,
      heatBg,
      redZone,
      this.heatBarFill,
      this.statusLabel,
      holdBtn,
      holdTxt,
    ]);
  }

  private buildSealStep(): void {
    this.phase = 'seal';
    this.setActiveStep(2);
    this.setInstruction(uiText.minigameRock.instSeal);
    this.stageContainer.removeAll(true);

    this.sealMarkerPos = 10;
    this.sealMarkerDir = 1;

    const tubePreview = this.add.image(180, 186, 'tube_full').setScale(8);

    const barPanel = this.add
      .rectangle(410, 186, 320, 120, 0x262b44)
      .setStrokeStyle(2, 0x181425);

    const zoneTitle = this.add
      .text(410, 146, uiText.minigameRock.sealZoneLabel, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '13px',
        color: '#ead4aa',
      })
      .setOrigin(0.5);

    const barTrack = this.add
      .rectangle(270, 186, 280, 22, 0x3a4466)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, 0x181425);

    // Zona verde central (32 % a 68 % del recorrido)
    const greenZone = this.add
      .rectangle(270 + 280 * 0.32, 186, 280 * 0.36, 18, 0x63c74d)
      .setOrigin(0, 0.5);

    this.sealMarkerRect = this.add
      .rectangle(270, 186, 8, 28, 0xfee761)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0x181425);

    this.statusLabel = this.add
      .text(410, 224, '', {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#fee761',
      })
      .setOrigin(0.5);

    const sealBtn = this.add
      .rectangle(410, 294, 220, 38, 0x63c74d)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });
    const sealBtnTxt = this.add
      .text(410, 294, uiText.minigameRock.sealActionButton, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '16px',
        color: '#181425',
      })
      .setOrigin(0.5);

    sealBtn.on('pointerdown', () => this.trySealTube());

    this.stageContainer.add([
      tubePreview,
      barPanel,
      zoneTitle,
      barTrack,
      greenZone,
      this.sealMarkerRect,
      this.statusLabel,
      sealBtn,
      sealBtnTxt,
    ]);
  }

  private trySealTube(): void {
    if (this.phase !== 'seal') return;

    if (this.sealMarkerPos >= 32 && this.sealMarkerPos <= 68) {
      this.phase = 'done';
      this.spawnSuccessParticles();

      const cheyavaFact = Data.getFactById('cheyava');
      this.activeDialog?.destroy();
      this.activeDialog = new DialogBox(this, {
        mode: 'small',
        mood: 'proud',
        text: cheyavaFact.text,
        source: cheyavaFact.source,
        label: cheyavaFact.label,
        autoCloseMs: 2200,
        onComplete: () => {
          this.completeMinigame({
            ok: true,
            quality: 3,
            factId: 'cheyava',
          });
        },
      });
    } else {
      this.failures += 1;
      if (this.failures >= 2) {
        this.completeMinigame({ ok: false, quality: 0 });
      } else {
        this.statusLabel?.setText(uiText.minigameRock.sealRetry);
      }
    }
  }

  private spawnSuccessParticles(): void {
    for (let i = 0; i < 14; i++) {
      const p = this.add.rectangle(
        320 + (Math.random() - 0.5) * 60,
        180 + (Math.random() - 0.5) * 40,
        5,
        5,
        i % 2 === 0 ? 0xfee761 : 0x63c74d
      );
      this.tweens.add({
        targets: p,
        x: p.x + (Math.random() - 0.5) * 120,
        y: p.y - 40 - Math.random() * 50,
        alpha: 0,
        duration: 700,
        onComplete: () => p.destroy(),
      });
    }
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    if (this.phase === 'scan') {
      if (
        Phaser.Input.Keyboard.JustDown(this.keySpace) ||
        Phaser.Input.Keyboard.JustDown(this.keyE)
      ) {
        this.setInstruction(uiText.minigameRock.instScan);
      }
      return;
    }

    if (this.phase === 'drill') {
      const keyHeld =
        (this.keySpace && this.keySpace.isDown) || (this.keyE && this.keyE.isDown);
      const activeDrill = this.isDrilling || keyHeld;

      const heatSpeed = 38 + (this.inputData.difficulty - 1) * 10;
      const coolSpeed = 48;
      const depthSpeed = 30;

      if (activeDrill) {
        this.drillDepth = Math.min(100, this.drillDepth + depthSpeed * dt);
        this.drillHeat = Math.min(100, this.drillHeat + heatSpeed * dt);
      } else {
        this.drillHeat = Math.max(0, this.drillHeat - coolSpeed * dt);
      }

      if (this.depthBarFill) {
        this.depthBarFill.width = Math.round((276 * this.drillDepth) / 100);
      }
      if (this.heatBarFill) {
        this.heatBarFill.width = Math.round((276 * this.drillHeat) / 100);
        this.heatBarFill.setFillStyle(
          this.drillHeat >= 80 ? 0xe43b44 : this.drillHeat >= 55 ? 0xf77622 : 0xfeae34
        );
      }
      if (this.drillBitGraphic) {
        this.drillBitGraphic.y = 122 + (this.drillDepth / 100) * 32;
      }

      // Si la temperatura de la broca pasa del límite (100 %), el núcleo se rompe
      if (this.drillHeat >= 100) {
        this.isDrilling = false;
        this.failures += 1;
        if (this.failures >= 2) {
          this.statusLabel?.setText(uiText.minigameRock.overheatFail);
          this.time.delayedCall(900, () => {
            this.completeMinigame({ ok: false, quality: 0 });
          });
          this.phase = 'done';
          return;
        }
        this.drillDepth = 0;
        this.drillHeat = 0;
        this.statusLabel?.setText(uiText.minigameRock.overheatRetry);
        return;
      }

      if (this.drillDepth >= 100) {
        this.buildSealStep();
      }
      return;
    }

    if (this.phase === 'seal') {
      const markerSpeed = 95 + (this.inputData.difficulty - 1) * 20;
      this.sealMarkerPos += this.sealMarkerDir * markerSpeed * dt;
      if (this.sealMarkerPos >= 100) {
        this.sealMarkerPos = 100;
        this.sealMarkerDir = -1;
      } else if (this.sealMarkerPos <= 0) {
        this.sealMarkerPos = 0;
        this.sealMarkerDir = 1;
      }

      if (this.sealMarkerRect) {
        this.sealMarkerRect.x = Math.round(270 + (280 * this.sealMarkerPos) / 100);
      }

      if (
        Phaser.Input.Keyboard.JustDown(this.keySpace) ||
        Phaser.Input.Keyboard.JustDown(this.keyE)
      ) {
        this.trySealTube();
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
