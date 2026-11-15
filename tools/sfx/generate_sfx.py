"""
Generador de efectos de sonido ORIGINALES de Alerta Heliosfera (equipo SpaceCrows).

Todos los sonidos de este script se sintetizan desde cero con numpy (ruido,
osciladores y filtros), así que son obra del equipo y no dependen de ninguna
licencia externa. Uso:

    python3 tools/sfx/generate_sfx.py <carpeta_salida_wav>

Luego tools/sfx/build_audio.sh los convierte a MP3 para el navegador.
"""
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
rng = np.random.default_rng(2026)


def t(dur):
    return np.arange(int(SR * dur)) / SR


def env_ad(n, attack, decay_power=1.0):
    a = max(1, int(SR * attack))
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a)
    rest = n - a
    if rest > 0:
        e[a:] = np.linspace(1, 0, rest) ** decay_power
    return e


def exp_decay(n, tau):
    return np.exp(-np.arange(n) / (SR * tau))


def one_pole_lp(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(x)
    acc = 0.0
    b = 1 - a
    for i in range(len(x)):
        acc = b * x[i] + a * acc
        y[i] = acc
    return y


def biquad(x, kind, f0, q=0.707):
    w0 = 2 * np.pi * f0 / SR
    cw, sw = np.cos(w0), np.sin(w0)
    alpha = sw / (2 * q)
    if kind == 'lp':
        b0, b1, b2 = (1 - cw) / 2, 1 - cw, (1 - cw) / 2
    elif kind == 'hp':
        b0, b1, b2 = (1 + cw) / 2, -(1 + cw), (1 + cw) / 2
    else:  # band-pass (ganancia de pico constante)
        b0, b1, b2 = alpha, 0.0, -alpha
    a0, a1, a2 = 1 + alpha, -2 * cw, 1 - alpha
    b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        xi = x[i]
        yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, xi, y1, yi
        y[i] = yi
    return y


def noise(n):
    return rng.uniform(-1, 1, n)


def brown(n):
    w = rng.normal(0, 1, n)
    b = np.cumsum(w)
    b -= one_pole_lp(b, 2.0)  # quita la deriva lenta
    return b / (np.max(np.abs(b)) + 1e-9)


def osc(freq, dur, shape='sine', phase=0.0):
    tt = t(dur)
    if np.ndim(freq) == 0:
        ph = 2 * np.pi * freq * tt + phase
    else:
        ph = 2 * np.pi * np.cumsum(freq) / SR + phase
    if shape == 'sine':
        return np.sin(ph)
    if shape == 'square':
        return np.sign(np.sin(ph))
    if shape == 'saw':
        return 2 * ((ph / (2 * np.pi)) % 1.0) - 1
    if shape == 'tri':
        return 2 * np.abs(2 * ((ph / (2 * np.pi)) % 1.0) - 1) - 1
    raise ValueError(shape)


def normalize(x, peak=0.89):
    m = np.max(np.abs(x)) + 1e-9
    return x / m * peak


def loopify(x, fade):
    """Hace un bucle sin cortes mezclando el final con el inicio."""
    f = int(SR * fade)
    head, body, tail = x[:f], x[f:-f], x[-f:]
    ramp = np.linspace(0, 1, f)
    mixed = tail * (1 - ramp) + head * ramp
    return np.concatenate([body, mixed])


def save(out_dir, name, x, peak=0.89):
    x = normalize(x, peak)
    data = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(out_dir / f'{name}.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


# ---------------------------------------------------------------- sonidos

def footstep(seed_shift):
    n = int(SR * 0.16)
    local = np.random.default_rng(100 + seed_shift)
    crunch = local.uniform(-1, 1, n)
    # granos de regolito: impulsos aleatorios
    grains = np.zeros(n)
    idx = local.integers(0, int(n * 0.6), 40)
    grains[idx] = local.uniform(-1, 1, len(idx))
    crunch = biquad(crunch * 0.35 + grains, 'bp', 1400 + seed_shift * 180, 0.9)
    crunch *= exp_decay(n, 0.035)
    thump = np.sin(2 * np.pi * (85 + seed_shift * 6) * t(0.16)) * exp_decay(n, 0.025)
    return crunch * 0.9 + thump * 0.55


def drill_loop():
    dur = 1.0
    base = 120.0  # 120 ciclos exactos en 1 s: bucle perfecto
    wob = base * (1 + 0.02 * np.sin(2 * np.pi * 6 * t(dur)))
    motor = osc(wob, dur, 'saw') * 0.5 + osc(wob * 2, dur, 'square') * 0.15
    motor = biquad(motor, 'lp', 1800)
    grind = biquad(noise(len(motor)), 'bp', 2600, 1.2) * (0.6 + 0.4 * np.sin(2 * np.pi * 12 * t(dur)) ** 2)
    return loopify(motor + grind * 0.5, 0.05)


def overheat():
    dur = 0.9
    n = int(SR * dur)
    hiss = biquad(noise(n), 'hp', 3000) * np.linspace(0.2, 1, n) * env_ad(n, 0.01, 0.6)
    tone = osc(np.linspace(900, 1500, n), dur, 'square') * 0.25 * (np.sin(2 * np.pi * 9 * t(dur)) > 0)
    return hiss + tone


def o2_hiss():
    dur = 1.1
    n = int(SR * dur)
    h = biquad(noise(n), 'hp', 2200) * env_ad(n, 0.06, 1.4)
    return h + biquad(noise(n), 'bp', 900, 2) * 0.3 * env_ad(n, 0.1, 2)


def siren():
    dur = 1.6
    tt = t(dur)
    f = 620 + 260 * (0.5 + 0.5 * np.sin(2 * np.pi * 1.25 * tt - np.pi / 2))
    s = osc(f, dur, 'tri') * 0.7 + osc(f * 2, dur, 'square') * 0.08
    return s * env_ad(len(s), 0.03, 0.4)


def o2_beep():
    one = osc(1050, 0.09, 'square') * env_ad(int(SR * 0.09), 0.003, 0.3)
    gap = np.zeros(int(SR * 0.07))
    return biquad(np.concatenate([one, gap, one, gap * 2]), 'lp', 3500)


def wind_loop():
    dur = 9.0
    n = int(SR * dur)
    b = brown(n)
    gust = 0.55 + 0.45 * np.sin(2 * np.pi * t(dur) / 4.5) ** 2
    hiss = biquad(noise(n), 'bp', 600, 0.5) * 0.25
    w = biquad(b, 'lp', 420) * gust + hiss * gust
    return loopify(w, 1.2)


def base_hum_loop():
    dur = 6.0
    tt = t(dur)
    hum = np.sin(2 * np.pi * 60 * tt) * 0.5 + np.sin(2 * np.pi * 120 * tt) * 0.25 + np.sin(2 * np.pi * 180 * tt) * 0.08
    fan = biquad(noise(len(tt)), 'lp', 700) * 0.35 * (0.85 + 0.15 * np.sin(2 * np.pi * tt / 3))
    return loopify(hum * 0.6 + fan, 0.6)


def airlock():
    dur = 1.0
    n = int(SR * dur)
    hiss = biquad(noise(n), 'hp', 1500) * env_ad(n, 0.02, 0.8) * 0.7
    clunk = np.zeros(n)
    k = int(SR * 0.62)
    m = n - k
    clunk[k:] = (np.sin(2 * np.pi * 70 * t(m / SR)) + 0.5 * np.sin(2 * np.pi * 143 * t(m / SR))) * exp_decay(m, 0.06)
    return hiss + clunk


def tube_seal():
    click = biquad(noise(int(SR * 0.02)), 'hp', 2000) * env_ad(int(SR * 0.02), 0.001, 2)
    chirp = osc(np.linspace(500, 1400, int(SR * 0.18)), 0.18, 'sine') * env_ad(int(SR * 0.18), 0.01, 1.5) * 0.6
    pop = np.sin(2 * np.pi * 220 * t(0.12)) * exp_decay(int(SR * 0.12), 0.02)
    return np.concatenate([click, np.zeros(int(SR * 0.03)), chirp, pop])


def sieve():
    n = int(SR * 0.26)
    x = np.zeros(n)
    idx = rng.integers(0, n - 200, 90)
    for i in idx:
        L = 160
        x[i:i + L] += rng.uniform(-1, 1) * exp_decay(L, 0.0007)
    return biquad(x, 'bp', 3200, 0.8) * env_ad(n, 0.02, 0.7)


def scan_beep():
    d = 0.13
    s = osc(1500, d) * 0.7 + osc(3000, d) * 0.15
    return s * env_ad(len(s), 0.004, 1.5)


def scan_loop():
    dur = 1.0
    tt = t(dur)
    f = 900 + 300 * np.sin(2 * np.pi * 4 * tt)
    s = osc(f, dur, 'tri') * 0.3 + biquad(noise(len(tt)), 'bp', 2400, 3) * 0.2
    return loopify(s, 0.05)


def success():
    notes = [523.25, 659.25, 783.99, 1046.5]
    out = []
    for i, f in enumerate(notes):
        d = 0.11 if i < 3 else 0.45
        s = osc(f, d, 'tri') * 0.6 + osc(f * 2, d, 'sine') * 0.15
        out.append(s * env_ad(len(s), 0.005, 1.2 if i < 3 else 2))
    return np.concatenate(out)


def fail():
    a = osc(330, 0.18, 'square') * env_ad(int(SR * 0.18), 0.005, 0.5)
    b = osc(np.linspace(247, 196, int(SR * 0.42)), 0.42, 'square') * env_ad(int(SR * 0.42), 0.005, 1.2)
    return biquad(np.concatenate([a, b]), 'lp', 2200) * 0.8


def corvi_chirp():
    """Graznido corto y amable de Corvi (no es una grabación: es síntesis)."""
    out = []
    for f0, d in [(980, 0.09), (1250, 0.12)]:
        n = int(SR * d)
        f = np.linspace(f0 * 1.15, f0 * 0.85, n)
        body = osc(f, d, 'saw')
        body = biquad(body, 'bp', 1500, 2.5) * 0.8 + biquad(noise(n), 'bp', 2400, 3) * 0.15
        out.append(body * env_ad(n, 0.008, 1.3))
        out.append(np.zeros(int(SR * 0.03)))
    return np.concatenate(out)


def whoosh():
    dur = 0.9
    n = int(SR * dur)
    x = noise(n)
    out = np.zeros(n)
    seg = n // 8
    for k in range(8):
        f = 5000 * (0.6 ** k) + 300
        out[k * seg:(k + 1) * seg] = biquad(x[k * seg:(k + 1) * seg], 'bp', f, 1.2)
    return one_pole_lp(out, 6000) * env_ad(n, 0.05, 1.5) + osc(np.linspace(1800, 600, n), dur) * 0.05 * env_ad(n, 0.05, 2)


def static_burst():
    n = int(SR * 0.32)
    x = biquad(noise(n), 'bp', 1800, 0.6)
    crack = (rng.uniform(0, 1, n) > 0.985) * rng.uniform(-1, 1, n)
    return (x * 0.6 + crack) * env_ad(n, 0.01, 0.8)


def brush():
    n = int(SR * 0.2)
    sweep = np.zeros(n)
    x = noise(n)
    half = n // 2
    sweep[:half] = biquad(x[:half], 'bp', 2500, 0.7)
    sweep[half:] = biquad(x[half:], 'bp', 4000, 0.7)
    return sweep * np.sin(np.linspace(0, np.pi, n)) ** 2


def clank():
    d = 0.3
    n = int(SR * d)
    s = sum(np.sin(2 * np.pi * f * t(d)) * a for f, a in [(523, 0.6), (1187, 0.4), (1873, 0.3), (2711, 0.2)])
    return s * exp_decay(n, 0.05) + biquad(noise(n), 'hp', 3000) * exp_decay(n, 0.004) * 0.6


def valve_loop():
    dur = 1.0
    n = int(SR * dur)
    return loopify(biquad(noise(n), 'bp', 2800, 0.9) * 0.7 + biquad(noise(n), 'lp', 500) * 0.3, 0.08)


def rumble():
    dur = 2.2
    n = int(SR * dur)
    r = biquad(brown(n), 'lp', 160) * env_ad(n, 0.15, 1.1)
    crackle = biquad(noise(n), 'bp', 900, 1) * (rng.uniform(0, 1, n) > 0.96) * env_ad(n, 0.2, 1.5)
    return r + crackle * 0.4


def rocket():
    dur = 3.0
    n = int(SR * dur)
    roar = biquad(brown(n), 'lp', 380) + biquad(noise(n), 'bp', 1200, 0.5) * 0.35
    return roar * env_ad(n, 0.6, 1.0)


def pickup():
    s = osc(np.linspace(700, 1200, int(SR * 0.09)), 0.09, 'tri') * env_ad(int(SR * 0.09), 0.003, 1)
    s2 = osc(1600, 0.12, 'sine') * env_ad(int(SR * 0.12), 0.003, 1.5) * 0.6
    return np.concatenate([s, s2])


def radio_in():
    n = int(SR * 0.22)
    sq = biquad(noise(n), 'bp', 1600, 0.8) * env_ad(n, 0.005, 2) * 0.7
    beep = osc(1320, 0.07, 'sine') * env_ad(int(SR * 0.07), 0.003, 1)
    return np.concatenate([sq, beep])


def heartbeat_warn():
    """Pulso grave para avisar que el oxígeno está en peligro."""
    one = np.sin(2 * np.pi * 55 * t(0.12)) * exp_decay(int(SR * 0.12), 0.03)
    two = np.sin(2 * np.pi * 50 * t(0.16)) * exp_decay(int(SR * 0.16), 0.04)
    return np.concatenate([one, np.zeros(int(SR * 0.08)), two * 0.8, np.zeros(int(SR * 0.3))])


def trivia_correct():
    a = osc(880, 0.1, 'tri') * env_ad(int(SR * 0.1), 0.004, 1)
    b = osc(1318.5, 0.28, 'tri') * env_ad(int(SR * 0.28), 0.004, 1.6)
    return np.concatenate([a, b])


def trivia_wrong():
    s = osc(np.linspace(300, 180, int(SR * 0.35)), 0.35, 'saw')
    return biquad(s, 'lp', 1200) * env_ad(len(s), 0.004, 1)


SOUNDS = {
    'step_1': lambda: footstep(0),
    'step_2': lambda: footstep(1),
    'step_3': lambda: footstep(2),
    'step_4': lambda: footstep(3),
    'drill_loop': drill_loop,
    'overheat': overheat,
    'o2_hiss': o2_hiss,
    'siren': siren,
    'o2_beep': o2_beep,
    'wind_loop': wind_loop,
    'base_hum_loop': base_hum_loop,
    'airlock': airlock,
    'tube_seal': tube_seal,
    'sieve': sieve,
    'scan_beep': scan_beep,
    'scan_loop': scan_loop,
    'success': success,
    'fail': fail,
    'corvi_chirp': corvi_chirp,
    'whoosh': whoosh,
    'static': static_burst,
    'brush': brush,
    'clank': clank,
    'valve_loop': valve_loop,
    'rumble': rumble,
    'rocket': rocket,
    'pickup': pickup,
    'radio_in': radio_in,
    'heartbeat': heartbeat_warn,
    'trivia_ok': trivia_correct,
    'trivia_bad': trivia_wrong,
}

if __name__ == '__main__':
    out = Path(sys.argv[1] if len(sys.argv) > 1 else 'sfx_wav')
    out.mkdir(parents=True, exist_ok=True)
    for name, fn in SOUNDS.items():
        save(out, name, fn(), 0.8 if 'loop' in name else 0.89)
        print('ok', name)
