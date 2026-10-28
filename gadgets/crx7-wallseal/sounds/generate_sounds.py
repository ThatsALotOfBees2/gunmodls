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

# ----------------------------------------------------------------- timeline-locked tracks
# Mirrors pose() in viewer.html. m = panel columns per side, stars = number of far-side anchors.
SIZES = {'small': (1, 7, 5, 2), 'standard': (1, 7, 5, 2), 'large': (2, 9, 5, 4), 'xl': (3, 13, 5, 6), 'hatch': (1, 5, 3, 3)}   # m, stars, rows, cols


def timeline(m, rows, cols):
    """panels from the centre outward (the furthest go on last); the frame rides on the outermost panels"""
    h_win = {j: (0.6 + max(0, j - 1) * 0.3, 0.6 + max(0, j - 1) * 0.3 + 0.5) for j in range(1, m + 1)}
    h_end = 1.1 + (m - 1) * 0.3
    v_s = h_end + 0.05
    js = range(0 if cols % 2 else 1, m + 1)
    ks = range(1, (rows - 1) // 2 + 1)
    v_win = {}
    for j in js:
        for k in ks:
            s = v_s + 0.15 + (k - 1) * 0.3 + (j - 1) * 0.08
            v_win[(j, k)] = (s, s + (0.55 if k >= 2 else 0.5))
    beam = (min(a for (j, k), (a, b) in v_win.items() if k == 1),            # beams leave with the first rising row
            min(b for (j, k), (a, b) in v_win.items() if k == max(ks)))      # and land with the first top / bottom row
    v_end = max(b for a, b in v_win.values())
    l0 = v_end + 0.1
    return dict(rail_step=(0.45, 0.6), h_win=h_win, h_end=h_end, v_s=v_s, beam=beam, v_win=v_win, v_end=v_end, l0=l0, total=l0 + 0.55)


def grind(d):
    """rod drilling through concrete: gritty band noise with a little rumble"""
    t = tt(d)
    g = biquad(noise(d), 'bp', 1400, 0.7) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 37 * t)))
    return (g * 0.5 + thud(90, 60, d, d) * 0.25) * np.clip(t / 0.02, 0, 1) * np.clip((d - t) / 0.03, 0, 1)


def hiss(d, level=0.35):
    t = tt(d)
    return biquad(noise(d), 'hp', 2500) * np.clip(t / 0.06, 0, 1) * np.clip((d - t) / 0.08, 0, 1) * level


def slam(level=1.0):
    d = 0.7
    return mix(thud(110, 42, d, 0.18) * 1.4, ring(400, [1, 2.31, 3.9, 5.7, 7.9], [0.25, 0.13, 0.08, 0.045, 0.03], [0.5, 0.35, 0.24, 0.13, 0.07], d), burst(d, 1500, 0.7, 0.018) * 1.5) * level


def beeps(freqs, step=0.12, length=0.1, level=0.5):
    d = step * len(freqs) + 0.3; t = tt(d); out = np.zeros_like(t)
    for k, f in enumerate(freqs):
        tb = t - k * step
        e = np.where(tb >= 0, np.clip(tb / 0.004, 0, 1) * np.clip((length - tb) / 0.03, 0, 1), 0)
        out += (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)) * e
    return out * level


def deploy_track(m, stars, rows, cols):
    T = timeline(m, rows, cols); L = T['total'] + 1.3
    out = np.zeros(int(L * SR))
    def put(x, when, gain=1.0):
        nonlocal out
        out += at(x * gain, when, L)
    put(s_button_press(), 0.14, 0.8)                                        # button bottoms out
    put(motor(T['h_end'] - 0.45, 85, 150, 1150), 0.45, 0.75)                 # one drive: rails step out, then ride out on the columns
    put(ratchet(T['h_end'] - 0.45, 9, 14, 3000, 0.18), 0.45, 0.6)
    put(clank(980, 0.35), T['rail_step'][1])                                 # rails catch the band's side edges
    for j, (a, b) in T['h_win'].items():                                     # columns land, centre outward
        put(clank(720 - 40 * j, 0.6 + 0.1 * j), b)
    put(clank(480, 1.0), T['h_end'])                                         # rails reach the edges with the outermost columns
    vs, (b0, b1) = T['v_s'], T['beam']
    put(motor(T['v_end'] - vs, 110, 185, 1500), vs, 0.7)                     # rows rise; beams ride on the outer rows
    put(ratchet(b1 - b0, 26, 34, 3800, 0.42), b0, 0.7)                       # rail ends telescope with the beams
    put(clank(470, 1.1), b1)                                                 # rails and beams at full travel
    for (j, k), (a, b) in sorted(T['v_win'].items(), key=lambda e: e[1][1]):
        put(clank(700 - 60 * k - 15 * max(j, 0), 0.45 + 0.15 * k), b)       # each row lands; the far corners last
    l0 = T['l0']
    for i in range(stars):                                                   # tie rods punch through, 30 ms apart
        d0 = i * 0.03
        put(grind(0.4), l0 - 0.3 + d0, 0.35)
        put(thud(150, 60, 0.3, 0.06), l0 + 0.1 + d0, 0.45)
    put(hiss(0.43), l0 + 0.02)                                               # bolts and panels driving home
    put(ratchet(0.46, 34, 22, 3300, 0.45), l0 + 0.02, 0.8)                   # stars twisting
    put(slam(), l0 + 0.49)                                                   # everything locks
    put(s_locked(), T['total'], 0.75)
    return room(out, 0.5, 0.1)[:int(L * SR)]


def retract_track(m, stars, rows, cols):
    """deploy played backwards at normal speed: the far corners come off first"""
    T = timeline(m, rows, cols); total = T['total']; L = total + 1.0
    out = np.zeros(int(L * SR))
    def put(x, when, gain=1.0):
        nonlocal out
        out += at(x * gain, when, L)
    r = lambda t: total - t
    l0, vs, (b0, b1) = T['l0'], T['v_s'], T['beam']
    put(burst(0.2, 1800, 0.8, 0.012) * 1.2 + thud(120, 70, 0.2, 0.05) * 0.6, 0.03)   # bolts release
    put(hiss(0.45), r(l0 + 0.5), 0.9)
    put(ratchet(0.46, 22, 34, 3300, 0.45), r(l0 + 0.5), 0.8)                 # stars untwist
    for i in range(stars):
        put(grind(0.4), r(l0 + 0.1 + i * 0.03), 0.3)                        # rods withdraw
    put(motor(T['v_end'] - vs, 185, 110, 1500), r(T['v_end']), 0.7)         # rows come in, corners first
    put(ratchet(b1 - b0, 30, 24, 3800, 0.4), r(b1), 0.7)                    # beams and rail ends come in with the outer rows
    for (j, k), (a, b) in T['v_win'].items():
        put(clank(700 - 60 * k - 15 * max(j, 0), 0.35 + 0.1 * k), r(a))     # each row stowed behind the band
    put(clank(470, 1.0), r(b0))                                              # beams and rails fully in with the last row
    put(motor(T['h_end'] - 0.45, 150, 85, 1150), r(T['h_end']), 0.75)        # columns slide back in, outermost first, rails riding on them
    for j, (a, b) in T['h_win'].items():
        put(clank(720 - 40 * j, 0.5), r(a))
    put(clank(980, 0.3), r(T['rail_step'][1]))                               # rails let go of the band
    put(clank(480, 1.0), r(0.45))                                            # rails back in the housing
    put(beeps([1318.5, 880], 0.13, 0.11, 0.4), r(0.25))                      # stowed
    return room(out, 0.5, 0.1)[:int(L * SR)]


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())


def main():
    for name, fn in ONESHOTS.items():
        write_wav(os.path.join(HERE, f'{name}.wav'), norm(fn()))
    sheet = {}
    for size, (m, stars, rows, cols) in SIZES.items():
        T = timeline(m, rows, cols)
        for kind, fn in (('deploy', deploy_track), ('retract', retract_track)):
            x = fn(m, stars, rows, cols)
            x = np.tanh(x / (np.max(np.abs(x)) + 1e-9) * 1.6) / np.tanh(1.6)
            write_wav(os.path.join(HERE, f'{kind}_{size}.wav'), norm(x, 0.9))
        ev = [(0.14, 'confirm button bottoms out'), (0.45, 'rails step out of the housing'), (0.6, 'rails catch the band edges; columns start sliding out')]
        ev += [(round(b, 3), f'column {j} from the centre lands') for j, (a, b) in sorted(T['h_win'].items())]
        ev += [(round(T['h_end'], 3), 'rails reach the edges with the outermost columns')]
        ev += [(round(T['beam'][0], 3), 'first rows rise; beams and rail ends ride on the outer rows'),
               (round(T['beam'][1], 3), 'beams and rails at full travel with the first top / bottom row')]
        ev += [(round(b, 3), f'row {k} of column {j} lands') for (j, k), (a, b) in sorted(T['v_win'].items(), key=lambda e: e[1][1])]
        ev += [(round(T['l0'] - 0.3, 3), 'tie rods start punching through'), (round(T['l0'] + 0.49, 3), 'lock: bolts, panels and star anchors seat'),
               (round(T['total'], 3), 'locked')]
        sheet[size] = {'clip_seconds': round(T['total'], 3), 'deploy_track': f'deploy_{size}.wav', 'retract_track': f'retract_{size}.wav',
                       'events': [{'t': t, 'event': e} for t, e in ev]}
    with open(os.path.join(HERE, 'cues.json'), 'w') as f:
        json.dump(sheet, f, indent=1)


if __name__ == '__main__':
    main()
