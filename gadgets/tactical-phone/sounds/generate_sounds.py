#!/usr/bin/env python3
"""Synthesises the Tactical Phone sounds (shared with the Tactical Tablet: the device set plus the radio key-up / release pair) (numpy only) and writes 44.1 kHz mono 16-bit WAVs next to this file.

    wake.wav         soft rising two-tone chime after a click (wake clip 0.25 s; boot cells)
    unlock.wav       short upward sweep with a soft tick (unlock clip 0.42 s)
    tap.wav          a glass tick under the thumb (Tap(), every touch on the screen)
    scan.wav         rising sweep and four soft pings (the thermal scan) (scan clip 0.3 s: pings at +0, +0.2, +0.4, +0.6 s)
    scan_result.wav  lock-on double tone (scan clip 1.0 s, the lock_on cell)
    alert.wav        urgent 4 Hz pulse, a seamless 1.0 s loop (alert clip / state)
    low_battery.wav  descending triple tone
    power_off.wav    falling sweep into a soft thud (power_off clip 0.6 s)
    button.wav       rubber side-key click (any key press: wake, scan, power_off at 0.05 s)
    flap_open.wav    rubber port flap popping open (flap_open clip)
    flap_close.wav   flap snapping shut (flap_open played backwards)
    draw.wav         pulled from a pouch: fabric and grip rustle with a clack (holder's draw)
    holster.wav      put away: rustle and a softer clack (holder's holster)
    ptt_chirp.wav    radio key-up: a squelch break and a short rising two-tone chirp (ptt clip 0.1 s)
    ptt_release.wav  key release: a single roger beep and a squelch tail (ptt clip 1.4 s)
"""
import os, wave
import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(41)


def tt(d):
    return np.arange(int(d * SR)) / SR


def noise(d):
    return rng.standard_normal(int(d * SR))


def biquad(x, kind, f, q=0.707):
    """RBJ cookbook biquad: lp, hp, bp (0 dB peak)."""
    w = 2 * np.pi * f / SR
    cw, sw = np.cos(w), np.sin(w)
    al = sw / (2 * q)
    if kind == 'lp':
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'hp':
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    else:
        b = [al, 0, -al]; a = [1 + al, -2 * cw, 1 - al]
    b = np.array(b) / a[0]; a = np.array(a) / a[0]
    y = np.zeros_like(x); x1 = x2 = y1 = y2 = 0.0
    b0, b1, b2, a1, a2 = b[0], b[1], b[2], a[1], a[2]
    for i, xi in enumerate(x):
        yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, xi, y1, yi
        y[i] = yi
    return y


def env(d, a=0.003, tau=0.1):
    t = tt(d)
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / tau)


def tone(f, d, a=0.004, tau=0.15, harm=(1.0, 0.25, 0.08)):
    t = tt(d)
    s = sum(h * np.sin(2 * np.pi * f * (k + 1) * t) for k, h in enumerate(harm))
    return s * env(d, a, tau)


def sweep(f0, f1, d, a=0.01, tau=None, curve=2.0):
    t = tt(d); u = t / d
    f = f0 + (f1 - f0) * u ** curve if f1 > f0 else f1 + (f0 - f1) * (1 - u) ** curve
    ph = 2 * np.pi * np.cumsum(f) / SR
    e = np.minimum(1, t / a) * (np.exp(-t / tau) if tau else np.minimum(1, (d - t) / 0.03))
    return (np.sin(ph) + 0.2 * np.sin(2 * ph)) * e


def click(d=0.012, f=3500, q=2.0, tau=0.0025):
    return biquad(noise(d), 'bp', f, q) * env(d, 0.0003, tau)


def thump(f=110, d=0.08, tau=0.025):
    t = tt(d); fr = f * (1 + 0.8 * np.exp(-t / 0.01))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * env(d, 0.001, tau)


def at(dst, src, t0, g=1.0):
    i = int(t0 * SR); n = min(len(src), len(dst) - i)
    if n > 0: dst[i:i + n] += src[:n] * g
    return dst


def buf(d):
    return np.zeros(int(d * SR))


def write(name, x, peak=0.85):
    x = x - np.mean(x)
    m = np.max(np.abs(x)) or 1
    x = x / m * peak
    fade = min(len(x), int(0.004 * SR)); x[-fade:] *= np.linspace(1, 0, fade)
    with wave.open(os.path.join(HERE, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
    print(name, round(len(x) / SR, 2), 's')


def key_click():
    x = buf(0.09)
    at(x, thump(140, 0.06, 0.012), 0, 0.8)
    at(x, click(0.01, 2600, 1.5, 0.0018), 0.002, 0.6)
    at(x, click(0.008, 1800, 2.0, 0.0015), 0.045, 0.25)   # the release
    return x


def main():
    # wake: key click, then a soft rising two-tone chime
    x = buf(1.0)
    at(x, click(0.01, 3000, 2, 0.002), 0, 0.4)
    at(x, tone(660, 0.55, 0.01, 0.22), 0.06, 0.55)
    at(x, tone(990, 0.6, 0.01, 0.28), 0.22, 0.6)
    at(x, tone(1320, 0.5, 0.02, 0.2, (1.0,)), 0.24, 0.12)
    write('wake', x)

    x = buf(0.35)
    at(x, sweep(420, 1500, 0.22, 0.006, 0.12, 1.6), 0, 0.6)
    at(x, click(0.008, 4200, 3, 0.0015), 0.2, 0.35)
    write('unlock', x)

    x = buf(0.06)
    at(x, click(0.012, 5200, 3.5, 0.0022), 0, 1.0)
    at(x, tone(3100, 0.04, 0.0005, 0.006, (1.0,)), 0, 0.35)
    write('tap', x, 0.6)

    # scan: rising sweep under four pings at +0 / +0.2 / +0.4 / +0.6 s (the lug flashes)
    x = buf(1.05)
    sw = sweep(260, 1900, 0.8, 0.03, None, 1.4) * 0.35
    at(x, biquad(sw, 'lp', 3500), 0)
    for k, t0 in enumerate([0.0, 0.2, 0.4, 0.6]):
        at(x, tone(1400 + 140 * k, 0.3, 0.002, 0.07, (1.0, 0.15)), t0, 0.55)
    at(x, biquad(noise(0.8), 'bp', 2200, 4) * np.linspace(0.0, 0.12, int(0.8 * SR)), 0)
    write('scan', x)

    x = buf(0.5)
    at(x, tone(880, 0.25, 0.002, 0.09), 0, 0.6); at(x, tone(1320, 0.3, 0.002, 0.12), 0.1, 0.7)
    write('scan_result', x)

    # alert: four 1150 Hz pulses per second with a little warble, seamless over 1.0 s
    x = buf(1.0); t = tt(0.1)
    p = np.sign(np.sin(2 * np.pi * 1150 * t)) * 0.35 + np.sin(2 * np.pi * 1150 * t) * 0.65
    p = biquad(p, 'lp', 5000) * np.minimum(1, t / 0.004) * np.minimum(1, (0.1 - t) / 0.01)
    for k in range(4): at(x, p * (1.0 if k % 2 == 0 else 0.85), k * 0.25)
    write('alert', x, 0.8)

    x = buf(0.75)
    for k, f in enumerate([880, 660, 440]): at(x, tone(f, 0.22, 0.004, 0.09), k * 0.18, 0.7)
    write('low_battery', x)

    x = buf(0.75)
    at(x, sweep(900, 110, 0.5, 0.01, None, 1.2), 0, 0.5)
    at(x, thump(70, 0.2, 0.06), 0.48, 0.8)
    write('power_off', x)

    write('button', key_click(), 0.75)

    x = buf(0.2)
    at(x, thump(220, 0.08, 0.018), 0, 0.6); at(x, biquad(noise(0.05), 'bp', 900, 1.2) * env(0.05, 0.001, 0.012), 0.004, 0.5)
    at(x, click(0.01, 1800, 2, 0.002), 0.07, 0.3)
    write('flap_open', x, 0.7)

    x = buf(0.15)
    at(x, click(0.012, 2400, 1.8, 0.0025), 0, 0.8); at(x, thump(180, 0.06, 0.012), 0.002, 0.6)
    write('flap_close', x, 0.75)

    def rustle(d, f=1600):
        n = biquad(biquad(noise(d), 'bp', f, 0.8), 'hp', 300)
        t = tt(d); e = np.sin(np.pi * t / d) ** 1.5 * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 7 * t)))
        return n * e
    x = buf(0.55)
    at(x, rustle(0.4), 0, 0.5); at(x, thump(160, 0.08, 0.02), 0.38, 0.9); at(x, click(0.01, 2200, 1.5, 0.002), 0.385, 0.6)
    write('draw', x, 0.7)
    x = buf(0.55)
    at(x, click(0.01, 1800, 1.5, 0.002), 0.02, 0.4); at(x, thump(120, 0.08, 0.02), 0.02, 0.5); at(x, rustle(0.45, 1200), 0.05, 0.5)
    write('holster', x, 0.65)
    # radio key-up: band-passed squelch break, then a 1250 -> 1650 Hz two-tone chirp
    x = buf(0.26)
    at(x, biquad(noise(0.05), 'bp', 2200, 0.8) * env(0.05, 0.002, 0.018), 0.0, 0.5)
    at(x, tone(1250, 0.06, 0.003, 0.05), 0.05, 0.6)
    at(x, tone(1650, 0.09, 0.003, 0.06), 0.11, 0.6)
    write('ptt_chirp', x, 0.7)
    # release: a 1000 Hz roger beep and a short squelch tail
    x = buf(0.32)
    at(x, tone(1000, 0.12, 0.003, 0.08), 0.0, 0.6)
    at(x, biquad(noise(0.16), 'bp', 2600, 0.7) * env(0.16, 0.004, 0.05), 0.13, 0.45)
    write('ptt_release', x, 0.7)


if __name__ == '__main__':
    main()
