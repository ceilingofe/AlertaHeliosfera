import Phaser from 'phaser';
import uiText from '../../content/ui_text.json';
import { gameStore } from '../state/GameState';
import { Save } from '../state/Save';
import {
  ACCESSORY_ORDER,
  ACCESSORY_UNLOCK_DAY,
  CHARACTER_ORDER,
  Customization,
  PATCH_OPTIONS,
  SUIT_COLOR_ORDER,
  SUIT_PALETTES,
} from '../systems/Customization';
import type { Accessory, CharacterId, SuitColor } from '../types';
import { AstronautAppearance } from '../ui/AstronautAppearance';

interface PersonalizaInitData {
  nextScene?: string;
}

/**
 * Escena Personaliza (sección 9.6):
 * Permite elegir color de traje (blanco, naranja, azul, verde, rosa),
 * personaje (chica, chico 1 o chico 2), accesorio desbloqueado por día y
 * parche de misión.
 */
export class Personaliza extends Phaser.Scene {
  private nextScene = 'Transmision';
  private previewContainer!: Phaser.GameObjects.Container;
  private miniPreviewImg!: Phaser.GameObjects.Image;
  private patchLabelText!: Phaser.GameObjects.Text;

  constructor() {
    super('Personaliza');
  }

  init(data?: PersonalizaInitData): void {
    this.nextScene = data?.nextScene ?? 'Transmision';
  }

  create(): void {
    const state = gameStore.state;
    state.clock.paused = true;

    // 1. Fondo espacial oscuro y marco principal
    this.add.rectangle(320, 180, 640, 360, 0x181425);
    const frame = this.add.rectangle(320, 184, 616, 336, 0x262b44);
    frame.setStrokeStyle(2, 0x5a6988);

    // Cintillo superior
    this.add.rectangle(320, 26, 612, 26, 0x3a4466);
    this.add
      .text(320, 26, uiText.personaliza.header, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '14px',
        color: '#fee761',
      })
      .setOrigin(0.5);

    // 2. Columna izquierda: Vista previa del astronauta a escala ×3 + vista mini ×2
    const previewCard = this.add.rectangle(136, 188, 212, 272, 0x3a4466);
    previewCard.setStrokeStyle(2, 0x181425);

    this.add.ellipse(136, 250, 82, 16, 0x181425);

    this.previewContainer = this.add.container(136, 168);
    this.miniPreviewImg = this.add
      .image(
        204,
        232,
        AstronautAppearance.getMiniTextureKey(
          this,
          state.customization.character,
          state.customization.suit
        )
      )
      .setScale(2);

    this.patchLabelText = this.add
      .text(136, 282, '', {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '11px',
        color: '#fee761',
      })
      .setOrigin(0.5);

    this.refreshPreview();

    // 3. Columna derecha: Controles de color, personaje, accesorio y parche
    this.drawSuitColorSection(262, 54);
    this.drawCharacterSection(262, 118);
    this.drawAccessoriesSection(262, 174);
    this.drawPatchSection(262, 254);

    // 4. Botón inferior "Guardar y continuar"
    const saveBtn = this.add
      .rectangle(438, 326, 236, 30, 0x3e8948)
      .setStrokeStyle(2, 0x181425)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(438, 326, uiText.personaliza.saveAndContinue, {
        fontFamily: 'PixelifySans, monospace',
        resolution: 2,
        fontSize: '13px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const finish = (): void => {
      Save.save(state);
      this.scene.start(this.nextScene);
    };

    saveBtn.on('pointerdown', finish);
    this.input.keyboard?.once('keydown-ENTER', finish);
    this.input.keyboard?.once('keydown-ESC', finish);
  }

  private refreshPreview(): void {
    const state = gameStore.state;
    this.previewContainer.removeAll(true);

    const fullAstro = AstronautAppearance.createFullAstronautContainer(
      this,
      0,
      0,
      3,
      state.customization
    );
    this.previewContainer.add(fullAstro);

    const miniKey = AstronautAppearance.getMiniTextureKey(
      this,
      state.customization.character,
      state.customization.suit
    );
    this.miniPreviewImg.setTexture(miniKey);
    this.patchLabelText.setText(`★ PARCHE: ${state.customization.patch}`);
  }

  private drawSuitColorSection(x: number, y: number): void {
    const state = gameStore.state;
    this.add.text(x, y, uiText.personaliza.suitColorTitle, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '11px',
      color: '#ead4aa',
    });

    SUIT_COLOR_ORDER.forEach((suitColor: SuitColor, idx: number) => {
      const palette = SUIT_PALETTES[suitColor];
      const bx = x + 32 + idx * 66;
      const by = y + 32;
      const unlocked = state.unlocks.customization || suitColor === 'blanco';
      const isSelected = state.customization.suit === suitColor;

      const swatch = this.add
        .rectangle(bx, by, 56, 28, palette.lightInt)
        .setStrokeStyle(isSelected ? 3 : 2, isSelected ? 0xfee761 : 0x181425)
        .setInteractive({ useHandCursor: unlocked });

      this.add
        .text(bx, by, unlocked ? palette.name : '🔒', {
          fontFamily: 'PixelifySans, monospace',
          resolution: 2,
          fontSize: '10px',
          color: suitColor === 'blanco' || suitColor === 'azul' ? '#181425' : '#ffffff',
        })
        .setOrigin(0.5);

      swatch.on('pointerdown', () => {
        if (Customization.setSuitColor(state, suitColor)) {
          Save.save(state);
          this.scene.restart({ nextScene: this.nextScene });
        }
      });
    });
  }

  private drawCharacterSection(x: number, y: number): void {
    const state = gameStore.state;
    this.add.text(x, y, uiText.personaliza.characterTitle, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '11px',
      color: '#ead4aa',
    });

    const labels: Record<CharacterId, string> = {
      girl: uiText.personaliza.characterGirlLabel,
      boy1: uiText.personaliza.characterBoy1Label,
      boy2: uiText.personaliza.characterBoy2Label,
    };

    CHARACTER_ORDER.forEach((characterId, idx) => {
      const bx = x + 58 + idx * 108;
      const by = y + 28;
      const isSelected = state.customization.character === characterId;
      const unlocked = state.unlocks.customization || characterId === 'girl';

      const btn = this.add
        .rectangle(bx, by, 100, 26, isSelected ? 0x5a6988 : 0x3a4466)
        .setStrokeStyle(2, isSelected ? 0xfee761 : 0x181425)
        .setInteractive({ useHandCursor: unlocked });

      const label = labels[characterId];
      this.add
        .text(bx, by, unlocked ? label : `${label} 🔒`, {
          fontFamily: 'PixelifySans, monospace',
          resolution: 2,
          fontSize: '11px',
          color: isSelected ? '#fee761' : '#ffffff',
        })
        .setOrigin(0.5);

      btn.on('pointerdown', () => {
        if (Customization.setCharacter(state, characterId)) {
          Save.save(state);
          this.scene.restart({ nextScene: this.nextScene });
        }
      });
    });
  }

  private drawAccessoriesSection(x: number, y: number): void {
    const state = gameStore.state;
    this.add.text(x, y, uiText.personaliza.accessoryTitle, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '11px',
      color: '#ead4aa',
    });

    const options: (Accessory | null)[] = [null, ...ACCESSORY_ORDER];
    options.forEach((acc, idx) => {
      const bx = x + 26 + idx * 56;
      const by = y + 38;
      const unlocked =
        acc === null ? true : Customization.isAccessoryUnlocked(state, acc);
      const isSelected = state.customization.accessory === acc;

      const box = this.add
        .rectangle(bx, by, 50, 44, unlocked ? 0x8b9bb4 : 0x3a4466)
        .setStrokeStyle(2, isSelected ? 0xfee761 : 0x181425)
        .setInteractive({ useHandCursor: unlocked });

      if (acc === null) {
        this.add
          .text(bx, by, 'Ninguno', {
            fontFamily: 'PixelifySans, monospace',
            resolution: 2,
            fontSize: '9px',
            color: '#181425',
          })
          .setOrigin(0.5);
      } else {
        this.add
          .image(
            bx,
            by + 4,
            AstronautAppearance.getMiniTextureKey(
              this,
              state.customization.character,
              state.customization.suit
            )
          )
          .setScale(1.3)
          .setAlpha(unlocked ? 1 : 0.4);
        this.add
          .image(bx, by - 2, `acc_${acc}`)
          .setScale(0.65)
          .setAlpha(unlocked ? 1 : 0.4);

        if (!unlocked) {
          const minDay = ACCESSORY_UNLOCK_DAY[acc];
          this.add
            .text(bx, by + 13, `Día ${minDay}`, {
              fontFamily: 'PixelifySans, monospace',
              resolution: 2,
              fontSize: '8px',
              color: '#fee761',
            })
            .setOrigin(0.5);
        }
      }

      box.on('pointerdown', () => {
        if (Customization.setAccessory(state, acc)) {
          Save.save(state);
          this.scene.restart({ nextScene: this.nextScene });
        }
      });
    });
  }

  private drawPatchSection(x: number, y: number): void {
    const state = gameStore.state;
    this.add.text(x, y, uiText.personaliza.patchTitle, {
      fontFamily: 'PixelifySans, monospace',
      resolution: 2,
      fontSize: '11px',
      color: '#ead4aa',
    });

    PATCH_OPTIONS.forEach((patch, idx) => {
      const bx = x + 40 + idx * 84;
      const by = y + 28;
      const isSelected = state.customization.patch === patch;
      const unlocked = state.unlocks.customization || idx === 0;

      const btn = this.add
        .rectangle(bx, by, 78, 24, isSelected ? 0x5a6988 : 0x3a4466)
        .setStrokeStyle(2, isSelected ? 0xfee761 : 0x181425)
        .setInteractive({ useHandCursor: unlocked });

      this.add
        .text(bx, by, patch, {
          fontFamily: 'PixelifySans, monospace',
          resolution: 2,
          fontSize: '9px',
          color: isSelected ? '#fee761' : '#ffffff',
        })
        .setOrigin(0.5);

      btn.on('pointerdown', () => {
        if (Customization.setPatch(state, patch)) {
          Save.save(state);
          this.scene.restart({ nextScene: this.nextScene });
        }
      });
    });
  }
}
