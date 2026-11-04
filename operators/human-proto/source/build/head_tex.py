"""Stage 3a: procedural head/skin/hair/lash/eye textures on the MakeHuman UVs.

Run:  $H/venv/bin/python $H/build/head_tex.py [--res 4096] [--blend base/human_base.blend]
Out:  $H/head/textures/
        skin_basecolor.jpg   sRGB, RGB          (albedo: redness zones, beard shadow, stubble, freckles, moles, lips, scalp)
        skin_normal.jpg      linear, OpenGL +Y  (pores: fine on cheeks, coarse on nose; wrinkles; stubble follicles)
        skin_orm.jpg         linear  R=AO(cavity) G=roughness B=metal(0)
        hair_rgba.png        sRGB+alpha on the body UV (scalp shells + brow shells; alpha = strand height 0..1)
        hair_length.npy      per-body-vertex hair/brow shell length (m) + flow dir, used by head_build.py
        lash_rgba.png        1024x512 on the eyelash helper UVs (remapped to 0..1 by head_build.py)
        eye_basecolor.png    MH eye texture with darker brown iris, limbal ring, whiter sclera (alpha kept)
All textures are evaluated from 3D rest-pose surface positions, so UV seams match by construction
(islands are also dilated 16 px so mips don't bleed black).
"""
import os, sys, time, math, argparse
import numpy as np
import bpy
from scipy import ndimage
from PIL import Image

T0 = time.time()
H = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MH = os.path.join(H, 'mh', 'makehuman', 'data')
ap = argparse.ArgumentParser()
ap.add_argument('--res', type=int, default=4096)
ap.add_argument('--blend', default=os.path.join(H, 'base', 'human_base.blend'))
ap.add_argument('--out', default=os.path.join(H, 'head', 'textures'))
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
os.makedirs(args.out, exist_ok=True)
R = args.res
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)

bpy.ops.wm.open_mainfile(filepath=args.blend)
body = bpy.data.objects['Body']; rig = bpy.data.objects['Rig']
me = body.data
CO = np.array([v.co[:] for v in me.vertices], np.float64)
me.calc_loop_triangles() if hasattr(me, 'calc_loop_triangles') else None
NO = np.array([v.normal[:] for v in me.vertices], np.float64)

# ---------------------------------------------------------------- landmarks (rest pose, Blender coords, face looks -Y)
bone = lambda n, e='head': np.array(getattr(rig.data.bones[n], e + '_local')[:])
EYE_L, EYE_R = bone('LeftEye'), bone('RightEye')
EYE_Z = EYE_L[2]
mid = CO[(np.abs(CO[:, 0]) < 0.0025) & (CO[:, 2] > 1.5) & (CO[:, 1] < -0.1)]
NOSE = mid[np.argmin(mid[:, 1])]                     # nose tip
MOUTH_Z = 1.6155; SUBNASAL_Z = 1.629; CHIN_Z = 1.565
LIP_Y = -0.164
head_v = CO[CO[:, 2] > 1.55]
ear_sel = head_v[(np.abs(head_v[:, 0]) > 0.06) & (np.abs(head_v[:, 2] - (EYE_Z - 0.01)) < 0.03) & (head_v[:, 1] > -0.08) & (head_v[:, 1] < 0.02)]
EAR_X = np.abs(ear_sel[:, 0]).max(); EAR_Y = ear_sel[np.argmax(np.abs(ear_sel[:, 0])), 1]
HC = np.array([0.0, EAR_Y, EYE_Z])                   # head axis passes between the ears
log('landmarks eye', EYE_L, 'nose', NOSE, 'ear x/y', EAR_X, EAR_Y)

# ---------------------------------------------------------------- UV rasterisation of position + normal
uv = np.zeros(len(me.loops) * 2); me.uv_layers[0].data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
tris = []
for p in me.polygons:
    L = list(p.loop_indices)
    for k in range(1, len(L) - 1):
        tris.append((L[0], L[k], L[k + 1]))
tris = np.array(tris)

def rasterize(R, tri_uv, attrs):
    """tri_uv (T,3,2) in 0..1; attrs list of (T,3,C). Returns mask (R,R) + filled attr images. Row = v."""
    out = [np.zeros((R, R, a.shape[2]), np.float32) for a in attrs]
    mask = np.zeros((R, R), bool)
    P = tri_uv * R - 0.5
    for t in range(len(P)):
        a, b, c = P[t]
        x0 = max(int(np.floor(min(a[0], b[0], c[0]))), 0); x1 = min(int(np.ceil(max(a[0], b[0], c[0]))), R - 1)
        y0 = max(int(np.floor(min(a[1], b[1], c[1]))), 0); y1 = min(int(np.ceil(max(a[1], b[1], c[1]))), R - 1)
        if x1 < x0 or y1 < y0: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-12: continue
        w0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / den
        w1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / den
        w2 = 1 - w0 - w1
        e = -0.6 / max(abs(den) ** 0.5, 1)            # small conservative overlap
        ins = (w0 >= e) & (w1 >= e) & (w2 >= e)
        if not ins.any(): continue
        yy, xx = ys[ins], xs[ins]
        W = np.stack([w0[ins], w1[ins], w2[ins]], 1)
        for o, at in zip(out, attrs):
            o[yy, xx] = W @ at[t]
        mask[yy, xx] = True
    return mask, out

tri_uv = uv[tris]
log('rasterising', len(tris), 'tris at', R)
MASK, (POS, NRM) = rasterize(R, tri_uv, [CO[lv[tris]], NO[lv[tris]]])
dist, (iy, ix) = ndimage.distance_transform_edt(~MASK, return_indices=True)
BAND = dist <= 16
POS = POS[iy, ix]; NRM = NRM[iy, ix]
log('raster done, coverage', MASK.mean())

# texel world size (m per pixel) along u (x) and v (y), from the unfilled interior
def texel_size():
    gx = np.linalg.norm(np.diff(POS, axis=1, append=POS[:, -1:]), axis=2)
    gy = np.linalg.norm(np.diff(POS, axis=0, append=POS[-1:]), axis=2)
    med = np.median(gx[MASK])
    gx = np.where((gx > 0) & (gx < med * 8), gx, np.nan); gy = np.where((gy > 0) & (gy < med * 8), gy, np.nan)
    gx = np.where(np.isnan(gx), np.nanmedian(gx), gx); gy = np.where(np.isnan(gy), np.nanmedian(gy), gy)
    return ndimage.median_filter(gx, 3).astype(np.float32), ndimage.median_filter(gy, 3).astype(np.float32)
TSX, TSY = texel_size()
headm = MASK & (POS[..., 2] > 1.6)
log('texel size head median mm', 1000 * np.median(TSX[headm]), 'body', 1000 * np.median(TSX[MASK]))

# work only on band texels
sel = np.where(BAND)
P = POS[sel].astype(np.float32); N = NRM[sel].astype(np.float32)
NT = len(P)

# ---------------------------------------------------------------- noise
def _hash(ix, iy, iz, seed):
    h = (ix.astype(np.int64) * 73856093) ^ (iy.astype(np.int64) * 19349663) ^ (iz.astype(np.int64) * 83492791) ^ (seed * 2654435761)
    h &= 0xffffffff
    h = (h ^ (h >> 16)) * 0x45d9f3b & 0xffffffff
    h = (h ^ (h >> 16)) * 0x45d9f3b & 0xffffffff
    h = h ^ (h >> 16)
    return (h & 0xffffff).astype(np.float32) / 16777215.0

def vnoise(p, freq, seed=0):
    q = p * np.float32(freq)
    i = np.floor(q); f = q - i
    f = f * f * f * (f * (f * 6 - 15) + 10)
    i = i.astype(np.int64)
    x, y, z = i[:, 0], i[:, 1], i[:, 2]; fx, fy, fz = f[:, 0], f[:, 1], f[:, 2]
    r = 0
    for dx in (0, 1):
        wx = fx if dx else 1 - fx
        for dy in (0, 1):
            wy = fy if dy else 1 - fy
            for dz in (0, 1):
                wz = fz if dz else 1 - fz
                r = r + wx * wy * wz * _hash(x + dx, y + dy, z + dz, seed)
    return r

def fbm(p, freq, octaves, seed=0, gain=0.5):
    s, a, t = 0, 1.0, 0
    for o in range(octaves):
        s = s + a * vnoise(p, freq * 2 ** o, seed + o * 17); t += a; a *= gain
    return s / t

def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def blob(p, c, r):     # anisotropic gaussian, r = radii (x,y,z)
    d = (p - np.asarray(c, np.float32)) / np.asarray(r, np.float32)
    return np.exp(-np.sum(d * d, 1))

def mirror(p):         # fold x so left/right masks are symmetric
    q = p.copy(); q[:, 0] = np.abs(q[:, 0]); return q

# ---------------------------------------------------------------- region masks
Pm = mirror(P)
rel = P - HC
az = np.degrees(np.abs(np.arctan2(rel[:, 0], -rel[:, 1])))       # 0 front .. 180 back
zr = rel[:, 2]                                                   # relative to eye height
in_head = (np.linalg.norm(rel * np.array([1, 1, 0.8], np.float32), axis=1) < 0.17) & (P[:, 2] > 1.5)
ex = abs(EYE_L[0]); ey = EYE_L[1]

def interp_az(tab):
    a, v = np.array(tab, np.float32).T
    return np.interp(az, a, v)

# hairline (relative to eye z) by azimuth: forehead, temple corner, sideburn, over the ear, nape
brk = (fbm(P, 180, 2, 5) - 0.5) * 0.008
HL = interp_az([(0, 0.071), (18, 0.070), (30, 0.066), (42, 0.052), (55, 0.032), (66, 0.010), (74, -0.022),
                (80, -0.026), (84, 0.010), (92, 0.040), (104, 0.034), (116, 0.000), (135, -0.045), (160, -0.075), (180, -0.082)]) + brk
ear_m = np.zeros(NT, np.float32)
for s in (1, -1):
    ear_m = np.maximum(ear_m, blob(P, (s * (EAR_X - 0.012), EAR_Y + 0.004, EYE_Z - 0.012), (0.022, 0.022, 0.034)))
ear_m = ss(0.2, 0.45, ear_m) * (np.abs(P[:, 0]) > EAR_X - 0.02)
hair_m = ss(-0.006, 0.005, zr - HL) * in_head * (1 - ear_m)
# hair length: crop 11 mm on top, skin fade (to ~0.6 mm) on the sides/back below the temple line
top = np.maximum(ss(0.035, 0.075, zr), ss(45, 25, az))
fade = ss(-0.05, 0.04, zr)
hair_len = (0.0006 + 0.0104 * np.maximum(top, 0.35 * fade ** 1.5)) * hair_m
hair_len *= 1 - 0.65 * ss(0.012, 0.0, zr - HL) * ss(60, 20, az)    # soft, short front hairline

# eyebrows
def brow_mask(p):
    q = mirror(p)
    x_in, x_out = 0.009, ex + 0.031
    t = (q[:, 0] - x_in) / (x_out - x_in)
    zc = EYE_Z + 0.0175 + 0.0075 * np.sin(np.pi * np.clip(t, 0, 1) ** 0.85) - 0.0045 * np.clip(t, 0, 1)
    hh = 0.0042 * (1 - np.clip(t, 0, 1)) + 0.0019
    band = ss(1.0, 0.55, np.abs(q[:, 2] - zc) / hh)
    along = ss(-0.04, 0.10, t) * ss(1.04, 0.86, t)
    front = (q[:, 1] < ey + 0.01) & (q[:, 2] > EYE_Z) & (q[:, 2] < EYE_Z + 0.045)
    return band * along * front, np.clip(t, 0, 1)
brow_m, brow_t = brow_mask(P)
brow_m = brow_m * ss(0.2, 0.5, fbm(P, 300, 2, 9) * 0.5 + brow_m * 0.7)

# beard / stubble zone
cheek_top = interp_az([(0, SUBNASAL_Z - EYE_Z - 0.002), (14, SUBNASAL_Z - EYE_Z - 0.006), (22, MOUTH_Z - EYE_Z + 0.010),
                       (35, MOUTH_Z - EYE_Z + 0.030), (55, -0.040), (70, -0.034), (78, -0.026), (82, -0.026)])
beard_back = ss(84, 76, az)
neck_low = interp_az([(0, CHIN_Z - EYE_Z - 0.026), (40, CHIN_Z - EYE_Z - 0.022), (70, -0.088), (85, -0.072)])
beard_m = ss(0.010, -0.012, zr - cheek_top - 2 * brk) * ss(-0.012, 0.006, zr - neck_low) * beard_back * in_head * (P[:, 1] < HC[1] + 0.01)
lip_up = blob(P, (0, LIP_Y + 0.003, 1.6205), (0.022, 0.010, 0.0062))
lip_lo = blob(P, (0, LIP_Y + 0.003, 1.6080), (0.021, 0.010, 0.0085))
lip_m = ss(0.30, 0.62, np.maximum(lip_up, lip_lo)) * (P[:, 1] < -0.145)
beard_m *= 1 - ss(0.0, 0.6, lip_m + 0.3 * ss(0.1, 0.4, np.maximum(lip_up, lip_lo)))
beard_m *= 1 - 0.30 * ss(0.4, 0.1, (np.abs(P[:, 0]) - 0.0) / 0.006) * (np.abs(P[:, 2] - 1.623) < 0.006)   # philtrum lighter

# colour zones
nose_m = blob(P, NOSE + np.array([0, 0.006, -0.004]), (0.014, 0.02, 0.02))
cheek_m = blob(Pm, (ex + 0.012, ey - 0.035, EYE_Z - 0.032), (0.022, 0.03, 0.02))
undereye_m = blob(Pm, (ex - 0.002, ey - 0.034, EYE_Z - 0.0155), (0.014, 0.02, 0.0065))
lid_m = blob(Pm, (ex, ey - 0.036, EYE_Z + 0.006), (0.016, 0.02, 0.006))       # upper lid crease, slight darkening
rim_m = np.zeros(NT, np.float32)                                                 # wet lid margin / caruncle
for e in (EYE_L, EYE_R):
    d = np.linalg.norm((P - e) / np.array([1.0, 1.0, 1.0], np.float32), axis=1)
    rim_m = np.maximum(rim_m, ss(0.0175, 0.0155, d) * (P[:, 1] < e[1] - 0.008))
car_m = np.zeros(NT, np.float32)
for e, s in ((EYE_L, 1), (EYE_R, -1)):
    car_m = np.maximum(car_m, blob(P, (e[0] - s * 0.0135, e[1] - 0.010, e[2] - 0.001), (0.0032, 0.006, 0.003)))
ear_red = ear_m * 0.7 + ss(EAR_X - 0.025, EAR_X, np.abs(P[:, 0])) * (np.abs(zr + 0.01) < 0.035) * (np.abs(P[:, 1] - EAR_Y) < 0.025) * 0.5
forehead_m = blob(P, (0, -0.15, EYE_Z + 0.05), (0.03, 0.05, 0.03))
tzone_m = np.maximum(nose_m * 1.2, np.maximum(forehead_m, blob(P, (0, -0.16, EYE_Z + 0.01), (0.01, 0.03, 0.03))))
chin_m = blob(P, (0, -0.158, 1.583), (0.017, 0.02, 0.014))
# body: knuckles, elbows, knees, palms
joint_red = np.zeros(NT, np.float32)
for s in ('Left', 'Right'):
    for f in ('Index', 'Middle', 'Ring', 'Little'):
        for seg in ('Proximal', 'Intermediate'):
            joint_red = np.maximum(joint_red, blob(P, bone(f'{s}{f}{seg}'), (0.009, 0.009, 0.009)))
    joint_red = np.maximum(joint_red, 0.6 * blob(P, bone(f'{s}LowerArm'), (0.03, 0.03, 0.03)))
    joint_red = np.maximum(joint_red, 0.6 * blob(P, bone(f'{s}LowerLeg'), (0.045, 0.045, 0.045)))
neck_m = ss(1.62, 1.50, P[:, 2]) * ss(1.40, 1.48, P[:, 2])                    # neck slightly more sallow/darker
log('masks done')

# ---------------------------------------------------------------- albedo (sRGB authoring)
base = np.array([0.690, 0.530, 0.445], np.float32)
lo_f = fbm(P, 9, 3, 1) - 0.5            # broad blotchiness (~10 cm)
mid_f = fbm(P, 60, 3, 2) - 0.5          # mottling (~1.5 cm)
hi_f = fbm(P, 700, 2, 3) - 0.5          # fine grain (~1 mm)
col = np.tile(base, (NT, 1))
col *= (1 + 0.15 * lo_f[:, None] * np.array([1, 1.1, 1.25], np.float32))
col *= (1 + 0.26 * mid_f[:, None] * np.array([0.8, 1.1, 1.3], np.float32))
cap = ss(0.55, 0.9, fbm(P, 160, 3, 14)) * (0.4 + nose_m + cheek_m)   # broken capillaries / blotches
col *= (1 + 0.09 * hi_f[:, None])
def tint(c, m, target, k):
    return c + (np.asarray(target, np.float32) - c) * (np.clip(m, 0, 1) * k)[:, None]
red = np.array([0.74, 0.40, 0.34], np.float32)
redness = np.clip(0.65 * nose_m + 0.55 * cheek_m * (0.7 + 0.6 * (fbm(P, 220, 2, 4))) + 0.55 * ear_red + 0.45 * joint_red + 0.25 * chin_m, 0, 1)
col = tint(col, redness, red, 0.45)
col = tint(col, np.clip(cap, 0, 1), [0.68, 0.38, 0.34], 0.22)
col = tint(col, undereye_m, [0.52, 0.40, 0.40], 0.40)
col = tint(col, lid_m, [0.60, 0.43, 0.38], 0.30)
col = tint(col, lip_m, [0.66, 0.40, 0.37], 0.62)
col = tint(col, rim_m * (1 - brow_m), [0.70, 0.40, 0.38], 0.55)
col = tint(col, car_m, [0.80, 0.44, 0.44], 0.8)
col = tint(col, neck_m, [0.70, 0.52, 0.42], 0.25)
# beard shadow (blue-grey under-skin) + stubble dots (2-3 day light stubble)
col = tint(col, beard_m * (0.8 + 0.4 * (fbm(P, 120, 2, 6) - 0.5)), [0.40, 0.37, 0.38], 0.50)
stub = vnoise(P, 4200, 7)
dots = np.maximum(ss(0.62, 0.80, stub), 0.6 * ss(0.66, 0.84, vnoise(P, 2600, 17))) * beard_m
col = tint(col, dots * ss(0.15, 0.7, beard_m), [0.12, 0.10, 0.09], 0.52)
# scalp: dark roots / buzzed hair seen through the shells
scalp = vnoise(P, 3200, 8)
roots = hair_m * (0.55 + 0.45 * ss(0.35, 0.75, scalp))
# skin fade: soft painted edge (wider at the back/sides), buzzed follicle dots whose density follows hair length
lenf = ss(0.0004, 0.0055, hair_len)
backness = ss(55, 120, az)
hair_soft = ss(-0.006 - 0.022 * backness, 0.005, zr - HL) * in_head * (1 - ear_m)
col = tint(col, hair_soft, [0.46, 0.38, 0.35], 0.30 + 0.25 * lenf)
buzz = np.maximum(ss(0.55, 0.78, vnoise(P, 3600, 18)), 0.7 * ss(0.6, 0.8, vnoise(P, 2400, 19))) * hair_soft
col = tint(col, buzz * (0.35 + 0.65 * ss(0.0, 0.6, hair_soft)), [0.08, 0.065, 0.055], 0.62)
col = tint(col, np.maximum(roots, 0.8) * lenf, [0.075, 0.06, 0.05], 0.88)
# freckles + a few moles
frk = vnoise(P, 650, 11) * ss(0.4, 0.75, fbm(P, 25, 2, 12))
col = tint(col, ss(0.82, 0.92, frk) * (P[:, 2] > 1.25), [0.55, 0.37, 0.28], 0.35)
mole = vnoise(P, 140, 13)
col = tint(col, ss(0.993, 0.998, mole) * (np.abs(P[:, 0]) > 0.025), [0.30, 0.19, 0.15], 0.8)
log('albedo done')

# ---------------------------------------------------------------- height (metres) for normal map
pore_f = 1 - 0.35 * ss(0.0, 1.0, nose_m * 1.4)                      # nose pores bigger
pores_fine = ss(0.70, 0.88, vnoise(P, 1500, 21))
pores_big = ss(0.68, 0.86, vnoise(P, 950, 22))
face = in_head * (1 - hair_m * 0.7)
pore_amt = np.where(nose_m > 0.25, 1.0, 0.55) * (0.35 + 0.65 * face) * (1 - lip_m)
h = -(pores_fine * (1 - ss(0.2, 0.6, nose_m)) + pores_big * ss(0.2, 0.6, nose_m) * 1.4) * pore_amt * 0.00018
h += (fbm(P, 500, 3, 23) - 0.5) * 0.0001
h += (fbm(P, 170, 3, 27) - 0.5) * 0.00012 * in_head           # 2-5 mm undulation                          # skin micro relief
h += (vnoise(P * np.array([1, 1, 0.12], np.float32), 1800, 24) - 0.5) * 0.00002 * lip_m * 2   # vertical lip lines
fh = blob(P, (0, -0.14, EYE_Z + 0.055), (0.05, 0.05, 0.025))         # faint forehead lines
h += np.sin((P[:, 2] - EYE_Z) * 2 * np.pi / 0.0085 + 3 * (fbm(P, 30, 2, 25) - 0.5)) * 0.000025 * fh
cf = np.zeros(NT, np.float32)                                        # crow's feet
for e, s in ((EYE_L, 1), (EYE_R, -1)):
    d = P - (e + np.array([s * 0.024, -0.02, 0]))
    ang = np.arctan2(d[:, 2], np.abs(d[:, 0]))
    cf += np.sin(ang * 22 + 2 * fbm(P, 60, 2, 26)) * blob(P, e + np.array([s * 0.027, -0.018, -0.002]), (0.009, 0.02, 0.012))
h += cf * 0.00002
h -= dots * 0.00002                                                  # follicles
h += (hi_f) * 0.00001
log('height done')

def to_img(vals, C, fill=0):
    img = np.full((R, R, C), fill, np.float32)
    img[sel] = vals.reshape(NT, C)
    return img

Himg = to_img(h * 1.8, 1)[..., 0]
Himg = ndimage.gaussian_filter(Himg, 0.5)
dhx = np.gradient(Himg, axis=1) / TSX
dhy = np.gradient(Himg, axis=0) / TSY
nmap = np.stack([-dhx, -dhy, np.ones_like(dhx)], -1)
nmap /= np.linalg.norm(nmap, axis=2, keepdims=True)

# roughness / AO
rough = np.full(NT, 0.60, np.float32)
rough -= 0.13 * np.clip(tzone_m, 0, 1)
rough -= 0.10 * lip_m
rough -= 0.30 * rim_m - 0.0
rough -= 0.25 * car_m
rough += 0.08 * hair_m + 0.05 * beard_m
rough += 0.14 * (fbm(P, 80, 2, 31) - 0.5) + 0.08 * (fbm(P, 400, 2, 32) - 0.5)
rough += 0.16 * pores_fine * pore_amt
rough = np.clip(rough, 0.2, 0.75)
ao = 1 - 0.35 * (pores_fine + pores_big * ss(0.2, 0.6, nose_m)) * pore_amt - 0.15 * ear_m * 0
ao = np.clip(ao, 0.5, 1)

def save(img, name, q=93):
    im = Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)[::-1])
    if name.endswith('.jpg'): im.save(os.path.join(args.out, name), quality=q, subsampling=0)
    else: im.save(os.path.join(args.out, name), optimize=False, compress_level=6)
    log('saved', name, im.size)

save(nmap * 0.5 + 0.5, 'skin_normal.jpg', 96)
orm = to_img(np.stack([ao, rough, np.zeros(NT, np.float32)], 1), 3)
save(orm, 'skin_orm.jpg')

# ---------------------------------------------------------------- hair / brow strand texture (RGBA)
# flow: away from the crown on the scalp; brows: up at the head, lateral-up towards the tail
crown = np.array([0.0, 0.035, 1.785])
fl = P - crown; fl -= N * np.sum(fl * N, 1, keepdims=True)
fl /= np.linalg.norm(fl, axis=1, keepdims=True) + 1e-9
bdir = np.stack([np.sign(P[:, 0]) * (0.25 + 0.75 * ss(0.0, 0.35, brow_t)), np.zeros(NT), 1 - 0.75 * ss(0.0, 0.35, brow_t)], 1).astype(np.float32)
bdir -= N * np.sum(bdir * N, 1, keepdims=True); bdir /= np.linalg.norm(bdir, axis=1, keepdims=True) + 1e-9
isb = brow_m > hair_m
flow = np.where(isb[:, None], bdir, fl).astype(np.float32)

def strands(p, fdir, nrm, freq, seed, stretch=0.18):
    # anisotropic noise: stretched along fdir -> strand-like streaks in cross-section
    side = np.cross(nrm, fdir)
    q = np.stack([np.sum(p * side, 1) * freq, np.sum(p * fdir, 1) * freq * stretch, np.sum(p * nrm, 1) * freq], 1)
    return vnoise(q.astype(np.float32), 1.0, seed)

sA = strands(P, flow, N, 5200, 41)
sB = strands(P, flow, N, 3100, 42)
sC = vnoise(P, 1700, 43)
strand = np.maximum(ss(0.52, 0.90, sA) * (0.6 + 0.4 * sC), 0.75 * ss(0.6, 0.95, sB))
sBr = np.maximum(ss(0.45, 0.80, strands(P, flow, N, 6500, 45, 0.05)), 0.8 * ss(0.5, 0.85, strands(P, flow, N, 4200, 46, 0.07)))
strand = np.where(isb, sBr, strand)
dens = np.where(isb, brow_m, hair_m * ss(0.0026, 0.0068, hair_len))   # 0 where head_build stops the shells (vlen 2.4 mm)
alpha = np.clip(strand * (0.35 + 0.75 * dens) * (dens > 0.05) * (0.55 + 0.45 * ss(0.1, 0.6, dens)), 0, 1)
hcol = np.array([0.11, 0.08, 0.062], np.float32) * (0.75 + 0.6 * sC[:, None]) * (0.85 + 0.3 * vnoise(P, 400, 44))[:, None]
hcol = np.where(isb[:, None], hcol * 1.25, hcol)
rgba = np.concatenate([np.clip(hcol, 0, 1), alpha[:, None]], 1)
col = tint(col, ss(0.0, 0.6, brow_m) * (0.45 + 0.55 * strand), [0.12, 0.09, 0.07], 0.80)   # brow strokes painted under the brow shells
col = np.clip(col, 0, 1)
save(to_img(col, 3, 0.5), 'skin_basecolor.jpg')
save(to_img(rgba, 4, 0), 'hair_rgba.png')
if R > 2048:   # hair shells only need ~0.4 mm texels; keep the RGBA PNG at 2K (15 MB -> ~4 MB)
    Image.open(os.path.join(args.out, 'hair_rgba.png')).resize((2048, 2048), Image.LANCZOS).save(os.path.join(args.out, 'hair_rgba.png'))

# per-vertex shell lengths (sampled at vertex positions with the same functions -> nearest texel is enough)
vuv = np.zeros((len(CO), 2)); vuv[lv] = uv
px = np.clip((vuv * R).astype(int), 0, R - 1)
LEN = to_img(hair_len, 1)[..., 0]; BRW = to_img(brow_m, 1)[..., 0]; FLW = to_img(flow, 3)
vlen = ndimage.maximum_filter(LEN, 5)[px[:, 1], px[:, 0]]
vbrow = ndimage.maximum_filter(BRW, 5)[px[:, 1], px[:, 0]]
vflow = FLW[px[:, 1], px[:, 0]]
np.savez(os.path.join(args.out, 'hair_shells.npz'), length=vlen, brow=vbrow, flow=vflow)
# brow hair roots for head_strands.brows(): ~430 per brow, weighted by brow density
rng_b = np.random.default_rng(5)
bi = np.where(isb & (brow_m > 0.12))[0]
pb = brow_m[bi] ** 1.3; pb /= pb.sum()
pick = rng_b.choice(bi, size=min(860, len(bi)), replace=False, p=pb)
np.savez(os.path.join(args.out, 'brow_roots.npz'), pos=P[pick], nrm=N[pick], flow=flow[pick], t=brow_t[pick], m=brow_m[pick])
log('brow roots', len(pick), 'from', len(bi), 'texels')
log('vertex shell data: hair verts', int((vlen > 0.0015).sum()), 'brow verts', int((vbrow > 0.2).sum()))

# ---------------------------------------------------------------- eyelash cards texture (lash helper UVs remapped to 0..1)
lash = bpy.data.objects['Eyelashes'].data
luv = np.zeros(len(lash.loops) * 2); lash.uv_layers[0].data.foreach_get('uv', luv); luv = luv.reshape(-1, 2)
llv = np.zeros(len(lash.loops), np.int64); lash.loops.foreach_get('vertex_index', llv)
LCO = np.array([v.co[:] for v in lash.vertices])
lo_uv, hi_uv = luv.min(0), luv.max(0)
luv01 = (luv - lo_uv) / (hi_uv - lo_uv)
ltris = []
for p in lash.polygons:
    Lp = list(p.loop_indices)
    for k in range(1, len(Lp) - 1): ltris.append((Lp[0], Lp[k], Lp[k + 1]))
ltris = np.array(ltris)
# per vertex: t = 0 at the lid (closest to the eyeball), 1 at the tip
ed = np.minimum(np.linalg.norm(LCO - EYE_L, axis=1), np.linalg.norm(LCO - EYE_R, axis=1))
# normalise per connected strip (each MH lash group is a strip)
import bmesh
bm = bmesh.new(); bm.from_mesh(lash); bm.verts.ensure_lookup_table()
comp = -np.ones(len(LCO), int); cid = 0
for v in bm.verts:
    if comp[v.index] >= 0: continue
    stack = [v]; comp[v.index] = cid
    while stack:
        w = stack.pop()
        for e in w.link_edges:
            o = e.other_vert(w)
            if comp[o.index] < 0: comp[o.index] = cid; stack.append(o)
    cid += 1
tpar = np.zeros(len(LCO))
for c in range(cid):
    m = comp == c; d = ed[m]; tpar[m] = (d - d.min()) / max(d.max() - d.min(), 1e-6)
LR_, LW = 1024, 512
lattr_t = tpar[llv[ltris]][..., None]
lattr_x = LCO[llv[ltris]][..., :1] * np.sign(LCO[llv[ltris]][..., :1] + 1e-9)      # |x|: along the lid
lattr_z = LCO[llv[ltris]][..., 2:3]
lmask, (LT, LX, LZ) = rasterize(LR_, luv01[ltris] * np.array([1, 1]), [lattr_t, lattr_x, lattr_z])
d2, (jy, jx) = ndimage.distance_transform_edt(~lmask, return_indices=True)
LT = LT[jy, jx, 0]; LX = LX[jy, jx, 0]
upper = (LZ[jy, jx, 0] > EYE_Z)
# strands: one every ~0.55 mm along the lid (upper), sparser below; jittered, tapering, curling
rng = np.random.default_rng(3)
along = LX / 0.00055 + 0.6 * np.sin(LT * 3.0 + LX * 900)
cell = np.floor(along); fr = along - cell
jit = (np.sin(cell * 12.9898) * 43758.5453) % 1.0
keep = np.where(upper, jit > 0.12, jit > 0.55)
lenk = np.where(upper, 0.75 + 0.25 * ((jit * 7.3) % 1), 0.5 + 0.3 * ((jit * 5.1) % 1))
width = 0.16 * (1 - LT / np.maximum(lenk, 1e-3)) + 0.02
la = ss(width, width * 0.4, np.abs(fr - 0.5 - 0.15 * (jit - 0.5))) * keep * (LT < lenk) * ss(0.0, 0.08, LT)
la = np.clip(la, 0, 1)
lc = np.stack([np.full_like(la, 0.035), np.full_like(la, 0.026), np.full_like(la, 0.022)], -1)
lrgba = np.concatenate([lc, la[..., None]], -1)
im = Image.fromarray((np.clip(lrgba, 0, 1) * 255 + 0.5).astype(np.uint8)[::-1]).resize((LW, LW // 2) if False else (LR_, LW), Image.LANCZOS)
im.save(os.path.join(args.out, 'lash_rgba.png'))
np.save(os.path.join(args.out, 'lash_uv_bounds.npy'), np.array([lo_uv, hi_uv]))
log('lash texture saved')

# ---------------------------------------------------------------- eye texture: darker brown iris, limbal ring, whiter sclera
eimg = np.asarray(Image.open(os.path.join(MH, 'eyes', 'materials', 'brown_eye.png')).convert('RGBA')).astype(np.float32) / 255
yy, xx = np.mgrid[0:eimg.shape[0], 0:eimg.shape[1]]
out = eimg.copy()
for cx, cy in ((721, 305), (296, 726)):
    r = np.hypot(xx - cx, yy - cy) / 116.0                          # 1 = limbus
    lum = eimg[..., :3].mean(-1)
    lum_n = np.clip((lum - 0.05) / 0.35, 0, 1)
    iris_c = (np.array([0.10, 0.060, 0.035]) + lum_n[..., None] * np.array([0.30, 0.19, 0.09]))
    iris_c = iris_c + ss(0.55, 0.35, r)[..., None] * np.array([0.10, 0.07, 0.02]) * lum_n[..., None]   # amber collarette
    iris_c *= (1 - 0.65 * ss(0.82, 1.0, r))[..., None]                                                # limbal ring
    m = ss(1.04, 0.98, r) * ss(0.30, 0.36, r)
    out[..., :3] = out[..., :3] * (1 - m[..., None]) + iris_c * m[..., None]
    scl = ss(1.05, 1.15, r) * ss(3.0, 2.4, r)
    out[..., :3] = out[..., :3] * (1 - 0.6 * scl[..., None]) + np.array([0.95, 0.92, 0.89]) * 0.6 * scl[..., None]
rng_e = np.random.default_rng(9)
def _n2(sig, seed):
    f = ndimage.gaussian_filter(np.random.default_rng(seed).standard_normal(eimg.shape[:2]), sig)
    return f / (f.std() + 1e-9)
ridge = np.maximum(1 - np.abs(_n2(9, 1)) * 4.0, 0) ** 3 + 0.6 * np.maximum(1 - np.abs(_n2(4, 2)) * 5.0, 0) ** 3
for cx, cy in ((721, 305), (296, 726)):
    r = np.hypot(xx - cx, yy - cy) / 116.0
    scl = ss(1.1, 1.6, r) * ss(3.2, 2.6, r)
    vein = np.clip(ridge * ss(1.2, 2.4, r), 0, 1) * scl
    out[..., :3] = out[..., :3] * (1 - 0.55 * vein[..., None]) + np.array([0.72, 0.22, 0.20]) * 0.55 * vein[..., None]
    warm = ss(1.6, 2.8, r) * ss(3.2, 2.7, r)
    out[..., :3] = out[..., :3] * (1 - 0.25 * warm[..., None]) + np.array([0.86, 0.70, 0.64]) * 0.25 * warm[..., None]
Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(args.out, 'eye_basecolor.png'))
log('eye texture saved; done')
