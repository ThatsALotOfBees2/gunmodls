#!/usr/bin/env python3
"""Synthesises the conductive lattice's sounds (numpy only) and writes 44.1 kHz mono 16-bit WAVs:

    deploy.wav      the node clamps on, sprays liquid metal (hiss and spatter) and the metal cures
                    (crackle and a rising hum); 4 s, goes with the deploy clip
    pulse.wav       one live pulse: a strike, then 1 s of crackling arcs and mains buzz
    idle.wav        2 s loop of the charging hum between pulses
    power_down.wav  the node dies (destroyed or cleared): a pop and a falling whine
"""
import os, wave
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



def hum(d, f=100, level=0.2):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) * 0.6 + np.sin(2 * np.pi * 2 * f * t) * 0.3 + np.sin(2 * np.pi * 3 * f * t) * 0.15) * level


def crackle(d, rate, level=0.5):
    out = np.zeros(int(d * SR))
    for _ in range(int(d * rate)):
        out += at(burst(0.012, rng.uniform(1800, 9000), 1.5, 0.002) * rng.uniform(0.2, 1.0) * level, rng.uniform(0, d), d)
    return out


def deploy():
    d = 4.0; t = tt(d)
    clamp = mix(clank(1100, 0.7), thud(170, 80, 0.4, 0.05) * 0.8)
    spray = biquad(noise(2.6), 'hp', 2500) * np.clip(tt(2.6) / 0.05, 0, 1) * np.clip((2.6 - tt(2.6)) / 0.25, 0, 1) * 0.35
    spatter = crackle(2.6, 90, 0.25)
    cure = crackle(0.9, 140, 0.35) + hum(0.9, 100, 0.1) * np.clip(tt(0.9) / 0.9, 0, 1)
    whine = np.sin(2 * np.pi * np.cumsum(400 + 900 * np.clip(tt(0.9) / 0.9, 0, 1)) / SR) * 0.06
    return room(mix(at(clamp, 0, d), at(spray + spatter, 0.45, d), at(cure + whine, 3.0, d)), 0.4, 0.1)


def pulse():
    d = 1.25
    strike = mix(burst(0.2, 3000, 0.6, 0.02) * 1.6, thud(140, 60, 0.2, 0.04) * 0.7)
    buzz = hum(1.0, 120, 0.25) * (0.7 + 0.3 * np.sign(np.sin(2 * np.pi * 60 * tt(1.0))))
    arcs = crackle(1.0, 220, 0.6)
    env = np.clip(tt(1.0) / 0.02, 0, 1) * np.clip((1.0 - tt(1.0)) / 0.06, 0, 1)
    return room(mix(strike, (buzz + arcs) * env), 0.35, 0.12)


def idle():
    d = 2.0
    return hum(d, 100, 0.12) * (0.85 + 0.15 * np.sin(2 * np.pi * 0.5 * tt(d)))


def power_down():
    d = 0.9
    pop = mix(burst(0.15, 1500, 0.6, 0.02) * 1.4, thud(160, 70, 0.2, 0.04))
    whine = np.sin(2 * np.pi * np.cumsum(1400 * np.exp(-tt(0.8) / 0.25) + 80) / SR) * np.exp(-tt(0.8) / 0.35) * 0.15
    return room(mix(pop, at(whine, 0.02, d), at(crackle(0.4, 60, 0.3), 0.05, d)), 0.35, 0.1)


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())


def main():
    for name, fn in (('deploy', deploy), ('pulse', pulse), ('idle', idle), ('power_down', power_down)):
        write_wav(os.path.join(HERE, f'{name}.wav'), norm(fn(), 0.85))


if __name__ == '__main__':
    main()
