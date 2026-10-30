#!/usr/bin/env python3
"""Synthesises the breach spider's sounds (numpy only) and writes 44.1 kHz mono 16-bit WAVs.

    python3 generate_sounds.py      # reads cues.json (exported from viewer.html) and writes the WAVs

breach.wav is one track locked to the animation: it starts with the `deploy` clip (the landing) and
runs through `breach` to the detonation and its debris. The one-shots are for custom setups.
"""
import json, os, wave
import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(7)


def tt(d):
    return np.arange(int(d * SR)) / SR


def noise(d):
    return rng.standard_normal(int(d * SR))


def biquad(x, kind, f, q=0.707, gain_db=0.0):
    """RBJ cookbook biquad: lp, hp, bp."""
    w = 2 * np.pi * f / SR
    cw, sw = np.cos(w), np.sin(w)
    al = sw / (2 * q)
    if kind == 'lp':
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'hp':
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    else:  # band-pass, 0 dB peak
        b = [al, 0, -al]; a = [1 + al, -2 * cw, 1 - al]
    b = np.array(b) / a[0]; a = np.array(a) / a[0]
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    b0, b1, b2, a1, a2 = b[0], b[1], b[2], a[1], a[2]
    for i, xi in enumerate(x):
        yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, xi, y1, yi
        y[i] = yi
    return y


def decay(d, tau, attack=0.002):
    t = tt(d)
    return np.minimum(1, t / attack) * np.exp(-t / tau)


def pad(x, n):
    return np.pad(x, (0, max(0, n - len(x))))


def mix(*parts):
    n = max(len(p) for p in parts)
    return sum(pad(p, n) for p in parts)


def at(x, offset, total):
    out = np.zeros(int(total * SR))
    i = int(offset * SR)
    seg = x[:max(0, len(out) - i)]
    out[i:i + len(seg)] += seg
    return out


def norm(x, peak=0.89):
    m = np.max(np.abs(x)) or 1.0
    return x * (peak / m)


def room(x, rt=0.5, wet=0.16):
    """Small concrete room: exponentially decaying, darkened noise as the impulse response."""
    n = int(rt * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR / (rt / 6.9))
    ir = biquad(ir, 'lp', 3200) * 0.5
    ir[0] = 0
    m = len(x) + n
    y = np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[:m]
    y = y / (np.max(np.abs(y)) + 1e-9) * np.max(np.abs(x)) * wet * 2
    return pad(x, m) + y


# ----------------------------------------------------------------- building blocks

def thud(f0, f1, d, tau):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * decay(d, tau)


def ring(f0, ratios, taus, amps, d):
    t = tt(d)
    return sum(a * np.sin(2 * np.pi * f0 * r * t + r) * np.exp(-t / tau) for r, tau, a in zip(ratios, taus, amps)) * np.minimum(1, t / 0.001)


def burst(d, f, q, tau):
    return biquad(noise(d), 'bp', f, q) * decay(d, tau, 0.0005)


def click(f=4200):
    return burst(0.03, f, 1.4, 0.004) * 2.5 + ring(1900, [1, 2.7], [0.006, 0.004], [0.3, 0.2], 0.03)


def ratchet(d, rate0, rate1, f=3600, level=0.5):
    out = np.zeros(int(d * SR)); t = 0.0
    while t < d - 0.03:
        out += at(click(f + rng.uniform(-300, 300)) * level * rng.uniform(0.7, 1.0), t, d)
        rate = rate0 + (rate1 - rate0) * (t / d)
        t += 1.0 / rate
    return out


def motor(d, f0=88, f1=150, whine=1250, level=1.0):
    t = tt(d)
    up, down = 0.12, 0.16
    spd = np.clip(t / up, 0, 1) ** 1.5 * np.clip((d - t) / down, 0, 1) ** 0.8
    f = f0 + (f1 - f0) * spd
    ph = np.cumsum(f) / SR
    saw = 2 * (ph % 1) - 1
    body = biquad(saw, 'lp', 700) * 0.9 + np.sin(2 * np.pi * 2 * ph) * 0.25
    gear = np.sin(2 * np.pi * np.cumsum(whine * (0.6 + 0.4 * spd)) / SR) * (0.18 + 0.06 * np.sin(2 * np.pi * 17 * t))
    hiss = biquad(noise(d), 'bp', 2400, 1.2) * 0.06
    am = 1 + 0.12 * np.sin(2 * np.pi * 23 * t)
    env = np.clip(t / 0.04, 0, 1) * np.clip((d - t) / 0.06, 0, 1)
    return (body + gear + hiss) * am * env * (0.25 + 0.75 * spd) * level


def clank(f0=620, level=1.0):
    d = 0.5
    return (ring(f0, [1, 2.21, 3.62, 5.13, 7.4], [0.12, 0.08, 0.05, 0.035, 0.02], [0.6, 0.45, 0.3, 0.2, 0.1], d)
            + burst(d, 2800, 0.9, 0.01) * 1.2 + thud(140, 65, d, 0.07) * 0.6) * level



# ----------------------------------------------------------------- spider sounds

def servo(d, f0=900, f1=1400, level=0.25):
    t = tt(d); f = f0 + (f1 - f0) * np.clip(t / d, 0, 1)
    whine = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.3 * np.sin(2 * np.pi * np.cumsum(2.01 * f) / SR)
    return whine * np.clip(t / 0.01, 0, 1) * np.clip((d - t) / 0.02, 0, 1) * level


def step():
    return mix(click(5200 + rng.uniform(-900, 900)) * 0.5, ring(2600 + rng.uniform(-300, 300), [1, 1.9], [0.012, 0.008], [0.25, 0.12], 0.05)) * rng.uniform(0.6, 1.0)


def land():
    d = 0.6
    return mix(clank(900, 0.8), thud(160, 80, d, 0.05) * 0.8, at(ratchet(0.25, 40, 20, 4200, 0.35), 0.05, d))


def throw():
    d = 0.7; t = tt(d)
    lo, hi = biquad(noise(d), 'bp', 700, 1.0), biquad(noise(d), 'bp', 2200, 1.0)   # a swish that brightens as it passes
    k = np.sin(np.pi * t / d)
    return (lo * (1 - k) + hi * k) * k ** 2 * 0.6


def lance(d, active):
    """the thermal lance: crackle, a buzzing hum and sizzle; active (0..1 per sample) is how hard it bites"""
    t = tt(d)
    hum = (np.sin(2 * np.pi * 220 * t) * 0.35 + np.sin(2 * np.pi * 440 * t) * 0.15 + biquad(noise(d), 'bp', 3800, 3) * 0.25)
    crack = np.zeros_like(t)
    for _ in range(int(d * 260)):
        crack += at(burst(0.02, rng.uniform(1500, 7000), 1.2, 0.003) * rng.uniform(0.2, 1.0), rng.uniform(0, d), d)
    sizzle = biquad(noise(d), 'hp', 5000) * 0.35
    env = np.clip(t / 0.05, 0, 1) * np.clip((d - t) / 0.08, 0, 1)
    return (hum * (0.6 + 0.4 * active) + (crack * 0.9 + sizzle) * active) * env


def beep(f=2200, d=0.06):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) + 0.2 * np.sin(2 * np.pi * 2 * f * t)) * np.clip(t / 0.003, 0, 1) * np.clip((d - t) / 0.01, 0, 1) * 0.45


def detonate():
    d = 4.0; t = tt(d)
    boom = thud(70, 26, d, 0.55) * 2.2 + biquad(noise(d), 'lp', 260) * decay(d, 0.6) * 1.6
    crack = burst(0.4, 2400, 0.5, 0.03) * 2.5 + burst(0.4, 700, 0.6, 0.06) * 1.8
    rumble = biquad(noise(d), 'lp', 120) * np.exp(-t / 1.4) * 0.9
    debris = np.zeros_like(t)
    for _ in range(70):
        tb = 0.15 + rng.exponential(0.55)
        if tb < d - 0.4:
            debris += at(mix(thud(rng.uniform(90, 220), 50, 0.3, rng.uniform(0.02, 0.06)), burst(0.3, rng.uniform(800, 3000), 0.8, 0.01) * 0.6) * rng.uniform(0.15, 0.6), tb, d)
    dust = biquad(noise(d), 'hp', 2500) * np.clip(t / 0.3, 0, 1) * np.exp(-t / 1.6) * 0.18
    return mix(boom, crack, rumble, debris, dust)


def breach_track(cues):
    L = cues['detonate'] + 4.5
    out = np.zeros(int(L * SR))
    def put(x, when, gain=1.0):
        nonlocal out
        out += at(x * gain, when, L)
    for e in cues['events']:
        k, t0 = e['e'], e['t']
        if k == 'land': put(land(), t0, 0.9)
        elif k == 'unfold_start':
            for i in range(8): put(servo(0.22, 700 + 60 * i, 1300 + 60 * i, 0.18), t0 + 0.06 * (i // 2) + 0.03 * (i % 2))
        elif k == 'step': put(step(), t0, 0.55)
        elif k.startswith('seg_'):
            kind, d = k[4:], e['dur']
            if kind in ('turn', 'walk', 'settle') or (kind == 'cut' and d > 0.5):
                put(motor(max(0.12, d), 260, 420, 2600, 0.18), t0)        # the leg servos while it moves
            if kind == 'aim': put(servo(0.3, 600, 1800, 0.3), t0)
            if kind == 'cool': put(servo(0.25, 1600, 500, 0.25), t0)
        elif k == 'beep': put(beep(2300 if e is not cues['events'][-1] else 1800), t0)
        elif k == 'detonate': put(detonate(), t0)
    on, off = cues['laser_on'], cues['laser_off']
    d = off - on
    act = np.ones(int(d * SR))
    for e in cues['events']:   # the lance holds still on the corners: it hums but bites less
        if e['e'] == 'seg_turn' and on <= e['t'] < off:
            a = int((e['t'] - on) * SR); b = int((e['t'] + e['dur'] - on) * SR); act[a:b] = 0.4
    put(burst(0.15, 3000, 0.7, 0.03) * 1.2 + servo(0.15, 400, 2400, 0.4), on)    # strike
    put(lance(d, act), on, 0.9)
    put(servo(0.3, 2000, 300, 0.35), off)                                        # power down
    return room(out, 0.45, 0.12)


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())


def main():
    cues = json.load(open(os.path.join(HERE, 'cues.json')))
    x = breach_track(cues)
    x = np.tanh(x / (np.max(np.abs(x)) + 1e-9) * 1.8) / np.tanh(1.8)
    write_wav(os.path.join(HERE, 'breach.wav'), norm(x, 0.92))
    for name, fn in (('throw', throw), ('land', land), ('step', step), ('lance_loop', lambda: lance(2.0, np.ones(int(2.0 * SR)))), ('beep', beep), ('detonate', detonate)):
        write_wav(os.path.join(HERE, f'{name}.wav'), norm(room(fn(), 0.4, 0.1)))


if __name__ == '__main__':
    main()
