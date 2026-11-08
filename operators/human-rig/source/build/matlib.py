"""Shared material library for operators/human-rig (FROZEN after the design phase: module agents import it,
never edit it; ask the integrator for changes).

Every gear material is a *tiling* PBR set (albedo sRGB, OpenGL normal, ORM = AO/rough/metal) generated here with
numpy so all four build groups look identical, plus one 2K *trim sheet* (MAT_Webbing) for straps, binding, zippers,
elastic, hook velcro and stitched seams.

UV contract: UV map 'UVMap', authored in TILE UNITS, i.e. uv = metres / MATS[name]['tile'] for tiling materials
(use common.uv_box / common.uv_cyl / common.uv_planar, which take the material name).  The trim sheet is
0.256 m along U per 1.0 and each row occupies the V band in TRIM_ROWS (common.uv_trim_strip maps a quad strip).

Usage (inside any build script, bpy loaded):
    import matlib
    matlib.ensure_textures()            # generates rig/textures/lib/*.png once (~40 s), cached afterwards
    m = matlib.get('MAT_Cordura')       # bpy material (created once per .blend)
    matlib.assign(ob, ['MAT_Cordura', 'MAT_Webbing'])
Standalone:  venv/bin/python rig/build/matlib.py [--force] [--preview]
"""
import os, sys, math
import numpy as np

RIG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB = os.path.join(RIG, 'textures', 'lib')

# ------------------------------------------------------------------------------------------------ catalogue
# tile: metres covered by UV 0..1;  amp: height range of the normal map in mm;  owner: group that may request
# tuning (everyone may USE every material).
MATS = {
    'MAT_Cordura':    dict(tile=0.080, res=1024, amp=0.30, owner='armor',        use='500D cordura: carrier, pouches, belt sleeve, helmet cover, holster leg platform'),
    'MAT_Ripstop':    dict(tile=0.060, res=1024, amp=0.16, owner='base',         use='NYCO 50/50 ripstop: shirt sleeves/yoke, trousers'),
    'MAT_Jersey':     dict(tile=0.030, res=1024, amp=0.09, owner='base',         use='wicking knit: combat-shirt torso, collar'),
    'MAT_Leather':    dict(tile=0.050, res=1024, amp=0.12, owner='base',         use='synthetic leather/suede: boot toe/heel caps, glove palm + fingertip patches'),
    'MAT_Rubber':     dict(tile=0.050, res=1024, amp=0.03, owner='base',         use='outsoles, knuckle/pad caps (TPR), ear seals, eyecup/goggle frame'),
    'MAT_Velcro':     dict(tile=0.020, res=1024, amp=0.18, owner='armor',        use='loop field: carrier admin/ID panel, helmet loop panels, belt inner'),
    'MAT_ShellPaint': dict(tile=0.050, res=1024, amp=0.08, owner='armor',        use='helmet composite shell, plate-insert visible edges, textured paint'),
    'MAT_Webbing':    dict(tile=0.256, res=2048, amp=0.35, owner='loadbearing',  use='TRIM SHEET: webbing 25/38/45 mm, elastic, binding, zipper, hook velcro, stitched seam'),
    'MAT_Elastic':    dict(tile=0.020, res=1024, amp=0.25, owner='loadbearing',  use='braided shock cord/bungee, wide knit elastic (glove cuffs, retention loops)'),
    'MAT_Polymer':    dict(tile=0.030, res=1024, amp=0.04, owner='loadbearing',  use='molded polymer: magazines, buckles, radio body, TQ windlass, pad shells, PTT'),
    'MAT_Kydex':      dict(tile=0.040, res=1024, amp=0.07, owner='sidearm_misc', use='thermoformed kydex: holster shells, knife sheath, pistol-mag shells'),
    'MAT_MetalHW':    dict(tile=0.020, res=1024, amp=0.01, owner='sidearm_misc', use='dark phosphate/anodised metal: buckle bars, rivets, screws, eyelets, pistol slide, rails'),
    'MAT_Lens':       dict(tile=None,  res=0,    amp=0.0,  owner='sidearm_misc', use='smoked ballistic lens (alpha blend 0.74, IOR 1.59)'),
    'MAT_LED':        dict(tile=None,  res=0,    amp=0.0,  owner='armor',        use='the ONLY purple #8a4dff emitter; at most 2 tiny parts in the whole loadout'),
}
DARKEN = {'MAT_Cordura': 0.80, 'MAT_Webbing': 0.80, 'MAT_Elastic': 0.85, 'MAT_Velcro': 0.90}
ACCENT = (0x8a / 255, 0x4d / 255, 0xff / 255)

# trim sheet rows: name -> (v0, v1, physical width mm). 8 px/mm both axes; 0.256 m per U unit.
_ROWS = [('web25', 25), ('web25_stitched', 25), ('web38', 38), ('web45', 45), ('elastic25', 25),
         ('binding20', 20), ('zipper20', 20), ('hook25', 25), ('seam24', 24)]
TRIM_PX = 2048
TRIM_PXMM = 8.0
TRIM_ROWS = {}
_y = 4                               # px from the TOP of the image; 8 px bleed between rows
for _n, _w in _ROWS:
    _h = int(_w * TRIM_PXMM)
    TRIM_ROWS[_n] = (1 - (_y + _h) / TRIM_PX, 1 - _y / TRIM_PX, float(_w))   # (v_bottom, v_top, width_mm)
    _y += _h + 8
assert _y <= TRIM_PX + 8, _y


# ------------------------------------------------------------------------------------------------ numpy helpers
def _grid(n):
    g = (np.arange(n) + 0.5) / n
    return np.meshgrid(g, g)                      # U (cols, left->right), V' (rows, top->bottom) both in [0,1)


def spectral(n, f0, bw=0.5, seed=0, aniso=(1.0, 1.0)):
    """periodic band-limited noise, f0 = cycles per tile, normalised to [0,1]."""
    rng = np.random.default_rng(seed)
    fx = np.fft.fftfreq(n) * n; fy = np.fft.fftfreq(n) * n
    FX, FY = np.meshgrid(fx * aniso[0], fy * aniso[1])
    r = np.sqrt(FX ** 2 + FY ** 2) + 1e-6
    filt = np.exp(-(np.log(r / f0) ** 2) / (2 * bw ** 2))
    a = np.fft.ifft2(np.fft.fft2(rng.standard_normal((n, n))) * filt).real
    a -= a.min(); a /= (a.max() + 1e-9)
    return a


def fbm(n, f0, octaves=4, seed=0):
    out = np.zeros((n, n)); amp = 1.0; tot = 0
    for o in range(octaves):
        out += amp * spectral(n, f0 * 2 ** o, 0.6, seed + o); tot += amp; amp *= 0.5
    return out / tot


def worley(n, cells, seed=0):
    """periodic F1 distance (in cell units) of a jittered grid."""
    rng = np.random.default_rng(seed)
    pts = rng.random((cells, cells, 2))
    U, V = _grid(n)
    X, Y = U * cells, V * cells
    ix, iy = np.floor(X).astype(int), np.floor(Y).astype(int)
    best = np.full((n, n), 9.0)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            cx, cy = ix + dx, iy + dy
            p = pts[cy % cells, cx % cells]
            d = np.sqrt((cx + p[..., 0] - X) ** 2 + (cy + p[..., 1] - Y) ** 2)
            best = np.minimum(best, d)
    return best


def blur(a, r):
    n = a.shape[0]; f = np.fft.fftfreq(n)
    FX, FY = np.meshgrid(f, f)
    return np.fft.ifft2(np.fft.fft2(a) * np.exp(-(FX ** 2 + FY ** 2) * (2 * np.pi * r) ** 2 / 2)).real


def tube(d, rad):
    """round-yarn cross section: 1 at the centreline, 0 at |d| = rad."""
    return np.sqrt(np.clip(1 - (d / rad) ** 2, 0, 1))


def weave(X, Y, ix, iy, fx, fy, rad=0.46, slub_w=None, slub_f=None, over=0.35):
    """plain weave height from thread-space coords. Warp runs along Y, weft along X."""
    warp = tube(fx - 0.5, rad) * (1 - over + over * np.cos(np.pi * (Y + ix)))
    weft = tube(fy - 0.5, rad) * (1 - over + over * np.cos(np.pi * (X + iy + 1)))
    if slub_w is not None: warp = warp * slub_w
    if slub_f is not None: weft = weft * slub_f
    return np.maximum(warp, weft), warp >= weft


def slub(idx, coord, threads, seed, depth=0.18):
    rng = np.random.default_rng(seed)
    per = rng.choice([4, 8, 16], size=threads)
    ph = rng.random(threads); amp = rng.random(threads) * depth
    return 1 - amp[idx] + amp[idx] * np.cos(2 * np.pi * (coord / per[idx] + ph[idx]))


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


# ------------------------------------------------------------------------------------------------ generators
# each returns dict(h=height 0..1, col=(n,n,3) linear albedo, rough=(n,n), metal=(n,n) or None)
def g_cordura(n):
    U, V = _grid(n); t = 128
    X, Y = U * t, V * t; ix, iy = np.floor(X).astype(int) % t, np.floor(Y).astype(int) % t
    fx, fy = X - np.floor(X), Y - np.floor(Y)
    # air-textured 500D yarn: lumpy, fuzzy; slight per-yarn thickness drift
    h, is_warp = weave(X, Y, ix, iy, fx, fy, 0.48, slub(ix, Y, t, 1, 0.22), slub(iy, X, t, 2, 0.22), 0.30)
    fuzz = spectral(n, n / 6, 0.5, 3)
    h = np.clip(h * (0.85 + 0.3 * fuzz), 0, None)
    mott = fbm(n, 3, 4, 4)
    yv = np.where(is_warp, np.random.default_rng(5).random(t)[ix], np.random.default_rng(6).random(t)[iy])
    base = 0.019 * (0.86 + 0.28 * mott) * (0.9 + 0.2 * yv) * (0.78 + 0.34 * h) * (0.92 + 0.16 * fuzz)
    col = np.stack([base * 0.98, base, base * 1.04], -1)
    rough = np.clip(0.80 - 0.10 * h + 0.06 * (fuzz - 0.5) + 0.04 * (mott - 0.5), 0, 1)
    return dict(h=h / h.max(), col=col, rough=rough, metal=None)


def g_ripstop(n):
    U, V = _grid(n); t = 200
    X, Y = U * t, V * t; ix, iy = np.floor(X).astype(int) % t, np.floor(Y).astype(int) % t
    fx, fy = X - np.floor(X), Y - np.floor(Y)
    h, is_warp = weave(X, Y, ix, iy, fx, fy, 0.45, slub(ix, Y, t, 11, 0.12), slub(iy, X, t, 12, 0.12), 0.35)
    # ripstop: every 20th pair of yarns is a heavier doubled yarn -> 6 mm squares
    rip_w = (ix % 20) < 2; rip_f = (iy % 20) < 2
    h = h + 0.35 * (rip_w & is_warp) * tube(fx - 0.5, 0.5) + 0.35 * (rip_f & ~is_warp) * tube(fy - 0.5, 0.5)
    rng = np.random.default_rng(13)
    heather = np.where(is_warp, rng.random(t)[ix], rng.random(t)[iy])         # cotton/nylon blend
    mott = fbm(n, 2, 4, 14)
    base = 0.034 * (0.84 + 0.32 * heather) * (0.88 + 0.24 * mott) * (0.8 + 0.3 * h)
    col = np.stack([base, base * 1.0, base * 1.03], -1)
    rough = np.clip(0.86 - 0.06 * h + 0.04 * (mott - 0.5), 0, 1)
    return dict(h=h / h.max(), col=col, rough=rough, metal=None)


def g_jersey(n):
    # integration: was 40 x 52 per 30 mm tile (0.75 mm wales) -> moire at any viewing distance; now 1.5 mm wales,
    # pre-softened height and lower amplitude (MATS amp 0.14 -> 0.09) so the mip chain averages cleanly
    U, V = _grid(n); wales, courses = 20, 26
    X, Y = U * wales, (1 - V) * courses          # Y up
    fx, fy = X - np.floor(X), Y - np.floor(Y)
    xl = 0.5 - 0.24 * fy; xr = 0.5 + 0.24 * fy   # the two legs of each knit V
    h = np.maximum(tube(fx - xl, 0.17), tube(fx - xr, 0.17)) * (0.75 + 0.25 * np.sin(np.pi * fy))
    fib = spectral(n, n / 5, 0.5, 21)
    mott = fbm(n, 2, 3, 22)
    h = blur(h * (0.88 + 0.24 * fib), 2)
    base = 0.027 * (0.8 + 0.35 * h) * (0.9 + 0.2 * mott)
    col = np.stack([base, base, base * 1.03], -1)
    rough = np.clip(0.80 - 0.08 * h, 0, 1)
    return dict(h=h / h.max(), col=col, rough=rough, metal=None)


def g_leather(n):
    w = worley(n, 64, 31)                          # ~0.8 mm pebble grain
    w2 = worley(n, 23, 32)
    crease = 1 - np.clip(np.abs(spectral(n, 6, 0.4, 33) - 0.5) * 18, 0, 1)    # a few fine creases
    nap = spectral(n, n / 4, 0.5, 34)
    h = np.clip(w, 0, 0.7) / 0.7 * 0.7 + 0.3 * np.clip(w2, 0, 0.7) / 0.7 - 0.35 * crease + 0.1 * nap
    h = (h - h.min()) / (h.max() - h.min())
    mott = fbm(n, 3, 4, 35)
    base = 0.028 * (0.85 + 0.25 * mott) * (0.85 + 0.25 * h)
    col = np.stack([base * 1.05, base, base * 0.93], -1)
    rough = np.clip(0.66 + 0.12 * (1 - h) + 0.05 * (mott - 0.5), 0, 1)
    return dict(h=h, col=col, rough=rough, metal=None)


def g_rubber(n):
    mold = spectral(n, 40, 0.6, 41) * 0.6 + spectral(n, 160, 0.6, 42) * 0.4
    U, V = _grid(n)
    rng = np.random.default_rng(43); sc = np.zeros((n, n))
    for _ in range(26):                            # fine scuffs
        a = rng.random() * np.pi; c = rng.random(2); L = 0.05 + rng.random() * 0.2
        du = ((U - c[0] + 0.5) % 1) - 0.5; dv = ((V - c[1] + 0.5) % 1) - 0.5
        along = du * np.cos(a) + dv * np.sin(a); across = -du * np.sin(a) + dv * np.cos(a)
        sc = np.maximum(sc, (np.abs(across) < 0.0012) * (np.abs(along) < L) * rng.random())
    h = mold - 0.4 * sc
    h = (h - h.min()) / (h.max() - h.min())
    base = 0.021 * (0.92 + 0.16 * mold) * (1 + 0.8 * sc)
    col = np.stack([base, base, base], -1)
    rough = np.clip(0.86 - 0.12 * sc + 0.04 * (mold - 0.5), 0, 1)
    return dict(h=h, col=col, rough=rough, metal=None)


def g_velcro(n):
    loops = 1 - np.clip(worley(n, 70, 51) / 0.55, 0, 1)
    fuzz = spectral(n, n / 3, 0.6, 52)
    U, V = _grid(n)
    rows = 0.5 + 0.5 * np.cos(2 * np.pi * V * 40)    # the woven ground shows faint courses
    h = 0.65 * loops + 0.25 * fuzz + 0.1 * rows
    base = 0.016 * (0.8 + 0.4 * h)
    col = np.stack([base, base, base * 1.03], -1)
    rough = np.clip(0.94 - 0.05 * h, 0, 1)
    return dict(h=h / h.max(), col=col, rough=rough, metal=None)


def g_shellpaint(n):
    grit = spectral(n, 180, 0.5, 61)
    peel = spectral(n, 28, 0.5, 62)
    h = 0.55 * peel + 0.45 * grit
    mott = fbm(n, 2, 4, 63)
    base = 0.031 * (0.9 + 0.2 * mott) * (0.92 + 0.16 * h)
    col = np.stack([base, base * 1.0, base * 1.02], -1)
    rough = np.clip(0.74 - 0.06 * h + 0.04 * (mott - 0.5), 0, 1)
    return dict(h=h, col=col, rough=rough, metal=None)


def g_elastic(n):
    # braided sheath of a shock cord: two strand families at +-45 deg, over/under like a plain weave
    U, V = _grid(n); t = 24
    A, B = (U + V) * t, (U - V) * t
    ia, ib = np.floor(A).astype(int), np.floor(B).astype(int)
    fa, fb = A - np.floor(A), B - np.floor(B)
    s1 = tube(fa - 0.5, 0.48) * (0.7 + 0.3 * np.cos(np.pi * (B + ia)))
    s2 = tube(fb - 0.5, 0.48) * (0.7 + 0.3 * np.cos(np.pi * (A + ib + 1)))
    h = np.maximum(s1, s2)
    fib = spectral(n, n / 5, 0.5, 71)
    h = h * (0.85 + 0.3 * fib)
    base = 0.019 * (0.8 + 0.35 * h)
    col = np.stack([base, base, base * 1.03], -1)
    rough = np.clip(0.70 - 0.12 * h, 0, 1)                     # polyester sheath has a soft sheen
    return dict(h=h / h.max(), col=col, rough=rough, metal=None)


def g_polymer(n):
    st = 1 - np.clip(worley(n, 110, 81) / 0.7, 0, 1)            # fine mould stipple
    fine = spectral(n, 300, 0.5, 82)
    h = 0.7 * st + 0.3 * fine
    mott = fbm(n, 2, 3, 83)
    base = 0.028 * (0.93 + 0.14 * mott)
    col = np.stack([base, base, base * 1.02], -1)
    rough = np.clip(0.62 + 0.08 * (h - 0.5) + 0.04 * (mott - 0.5), 0, 1)
    return dict(h=h, col=col, rough=rough, metal=None)


def g_kydex(n):
    cell = worley(n, 90, 91)                                    # haircell texture
    h = np.clip(cell / 0.75, 0, 1) ** 0.7
    sheen = spectral(n, 3, 0.5, 92)
    base = 0.022 * (0.95 + 0.1 * sheen)
    col = np.stack([base, base, base * 1.02], -1)
    rough = np.clip(0.42 + 0.12 * (1 - h) + 0.05 * (sheen - 0.5), 0, 1)
    return dict(h=h, col=col, rough=rough, metal=None)


def g_metal(n):
    grain = spectral(n, 220, 0.6, 101)
    U, V = _grid(n)
    rng = np.random.default_rng(102); sc = np.zeros((n, n))
    for _ in range(60):
        a = rng.random() * np.pi; c = rng.random(2); L = 0.03 + rng.random() * 0.15
        du = ((U - c[0] + 0.5) % 1) - 0.5; dv = ((V - c[1] + 0.5) % 1) - 0.5
        along = du * np.cos(a) + dv * np.sin(a); across = -du * np.sin(a) + dv * np.cos(a)
        sc = np.maximum(sc, (np.abs(across) < 0.0009) * (np.abs(along) < L) * (0.4 + 0.6 * rng.random()))
    mott = fbm(n, 3, 3, 103)
    h = 0.8 * grain - 0.5 * sc
    h = (h - h.min()) / (h.max() - h.min())
    base = 0.085 * (0.9 + 0.2 * mott) + 0.10 * sc                # dark phosphate; scratches show brighter steel
    col = np.stack([base, base * 0.99, base * 0.97], -1)
    rough = np.clip(0.50 + 0.10 * (grain - 0.5) - 0.18 * sc + 0.05 * (mott - 0.5), 0, 1)
    return dict(h=h, col=col, rough=rough, metal=np.ones((n, n)))


# ---- trim sheet (MAT_Webbing) --------------------------------------------------------------------
def _web_row(w_mm, L_mm, kind, seed):
    """one trim row, height x length in mm at TRIM_PXMM. returns h, col, rough (rows x cols)."""
    ph, pw = int(round(w_mm * TRIM_PXMM)), int(round(L_mm * TRIM_PXMM))
    y = (np.arange(ph) + 0.5) / TRIM_PXMM            # mm across (0 at the top edge)
    x = (np.arange(pw) + 0.5) / TRIM_PXMM            # mm along
    X, Y = np.meshgrid(x, y)
    across = (Y - w_mm / 2) / (w_mm / 2)             # -1..1
    rng = np.random.default_rng(seed)
    edge = np.clip((1 - np.abs(across)) * w_mm / 0.8, 0, 1) ** 0.5          # rounded selvedge
    shiny = 0.55
    if kind in ('web', 'web_st', 'seam', 'binding'):
        # nylon twill: weft ridges ~0.42 mm with a 2/2 twill diagonal, warp ribs ~0.9 mm
        tw = 0.5 + 0.5 * np.cos(2 * np.pi * (X / 0.42 + Y / 1.26))
        rib = 0.5 + 0.5 * np.cos(2 * np.pi * Y / 0.9)
        h = (0.55 * tw + 0.25 * rib + 0.2) * edge
        h += 0.25 * np.exp(-((np.abs(across) - 0.93) / 0.05) ** 2)                # selvedge bead
        base = 0.018; shiny = 0.52
        if kind == 'seam':                           # cordura seam allowance: weave + fold ridge
            h = 0.3 + 0.3 * tw * 0.6 + 0.4 * np.exp(-(across / 0.18) ** 2); base = 0.019; shiny = 0.78
        if kind == 'binding':                        # folded binding over a panel edge: rounded crown
            h = h * 0.4 + 0.6 * np.sqrt(np.clip(1 - across ** 2, 0, 1)); shiny = 0.6
        st_rows = {'web': [], 'web_st': [2.4, w_mm - 2.4], 'seam': [w_mm / 2 - 3.0, w_mm / 2 + 3.0],
                   'binding': [3.0, w_mm - 3.0]}[kind]
        stitch = np.zeros_like(h)
        for sy in st_rows:                             # lock stitch: 3.2 mm stitches (8 SPI), thread 0.35 mm
            ph_ = (X / 3.2) % 1.0
            on = (ph_ > 0.08) & (ph_ < 0.92)
            prof = tube(Y - sy, 0.28) * on * (0.6 + 0.4 * np.sin(np.pi * ph_))
            hole = np.exp(-((ph_ - 0.0) ** 2 + 0 * Y) / 0.002) * tube(Y - sy, 0.35)
            dent = np.exp(-((Y - sy) / 0.55) ** 2)
            stitch = np.maximum(stitch, prof); h = h - 0.25 * dent * (1 - prof) - 0.2 * hole
        h = h + 0.55 * stitch
        col = base * (0.85 + 0.3 * np.clip(h, 0, 1.2))
        col = col + 0.010 * stitch                     # bonded nylon thread a touch lighter
        rough = shiny + 0.08 * (1 - np.clip(h, 0, 1)) + 0.10 * stitch
    elif kind == 'elastic':
        rib = 0.5 + 0.5 * np.cos(2 * np.pi * Y / 1.3)
        cr = 0.5 + 0.5 * np.cos(2 * np.pi * X / 0.55)
        h = (0.6 * rib + 0.25 * cr * rib + 0.15) * edge
        col = 0.019 * (0.8 + 0.35 * h); rough = 0.74 - 0.06 * h
    elif kind == 'zipper':
        tape = (np.abs(across) > 0.3)
        tw = 0.5 + 0.5 * np.cos(2 * np.pi * (X / 0.42 + Y / 1.26))
        pitch = 1.65                                   # #5 coil-ish pitch
        fx = (X / pitch) % 1.0
        side = np.sign(across)
        tooth = tube(fx - 0.5 + 0.25 * side, 0.32) * tube(across, 0.30) * (np.abs(across) < 0.3)
        h = np.where(tape, 0.25 + 0.25 * tw * edge, 0.45 + 0.55 * tooth)
        st = tube(np.abs(across) - 0.36, 0.03) * (((X / 3.2) % 1) < 0.85)
        h = h + 0.35 * st
        col = np.where(tape, 0.018, 0.024) * (0.85 + 0.3 * h)
        rough = np.where(tape, 0.6, 0.38 + 0.1 * (1 - tooth))
    elif kind == 'hook':
        U = X / L_mm; Vv = Y / w_mm
        hk = 1 - np.clip(worley_rect(ph, pw, int(L_mm / 0.9), int(w_mm / 0.9), seed) / 0.5, 0, 1)
        h = (0.35 + 0.65 * hk) * edge
        col = 0.017 * (0.85 + 0.35 * h); rough = 0.5 + 0.15 * (1 - hk)
    return np.clip(h, 0, 1.5), np.clip(col, 0, 1), np.clip(rough, 0, 1)


def worley_rect(ph, pw, cu, cv, seed):
    rng = np.random.default_rng(seed); pts = rng.random((cv, cu, 2))
    X, Y = np.meshgrid((np.arange(pw) + 0.5) / pw * cu, (np.arange(ph) + 0.5) / ph * cv)
    ix, iy = np.floor(X).astype(int), np.floor(Y).astype(int)
    best = np.full(X.shape, 9.0)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            cx, cy = ix + dx, iy + dy
            p = pts[np.clip(cy, 0, cv - 1), cx % cu]
            best = np.minimum(best, np.sqrt((cx + p[..., 0] - X) ** 2 + (cy + p[..., 1] - Y) ** 2))
    return best


def g_trim(n):
    assert n == TRIM_PX
    L = n / TRIM_PXMM
    kinds = {'web25': 'web', 'web25_stitched': 'web_st', 'web38': 'web', 'web45': 'web_st', 'elastic25': 'elastic',
             'binding20': 'binding', 'zipper20': 'zipper', 'hook25': 'hook', 'seam24': 'seam'}
    H = np.zeros((n, n)); C = np.zeros((n, n)); R = np.full((n, n), 0.6)
    y = 4; prev = None
    for i, (name, w) in enumerate(_ROWS):
        h, c, r = _web_row(w, L, kinds[name], 200 + i)
        ph = h.shape[0]
        H[y:y + ph], C[y:y + ph], R[y:y + ph] = h, c, r
        # bleed: 4 px above and below copy the edge rows (no black seams in mips)
        H[max(0, y - 4):y], C[max(0, y - 4):y], R[max(0, y - 4):y] = h[:1], c[:1], r[:1]
        H[y + ph:y + ph + 4], C[y + ph:y + ph + 4], R[y + ph:y + ph + 4] = h[-1:], c[-1:], r[-1:]
        y += ph + 8
    col = np.stack([C, C, C * 1.03], -1)
    return dict(h=H / H.max(), col=col, rough=R, metal=None)


GEN = {'MAT_Cordura': g_cordura, 'MAT_Ripstop': g_ripstop, 'MAT_Jersey': g_jersey, 'MAT_Leather': g_leather,
       'MAT_Rubber': g_rubber, 'MAT_Velcro': g_velcro, 'MAT_ShellPaint': g_shellpaint, 'MAT_Webbing': g_trim,
       'MAT_Elastic': g_elastic, 'MAT_Polymer': g_polymer, 'MAT_Kydex': g_kydex, 'MAT_MetalHW': g_metal}


def tex_paths(name):
    k = name[4:].lower()
    return {s: os.path.join(LIB, f'{k}_{s}.png') for s in ('albedo', 'normal', 'orm')}


def _write(name, force=False):
    from PIL import Image
    spec = MATS[name]; P = tex_paths(name)
    if not force and all(os.path.exists(p) for p in P.values()): return False
    n = spec['res']; d = GEN[name](n)
    h = d['h']
    px_m = spec['tile'] / n                                         # metres per pixel
    hm = h * spec['amp'] * 1e-3
    du = (np.roll(hm, -1, 1) - np.roll(hm, 1, 1)) / (2 * px_m)      # +U = +col
    dv = -(np.roll(hm, -1, 0) - np.roll(hm, 1, 0)) / (2 * px_m)     # +V = up = -row
    nrm = np.stack([-du, -dv, np.ones_like(du)], -1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    cav = np.clip(1 - 2.2 * np.clip(blur(h, 3) - h, 0, 1), 0.55, 1)  # micro cavity AO
    col = d['col'] * (0.75 + 0.25 * cav)[..., None]
    col = col * DARKEN.get(name, 1.0)                               # fixA: near-black solution-dyed nylon
    metal = d['metal'] if d['metal'] is not None else np.zeros_like(h)
    os.makedirs(LIB, exist_ok=True)
    Image.fromarray((to_srgb(col) * 255 + 0.5).astype(np.uint8)).save(P['albedo'])
    Image.fromarray(((nrm * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save(P['normal'])
    orm = np.stack([cav, d['rough'], metal], -1)
    Image.fromarray((np.clip(orm, 0, 1) * 255 + 0.5).astype(np.uint8)).save(P['orm'])
    return True


def ensure_textures(force=False, names=None):
    made = []
    for name, spec in MATS.items():
        if spec['tile'] is None or (names and name not in names): continue
        if _write(name, force): made.append(name)
    return made


# ------------------------------------------------------------------------------------------------ bpy side
def _bpy():
    import bpy
    return bpy


def get(name):
    """the shared material `name` (creates it once per .blend). Base Color = albedo x vertex colour 'AO'."""
    bpy = _bpy()
    if name in bpy.data.materials: return bpy.data.materials[name]
    spec = MATS[name]
    mt = bpy.data.materials.new(name); mt.use_nodes = True
    nt = mt.node_tree; N, Lk = nt.nodes, nt.links
    bs = N['Principled BSDF']
    mt['matlib'] = 1
    if name == 'MAT_LED':
        bs.inputs['Base Color'].default_value = (*ACCENT, 1)
        bs.inputs['Emission Color'].default_value = (*ACCENT, 1)
        bs.inputs['Emission Strength'].default_value = 6.0
        bs.inputs['Roughness'].default_value = 0.3
        return mt
    if name == 'MAT_Lens':
        bs.inputs['Base Color'].default_value = (0.0103, 0.0103, 0.0137, 1)   # #1a1a1f smoke
        bs.inputs['Roughness'].default_value = 0.05
        bs.inputs['IOR'].default_value = 1.59                                 # polycarbonate
        bs.inputs['Alpha'].default_value = 0.74                              # ~20 % light through (glTF BLEND)
        bs.inputs['Specular IOR Level'].default_value = 0.6
        mt.surface_render_method = 'BLENDED'
        mt.use_backface_culling = True
        return mt
    ensure_textures(names=[name])
    P = tex_paths(name)
    def img(kind, cs):
        p = P[kind]
        im = bpy.data.images.load(p, check_existing=True)
        im.colorspace_settings.name = cs
        return im
    uv = N.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'; uv.location = (-1100, 0)
    ta = N.new('ShaderNodeTexImage'); ta.image = img('albedo', 'sRGB'); ta.location = (-800, 300)
    tn = N.new('ShaderNodeTexImage'); tn.image = img('normal', 'Non-Color'); tn.location = (-800, -300)
    to = N.new('ShaderNodeTexImage'); to.image = img('orm', 'Non-Color'); to.location = (-800, 0)
    for t in (ta, tn, to): Lk.new(uv.outputs['UV'], t.inputs['Vector'])
    ao = N.new('ShaderNodeVertexColor'); ao.layer_name = 'AO'; ao.location = (-800, 550)
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.location = (-450, 350)
    mx.inputs[0].default_value = 1.0
    Lk.new(ta.outputs['Color'], mx.inputs[6]); Lk.new(ao.outputs['Color'], mx.inputs[7])
    Lk.new(mx.outputs[2], bs.inputs['Base Color'])
    sp = N.new('ShaderNodeSeparateColor'); sp.location = (-450, 0)
    Lk.new(to.outputs['Color'], sp.inputs['Color'])
    Lk.new(sp.outputs['Green'], bs.inputs['Roughness']); Lk.new(sp.outputs['Blue'], bs.inputs['Metallic'])
    nm = N.new('ShaderNodeNormalMap'); nm.location = (-450, -300)
    Lk.new(tn.outputs['Color'], nm.inputs['Color']); Lk.new(nm.outputs['Normal'], bs.inputs['Normal'])
    fabric = name in FABRICS
    if fabric:
        # fixA: the old 0.25 white sheen + 0.5 specular washed near-black nylon into mid-grey felt.
        bs.inputs['Sheen Weight'].default_value = 0.06           # faint fuzz rim only (Cycles/EEVEE)
        bs.inputs['Sheen Roughness'].default_value = 0.35
        bs.inputs['Sheen Tint'].default_value = (0.08, 0.08, 0.09, 1)
        bs.inputs['Specular IOR Level'].default_value = 0.18     # F0 ~1.4 %: matte dyed nylon, not plastic
    elif name in ('MAT_Polymer', 'MAT_Kydex', 'MAT_Rubber', 'MAT_ShellPaint', 'MAT_Leather'):
        bs.inputs['Specular IOR Level'].default_value = 0.35
    _wear_nodes(mt, mx.outputs[2], sp.outputs['Green'], bs, uv, fabric, name)
    return mt


FABRICS = ('MAT_Cordura', 'MAT_Ripstop', 'MAT_Jersey', 'MAT_Velcro', 'MAT_Elastic', 'MAT_Webbing')
DUST = (0.050, 0.048, 0.042)


def _wear_nodes(mt, col_out, rough_out, bs, uv, fabric, name):
    """fixA wear pass: colour attribute 'WEAR' (R = edge abrasion from convex curvature on short edges,
    G = dust/fading: cavities, upward faces, low on the body), baked per module by common.bake_vertex_ao.
    Broken up by UV-space noise so it never reads as a gradient; subtle by design (albedo x1.0..1.55,
    roughness +0.10, dust lerp <= 0.15). Missing attribute -> reads 0 -> factory-new look."""
    nt = mt.node_tree; N, Lk = nt.nodes, nt.links
    at = N.new('ShaderNodeAttribute'); at.attribute_name = 'WEAR'; at.location = (-1100, 700)
    sw = N.new('ShaderNodeSeparateColor'); sw.location = (-900, 700); Lk.new(at.outputs['Color'], sw.inputs['Color'])
    nz = N.new('ShaderNodeTexNoise'); nz.location = (-900, 900)
    nz.inputs['Scale'].default_value = 7.0; nz.inputs['Detail'].default_value = 5.0
    nz.inputs['Roughness'].default_value = 0.65
    Lk.new(uv.outputs['UV'], nz.inputs['Vector'])
    y = [1000]
    def M(op, *args, clamp=False):
        m = N.new('ShaderNodeMath'); m.operation = op; m.use_clamp = clamp
        y[0] -= 60; m.location = (-600, y[0])
        for k, x in enumerate(args):
            if isinstance(x, (int, float)): m.inputs[k].default_value = x
            else: Lk.new(x, m.inputs[k])
        return m.outputs[0]
    nf = nz.outputs['Fac']
    e = M('MULTIPLY', sw.outputs['Red'], M('MULTIPLY_ADD', nf, 1.2, 0.4))
    e = M('MULTIPLY', M('SUBTRACT', e, 0.45), 3.0, clamp=True)            # 0..1 abrasion
    lift = M('MULTIPLY_ADD', e, 0.55 if fabric else 0.45, 1.0)            # albedo x1.0..1.55
    cv = N.new('ShaderNodeCombineColor'); cv.location = (-300, 700)
    for k in ('Red', 'Green', 'Blue'): Lk.new(lift, cv.inputs[k])
    cm = N.new('ShaderNodeMix'); cm.data_type = 'RGBA'; cm.blend_type = 'MULTIPLY'; cm.location = (-200, 500)
    cm.inputs[0].default_value = 1.0
    Lk.new(col_out, cm.inputs[6]); Lk.new(cv.outputs['Color'], cm.inputs[7])
    d = M('MULTIPLY', M('MULTIPLY', sw.outputs['Green'], M('MULTIPLY_ADD', nf, 0.8, 0.6)), 0.15, clamp=True)
    dm = N.new('ShaderNodeMix'); dm.data_type = 'RGBA'; dm.blend_type = 'MIX'; dm.location = (-50, 500)
    Lk.new(d, dm.inputs[0]); Lk.new(cm.outputs[2], dm.inputs[6]); dm.inputs[7].default_value = (*DUST, 1)
    Lk.new(dm.outputs[2], bs.inputs['Base Color'])
    r = M('ADD', M('MULTIPLY_ADD', e, 0.10, 0.0), rough_out, clamp=True)
    Lk.new(r, bs.inputs['Roughness'])


def assign(ob, names):
    """replace ob's material slots with the shared materials `names` (in this order)."""
    ob.data.materials.clear()
    for n in names: ob.data.materials.append(get(n))


def tile(name):
    return MATS[name]['tile']


if __name__ == '__main__':
    import time
    t = time.time()
    made = ensure_textures(force='--force' in sys.argv)
    print('generated', made, round(time.time() - t, 1), 's')
    if '--preview' in sys.argv:                                     # contact sheet of all albedo/normal crops
        from PIL import Image
        names = [n for n, s in MATS.items() if s['tile']]
        cs = 256; sheet = Image.new('RGB', (cs * 3, cs * len(names)))
        for i, n in enumerate(names):
            P = tex_paths(n)
            for j, k in enumerate(('albedo', 'normal', 'orm')):
                im = Image.open(P[k]).convert('RGB')
                crop = im.crop((0, 0, im.size[0] // 4, im.size[1] // 4)).resize((cs, cs))
                if k == 'albedo':                                  # lift the near-black for viewing
                    import numpy as _np
                    a = _np.asarray(crop).astype(float); crop = Image.fromarray(_np.clip(a * 3.0, 0, 255).astype('uint8'))
                sheet.paste(crop, (j * cs, i * cs))
        sheet.save(os.path.join(RIG, 'checks', 'matlib_sheet.png'))
        print('sheet', os.path.join(RIG, 'checks', 'matlib_sheet.png'))
