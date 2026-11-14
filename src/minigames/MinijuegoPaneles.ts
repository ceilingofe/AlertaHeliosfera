import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { gameStore } from '../state/GameState';
import { Data } from '../systems/Data';
import { Events } from '../systems/Events';
import { DialogBox } from '../ui/DialogBox';
import { MinigameBase } from './MinigameBase';

/**
 * Minijuego de limpiar paneles solares (fiel al storyboard s09_polvo.png):
 * Panel limpio a la izquierda, panel con parches de polvo marciano a la derecha,
 * barra superior "⚡ Energía de la base" subiendo en vivo al raspar/barrer las celdas,
 * astronauta con brocha en el centro y Corvi con cápsula de la misión InSight (2022).
 */
export class MinijuegoPaneles extends MinigameBase {
  private dustCells: Phaser.GameObjects.Rectangle[] = [];
  private energyBarFill!: Phaser.GameObjects.Rectangle;
  private activeDialog: DialogBox | null = null;
  private isDone = false;

  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('MinijuegoPaneles');
  }

  create(): void {
    this.isDone = false;
    this.dustCells = [];

    this.drawHeader(
      uiText.minigamePanels.title,
      [uiText.minigamePanels.step1],
      uiText.minigamePanels.instBrush
    );

    if (this.input.keyboard) {
      this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    }

    // 1. Panel superior "⚡ Energía de la base" (fiel a s09_polvo.png)
    const energyBox = this.add
      .rectangle(248, 66, 240, 42, 0xc0cbdc)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x181425);
    const boltIcon = this.add.image(262, 78, 'icon_bolt').setScale(2);
    const energyTitle = this.add.text(274, 71, uiText.minigamePanels.energyTitle, {
      fontFamily: 'PixelifySans, monospace',
      fontSize: '12px',
      color: '#181425',
    });
    const energyTrack = this.add
      .rectangle(260, 94, 216, 10, 0x3a4466)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x181425);
    this.energyBarFill = this.add
      .rectangle(261, 94, 140, 8, 0xfee761)
      .setOrigin(0, 0.5);

    void energyBox;
    void boltIcon;
    void energyTitle;
    void energyTrack;

    // 2. Panel solar izquierdo (limpio, 5×4 celdas azules #124e89 / #0099db)
    this.drawSolarPanelStructure(40, 118, false);

    // 3. Panel solar derecho (con parches de polvo marciano para barrer, s09_polvo.png)
    this.drawSolarPanelStructure(382, 118, true);

    // 4. Astronauta con brocha junto al panel derecho (s09_polvo.png)
    const hairKey =
      gameStore.state.customization.hair === 2
        ? 'astronaut_mini_hair2'
        : 'astronaut_mini_hair1';
    this.add.image(356, 186, hairKey).setScale(2);
    this.add.image(374, 178, 'icon_brush').setScale(2.5);

    // 5. Diálogo grande de Corvi con sello NASA (s09_polvo.png)
    this.activeDialog = new DialogBox(this, {
      mode: 'big',
      mood: 'happy',
      text: uiText.minigamePanels.corviInsight,
      source: uiText.minigamePanels.corviSource,
      label: 'ARCHIVO REAL',
    });

    // Pasar el puntero o el dedo por encima de las celdas barre el polvo como tarjeta de rasca
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.isDone) return;
      for (const cell of this.dustCells) {
        if (!cell.active) continue;
        const bounds = cell.getBounds();
        if (bounds.contains(p.x, p.y)) {
          this.cleanCell(cell);
        }
      }
    });
  }

  private drawSolarPanelStructure(x: number, y: number, withDust: boolean): void {
    // Marco exterior #181425 e interior #c0cbdc
    this.add.rectangle(x, y, 214, 134, 0x181425).setOrigin(0, 0);
    this.add.rectangle(x + 4, y + 6, 206, 122, 0xc0cbdc).setOrigin(0, 0);

    // Patas de soporte
    this.add
      .rectangle(x + 32, y + 134, 36, 14, 0x5a6988)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x181425);
    this.add
      .rectangle(x + 146, y + 134, 36, 14, 0x5a6988)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x181425);

    // 5 columnas × 4 filas de celdas fotovoltaicas
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        const cx = x + 12 + col * 40;
        const cy = y + 14 + row * 28;
        this.add.rectangle(cx, cy, 32, 20, 0x124e89).setOrigin(0, 0);
        this.add.rectangle(cx, cy, 20, 4, 0x0099db).setOrigin(0, 0);
        this.add.rectangle(cx + 8, cy, 8, 4, 0xffffff).setOrigin(0, 0);

        if (withDust) {
          const dustRect = this.add
            .rectangle(cx, cy, 32, 20, (row + col) % 2 === 0 ? 0xb86f50 : 0xe4a672, 0.92)
            .setOrigin(0, 0)
            .setStrokeStyle(1, 0x733e39)
            .setInteractive({ useHandCursor: true });

          dustRect.on('pointerdown', () => this.cleanCell(dustRect));
          this.dustCells.push(dustRect);
        }
      }
    }
  }

  private cleanCell(cell: Phaser.GameObjects.Rectangle): void {
    if (!cell.active || this.isDone) return;

    // Partícula de polvo al barrer
    const px = cell.x + 16;
    const py = cell.y + 10;
    cell.destroy();

    const p = this.add.rectangle(px, py, 5, 5, 0xe4a672);
    this.tweens.add({
      targets: p,
      x: px - 18,
      y: py + 14,
      alpha: 0,
      duration: 280,
      onComplete: () => p.destroy(),
    });

    const remaining = this.dustCells.filter((c) => c.active).length;
    const total = this.dustCells.length;
    const cleanRatio = (total - remaining) / Math.max(1, total);

    // Subir energía en vivo de 65 % a 100 %
    const currentEnergy = Math.round(65 + cleanRatio * 35);
    gameStore.state.base.energy = currentEnergy;
    this.energyBarFill.width = Math.round((214 * currentEnergy) / 100);

    if (remaining === 0) {
      this.finishCleaning();
    }
  }

  private finishCleaning(): void {
    if (this.isDone) return;
    this.isDone = true;

    Events.resolveMaintenanceEvent(gameStore.state, 'dust');
    const fact = Data.getFactById('polvo');
    if (!gameStore.state.learnedToday.includes('polvo')) {
      gameStore.state.learnedToday.push('polvo');
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
          factId: 'polvo',
        });
      },
    });
  }

  update(): void {
    if (this.isDone) {
      if (
        Phaser.Input.Keyboard.JustDown(this.keySpace) ||
        Phaser.Input.Keyboard.JustDown(this.keyE)
      ) {
        this.activeDialog?.advanceOrFinish();
      }
      return;
    }

    if (
      Phaser.Input.Keyboard.JustDown(this.keySpace) ||
      Phaser.Input.Keyboard.JustDown(this.keyE)
    ) {
      // Cada pulsación de Espacio/E limpia 4 celdas para jugar cómodamente también con teclado
      let cleanedNow = 0;
      for (const cell of this.dustCells) {
        if (cell.active) {
          this.cleanCell(cell);
          cleanedNow += 1;
          if (cleanedNow >= 4) break;
        }
      }
    }
  }
}
