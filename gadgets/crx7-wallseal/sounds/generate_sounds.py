#!/usr/bin/env python3
"""Synthesises the CRX-7 Wallseal sound set (numpy only) and writes 44.1 kHz mono 16-bit WAVs.

    python3 generate_sounds.py            # writes the one-shots and the four deploy_<size>.wav mixes

One-shots are for gameplay events; deploy_<size>.wav is a full mix timed to that size's `deploy` clip.
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


# ----------------------------------------------------------------- one-shots

def s_place():
    d = 0.9
    return room(mix(thud(120, 52, d, 0.12) * 1.0, ring(230, [1, 2.4, 4.1], [0.18, 0.09, 0.05], [0.35, 0.22, 0.12], d), burst(d, 1800, 0.8, 0.012) * 1.1, at(click(5200) * 0.5, 0.012, d)))


def s_touch_tap():
    d = 0.12; t = tt(d)
    f = 1850 - 250 * t / d
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * decay(d, 0.03, 0.001) * 0.7 + burst(d, 6000, 1.5, 0.003) * 0.15


def s_arm_confirmed():
    d = 0.42; t = tt(d)
    def beep(f, start, length):
        tb = t - start; on = (tb >= 0) & (tb < length)
        e = np.where(on, np.clip(tb / 0.004, 0, 1) * np.clip((length - tb) / 0.03, 0, 1), 0)
        return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)) * e
    return room(beep(1175, 0.0, 0.11) * 0.55 + beep(1760, 0.13, 0.2) * 0.6, 0.35, 0.1)


def s_button_press():
    d = 0.15
    return room(mix(burst(d, 2600, 1.2, 0.004) * 1.6, thud(420, 260, d, 0.018) * 0.7, at(burst(0.05, 3400, 1.5, 0.003), 0.045, d) * 0.6), 0.3, 0.1)


def s_motor_spread():
    d = 1.3
    return room(mix(motor(d, 85, 150, 1150), ratchet(d, 9, 14, 3000, 0.18)), 0.45, 0.12)


def s_rail_extend():
    d = 1.05
    return room(mix(motor(d, 110, 185, 1500, 0.9), ratchet(d, 26, 34, 3800, 0.42), biquad(noise(d), 'bp', 1200, 0.6) * 0.05 * decay(d, 0.6)), 0.45, 0.12)


def s_panel_latch():
    return room(clank(640, 0.9), 0.4, 0.14)


def s_lock_bolt():
    d = 0.75; t = tt(d)
    hiss = biquad(noise(d), 'hp', 2500) * np.clip(t / 0.14, 0, 1) * np.exp(-np.maximum(0, t - 0.16) / 0.05) * 0.35
    slam = at(mix(thud(105, 44, 0.6, 0.16) * 1.3, ring(410, [1, 2.31, 3.9, 5.7], [0.22, 0.12, 0.07, 0.04], [0.5, 0.35, 0.22, 0.12], 0.6), burst(0.6, 1600, 0.7, 0.015) * 1.4), 0.15, d)
    return room(hiss + slam, 0.6, 0.16)


def s_anchor_set():
    d = 1.1
    punch = mix(thud(150, 58, 0.5, 0.09) * 1.1, burst(0.5, 900, 0.5, 0.04) * 1.0, biquad(noise(0.5), 'bp', 3200, 0.6) * decay(0.5, 0.05) * 0.5)
    twist = ratchet(0.38, 34, 22, 3300, 0.45)
    seat = clank(520, 0.8)
    return room(mix(at(punch, 0.0, d), at(twist, 0.22, d), at(seat, 0.62, d)), 0.55, 0.15)


def s_locked():
    d = 1.4; t = tt(d)
    def note(f, start, length, a):
        tb = t - start; on = tb >= 0
        e = np.where(on, np.clip(tb / 0.006, 0, 1) * np.exp(-np.maximum(tb, 0) / length), 0)
        return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2.01 * f * t) + 0.1 * np.sin(2 * np.pi * 3 * f * t)) * e * a
    hum = (np.sin(2 * np.pi * 60 * t) * 0.5 + np.sin(2 * np.pi * 120 * t) * 0.3) * np.clip(t / 0.1, 0, 1) * np.exp(-t / 0.5) * 0.35
    return room(note(880, 0.0, 0.25, 0.45) + note(1318.5, 0.12, 0.35, 0.5) + note(1760, 0.24, 0.5, 0.35) + hum, 0.5, 0.12)


def s_retract():
    d = 1.6
    return room(mix(motor(1.35, 150, 80, 1200, 0.95), ratchet(1.35, 30, 18, 3500, 0.3), at(clank(560, 0.8), 1.3, d)), 0.45, 0.12)


ONESHOTS = {
    'place': s_place, 'touch_tap': s_touch_tap, 'arm_confirmed': s_arm_confirmed, 'button_press': s_button_press,
    'motor_spread': s_motor_spread, 'rail_extend': s_rail_extend, 'panel_latch': s_panel_latch,
    'lock_bolt': s_lock_bolt, 'anchor_set': s_anchor_set, 'locked': s_locked, 'retract': s_retract,
}

# deploy timing per size (matches the `deploy` clip in each .glb: m = columns per side)
SIZES = {'small': 1, 'standard': 1, 'large': 2, 'xl': 3}


def cues(m):
    h_end = 1.1 if m == 1 else 0.85 + (m - 1) * 0.4
    v_s = h_end + 0.05
    l0 = v_s + 1.1
    total = l0 + 0.55
    c = [(0.04, 'button_press', None), (0.45, 'motor_spread', h_end - 0.45 + 0.1)]
    for j in range(m, 0, -1):
        s = 0.45 + (m - j) * 0.4
        c.append((s + (0.65 if j == m else 0.4) - 0.03, 'panel_latch', None))
    c += [(v_s, 'rail_extend', None), (v_s + 0.83, 'panel_latch', None), (v_s + 0.98, 'panel_latch', None),
          (l0 - 0.3, 'anchor_set', None), (l0 + 0.12, 'lock_bolt', None), (total - 0.05, 'locked', None)]
    return c, total


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())


def main():
    shots = {}
    for name, fn in ONESHOTS.items():
        x = norm(fn())
        shots[name] = x
        write_wav(os.path.join(HERE, f'{name}.wav'), x)
    sheet = {}
    for size, m in SIZES.items():
        c, total = cues(m)
        length = total + 1.2
        out = np.zeros(int(length * SR))
        for when, name, dur in c:
            x = shots[name].copy()
            if dur:  # trim a sustained sound to its phase, with a short fade
                n = int(dur * SR); x = x[:n]; f = min(len(x), int(0.1 * SR)); x[-f:] *= np.linspace(1, 0, f)
            gain = {'panel_latch': 0.6, 'touch_tap': 0.5}.get(name, 0.8)
            out += at(x * gain, when, length)
        out = np.tanh(out * 1.1) / np.tanh(1.1)
        write_wav(os.path.join(HERE, f'deploy_{size}.wav'), norm(out, 0.9))
        sheet[size] = {'clip_seconds': round(total, 3), 'cues': [{'t': round(w, 3), 'sound': n, **({'trim': round(d, 3)} if d else {})} for w, n, d in c]}
    with open(os.path.join(HERE, 'cues.json'), 'w') as f:
        json.dump(sheet, f, indent=1)


if __name__ == '__main__':
    main()
