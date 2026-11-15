/**
 * Sistema de audio de Alerta Heliosfera.
 *
 * - Música: las 3 pistas del soundtrack del equipo se reproducen con <audio> (streaming,
 *   no retrasan la carga) y cambian con un fundido cruzado según la escena.
 * - Efectos: archivos MP3 cortos decodificados con Web Audio para que suenen al instante.
 *   · public/assets/audio/sfx: efectos ORIGINALES sintetizados por el equipo
 *     (tools/sfx/generate_sfx.py).
 *   · public/assets/audio/kenney: "Interface Sounds" de Kenney (CC0 1.0).
 * - Ambientes en bucle (viento de Marte, zumbido de la base, taladro, válvula...).
 *
 * Todo funciona aunque el navegador bloquee el audio: si no hay contexto, simplemente no suena.
 */

const MUTE_STORAGE_KEY = 'alerta-heliosfera:muted';
const MUSIC_STORAGE_KEY = 'alerta-heliosfera:music';
const SFX_STORAGE_KEY = 'alerta-heliosfera:sfx';

export type MusicTrack = 'starboard' | 'blueprints' | 'sunsets';

const MUSIC_FILES: Record<MusicTrack, string> = {
  starboard: 'assets/audio/music/beyond_the_starboard_window.mp3',
  blueprints: 'assets/audio/music/blueprints_for_a_new_world.mp3',
  sunsets: 'assets/audio/music/sunsets_over_red_soil.mp3',
};

/** Nombre lógico -> archivo (sin extensión) relativo a assets/audio. */
const SFX_FILES = {
  step_1: 'sfx/step_1',
  step_2: 'sfx/step_2',
  step_3: 'sfx/step_3',
  step_4: 'sfx/step_4',
  drill_loop: 'sfx/drill_loop',
  overheat: 'sfx/overheat',
  o2_hiss: 'sfx/o2_hiss',
  siren: 'sfx/siren',
  o2_beep: 'sfx/o2_beep',
  wind_loop: 'sfx/wind_loop',
  base_hum_loop: 'sfx/base_hum_loop',
  airlock: 'sfx/airlock',
  tube_seal: 'sfx/tube_seal',
  sieve: 'sfx/sieve',
  scan_beep: 'sfx/scan_beep',
  scan_loop: 'sfx/scan_loop',
  success: 'sfx/success',
  fail: 'sfx/fail',
  corvi_chirp: 'sfx/corvi_chirp',
  whoosh: 'sfx/whoosh',
  static: 'sfx/static',
  brush: 'sfx/brush',
  clank: 'sfx/clank',
  valve_loop: 'sfx/valve_loop',
  rumble: 'sfx/rumble',
  rocket: 'sfx/rocket',
  pickup: 'sfx/pickup',
  radio_in: 'sfx/radio_in',
  heartbeat: 'sfx/heartbeat',
  trivia_ok: 'sfx/trivia_ok',
  trivia_bad: 'sfx/trivia_bad',
  ui_click: 'kenney/ui_click',
  ui_select: 'kenney/ui_select',
  ui_confirm: 'kenney/ui_confirm',
  ui_confirm_big: 'kenney/ui_confirm_big',
  ui_error: 'kenney/ui_error',
  ui_error_long: 'kenney/ui_error_long',
  ui_glass: 'kenney/ui_glass',
  ui_switch: 'kenney/ui_switch',
  ui_drop: 'kenney/ui_drop',
  ui_open: 'kenney/ui_open',
  ui_close: 'kenney/ui_close',
  ui_question: 'kenney/ui_question',
  ui_unlock: 'kenney/ui_unlock',
  ui_tick: 'kenney/ui_tick',
  ui_bong: 'kenney/ui_bong',
  ui_pluck: 'kenney/ui_pluck',
} as const;

export type SfxName = keyof typeof SFX_FILES;

/** Nombres antiguos usados por las escenas (se conservan por compatibilidad). */
export type SoundEffectName =
  | SfxName
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

const LEGACY: Record<string, SfxName> = {
  scanClick: 'ui_click',
  drillTick: 'clank',
  seal: 'tube_seal',
  o2Beep: 'o2_beep',
  staticBurst: 'static',
  stormAlarm: 'siren',
  corviChirrup: 'corvi_chirp',
  shootingStar: 'whoosh',
  unlock: 'ui_unlock',
};

/** Volumen relativo de cada efecto para que la mezcla quede pareja. */
const SFX_GAIN: Partial<Record<SfxName, number>> = {
  step_1: 0.32,
  step_2: 0.32,
  step_3: 0.32,
  step_4: 0.32,
  wind_loop: 0.5,
  base_hum_loop: 0.22,
  drill_loop: 0.35,
  valve_loop: 0.35,
  scan_loop: 0.25,
  ui_tick: 0.25,
  corvi_chirp: 0.55,
  siren: 0.55,
  o2_beep: 0.6,
  rocket: 0.7,
  sieve: 0.8,
};

export interface PlayOptions {
  volume?: number;
  /** Variación aleatoria de tono (0.05 = ±5 %). */
  pitchJitter?: number;
  rate?: number;
}

interface LoopHandle {
  source: AudioBufferSourceNode;
  gain: GainNode;
  base: number;
}

function readFlag(key: string, fallback: string): string {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key) ?? fallback;
    }
  } catch {
    // Sin almacenamiento (pruebas o modo privado).
  }
  return fallback;
}

function writeFlag(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    // Ignorar.
  }
}

function baseUrl(): string {
  try {
    return (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  } catch {
    return '/';
  }
}

export class AudioSystem {
  private static ctx: AudioContext | null = null;
  private static sfxBus: GainNode | null = null;
  private static buffers = new Map<SfxName, AudioBuffer>();
  private static loading = new Map<SfxName, Promise<AudioBuffer | null>>();
  private static loops = new Map<string, LoopHandle>();
  private static muted = readFlag(MUTE_STORAGE_KEY, '0') === '1';
  private static musicOn = readFlag(MUSIC_STORAGE_KEY, '1') === '1';
  private static sfxOn = readFlag(SFX_STORAGE_KEY, '1') === '1';
  private static lastStepAt = 0;
  private static stepIndex = 0;

  private static musicEls = new Map<MusicTrack, HTMLAudioElement>();
  private static currentTrack: MusicTrack | null = null;
  private static musicVolume = 0.45;
  private static duck = 1;
  private static fadeTimer: ReturnType<typeof setInterval> | null = null;
  private static unlockInstalled = false;

  // ------------------------------------------------------------------ ajustes

  static isMuted(): boolean {
    return AudioSystem.muted;
  }

  static setMuted(mute: boolean): void {
    AudioSystem.muted = mute;
    writeFlag(MUTE_STORAGE_KEY, mute ? '1' : '0');
    AudioSystem.applyMusicVolume();
    if (AudioSystem.sfxBus) AudioSystem.sfxBus.gain.value = mute || !AudioSystem.sfxOn ? 0 : 1;
  }

  static toggleMute(): boolean {
    AudioSystem.setMuted(!AudioSystem.muted);
    return AudioSystem.muted;
  }

  static isMusicOn(): boolean {
    return AudioSystem.musicOn;
  }

  static toggleMusic(): boolean {
    AudioSystem.musicOn = !AudioSystem.musicOn;
    writeFlag(MUSIC_STORAGE_KEY, AudioSystem.musicOn ? '1' : '0');
    AudioSystem.applyMusicVolume();
    if (AudioSystem.musicOn && AudioSystem.currentTrack) {
      AudioSystem.musicEls.get(AudioSystem.currentTrack)?.play().catch(() => {});
    }
    return AudioSystem.musicOn;
  }

  static isSfxOn(): boolean {
    return AudioSystem.sfxOn;
  }

  static toggleSfx(): boolean {
    AudioSystem.sfxOn = !AudioSystem.sfxOn;
    writeFlag(SFX_STORAGE_KEY, AudioSystem.sfxOn ? '1' : '0');
    if (AudioSystem.sfxBus) AudioSystem.sfxBus.gain.value = AudioSystem.muted || !AudioSystem.sfxOn ? 0 : 1;
    return AudioSystem.sfxOn;
  }

  // ------------------------------------------------------------------ arranque

  /**
   * Los navegadores sólo dejan sonar audio tras un gesto del jugador.
   * Se escucha el primer toque o tecla para reanudar el contexto y la música.
   */
  static installUnlock(): void {
    if (AudioSystem.unlockInstalled || typeof window === 'undefined') return;
    AudioSystem.unlockInstalled = true;
    const unlock = (): void => {
      const ctx = AudioSystem.getContext();
      ctx?.resume().catch(() => {});
      if (AudioSystem.currentTrack && AudioSystem.musicOn && !AudioSystem.muted) {
        AudioSystem.musicEls.get(AudioSystem.currentTrack)?.play().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchend', unlock, { passive: true });
  }

  /** Descarga y decodifica todos los efectos en segundo plano. */
  static preloadAll(): void {
    for (const name of Object.keys(SFX_FILES) as SfxName[]) {
      void AudioSystem.loadBuffer(name);
    }
  }

  private static getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!AudioSystem.ctx) {
      try {
        AudioSystem.ctx = new AudioCtx();
        AudioSystem.sfxBus = AudioSystem.ctx.createGain();
        AudioSystem.sfxBus.gain.value = AudioSystem.muted || !AudioSystem.sfxOn ? 0 : 1;
        AudioSystem.sfxBus.connect(AudioSystem.ctx.destination);
      } catch {
        return null;
      }
    }
    return AudioSystem.ctx;
  }

  private static loadBuffer(name: SfxName): Promise<AudioBuffer | null> {
    const cached = AudioSystem.buffers.get(name);
    if (cached) return Promise.resolve(cached);
    const pending = AudioSystem.loading.get(name);
    if (pending) return pending;
    const ctx = AudioSystem.getContext();
    if (!ctx || typeof fetch === 'undefined') return Promise.resolve(null);

    const url = `${baseUrl()}assets/audio/${SFX_FILES[name]}.mp3`;
    const p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then(
        (data) =>
          new Promise<AudioBuffer>((resolve, reject) => {
            // Forma con callbacks: compatible con Safari antiguo.
            ctx.decodeAudioData(data, resolve, reject);
          })
      )
      .then((buf) => {
        AudioSystem.buffers.set(name, buf);
        return buf;
      })
      .catch(() => null);
    AudioSystem.loading.set(name, p);
    return p;
  }

  // ------------------------------------------------------------------ efectos

  static play(effect: SoundEffectName, opts: PlayOptions = {}): void {
    if (AudioSystem.muted || !AudioSystem.sfxOn) return;

    let name: SfxName;
    if (effect === 'step') {
      const ms = Date.now();
      if (ms - AudioSystem.lastStepAt < 300) return;
      AudioSystem.lastStepAt = ms;
      AudioSystem.stepIndex = (AudioSystem.stepIndex + 1) % 4;
      name = `step_${AudioSystem.stepIndex + 1}` as SfxName;
      opts = { pitchJitter: 0.08, ...opts };
    } else {
      name = (LEGACY[effect] ?? effect) as SfxName;
    }

    const ctx = AudioSystem.getContext();
    if (!ctx || !AudioSystem.sfxBus) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const buf = AudioSystem.buffers.get(name);
    if (!buf) {
      // Primera vez: se descarga y suena en cuanto esté listo (sólo si fue hace poco).
      const askedAt = Date.now();
      void AudioSystem.loadBuffer(name).then((b) => {
        if (b && Date.now() - askedAt < 400) AudioSystem.play(effect, opts);
      });
      return;
    }

    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const jitter = opts.pitchJitter ?? 0;
      src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * jitter);
      const g = ctx.createGain();
      g.gain.value = (opts.volume ?? 1) * (SFX_GAIN[name] ?? 0.8);
      src.connect(g);
      g.connect(AudioSystem.sfxBus);
      src.start();
    } catch {
      // Contexto restringido: ignorar.
    }
  }

  /** Inicia (o ajusta) un sonido en bucle identificado por `id`. */
  static startLoop(id: string, name: SfxName, volume = 1): void {
    const ctx = AudioSystem.getContext();
    if (!ctx || !AudioSystem.sfxBus) return;
    const existing = AudioSystem.loops.get(id);
    if (existing) {
      existing.base = volume;
      existing.gain.gain.setTargetAtTime(volume * (SFX_GAIN[name] ?? 0.8), ctx.currentTime, 0.15);
      return;
    }
    const buf = AudioSystem.buffers.get(name);
    if (!buf) {
      void AudioSystem.loadBuffer(name).then((b) => {
        if (b && !AudioSystem.loops.has(id) && AudioSystem.wantedLoops.has(id)) {
          AudioSystem.startLoop(id, name, AudioSystem.wantedLoops.get(id) ?? volume);
        }
      });
      AudioSystem.wantedLoops.set(id, volume);
      return;
    }
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(volume * (SFX_GAIN[name] ?? 0.8), ctx.currentTime, 0.2);
      src.connect(g);
      g.connect(AudioSystem.sfxBus);
      src.start();
      AudioSystem.loops.set(id, { source: src, gain: g, base: volume });
      AudioSystem.wantedLoops.set(id, volume);
    } catch {
      // Ignorar.
    }
  }

  private static wantedLoops = new Map<string, number>();

  static stopLoop(id: string, fadeSec = 0.25): void {
    AudioSystem.wantedLoops.delete(id);
    const h = AudioSystem.loops.get(id);
    if (!h || !AudioSystem.ctx) return;
    AudioSystem.loops.delete(id);
    try {
      const now = AudioSystem.ctx.currentTime;
      h.gain.gain.setTargetAtTime(0, now, fadeSec / 3);
      h.source.stop(now + fadeSec + 0.05);
    } catch {
      // Ignorar.
    }
  }

  static stopAllLoops(): void {
    for (const id of [...AudioSystem.loops.keys()]) AudioSystem.stopLoop(id);
    AudioSystem.wantedLoops.clear();
  }

  // ------------------------------------------------------------------ música

  /** Cambia a la pista indicada con fundido cruzado (no hace nada si ya suena). */
  static playMusic(track: MusicTrack | null): void {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
    AudioSystem.installUnlock();
    if (track === AudioSystem.currentTrack) return;

    const previous = AudioSystem.currentTrack ? AudioSystem.musicEls.get(AudioSystem.currentTrack) : null;
    AudioSystem.currentTrack = track;

    let next: HTMLAudioElement | null = null;
    if (track) {
      next = AudioSystem.musicEls.get(track) ?? null;
      if (!next) {
        next = new Audio(`${baseUrl()}${MUSIC_FILES[track]}`);
        next.loop = true;
        next.preload = 'auto';
        AudioSystem.musicEls.set(track, next);
      }
      next.volume = 0;
      if (AudioSystem.musicOn && !AudioSystem.muted) next.play().catch(() => {});
    }

    if (AudioSystem.fadeTimer) clearInterval(AudioSystem.fadeTimer);
    let k = 0;
    const steps = 20;
    AudioSystem.fadeTimer = setInterval(() => {
      k += 1;
      const r = k / steps;
      if (previous) previous.volume = Math.max(0, (1 - r) * AudioSystem.targetMusicVolume());
      if (next) next.volume = Math.min(1, r * AudioSystem.targetMusicVolume());
      if (k >= steps) {
        if (AudioSystem.fadeTimer) clearInterval(AudioSystem.fadeTimer);
        AudioSystem.fadeTimer = null;
        if (previous && previous !== next) previous.pause();
      }
    }, 60);
  }

  /** Baja la música (0..1) durante tormentas, minijuegos o diálogos importantes. */
  static setMusicDuck(level: number): void {
    if (Math.abs(level - AudioSystem.duck) < 0.01) return;
    AudioSystem.duck = level;
    if (!AudioSystem.fadeTimer) AudioSystem.applyMusicVolume();
  }

  private static targetMusicVolume(): number {
    if (AudioSystem.muted || !AudioSystem.musicOn) return 0;
    return AudioSystem.musicVolume * AudioSystem.duck;
  }

  private static applyMusicVolume(): void {
    if (!AudioSystem.currentTrack) return;
    const el = AudioSystem.musicEls.get(AudioSystem.currentTrack);
    if (!el) return;
    el.volume = AudioSystem.targetMusicVolume();
    if (el.volume > 0 && el.paused) el.play().catch(() => {});
  }
}
