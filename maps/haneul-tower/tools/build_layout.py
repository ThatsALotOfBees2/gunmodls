#!/usr/bin/env python3
# Haneul Tower level design source. Writes ../layout.json.
# Edit the tables below and re-run: python3 tools/build_layout.py && python3 tools/validate_layout.py
# Plan coords: x east, z south (north = -z), y up, metres.
# Wall/opening heights are relative to the wall's floor level; [x,y,z] points are absolute.
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geom import rect, area, centroid, point_in_poly, seg_len, seg_point

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'layout.json')

FTF, CEIL, SLAB = 4.2, 3.1, 0.3
DOOR_H = 2.0          # door heads and the reinforce transom line
REINF_H = 2.0         # Wall Fortification covers 2.0 m
SIZES = {'xl': 4.0, 'large': 3.0, 'standard': 1.5, 'small': 1.0}
THICK = {'hard': 0.4, 'soft': 0.15, 'reinforceable': 0.2, 'glass': 0.08, 'balustrade': 0.06, 'open': 0.0}

FLOORS = [
    {'id': 'F1', 'level': '96F', 'name': 'Garden Level', 'y': 0.0},
    {'id': 'F2', 'level': '97F', 'name': 'Sky Lobby', 'y': 4.2},
    {'id': 'F3', 'level': '98F', 'name': 'Broadcast', 'y': 8.4},
]
FY = {f['id']: f['y'] for f in FLOORS}
NEXT = {'F1': 'F2', 'F2': 'F3', 'F3': None}

OUTLINE = [(-21, -26), (21, -26), (26, -21), (26, 21), (21, 26), (-21, 26), (-26, 21), (-26, -21)]
FACES = [  # name, start, end, bays
    ('N', (-21, -26), (21, -26), 14), ('NE', (21, -26), (26, -21), 2),
    ('E', (26, -21), (26, 21), 14), ('SE', (26, 21), (21, 26), 2),
    ('S', (21, 26), (-21, 26), 14), ('SW', (-21, 26), (-26, 21), 2),
    ('W', (-26, 21), (-26, -21), 14), ('NW', (-26, -21), (-21, -26), 2),
]
CORE = rect(-9, -9, 9, 9)
BAND = 0.26           # depth of a deployed unit (XL band 0.2 + terminal)
TRIM = 0.05           # min hard trim at each end of a unit run
PILASTER = 0.3        # hard pilaster where two reinforceable walls of one room meet
BUDGET = 8            # reinforcements per defending team per round (any unit or hatch = 1)

rooms, walls, bays = [], [], []
counters = {}

# ---------------------------------------------------------------- columns (defined first: walls clip against them)
columns = []
for c in (-18, -9, 0, 9, 18):
    mega = abs(c) == 9
    s = 1.6 if mega else 1.0
    for (x, z, face) in ((c, -25, 'N'), (c, 25, 'S'), (25, c, 'E'), (-25, c, 'W')):
        columns.append({'id': 'C_%s%+d' % (face, c), 'x': x, 'z': z, 'w': s, 'd': s, 'kind': 'mega' if mega else 'perimeter', 'type': 'hard'})
for sx in (-1, 1):
    for sz in (-1, 1):
        columns.append({'id': 'C_corner_%s%s' % ('N' if sz < 0 else 'S', 'E' if sx > 0 else 'W'), 'x': 22.8 * sx, 'z': 22.8 * sz,
                        'w': 1.4, 'd': 1.4, 'kind': 'corner', 'type': 'hard'})


def col_at(p):
    for c in columns:
        if abs(p[0] - c['x']) <= c['w'] / 2 + 1e-6 and abs(p[1] - c['z']) <= c['d'] / 2 + 1e-6:
            return c
    return None


def on_outline(p):
    from geom import on_polyline
    return on_polyline(p, OUTLINE, True, 0.02)


def nid(prefix):
    counters[prefix] = counters.get(prefix, 0) + 1
    return '%s%02d' % (prefix, counters[prefix])


def slug(s):
    return ''.join(c if c.isalnum() else '_' for c in s.lower()).strip('_')

# ---------------------------------------------------------------- rooms


def R(fl, name, poly, kind='room', **kw):
    if not isinstance(poly, list): poly = list(poly)
    rid = '%s_%s' % (fl, slug(name))
    poly = [tuple(map(float, p)) for p in poly]
    r = {'id': rid, 'floor': fl, 'name': name, 'kind': kind, 'polygon': [list(p) for p in poly],
         'area': round(abs(area(poly)), 1)}
    c = kw.pop('label', None) or centroid(poly)
    r['label'] = [round(c[0], 2), round(c[1], 2)]
    r.update(kw)
    rooms.append(r)
    return rid


def core_rooms(fl, lobby):
    R(fl, lobby, rect(-9, -2, 9, 2), 'core')
    R(fl, 'Stair A', rect(3, -9, 9, -2), 'stair')
    R(fl, 'Stair B', rect(-9, 2, -3, 9), 'stair')
    R(fl, 'Shaft', rect(-9, -5, -6, -2), 'shaft')
    R(fl, 'Riser NW', rect(-9, -9, -6, -5), 'solid')
    R(fl, 'Lifts North', rect(-6, -9, 3, -2), 'solid')
    R(fl, 'Lifts South', rect(-3, 2, 6, 9), 'solid')
    R(fl, 'Riser SE', rect(6, 2, 9, 9), 'solid')

# ---------------------------------------------------------------- openings
# spec: (kind, c[, w]) with c = coordinate along the wall axis (x for E-W walls, z for N-S walls)


def door(c): return ('door', c, 1.0)
def dd(c): return ('double_door', c, 2.0)
def arch(c, w): return ('opening', c, w)
def win(c, w=1.5): return ('window', c, w)
def vault(c, w=2.0): return ('vault', c, w)
def liftdoor(c): return ('lift_door', c, 1.0)
def gap(c, w): return ('gap', c, w)  # balustrade gap


OPEN_KIND = {
    'door': dict(y0=0.0, y1=DOOR_H, barricadable=True),
    'double_door': dict(y0=0.0, y1=DOOR_H, barricadable=True),
    'opening': dict(y0=0.0, y1=2.6, barricadable=False),
    'window': dict(y0=1.0, y1=DOOR_H, barricadable=True),
    'vault': dict(y0=1.0, y1=DOOR_H, barricadable=False),
    'lift_door': dict(y0=0.0, y1=2.1, barricadable=False),
    'gap': dict(y0=0.0, y1=1.1, barricadable=False),
}


def W(fl, a, b, typ, *ops, **kw):
    a = (float(a[0]), float(a[1])); b = (float(b[0]), float(b[1]))
    # a wall that meets the glass on a column line stops at the column face; the rest is a hard column wrap
    wraps = []
    for end in ('a', 'b'):
        p, q = (a, b) if end == 'a' else (b, a)
        if not on_outline(p): continue
        L0 = seg_len(p, q); ux, uz = (q[0] - p[0]) / L0, (q[1] - p[1]) / L0
        c = col_at((p[0] + ux * 1.0, p[1] + uz * 1.0))
        if not c: continue
        if abs(ux) > 0.5: np_ = (c['x'] + (c['w'] / 2 if ux > 0 else -c['w'] / 2), p[1])
        else: np_ = (p[0], c['z'] + (c['d'] / 2 if uz > 0 else -c['d'] / 2))
        wraps.append((np_, p, c['id']))
        if end == 'a': a = np_
        else: b = np_
    L = seg_len(a, b)
    horiz = abs(a[1] - b[1]) < 1e-6
    w = {'id': nid('%s_W' % fl), 'floor': fl, 'a': list(a), 'b': list(b), 'length': round(L, 3),
         'type': typ, 'thickness': kw.pop('thickness', THICK[typ]),
         'y0': 0.0, 'y1': kw.pop('y1', 1.1 if typ == 'balustrade' else CEIL)}
    if kw.get('to_slab'):
        w['y1'] = round(FTF - SLAB, 2)  # 3.9: up to the underside of the slab above
    opl = []
    for op in ops:
        kind, c, wd = op
        u = abs(c - (a[0] if horiz else a[1]))
        o = {'id': nid('%s_O' % fl), 'kind': kind, 'u0': round(u - wd / 2, 3), 'u1': round(u + wd / 2, 3)}
        o.update(OPEN_KIND[kind])
        if kind == 'gap':
            o['y1'] = w['y1']
        opl.append(o)
    w['openings'] = opl
    units = kw.pop('units', None)
    yields = kw.pop('yields', ())
    if typ == 'reinforceable':
        assert not opl, 'reinforceable walls carry no openings'
        assert units, 'reinforceable wall needs units'
        w['reinforce'] = {'y0': 0.0, 'y1': REINF_H, 'header': 'hard', 'units': list(units), 'yields': list(yields)}
    for k, v in kw.items():
        w[k] = v
    walls.append(w)
    for (p0, p1, cid) in wraps:
        walls.append({'id': nid('%s_W' % fl), 'floor': fl, 'a': list(p0), 'b': list(p1), 'length': round(seg_len(p0, p1), 3),
                      'type': 'hard', 'thickness': 0.4, 'y0': 0.0, 'y1': w['y1'], 'openings': [], 'column_wrap': cid,
                      'note': 'hard column wrap from the column face to the glass'})
    return w


def core_walls(fl):
    W(fl, (-9, -9), (9, -9), 'hard', thickness=0.6, core=True)
    W(fl, (-9, 9), (9, 9), 'hard', thickness=0.6, core=True)
    W(fl, (9, -9), (9, 9), 'hard', door(-3.0), dd(0.0), thickness=0.6, core=True)
    W(fl, (-9, -9), (-9, 9), 'hard', dd(0.0), door(3.0), thickness=0.6, core=True)
    W(fl, (-9, -2), (9, -2), 'hard', liftdoor(-7.5), door(8.0), thickness=0.3, core=True)
    W(fl, (-9, 2), (9, 2), 'hard', door(-8.0), thickness=0.3, core=True)
    W(fl, (3, -9), (3, -2), 'hard', thickness=0.3, core=True)
    W(fl, (-6, -9), (-6, -2), 'hard', thickness=0.3, core=True)
    W(fl, (-9, -5), (-6, -5), 'hard', thickness=0.3, core=True)
    W(fl, (-3, 2), (-3, 9), 'hard', thickness=0.3, core=True)
    W(fl, (6, 2), (6, 9), 'hard', thickness=0.3, core=True)

# ================================================================= F1 96F Garden Level


def floor1():
    f = 'F1'
    core_rooms(f, 'Garden Lifts')
    R(f, 'Garden', [(-26, 9), (-12, 9), (-12, 12), (-9, 12), (-9, 26), (-21, 26), (-26, 21)], double_height=True,
      tags=['signature', 'roam'], label=(-15.5, 14.2), ceiling_note='double height over x<-12, z>12 (open to the F2 ceiling, 7.3 m); 3.1 m arcade under the Gallery')
    R(f, 'Garden Lobby', rect(-12, 9, -9, 12), 'corridor', label=(-10.5, 10.5))
    R(f, 'Spa Hall', rect(-9, 9, 15, 12), 'corridor', label=(3, 10.5))
    R(f, 'Tea Room', rect(-9, 12, 0, 21), site='S4', label=(-3.4, 18.4))
    R(f, 'Ondol Lounge', rect(0, 12, 9, 21), site='S4')
    R(f, 'Veranda', rect(-9, 21, 9, 26), tags=['roam'])
    R(f, 'Changing', rect(9, 12, 15, 18), label=(12, 13.4))
    R(f, 'Steam Room', rect(9, 18, 15, 26))
    R(f, 'Bathhouse', [(15, 9), (26, 9), (26, 21), (21, 26), (15, 26)])
    R(f, 'Locker Hall', rect(9, -12, 12, 9), 'corridor', label=(10.5, 4.5))
    R(f, 'Lockers', rect(12, 0, 26, 9))
    R(f, 'Treatment', rect(12, -12, 20, 0))
    R(f, 'Salt Room', rect(20, -12, 26, 0))
    R(f, 'Laundry', [(12, -12), (12, -26), (21, -26), (26, -21), (26, -12)], tags=['roam'])
    R(f, 'Kitchen', rect(-3, -26, 12, -12), tags=['roam'])
    R(f, 'Kitchen Pass', rect(-9, -12, 9, -9), 'corridor')
    R(f, 'Servery', rect(-9, -19, -3, -12))
    R(f, 'Cold Store', rect(-9, -26, -3, -19), 'solid', ceiling_note='locked walk-in freezer: hard walls, not playable')
    R(f, 'Dining Room', [(-26, -12), (-26, -21), (-21, -26), (-9, -26), (-9, -12)], tags=['roam'], label=(-17, -18))
    R(f, 'Service Hall', rect(-12, -12, -9, 9), 'corridor', label=(-10.5, 4.5))
    R(f, 'Staff Entry', rect(-26, -12, -19, 0))
    R(f, 'Plant Room', rect(-19, -12, -12, 0))
    R(f, 'Canteen', rect(-26, 0, -12, 9), label=(-19, 7.3))
    core_walls(f)
    # garden edge and the Garden Lobby (defender link Service Hall <-> Spa Hall)
    W(f, (-26, 9), (-12, 9), 'soft', door(-16.0), win(-22.5))
    W(f, (-12, 9), (-9, 9), 'soft', dd(-10.5))
    W(f, (-12, 9), (-12, 12), 'soft', door(11.4), note='Garden Lobby door into the garden arcade')
    W(f, (-12, 12), (-9, 12), 'soft')
    W(f, (-9, 9), (-9, 12), 'soft', door(9.9), note='offset from the lobby door to kill the long E-W line')
    W(f, (-9, 12), (-9, 21), 'hard', door(13.4), note='garden stone wall (hard anchor of S4)')
    W(f, (-9, 21), (-9, 26), 'soft', door(23.5))
    # S4 Tea Room / Ondol Lounge
    W(f, (-9, 12), (-6, 12), 'soft', door(-7.5))
    W(f, (-6, 12), (0, 12), 'reinforceable', units=['xl', 'standard'])
    W(f, (0, 12), (4.5, 12), 'reinforceable', units=['xl'])
    W(f, (4.5, 12), (9, 12), 'soft', door(7.0))
    W(f, (-9, 21), (-4.4, 21), 'reinforceable', units=['xl'])
    W(f, (-4.4, 21), (-3.2, 21), 'soft', door(-3.8))
    W(f, (-3.2, 21), (0, 21), 'reinforceable', units=['large'])
    W(f, (0, 21), (3.2, 21), 'reinforceable', units=['large'])
    W(f, (3.2, 21), (5.8, 21), 'soft', dd(4.5))
    W(f, (5.8, 21), (9, 21), 'reinforceable', units=['large'])
    W(f, (0, 12), (0, 21), 'soft', door(19.3), note='shared hanji screen wall')
    W(f, (9, 12), (9, 13.75), 'reinforceable', units=['standard'])
    W(f, (9, 13.75), (9, 18), 'soft', door(15.5))
    W(f, (9, 18), (9, 21), 'reinforceable', units=['standard', 'small'], yields=('b',))
    W(f, (9, 21), (9, 26), 'soft', door(23.5))
    # spa
    W(f, (9, 12), (15, 12), 'soft', door(13.8))
    W(f, (9, 18), (15, 18), 'soft', door(10.6))
    W(f, (15, 9), (15, 12), 'soft', dd(10.5))
    W(f, (15, 12), (15, 18), 'soft', door(13.2))
    W(f, (15, 18), (15, 26), 'glass', door(22.5))
    W(f, (9, 9), (12, 9), 'open')
    W(f, (12, 9), (15, 9), 'soft', door(13.5))
    W(f, (15, 9), (26, 9), 'soft', door(21.5))
    W(f, (12, 0), (12, 9), 'soft', door(4.5))
    W(f, (12, -12), (12, 0), 'soft', door(-6.5))
    W(f, (12, 0), (20, 0), 'soft', door(16.0))
    W(f, (20, 0), (26, 0), 'soft', door(23.0))
    W(f, (20, -12), (20, 0), 'glass', door(-6.0))
    W(f, (12, -12), (20, -12), 'soft', door(16.0))
    W(f, (20, -12), (26, -12), 'soft')
    # back of house
    W(f, (9, -12), (12, -12), 'soft', door(10.5))
    W(f, (9, -12), (9, -9), 'open')
    W(f, (12, -26), (12, -12), 'soft', door(-22.5))
    W(f, (-3, -12), (9, -12), 'soft', vault(0.0), dd(4.0))
    W(f, (-9, -12), (-3, -12), 'soft', door(-6.0))
    W(f, (-3, -19), (-3, -12), 'soft', vault(-15.5), door(-13.0))
    W(f, (-3, -26), (-3, -19), 'hard', note='cold store wall (insulated steel)')
    W(f, (-9, -19), (-3, -19), 'hard', note='cold store wall (insulated steel)')
    W(f, (-9, -26), (-9, -19), 'hard', note='cold store wall (insulated steel)')
    W(f, (-9, -19), (-9, -12), 'soft', dd(-17.8))
    W(f, (-9, -12), (-9, -9), 'open')
    W(f, (-12, -12), (-9, -12), 'soft', door(-10.5))
    W(f, (-19, -12), (-12, -12), 'soft')
    W(f, (-26, -12), (-19, -12), 'soft', door(-22.5))
    W(f, (-12, -12), (-12, 0), 'soft', door(-6.0))
    W(f, (-12, 0), (-12, 9), 'soft', door(4.5))
    W(f, (-19, -12), (-19, 0), 'soft', door(-3.0))
    W(f, (-26, 0), (-19, 0), 'soft', door(-20.2))
    W(f, (-19, 0), (-12, 0), 'soft')

# ================================================================= F2 97F Sky Lobby


def floor2():
    f = 'F2'
    core_rooms(f, 'Sky Lifts')
    R(f, 'Garden Void', [(-26, 12), (-12, 12), (-12, 26), (-21, 26), (-26, 21)], 'void', label=(-18, 20))
    R(f, 'Gallery', [(-26, 9), (-9, 9), (-9, 26), (-12, 26), (-12, 12), (-26, 12)], tags=['signature', 'roam'], label=(-18, 10.5))
    R(f, 'Reception', rect(-9, 9, 9, 19), tags=['roam'], label=(6.0, 10.6))
    R(f, 'River Lounge', rect(-9, 19, 9, 26), tags=['roam'], label=(5.0, 24.0))
    R(f, 'Security', rect(9, 9, 15, 18), label=(12, 16.0))
    R(f, 'Cloakroom', rect(9, 18, 15, 26), label=(12, 23.5))
    R(f, 'Bridge Lobby', rect(15, 9, 26, 18), label=(18.5, 12.0))
    R(f, 'VIP Lounge', [(15, 18), (26, 18), (26, 21), (21, 26), (15, 26)], label=(20.5, 19.5))
    R(f, 'Vault Hall', rect(9, -9, 12, 9), 'corridor', label=(10.5, 5.5))
    R(f, 'Concierge', rect(12, 0, 26, 9), site='S2', label=(19, 1.4))
    R(f, 'Deposit', rect(12, -9, 26, 0), site='S2', label=(18, -2.0))
    R(f, 'Studio', [(9, -9), (26, -9), (26, -21), (21, -26), (9, -26)], double_height=True,
      tags=['signature', 'roam'], label=(21.0, -23.0), ceiling_note='double height, open to the F3 ceiling (7.3 m)')
    R(f, 'Backstage', rect(-9, -12, 9, -9), 'corridor')
    R(f, 'Green Room', rect(0, -26, 9, -12), label=(4.5, -23.5))
    R(f, 'Makeup', rect(-9, -19, 0, -12), label=(-6.5, -13.0))
    R(f, 'Wardrobe', rect(-9, -26, 0, -19), label=(-4.5, -20.6))
    R(f, 'Noraebang', rect(-18, -26, -9, -12), tags=['roam'], label=(-13.5, -16.6))
    R(f, 'Booth 1', rect(-26, -18, -18, -12))
    R(f, 'Booth 2', [(-26, -18), (-18, -18), (-18, -26), (-21, -26), (-26, -21)])
    R(f, 'Cellar Hall', rect(-12, -12, -9, 9), 'corridor', label=(-10.5, 5.5))
    R(f, 'Lounge Bar', rect(-26, 0, -12, 9), site='S3', label=(-18.5, 1.6))
    R(f, 'Wine Room', rect(-20, -12, -12, 0), site='S3', label=(-16.5, -2.3))
    R(f, 'Cigar Room', rect(-26, -12, -20, 0))
    core_walls(f)
    # garden void edge (balustrade, gap where the Garden Stair lands)
    W(f, (-26, 12), (-12, 12), 'balustrade', gap(-19.75, 2.5))
    W(f, (-12, 12), (-12, 26), 'balustrade')
    # S3 Lounge Bar / Wine Room. Gallery side: the stair head faces a reinforceable wall, the bar glass is off to the east
    W(f, (-26, 9), (-21.1, 9), 'reinforceable', units=['large'])
    W(f, (-21.1, 9), (-17.0, 9), 'reinforceable', units=['xl'], note='faces the Garden Stair head')
    W(f, (-17.0, 9), (-14.7, 9), 'soft', dd(-15.85))
    W(f, (-14.7, 9), (-12, 9), 'glass', note='bar glass over the garden; the stair is seen through the tempered balustrade')
    W(f, (-12, 9), (-9, 9), 'soft', dd(-10.5))
    W(f, (-12, 0), (-12, 4.2), 'reinforceable', units=['xl'])
    W(f, (-12, 4.2), (-12, 9), 'soft', door(6.5))
    W(f, (-12, -12), (-12, -7.7), 'reinforceable', units=['xl'])
    W(f, (-12, -7.7), (-12, -5.2), 'soft', door(-6.45))
    W(f, (-12, -5.2), (-12, 0), 'reinforceable', units=['xl', 'small'])
    W(f, (-20, 0), (-12, 0), 'glass', dd(-16.0), note='glass wine wall')
    W(f, (-26, 0), (-23.1, 0), 'soft', door(-23.8))
    W(f, (-23.1, 0), (-20, 0), 'reinforceable', units=['large'])
    W(f, (-20, -12), (-20, -7.5), 'reinforceable', units=['xl'])
    W(f, (-20, -7.5), (-20, 0), 'soft', door(-4.5))
    W(f, (-18, -12), (-12, -12), 'hard', note='stone cellar wall (hard anchor of S3)')
    W(f, (-20, -12), (-18, -12), 'hard')
    W(f, (-26, -12), (-20, -12), 'soft', door(-23.0))
    # noraebang
    W(f, (-12, -12), (-9, -12), 'soft', door(-10.5))
    W(f, (-9, -12), (-9, -9), 'open')
    W(f, (-18, -18), (-18, -12), 'soft', door(-15.0))
    W(f, (-18, -26), (-18, -18), 'soft', door(-22.0))
    W(f, (-26, -18), (-18, -18), 'soft')
    W(f, (-9, -19), (-9, -12), 'soft', door(-13.2))
    W(f, (-9, -26), (-9, -19), 'soft')
    # backstage
    W(f, (-9, -12), (0, -12), 'soft', door(-3.5))
    W(f, (0, -12), (9, -12), 'soft', door(4.5))
    W(f, (0, -19), (0, -12), 'soft', door(-15.5))
    W(f, (0, -26), (0, -19), 'soft', door(-22.5))
    W(f, (-9, -19), (0, -19), 'soft', door(-4.5))
    # studio (walls rise to the F3 slab: void above)
    W(f, (9, -26), (9, -12), 'soft', door(-19.5), to_slab=True)
    W(f, (9, -12), (9, -9), 'soft', dd(-10.5), to_slab=True)
    W(f, (9, -9), (12, -9), 'soft', dd(10.5), to_slab=True)
    W(f, (12, -9), (16, -9), 'hard', to_slab=True, note='LED volume backing (hard anchor of S2)')
    W(f, (16, -9), (19.1, -9), 'reinforceable', units=['large'], to_slab=True)
    W(f, (19.1, -9), (21.1, -9), 'soft', win(20.1), to_slab=True, note='studio window')
    W(f, (21.1, -9), (26, -9), 'reinforceable', units=['large'], to_slab=True)
    # S2 Concierge / Deposit
    W(f, (12, -9), (12, -5.3), 'soft', door(-7.0))
    W(f, (12, -5.3), (12, 0), 'reinforceable', units=['xl', 'small'])
    W(f, (12, 0), (12, 4.7), 'reinforceable', units=['large', 'standard'])
    W(f, (12, 4.7), (12, 9), 'soft', door(6.6))
    W(f, (12, 0), (19, 0), 'soft', door(15.0))
    W(f, (19, 0), (26, 0), 'glass', note='lockbox gallery glass')
    W(f, (12, 9), (14.8, 9), 'soft', door(13.4))
    W(f, (14.8, 9), (18.9, 9), 'reinforceable', units=['xl'])
    W(f, (18.9, 9), (21.1, 9), 'soft', dd(20.0))
    W(f, (21.1, 9), (26, 9), 'reinforceable', units=['large'])
    # security / bridge lobby
    W(f, (9, 9), (12, 9), 'soft', dd(10.5))
    W(f, (15, 9), (15, 18), 'glass', dd(11.0), note='scanner gates')
    W(f, (9, 18), (15, 18), 'soft')
    W(f, (15, 18), (15, 26), 'soft', door(21.5))
    W(f, (15, 18), (26, 18), 'soft', door(17.0))
    W(f, (22.6, 11.5), (22.6, 15.5), 'hard', freestanding=True, note='bridge screen: blocks the bridge sightline')
    # reception
    W(f, (-9, 9), (-9, 19), 'soft', arch(13.0, 3.0))
    W(f, (-9, 19), (-9, 26), 'soft', dd(22.5))
    W(f, (-9, 19), (9, 19), 'soft', arch(0.0, 3.0), note='hanji screen wall between Reception and the River Lounge')
    W(f, (9, 9), (9, 18), 'soft', dd(16.5))
    W(f, (9, 18), (9, 19), 'soft')
    W(f, (1.0, 13.0), (1.0, 17.4), 'hard', freestanding=True, note='stone reception backdrop wall (splits the lobby lines)')
    W(f, (9, 19), (9, 26), 'soft', door(22.5))

# ================================================================= F3 98F Broadcast


def floor3():
    f = 'F3'
    core_rooms(f, 'Media Lifts')
    R(f, 'Studio Void', [(9, -9), (26, -9), (26, -21), (21, -26), (9, -26)], 'void', label=(21, -21))
    R(f, 'Control Room', rect(0, -26, 9, -12), site='S1')
    R(f, 'Render Farm', rect(-9, -26, 0, -12), site='S1')
    R(f, 'Media Hall', rect(-9, -12, 9, -9), 'corridor')
    R(f, 'Edit Bay', [(-26, -12), (-26, -21), (-21, -26), (-15, -26), (-15, -12)], label=(-20, -17))
    R(f, 'Edit 1', rect(-15, -26, -9, -19))
    R(f, 'Edit 2', rect(-15, -19, -9, -12), label=(-12, -17.6))
    R(f, 'News Hall', rect(-12, -12, -9, 9), 'corridor', label=(-10.5, 5.5))
    R(f, 'Podcast', rect(-26, -12, -12, -3), label=(-19, -10.3))
    R(f, 'Newsroom', rect(-26, -3, -12, 9), tags=['roam'], label=(-16, -0.9))
    R(f, 'Exec Office', rect(-26, 9, -12, 15), label=(-19, 13.7))
    R(f, 'Boardroom', [(-26, 15), (-12, 15), (-12, 26), (-21, 26), (-26, 21)], label=(-18, 23.3))
    R(f, 'Exec Hall', rect(-12, 9, -9, 26), 'corridor', label=(-10.5, 21))
    R(f, 'Suite Lounge', rect(-9, 9, 9, 17), label=(-3.5, 14.5))
    R(f, 'Suite Bath', rect(-9, 17, 0, 26), label=(-5.5, 18.8))
    R(f, 'Bedroom', rect(0, 17, 9, 26), label=(4.5, 19.2))
    R(f, 'Projection', rect(9, 9, 15, 15), label=(11.5, 13.6))
    R(f, 'Foyer', rect(9, 15, 15, 26), label=(12, 22.5))
    R(f, 'Screening', [(15, 9), (26, 9), (26, 21), (21, 26), (15, 26)], tags=['roam'], label=(22.5, 11.5))
    R(f, 'Archive Hall', rect(9, -9, 12, 9), 'corridor', label=(10.5, 5.5))
    R(f, 'Archive', rect(12, -9, 26, 0))
    R(f, 'Writers Room', rect(12, 0, 26, 9), label=(19, 1.8))
    core_walls(f)
    # S1 Control Room / Render Farm (east wall is the studio void edge)
    W(f, (9, -26), (9, -22), 'hard', note='void wall: no footing on the void side, so hard')
    W(f, (9, -22), (9, -17), 'glass', note='director window over the stage')
    W(f, (9, -17), (9, -15), 'soft', door(-15.75), note='grid door onto catwalk A')
    W(f, (9, -15), (9, -12), 'reinforceable', units=['standard', 'small'], yields=('b',), note='faces Grid C')
    W(f, (0, -12), (4.2, -12), 'reinforceable', units=['xl'])
    W(f, (4.2, -12), (5.7, -12), 'soft', door(4.95))
    W(f, (5.7, -12), (9, -12), 'reinforceable', units=['large'])
    W(f, (-3.2, -12), (0, -12), 'reinforceable', units=['large'])
    W(f, (-4.5, -12), (-3.2, -12), 'soft', door(-3.85))
    W(f, (-9, -12), (-4.5, -12), 'reinforceable', units=['xl'], yields=('a',))
    W(f, (0, -26), (0, -12), 'soft', door(-19.5), win(-13.6))
    W(f, (-9, -26), (-9, -22.1), 'hard', note='render vault fire wall (hard anchor of S1)')
    W(f, (-9, -22.1), (-9, -19), 'reinforceable', units=['large'])
    W(f, (-9, -19), (-9, -16.2), 'soft', door(-17.6))
    W(f, (-9, -16.2), (-9, -12), 'reinforceable', units=['xl'])
    # void edges (Grid C runs along x 9..10.6 from Grid A to the Media Hall and Archive Hall doors)
    W(f, (9, -12), (9, -9), 'glass', door(-10.5), note='Media Hall door onto Grid C')
    W(f, (9, -9), (12, -9), 'glass', door(9.75), note='Archive Hall door onto Grid C')
    W(f, (12, -9), (16.5, -9), 'glass')
    W(f, (16.5, -9), (19, -9), 'soft', door(17.75), note='door onto catwalk B')
    W(f, (19, -9), (26, -9), 'soft')
    # north-west edit suites
    W(f, (-9, -12), (-9, -9), 'open')
    W(f, (-12, -12), (-9, -12), 'soft', door(-11.35))
    W(f, (-15, -12), (-12, -12), 'soft')
    W(f, (-26, -12), (-15, -12), 'soft', door(-21.0))
    W(f, (-15, -26), (-15, -19), 'soft', door(-22.5))
    W(f, (-15, -19), (-15, -12), 'soft', door(-15.0))
    W(f, (-15, -19), (-9, -19), 'soft', door(-12.0))
    # west
    W(f, (-12, -12), (-12, -3), 'soft', door(-7.5))
    W(f, (-12, -3), (-12, 9), 'soft', dd(3.0))
    W(f, (-26, -3), (-12, -3), 'glass', door(-14.5))
    W(f, (-26, 9), (-12, 9), 'soft', door(-16.0))
    W(f, (-12, 9), (-9, 9), 'soft', door(-9.65), note='offset from the Edit 2 door: breaks the 45 m x=-10.5 line')
    W(f, (-26, 15), (-12, 15), 'glass', door(-14.0))
    W(f, (-12, 9), (-12, 15), 'soft', door(10.2))
    W(f, (-12, 15), (-12, 26), 'soft', dd(19.0))
    # suite
    W(f, (-9, 9), (-9, 17), 'soft', dd(13.0))
    W(f, (-9, 17), (-9, 26), 'soft')
    W(f, (-9, 17), (0, 17), 'soft', door(-4.5))
    W(f, (0, 17), (9, 17), 'soft', door(4.5))
    W(f, (0, 17), (0, 26), 'soft', door(21.5))
    W(f, (9, 9), (9, 15), 'soft')
    W(f, (9, 15), (9, 17), 'soft', door(16.0))
    W(f, (9, 17), (9, 26), 'soft')
    # south-east
    W(f, (9, 9), (12, 9), 'soft', door(10.5))
    W(f, (12, 9), (15, 9), 'soft')
    W(f, (15, 9), (26, 9), 'soft', door(17.0))
    W(f, (15, 9), (15, 15), 'soft', win(12.0))
    W(f, (15, 15), (15, 26), 'soft', dd(20.5))
    W(f, (9, 15), (15, 15), 'soft', door(12.5))
    # east
    W(f, (12, 0), (12, 9), 'soft', door(4.5))
    W(f, (12, -9), (12, 0), 'soft', door(-4.5))
    W(f, (12, 0), (26, 0), 'soft', door(19.0))


floor1(); floor2(); floor3()

# ---------------------------------------------------------------- wall sides (normal n = (-dz, dx) of a->b, unit)
SITE_ROOMS = {}
for r in rooms:
    if r.get('site'): SITE_ROOMS[r['id']] = r['site']
for w in walls:
    a, b = w['a'], w['b']; Lw = w['length']
    nx, nz = -(b[1] - a[1]) / Lw, (b[0] - a[0]) / Lw
    w['n'] = [round(nx, 4), round(nz, 4)]
    m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    def side(sg):
        for d in (0.45, 0.8):
            for r in rooms:
                if r['floor'] == w['floor'] and point_in_poly((m[0] + sg * nx * d, m[1] + sg * nz * d), [tuple(q) for q in r['polygon']]):
                    return r['id']
        return None
    w['side_pos'] = side(1); w['side_neg'] = side(-1)
    if w['type'] == 'reinforceable':
        dp, dn = SITE_ROOMS.get(w['side_pos']), SITE_ROOMS.get(w['side_neg'])
        if dp and not dn: w['reinforce']['defender_side'] = 'pos'
        elif dn and not dp: w['reinforce']['defender_side'] = 'neg'
        else: w['reinforce']['defender_side'] = 'either'
        w['reinforce']['site'] = dp or dn


def wall_rect(w):
    # axis-aligned footprint [x0, z0, x1, z1] of a wall (all interior walls are axis aligned)
    a, b = w['a'], w['b']; h = w['thickness'] / 2
    return [min(a[0], b[0]) - (h if abs(a[0] - b[0]) < 1e-6 else 0), min(a[1], b[1]) - (h if abs(a[1] - b[1]) < 1e-6 else 0),
            max(a[0], b[0]) + (h if abs(a[0] - b[0]) < 1e-6 else 0), max(a[1], b[1]) + (h if abs(a[1] - b[1]) < 1e-6 else 0)]


def band_rect(w, u0, u1, depth=BAND):
    # footprint of deployed units between u0 and u1 on the defender face
    a, b = w['a'], w['b']; L = w['length']; nx, nz = w['n']
    sg = 1 if w['reinforce']['defender_side'] == 'pos' else -1
    t0, t1 = w['thickness'] / 2 + 0.005, w['thickness'] / 2 + depth
    pts = []
    for u in (u0, u1):
        px, pz = a[0] + (b[0] - a[0]) * u / L, a[1] + (b[1] - a[1]) * u / L
        for t in (t0, t1):
            pts.append((px + sg * nx * t, pz + sg * nz * t))
    return [min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)]


def u_of(w, x, z):
    a, b = w['a'], w['b']; L = w['length']
    return ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / L


pilasters = []
reinf_report = []
for w in walls:
    if w['type'] != 'reinforceable': continue
    rf = w['reinforce']; L = w['length']
    br = band_rect(w, 0, L)
    blocked = []
    obst = [wall_rect(o) for o in walls if o is not w and o['floor'] == w['floor'] and o['type'] != 'open']
    obst += [[c['x'] - c['w'] / 2, c['z'] - c['d'] / 2, c['x'] + c['w'] / 2, c['z'] + c['d'] / 2] for c in columns]
    for r in obst:
        ix0, iz0, ix1, iz1 = max(br[0], r[0]), max(br[1], r[1]), min(br[2], r[2]), min(br[3], r[3])
        if ix1 - ix0 > 1e-4 and iz1 - iz0 > 1e-4:
            us = sorted((u_of(w, ix0, iz0), u_of(w, ix1, iz1)))
            blocked.append(us)
    # clear interval: the longest free run along the face
    cuts = sorted(blocked) + [[L, L]]
    free, u = [], 0.0
    for (b0, b1) in cuts:
        if b0 > u + 1e-6: free.append([u, b0])
        u = max(u, b1)
    c0, c1 = max(free, key=lambda f: f[1] - f[0])
    for end in rf['yields']:  # corner with another reinforceable wall of the same room: 0.3 m flush hard jamb
        if end == 'a': c0 += PILASTER
        else: c1 -= PILASTER
        uu = c0 - PILASTER / 2 if end == 'a' else c1 + PILASTER / 2
        a, b = w['a'], w['b']
        px, pz = a[0] + (b[0] - a[0]) * uu / L, a[1] + (b[1] - a[1]) * uu / L
        hz = abs(a[1] - b[1]) < 1e-6
        pilasters.append({'id': 'PL%02d' % (len(pilasters) + 1), 'floor': w['floor'], 'x': round(px, 3), 'z': round(pz, 3),
                          'w': PILASTER if hz else w['thickness'], 'd': w['thickness'] if hz else PILASTER, 'wall': w['id'], 'type': 'hard',
                          'kind': 'jamb', 'note': 'flush hard jamb in the wall: the other wall\'s units run into this corner'})
    need = sum(SIZES[s] for s in rf['units'])
    slack = (c1 - c0) - 2 * TRIM - need
    start = round(c0 + (c1 - c0 - need) / 2, 3)
    panels, uu = [], start
    for s in rf['units']:
        panels.append({'size': s, 'u0': round(uu, 3), 'u1': round(uu + SIZES[s], 3)}); uu = round(uu + SIZES[s], 3)
    rf['panels'] = panels
    rf['clear'] = [round(c0, 3), round(c1, 3)]
    rf['trim'] = [round(start, 3), round(L - uu, 3)]
    rf['far_side_z'] = -w['thickness']
    reinf_report.append((w['id'], w['floor'], rf['site'], round(L, 2), round(c1 - c0, 2), '+'.join(rf['units']), round(slack, 3)))
    if slack < -1e-6:
        print('REINF DOES NOT FIT', w['id'], w['a'], w['b'], 'clear %.3f need %.2f + trims' % (c1 - c0, need))
if '-v' in sys.argv:
    for r in reinf_report: print('reinf %-7s %s %s len %.2f clear %.2f units %-14s slack %.3f' % r)

# ---------------------------------------------------------------- voids and slab openings
voids = [
    {'id': 'V_garden', 'floor': 'F2', 'name': 'Garden Void', 'polygon': [[-26, 12], [-12, 12], [-12, 26], [-21, 26], [-26, 21]],
     'spans': ['F1', 'F2'], 'room': 'F1_garden_hall', 'note': 'no F2 slab: Garden Hall is double height here'},
    {'id': 'V_studio', 'floor': 'F3', 'name': 'Studio Void', 'polygon': [[9, -9], [26, -9], [26, -21], [21, -26], [9, -26]],
     'spans': ['F2', 'F3'], 'room': 'F2_studio', 'note': 'no F3 slab: Studio is double height; grid catwalks at F3 level'},
]
slab_openings = [
    {'id': 'SO_spiral', 'floor': 'F2', 'polygon': rect(-15.6, -21.6, -12.4, -18.4), 'for': 'ST_spiral', 'rail': True},
    {'id': 'SO_suite', 'floor': 'F3', 'polygon': rect(-7, 9.4, 0, 10.8), 'for': 'ST_suite', 'rail': True},
    {'id': 'SO_coreA', 'floor': 'all', 'polygon': rect(3, -9, 9, -2), 'for': 'ST_A', 'rail': False},
    {'id': 'SO_coreB', 'floor': 'all', 'polygon': rect(-9, 2, -3, 9), 'for': 'ST_B', 'rail': False},
    {'id': 'SO_shaft', 'floor': 'all', 'polygon': rect(-9, -5, -6, -2), 'for': 'LD_shaft', 'rail': False},
]
for s in slab_openings:
    s['polygon'] = [list(p) for p in s['polygon']]

# ---------------------------------------------------------------- facade bays
# lite codes: T tempered, B breakable, W barricadable entry window, D barricadable exterior door, S spandrel
LITE = {'T': 'glass_tempered', 'B': 'glass_breakable', 'W': 'window_barricadable', 'D': 'door_barricadable', 'S': 'spandrel'}
OV = {}


def B(fl, face, i, lites=None, **kw):
    OV[(fl, face, i)] = dict(lites=lites, **kw)


def bi(face, c):
    # bay index from the bay-centre coordinate along the face axis (x for N/S, z for E/W)
    if face == 'N': return int((c + 21) // 3)
    if face == 'E': return int((c + 21) // 3)
    if face == 'S': return int((21 - c) // 3)
    if face == 'W': return int((21 - c) // 3)
    raise ValueError(face)


def Bc(fl, face, c, lites=None, **kw):
    B(fl, face, bi(face, c), lites, **kw)


# F1 (ledge on N/E/W, terrace on the south)
Bc('F1', 'N', -16.5, 'BB'); Bc('F1', 'N', -13.5, 'WT')
Bc('F1', 'N', -7.5, 'SS'); Bc('F1', 'N', -4.5, 'SS')
Bc('F1', 'N', 1.5, 'TW'); Bc('F1', 'N', 7.5, 'BB'); Bc('F1', 'N', 16.5, 'WT')
B('F1', 'NE', 0, 'TB')
Bc('F1', 'E', -16.5, 'BT'); Bc('F1', 'E', -7.5, 'TW'); Bc('F1', 'E', 4.5, 'TW'); Bc('F1', 'E', 13.5, 'WB', note='truss landing window (Bathhouse)')
B('F1', 'SE', 0, 'DT', note='bath door to the terrace'); B('F1', 'SE', 1, 'BT')
Bc('F1', 'S', 16.5, 'BT'); Bc('F1', 'S', 10.5, 'WT'); Bc('F1', 'S', 4.5, 'WT'); Bc('F1', 'S', -4.5, 'TW')
Bc('F1', 'S', -13.5, 'TT', opening={'kind': 'double_door', 'w': 2.0}, omit_mullion=True, note='garden doors (no centre mullion or fin)')
Bc('F1', 'S', -16.5, 'BB')
B('F1', 'SW', 0, 'DT', note='garden side door');
Bc('F1', 'W', 16.5, 'BW', note='catwalk 2 landing window (Garden)'); Bc('F1', 'W', 4.5, 'WT')
Bc('F1', 'W', -4.5, 'TD', note='catwalk door'); Bc('F1', 'W', -10.5, 'TW'); Bc('F1', 'W', -16.5, 'BB')
B('F1', 'NW', 1, 'TW')
# F2 (ledge all round, bridge portal on the east)
Bc('F2', 'N', -19.5, 'WT'); Bc('F2', 'N', -13.5, 'BB'); Bc('F2', 'N', -10.5, 'WT', note='hoist ramp landing window (Noraebang)'); Bc('F2', 'N', -7.5, 'TW'); Bc('F2', 'N', -4.5, 'BB')
Bc('F2', 'N', 4.5, 'WT'); Bc('F2', 'N', 7.5, 'TB'); Bc('F2', 'N', 13.5, 'BB'); Bc('F2', 'N', 16.5, 'WT')
B('F2', 'NE', 0, 'WT', note='cradle window'); B('F2', 'NE', 1, 'BT')
Bc('F2', 'E', -16.5, 'TW', window_y=[4.65, 6.2], note='grid window at F3 level (catwalk A)')
Bc('F2', 'E', -13.5, 'BT')
Bc('F2', 'E', -4.5, 'WT'); Bc('F2', 'E', -1.5, 'BT'); Bc('F2', 'E', 4.5, 'TW'); Bc('F2', 'E', 7.5, 'BT')
Bc('F2', 'E', 13.5, None, portal={'kind': 'double_door', 'w': 2.0, 'to': 'skybridge'}, omit_mullion=True, note='skybridge portal (no centre mullion or fin)')
Bc('F2', 'E', 19.5, 'BT')
B('F2', 'SE', 0, 'WT')
Bc('F2', 'S', 16.5, 'TB'); Bc('F2', 'S', 10.5, 'WT'); Bc('F2', 'S', 4.5, 'BT'); Bc('F2', 'S', -4.5, 'TW'); Bc('F2', 'S', -10.5, 'BT')
Bc('F2', 'W', 10.5, 'TB'); Bc('F2', 'W', 7.5, 'BT'); Bc('F2', 'W', 4.5, 'WT')
Bc('F2', 'W', -4.5, 'TW'); Bc('F2', 'W', -7.5, 'BT'); Bc('F2', 'W', -13.5, 'BT')
B('F2', 'NW', 0, 'WT')
# F3 (ledge all round, gantry at the NW chamfer, bridge roof at the east)
Bc('F3', 'N', -13.5, 'WT'); Bc('F3', 'N', -4.5, 'WT'); Bc('F3', 'N', -1.5, 'TB')
Bc('F3', 'N', 1.5, 'BT'); Bc('F3', 'N', 4.5, 'TW')
Bc('F3', 'E', -4.5, 'WT'); Bc('F3', 'E', -1.5, 'BT'); Bc('F3', 'E', 4.5, 'TW'); Bc('F3', 'E', 7.5, 'BT')
Bc('F3', 'E', 13.5, 'WT', note='bridge roof window')
Bc('F3', 'S', 10.5, 'BT'); Bc('F3', 'S', 4.5, 'WT'); Bc('F3', 'S', -4.5, 'TB'); Bc('F3', 'S', -16.5, 'WT')
B('F3', 'SW', 0, 'BT')
Bc('F3', 'W', 16.5, 'BT'); Bc('F3', 'W', 13.5, 'WT'); Bc('F3', 'W', 4.5, 'BB'); Bc('F3', 'W', -1.5, 'TW')
Bc('F3', 'W', -7.5, 'WT'); Bc('F3', 'W', -16.5, 'BT')
B('F3', 'NW', 1, 'TD', note='gantry door (lite 1, clear of the corner column)')


def in_void(fl, p):
    for v in voids:
        if v['floor'] == fl and point_in_poly(p, [tuple(q) for q in v['polygon']]):
            return True
    return False


def room_at(fl, p):
    for r in rooms:
        if r['floor'] == fl and r['kind'] != 'void' and point_in_poly(p, [tuple(q) for q in r['polygon']]):
            return r['id']
    return None


used_ov = set()
for f in FLOORS:
    fl = f['id']
    for (face, a, b, n) in FACES:
        L = seg_len(a, b); w = L / n
        nx, nz = -(b[1] - a[1]) / L, (b[0] - a[0]) / L  # inward normal
        for i in range(n):
            pa = seg_point(a, b, i * w); pb = seg_point(a, b, (i + 1) * w)
            mid = ((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2)
            inner = (mid[0] + nx * 1.2, mid[1] + nz * 1.2)
            if in_void(fl, inner):
                continue  # covered by the double-height bay of the floor below
            dbl = NEXT[fl] is not None and in_void(NEXT[fl], inner)
            ov = OV.get((fl, face, i), {})
            if ov:
                used_ov.add((fl, face, i))
            bay = {'id': '%s_%s%02d' % (fl, face, i), 'floor': fl, 'face': face, 'index': i,
                   'a': [round(pa[0], 3), round(pa[1], 3)], 'b': [round(pb[0], 3), round(pb[1], 3)],
                   'width': round(w, 3), 'y0': 0.0, 'vision_y1': CEIL + (FTF if dbl else 0.0), 'y1': FTF * (2 if dbl else 1),
                   'double_height': dbl, 'room': room_at(fl, inner)}
            if ov.get('portal'):
                p = ov['portal']
                bay['kind'] = 'portal'
                bay['lites'] = []
                bay['opening'] = {'kind': p['kind'], 'u0': round(w / 2 - p['w'] / 2, 3), 'u1': round(w / 2 + p['w'] / 2, 3),
                                  'y0': 0.0, 'y1': DOOR_H, 'barricadable': True, 'to': p['to']}
            else:
                codes = ov.get('lites') or 'TT'
                bay['kind'] = 'glass'
                lites = []
                for k, code in enumerate(codes):
                    lt = {'u0': round(k * w / 2, 3), 'u1': round((k + 1) * w / 2, 3), 'type': LITE[code]}
                    if code == 'W':
                        lt['opening'] = {'y0': 0.45, 'y1': DOOR_H, 'barricadable': True}
                        if ov.get('window_y'):
                            lt['opening'] = {'y0': ov['window_y'][0], 'y1': ov['window_y'][1], 'barricadable': True}
                    if code == 'D':
                        lt['opening'] = {'y0': 0.0, 'y1': DOOR_H, 'barricadable': True}
                    lites.append(lt)
                bay['lites'] = lites
                if ov.get('opening'):
                    o = ov['opening']
                    bay['opening'] = {'kind': o['kind'], 'u0': round(w / 2 - o['w'] / 2, 3), 'u1': round(w / 2 + o['w'] / 2, 3),
                                      'y0': 0.0, 'y1': DOOR_H, 'barricadable': True}
            if ov.get('note'):
                bay['note'] = ov['note']
            if ov.get('omit_mullion'):
                bay['omit_mullion'] = True
            bays.append(bay)
unused = set(OV) - used_ov
assert not unused, 'facade overrides on skipped bays: %s' % sorted(unused)

# ---------------------------------------------------------------- hatches and soft floor patches
# floor = the floor whose slab holds it (its top face is that floor's level); it opens into the floor below.
hatches = [  # id, slab, x, z, note, reinforce_from (above: face-up on the slab; below: inverted on the ceiling of the site room below)
    ('H01', 'F2', -2.5, 14.5, 'Reception -> Tea Room (S4)', 'below'),
    ('H02', 'F2', 6.8, 14.6, 'Reception -> Ondol Lounge (S4)', 'below'),
    ('H03', 'F2', 0.0, 23.5, 'River Lounge -> Veranda', 'above'),
    ('H04', 'F2', -22.0, -20.0, 'Booth 2 -> Dining Room', 'above'),
    ('H05', 'F2', 23.5, -14.0, 'Studio scenery trap -> Laundry', 'above'),
    ('H06', 'F2', 20.5, 15.8, 'Bridge Lobby -> Bathhouse (lands in the 0.6 m hot pool: loud, slow exit; intended)', 'above'),
    ('H07', 'F3', 23.2, -2.3, 'Archive -> Deposit (S2)', 'below'),
    ('H08', 'F3', 23.8, 6.4, 'Writers Room -> Concierge (S2)', 'below'),
    ('H09', 'F3', -14.0, 6.5, 'Newsroom -> Lounge Bar (S3)', 'below'),
    ('H10', 'F3', -14.0, -4.8, 'Podcast -> Wine Room (S3); dressed as the wine lift', 'below'),
    ('H11', 'F3', -2.5, 20.5, 'Suite Bath -> River Lounge', 'above'),
    ('H12', 'F3', -22.0, -14.5, 'Edit Bay -> Booth 1', 'above'),
    ('H13', 'F3', -5.0, -10.5, 'Media Hall -> Backstage', 'above'),
    ('H14', 'F3', 2.4, -17.0, 'Control Room floor (S1) -> Green Room; attackers open it from below to shoot up', 'above'),
    ('H15', 'F3', -2.0, -16.5, 'Render Farm floor (S1) -> Makeup; attackers open it from below to shoot up', 'above'),
]
floor_patches = [
    ('P01', 'F3', 5.5, -15.0, 2.4, 2.4, 'Control Room floor (S1), raised access floor; shoot up from Green Room'),
    ('P02', 'F3', -4.5, -14.3, 2.4, 2.4, 'Render Farm floor (S1), raised access floor; shoot up from Makeup'),
    ('P03', 'F3', 18.0, 11.6, 2.4, 2.4, 'Screening -> Bridge Lobby (gives the F3 south rooms a job)'),
    ('P04', 'F3', -21.5, 2.5, 2.4, 2.4, 'Newsroom -> Lounge Bar (S3), raised access floor'),
    ('P05', 'F2', 14.6, 6.4, 2.4, 2.4, 'Concierge floor (S2); shoot up from Lockers'),
    ('P06', 'F2', -23.5, 5.5, 2.4, 2.4, 'Lounge Bar floor (S3); shoot up from Canteen'),
    ('P07', 'F2', -4.5, 22.5, 2.4, 2.4, 'River Lounge -> Veranda'),
    ('P08', 'F2', -5.5, 14.0, 2.4, 2.4, 'Reception -> Tea Room (S4): unreinforceable vertical'),
    ('P09', 'F2', 22.5, -19.5, 2.4, 2.4, 'Studio floor -> Laundry (gives the F1 north rooms a job)'),
]
prev = {'F2': 'F1', 'F3': 'F2'}
hatch_list = []
for h in hatches:
    d = {'id': h[0], 'floor': h[1], 'x': h[2], 'z': h[3], 'size': 1.2, 'type': 'hatch', 'reinforceable': True,
         'gadget': 'wall-fortification-hatch', 'top_room': room_at(h[1], (h[2], h[3])),
         'bottom_room': room_at(prev[h[1]], (h[2], h[3])), 'note': h[4], 'reinforce_from': h[5]}
    y = FY[h[1]]
    if h[5] == 'above':
        d['mount'] = {'pos': [h[2], y, h[3]], 'up': [0, 1, 0], 'far_side_y': -SLAB, 'note': 'gadget as shipped: face-up on the slab'}
    else:
        d['mount'] = {'pos': [h[2], round(y - SLAB, 3), h[3]], 'up': [0, -1, 0], 'far_side_y': SLAB,
                      'note': 'gadget turned 180 deg about X: face-down on the slab underside, anchors on top'}
    d['dressing'] = 'framed slab panel with a hanji ceiling tile below'
    hatch_list.append(d)
patch_list = [{'id': p[0], 'floor': p[1], 'x': p[2], 'z': p[3], 'w': p[4], 'd': p[5], 'type': 'soft_floor', 'reinforceable': False,
               'top_room': room_at(p[1], (p[2], p[3])), 'bottom_room': room_at(prev[p[1]], (p[2], p[3])), 'note': p[6]} for p in floor_patches]


# ---------------------------------------------------------------- gameplay props (cover the builder must keep)
# box [x0, z0, x1, z1]; h = top height above the floor; cover: half (crouch) / full (stand); type hard|soft
props = [
    # F1
    ('F1', 'pavilion', [-17.5, 16.5, -12.5, 21.5], 0.6, 'half', 'hard', 'stone platform of the garden pavilion; posts and a steep non-walkable roof above (see roof)'),
    ('F1', 'pool', [-17.5, 21.9, -15.2, 24.2], 0.0, 'none', 'hard', 'reflecting pool, 0.3 m deep; 1.8 m clear strip to the glass'),
    ('F1', 'rocks', [-24.0, 12.8, -21.8, 14.6], 1.1, 'half', 'hard', 'garden rocks and a pine'),
    ('F1', 'stone_screen', [-15.2, 9.9, -13.6, 11.3], 2.0, 'full', 'hard', 'dry-stone screen in the arcade (breaks the Spa Hall line)'),
    ('F1', 'maru', [-7.5, 15.0, -3.5, 17.5], 0.45, 'none', 'soft', 'raised maru floor with low tea tables'),
    ('F1', 'screen', [-1.6, 13.0, -1.4, 16.0], 2.0, 'full', 'soft', 'free-standing wood lattice screen (destructible)'),
    ('F1', 'hearth_bench', [5.5, 17.5, 7.5, 19.5], 0.9, 'half', 'hard', 'warm stone ondol bench'),
    ('F1', 'kitchen_island', [0.0, -21.5, 6.0, -20.3], 1.0, 'half', 'hard', 'steel island'),
    ('F1', 'kitchen_island', [0.0, -16.5, 6.0, -15.3], 1.0, 'half', 'hard', 'steel island'),
    ('F1', 'machines', [13.5, -23.8, 21.5, -22.6], 1.6, 'full', 'hard', 'laundry machine row'),
    ('F1', 'hot_pool', [17.5, 12.0, 24.0, 18.0], -0.6, 'half', 'hard', 'sunken hot pool, stone rim'),
    ('F1', 'dining_tables', [-23.0, -20.0, -16.6, -14.5], 0.8, 'half', 'soft', 'table clusters (destructible)'),
    ('F1', 'loungers', [-7.6, 22.3, -6.0, 23.7], 0.7, 'half', 'soft', 'veranda loungers'),
    ('F1', 'planter', [6.4, 22.2, 7.8, 23.4], 1.0, 'half', 'hard', 'veranda stone planter'),
    ('F1', 'lantern', [1.5, 22.6, 3.0, 24.6], 1.8, 'full', 'hard', 'stone lantern (splits the Veranda line)'),
    ('F1', 'wine_display', [-11.4, -14.6, -9.6, -13.2], 1.8, 'full', 'hard', 'restaurant wine display (breaks the Service Hall line)'),
    ('F1', 'low_lockers', [10.2, 15.6, 13.8, 16.2], 1.2, 'half', 'hard', 'changing room locker bench'),
    ('F1', 'stone_bench', [10.5, 23.0, 13.5, 23.9], 0.9, 'half', 'hard', 'steam room stone bench'),
    ('F1', 'shower_block', [16.6, 9.4, 18.6, 11.6], 2.2, 'full', 'hard', 'bathhouse shower block (breaks the Spa Hall line)'),
    ('F1', 'locker_bank', [15.0, 3.0, 21.0, 3.6], 2.0, 'full', 'hard', 'locker bank'),
    ('F1', 'locker_bank', [15.0, 5.8, 23.6, 6.4], 2.0, 'full', 'hard', 'locker bank'),
    ('F1', 'treatment_tables', [14.0, -8.0, 18.0, -7.0], 0.9, 'half', 'soft', 'treatment tables'),
    ('F1', 'shelving', [-23.5, -9.5, -20.5, -8.9], 2.0, 'full', 'hard', 'staff entry steel shelving'),
    ('F1', 'cart', [-21.5, -4.0, -20.3, -2.6], 1.0, 'half', 'soft', 'linen cart'),
    ('F1', 'ahu_units', [-17.5, -9.5, -13.5, -7.5], 2.2, 'full', 'hard', 'air handling units'),
    ('F1', 'pipe_rack', [-17.0, -4.6, -14.0, -3.8], 1.1, 'half', 'hard', 'pipe rack'),
    ('F1', 'canteen_tables', [-21.0, 3.0, -16.0, 5.5], 0.8, 'half', 'soft', 'staff canteen tables'),
    ('F1', 'servery_counter', [-7.6, -17.2, -4.5, -16.4], 1.0, 'half', 'hard', 'servery counter'),
    ('F1', 'laundry_carts', [15.0, -17.0, 18.0, -15.6], 1.2, 'half', 'soft', 'laundry carts'),
    # F2
    ('F2', 'reception_desk', [-1.0, 12.0, 5.0, 12.8], 1.1, 'half', 'hard', 'stone reception desk'),
    ('F2', 'arch_planter', [-3.6, 15.6, -2.0, 18.4], 1.8, 'full', 'hard', 'hanji lantern planter west of the south arch (breaks the Reception lines)'),
    ('F2', 'arch_planter', [3.0, 17.4, 4.6, 18.5], 1.8, 'full', 'hard', 'hanji lantern planter east of the south arch (breaks the Reception lines)'),
    ('F2', 'sofas', [2.0, 20.0, 7.5, 21.5], 0.8, 'half', 'soft', 'river lounge sofas'),
    ('F2', 'bar_counter', [-21.0, 3.6, -15.0, 4.4], 1.1, 'half', 'hard', 'curved bar counter'),
    ('F2', 'back_bar', [-19.6, 1.2, -17.4, 1.8], 2.2, 'full', 'hard', 'back-bar display tower (breaks the Booth 1 -> Gallery line)'),
    ('F2', 'wine_tower', [-13.3, -3.6, -12.5, -2.4], 2.2, 'full', 'hard', 'wine tower by the east wall (breaks the Noraebang -> Gallery line)'),
    ('F2', 'wine_racks', [-19.5, -11.7, -12.5, -11.1], 2.2, 'full', 'soft', 'wine racks on the stone wall'),
    ('F2', 'wine_table', [-17.0, -6.0, -15.0, -4.5], 1.0, 'half', 'hard', 'tasting table'),
    ('F2', 'lockbox_island', [15.0, -5.2, 23.0, -4.4], 2.0, 'full', 'hard', 'safe-deposit lockbox island'),
    ('F2', 'concierge_desk', [16.0, 3.4, 22.0, 4.2], 1.1, 'half', 'hard', 'concierge counter'),
    ('F2', 'luggage_carts', [23.0, 0.8, 25.0, 2.6], 1.4, 'half', 'soft', 'luggage carts'),
    ('F2', 'holo_stage', [13.5, -21.0, 20.5, -14.0], 0.6, 'half', 'hard', 'round holo stage, r 3.5 m, emitter ring (round: inscribed in the box)'),
    ('F2', 'camera_crane', [9.4, -14.2, 12.0, -12.4], 1.8, 'full', 'hard', 'camera crane base and jib (breaks the Vault Hall line)'),
    ('F2', 'scanner_gates', [10.0, 13.0, 14.0, 13.6], 1.2, 'half', 'hard', 'security scanner gates'),
    ('F2', 'karaoke_sofas', [-16.5, -23.8, -12.6, -22.2], 0.8, 'half', 'soft', 'noraebang lounge'),
    ('F2', 'stair_planter', [-23.6, 9.6, -21.6, 11.4], 1.1, 'half', 'hard', 'stone planter beside the Garden Stair head (attacker cover)'),
    ('F2', 'lantern_planter', [-11.9, 15.0, -10.4, 16.0], 1.8, 'full', 'hard', 'hanji lantern planter (staggered pair: breaks the Gallery line)'),
    ('F2', 'lantern_planter', [-10.6, 17.0, -9.25, 18.0], 1.8, 'full', 'hard', 'hanji lantern planter (staggered pair: breaks the Gallery line)'),
    ('F2', 'river_planter', [-2.2, 21.4, -0.8, 22.8], 1.8, 'full', 'hard', 'river lounge planter (breaks the south lines)'),
    ('F2', 'flight_cases', [12.6, -11.8, 14.4, -9.9], 1.8, 'full', 'hard', 'studio flight cases (breaks the Backstage -> Studio line)'),
    ('F2', 'planter_bench', [17.0, 15.6, 19.6, 16.6], 1.0, 'half', 'hard', 'bridge lobby planter bench'),
    ('F2', 'luggage_trolley', [23.6, 10.4, 25.0, 11.6], 1.3, 'half', 'soft', 'luggage trolley by the portal'),
    ('F2', 'club_chairs', [-24.0, -8.6, -22.0, -7.2], 0.9, 'half', 'soft', 'cigar club chairs'),
    ('F2', 'humidor', [-21.8, -11.4, -20.6, -10.6], 2.0, 'full', 'hard', 'humidor cabinet'),
    ('F2', 'jukebox', [-11.4, -14.6, -10.0, -13.4], 1.9, 'full', 'hard', 'noraebang screen totem (breaks the Cellar Hall line)'),
    ('F2', 'booth_sofa', [-24.5, -16.6, -21.0, -15.6], 0.8, 'half', 'soft', 'booth sofa'),
    ('F2', 'green_sofas', [2.0, -21.0, 6.0, -19.6], 0.8, 'half', 'soft', 'green room sofas'),
    ('F2', 'makeup_counter', [-8.4, -18.3, -5.4, -17.7], 1.0, 'half', 'hard', 'makeup counter'),
    ('F2', 'wardrobe_racks', [-7.5, -23.0, -2.5, -22.4], 1.8, 'full', 'soft', 'wardrobe rails'),
    ('F2', 'vip_sofas', [17.0, 21.0, 20.0, 22.4], 0.8, 'half', 'soft', 'VIP lounge sofas'),
    ('F2', 'cloak_counter', [10.0, 20.5, 13.5, 21.2], 1.1, 'half', 'hard', 'cloakroom counter'),
    ('F2', 'camera_dolly', [21.4, -12.6, 23.0, -11.4], 1.2, 'half', 'hard', 'camera dolly'),
    # F3
    ('F3', 'consoles', [2.0, -23.5, 7.5, -22.5], 1.0, 'half', 'hard', 'control desks facing the director window'),
    ('F3', 'consoles', [2.0, -21.0, 7.5, -20.0], 1.0, 'half', 'hard', 'control desks, second row'),
    ('F3', 'holo_console', [6.9, -19.2, 8.1, -18.0], 1.0, 'half', 'hard', 'holo stage console: switches the stage hologram'),
    ('F3', 'server_racks', [-8.0, -24.9, -6.4, -24.1], 2.2, 'full', 'hard', 'render rack row (gap at the entry window)'),
    ('F3', 'server_racks', [-3.9, -24.9, -1.5, -24.1], 2.2, 'full', 'hard', 'render rack row (gap at the entry window)'),
    ('F3', 'server_racks', [-8.0, -22.4, -1.5, -21.6], 2.2, 'full', 'hard', 'render rack row'),
    ('F3', 'server_racks', [-6.5, -18.2, -1.5, -17.4], 2.2, 'full', 'hard', 'render rack row (starts clear of the Edit 2 door)'),
    ('F3', 'news_desks', [-24.0, 4.5, -19.0, 7.5], 1.0, 'half', 'soft', 'newsroom desk cluster'),
    ('F3', 'news_desks', [-24.0, -2.0, -19.0, 0.5], 1.0, 'half', 'soft', 'newsroom desk cluster'),
    ('F3', 'board_table', [-22.0, 18.5, -16.0, 21.0], 0.8, 'half', 'hard', 'boardroom table'),
    ('F3', 'tiered_seats', [16.5, 14.0, 24.5, 22.0], 1.2, 'half', 'hard', 'screening room tiers, steps of 0.4 m'),
    ('F3', 'bed', [3.0, 21.0, 6.5, 24.0], 0.7, 'half', 'soft', 'suite bed'),
    ('F3', 'bath', [-8.0, 22.0, -5.0, 25.0], 0.7, 'half', 'hard', 'stone bath (hatch H11 is beside it)'),
    ('F3', 'edit_desks', [-23.0, -19.0, -18.0, -17.5], 1.0, 'half', 'soft', 'edit desks'),
    ('F3', 'archive_shelves', [14.5, -7.5, 22.0, -6.7], 2.2, 'full', 'soft', 'holo archive shelving'),
    ('F3', 'writers_table', [16.0, 3.5, 21.0, 5.5], 0.8, 'half', 'soft', 'writers table'),
    ('F3', 'edit_desk', [-13.6, -23.8, -10.6, -23.0], 1.0, 'half', 'soft', 'edit 1 desk'),
    ('F3', 'edit_desk', [-13.4, -16.0, -12.0, -13.6], 1.0, 'half', 'soft', 'edit 2 desk'),
    ('F3', 'edit_rack', [-11.9, -15.0, -10.4, -14.0], 2.0, 'full', 'hard', 'edit 2 equipment rack (breaks the News Hall line)'),
    ('F3', 'news_wall', [-18.5, 1.8, -14.0, 2.4], 2.4, 'full', 'hard', 'free-standing newsroom LED wall, abstract graphics only (breaks the Edit Bay -> Boardroom lines)'),
    ('F3', 'podcast_desk', [-21.0, -8.6, -17.0, -7.4], 1.0, 'half', 'hard', 'podcast desk'),
    ('F3', 'suite_sofas', [2.0, 12.8, 6.0, 14.2], 0.8, 'half', 'soft', 'suite lounge sofas'),
    ('F3', 'exec_desk', [-21.5, 11.0, -18.0, 12.0], 1.0, 'half', 'hard', 'executive desk'),
    ('F3', 'vase_plinth', [-10.2, 14.6, -9.3, 15.6], 1.8, 'full', 'hard', 'celadon vase plinth in the Exec Hall (breaks the News Hall line)'),
    ('F3', 'concession_counter', [10.0, 19.2, 13.0, 19.9], 1.1, 'half', 'hard', 'foyer counter'),
    ('F3', 'projector', [12.4, 11.0, 13.8, 12.4], 1.2, 'half', 'hard', 'projector plinth'),
]
prop_list = [{'id': 'PR%02d' % (i + 1), 'floor': p[0], 'kind': p[1], 'box': p[2], 'h': p[3], 'cover': p[4], 'type': p[5], 'note': p[6],
              'shape': 'round' if p[1] in ('holo_stage',) else 'box',
              'room': room_at(p[0], ((p[2][0] + p[2][2]) / 2, (p[2][1] + p[2][3]) / 2))} for i, p in enumerate(props)]
for p in prop_list:
    if p['kind'] == 'pavilion':
        p['roof'] = {'eave_y': 3.6, 'ridge_y': 6.0, 'eaves_box': [-18.3, 15.7, -13.0, 22.3], 'pitch_deg': 40, 'walkable': False,
                     'note': 'steep sweeping eaves, slide-off collider; eaves 1.0 m clear of the Gallery edge and below its floor'}

# ---------------------------------------------------------------- stairs, ladders, walkways
stairs = [
    {'id': 'ST_A', 'name': 'Stair A', 'kind': 'switchback', 'floors': ['F1', 'F2', 'F3'], 'box': [3, -9, 9, -2],
     'landing': 'south', 'flight_1': 'west half rising north', 'flight_2': 'east half rising south', 'width': 2.6, 'type': 'hard',
     'note': 'core stair; floor landings z -3.6..-2, mid landings at the north end; F3 door upward is locked'},
    {'id': 'ST_B', 'name': 'Stair B', 'kind': 'switchback', 'floors': ['F1', 'F2', 'F3'], 'box': [-9, 2, -3, 9],
     'landing': 'north', 'flight_1': 'east half rising south', 'flight_2': 'west half rising north', 'width': 2.6, 'type': 'hard',
     'note': 'core stair; floor landings z 2..3.6, mid landings at the south end'},
    {'id': 'ST_garden', 'name': 'Garden Stair', 'kind': 'straight', 'floors': ['F1', 'F2'], 'width': 2.5,
     'path': [[-19.75, 0.0, 24.6], [-19.75, 2.1, 19.6], [-19.75, 2.1, 17.6], [-19.75, 4.2, 12.0]],
     'mid_landing': {'y': 2.1, 'box': [-21.0, 17.6, -18.5, 19.6], 'type': 'hard', 'note': 'stone mid-landing: breaks the run, cover from the balustrade'},
     'note': 'stone stair in the Garden up to the Gallery; its head faces the Lounge Bar XL wall, not the bar glass'},
    {'id': 'ST_studio', 'name': 'Studio Stair', 'kind': 'straight', 'floors': ['F2', 'F3'], 'width': 1.4,
     'path': [[10.5, 4.2, -23.7], [17.0, 8.4, -23.7]], 'note': 'steel stair along the studio north glass up to catwalk B'},
    {'id': 'ST_spiral', 'name': 'Spiral Stair', 'kind': 'spiral', 'floors': ['F1', 'F2'], 'center': [-14.0, -20.0], 'radius': 1.4,
     'note': 'restaurant stair from the Dining Room to the Noraebang'},
    {'id': 'ST_suite', 'name': 'Suite Stair', 'kind': 'straight', 'floors': ['F2', 'F3'], 'width': 1.4,
     'path': [[-7.0, 4.2, 10.1], [0.0, 8.4, 10.1]], 'note': 'private stair from Reception up to the Suite Lounge'},
]
ladders = [
    {'id': 'LD_shaft', 'name': 'Shaft Ladder', 'x': -7.5, 'z': -4.6, 'y0': 0.0, 'y1': 8.4, 'face': 'south', 'interior': True,
     'note': 'service lift shaft, pried doors on every floor (lift car parked above)'},
    {'id': 'LD_terrace_se', 'name': 'SE Ladder', 'x': 24.4, 'z': 24.4, 'y0': 0.0, 'y1': 8.4, 'interior': False,
     'note': 'terrace -> F2 ledge -> F3 ledge on the SE chamfer'},
    {'id': 'LD_terrace_sw', 'name': 'SW Ladder', 'x': -24.4, 'z': 24.4, 'y0': 0.0, 'y1': 8.4, 'interior': False,
     'note': 'terrace -> F2 ledge -> F3 ledge on the SW chamfer'},
    {'id': 'LD_west', 'name': 'West Ladder', 'x': -26.6, 'z': -9.0, 'y0': 0.0, 'y1': 8.4, 'interior': False,
     'note': 'F1 ledge by the catwalk -> F2 / F3 ledges'},
    {'id': 'LD_bridge', 'name': 'Bridge Roof Ladder', 'x': 54.0, 'z': 15.3, 'y0': 4.2, 'y1': 7.6, 'interior': False,
     'note': 'east tower end of the skybridge up to the bridge roof'},
]
walkways = [
    {'id': 'WK_gridA', 'name': 'Grid A', 'floor': 'F3', 'y': 8.4, 'polygon': rect(9, -16.5, 25.4, -15.0), 'rails': True,
     'note': 'lighting-grid catwalk from the Control Room grid door to the grid window (aligned with the window lite)'},
    {'id': 'WK_gridB', 'name': 'Grid B', 'floor': 'F3', 'y': 8.4, 'polygon': rect(17, -24.4, 18.5, -9), 'rails': True,
     'note': 'catwalk from the Studio Stair to the Archive door'},
    {'id': 'WK_gridC', 'name': 'Grid C', 'floor': 'F3', 'y': 8.4, 'polygon': rect(9.1, -15.0, 10.6, -9.0), 'rails': True,
     'note': 'catwalk along the Control Room void wall from Grid A to the Media Hall and Archive Hall doors (second south lane to S1)'},
]
for wk in walkways:
    wk['polygon'] = [list(p) for p in wk['polygon']]

# ---------------------------------------------------------------- exterior
def ledge_path(closed_from=None):
    return [list(p) for p in OUTLINE]


def strip_poly(a, b, w, off=0.0):
    L_ = seg_len(a, b); ux, uz = (b[0] - a[0]) / L_, (b[1] - a[1]) / L_
    nx, nz = -uz, ux
    o0, o1 = off - w / 2, off + w / 2
    return [[round(a[0] + nx * o0, 3), round(a[1] + nz * o0, 3)], [round(b[0] + nx * o0, 3), round(b[1] + nz * o0, 3)],
            [round(b[0] + nx * o1, 3), round(b[1] + nz * o1, 3)], [round(a[0] + nx * o1, 3), round(a[1] + nz * o1, 3)]]


exterior = {
    'ledges': [
        {'id': 'LG_F1', 'floor': 'F1', 'y': 0.0, 'width': 0.8, 'rail_h': 1.1,
         'path': [[-26, 21], [-26, -21], [-21, -26], [21, -26], [26, -21], [26, 21]], 'closed': False,
         'note': 'W, N and E faces; the south side is the terrace'},
        {'id': 'LG_F2', 'floor': 'F2', 'y': 4.2, 'width': 0.8, 'rail_h': 1.1, 'path': ledge_path(), 'closed': True,
         'breaks': [{'face': 'E', 'z0': 12.0, 'z1': 15.0, 'by': 'skybridge'}]},
        {'id': 'LG_F3', 'floor': 'F3', 'y': 8.4, 'width': 0.8, 'rail_h': 1.1, 'path': ledge_path(), 'closed': True},
    ],
    'rappel': {'y0': 0.0, 'y1': 12.2, 'anchor': 'BMU rail on the 99F mechanical band', 'faces': 'all',
               'note': 'attackers may rappel anywhere on the facade between the F1 ledge and the BMU rail; fins every 3 m give cover'},
    'fins': {'spacing': 3.0, 'depth': 0.45, 'note': 'vertical aluminium fins on every mullion, purple edge light on every third; none on omit_mullion bays'},
    'terrace': {'id': 'TR_terrace', 'name': 'Sky Terrace', 'y': 0.0,
                'polygon': [[-34, 21], [-26, 21], [-21, 26], [21, 26], [26, 21], [34, 21], [34, 57], [-34, 57]],
                'parapet': {'type': 'glass_tempered', 'height': 1.2},
                'features': [
                    {'kind': 'lift_kiosk', 'type': 'hard', 'box': [-5, 48.5, 5, 51.5], 'h': 3.2},
                    {'kind': 'rain_canopy', 'box': [-6, 52, 6, 57], 'h': 3.6, 'note': 'timber canopy with sweeping eaves over the spawn (roof 3.2..3.6)'},
                    {'kind': 'planter', 'type': 'hard', 'box': [-22, 32, -14, 33.5], 'h': 0.9},
                    {'kind': 'planter', 'type': 'hard', 'box': [14, 32, 22, 33.5], 'h': 0.9},
                    {'kind': 'planter', 'type': 'hard', 'box': [-3, 35, 3, 36.5], 'h': 0.9},
                    {'kind': 'pool', 'box': [-30, 36, -20, 44], 'h': 0.0},
                    {'kind': 'bench', 'box': [22, 38, 28, 39], 'h': 0.5},
                    {'kind': 'planter', 'type': 'hard', 'box': [-10, 40, -6, 41.2], 'h': 1.1},
                    {'kind': 'planter', 'type': 'hard', 'box': [6, 40, 10, 41.2], 'h': 1.1},
                    {'kind': 'lantern_wall', 'type': 'hard', 'box': [-1.5, 28.5, 1.5, 29.3], 'h': 1.2, 'note': 'stone lantern wall, no text'},
                    {'kind': 'planter', 'type': 'hard', 'box': [-18, 28.6, -15.6, 29.6], 'h': 1.0},
                    {'kind': 'planter', 'type': 'hard', 'box': [15.6, 28.6, 18, 29.6], 'h': 1.0},
                ]},
    'skybridge': {'id': 'BR_skybridge', 'name': 'Skybridge', 'floor': 'F2', 'y': 4.2, 'a': [26, 13.5], 'b': [56, 13.5], 'width': 3.0,
                  'height': 3.2, 'roof_y': 7.6, 'glass': 'glass_tempered', 'frames_every': 5.0,
                  'glass_floor': {'x0': 39.5, 'x1': 42.5, 'type': 'glass_tempered', 'note': 'walkable tempered glass floor, 400 m drop below'},
                  'side_doors': [{'x': 27.8, 'side': 'north', 'to': 'LG_F2'}, {'x': 27.8, 'side': 'south', 'to': 'LG_F2'}],
                  'roof': {'walkable': True, 'rails': True, 'to': 'LG_F3', 'note': 'roof deck meets the F3 east ledge 0.8 m higher'}},
    'bridge_truss': {'id': 'BR_truss', 'name': 'Bridge Truss', 'floor': 'F1', 'y': 0.0, 'a': [26.8, 13.5], 'b': [56, 13.5], 'width': 1.5,
                     'rails': True, 'hoarding': 1.2, 'from': 'East Tower service stair (hall y 4.2 -> truss landing y 0)',
                     'note': 'service walkway hung under the skybridge, landing on the F1 east ledge at the Bathhouse entry window'},
    'catwalk': {'id': 'BR_catwalk', 'name': 'Catwalk', 'floor': 'F1', 'y': 0.0, 'a': [-26, -5.25], 'b': [-36, -5.25], 'width': 2.0,
                'rails': True, 'hoarding': 1.2, 'steps_down_to': -1.5, 'note': 'open steel catwalk from the West Roof to the catwalk door'},
    'catwalk2': {'id': 'BR_catwalk2', 'name': 'South Catwalk', 'floor': 'F1', 'y': 0.0, 'a': [-26, 15.75], 'b': [-36, 15.75], 'width': 2.0,
                 'rails': True, 'hoarding': 1.2, 'steps_down_to': -1.5, 'note': 'second West Roof catwalk to the Garden entry window (F1_W01)'},
    'gantry': {'id': 'BR_gantry', 'name': 'Gantry', 'floor': 'F3', 'y': 8.4, 'a': [-22.2, -25.9], 'b': [-38.8, -42.5], 'width': 2.0,
               'rails': True, 'hoarding': 1.2, 'note': 'construction gantry from the Crane Deck to the gantry door (NW chamfer, lite 1)'},
    'hoist_ramp': {'id': 'BR_ramp', 'name': 'Hoist Ramp', 'floor': 'F2', 'a': [-11.25, -26.8], 'b': [-30.5, -42.5], 'width': 2.0,
                   'y_a': 4.2, 'y_b': 8.4, 'rails': True, 'hoarding': 1.2,
                   'note': 'construction ramp-stair from the Crane Deck down to the F2 north ledge at the Noraebang entry window'},
    'cradle': {'id': 'CR_cradle', 'name': 'Cradle', 'floor': 'F2', 'y': 4.2, 'center': [24.4, -24.4], 'w': 4.0, 'd': 1.0, 'yaw_deg': 45,
               'moving': {'stops_y': [4.2, 8.4], 'travel_s': 8.0, 'controls': 'call panel at each ledge stop (pictograms only)', 'exposed': True},
               'note': 'working window-cleaning cradle (BMU) on the NE chamfer between the F2 and F3 ledges'},
    'neighbours': [
        {'id': 'NB_east', 'name': 'East Tower', 'footprint': rect(56, -6, 82, 32), 'top_y': 160.0, 'label': [74, 28],
         'spawn_hall': rect(56, 3, 66, 24),
         'features': [{'kind': 'baffle', 'type': 'hard', 'box': [57.3, 11.0, 57.7, 16.0], 'y0': 4.2, 'h': 3.2, 'note': 'hard baffle across the bridge mouth'},
                      {'kind': 'service_stair', 'box': [58, 16.5, 62, 18.5], 'y0': 0.0, 'y1': 4.2, 'note': 'down to the truss landing'},
                      {'kind': 'truss_landing', 'box': [56, 12, 60, 16.5], 'y0': 0.0}],
         'note': 'neighbouring glass tower; the bridge hall (A3) has a solid west wall except the bridge mouth (z 12..15)'},
        {'id': 'NB_west', 'name': 'West Roof', 'footprint': rect(-68, -28, -36, 18), 'top_y': -1.5,
         'features': [{'kind': 'plant_room', 'box': [-62, -20, -50, -12], 'h': 4.0}, {'kind': 'cooling_tower', 'box': [-62, 2, -54, 10], 'h': 5.0},
                      {'kind': 'helipad_ring', 'center': [-46, 4], 'r': 6.0}],
         'note': 'roof of a lower neighbouring tower, 1.5 m below F1; A2 spawns in the plant room west lee; no lettering on the helipad'},
        {'id': 'NB_crane', 'name': 'Crane Deck', 'footprint': rect(-64, -66.5, -28, -42.5), 'top_y': 8.4, 'label': [-36, -62],
         'features': [{'kind': 'tower_crane_mast', 'center': [-61.5, -63.5], 'h': 60.0},
                      {'kind': 'material_stack', 'box': [-58, -52, -54, -48], 'h': 1.4},
                      {'kind': 'material_stack', 'box': [-40, -50, -37, -47], 'h': 1.6},
                      {'kind': 'material_stack', 'box': [-34, -47, -31, -45], 'h': 1.4},
                      {'kind': 'hut_roof', 'box': [-50, -57, -42, -49], 'h': 3.0},
                      {'kind': 'hut_wall_e', 'box': [-42.2, -57, -42, -49], 'h': 3.0},
                      {'kind': 'hut_wall_s', 'box': [-50, -49.2, -42, -49], 'h': 3.0}],
         'note': 'top deck of a neighbouring tower under construction, level with F3; A4 spawns in the roofed site hut'},
        {'id': 'NB_lowerblock', 'name': 'Lower Block', 'footprint': [(-21, -26), (21, -26), (26, -21), (26, 21), (34, 21), (34, 57), (-34, 57), (-34, 21), (-26, 21), (-26, -21)], 'top_y': 0.0,
         'note': 'the tower below the 96F setback (terrace is its roof)'},
    ],
    'mech_floor': {'floor': '99F', 'y0': 12.6, 'y1': 16.8, 'note': 'outrigger belt truss band, louvres, BMU rail at 12.2; hard and not playable'},
    'tower_above': {'floors': '99F-128F', 'crown_y': 134.0, 'note': 'tower continues ~30 floors above the map to a lattice crown'},
    'weather': {'rain': 'sheets down the Garden 7.3 m glass and every pane', 'lightning': 'emissive sky pulse over the river every 20-40 s, no extra lights'},
    'elevation_f1': 403.2,
}
for nb in exterior['neighbours']:
    nb['footprint'] = [list(p) for p in nb['footprint']]
    if 'spawn_hall' in nb:
        nb['spawn_hall'] = [list(p) for p in nb['spawn_hall']]
# defender reveal zones: a defender standing here is revealed (runout rule)
zones = [{'id': 'ZONE_EXT_terrace', 'kind': 'terrace', 'ref': 'TR_terrace', 'y': 0.0, 'polygon': exterior['terrace']['polygon']}]
for lg in exterior['ledges']:
    zones.append({'id': 'ZONE_EXT_%s' % lg['id'], 'kind': 'ledge', 'ref': lg['id'], 'y': lg['y'], 'path': lg['path'], 'closed': lg['closed'],
                  'width': lg['width'], 'note': 'strip of the ledge width outside the glass'})
for k, y in (('catwalk', 0.0), ('catwalk2', 0.0), ('gantry', 8.4), ('bridge_truss', 0.0)):
    br = exterior[k]
    zones.append({'id': 'ZONE_EXT_%s' % br['id'], 'kind': 'bridge', 'ref': br['id'], 'y': y, 'polygon': strip_poly(br['a'], br['b'], br['width'])})
hr = exterior['hoist_ramp']
zones.append({'id': 'ZONE_EXT_BR_ramp', 'kind': 'bridge', 'ref': 'BR_ramp', 'y': [hr['y_a'], hr['y_b']], 'polygon': strip_poly(hr['a'], hr['b'], hr['width'])})
sb = exterior['skybridge']
zones.append({'id': 'ZONE_EXT_BR_skybridge', 'kind': 'bridge', 'ref': 'BR_skybridge', 'y': 4.2, 'polygon': strip_poly(sb['a'], sb['b'], sb['width'])})
zones.append({'id': 'ZONE_EXT_BR_skybridge_roof', 'kind': 'roof', 'ref': 'BR_skybridge', 'y': sb['roof_y'], 'polygon': strip_poly(sb['a'], sb['b'], sb['width'])})
cr = exterior['cradle']
zones.append({'id': 'ZONE_EXT_CR_cradle', 'kind': 'cradle', 'ref': 'CR_cradle', 'y': [4.2, 8.4],
              'polygon': [[cr['center'][0] - 2, cr['center'][1] - 2], [cr['center'][0] + 2, cr['center'][1] - 2], [cr['center'][0] + 2, cr['center'][1] + 2], [cr['center'][0] - 2, cr['center'][1] + 2]]})
for nb in exterior['neighbours']:
    if nb['id'] in ('NB_west', 'NB_crane'):
        zones.append({'id': 'ZONE_EXT_%s' % nb['id'], 'kind': 'neighbour_roof', 'ref': nb['id'], 'y': nb['top_y'], 'polygon': nb['footprint']})
    if nb['id'] == 'NB_east':
        zones.append({'id': 'ZONE_EXT_NB_east_hall', 'kind': 'spawn_hall', 'ref': nb['id'], 'y': 4.2, 'polygon': nb['spawn_hall']})
exterior['defender_reveal_zones'] = zones

# ---------------------------------------------------------------- sites, spawns, cover
sites = [
    {'id': 'S1', 'name': 'Control Room / Render Farm', 'floor': 'F3', 'rooms': ['F3_control_room', 'F3_render_farm'],
     'objectives': [{'id': 'S1A', 'room': 'F3_control_room', 'pos': [4.5, 8.4, -21.75]},
                    {'id': 'S1B', 'room': 'F3_render_farm', 'pos': [-4.5, 8.4, -23.3]}],
     'hard_anchor': 'render vault fire wall (x=-9, z -26..-22) and the void wall (x=9, z -26..-22)'},
    {'id': 'S2', 'name': 'Concierge / Deposit', 'floor': 'F2', 'rooms': ['F2_concierge', 'F2_deposit'],
     'objectives': [{'id': 'S2A', 'room': 'F2_concierge', 'pos': [19.0, 4.2, 6.2]},
                    {'id': 'S2B', 'room': 'F2_deposit', 'pos': [19.0, 4.2, -7.0]}],
     'hard_anchor': 'LED volume backing (z=-9, x 12..16) and the core behind Vault Hall'},
    {'id': 'S3', 'name': 'Lounge Bar / Wine Room', 'floor': 'F2', 'rooms': ['F2_lounge_bar', 'F2_wine_room'],
     'objectives': [{'id': 'S3A', 'room': 'F2_lounge_bar', 'pos': [-17.5, 4.2, 6.6]},
                    {'id': 'S3B', 'room': 'F2_wine_room', 'pos': [-16.0, 4.2, -9.5]}],
     'hard_anchor': 'stone cellar wall (z=-12, x -20..-12) and the core behind Cellar Hall'},
    {'id': 'S4', 'name': 'Tea Room / Ondol Lounge', 'floor': 'F1', 'rooms': ['F1_tea_room', 'F1_ondol_lounge'],
     'objectives': [{'id': 'S4A', 'room': 'F1_tea_room', 'pos': [-6.5, 0.0, 18.8]},
                    {'id': 'S4B', 'room': 'F1_ondol_lounge', 'pos': [2.5, 0.0, 18.8]}],
     'hard_anchor': 'garden stone wall (x=-9, z 12..21)'},
]
spawns = {
    'attackers': [
        {'id': 'A1', 'name': 'Sky Terrace', 'floor': 'F1', 'points': [[-2.5, 0, 53.5], [0, 0, 53.0], [2.5, 0, 53.5], [-1.2, 0, 55.0], [1.2, 0, 55.0]],
         'approach': 'behind the lift kiosk, under the canopy -> garden doors / veranda windows / bath door (F1); SE and SW ladders to the F2 and F3 ledges'},
        {'id': 'A2', 'name': 'West Roof', 'floor': 'F1', 'points': [[-64, -1.5, -19], [-64, -1.5, -17], [-64, -1.5, -15], [-66, -1.5, -18], [-66, -1.5, -16]],
         'approach': 'plant room west lee -> Catwalk (catwalk door, F1 Staff Entry) or South Catwalk (Garden entry window); West Ladder to the F2 / F3 ledges'},
        {'id': 'A3', 'name': 'Skybridge', 'floor': 'F2', 'points': [[59, 4.2, 5.5], [61.5, 4.2, 7.5], [64, 4.2, 5.0], [59, 4.2, 20.5], [61.5, 4.2, 19.0]],
         'approach': 'bridge hall, off the tube axis behind the baffle -> portal (F2 Bridge Lobby); side doors to the F2 ledge; bridge roof to the F3 east ledge; service stair -> Bridge Truss -> F1 east ledge'},
        {'id': 'A4', 'name': 'Crane Deck', 'floor': 'F3', 'points': [[-47, 8.4, -54], [-45, 8.4, -52], [-48, 8.4, -52], [-45, 8.4, -55], [-46.5, 8.4, -53.5]],
         'approach': 'roofed site hut -> Gantry (gantry door, F3 Edit Bay) or Hoist Ramp (F2 north ledge, Noraebang window); rappel down the north and west faces'},
    ],
    'defenders': [
        {'id': 'D1', 'site': 'S1', 'floor': 'F3', 'points': [[-7.5, 8.4, -19.8], [-1.5, 8.4, -19.8], [2.0, 8.4, -14.0], [7.5, 8.4, -24.5], [-6.5, 8.4, -14.0]]},
        {'id': 'D2', 'site': 'S2', 'floor': 'F2', 'points': [[14.0, 4.2, -7.5], [24.5, 4.2, -6.0], [20.0, 4.2, -2.8], [13.5, 4.2, 1.5], [17.0, 4.2, 7.8]]},
        {'id': 'D3', 'site': 'S3', 'floor': 'F2', 'points': [[-13.5, 4.2, -10.5], [-18.5, 4.2, -2.0], [-13.8, 4.2, 2.0], [-24.5, 4.2, 1.5], [-13.8, 4.2, 7.8]]},
        {'id': 'D4', 'site': 'S4', 'floor': 'F1', 'points': [[-7.5, 0.0, 13.3], [-1.5, 0.0, 19.8], [1.5, 0.0, 13.3], [7.8, 0.0, 20.0], [3.0, 0.0, 14.2]]},
    ],
}
cover = [  # suggested deployable-shield spots (yaw: facing direction, degrees, 0 = north / -z, 90 = east)
    ('F3', 7.5, -17.3, 90), ('F3', -6.0, -13.4, 180), ('F3', -0.8, -23.0, 0),
    ('F2', 21.0, 7.6, 180), ('F2', 16.5, -2.2, 0), ('F2', 24.4, -3.5, 90),
    ('F2', -21.0, 7.6, 180), ('F2', -13.4, -8.5, 90), ('F2', -24.5, -9.0, 270),
    ('F1', -3.0, 20.0, 180), ('F1', 4.5, 20.0, 180), ('F1', 7.8, 16.5, 90),
    ('F2', 44.0, 13.5, 270), ('F3', -29.8, -33.5, 135), ('F1', -31.0, -5.25, 90), ('F1', -12.0, 42.0, 0),
    ('F1', -31.0, 15.75, 90), ('F1', 40.0, 13.5, 270), ('F2', -19.75, 10.2, 0),
]
cover_list = [{'id': 'CV%02d' % (i + 1), 'floor': c[0], 'x': c[1], 'z': c[2], 'yaw_deg': c[3], 'kind': 'deployable', 'w': 1.2, 'h': 1.0}
              for i, c in enumerate(cover)]

# ---------------------------------------------------------------- set pieces
set_pieces = [
    {'id': 'HOLO_stage', 'kind': 'holo', 'floor': 'F2', 'center': [17.0, -17.5], 'radius': 3.3, 'y0': 0.6, 'y1': 7.0,
     'blocks': 'vision', 'bullets': 'pass', 'default': 'off',
     'switch': {'prop': 'holo_console', 'room': 'F3_control_room', 'pos': [7.5, 8.4, -18.6], 'who': 'defenders',
                'note': 'toggles the hologram; attackers can use it once they hold the Control Room'},
     'emitter': {'shape': 'ring', 'r': 3.5, 'y': 0.6, 'destructible': True, 'note': 'shoot the emitter ring to kill the hologram for the round'},
     'note': '6.4 m abstract hologram (figures and shapes, no text) over the stage: ties S1 and S2 fights to the Studio'},
]

# ---------------------------------------------------------------- routes and sightlines (for the overlay)
routes = [
    {'id': 'RT_terrace_s4', 'kind': 'attack', 'from': 'A1', 'to': 'S4', 'points': [[0, 0, 53], [-6, 0, 52], [-6, 0, 47], [-5.25, 0, 30], [-5.25, 0, 26.5], [-5, 0, 23]], 'note': 'veranda window -> Tea Room south wall'},
    {'id': 'RT_terrace_garden', 'kind': 'attack', 'from': 'A1', 'to': 'S3', 'points': [[-2.5, 0, 53.5], [-6.5, 0, 52], [-13.5, 0, 30], [-13.5, 0, 26.5], [-15, 0, 25.2], [-19.75, 0, 25.0], [-19.75, 2.1, 19.6], [-19.75, 2.1, 17.6], [-19.75, 4.2, 12], [-19.1, 4.2, 10.0]], 'note': 'garden doors -> Garden Stair (mid-landing) -> Gallery -> Lounge Bar XL wall / double door'},
    {'id': 'RT_terrace_se', 'kind': 'attack', 'from': 'A1', 'to': 'S2', 'points': [[2.5, 0, 53.5], [6.5, 0, 52], [24.4, 0, 30], [24.4, 0, 24.4], [24.4, 4.2, 24.4], [26.4, 4.2, 18], [26.4, 4.2, 5.25]], 'note': 'SE ladder -> F2 ledge -> Concierge window'},
    {'id': 'RT_west_catwalk', 'kind': 'attack', 'from': 'A2', 'to': 'S3', 'points': [[-65, -1.5, -17], [-63, -1.5, -10], [-48, -1.5, -6], [-36, 0, -5.25], [-26, 0, -5.25], [-22, 0, -5], [-15.5, 0, -1], [-10.5, 0, 3], [-6, 0, 3], [-6, 4.2, 3], [-10.5, 4.2, 3]], 'note': 'catwalk door -> Staff Entry -> Plant Room -> Service Hall -> Stair B -> Cellar Hall'},
    {'id': 'RT_west_south', 'kind': 'attack', 'from': 'A2', 'to': 'S4', 'points': [[-65, -1.5, -15], [-64, -1.5, 0], [-48, -1.5, 14], [-36, 0, 15.75], [-26, 0, 15.75], [-22, 0, 15.75], [-14, 0, 13.8], [-12, 0, 11.4], [-10.5, 0, 10.4], [-9, 0, 9.9], [-7.5, 0, 11], [-7.5, 0, 12.5]], 'note': 'South Catwalk -> Garden window -> Garden Lobby -> Spa Hall -> Tea Room door'},
    {'id': 'RT_west_ladder', 'kind': 'attack', 'from': 'A2', 'to': 'S3', 'points': [[-65, -1.5, -17], [-48, -1.5, -6], [-36, 0, -5.25], [-26.4, 0, -6], [-26.6, 0, -9], [-26.6, 4.2, -9], [-26.4, 4.2, -5.25]], 'note': 'West Ladder -> F2 ledge -> Cigar Room window'},
    {'id': 'RT_bridge_s2', 'kind': 'attack', 'from': 'A3', 'to': 'S2', 'points': [[60, 4.2, 5.5], [57, 4.2, 9], [56, 4.2, 12.5], [26, 4.2, 12.8], [24, 4.2, 10.5], [20, 4.2, 10]], 'note': 'portal -> around the bridge screen -> Concierge double door'},
    {'id': 'RT_bridge_truss', 'kind': 'attack', 'from': 'A3', 'to': 'S4', 'points': [[61.5, 4.2, 19], [60, 4.2, 17.5], [57, 0, 14], [26.8, 0, 13.5], [25, 0, 12.75], [16, 0, 11.8], [15.5, 0, 16], [12, 0, 15], [9.3, 0, 13]], 'note': 'service stair -> Bridge Truss -> Bathhouse window -> Changing -> Ondol east wall'},
    {'id': 'RT_bridge_roof', 'kind': 'attack', 'from': 'A3', 'to': 'S1', 'points': [[59, 4.2, 20.5], [54, 4.2, 15.3], [54, 7.6, 15.3], [27, 7.6, 13.5], [26.4, 8.4, 13.5], [26.4, 8.4, -15.75], [24.5, 8.4, -15.75], [10, 8.4, -15.75]], 'note': 'bridge roof -> F3 east ledge -> grid window -> Grid A -> grid door / Grid C'},
    {'id': 'RT_crane_s1', 'kind': 'attack', 'from': 'A4', 'to': 'S1', 'points': [[-46, 8.4, -53], [-40, 8.4, -48], [-38.8, 8.4, -42.5], [-22.2, 8.4, -25.9], [-21.0, 8.4, -26.4], [-13.5, 8.4, -26.4], [-5.25, 8.4, -26.4]], 'note': 'gantry -> F3 north ledge -> Render Farm window'},
    {'id': 'RT_crane_ramp', 'kind': 'attack', 'from': 'A4', 'to': 'S3', 'points': [[-46, 8.4, -53], [-38, 8.4, -47], [-30.5, 8.4, -42.5], [-11.25, 4.2, -26.8], [-11.25, 4.2, -24], [-10.5, 4.2, -13], [-10.5, 4.2, -7]], 'note': 'Hoist Ramp -> Noraebang window -> Cellar Hall -> Wine Room east wall'},
    {'id': 'RT_crane_rappel', 'kind': 'attack', 'from': 'A4', 'to': 'S3', 'points': [[-46, 8.4, -53], [-38.8, 8.4, -42.5], [-22.2, 8.4, -25.9], [-26.4, 8.4, -19], [-26.4, 4.2, -5.25], [-24, 4.2, -5.25]], 'note': 'gantry -> rappel down the west face -> Cigar Room window'},
    {'id': 'RT_rot_core', 'kind': 'rotation', 'from': 'S2', 'to': 'S3', 'points': [[12, 4.2, 0], [9, 4.2, 0], [-9, 4.2, 0], [-12, 4.2, 0]], 'note': 'Sky Lifts straight through the core'},
    {'id': 'RT_rot_stairA', 'kind': 'rotation', 'from': 'S2', 'to': 'S1', 'points': [[10.5, 4.2, -3], [6, 4.2, -3], [6, 8.4, -3], [10.5, 8.4, -3], [10.5, 8.4, -8], [9.75, 8.4, -9.5], [9.75, 8.4, -10.5], [8, 8.4, -10.5], [4.95, 8.4, -10.5], [4.95, 8.4, -13]], 'note': 'Stair A -> Archive Hall -> Grid C -> Media Hall -> Control Room door (bypasses the core)'},
    {'id': 'RT_rot_stairB', 'kind': 'rotation', 'from': 'S3', 'to': 'S4', 'points': [[-10.5, 4.2, 3], [-6, 4.2, 3], [-6, 0, 3], [-10.5, 0, 3], [-10.5, 0, 9], [-10.5, 0, 10.4], [-9, 0, 9.9], [-7.5, 0, 10.5], [-7.5, 0, 12.5]], 'note': 'Stair B -> Service Hall -> Garden Lobby -> Spa Hall -> Tea Room door'},
    {'id': 'RT_flank_shaft', 'kind': 'flank', 'from': 'S4', 'to': 'S1', 'points': [[-7.5, 0, -1], [-7.5, 0, -3.5], [-7.5, 8.4, -3.5], [-7.5, 8.4, -1]], 'note': 'Shaft ladder through all three floors'},
]
sightlines = [
    {'id': 'SL_lift_lobby', 'floor': 'all', 'a': [-12, 1.5, 0], 'b': [12, 1.5, 0], 'note': '24 m through the core; both ends barricadable double doors'},
    {'id': 'SL_bridge', 'floor': 'F2', 'a': [56, 5.7, 13.5], 'b': [22.4, 5.7, 13.5], 'note': 'bridge tube; stopped by the bridge screen and the hall baffle'},
    {'id': 'SL_director', 'floor': 'F3', 'a': [6, 10.0, -19.5], 'b': [17, 5.4, -17.5], 'note': 'Control Room window down onto the stage; counter from the stage and the grid'},
    {'id': 'SL_gallery_drop', 'floor': 'F2', 'a': [-13, 5.8, 13], 'b': [-13.5, 1.2, 25], 'note': 'Gallery rail over the garden doors; counter from the arcade and the pavilion'},
    {'id': 'SL_bar_glass', 'floor': 'F2', 'a': [-13.4, 5.6, 8.5], 'b': [-19.75, 4.9, 12.5], 'note': 'bar glass across the stair head; the flight itself is behind the tempered balustrade (see, not shoot)'},
    {'id': 'SL_veranda', 'floor': 'F1', 'a': [-8.5, 1.4, 23.5], 'b': [8.5, 1.4, 23.5], 'note': '17 m along the Veranda glass'},
    {'id': 'SL_spa_hall', 'floor': 'F1', 'a': [-8.5, 1.4, 10.5], 'b': [14.5, 1.4, 10.5], 'note': 'defender rotation lane behind S4 (shower block stops it at the Bathhouse)'},
    {'id': 'SL_north_ledge', 'floor': 'F3', 'a': [-21.0, 9.8, -26.4], 'b': [9, 9.8, -26.4], 'note': 'F3 north ledge from the gantry to the Control Room windows'},
    {'id': 'SL_grid', 'floor': 'F3', 'a': [9.5, 9.8, -15.75], 'b': [25, 9.8, -15.75], 'note': 'Grid A, open to the stage below'},
    {'id': 'SL_grid_c', 'floor': 'F3', 'a': [9.85, 9.8, -15.0], 'b': [9.85, 9.8, -9.2], 'note': 'Grid C along the Control Room void wall'},
    {'id': 'SL_vault_hall', 'floor': 'F2', 'a': [10.5, 5.6, -8.5], 'b': [10.5, 5.6, 8.5], 'note': 'Vault Hall behind S2'},
]

# ---------------------------------------------------------------- surface types and node naming
surface_types = {
    'hard': {'destructible': False, 'reinforceable': False, 'node_prefix': 'HARD_', 'desc': 'indestructible: core, columns, shear/stone walls, slabs, spandrels'},
    'soft': {'destructible': True, 'reinforceable': False, 'node_prefix': 'SOFT_', 'desc': 'drywall partition, floor to ceiling; bullets and charges make holes'},
    'reinforceable': {'destructible': True, 'reinforceable': True, 'node_prefix': 'REINF_', 'desc': 'soft panel zone 0..2.0 m sized for Wall Fortification units; hard transom/header above 2.0 m'},
    'glass': {'destructible': True, 'reinforceable': False, 'node_prefix': 'GLASSI_', 'desc': 'interior glazing, breakable'},
    'balustrade': {'destructible': False, 'reinforceable': False, 'node_prefix': 'RAIL_', 'desc': '1.1 m tempered glass rail at void edges and walkways; shoot and vault over'},
    'open': {'destructible': False, 'reinforceable': False, 'node_prefix': None, 'desc': 'callout boundary only, no geometry'},
    'hatch': {'destructible': True, 'reinforceable': True, 'node_prefix': 'HATCH_', 'desc': '1.2 x 1.2 m breakable floor panel; wall-fortification-hatch fits it'},
    'soft_floor': {'destructible': True, 'reinforceable': False, 'node_prefix': 'SOFTFLOOR_', 'desc': 'destructible floor/ceiling patch for vertical shots'},
    'door_barricadable': {'destructible': True, 'reinforceable': False, 'node_prefix': 'BARR_D_', 'desc': 'doorway that takes a barricade'},
    'window_barricadable': {'destructible': True, 'reinforceable': False, 'node_prefix': 'BARR_W_', 'desc': 'window/entry opening that takes a barricade'},
    'opening': {'destructible': False, 'reinforceable': False, 'node_prefix': 'OPEN_', 'desc': 'archway, vault counter, pried lift door: never barricaded'},
    'glass_breakable': {'destructible': True, 'reinforceable': False, 'node_prefix': 'GLASS_B_', 'desc': 'curtain-wall lite that shatters (sightline; entry from a ledge or rappel)'},
    'glass_tempered': {'destructible': False, 'reinforceable': False, 'node_prefix': 'GLASS_T_', 'desc': 'unbreakable, bulletproof curtain-wall lite'},
    'spandrel': {'destructible': False, 'reinforceable': False, 'node_prefix': 'HARD_', 'desc': 'opaque curtain-wall panel'},
    'portal': {'destructible': False, 'reinforceable': False, 'node_prefix': 'HARD_', 'desc': 'bridge portal frame with a barricadable double door'},
    'pilaster': {'destructible': False, 'reinforceable': False, 'node_prefix': 'HARD_', 'desc': '0.3 m hard pilaster where two reinforceable walls of one room meet'},
    'glass_floor': {'destructible': False, 'reinforceable': False, 'node_prefix': 'GLASS_TF_', 'desc': 'walkable tempered glass floor (unbreakable)'},
    'holo': {'destructible': True, 'reinforceable': False, 'node_prefix': 'HOLO_', 'desc': 'hologram volume: blocks vision, not bullets; its emitter ring is destructible'},
    'zone_ext': {'destructible': False, 'reinforceable': False, 'node_prefix': 'ZONE_EXT_', 'desc': 'exterior defender reveal zone (trigger volume, no geometry)'},
}

layout = {
    'meta': {
        'id': 'haneul-tower', 'name': 'Haneul Tower', 'version': 2, 'units': 'metres',
        'axes': 'x east, y up, z south (plan [x, z]); north is -z',
        'heights': 'wall and opening y values are relative to their floor level; [x, y, z] points are absolute (F1 floor = 0)',
        'setting': 'Seoul, 2111, rainy night near midnight; a fictional mixed-use supertall on the north bank of the river',
        'mode': 'attack/defend 5v5, 4 site pairs, destructible environment',
        'revision': 'v2: competitive critique applied (see DESIGN.md section 11)',
    },
    'rules': {
        'floor_to_floor': FTF, 'ceiling': CEIL, 'slab': SLAB, 'plenum': round(FTF - CEIL - SLAB, 2),
        'door': {'w': 1.0, 'h': DOOR_H}, 'double_door': {'w': 2.0, 'h': DOOR_H},
        'interior_window': {'sill': 1.0, 'head': DOOR_H}, 'facade_entry_window': {'sill': 0.45, 'head': DOOR_H},
        'reinforce': {'height': REINF_H, 'header': 'hard steel transom from 2.0 m to the ceiling', 'sizes': SIZES, 'hatch': 1.2,
                      'gadget': '/home/user/gunmodls/gadgets/wall-fortification', 'far_side': 'set far_side z to -thickness (0.2 m)',
                      'budget': BUDGET, 'budget_rule': 'per defending team per round; any wall unit or hatch counts 1',
                      'band': BAND, 'trim': TRIM, 'pilaster': PILASTER,
                      'placement': 'units sit on the clear defender face, centred in reinforce.clear, with >= trim of hard jamb at each end'},
        'thickness': THICK, 'core_thickness': {'outer': 0.6, 'inner': 0.3},
        'curtain_wall': {'bay': 3.0, 'lites_per_bay': 2, 'chamfer_bay': round(seg_len((21, -26), (26, -21)) / 2, 3),
                         'vision': [0.0, CEIL], 'spandrel': [CEIL, FTF]},
    },
    'surface_types': surface_types,
    'floors': [dict(f, height=FTF, ceiling=CEIL, slab=SLAB) for f in FLOORS],
    'outline': [list(p) for p in OUTLINE],
    'core': {'outline': [list(p) for p in CORE], 'thickness': 0.6, 'type': 'hard'},
    'columns': columns,
    'voids': voids,
    'slab_openings': slab_openings,
    'rooms': rooms,
    'walls': walls,
    'pilasters': pilasters,
    'facade': {'faces': [{'name': f[0], 'a': list(f[1]), 'b': list(f[2]), 'bays': f[3]} for f in FACES], 'bays': bays},
    'hatches': hatch_list,
    'floor_patches': patch_list,
    'stairs': stairs,
    'ladders': ladders,
    'walkways': walkways,
    'exterior': exterior,
    'sites': sites,
    'spawns': spawns,
    'cover': cover_list,
    'set_pieces': set_pieces,
    'props': prop_list,
    'routes': routes,
    'sightlines': sightlines,
}


def rnd(o):
    if isinstance(o, float):
        return round(o, 3)
    if isinstance(o, tuple):
        return [rnd(x) for x in o]
    if isinstance(o, list):
        return [rnd(x) for x in o]
    if isinstance(o, dict):
        return {k: rnd(v) for k, v in o.items()}
    return o


with open(OUT, 'w') as fh:
    json.dump(rnd(layout), fh, indent=1)
print('wrote', OUT, '%d rooms, %d walls, %d bays' % (len(rooms), len(walls), len(bays)))
