import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { Data } from '../systems/Data';
import { DialogBox } from '../ui/DialogBox';
import { MinigameBase } from './MinigameBase';

type AirPhase = 'connect' | 'fill' | 'done';

/**
 * Minijuego de muestra de aire (fiel al storyboard s08_aire.png):
 * Paso 1 (Conectar): conectar el cilindro metálico con válvula roja al manómetro.
 * Paso 2 (Llenar) y Paso 3 (Cerrar): mantener abierta la válvula hasta que la aguja roja
 *   del manómetro esté en la zona verde (~6 milibares) y soltar a tiempo.
 */
export class MinijuegoAire extends MinigameBase {
  private phase: AirPhase = 'connect';
  private stageContainer!: Phaser.GameObjects.Container;
  private activeDialog: DialogBox | null = null;

  private isValveHeld = false;
  private needleProgress = 0; // 0 a 100
  private needleGraphics?: Phaser.GameObjects.Graphics;
  private statusText?: Phaser.GameObjects.Text;

  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('MinijuegoAire');
  }

  create(): void {
    this.phase = 'connect';
    this.isValveHeld = false;
    this.needleProgress = 0;

    this.drawHeader(
      uiText.minigameAir.title,
      [
        uiText.minigameAir.step1,
        uiText.minigameAir.step2,
        uiText.minigameAir.step3,
      ],
      uiText.minigameAir.instConnect
    );

    this.stageContainer = this.add.container(0, 0);

    if (this.input.keyboard) {
      this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    }

    this.buildGaugeLayout();
  }

  private buildGaugeLayout(): void {
    this.stageContainer.removeAll(true);
    this.activeDialog?.destroy();
    this.activeDialog = null;

    // 1. Cilindro metálico izquierdo con válvula roja superior (s08_aire.png)
    const valveWheel = this.add
      .ellipse(171, 88, 92, 36, 0xe43b44)
      .setStrokeStyle(3, 0x181425)
      .setInteractive({ useHandCursor: true });
    const valveLine = this.add.rectangle(171, 88, 62, 4, 0xa22633);
    const valveNeck = this.add
      .rectangle(171, 114, 52, 22, 0x8b9bb4)
      .setStrokeStyle(3, 0x181425);
    const tankBody = this.add
      .rectangle(171, 212, 100, 176, 0xc0cbdc)
      .setStrokeStyle(4, 0x181425)
      .setInteractive({ useHandCursor: true });
    const tankHighlight = this.add.rectangle(133, 212, 18, 168, 0xffffff);

    // Tubo conector negro hacia el manómetro
    const pipe = this.add.rectangle(262, 200, 84, 6, 0x181425);

    // 2. Manómetro circular blanco con marcas y zona verde (~6 milibares, s08_aire.png)
    const gaugeX = 402;
    const gaugeY = 192;
    const gaugeOuter = this.add
      .circle(gaugeX, gaugeY, 106, 0xffffff)
      .setStrokeStyle(5, 0x181425)
      .setInteractive({ useHandCursor: true });

    const gaugeDetails = this.add.graphics();
    // Arco verde en el cuadrante superior izquierdo (progreso 34..62)
    gaugeDetails.lineStyle(14, 0x63c74d, 1);
    gaugeDetails.beginPath();
    gaugeDetails.arc(
      gaugeX,
      gaugeY,
      82,
      Phaser.Math.DegToRad(200),
      Phaser.Math.DegToRad(246),
      false
    );
    gaugeDetails.strokePath();

    // Marcas del reloj del manómetro
    gaugeDetails.lineStyle(2, 0x181425, 1);
    for (let deg = 150; deg <= 390; deg += 20) {
      const rad = Phaser.Math.DegToRad(deg);
      const x1 = gaugeX + Math.cos(rad) * 84;
      const y1 = gaugeY + Math.sin(rad) * 84;
      const x2 = gaugeX + Math.cos(rad) * 96;
      const y2 = gaugeY + Math.sin(rad) * 96;
      gaugeDetails.lineBetween(x1, y1, x2, y2);
    }

    const gaugeLabel = this.add
      .text(gaugeX, gaugeY + 72, uiText.minigameAir.gaugeUnit, {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '13px',
        color: '#181425',
      })
      .setOrigin(0.5);

    this.needleGraphics = this.add.graphics();
    const centerPin = this.add.circle(gaugeX, gaugeY, 9, 0x181425);

    // 3. Tarjeta derecha "Aire de Marte" (CO2 95 %, N2 3 %, Ar 2 %, Tierra vs Marte, s08_aire.png)
    const airCard = this.add
      .rectangle(496, 70, 136, 122, 0xc0cbdc)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x181425);
    const cardTitle = this.add.text(506, 77, uiText.minigameAir.cardTitle, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#181425',
    });

    const co2Txt = this.add.text(506, 98, `${uiText.minigameAir.co2Label}`, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#181425',
    });
    const co2Bar = this.add
      .rectangle(536, 104, 80, 8, 0xb86f50)
      .setOrigin(0, 0.5);
    const co2Val = this.add
      .text(626, 98, '95 %', {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#181425',
      })
      .setOrigin(1, 0);

    const n2Txt = this.add.text(506, 118, `${uiText.minigameAir.n2Label}`, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#181425',
    });
    const n2Bar = this.add.rectangle(536, 124, 5, 8, 0x8b9bb4).setOrigin(0, 0.5);
    const n2Val = this.add
      .text(626, 118, '3 %', {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#181425',
      })
      .setOrigin(1, 0);

    const arTxt = this.add.text(506, 138, `${uiText.minigameAir.arLabel}`, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '11px',
      color: '#181425',
    });
    const arBar = this.add.rectangle(536, 144, 4, 8, 0xb55088).setOrigin(0, 0.5);
    const arVal = this.add
      .text(626, 138, '2 %', {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '11px',
        color: '#181425',
      })
      .setOrigin(1, 0);

    const pressTxt = this.add.text(506, 160, uiText.minigameAir.pressureComp, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '10px',
      color: '#5a6988',
      lineSpacing: 2,
    });

    this.statusText = this.add
      .text(540, 224, '', {
        fontFamily: 'PixelifySans, monospace',
        fontSize: '10px',
        color: '#fee761',
        wordWrap: { width: 170 },
      })
      .setOrigin(0.5);

    const onDown = (): void => {
      if (this.phase === 'connect') {
        this.phase = 'fill';
        this.setActiveStep(1);
        this.setInstruction(uiText.minigameAir.instFill);
      }
      if (this.phase === 'fill') {
        this.isValveHeld = true;
      }
    };

    const onUp = (): void => {
      if (this.phase === 'fill' && this.isValveHeld) {
        this.isValveHeld = false;
        this.evaluateValveRelease();
      }
    };

    valveWheel.on('pointerdown', onDown);
    tankBody.on('pointerdown', onDown);
    gaugeOuter.on('pointerdown', onDown);
    this.input.on('pointerup', onUp);

    // 4. Diálogo grande de Corvi con sello NASA (s08_aire.png)
    this.activeDialog = new DialogBox(this, {
      mode: 'big',
      mood: 'happy',
      text: uiText.minigameAir.corviAir,
      source: uiText.minigameAir.corviSource,
      label: 'ARCHIVO REAL',
    });

    this.stageContainer.add([
      tankBody,
      tankHighlight,
      valveNeck,
      valveWheel,
      valveLine,
      pipe,
      gaugeOuter,
      gaugeDetails,
      gaugeLabel,
      this.needleGraphics,
      centerPin,
      airCard,
      cardTitle,
      co2Txt,
      co2Bar,
      co2Val,
      n2Txt,
      n2Bar,
      n2Val,
      arTxt,
      arBar,
      arVal,
      pressTxt,
      this.statusText,
    ]);

    this.drawNeedle();
  }

  private drawNeedle(): void {
    if (!this.needleGraphics) return;
    this.needleGraphics.clear();

    const gaugeX = 402;
    const gaugeY = 192;
    // Progreso 0..100 mapea a 150..360 grados (zona verde 200..246 grados = progreso 23..46)
    const angleDeg = 150 + (this.needleProgress / 100) * 210;
    const rad = Phaser.Math.DegToRad(angleDeg);

    this.needleGraphics.lineStyle(5, 0xe43b44, 1);
    this.needleGraphics.lineBetween(
      gaugeX,
      gaugeY,
      gaugeX + Math.cos(rad) * 76,
      gaugeY + Math.sin(rad) * 76
    );
  }

  private evaluateValveRelease(): void {
    // Zona verde corresponde a progreso entre 22 y 48
    const minGreen = this.inputData.difficulty >= 2 ? 25 : 20;
    const maxGreen = this.inputData.difficulty >= 2 ? 45 : 50;

    if (this.needleProgress >= minGreen && this.needleProgress <= maxGreen) {
      this.phase = 'done';
      this.setActiveStep(2);

      const fact = Data.getFactById('aire');
      this.activeDialog?.destroy();
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
            factId: 'aire',
          });
        },
      });
    } else {
      this.failures += 1;
      if (this.failures >= 2) {
        this.completeMinigame({ ok: false, quality: 0 });
      } else {
        this.needleProgress = 0;
        this.drawNeedle();
        this.statusText?.setText(uiText.minigameAir.retryMsg);
      }
    }
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    if (this.phase === 'connect') {
      if (
        Phaser.Input.Keyboard.JustDown(this.keySpace) ||
        Phaser.Input.Keyboard.JustDown(this.keyE)
      ) {
        this.phase = 'fill';
        this.setActiveStep(1);
        this.setInstruction(uiText.minigameAir.instFill);
      }
      return;
    }

    if (this.phase === 'fill') {
      const keyDown =
        (this.keySpace && this.keySpace.isDown) || (this.keyE && this.keyE.isDown);

      if (keyDown && !this.isValveHeld) {
        this.isValveHeld = true;
      } else if (
        !keyDown &&
        this.isValveHeld &&
        !this.input.activePointer.isDown
      ) {
        this.isValveHeld = false;
        this.evaluateValveRelease();
        return;
      }

      if (this.isValveHeld) {
        const speed = 36 + (this.inputData.difficulty - 1) * 10;
        this.needleProgress = Math.min(100, this.needleProgress + speed * dt);
        this.drawNeedle();

        if (this.needleProgress >= 100) {
          this.isValveHeld = false;
          this.evaluateValveRelease();
        }
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
