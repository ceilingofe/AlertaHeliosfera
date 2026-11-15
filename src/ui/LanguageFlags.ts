import Phaser from 'phaser';
import { AudioSystem } from '../systems/Audio';
import { I18n, type Lang } from '../systems/I18n';

/**
 * Selector visual pixel-art de idioma (EN / ES) con banderitas nítidas (18×12).
 */
export class LanguageFlags {
  private static ensureFlagTextures(scene: Phaser.Scene): void {
    if (!scene.textures.exists('flag_en')) {
      const tex = scene.textures.createCanvas('flag_en', 18, 12);
      if (tex) {
        const ctx = tex.getContext();
        ctx.imageSmoothingEnabled = false;
        // 7 franjas rojas/blancas
        for (let y = 0; y < 12; y++) {
          ctx.fillStyle = Math.floor(y / 2) % 2 === 0 ? '#e43b44' : '#ffffff';
          ctx.fillRect(0, y, 18, 1);
        }
        // Cantón azul con estrellas en píxel
        ctx.fillStyle = '#124e89';
        ctx.fillRect(0, 0, 8, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(1, 1, 1, 1);
        ctx.fillRect(4, 1, 1, 1);
        ctx.fillRect(6, 1, 1, 1);
        ctx.fillRect(2, 3, 1, 1);
        ctx.fillRect(5, 3, 1, 1);
        ctx.fillRect(1, 4, 1, 1);
        ctx.fillRect(4, 4, 1, 1);
        ctx.fillRect(6, 4, 1, 1);
        tex.refresh();
        tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }

    if (!scene.textures.exists('flag_es')) {
      const tex = scene.textures.createCanvas('flag_es', 18, 12);
      if (tex) {
        const ctx = tex.getContext();
        ctx.imageSmoothingEnabled = false;
        // Rojo - Amarillo - Rojo
        ctx.fillStyle = '#e43b44';
        ctx.fillRect(0, 0, 18, 3);
        ctx.fillRect(0, 9, 18, 3);
        ctx.fillStyle = '#fee761';
        ctx.fillRect(0, 3, 18, 6);
        // Pequeño escudo en píxeles
        ctx.fillStyle = '#be4a2f';
        ctx.fillRect(4, 4, 3, 4);
        ctx.fillStyle = '#f77622';
        ctx.fillRect(5, 3, 1, 1);
        tex.refresh();
        tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }
  }

  static create(
    scene: Phaser.Scene,
    centerX: number,
    centerY: number,
    onChange: (lang: Lang) => void,
    depth = 120
  ): Phaser.GameObjects.Container {
    LanguageFlags.ensureFlagTextures(scene);

    const container = scene.add.container(centerX, centerY).setDepth(depth);
    const items: { lang: Lang; label: string; offsetX: number }[] = [
      { lang: 'en', label: 'EN', offsetX: -22 },
      { lang: 'es', label: 'ES', offsetX: 22 },
    ];

    const buttons: { lang: Lang; bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }[] = [];

    const refreshStyles = (): void => {
      const cur = I18n.getLang();
      for (const b of buttons) {
        const active = b.lang === cur;
        b.bg.setFillStyle(active ? 0x262b44 : 0x181425, 0.96);
        b.bg.setStrokeStyle(active ? 2 : 1, active ? 0xfee761 : 0x5a6988);
        b.text.setColor(active ? '#fee761' : '#8b9bb4');
      }
    };

    for (const item of items) {
      const bg = scene.add
        .rectangle(item.offsetX, 0, 40, 18, 0x181425, 0.96)
        .setStrokeStyle(1, 0x5a6988)
        .setInteractive({ useHandCursor: true });

      const flag = scene.add.image(item.offsetX - 8, 0, `flag_${item.lang}`);
      const text = scene.add
        .text(item.offsetX + 9, 0, item.label, {
          fontFamily: 'PixelifySans, monospace',
          fontSize: '9px',
          color: '#ffffff',
        })
        .setOrigin(0.5);

      bg.on('pointerdown', () => {
        if (I18n.getLang() === item.lang) return;
        AudioSystem.play('ui_switch');
        I18n.setLang(item.lang);
        refreshStyles();
        onChange(item.lang);
      });

      buttons.push({ lang: item.lang, bg, text });
      container.add([bg, flag, text]);
    }

    refreshStyles();
    return container;
  }
}
