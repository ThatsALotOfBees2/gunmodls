#!/usr/bin/env python3
# Renders floor plans from layout.json (walls coloured by surface type, callouts, sites, spawns,
# hatches, stairs, facade lites) plus an overview site plan.
# Usage: python3 tools/render_plans.py [layout.json] [outdir]
import json, math, os, re, sys
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geom import seg_len, seg_point, centroid, point_in_poly

MAP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(MAP, 'layout.json')
outdir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(MAP, 't-design')
os.makedirs(outdir, exist_ok=True)
L = json.load(open(path))
SS = 2  # supersample
# props the floor builders made part of the building (HARD_/SOFT_ node + collider); every other layout prop is an
# empty PROP_<id> marker that the separate furniture pack fills
BUILT_IN = {'PR01', 'PR02', 'PR03', 'PR04', 'PR05', 'PR07', 'PR11', 'PR18', 'PR19', 'PR42', 'PR73', 'PR75'}

FONT_DIR = '/usr/share/fonts/opentype/inter/'
def font(sz, w='Regular'):
    for f in (FONT_DIR + 'Inter-%s.otf' % w, '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        try: return ImageFont.truetype(f, int(sz * SS))
        except OSError: pass
    return ImageFont.load_default()

C = {
    'bg': (14, 15, 22), 'plate': (24, 26, 36), 'room': (40, 43, 58), 'corridor': (33, 35, 47), 'core': (52, 52, 62),
    'stair': (60, 62, 72), 'shaft': (46, 46, 54), 'solid': (78, 80, 88), 'void': (18, 18, 26), 'site': (70, 42, 92),
    'site_edge': (196, 120, 255), 'terrace': (30, 36, 42), 'ledge': (58, 64, 74), 'neighbour': (34, 36, 46),
    'hard': (222, 226, 232), 'soft': (245, 160, 40), 'reinforceable': (50, 130, 255), 'glass': (90, 225, 235),
    'balustrade': (150, 200, 255), 'open': (90, 92, 110),
    'door_b': (255, 70, 100), 'door_o': (150, 150, 160), 'win_b': (255, 70, 210), 'vault': (200, 200, 120),
    'glass_tempered': (96, 112, 140), 'glass_breakable': (60, 230, 255), 'window_barricadable': (255, 70, 210),
    'door_barricadable': (255, 70, 100), 'spandrel': (60, 60, 66), 'portal': (176, 108, 255),
    'hatch': (60, 230, 120), 'soft_floor': (200, 240, 80), 'column': (200, 204, 210),
    'text': (232, 234, 240), 'dim': (140, 144, 160), 'obj': (255, 214, 60), 'def': (80, 170, 255), 'atk': (255, 80, 80),
    'cover': (240, 240, 240), 'walk': (120, 128, 150), 'route_attack': (255, 90, 90), 'route_rotation': (80, 170, 255),
    'route_flank': (255, 200, 60),
}


class Cv:
    def __init__(self, W, H, x0, z0, scale, ox=0, oy=0):
        self.img = Image.new('RGB', (W * SS, H * SS), C['bg'])
        self.d = ImageDraw.Draw(self.img)
        self.x0, self.z0, self.s, self.ox, self.oy = x0, z0, scale, ox, oy

    def P(self, p):
        return ((self.ox + (p[0] - self.x0) * self.s) * SS, (self.oy + (p[1] - self.z0) * self.s) * SS)

    def poly(self, pts, fill=None, outline=None, width=1):
        q = [self.P(p) for p in pts]
        self.d.polygon(q, fill=fill)
        if outline: self.d.line(q + [q[0]], fill=outline, width=int(width * SS), joint='curve')

    def line(self, a, b, col, w, dash=None):
        A, B = self.P(a), self.P(b)
        if not dash:
            self.d.line([A, B], fill=col, width=max(1, int(w * SS)))
            return
        Lp = math.hypot(B[0] - A[0], B[1] - A[1])
        if Lp < 1: return
        on, off = dash[0] * SS, dash[1] * SS
        t = 0
        while t < Lp:
            t1 = min(Lp, t + on)
            self.d.line([(A[0] + (B[0] - A[0]) * t / Lp, A[1] + (B[1] - A[1]) * t / Lp),
                         (A[0] + (B[0] - A[0]) * t1 / Lp, A[1] + (B[1] - A[1]) * t1 / Lp)], fill=col, width=max(1, int(w * SS)))
            t += on + off

    def rect(self, x0, z0, x1, z1, fill=None, outline=None, width=1):
        self.poly([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], fill, outline, width)

    def circle(self, p, r_px, fill=None, outline=None, width=1):
        x, y = self.P(p); r = r_px * SS
        self.d.ellipse([x - r, y - r, x + r, y + r], fill=fill, outline=outline, width=int(width * SS))

    def text(self, p, s, f, col, anchor='mm', stroke=0):
        self.d.text(self.P(p), s, font=f, fill=col, anchor=anchor, stroke_width=int(stroke * SS), stroke_fill=C['bg'])

    def textpx(self, xy, s, f, col, anchor='la'):
        self.d.text((xy[0] * SS, xy[1] * SS), s, font=f, fill=col, anchor=anchor)

    def rectpx(self, x0, y0, x1, y1, fill=None, outline=None, width=1):
        self.d.rectangle([x0 * SS, y0 * SS, x1 * SS, y1 * SS], fill=fill, outline=outline, width=int(width * SS))

    def linepx(self, a, b, col, w):
        self.d.line([(a[0] * SS, a[1] * SS), (b[0] * SS, b[1] * SS)], fill=col, width=int(w * SS))

    def hatchpoly(self, pts, col, step=0.8, w=1):
        xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
        k = min(xs) + min(zs)
        while k < max(xs) + max(zs):
            # line x + z = k clipped by sampling
            segs = []
            inside = False; start = None
            n = 60
            for i in range(n + 1):
                x = min(xs) + (max(xs) - min(xs)) * i / n
                z = k - x
                ins = point_in_poly((x, z), pts)
                if ins and not inside: start = (x, z); inside = True
                if (not ins or i == n) and inside:
                    segs.append((start, (x, z))); inside = False
            for a, b in segs: self.line(a, b, col, w)
            k += step

    def save(self, fn):
        W, H = self.img.size
        self.img.resize((W // SS, H // SS), Image.LANCZOS).save(fn)


def T(p): return (p[0], p[1])
rooms = L['rooms']; walls = L['walls']; bays = L['facade']['bays']
FY = {f['id']: f['y'] for f in L['floors']}
NEXT = {'F1': 'F2', 'F2': 'F3', 'F3': None}
SITE_ROOM = {}
for s in L['sites']:
    for k, rid in enumerate(s['rooms']): SITE_ROOM[rid] = '%s%s' % (s['id'], 'AB'[k])


def wall_px(w):
    t = w['type']
    if t == 'hard': return max(7, w['thickness'] * 22)
    return {'soft': 5, 'reinforceable': 8, 'glass': 3, 'balustrade': 2.5, 'open': 1.5}[t]


def draw_walls(cv, fl, scale_k=1.0):
    for w in walls:
        if w['floor'] != fl: continue
        a, b = T(w['a']), T(w['b']); Lw = seg_len(a, b)
        t = w['type']; px = wall_px(w) * scale_k
        if t == 'open':
            cv.line(a, b, C['open'], 1.2 * scale_k, dash=(3, 4)); continue
        if t == 'balustrade':
            # solid rail with gaps at openings
            cuts = sorted((o['u0'], o['u1']) for o in w['openings'])
            u = 0
            for (u0, u1) in cuts + [(Lw, Lw)]:
                if u0 > u: cv.line(seg_point(a, b, u), seg_point(a, b, u0), C['balustrade'], px, dash=(5, 3))
                u = u1
            continue
        cuts = sorted((o['u0'], o['u1'], o) for o in w['openings'])
        u = 0
        segs = []
        for (u0, u1, o) in cuts:
            if u0 > u: segs.append((u, u0))
            u = u1
        if u < Lw: segs.append((u, Lw))
        for (u0, u1) in segs:
            # a reinforceable wall is hard except its units (junction ends, jambs and trims stay white)
            cv.line(seg_point(a, b, u0), seg_point(a, b, u1), C['hard'] if t == 'reinforceable' else C[t], px if t != 'reinforceable' else 6 * scale_k)
        if t == 'reinforceable':
            # breakable + reinforceable units in blue, unit joints (ticks) and a centre stripe
            ps = w['reinforce']['panels']
            nx, nz = -(b[1] - a[1]) / Lw, (b[0] - a[0]) / Lw
            for p in ps:
                cv.line(seg_point(a, b, p['u0']), seg_point(a, b, p['u1']), C['reinforceable'], px)
            for p in ps:
                for uu in (p['u0'], p['u1']):
                    q = seg_point(a, b, uu)
                    cv.line((q[0] - nx * 0.28, q[1] - nz * 0.28), (q[0] + nx * 0.28, q[1] + nz * 0.28), (220, 235, 255), 2 * scale_k)
                cv.line(seg_point(a, b, p['u0'] + 0.05), seg_point(a, b, p['u1'] - 0.05), (150, 200, 255), 1.4 * scale_k)
            # defender side marker (site walls only): small dot on the defender face of each unit
            ds = w['reinforce'].get('defender_side')
            if ds in ('pos', 'neg'):
                sg = 1 if ds == 'pos' else -1
                for p in ps:
                    m = seg_point(a, b, (p['u0'] + p['u1']) / 2)
                    cv.circle((m[0] + sg * nx * 0.45, m[1] + sg * nz * 0.45), 2.2 * scale_k, fill=(150, 200, 255))
        for (u0, u1, o) in cuts:
            p0, p1 = seg_point(a, b, u0), seg_point(a, b, u1)
            nx, nz = -(b[1] - a[1]) / Lw, (b[0] - a[0]) / Lw
            k = o['kind']
            if k in ('door', 'double_door'):
                col = C['door_b'] if o['barricadable'] else C['door_o']
                cv.line(p0, p1, col, 3 * scale_k)
                for q in (p0, p1):
                    cv.line((q[0] - nx * 0.22, q[1] - nz * 0.22), (q[0] + nx * 0.22, q[1] + nz * 0.22), col, 2 * scale_k)
            elif k == 'window':
                cv.line(p0, p1, C[t], max(2, px * 0.45))
                cv.line(p0, p1, C['win_b'], 2.2 * scale_k, dash=(3, 2))
            elif k == 'vault':
                cv.line(p0, p1, C['vault'], 2 * scale_k, dash=(2, 2))
            elif k in ('opening', 'lift_door'):
                for q in (p0, p1):
                    cv.line((q[0] - nx * 0.25, q[1] - nz * 0.25), (q[0] + nx * 0.25, q[1] + nz * 0.25), C['door_o'], 2 * scale_k)
                if k == 'lift_door': cv.line(p0, p1, C['door_o'], 1.5 * scale_k, dash=(2, 2))


def draw_facade(cv, fl, scale_k=1.0):
    for b in bays:
        if b['floor'] != fl: continue
        a, bb = T(b['a']), T(b['b']); Lb = seg_len(a, bb)
        if b['kind'] == 'portal':
            cv.line(a, bb, C['portal'], 9 * scale_k)
            o = b['opening']
            cv.line(seg_point(a, bb, o['u0']), seg_point(a, bb, o['u1']), C['door_b'], 4 * scale_k)
            continue
        for lt in b['lites']:
            col = C[lt['type']]
            wpx = {'glass_tempered': 4, 'glass_breakable': 5, 'window_barricadable': 8, 'door_barricadable': 8, 'spandrel': 6}[lt['type']]
            cv.line(seg_point(a, bb, lt['u0'] + 0.06), seg_point(a, bb, lt['u1'] - 0.06), col, wpx * scale_k)
        if b.get('opening'):
            o = b['opening']
            cv.line(seg_point(a, bb, o['u0']), seg_point(a, bb, o['u1']), C['door_barricadable'], 8 * scale_k)
        if b['double_height']:
            nx, nz = -(bb[1] - a[1]) / Lb, (bb[0] - a[0]) / Lb
            cv.line((a[0] - nx * 0.45, a[1] - nz * 0.45), (bb[0] - nx * 0.45, bb[1] - nz * 0.45), (110, 90, 160), 1.5 * scale_k, dash=(4, 3))
        for q in (a, bb):
            cv.circle(q, 1.6 * scale_k, fill=(170, 175, 190))


def room_fill(r):
    if r['id'] in SITE_ROOM: return C['site']
    return C.get(r['kind'], C['room'])


def draw_floor(fl):
    fy = FY[fl]
    S = 24  # px per metre
    X0, Z0, X1, Z1 = -31, -31, 31, 31
    PW = int((X1 - X0) * S); PH = int((Z1 - Z0) * S)
    LEG = 560; TOP = 70
    cv = Cv(PW + LEG, PH + TOP, X0, Z0, S, 0, TOP)
    ex = L['exterior']
    # exterior at this level
    if fl == 'F1':
        cv.poly([T(p) for p in ex['terrace']['polygon']], fill=C['terrace'], outline=(60, 70, 80), width=2)
        for ft in ex['terrace']['features']:
            if 'box' in ft:
                x0, z0, x1, z1 = ft['box']
                col = {'lift_kiosk': (80, 82, 92), 'rain_canopy': (70, 56, 40), 'pool': (30, 50, 80)}.get(ft['kind'], (50, 60, 56))
                cv.rect(x0, z0, x1, z1, fill=col, outline=(110, 110, 120))
        for k in ('catwalk', 'catwalk2'):
            draw_bridge(cv, ex[k], (64, 70, 82))
        draw_bridge(cv, ex['bridge_truss'], (58, 62, 74))
    if fl == 'F2':
        draw_bridge(cv, ex['skybridge'], (52, 58, 78))
        draw_bridge(cv, ex['hoist_ramp'], (72, 66, 50))
        cr = ex['cradle']; draw_cradle(cv, cr)
    if fl == 'F3':
        draw_bridge(cv, ex['gantry'], (72, 66, 50))
        sb = dict(ex['skybridge']); draw_bridge(cv, sb, (40, 44, 58), dashed=True)
        cr = ex['cradle']; draw_cradle(cv, cr)
    for lg in ex['ledges']:
        if lg['floor'] != fl: continue
        pts = [T(p) for p in lg['path']]
        n = len(pts) if lg['closed'] else len(pts) - 1
        for i in range(n):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            Lb = seg_len(a, b); nx, nz = -(b[1] - a[1]) / Lb, (b[0] - a[0]) / Lb
            off = -0.4
            cv.line((a[0] + nx * off, a[1] + nz * off), (b[0] + nx * off, b[1] + nz * off), C['ledge'], lg['width'] * S * 0.9)
            off = -0.85
            cv.line((a[0] + nx * off, a[1] + nz * off), (b[0] + nx * off, b[1] + nz * off), (110, 118, 130), 1.5, dash=(4, 3))
    # rooms
    for r in rooms:
        if r['floor'] != fl: continue
        pts = [T(p) for p in r['polygon']]
        cv.poly(pts, fill=room_fill(r))
        if r['kind'] == 'void':
            cv.hatchpoly(pts, (40, 40, 58), 0.9, 1.5)
        if r['kind'] == 'solid':
            cv.hatchpoly(pts, (95, 97, 106), 0.6, 1.2)
    # double-height marker on the floor below a void
    nxt = NEXT[fl]
    for v in L['voids']:
        if v['floor'] == nxt:
            cv.poly([T(p) for p in v['polygon']], outline=(170, 120, 255), width=2)
    # site edges
    for r in rooms:
        if r['floor'] == fl and r['id'] in SITE_ROOM:
            cv.poly([T(p) for p in r['polygon']], outline=C['site_edge'], width=2)
    # walkways
    for wk in L['walkways']:
        if wk['floor'] != fl: continue
        pts = [T(p) for p in wk['polygon']]
        cv.poly(pts, fill=(56, 60, 76), outline=C['walk'], width=2)
        cv.hatchpoly(pts, (80, 86, 104), 0.35, 1)
    # gameplay props: built-in ones are solid; the rest are furniture slots (PROP_ markers for the furniture pack)
    for pr in L.get('props', []):
        if pr['floor'] != fl: continue
        x0, z0, x1, z1 = pr['box']
        hard = pr['type'] == 'hard'
        if pr['id'] not in BUILT_IN:
            oc = (150, 120, 220) if pr['cover'] == 'full' else (110, 96, 160)
            if pr.get('shape') == 'round':
                cv.circle(((x0 + x1) / 2, (z0 + z1) / 2), (x1 - x0) / 2 * cv.s, fill=None, outline=oc, width=1.5)
                continue
            for e in ((x0, z0, x1, z0), (x1, z0, x1, z1), (x1, z1, x0, z1), (x0, z1, x0, z0)):
                cv.line(e[:2], e[2:], oc, 1.5, dash=(2, 2))
            if re.search('breaks|splits', pr.get('note') or ''):
                cv.line((x0, z0), (x1, z1), oc, 1); cv.line((x0, z1), (x1, z0), oc, 1)
            continue
        fillc = (92, 96, 110) if pr['cover'] == 'full' else (66, 70, 84)
        if pr['kind'] in ('pool', 'hot_pool'): fillc = (34, 58, 92)
        if not hard: fillc = (84, 64, 52) if pr['cover'] == 'full' else (66, 54, 46)
        oc = (170, 176, 190) if hard else (190, 150, 110)
        if pr.get('shape') == 'round':
            cv.circle(((x0 + x1) / 2, (z0 + z1) / 2), (x1 - x0) / 2 * cv.s, fill=fillc, outline=oc, width=1.5)
            continue
        cv.rect(x0, z0, x1, z1, fill=fillc)
        for e in ((x0, z0, x1, z0), (x1, z0, x1, z1), (x1, z1, x0, z1), (x0, z1, x0, z0)):
            cv.line(e[:2], e[2:], oc, 1.5, dash=None if hard else (3, 2))
    # slab openings on this floor
    for so in L['slab_openings']:
        if so['floor'] == fl:
            cv.poly([T(p) for p in so['polygon']], fill=(20, 20, 30), outline=C['balustrade'], width=2)
    # stairs
    for st in L['stairs']:
        if fl not in st['floors']: continue
        draw_stair(cv, st, fl)
    for ld in L['ladders']:
        if ld['y0'] - 0.01 <= fy <= ld['y1'] + 0.01 and abs(ld['x']) < 31 and abs(ld['z']) < 31:
            draw_ladder(cv, ld)
    # hatches/patches: in this floor slab (solid) and in the slab above (dashed)
    for h in L['hatches'] + L['floor_patches']:
        half = h.get('size', 0) / 2 if 'size' in h else h['w'] / 2
        hd = h.get('size', 0) / 2 if 'size' in h else h['d'] / 2
        col = C['hatch'] if h['type'] == 'hatch' else C['soft_floor']
        x, z = h['x'], h['z']
        if h['floor'] == fl:
            cv.rect(x - half, z - hd, x + half, z + hd, fill=tuple(int(c * 0.45) for c in col), outline=col, width=3)
            cv.line((x - half, z - hd), (x + half, z + hd), col, 2); cv.line((x - half, z + hd), (x + half, z - hd), col, 2)
            tag = h['id'] + (' R' if h.get('reinforce_from') == 'above' else '')
            cv.text((x, z + hd + 0.45), tag, font(10, 'SemiBold'), col)
        elif h['floor'] == nxt:
            for e in ((x - half, z - hd, x + half, z - hd), (x + half, z - hd, x + half, z + hd), (x + half, z + hd, x - half, z + hd), (x - half, z + hd, x - half, z - hd)):
                cv.line(e[:2], e[2:], col, 2, dash=(4, 3))
            cv.text((x, z + hd + 0.45), h['id'] + (' R' if h.get('reinforce_from') == 'below' else ''), font(9), col)
    # walls, facade, columns
    draw_walls(cv, fl)
    draw_facade(cv, fl)
    for c in L['columns']:
        cv.rect(c['x'] - c['w'] / 2, c['z'] - c['d'] / 2, c['x'] + c['w'] / 2, c['z'] + c['d'] / 2, fill=C['column'], outline=(120, 124, 130))
    for pl in L.get('pilasters', []):
        if pl['floor'] == fl:
            cv.rect(pl['x'] - pl['w'] / 2 - 0.05, pl['z'] - pl['d'] / 2 - 0.05, pl['x'] + pl['w'] / 2 + 0.05, pl['z'] + pl['d'] / 2 + 0.05, fill=C['hard'])
    for sp_ in L.get('set_pieces', []):
        if sp_['floor'] == fl and sp_['kind'] == 'holo':
            cx, cz = sp_['center']; r = sp_['radius']
            for k in range(24):
                a0 = k * math.pi / 12; a1 = a0 + math.pi / 24
                cv.line((cx + math.cos(a0) * r, cz + math.sin(a0) * r), (cx + math.cos(a1) * r, cz + math.sin(a1) * r), (230, 120, 255), 2.5)
            cv.text((cx, cz - 0.3), 'holo', font(11, 'Bold'), (230, 150, 255), stroke=2)
    # cover
    for cvr in L['cover']:
        if cvr['floor'] != fl: continue
        draw_cover(cv, cvr)
    # objectives and spawns
    for s in L['sites']:
        for o in s['objectives']:
            if abs(o['pos'][1] - fy) < 0.01:
                x, _, z = o['pos']
                cv.poly([(x, z - 0.6), (x + 0.6, z), (x, z + 0.6), (x - 0.6, z)], fill=C['obj'], outline=(60, 40, 0), width=1.5)
                cv.text((x, z + 1.1), o['id'], font(11, 'Bold'), C['obj'], stroke=2)
    for sp in L['spawns']['defenders']:
        if sp['floor'] != fl: continue
        for i, p in enumerate(sp['points']):
            cv.circle((p[0], p[2]), 6, fill=C['def'], outline=(255, 255, 255), width=1.5)
        p = sp['points'][0]
        cv.text((p[0], p[2] - 0.9), sp['id'], font(10, 'Bold'), C['def'], stroke=2)
    for sp in L['spawns']['attackers']:
        for p in sp['points']:
            if abs(p[1] - fy) < 2.0 and X0 < p[0] < X1 and Z0 < p[2] < Z1:
                draw_tri(cv, (p[0], p[2]), C['atk'])
        p = sp['points'][0]
        if abs(p[1] - fy) < 2.0:
            if X0 < p[0] < X1 and Z0 < p[2] < Z1:
                cv.text((p[0], p[2] + 1.5), '%s %s' % (sp['id'], sp['name']), font(12, 'Bold'), C['atk'], stroke=2)
            else:
                # arrow toward the off-plan spawn
                cx = max(X0 + 1.5, min(X1 - 1.5, p[0])); cz = max(Z0 + 1.5, min(Z1 - 1.5, p[2]))
                draw_tri(cv, (cx, cz), C['atk'], 9)
                d = math.hypot(p[0] - cx, p[2] - cz)
                lab = '%s %.0f m' % (sp['id'], d)
                cv.text((cx + (-0.9 if cx > 0 else 0.9), cz + (1.7 if cz < 0 else -1.7)), lab, font(12, 'Bold'), C['atk'],
                        anchor='rm' if cx > 0 else 'lm', stroke=2)
    # labels
    for r in rooms:
        if r['floor'] != fl or r['kind'] in ('solid',): continue
        x, z = r['label']
        nm = r['name']
        if r['kind'] == 'void':
            cv.text((x, z), nm.upper(), font(13, 'SemiBold'), (150, 120, 210), stroke=2); continue
        f = font(13, 'Bold') if r['kind'] == 'room' else font(11, 'Medium')
        col = C['text'] if r['kind'] in ('room', 'core') else C['dim']
        if r['id'] in SITE_ROOM:
            cv.text((x, z - 0.55), nm, font(14, 'Bold'), (255, 230, 255), stroke=2)
            cv.text((x, z + 0.55), 'SITE ' + SITE_ROOM[r['id']], font(11, 'Bold'), C['site_edge'], stroke=2)
        else:
            cv.text((x, z), nm, f, col, stroke=2)
            if r.get('double_height'):
                cv.text((x, z + 0.9), 'double height', font(9), (170, 140, 230), stroke=2)
    # title, north, scale
    F = [f_ for f_ in L['floors'] if f_['id'] == fl][0]
    cv.textpx((18, 16), 'HANEUL TOWER', font(22, 'Bold'), (200, 160, 255))
    cv.textpx((220, 20), '%s  %s  %s   floor y = %.1f m  (%.0f m above the river)' % (fl, F['level'], F['name'], fy, fy + L['exterior']['elevation_f1']), font(16, 'Medium'), C['text'])
    # north arrow
    nxp, nyp = PW - 50, TOP + 40
    cv.linepx((nxp, nyp + 22), (nxp, nyp - 18), C['text'], 2)
    cv.d.polygon([(nxp * SS, (nyp - 26) * SS), ((nxp - 7) * SS, (nyp - 12) * SS), ((nxp + 7) * SS, (nyp - 12) * SS)], fill=C['text'])
    cv.textpx((nxp, nyp + 30), 'N', font(13, 'Bold'), C['text'], 'mm')
    # scale bar 10 m
    sx, sy = 24, TOP + PH - 26
    cv.rectpx(sx, sy, sx + 10 * S, sy + 6, fill=C['text'])
    cv.rectpx(sx + 5 * S, sy, sx + 10 * S, sy + 6, fill=(90, 90, 100))
    cv.textpx((sx, sy - 18), '0', font(11), C['dim']); cv.textpx((sx + 10 * S - 22, sy - 18), '10 m', font(11), C['dim'])
    draw_legend(cv, PW + 16, TOP, fl)
    fn = os.path.join(outdir, 'plan_%s.png' % fl)
    cv.save(fn)
    return fn


def draw_bridge(cv, br, col, dashed=False):
    a, b = T(br['a']), T(br['b']); Lb = seg_len(a, b)
    nx, nz = -(b[1] - a[1]) / Lb, (b[0] - a[0]) / Lb
    hw = br['width'] / 2
    pts = [(a[0] + nx * hw, a[1] + nz * hw), (b[0] + nx * hw, b[1] + nz * hw), (b[0] - nx * hw, b[1] - nz * hw), (a[0] - nx * hw, a[1] - nz * hw)]
    if dashed:
        for i in range(4): cv.line(pts[i], pts[(i + 1) % 4], (110, 116, 140), 1.5, dash=(5, 4))
        mid = seg_point(a, b, min(Lb, 3.5))
        cv.text(mid, 'bridge roof', font(10), (150, 156, 180), stroke=2)
    else:
        cv.poly(pts, fill=col, outline=(130, 136, 160), width=2)
        mid = seg_point(a, b, min(Lb * 0.5, 3.0))
        cv.text(mid, br['name'], font(11, 'SemiBold'), C['text'], stroke=2)


def draw_cradle(cv, cr):
    x, z = cr['center']; a = math.radians(cr['yaw_deg'])
    ux, uz = math.cos(a), -math.sin(a)
    vx, vz = -uz, ux
    hw, hd = cr['w'] / 2, cr['d'] / 2
    pts = [(x + ux * hw + vx * hd, z + uz * hw + vz * hd), (x - ux * hw + vx * hd, z - uz * hw + vz * hd),
           (x - ux * hw - vx * hd, z - uz * hw - vz * hd), (x + ux * hw - vx * hd, z + uz * hw - vz * hd)]
    cv.poly(pts, fill=(80, 76, 60), outline=(180, 170, 120), width=2)
    cv.text((x + 2.0, z - 1.6), 'Cradle (F2-F3, 8 s)' if cr.get('moving') else 'Cradle', font(10, 'SemiBold'), (220, 210, 160), stroke=2)


def draw_tri(cv, p, col, r=7):
    x, y = cv.P(p); r *= SS
    cv.d.polygon([(x, y - r), (x + r * 0.9, y + r * 0.7), (x - r * 0.9, y + r * 0.7)], fill=col, outline=(255, 255, 255))


def draw_cover(cv, c):
    x, z = c['x'], c['z']; a = math.radians(c['yaw_deg'])
    fx, fz = math.sin(a), -math.cos(a)  # facing
    ux, uz = -fz, fx
    hw = c['w'] / 2
    p0 = (x + ux * hw, z + uz * hw); p1 = (x - ux * hw, z - uz * hw)
    cv.line(p0, p1, C['cover'], 5)
    cv.line((x, z), (x + fx * 0.6, z + fz * 0.6), C['cover'], 2)


def draw_stair(cv, st, fl):
    col = (170, 176, 196)
    if st['kind'] == 'switchback':
        x0, z0, x1, z1 = st['box']
        cv.rect(x0 + 0.3, z0 + 0.3, x1 - 0.3, z1 - 0.3, outline=col, width=1.5)
        xm = (x0 + x1) / 2
        land = 1.6
        if st['landing'] == 'south':
            za, zb = z0 + land, z1 - land
        else:
            za, zb = z0 + land, z1 - land
        for k in range(12):
            z = za + (zb - za) * k / 11
            cv.line((x0 + 0.3, z), (xm - 0.1, z), col, 1); cv.line((xm + 0.1, z), (x1 - 0.3, z), col, 1)
        cv.line((xm, za), (xm, zb), col, 2)
        # up arrow on the first flight
        if st['landing'] == 'south':
            ax = (x0 + xm) / 2; cv.line((ax, zb), (ax, za + 0.4), C['text'], 2)
            draw_arrowhead(cv, (ax, za + 0.4), (0, -1))
        else:
            ax = (xm + x1) / 2; cv.line((ax, za), (ax, zb - 0.4), C['text'], 2)
            draw_arrowhead(cv, (ax, zb - 0.4), (0, 1))
        return
    if st['kind'] == 'spiral':
        c = st['center']; r = st['radius']
        cv.circle(T(c), r * cv.s, outline=col, width=2)
        for k in range(12):
            a = k * math.pi / 6
            cv.line(T(c), (c[0] + math.cos(a) * r, c[1] + math.sin(a) * r), col, 1)
        cv.text((c[0], c[1] + r + 0.6), st['name'], font(10), C['dim'], stroke=2)
        return
    p0, p1 = st['path'][0], st['path'][-1]
    a, b = (p0[0], p0[2]), (p1[0], p1[2])
    Lb = seg_len(a, b); ux, uz = (b[0] - a[0]) / Lb, (b[1] - a[1]) / Lb
    nx, nz = -uz, ux; hw = st['width'] / 2
    pts = [(a[0] + nx * hw, a[1] + nz * hw), (b[0] + nx * hw, b[1] + nz * hw), (b[0] - nx * hw, b[1] - nz * hw), (a[0] - nx * hw, a[1] - nz * hw)]
    cv.poly(pts, fill=(58, 62, 78), outline=col, width=1.5)
    if st.get('mid_landing'):
        x0, z0, x1, z1 = st['mid_landing']['box']; cv.rect(x0, z0, x1, z1, fill=(84, 88, 100), outline=col, width=1.5)
    n = max(4, int(Lb / 0.4))
    for k in range(n + 1):
        q = seg_point(a, b, Lb * k / n)
        cv.line((q[0] + nx * hw, q[1] + nz * hw), (q[0] - nx * hw, q[1] - nz * hw), col, 1)
    cv.line(seg_point(a, b, 0.3), seg_point(a, b, Lb - 0.5), C['text'], 2)
    draw_arrowhead(cv, seg_point(a, b, Lb - 0.5), (ux, uz))
    m = seg_point(a, b, Lb / 2)
    tag = ' (down to %s)' % st['floors'][0] if fl == st['floors'][-1] else ' (up to %s)' % st['floors'][-1]
    cv.text((m[0] + nx * (hw + 0.7), m[1] + nz * (hw + 0.7)), st['name'] + tag, font(10), C['dim'], stroke=2)


def draw_arrowhead(cv, p, d):
    x, y = cv.P(p); ux, uy = d
    s = 7 * SS
    cv.d.polygon([(x + ux * s, y + uy * s), (x - uy * s * 0.6, y + ux * s * 0.6), (x + uy * s * 0.6, y - ux * s * 0.6)], fill=C['text'])


def draw_ladder(cv, ld):
    x, z = ld['x'], ld['z']
    cv.rect(x - 0.3, z - 0.3, x + 0.3, z + 0.3, fill=(30, 30, 40), outline=(255, 255, 255), width=1.5)
    for k in (-0.15, 0, 0.15): cv.line((x - 0.3, z + k), (x + 0.3, z + k), (255, 255, 255), 1)
    cv.text((x, z - 0.8), ld['name'], font(9, 'Medium'), (230, 230, 230), stroke=2)


def draw_legend(cv, x, y, fl):
    f = font(12); fb = font(13, 'Bold')
    cv.textpx((x, y), 'SURFACE TYPES', fb, (200, 160, 255)); y += 26
    items = [
        ('wall', 'hard', 'hard wall (indestructible); every corner / T is hard for 1.0 m'),
        ('wall', 'reinforceable', 'breakable + reinforceable: Wall Fortification units (ticks), dot = site side'), ('wall', 'glass', 'interior glass (breakable)'),
        ('dash', 'balustrade', 'glass balustrade / rail'), ('dash', 'open', 'callout boundary (no wall)'),
        ('gap', 'door_b', 'barricadable door'), ('gap', 'door_o', 'open archway / pried lift door'),
        ('dash', 'win_b', 'barricadable interior window'), ('dash', 'vault', 'vault counter (no barricade)'),
        ('wall', 'glass_tempered', 'facade: tempered glass (unbreakable)'), ('wall', 'glass_breakable', 'facade: breakable glass'),
        ('wall', 'window_barricadable', 'facade: barricadable entry window'), ('wall', 'door_barricadable', 'facade: barricadable door'),
        ('wall', 'spandrel', 'facade: opaque spandrel'), ('wall', 'portal', 'bridge portal'),
        ('sq', 'hatch', 'hatch 1.2 m (dashed = in ceiling; R = reinforced from that side)'), ('sq', 'soft_floor', 'soft floor patch 2.4 m'),
        ('col', 'column', 'structural column (hard)'),
    ]
    for kind, key, label in items:
        col = C[key]
        if kind == 'wall': cv.linepx((x, y + 8), (x + 46, y + 8), col, 7)
        elif kind == 'dash':
            for k in range(0, 46, 9): cv.linepx((x + k, y + 8), (x + k + 5, y + 8), col, 3)
        elif kind == 'gap':
            cv.linepx((x, y + 8), (x + 14, y + 8), C['hard'], 5); cv.linepx((x + 32, y + 8), (x + 46, y + 8), C['hard'], 5)
            cv.linepx((x + 14, y + 8), (x + 32, y + 8), col, 3)
        elif kind == 'sq':
            cv.rectpx(x + 14, y, x + 30, y + 16, fill=tuple(int(c * 0.45) for c in col), outline=col, width=2)
        elif kind == 'col':
            cv.rectpx(x + 16, y + 1, x + 30, y + 15, fill=col)
        cv.textpx((x + 58, y), label, f, C['text'])
        y += 24
    y += 10
    cv.textpx((x, y), 'MARKERS', fb, (200, 160, 255)); y += 26
    cv.rectpx(x + 4, y, x + 40, y + 16, fill=C['site'], outline=C['site_edge'], width=2); cv.textpx((x + 58, y), 'objective site room', f, C['text']); y += 24
    cv.d.polygon([((x + 22) * SS, y * SS), ((x + 30) * SS, (y + 8) * SS), ((x + 22) * SS, (y + 16) * SS), ((x + 14) * SS, (y + 8) * SS)], fill=C['obj'])
    cv.textpx((x + 58, y), 'objective marker', f, C['text']); y += 24
    cv.d.ellipse([(x + 16) * SS, (y + 2) * SS, (x + 28) * SS, (y + 14) * SS], fill=C['def'], outline=(255, 255, 255))
    cv.textpx((x + 58, y), 'defender spawn (per site)', f, C['text']); y += 24
    cv.d.polygon([((x + 22) * SS, y * SS), ((x + 30) * SS, (y + 14) * SS), ((x + 14) * SS, (y + 14) * SS)], fill=C['atk'], outline=(255, 255, 255))
    cv.textpx((x + 58, y), 'attacker spawn / direction', f, C['text']); y += 24
    cv.linepx((x + 8, y + 8), (x + 36, y + 8), C['cover'], 5); cv.textpx((x + 58, y), 'deployable cover spot', f, C['text']); y += 24
    cv.rectpx(x + 8, y + 2, x + 36, y + 14, outline=(170, 176, 196), width=1); cv.linepx((x + 12, y + 8), (x + 32, y + 8), C['text'], 2)
    cv.textpx((x + 58, y), 'stair (arrow = up)', f, C['text']); y += 24
    cv.rectpx(x + 15, y + 1, x + 29, y + 15, outline=(255, 255, 255), width=1); cv.textpx((x + 58, y), 'ladder', f, C['text']); y += 24
    cv.linepx((x, y + 8), (x + 46, y + 8), C['ledge'], 10); cv.textpx((x + 58, y), 'ledge 0.8 m (rappel anywhere); all exterior = defender reveal zone', f, C['text']); y += 24
    cv.rectpx(x + 4, y, x + 40, y + 16, outline=(170, 120, 255), width=2); cv.textpx((x + 58, y), 'void above (double height)', f, C['text']); y += 24
    cv.rectpx(x + 4, y, x + 20, y + 16, fill=(92, 96, 110), outline=(170, 176, 190)); cv.rectpx(x + 24, y, x + 40, y + 16, fill=(66, 70, 84), outline=(170, 176, 190))
    cv.textpx((x + 58, y), 'hard prop: full / half cover', f, C['text']); y += 24
    cv.rectpx(x + 4, y, x + 20, y + 16, fill=(84, 64, 52), outline=(190, 150, 110)); cv.rectpx(x + 24, y, x + 40, y + 16, fill=(66, 54, 46), outline=(190, 150, 110))
    cv.textpx((x + 58, y), 'destructible prop: full / half cover', f, C['text']); y += 24
    for k, oc in enumerate(((150, 120, 220), (110, 96, 160))):
        for e in ((0, 0, 16, 0), (16, 0, 16, 16), (16, 16, 0, 16), (0, 16, 0, 0)):
            cv.linepx((x + 4 + k * 20 + e[0], y + e[1]), (x + 4 + k * 20 + e[2], y + e[3]), oc, 1)
    cv.textpx((x + 58, y), 'furniture slot, full / half (PROP_ marker; X = breaks a sightline)', f, C['text']); y += 34
    # floor stats
    cnt = {}
    for w in walls:
        if w['floor'] == fl and w['type'] != 'open':
            cnt[w['type']] = cnt.get(w['type'], 0) + w['length']
    cv.textpx((x, y), 'THIS FLOOR', fb, (200, 160, 255)); y += 24
    brk = sum(p['u1'] - p['u0'] for w in walls if w['floor'] == fl and w['type'] == 'reinforceable' for p in w['reinforce']['panels'])
    nbw = sum(1 for w in walls if w['floor'] == fl and w['type'] == 'reinforceable')
    cv.textpx((x, y), '%-14s %6.1f m' % ('hard', cnt.get('hard', 0) + cnt.get('reinforceable', 0) - brk), font(12, 'Medium'), C['hard']); y += 20
    cv.textpx((x, y), 'breakable      %6.1f m in %d walls (all reinforceable)' % (brk, nbw), font(12, 'Medium'), C['reinforceable']); y += 20
    cv.textpx((x, y), '%-14s %6.1f m' % ('glass', cnt.get('glass', 0)), font(12, 'Medium'), C['glass']); y += 20
    units = {}
    for w in walls:
        if w['floor'] == fl and w['type'] == 'reinforceable':
            for p in w['reinforce']['panels']: units[p['size']] = units.get(p['size'], 0) + 1
    cv.textpx((x, y), 'fortification units: ' + ', '.join('%s x%d' % (k, v) for k, v in sorted(units.items())), font(12), C['text']); y += 20
    lites = {}
    for b in bays:
        if b['floor'] == fl:
            for lt in b['lites']: lites[lt['type']] = lites.get(lt['type'], 0) + 1
    cv.textpx((x, y), 'lites: tempered %d, breakable %d, entry windows %d, doors %d' % (
        lites.get('glass_tempered', 0), lites.get('glass_breakable', 0), lites.get('window_barricadable', 0), lites.get('door_barricadable', 0)), font(12), C['text']); y += 20
    nh = sum(1 for h in L['hatches'] if h['floor'] == fl); npch = sum(1 for h in L['floor_patches'] if h['floor'] == fl)
    cv.textpx((x, y), 'hatches in this floor: %d, soft floor patches: %d' % (nh, npch), font(12), C['text']); y += 30
    sites = [s for s in L['sites'] if s['floor'] == fl]
    if sites:
        cv.textpx((x, y), 'SITES ON THIS FLOOR', fb, (200, 160, 255)); y += 24
        for s in sites:
            cv.textpx((x, y), '%s  %s' % (s['id'], s['name']), font(12, 'SemiBold'), (255, 230, 255)); y += 20


def draw_overview():
    S = 8
    X0, Z0, X1, Z1 = -82, -72, 88, 62
    PW, PH = int((X1 - X0) * S), int((Z1 - Z0) * S)
    TOP = 60
    mini = 12; MW = 64 * mini
    H = TOP + PH + 40 + 64 * mini + 30
    W = max(PW, 3 * MW + 40)
    cv = Cv(W, H, X0, Z0, S, 0, TOP)
    ex = L['exterior']
    for nb in ex['neighbours']:
        pts = [T(p) for p in nb['footprint']]
        col = (30, 34, 44) if nb['id'] == 'NB_lowerblock' else C['neighbour']
        cv.poly(pts, fill=col, outline=(90, 96, 116), width=2)
        c = tuple(nb['label']) if nb.get('label') else centroid(pts)
        if nb['id'] != 'NB_lowerblock':
            cv.text((c[0], c[1]), '%s (top %.1f)' % (nb['name'], nb['top_y']) if nb['top_y'] < 50 else nb['name'], font(13, 'Bold'), C['dim'], stroke=2)
        for ft in nb.get('features', []):
            if 'box' in ft: cv.rect(*ft['box'], fill=(58, 60, 72), outline=(100, 100, 120))
            elif 'r' in ft: cv.circle(T(ft['center']), ft['r'] * S, outline=(100, 110, 130), width=2)
            elif 'center' in ft: cv.circle(T(ft['center']), 1.5 * S, fill=(120, 110, 70))
        if 'spawn_hall' in nb: cv.poly([T(p) for p in nb['spawn_hall']], fill=(70, 36, 40), outline=C['atk'], width=2)
    cv.poly([T(p) for p in ex['terrace']['polygon']], fill=C['terrace'], outline=(80, 90, 100), width=2)
    for ft in ex['terrace']['features']:
        if 'box' in ft: cv.rect(*ft['box'], fill=(60, 60, 66))
    cv.poly([T(p) for p in L['outline']], fill=(46, 48, 66), outline=(200, 160, 255), width=3)
    cv.poly([T(p) for p in L['core']['outline']], fill=(80, 80, 90))
    for k in ('skybridge', 'catwalk', 'catwalk2', 'gantry', 'hoist_ramp', 'bridge_truss'): draw_bridge(cv, ex[k], (70, 76, 96))
    draw_cradle(cv, ex['cradle'])
    for r in L['routes']:
        pts = [(p[0], p[2]) for p in r['points']]
        col = C['route_' + r['kind']]
        for i in range(len(pts) - 1):
            cv.line(pts[i], pts[i + 1], col, 2.5, dash=(7, 4) if r['kind'] != 'attack' else None)
        if len(pts) > 1:
            a, b = pts[-2], pts[-1]; d = seg_len(a, b)
            if d > 0: draw_arrowhead(cv, b, ((b[0] - a[0]) / d, (b[1] - a[1]) / d))
    for sp in L['spawns']['attackers']:
        for p in sp['points']: draw_tri(cv, (p[0], p[2]), C['atk'], 6)
        p = sp['points'][0]; zmax = max(q[2] for q in sp['points'])
        cv.text((sum(q[0] for q in sp['points']) / 5, zmax + 3.5), '%s %s  (y %.1f)' % (sp['id'], sp['name'], p[1]), font(14, 'Bold'), C['atk'], stroke=2)
    for s in L['sites']:
        for o in s['objectives']:
            x, _, z = o['pos']; cv.circle((x, z), 4, fill=C['obj'])
        x, _, z = s['objectives'][0]['pos']
        cv.text((x, z - 3), '%s (%s)' % (s['id'], s['floor']), font(12, 'Bold'), C['obj'], stroke=2)
    nav = None
    try:
        import subprocess, tempfile
        tmp = os.path.join(outdir, '_navtime.json')
        subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'navtime.py'), path, '--json', tmp],
                       check=True, capture_output=True)
        nav = json.load(open(tmp)); os.remove(tmp)
    except Exception as e:
        print('navtime failed:', e)
    px, py = PW + 30, TOP + 10
    cv.textpx((px, py), 'ROUTES', font(15, 'Bold'), (200, 160, 255)); py += 28
    for kind, lab in (('attack', 'attack route'), ('rotation', 'defender rotation'), ('flank', 'flank / vertical')):
        cv.linepx((px, py + 8), (px + 40, py + 8), C['route_' + kind], 3); cv.textpx((px + 52, py), lab, font(13), C['text']); py += 24
    py += 10
    for r in L['routes']:
        cv.textpx((px, py), '%s  %s > %s  %s' % (r['kind'][:3], r['from'], r['to'], r['note']), font(11), C['dim']); py += 18
    if nav:
        py += 16
        cv.textpx((px, py), 'TIMINGS (nav grid, sprint 5 m/s, barricades and climbs included)', font(15, 'Bold'), (200, 160, 255)); py += 28
        ids = [o['id'] for s_ in L['sites'] for o in s_['objectives']]
        cv.textpx((px, py), 'spawn', font(12, 'Bold'), C['text'])
        for k, h in enumerate(ids + ['building']):
            cv.textpx((px + 150 + k * 62, py), h, font(12, 'Bold'), C['obj'] if h != 'building' else C['text'])
        py += 22
        names = {sp['id']: sp['name'] for sp in L['spawns']['attackers']}
        for sid, row in nav['attack'].items():
            cv.textpx((px, py), '%s %s' % (sid, names[sid]), font(12), C['atk'])
            best = min(v for k_, v in row.items() if k_ != 'building' and v is not None)
            for k, h in enumerate(ids + ['building']):
                v = row[h]
                cv.textpx((px + 150 + k * 62, py), '-' if v is None else '%.0f s' % v, font(12, 'Bold' if v == best else 'Regular'), C['text'])
            py += 20
        py += 14
        cv.textpx((px, py), 'defender rotation (objective A to A, interior)', font(12, 'Bold'), C['text']); py += 22
        sids = [s_['id'] for s_ in L['sites']]
        for k, h in enumerate(sids): cv.textpx((px + 150 + k * 62, py), h, font(12, 'Bold'), C['def'])
        py += 20
        for a_, row in nav['defend'].items():
            cv.textpx((px, py), a_, font(12, 'Bold'), C['def'])
            for k, h in enumerate(sids): cv.textpx((px + 150 + k * 62, py), '%.0f s' % row[h] if row[h] else '-', font(12), C['text'])
            py += 20
    cv.textpx((18, 14), 'HANEUL TOWER  overview', font(22, 'Bold'), (200, 160, 255))
    cv.textpx((360, 20), 'site plan: spawns, approaches, routes (red attack, blue rotation, yellow flank); river to the south', font(14), C['text'])
    # scale
    sx, sy = 20, TOP + PH - 20
    cv.rectpx(sx, sy, sx + 20 * S, sy + 6, fill=C['text']); cv.textpx((sx + 20 * S + 8, sy - 6), '20 m', font(12), C['dim'])
    # three mini plans
    oy = TOP + PH + 40
    for i, f in enumerate(L['floors']):
        ox = 10 + i * (MW + 15)
        sub = Cv(MW, 64 * mini, -32, -32, mini)
        fl = f['id']
        for r in rooms:
            if r['floor'] != fl: continue
            pts = [T(p) for p in r['polygon']]
            sub.poly(pts, fill=room_fill(r))
            if r['kind'] == 'void': sub.hatchpoly(pts, (40, 40, 58), 1.2, 1)
        draw_walls(sub, fl, 0.6)
        draw_facade(sub, fl, 0.6)
        for r in rooms:
            if r['floor'] == fl and r['id'] in SITE_ROOM:
                x, z = r['label']; sub.text((x, z), SITE_ROOM[r['id']], font(11, 'Bold'), (255, 230, 255), stroke=2)
        for h in L['hatches'] + L['floor_patches']:
            if h['floor'] == fl:
                col = C['hatch'] if h['type'] == 'hatch' else C['soft_floor']
                sub.rect(h['x'] - 0.8, h['z'] - 0.8, h['x'] + 0.8, h['z'] + 0.8, fill=col)
        sub.textpx((8, 6), '%s %s %s' % (fl, f['level'], f['name']), font(14, 'Bold'), C['text'])
        im = sub.img
        cv.img.paste(im, (ox * SS, oy * SS))
    cv.save(os.path.join(outdir, 'plan_overview.png'))


outs = [draw_floor(f['id']) for f in L['floors']]
draw_overview()
print('\n'.join(outs + [os.path.join(outdir, 'plan_overview.png')]))
