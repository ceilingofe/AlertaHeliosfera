import type { RescueCause, SampleType } from '../types';

export interface GameEvents {
  'clock:warn16': undefined;
  'clock:curfew17': undefined;
  'clock:dayEnd': undefined;
  'clock:pauseChanged': { paused: boolean };
  'vitals:o2Warn40': undefined;
  'vitals:o2Danger20': undefined;
  'rescue': { cause: RescueCause };
  'sample:delivered': { type: SampleType; count: number };
  'zone:changed': { name: string };
  'interact:prompt': { text: string | null };
  'input:action': undefined;
}

type Handler<T> = (payload: T) => void;

/**
 * Bus de eventos tipado en TypeScript puro para desacoplar la comunicación entre escenas.
 */
export class EventBus {
  private listeners = new Map<keyof GameEvents, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  off<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(handler as Handler<never>);
    }
  }

  emit<K extends keyof GameEvents>(
    event: K,
    ...args: GameEvents[K] extends undefined ? [] : [GameEvents[K]]
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    const payload = args[0] as GameEvents[K];
    for (const fn of set) {
      (fn as Handler<GameEvents[K]>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const bus = new EventBus();
