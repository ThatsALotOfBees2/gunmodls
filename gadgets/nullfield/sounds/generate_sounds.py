#!/usr/bin/env python3
"""Synthesises the Nullfield emitter's sounds (numpy only) and writes 44.1 kHz mono 16-bit WAVs:

    throw.wav        the emitter leaving the hand, spinning
    land.wav         the puck hitting the floor folded, with a small rattle
    deploy.wav       the three leg latches letting go and the legs locking out (goes with the deploy clip, 0-0.6 s)
    field_on.wav     mast servo, a rising swell and the soft thump of the bubble forming (power_on clip,
                     and 0.6 s into deploy)
    field_loop.wav   the hum while the field is up; loop it, fade it with the bubble's size (2.0 s seamless loop)
    field_off.wav    switched off or battery empty: the field winds down and the mast seats (power_off clip)
    low_battery.wav  two short beeps: charge under 20 %, battery empty, or switching on was refused
    shot.wav         the core hit: impact, crystal crack, electrical crackle, power dying, legs giving way
                     (shutdown clip)
"""
import os, wave
import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(11)


def tt(d):
    return np.arange(int(d * SR)) / SR


def noise(d):
    return rng.standard_normal(int(d * SR))


def biquad(x, kind, f, q=0.707):
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


def chirp(f0, f1, d, level=0.3):
    t = tt(d); f = f0 * (f1 / f0) ** (t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.clip(t / 0.008, 0, 1) * np.clip((d - t) / 0.02, 0, 1) * level


def swell(f0, f1, d, level=1.0, rise=True):
    """The field: a buzzy tone sliding from f0 to f1 with a few harmonics and an airy noise band on top."""
    t = tt(d); u = t / d
    f = f0 * (f1 / f0) ** u
    ph = np.cumsum(f) / SR
    tone = sum(a * np.sin(2 * np.pi * k * ph) for k, a in ((1, 1.0), (2, 0.5), (3, 0.3), (5, 0.12)))
    air = biquad(noise(d), 'bp', 2600, 0.8) * 0.35
    env = (u ** 1.6 if rise else (1 - u) ** 1.4) * np.clip(t / 0.02, 0, 1) * np.clip((d - t) / 0.04, 0, 1)
    return (tone * 0.5 + air) * env * level


def crackle(d, rate=120, level=1.0):
    """Electrical sparking: random sharp ticks, thinning out."""
    out = np.zeros(int(d * SR)); t = 0.0
    while t < d - 0.02:
        out += at(burst(0.02, rng.uniform(2500, 7000), 2.0, 0.0015) * rng.uniform(0.4, 1.0) * (1 - t / d), t, d)
        t += rng.exponential(1.0 / rate)
    return out * level


def beep(f, d, level=0.5):
    t = tt(d)
    sq = np.sign(np.sin(2 * np.pi * f * t)) * 0.4 + np.sin(2 * np.pi * f * t) * 0.6
    return biquad(sq, 'lp', 5000) * np.clip(t / 0.004, 0, 1) * np.clip((d - t) / 0.01, 0, 1) * level


# ----------------------------------------------------------------- the sounds

def throw():
    d = 0.5; t = tt(d)
    whoosh = biquad(noise(d), 'bp', 1100, 0.9) * np.sin(np.pi * t / d) ** 2 * 0.5
    flutter = 1 + 0.35 * np.sin(2 * np.pi * 14 * t)   # the spinning puck
    return whoosh * flutter


def land():
    d = 0.5
    return room(mix(thud(210, 80, d, 0.04) * 1.0, clank(1150, 0.3), at(click(2600) * 0.6, 0.008, d),
                    at(clank(1400, 0.12), 0.07, d), at(click(3300) * 0.3, 0.11, d)), 0.35, 0.1)


def deploy():
    d = 0.8
    return room(mix(at(click(3800) * 0.6, 0.05, d), at(click(3500) * 0.6, 0.09, d), at(click(3700) * 0.6, 0.13, d),
                    at(motor(0.35, 140, 230, 1900, 0.45), 0.08, d), at(thud(170, 70, 0.3, 0.05) * 0.7, 0.42, d),
                    at(clank(1250, 0.22), 0.43, d), at(click(2400) * 0.4, 0.5, d)), 0.3, 0.08)


def field_on():
    d = 1.25
    return room(mix(at(motor(0.45, 130, 220, 2100, 0.4), 0.0, d), at(swell(70, 180, 0.6, 0.8), 0.0, d),
                    at(thud(95, 38, 0.6, 0.18) * 1.1, 0.48, d), at(burst(0.5, 900, 0.6, 0.12) * 0.35, 0.48, d),
                    at(swell(180, 150, 0.7, 0.45, rise=False), 0.55, d), at(chirp(1900, 2900, 0.25, 0.06), 0.5, d)), 0.45, 0.14)


def field_loop():
    d = 2.0; t = tt(d)
    # whole cycles only (60 Hz, 2 s), so it loops without a click
    f = 60.0; ph = f * t
    hum = np.sin(2 * np.pi * ph) * 0.55 + np.sin(2 * np.pi * 2 * ph) * 0.3 + np.sin(2 * np.pi * 3 * ph + 0.4) * 0.16 + np.sin(2 * np.pi * 5 * ph) * 0.05
    hum *= 1 + 0.18 * np.sin(2 * np.pi * 0.5 * t)   # slow beat, one per loop
    # airy shimmer: noise filtered as a loop (run twice, keep the second pass) with a slow swirl
    n = noise(d)
    air = biquad(np.concatenate([n, n]), 'bp', 2400, 0.7)[len(n):] * (0.16 + 0.06 * np.sin(2 * np.pi * 1.5 * t))
    sing = np.sin(2 * np.pi * 1600 * t + 3 * np.sin(2 * np.pi * 3 * t)) * 0.025
    return hum + air + sing


def field_off():
    d = 1.0
    return room(mix(at(swell(170, 45, 0.6, 0.85, rise=False), 0.0, d), at(chirp(1700, 300, 0.35, 0.08), 0.0, d),
                    at(motor(0.4, 200, 120, 1700, 0.35), 0.15, d), at(thud(150, 60, 0.3, 0.05) * 0.6, 0.62, d),
                    at(click(2600) * 0.45, 0.64, d)), 0.4, 0.1)


def low_battery():
    d = 0.42
    return mix(at(beep(1480, 0.09), 0.0, d), at(beep(1180, 0.12), 0.16, d))


def shot():
    d = 1.4
    impact = mix(burst(0.06, 3200, 0.7, 0.008) * 2.2, thud(260, 90, 0.2, 0.03) * 0.8)
    crack = ring(3100, [1, 1.53, 2.31, 3.7], [0.05, 0.035, 0.025, 0.015], [0.4, 0.3, 0.25, 0.15], 0.3)
    return room(mix(impact, at(crack, 0.004, d), at(clank(980, 0.4), 0.0, d), at(crackle(0.55, 140, 0.55), 0.03, d),
                    at(swell(220, 30, 0.7, 0.7, rise=False), 0.05, d), at(thud(130, 55, 0.3, 0.05) * 0.5, 0.42, d),
                    at(clank(1300, 0.15), 0.44, d), at(click(2300) * 0.35, 0.6, d)), 0.45, 0.12)


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())


def main():
    for name, fn in (('throw', throw), ('land', land), ('deploy', deploy), ('field_on', field_on), ('field_loop', field_loop),
                     ('field_off', field_off), ('low_battery', low_battery), ('shot', shot)):
        write_wav(os.path.join(HERE, f'{name}.wav'), norm(fn(), 0.85))


if __name__ == '__main__':
    main()
