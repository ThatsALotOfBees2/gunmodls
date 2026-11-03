#!/usr/bin/env python3
"""Synthesises the Haneul furniture pack's impact sounds (numpy only) and writes 44.1 kHz mono 16-bit WAVs.

One hit and one break sound per material class (the class names match parts.json):

    hit_<class>.wav    a bullet or knock on a part that holds (also played, quieter, when a loose part lands)
    break_<class>.wav  the part gives way: shatters into its chunks or comes loose

    classes: wood glass metal fabric ceramic stone plastic electronics paper plant

and three weapon sounds for the viewer's Shoot mode:

    shot_rifle.wav     one rifle round
    shot_shotgun.wav   one shotgun blast
    frag.wav           a frag grenade going off

Run it from anywhere: python3 generate_sounds.py (writes next to this file).
"""
import os, wave
import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(23)


def tt(d):
    return np.arange(int(d * SR)) / SR


def noise(d):
    return rng.standard_normal(int(d * SR))


def band(x, lo=0.0, hi=None, soft=0.25):
    """Band-pass in the frequency domain with soft (log-spaced) edges."""
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR) + 1e-3
    g = np.ones_like(f)
    if lo > 0:
        g *= 1 / (1 + (lo / f) ** (4 / soft * 0.25))
    if hi:
        g *= 1 / (1 + (f / hi) ** (4 / soft * 0.25))
    return np.fft.irfft(X * g, n)


def env(d, tau, attack=0.0015):
    t = tt(d)
    return np.minimum(1, t / attack) * np.exp(-t / tau)


def at(x, offset, total):
    out = np.zeros(int(total * SR))
    i = int(offset * SR)
    n = min(len(x), len(out) - i)
    if n > 0:
        out[i:i + n] += x[:n]
    return out


def mix(total, *parts):
    """parts: (signal, offset seconds, gain)"""
    out = np.zeros(int(total * SR))
    for x, o, g in parts:
        out += at(x, o, total) * g
    return out


def modes(f0, ratios, taus, amps, d, jitter=0.0):
    t = tt(d)
    y = np.zeros_like(t)
    for r, ta, a in zip(ratios, taus, amps):
        f = f0 * r * (1 + jitter * (rng.random() - 0.5))
        y += a * np.sin(2 * np.pi * f * t + rng.random() * 6.28) * np.exp(-t / ta)
    return y * np.minimum(1, t / 0.0008)


def burst(d, lo, hi, tau):
    return band(noise(d), lo, hi) * env(d, tau)


def thump(f0, f1, d, tau):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t / (tau * 0.5))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(d, tau, 0.002)


def plus(*xs):
    """sum of signals of different lengths"""
    out = np.zeros(max(len(x) for x in xs))
    for x in xs:
        out[:len(x)] += x
    return out


def scatter(d, rate, make, decay=0.35):
    """random small events (tinkles, crackles, crumbs) thinning out over d seconds"""
    out = np.zeros(int(d * SR))
    tcur = 0.0
    while True:
        tcur += rng.exponential(1 / rate) * np.exp(tcur / decay * 0.6)
        if tcur >= d:
            break
        ev = make() * np.exp(-tcur / decay) * (0.4 + 0.6 * rng.random())
        out += at(ev, tcur, d)
    return out


def ping(lo, hi, tau=0.03):
    return modes(lo * (hi / lo) ** rng.random(), [1, 2.32, 4.1], [tau, tau * 0.6, tau * 0.35], [1, 0.5, 0.25], tau * 6)


def click(lo=1500, hi=9000, d=0.004):
    return burst(d + 0.004, lo, hi, d * 0.5)


def room(x, rt=0.35, wet=0.12):
    """a short, dark room tail (exponential noise reverb by convolution)"""
    n = int(rt * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR / (rt / 6.9))
    ir = band(ir, 120, 5000)
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    m = len(x) + n
    y = np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)
    return np.concatenate([x, np.zeros(n)]) * (1 - wet) + y * wet * 2.5


def norm(x, peak=0.89):
    x = x - np.mean(x)
    m = np.max(np.abs(x)) or 1
    y = x / m * peak
    # 4 ms fade at both ends, so nothing clicks
    k = int(0.004 * SR)
    y[:k] *= np.linspace(0, 1, k)
    y[-k:] *= np.linspace(1, 0, k)
    return y


def write(name, x, peak=0.89):
    y = norm(x, peak)
    with wave.open(os.path.join(HERE, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())
    print(name, f'{len(y) / SR:.2f} s')


# ------------------------------------------------------------------ hits (a round or a knock on a part that holds)
def hit_wood():
    knock = modes(210, [1, 2.7, 4.4, 6.9], [0.05, 0.03, 0.018, 0.01], [1, 0.6, 0.35, 0.2], 0.25, 0.1)
    return room(mix(0.25, (knock, 0, 1), (burst(0.06, 1500, 6000, 0.008), 0, 0.5), (thump(160, 90, 0.12, 0.04), 0, 0.5)))


def hit_glass():
    tink = modes(3150, [1, 1.62, 2.71, 3.9], [0.12, 0.08, 0.05, 0.03], [1, 0.6, 0.4, 0.2], 0.5, 0.05)
    return room(mix(0.5, (tink, 0, 1), (click(3000, 12000), 0, 0.6)), 0.3, 0.1)


def hit_metal():
    clang = modes(520, [1, 2.76, 5.40, 8.93, 13.3], [0.5, 0.35, 0.22, 0.12, 0.07], [1, 0.7, 0.45, 0.3, 0.15], 1.0, 0.04)
    return room(mix(1.0, (clang, 0, 0.9), (click(2000, 10000, 0.003), 0, 0.8), (thump(220, 120, 0.1, 0.03), 0, 0.4)))


def hit_fabric():
    return room(mix(0.25, (thump(110, 55, 0.2, 0.05), 0, 1), (burst(0.12, 150, 1200, 0.03), 0, 0.7)), 0.25, 0.08)


def hit_ceramic():
    clink = modes(1850, [1, 2.21, 3.73, 5.2], [0.09, 0.06, 0.035, 0.02], [1, 0.55, 0.35, 0.2], 0.4, 0.05)
    return room(mix(0.4, (clink, 0, 1), (click(2500, 11000), 0, 0.5), (thump(300, 180, 0.06, 0.015), 0, 0.3)))


def hit_stone():
    grit = burst(0.18, 400, 7000, 0.035)
    return room(mix(0.35, (thump(140, 70, 0.25, 0.06), 0, 1), (grit, 0, 0.8), (click(1000, 6000, 0.006), 0, 0.6)))


def hit_plastic():
    tick = modes(760, [1, 2.3, 3.9], [0.03, 0.018, 0.01], [1, 0.5, 0.3], 0.15, 0.1)
    return room(mix(0.2, (tick, 0, 1), (click(1500, 8000), 0, 0.7), (thump(200, 120, 0.06, 0.02), 0, 0.4)))


def hit_electronics():
    zap = burst(0.08, 2500, 9000, 0.015) * (1 + 0.8 * np.sign(np.sin(2 * np.pi * 120 * tt(0.08))))
    return room(mix(0.3, (hit_plastic()[:int(0.2 * SR)], 0, 0.8), (zap, 0.005, 0.5)))


def hit_paper():
    pap = burst(0.12, 600, 5000, 0.025)
    return room(mix(0.2, (pap, 0, 1), (thump(140, 80, 0.06, 0.02), 0, 0.3)), 0.2, 0.06)


def hit_plant():
    rustle = burst(0.25, 1800, 9000, 0.06) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 23 * tt(0.25))))
    return room(mix(0.3, (rustle, 0, 1), (click(1500, 5000, 0.005), 0, 0.5)), 0.2, 0.06)


# ------------------------------------------------------------------ breaks (the part shatters or comes loose)
def break_wood():
    crack = burst(0.08, 1200, 8000, 0.018)
    splinters = scatter(0.6, 50, lambda: plus(click(1200, 7000, 0.006), ping(500, 1500, 0.01) * 0.4), 0.25)
    return room(mix(0.9, (thump(120, 60, 0.35, 0.09), 0, 1), (crack, 0, 1.1), (crack, 0.03, 0.6), (splinters, 0.02, 0.6),
                    (hit_wood()[:int(0.25 * SR)], 0.12, 0.35)))


def break_glass():
    burst1 = burst(0.25, 2500, 16000, 0.05)
    tinkles = scatter(1.1, 70, lambda: ping(2800, 9000, 0.03), 0.45)
    return room(mix(1.3, (burst1, 0, 1), (thump(180, 90, 0.12, 0.03), 0, 0.4), (tinkles, 0.02, 0.9)), 0.4, 0.14)


def break_metal():
    clang = modes(410, [1, 2.76, 5.40, 8.93], [0.7, 0.45, 0.25, 0.12], [1, 0.7, 0.4, 0.25], 1.4, 0.05)
    rattle = scatter(0.7, 30, lambda: modes(900 * (1 + rng.random()), [1, 2.7], [0.03, 0.02], [1, 0.5], 0.12), 0.3)
    return room(mix(1.5, (clang, 0, 1), (thump(130, 60, 0.3, 0.08), 0, 0.8), (click(1500, 9000, 0.006), 0, 0.8), (rattle, 0.18, 0.5)))


def break_fabric():
    rip = burst(0.35, 600, 4000, 0.12) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 31 * tt(0.35))))
    return room(mix(0.6, (thump(90, 45, 0.35, 0.1), 0, 1), (rip, 0.02, 0.6), (burst(0.2, 100, 800, 0.05), 0, 0.6)), 0.3, 0.08)


def break_ceramic():
    crack = burst(0.1, 1500, 12000, 0.02)
    shards = scatter(0.9, 55, lambda: ping(1500, 5500, 0.035), 0.35)
    return room(mix(1.1, (crack, 0, 1), (thump(260, 140, 0.1, 0.03), 0, 0.5), (shards, 0.015, 0.85)), 0.35, 0.12)


def break_stone():
    crunch = burst(0.25, 300, 6000, 0.07)
    crumbs = scatter(0.9, 60, lambda: click(800, 5000, 0.008) * 1.5, 0.35)
    rumble = band(noise(0.8), 30, 200) * env(0.8, 0.22)
    return room(mix(1.2, (thump(90, 40, 0.5, 0.15), 0, 1), (crunch, 0, 0.9), (crumbs, 0.03, 0.6), (rumble, 0, 0.8)), 0.45, 0.14)


def break_plastic():
    snap = burst(0.03, 1500, 9000, 0.006)
    clatter = scatter(0.5, 35, lambda: modes(700 * (1 + rng.random()), [1, 2.3], [0.02, 0.012], [1, 0.5], 0.08), 0.22)
    return room(mix(0.7, (snap, 0, 1.2), (thump(180, 90, 0.12, 0.03), 0, 0.6), (clatter, 0.04, 0.7)))


def break_electronics():
    pop = plus(thump(160, 50, 0.2, 0.05), burst(0.05, 200, 4000, 0.012))
    sparks = scatter(0.8, 90, lambda: click(3000, 14000, 0.002) * 1.3, 0.3)
    hum = np.sin(2 * np.pi * 100 * tt(0.5)) * np.exp(-tt(0.5) / 0.15) * (1 + 0.5 * np.sin(2 * np.pi * 200 * tt(0.5)))
    return room(mix(1.0, (pop, 0, 1), (break_plastic()[:int(0.5 * SR)], 0, 0.5), (sparks, 0.01, 0.6), (hum, 0, 0.25)))


def break_paper():
    tear = burst(0.45, 1500, 7000, 0.2) * (0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 17 * tt(0.45)) * np.sin(2 * np.pi * 43 * tt(0.45))))
    flutter = burst(0.5, 300, 2000, 0.2) * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * tt(0.5)))
    return room(mix(0.8, (tear, 0, 1), (flutter, 0.15, 0.4), (thump(130, 70, 0.08, 0.02), 0, 0.4)), 0.25, 0.08)


def break_plant():
    snap = burst(0.03, 1000, 6000, 0.008)
    rustle = burst(0.6, 1500, 9000, 0.2) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 13 * tt(0.6))))
    return room(mix(0.8, (snap, 0, 1), (rustle, 0.01, 0.8), (thump(110, 55, 0.2, 0.05), 0.02, 0.6)), 0.25, 0.08)


# ------------------------------------------------------------------ weapons
def shot_rifle():
    crack = burst(0.04, 1500, 14000, 0.006)
    boom = thump(150, 45, 0.45, 0.09) + band(noise(0.45), 60, 900) * env(0.45, 0.07)
    mech = modes(2400, [1, 1.7], [0.02, 0.012], [1, 0.5], 0.06)
    return room(mix(0.9, (crack, 0, 1), (boom, 0, 1), (mech, 0.06, 0.12)), 0.6, 0.2)


def shot_shotgun():
    boom = thump(120, 35, 0.7, 0.14) + band(noise(0.7), 40, 1500) * env(0.7, 0.11)
    return room(mix(1.2, (burst(0.06, 800, 12000, 0.012), 0, 1), (boom, 0, 1.3)), 0.8, 0.22)


def frag():
    boom = thump(90, 25, 1.6, 0.35) + band(noise(1.6), 25, 700) * env(1.6, 0.3)
    blast = burst(0.15, 300, 12000, 0.04)
    debris = scatter(1.4, 40, lambda: click(800, 6000, 0.01) * 1.4, 0.5)
    return room(mix(2.2, (blast, 0, 1), (boom, 0, 1.6), (debris, 0.15, 0.4)), 1.0, 0.25)


if __name__ == '__main__':
    for cls in ['wood', 'glass', 'metal', 'fabric', 'ceramic', 'stone', 'plastic', 'electronics', 'paper', 'plant']:
        write('hit_' + cls, globals()['hit_' + cls]())
        write('break_' + cls, globals()['break_' + cls]())
    write('shot_rifle', shot_rifle())
    write('shot_shotgun', shot_shotgun())
    write('frag', frag(), 0.95)
