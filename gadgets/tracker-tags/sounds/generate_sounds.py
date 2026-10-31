#!/usr/bin/env python3
"""Synthesises the tracker tags' sounds (numpy only) and writes 44.1 kHz mono 16-bit WAVs:

    eject.wav         the pack's thumb slide pushing the top tag out (goes with the pack's eject clip)
    stick.wav         a tag landing or being pressed on: soft hit, gel squelch, prong clicks, LED wake chirp (stick clip)
    pulse_tick.wav    a tag feeling a step: a tiny, quiet piezo tick at the tag (pulse clip)
    hud_ping.wav      Nox's HUD drawing a new arc (play once per event, not once per tag)
    tamper.wav        a tag being shot or pried open: crack, snap, fizz (tamper clip)
    tamper_alert.wav  Nox's HUD warning that a tag was destroyed
    breach.wav        a breach charge going off on a wall: the heavy thump the tags feel at double range
    footstep.wav      a boot on concrete (the viewer's attacker; quieter when crouching)
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


# ----------------------------------------------------------------- building blocks (as the scout drone's)

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


def chirp(f0, f1, d, level=0.3):
    t = tt(d); f = f0 * (f1 / f0) ** (t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.clip(t / 0.008, 0, 1) * np.clip((d - t) / 0.02, 0, 1) * level


def tone(f, d, tau, harm=(1.0, 0.0, 0.0)):
    """A soft electronic tone: sine plus a few odd harmonics, quick attack, exponential tail."""
    t = tt(d)
    s = sum(a * np.sin(2 * np.pi * f * (2 * k + 1) * t) / (2 * k + 1) for k, a in enumerate(harm) if a)
    return s * np.minimum(1, t / 0.004) * np.exp(-t / tau)


def squelch(d=0.08, f0=900, f1=260):
    """Gel pressed flat: band-passed noise sliding down in pitch."""
    n = noise(d); t = tt(d); out = np.zeros_like(n)
    hop = 256
    for i in range(0, len(n), hop):
        f = f0 * (f1 / f0) ** (t[i] / d)
        out[i:i + hop] = biquad(n[i:i + hop], 'bp', f, 2.0)
    return out * np.sin(np.pi * np.clip(t / d, 0, 1)) ** 0.7


# ----------------------------------------------------------------- the sounds

def eject():
    d = 0.42
    slide = biquad(noise(0.14), 'bp', 2600, 1.2) * np.sin(np.pi * tt(0.14) / 0.14) * 0.35
    return room(mix(at(click(3800) * 0.6, 0.0, d), at(slide, 0.02, d), at(click(2900) * 0.9, 0.17, d),
                    at(ring(1500, [1, 2.4], [0.02, 0.01], [0.25, 0.12], 0.08), 0.17, d), at(click(4400) * 0.5, 0.33, d)), 0.25, 0.06)


def stick():
    d = 0.45
    prongs = mix(at(click(5200) * 0.35, 0.055, d), at(click(5600) * 0.3, 0.068, d), at(click(5000) * 0.3, 0.079, d))
    return room(mix(thud(320, 130, 0.12, 0.025) * 0.8, at(burst(0.05, 1700, 0.8, 0.008) * 0.6, 0.0, d), at(squelch() * 0.9, 0.01, d),
                    prongs, at(chirp(1900, 3300, 0.07, 0.12), 0.24, d)), 0.3, 0.07)


def pulse_tick():
    d = 0.12
    return mix(click(5400) * 0.6, ring(2600, [1, 1.9], [0.012, 0.006], [0.2, 0.08], d))


def hud_ping():
    d = 0.7
    t = tt(d)
    f = 1320 * (1 - 0.03 * (1 - np.exp(-t / 0.05)))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16) + 0.35 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR) * np.exp(-t / 0.09)
    return room(body * np.minimum(1, t / 0.003), 0.4, 0.12)


def tamper():
    d = 0.7
    crack = mix(burst(0.06, 3200, 0.5, 0.006) * 2.0, burst(0.04, 900, 0.7, 0.01))
    snap = ring(2350, [1, 2.3, 3.9], [0.03, 0.02, 0.012], [0.5, 0.3, 0.15], 0.2)
    fizz_t = tt(0.32)
    fizz = biquad(noise(0.32), 'bp', 6200, 1.0) * (rng.random(len(fizz_t)) < 0.04) * 3.0 * np.exp(-fizz_t / 0.12)
    return room(mix(crack, at(snap, 0.004, d), at(fizz, 0.03, d), at(chirp(2400, 300, 0.3, 0.18), 0.06, d), at(click(2000) * 0.4, 0.28, d)), 0.3, 0.08)


def tamper_alert():
    d = 0.95
    beep = lambda f0, f1, dur: chirp(f0, f1, dur, 1.0) * 0.6 + biquad(np.sign(chirp(f0, f1, dur, 1.0)), 'lp', 2400) * 0.12
    return room(mix(at(beep(1150, 1100, 0.12), 0.0, d), at(beep(760, 720, 0.16), 0.14, d),
                    at(beep(1150, 1100, 0.12), 0.42, d), at(beep(760, 720, 0.2), 0.56, d)), 0.35, 0.1)


def breach():
    d = 1.8
    debris = np.zeros(int(d * SR)); t = 0.05
    while t < 1.2:
        debris += at(click(rng.uniform(1500, 4200)) * rng.uniform(0.1, 0.4) * np.exp(-t / 0.4), t, d)
        t += rng.uniform(0.01, 0.06)
    blast = biquad(noise(0.6), 'lp', 900) * decay(0.6, 0.12, 0.001) * 1.4
    return room(mix(thud(110, 34, 1.2, 0.35) * 1.6, blast, at(burst(0.2, 2400, 0.6, 0.03), 0.0, d), debris * 0.8), 0.9, 0.22)


def footstep():
    d = 0.26
    grit = biquad(noise(0.08), 'lp', 1800) * decay(0.08, 0.018, 0.001) * 0.7
    scuff = biquad(noise(0.07), 'bp', 2400, 0.9) * np.sin(np.pi * tt(0.07) / 0.07) * 0.12
    return room(mix(thud(150, 70, 0.18, 0.03), grit, at(scuff, 0.035, d)), 0.3, 0.08)


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())


def main():
    for name, fn in (('eject', eject), ('stick', stick), ('pulse_tick', pulse_tick), ('hud_ping', hud_ping), ('tamper', tamper),
                     ('tamper_alert', tamper_alert), ('breach', breach), ('footstep', footstep)):
        write_wav(os.path.join(HERE, f'{name}.wav'), norm(fn(), 0.85))


if __name__ == '__main__':
    main()
