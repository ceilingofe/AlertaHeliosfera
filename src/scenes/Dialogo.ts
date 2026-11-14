import Phaser from 'phaser';
import { bus } from '../state/bus';
import { gameStore } from '../state/GameState';
import { Clock } from '../systems/Clock';
import type { DialogMessage } from '../types';
import { DialogBox } from '../ui/DialogBox';

/**
 * Escena en paralelo Dialogo: escucha el evento 'dialog:open' en el bus.
 * Si el modo es 'big', pausa el reloj mientras el diálogo está abierto.
 */
export class Dialogo extends Phaser.Scene {
  private activeDialog: DialogBox | null = null;
  private unsubscribers: (() => void)[] = [];

  constructor() {
    super('Dialogo');
  }

  create(): void {
    this.unsubscribers = [
      bus.on('dialog:open', (payload) => {
        this.openDialog(payload);
      }),
    ];

    this.input.keyboard?.on('keydown-SPACE', () => {
      this.activeDialog?.advanceOrFinish();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const unsub of this.unsubscribers) {
        unsub();
      }
      this.unsubscribers = [];
      this.activeDialog?.destroy();
      this.activeDialog = null;
    });
  }

  private openDialog(msg: DialogMessage): void {
    this.activeDialog?.destroy();

    const state = gameStore.state;
    const pausedByDialog = msg.mode === 'big' && !state.clock.paused;
    if (pausedByDialog) {
      Clock.setPaused(state, true);
    }

    this.activeDialog = new DialogBox(this, {
      mode: msg.mode,
      mood: msg.mood,
      text: msg.text,
      source: msg.source,
      label: msg.label,
      onComplete: () => {
        this.activeDialog = null;
        if (pausedByDialog) {
          Clock.setPaused(state, false);
        }
        bus.emit('dialog:closed');
      },
    });
  }
}
