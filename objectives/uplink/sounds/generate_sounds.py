#!/usr/bin/env python3
"""Synthesises the Uplink sounds (numpy only) and writes 44.1 kHz mono 16-bit WAVs.

Server (uplink-server.glb):
    server_hum.wav     fans and power supplies; loop it at the server all round (4.0 s seamless loop)
    server_open.wav    the link clip: handle unlatches, the door swings open and stops, the port shutter flips
                       open (1.2 s, plays with the server's link clip)
    shutter.wav        the sprung port shutter flipping on its own (a short spring snap)
    server_close.wav   the abort clip: shutter snaps shut, door swings shut, handle relatches (1.0 s)
    alarm.wav          the site alarm chirp; repeat every 1.5 s while an upload runs

Laptop (uplink-laptop.glb):
    set_down.wav       the heavy laptop put down on the floor (plant 0.0 s)
    latches.wav        the two latch clamps popping (deploy 0.55 s)
    lid_open.wav       the lid swinging open on its stiff hinge, with the stop bump (deploy 0.80 s)
    cable_door.wav     the cable bay door dropping open with a bounce, and the plug popping up (deploy 1.65 s)
    deploy.wav         all of the deploy clip in one file (set down, latches, lid, feet, bay door, plug pop; 2.4 s)
    cable_pay.wav      the cable reel ratchet paying out (link 0.05-1.40 s)
    plug_lock.wav      the plug seating in the server port and the collar twist-locking (link 1.30 s)
    handshake.wav      a short rising beep pair: the link is up (plant 4.0 s)
    upload_loop.wav    data chatter while uploading: hum, drive seeks, soft carrier (2.0 s seamless loop)
    progress_tick.wav  one progress segment filled (every 4.5 s of the upload)
    complete.wav       upload complete: ascending tones, the flag lever clunk and the port lock click
    disable_hold.wav   a whine loop while a defender holds disable; raise its pitch with the hold (1.0 s loop)
    disable.wav        the laptop disabled: zap, crunch, spark crackle and a power-down
    plug_eject.wav     the plug yanked out of the port and clattering onto the floor
    abort.wav          the server giving up the link: a falling power-down chirp
    pack.wav           the pack clip: reel in, bay door, feet, lid shut, latches, handle out (1.8 s)
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


def loop_filter(x, kind, f, q=0.707):
    """Filter a loop seamlessly: run it twice and keep the second pass."""
    return biquad(np.concatenate([x, x]), kind, f, q)[len(x):]


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
    """Server room: exponentially decaying, darkened noise as the impulse response."""
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
    return mix(burst(0.03, f, 1.4, 0.004) * 2.5, ring(1900, [1, 2.7], [0.006, 0.004], [0.3, 0.2], 0.03))


def clank(f0=620, level=1.0):
    d = 0.5
    return (ring(f0, [1, 2.21, 3.62, 5.13, 7.4], [0.12, 0.08, 0.05, 0.035, 0.02], [0.6, 0.45, 0.3, 0.2, 0.1], d)
            + burst(d, 2800, 0.9, 0.01) * 1.2 + thud(140, 65, d, 0.07) * 0.6) * level


def snap(f=2600, level=1.0):
    """A sprung latch letting go: a sharp click with a short spring ring."""
    d = 0.12
    return mix(click(f), ring(f * 0.55, [1, 1.9], [0.03, 0.02], [0.25, 0.15], d), thud(320, 160, d, 0.015) * 0.4) * level


def ratchet(d, rate0, rate1, f=3600, level=0.5, shape=None):
    """Pawl clicks: rate goes rate0 -> rate1 (or follows shape(u) in 0..1 between them)."""
    out = np.zeros(int(d * SR)); t = 0.0
    while t < d - 0.03:
        u = t / d
        k = shape(u) if shape else u
        out += at(click(f + rng.uniform(-300, 300)) * level * rng.uniform(0.7, 1.0), t, d)
        t += 1.0 / max(1.0, rate0 + (rate1 - rate0) * k)
    return out


def creak(d, f0=180, f1=120, level=0.4):
    """Hinge friction: a rough, slowly sliding tone made of stick-slip pulses."""
    t = tt(d); f = f0 + (f1 - f0) * t / d
    ph = np.cumsum(f * (1 + 0.08 * rng.standard_normal(len(t)).cumsum() / np.sqrt(np.arange(1, len(t) + 1)))) / SR
    pulses = np.exp(-((ph % 1) * 9)) - 0.11
    env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
    return biquad(pulses, 'bp', 1400, 0.9) * env * level


def whoosh(d, f=700, level=0.4):
    t = tt(d)
    return biquad(noise(d), 'bp', f, 0.8) * np.sin(np.pi * t / d) ** 2 * level


def chirp(f0, f1, d, level=0.3):
    t = tt(d); f = f0 * (f1 / f0) ** (t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.clip(t / 0.008, 0, 1) * np.clip((d - t) / 0.02, 0, 1) * level


def beep(f, d, level=0.5):
    t = tt(d)
    sq = np.sign(np.sin(2 * np.pi * f * t)) * 0.35 + np.sin(2 * np.pi * f * t) * 0.65
    return biquad(sq, 'lp', 5200) * np.clip(t / 0.004, 0, 1) * np.clip((d - t) / 0.012, 0, 1) * level


def tone(f, d, tau, level=0.5):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)) * decay(d, tau, 0.004) * level


def crackle(d, rate=120, level=1.0):
    """Electrical sparking: random sharp ticks, thinning out."""
    out = np.zeros(int(d * SR)); t = 0.0
    while t < d - 0.02:
        out += at(burst(0.02, rng.uniform(2500, 7000), 2.0, 0.0015) * rng.uniform(0.4, 1.0) * (1 - t / d), t, d)
        t += rng.exponential(1.0 / rate)
    return out * level


def powerdown(d, f0=190, f1=35, level=0.7):
    t = tt(d); u = t / d
    f = f0 * (f1 / f0) ** u
    ph = np.cumsum(f) / SR
    x = np.sin(2 * np.pi * ph) * 0.7 + np.sin(2 * np.pi * 2 * ph) * 0.3 + np.sin(2 * np.pi * 3 * ph) * 0.12
    return x * (1 - u) ** 1.3 * np.clip(t / 0.01, 0, 1) * level


# ----------------------------------------------------------------- server

def server_hum():
    d = 4.0; t = tt(d)
    # whole cycles only (4 s loop): mains hum 120 Hz, two fans at 92 and 97 Hz blade rate
    hum = np.sin(2 * np.pi * 120 * t) * 0.12 + np.sin(2 * np.pi * 240 * t + 0.3) * 0.05
    fans = sum(np.sin(2 * np.pi * f * t + p) * a for f, p, a in ((92.0, 0.0, 0.07), (97.0, 1.1, 0.06), (184.0, 0.4, 0.03)))
    air = loop_filter(noise(d), 'lp', 900) * 0.22 + loop_filter(noise(d), 'bp', 2600, 0.6) * 0.05
    swirl = 1 + 0.08 * np.sin(2 * np.pi * 0.25 * t) + 0.05 * np.sin(2 * np.pi * 1.75 * t)
    psu = np.sin(2 * np.pi * 7800 * t) * 0.004
    return (hum + fans + air * swirl + psu)


def shutter():
    d = 0.3
    return room(mix(snap(3400, 0.8), at(ring(5200, [1, 1.4], [0.04, 0.03], [0.12, 0.08], 0.2), 0.01, d),
                    at(click(4100) * 0.35, 0.09, d)), 0.25, 0.08)


def server_open():
    d = 1.5
    return room(mix(at(click(2400) * 0.5, 0.02, d), at(snap(1800, 0.9), 0.17, d),                 # handle turns, latch lets go
                    at(thud(240, 120, 0.1, 0.02) * 0.4, 0.2, d),                                   # door pops ajar
                    at(creak(0.55, 210, 150, 0.35), 0.28, d), at(whoosh(0.55, 500, 0.25), 0.28, d),
                    at(clank(380, 0.35), 0.84, d), at(thud(110, 60, 0.3, 0.05) * 0.5, 0.84, d),   # hinge stop
                    at(shutter() * 0.9, 0.80, d)), 0.45, 0.12)


def server_close():
    d = 1.3
    return room(mix(at(click(3000) * 0.7, 0.0, d), at(shutter() * 0.9, 0.05, d),
                    at(whoosh(0.5, 450, 0.25), 0.30, d), at(creak(0.4, 170, 230, 0.25), 0.32, d),
                    at(thud(150, 55, 0.4, 0.07) * 1.0, 0.80, d), at(clank(300, 0.45), 0.80, d),        # door shuts on the frame
                    at(snap(2000, 0.8), 0.95, d)), 0.5, 0.14)


def alarm():
    d = 0.5
    return mix(at(beep(1320, 0.11, 0.55), 0.0, d), at(beep(990, 0.16, 0.55), 0.13, d))


# ----------------------------------------------------------------- laptop

def set_down():
    d = 0.45
    return room(mix(thud(160, 60, d, 0.06) * 1.2, burst(0.1, 900, 0.7, 0.02) * 0.6, at(clank(820, 0.12), 0.005, d),
                    at(thud(190, 80, 0.15, 0.02) * 0.3, 0.09, d)), 0.35, 0.1)


def latches():
    d = 0.35
    return mix(at(snap(2300, 1.0), 0.0, d), at(snap(2150, 0.9), 0.07, d))


def lid_open():
    d = 0.9
    return room(mix(at(click(2600) * 0.4, 0.0, d), at(creak(0.55, 150, 115, 0.3), 0.02, d), at(whoosh(0.5, 600, 0.15), 0.05, d),
                    at(thud(170, 90, 0.2, 0.03) * 0.45, 0.58, d), at(click(1800) * 0.3, 0.6, d)), 0.3, 0.08)


def cable_door():
    d = 0.6
    return room(mix(at(click(2800) * 0.5, 0.0, d), at(thud(260, 120, 0.15, 0.02) * 0.6, 0.33, d), at(clank(1100, 0.2), 0.33, d),
                    at(thud(260, 130, 0.1, 0.015) * 0.25, 0.43, d), at(snap(3000, 0.6), 0.36, d)), 0.3, 0.08)


def feet():
    d = 0.3
    return mix(at(snap(2700, 0.5), 0.0, d), at(snap(2550, 0.45), 0.03, d), at(thud(200, 90, 0.15, 0.02) * 0.3, 0.05, d))


def deploy():
    d = 2.6
    return mix(set_down(), at(latches(), 0.55, d), at(lid_open(), 0.80, d), at(feet(), 1.35, d), at(cable_door(), 1.65, d))


def cable_pay():
    d = 1.45
    # pawl clicks follow the reel speed: ease in-out over 0.05-1.20 s, then the small overrun
    sp = lambda u: np.sin(np.pi * np.clip((u * d - 0.05) / 1.15, 0, 1))
    clicks = ratchet(d, 14, 70, 3300, 0.45, shape=sp)
    t = tt(d); v = sp(t / d)
    whirr = biquad(noise(d), 'bp', 1500, 1.2) * v * 0.12 + np.sin(2 * np.pi * np.cumsum(180 + 260 * v) / SR) * v * 0.05
    return room(mix(clicks, whirr, at(click(2900) * 0.4, 1.25, d)), 0.3, 0.08)


def plug_lock():
    d = 0.6
    return room(mix(thud(210, 90, 0.3, 0.03) * 0.9, clank(900, 0.3), at(ratchet(0.15, 40, 60, 4200, 0.35), 0.06, d),
                    at(snap(2200, 1.0), 0.22, d), at(ring(1500, [1, 2.4], [0.08, 0.05], [0.15, 0.08], 0.3), 0.22, d)), 0.3, 0.1)


def handshake():
    d = 0.5
    return mix(at(beep(1180, 0.07, 0.4), 0.0, d), at(beep(1770, 0.12, 0.45), 0.1, d), at(chirp(2400, 3600, 0.08, 0.05), 0.24, d))


def upload_loop():
    d = 2.0; t = tt(d)
    carrier = np.sin(2 * np.pi * 220 * t) * 0.06 + np.sin(2 * np.pi * 330 * t + 0.5) * 0.03
    carrier *= 1 + 0.4 * np.sin(2 * np.pi * 4 * t)       # pulse at 4 Hz (whole cycles in the loop)
    hum = loop_filter(noise(d), 'lp', 500) * 0.12
    # drive seeks: little gated buzzes at seeded times, wrapped into the loop
    seeks = np.zeros(len(t))
    for _ in range(26):
        s = rng.uniform(0, d); ln = rng.uniform(0.015, 0.05)
        b = burst(ln + 0.02, rng.uniform(1800, 4200), 2.2, ln * 0.6) * rng.uniform(0.25, 0.6)
        i = int(s * SR); idx = (np.arange(len(b)) + i) % len(t); seeks[idx] += b
    chatter = np.zeros(len(t))
    for k in range(16):                                     # a soft data blip every 1/8 s
        f = 2600 + 300 * ((k * 5) % 7)
        b = beep(f, 0.025, 0.03); i = int(k * d / 16 * SR); chatter[i:i + len(b)] += b[:len(t) - i]
    return carrier + hum + seeks + chatter


def progress_tick():
    d = 0.14
    return mix(beep(2350, 0.05, 0.5), at(beep(3520, 0.05, 0.3), 0.055, d))


def complete():
    d = 1.6
    return room(mix(at(tone(660, 0.35, 0.12, 0.45), 0.0, d), at(tone(880, 0.35, 0.12, 0.45), 0.12, d), at(tone(1320, 0.7, 0.3, 0.5), 0.24, d),
                    at(snap(1900, 0.7), 0.30, d), at(thud(170, 80, 0.2, 0.03) * 0.6, 0.52, d),   # flag lever up, base clunk
                    at(snap(2700, 0.8), 0.85, d)), 0.55, 0.16)                                # the server's port lock


def disable_hold():
    d = 1.0; t = tt(d)
    # whole cycles at 1 s: a rising-feeling whine (playbackRate raises it in the game) over a buzz
    w = np.sin(2 * np.pi * 1400 * t) * 0.18 + np.sin(2 * np.pi * 2100 * t) * 0.06
    buzz = np.sign(np.sin(2 * np.pi * 60 * t)) * 0.06
    flick = 1 + 0.25 * np.sin(2 * np.pi * 8 * t)
    return (w * flick + loop_filter(buzz, 'lp', 1200) + loop_filter(noise(d), 'bp', 3000, 1.0) * 0.04)


def disable():
    d = 1.6
    zap = mix(burst(0.08, 3600, 0.6, 0.012) * 2.0, chirp(5200, 600, 0.12, 0.35), thud(300, 90, 0.25, 0.04) * 0.9)
    return room(mix(zap, at(clank(700, 0.45), 0.0, d), at(crackle(0.7, 150, 0.6), 0.03, d),
                    at(powerdown(0.9, 240, 30, 0.6), 0.08, d), at(thud(150, 70, 0.3, 0.05) * 0.6, 0.35, d),
                    at(click(2400) * 0.4, 0.5, d), at(crackle(0.5, 40, 0.3), 0.75, d)), 0.45, 0.12)


def plug_eject():
    d = 0.9
    pop = mix(burst(0.05, 1800, 0.8, 0.01) * 1.4, thud(260, 120, 0.12, 0.02) * 0.6, click(3200) * 0.5)
    return room(mix(pop, at(clank(1250, 0.4), 0.39, d), at(thud(220, 100, 0.15, 0.02) * 0.5, 0.39, d),
                    at(clank(1400, 0.15), 0.52, d), at(click(2600) * 0.25, 0.6, d)), 0.4, 0.1)


def abort():
    d = 0.8
    return room(mix(chirp(1600, 420, 0.35, 0.18), at(powerdown(0.6, 180, 50, 0.4), 0.05, d), at(beep(520, 0.12, 0.3), 0.4, d)), 0.4, 0.1)


def pack():
    d = 2.0
    reel = ratchet(0.6, 50, 18, 3300, 0.35)
    return room(mix(reel, at(whoosh(0.5, 1300, 0.1), 0.0, d), at(cable_door() * 0.8, 0.10, d), at(feet() * 0.8, 0.68, d),
                    at(whoosh(0.4, 500, 0.2), 0.9, d), at(thud(150, 60, 0.3, 0.05) * 0.9, 1.33, d), at(clank(700, 0.2), 1.33, d),
                    at(snap(2300, 0.8), 1.44, d), at(snap(2150, 0.8), 1.53, d), at(click(2000) * 0.5, 1.75, d)), 0.35, 0.1)


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())


SOUNDS = (('server_hum', server_hum), ('server_open', server_open), ('shutter', shutter), ('server_close', server_close),
          ('alarm', alarm), ('set_down', set_down), ('latches', latches), ('lid_open', lid_open), ('cable_door', cable_door),
          ('deploy', deploy), ('cable_pay', cable_pay), ('plug_lock', plug_lock), ('handshake', handshake),
          ('upload_loop', upload_loop), ('progress_tick', progress_tick), ('complete', complete),
          ('disable_hold', disable_hold), ('disable', disable), ('plug_eject', plug_eject), ('abort', abort), ('pack', pack))
LOOPS = {'server_hum', 'upload_loop', 'disable_hold'}


def main():
    for name, fn in SOUNDS:
        x = fn()
        # loops keep their exact length (no reverb tail) so they wrap cleanly
        write_wav(os.path.join(HERE, f'{name}.wav'), norm(x, 0.6 if name in LOOPS else 0.85))


if __name__ == '__main__':
    main()
