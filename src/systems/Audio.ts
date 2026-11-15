const MUTE_STORAGE_KEY = 'alerta-heliosfera:muted';

export type SoundEffectName =
  | 'step'
  | 'scanClick'
  | 'drillTick'
  | 'seal'
  | 'o2Beep'
  | 'staticBurst'
  | 'stormAlarm'
  | 'corviChirrup'
  | 'shootingStar'
  | 'unlock';

/**
 * Sistema de audio procedural estilo jsfxr con Web Audio API (sección 12).
 * No requiere archivos externos y funciona en navegadores de escritorio y tableta.
 */
export class AudioSystem {
  private static ctx: AudioContext | null = null;
  private static muted = AudioSystem.loadInitialMute();
  private static lastStepAt = 0;

  private static loadInitialMute(): boolean {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(MUTE_STORAGE_KEY) === '1';
      }
    } catch {
      // Ignorar si localStorage no está disponible en pruebas
    }
    return false;
  }

  static isMuted(): boolean {
    return AudioSystem.muted;
  }

  static setMuted(mute: boolean): void {
    AudioSystem.muted = mute;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(MUTE_STORAGE_KEY, mute ? '1' : '0');
      }
    } catch {
      // Ignorar errores de almacenamiento
    }
  }

  static toggleMute(): boolean {
    AudioSystem.setMuted(!AudioSystem.muted);
    return AudioSystem.muted;
  }

  private static getContext(): AudioContext | null {
    if (AudioSystem.muted) return null;
    if (typeof window === 'undefined') return null;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!AudioSystem.ctx) {
      try {
        AudioSystem.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }

    if (AudioSystem.ctx.state === 'suspended') {
      AudioSystem.ctx.resume().catch(() => {});
    }
    return AudioSystem.ctx;
  }

  static play(effect: SoundEffectName): void {
    const ctx = AudioSystem.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    switch (effect) {
      case 'step': {
        const ms = Date.now();
        if (ms - AudioSystem.lastStepAt < 220) return;
        AudioSystem.lastStepAt = ms;
        AudioSystem.playTone(ctx, 'triangle', 110, 75, 0.045, 0.03);
        break;
      }
      case 'scanClick': {
        AudioSystem.playTone(ctx, 'sine', 660, 880, 0.06, 0.06);
        break;
      }
      case 'drillTick': {
        AudioSystem.playTone(ctx, 'sawtooth', 95, 130, 0.05, 0.035);
        break;
      }
      case 'seal': {
        AudioSystem.playTone(ctx, 'triangle', 523.25, 783.99, 0.14, 0.08);
        setTimeout(() => {
          const c = AudioSystem.getContext();
          if (c) AudioSystem.playTone(c, 'sine', 783.99, 1046.5, 0.18, 0.08);
        }, 90);
        break;
      }
      case 'o2Beep': {
        AudioSystem.playTone(ctx, 'square', 880, 660, 0.12, 0.05);
        break;
      }
      case 'staticBurst': {
        AudioSystem.playNoise(ctx, 0.16, 0.025);
        break;
      }
      case 'stormAlarm': {
        AudioSystem.playTone(ctx, 'sawtooth', 440, 587.33, 0.22, 0.06);
        setTimeout(() => {
          const c = AudioSystem.getContext();
          if (c) AudioSystem.playTone(c, 'sawtooth', 587.33, 440, 0.25, 0.06);
        }, 200);
        break;
      }
      case 'corviChirrup': {
        AudioSystem.playTone(ctx, 'triangle', 420, 620, 0.07, 0.045);
        break;
      }
      case 'shootingStar': {
        AudioSystem.playTone(ctx, 'sine', 1200, 620, 0.22, 0.035);
        break;
      }
      case 'unlock': {
        AudioSystem.playTone(ctx, 'triangle', 523.25, 659.25, 0.12, 0.07);
        setTimeout(() => {
          const c = AudioSystem.getContext();
          if (c) AudioSystem.playTone(c, 'triangle', 659.25, 1046.5, 0.22, 0.08);
        }, 110);
        break;
      }
    }
    void now;
  }

  private static playTone(
    ctx: AudioContext,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    durationSec: number,
    peakGain: number
  ): void {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = ctx.currentTime;

      osc.type = type;
      osc.frequency.setValueAtTime(startFreq, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + durationSec);

      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t0);
      osc.stop(t0 + durationSec);
    } catch {
      // Ignorar si el contexto de audio está restringido
    }
  }

  private static playNoise(
    ctx: AudioContext,
    durationSec: number,
    peakGain: number
  ): void {
    try {
      const sampleRate = ctx.sampleRate;
      const frameCount = Math.max(1, Math.floor(sampleRate * durationSec));
      const buffer = ctx.createBuffer(1, frameCount, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frameCount; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.5;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;

      const gain = ctx.createGain();
      const t0 = ctx.currentTime;
      gain.gain.setValueAtTime(peakGain, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      source.start(t0);
    } catch {
      // Ignorar si el contexto de audio está restringido
    }
  }
}
