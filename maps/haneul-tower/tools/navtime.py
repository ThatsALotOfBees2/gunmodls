#!/usr/bin/env python3
# Rough timings from layout.json on a 0.5 m nav grid (3 levels + exterior).
# Attackers: everything (ledges, rappel, ladders, hatches down, breakable glass).
# Defenders: interior only. Sprint 5 m/s; penalties for barricades, vaults, glass, climbs.
# Usage: python3 tools/navtime.py [layout.json] [--json out.json]
import json, math, os, sys, heapq
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geom import point_in_poly, dist_point_seg, seg_len, seg_point

args = [a for a in sys.argv[1:] if not a.startswith('--')]
path = args[0] if args else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'layout.json')
L = json.load(open(path))
RES, SPEED = 0.5, 5.0
X0, Z0, X1, Z1 = -80.0, -70.0, 86.0, 56.0
NX, NZ = int((X1 - X0) / RES), int((Z1 - Z0) / RES)
FL = [f['id'] for f in L['floors']]
LV = {f: i for i, f in enumerate(FL)}
PEN = {'barricade': 1.0, 'vault': 0.8, 'window': 1.5, 'glass': 2.0, 'door_ext': 1.0}
T = lambda p: (p[0], p[1])


def cell(x, z):
    return int((x - X0) / RES), int((z - Z0) / RES)


def ctr(i, j):
    return (X0 + (i + 0.5) * RES, Z0 + (j + 0.5) * RES)


# per level: 0 blocked, 1 interior, 2 exterior
grid = [[[0] * NZ for _ in range(NX)] for _ in FL]
pen = [dict() for _ in FL]
room_of = [dict() for _ in FL]
outline = [T(p) for p in L['outline']]


def fill_poly(lv, poly, val, bbox_only=False):
    xs = [p[0] for p in poly]; zs = [p[1] for p in poly]
    i0, j0 = cell(min(xs), min(zs)); i1, j1 = cell(max(xs), max(zs))
    out = []
    for i in range(max(0, i0), min(NX, i1 + 1)):
        for j in range(max(0, j0), min(NZ, j1 + 1)):
            if point_in_poly(ctr(i, j), poly):
                grid[lv][i][j] = val; out.append((i, j))
    return out


# interior rooms
for r in L['rooms']:
    if r['kind'] in ('void', 'solid'): continue
    lv = LV[r['floor']]
    for (i, j) in fill_poly(lv, [T(p) for p in r['polygon']], 1):
        room_of[lv][(i, j)] = r['id']
for wk in L['walkways']:
    for (i, j) in fill_poly(LV[wk['floor']], [T(p) for p in wk['polygon']], 1):
        room_of[LV[wk['floor']]][(i, j)] = 'F3_studio_void'


def strip(a, b, w, off=0.0):
    Lb = seg_len(a, b); ux, uz = (b[0] - a[0]) / Lb, (b[1] - a[1]) / Lb
    nx, nz = -uz, ux
    o0, o1 = off - w / 2, off + w / 2
    return [(a[0] + nx * o0, a[1] + nz * o0), (b[0] + nx * o0, b[1] + nz * o0), (b[0] + nx * o1, b[1] + nz * o1), (a[0] + nx * o1, a[1] + nz * o1)]


ex = L['exterior']
# ledges: strip outside the outline (inward normal is +n, so offset negative)
for lg in ex['ledges']:
    lv = LV[lg['floor']]; pts = [T(p) for p in lg['path']]
    n = len(pts) if lg['closed'] else len(pts) - 1
    for k in range(n):
        a, b = pts[k], pts[(k + 1) % len(pts)]
        fill_poly(lv, strip(a, b, lg['width'] + 0.3, -(lg['width'] / 2 + 0.05)), 2)
fill_poly(0, [T(p) for p in ex['terrace']['polygon']], 2)
for k in ('catwalk', 'catwalk2', 'gantry', 'bridge_truss'):
    if k not in ex: continue
    br = ex[k]; fill_poly(LV[br['floor']], strip(T(br['a']), T(br['b']), br['width']), 2)
sb = ex['skybridge']
fill_poly(1, strip(T(sb['a']), T(sb['b']), sb['width']), 2)
fill_poly(2, strip(T(sb['a']), T(sb['b']), sb['width']), 2)  # bridge roof at F3 level
for side in (-1, 1):  # side-door platforms to the F2 ledge
    fill_poly(1, [(26.0, 13.5 + side * 1.5), (28.6, 13.5 + side * 1.5), (28.6, 13.5 + side * 2.4), (26.0, 13.5 + side * 2.4)], 2)
cr = ex['cradle']
fill_poly(1, [(cr['center'][0] - 1.6, cr['center'][1] - 1.6), (cr['center'][0] + 1.6, cr['center'][1] - 1.6),
              (cr['center'][0] + 1.6, cr['center'][1] + 1.6), (cr['center'][0] - 1.6, cr['center'][1] + 1.6)], 2)
for nb in ex['neighbours']:
    if nb['id'] == 'NB_west': fill_poly(0, [T(p) for p in nb['footprint']], 2)
    if nb['id'] == 'NB_crane': fill_poly(2, [T(p) for p in nb['footprint']], 2)
    if nb['id'] == 'NB_east':
        fill_poly(1, [T(p) for p in nb['spawn_hall']], 2)
        for ft in nb.get('features', []):
            if ft['kind'] == 'truss_landing':
                x0, z0, x1, z1 = ft['box']; fill_poly(0, [(x0, z0), (x1, z0), (x1, z1), (x0, z1)], 2)


def stamp_seg(lv, a, b, half, openings, kindpen):
    # block cells within half of segment a-b, except inside openings (with penalties)
    Lw = seg_len(a, b)
    xs = (a[0], b[0]); zs = (a[1], b[1])
    i0, j0 = cell(min(xs) - half - 0.5, min(zs) - half - 0.5); i1, j1 = cell(max(xs) + half + 0.5, max(zs) + half + 0.5)
    for i in range(max(0, i0), min(NX, i1 + 1)):
        for j in range(max(0, j0), min(NZ, j1 + 1)):
            p = ctr(i, j)
            d, t = dist_point_seg(p, a, b)
            if d > half: continue
            u = t * Lw
            op = None
            for o in openings:
                if o['u0'] + 0.15 <= u <= o['u1'] - 0.15: op = o; break
            if op is None:
                grid[lv][i][j] = 0
            else:
                k = kindpen(op)
                if k: pen[lv][(i, j)] = max(pen[lv].get((i, j), 0), k)


def wall_pen(o):
    if o['kind'] in ('door', 'double_door'): return PEN['barricade'] if o['barricadable'] else 0
    if o['kind'] in ('window', 'vault'): return PEN['vault'] + (PEN['barricade'] if o['barricadable'] else 0)
    return 0


for w in L['walls']:
    if w['type'] == 'open': continue
    lv = LV[w['floor']]
    half = max(0.26, w['thickness'] / 2 + 0.12)
    stamp_seg(lv, T(w['a']), T(w['b']), half, w['openings'], wall_pen)
    if w.get('to_slab') and LV[w['floor']] + 1 < len(FL):
        pass
for b in L['facade']['bays']:
    lv = LV[b['floor']]
    a, bb = T(b['a']), T(b['b'])
    ops = []
    if b['kind'] == 'portal' or b.get('opening'):
        o = b['opening']; ops.append({'u0': o['u0'], 'u1': o['u1'], 'p': PEN['door_ext']})
    for lt in b.get('lites', []):
        ty = lt['type']
        if ty == 'glass_breakable' and not b['double_height']:
            ops.append({'u0': lt['u0'], 'u1': lt['u1'], 'p': PEN['glass']})
        if ty == 'glass_breakable' and b['double_height']:
            ops.append({'u0': lt['u0'], 'u1': lt['u1'], 'p': PEN['glass']})
        if ty == 'window_barricadable':
            hi = lt['opening']['y0'] > 3.0
            ops.append({'u0': lt['u0'], 'u1': lt['u1'], 'p': PEN['window'] + PEN['barricade'], 'level': lv + 1 if hi else lv})
        if ty == 'door_barricadable':
            ops.append({'u0': lt['u0'], 'u1': lt['u1'], 'p': PEN['door_ext']})
    low = [o for o in ops if o.get('level', lv) == lv]
    stamp_seg(lv, a, bb, 0.3, low, lambda o: o['p'] + 0.01)
    hi = [o for o in ops if o.get('level', lv) != lv]
    for o in hi:  # opening at the next level (grid window): punch through the F3 ledge edge
        stamp_seg(o['level'], a, bb, 0.3, [o], lambda o: o['p'])
# skybridge tube walls on F2 (portal at x=26 is in the facade); side doors at x 27.8
for side in (-1, 1):
    z = 13.5 + side * 1.5
    stamp_seg(1, (26.0, z), (56.0, z), 0.26, [{'u0': 1.2, 'u1': 2.4}], lambda o: PEN['door_ext'])
for c in L['columns']:
    fill_poly(LV['F1'], [(c['x'] - c['w'] / 2 - 0.2, c['z'] - c['d'] / 2 - 0.2), (c['x'] + c['w'] / 2 + 0.2, c['z'] - c['d'] / 2 - 0.2),
                         (c['x'] + c['w'] / 2 + 0.2, c['z'] + c['d'] / 2 + 0.2), (c['x'] - c['w'] / 2 - 0.2, c['z'] + c['d'] / 2 + 0.2)], 0)
    for lv in (1, 2):
        fill_poly(lv, [(c['x'] - c['w'] / 2 - 0.2, c['z'] - c['d'] / 2 - 0.2), (c['x'] + c['w'] / 2 + 0.2, c['z'] - c['d'] / 2 - 0.2),
                       (c['x'] + c['w'] / 2 + 0.2, c['z'] + c['d'] / 2 + 0.2), (c['x'] - c['w'] / 2 - 0.2, c['z'] + c['d'] / 2 + 0.2)], 0)
for p in L.get('props', []):
    if p['h'] >= 0.9:
        x0, z0, x1, z1 = p['box']
        fill_poly(LV[p['floor']], [(x0 - 0.2, z0 - 0.2), (x1 + 0.2, z0 - 0.2), (x1 + 0.2, z1 + 0.2), (x0 - 0.2, z1 + 0.2)], 0)
# neighbour features that block (plant room, cooling tower, stacks, hut walls, baffle, mast)
for nb in ex['neighbours']:
    lvn = {'NB_west': 0, 'NB_crane': 2, 'NB_east': 1}.get(nb['id'])
    if lvn is None: continue
    for ft in nb.get('features', []):
        if 'box' in ft and ft.get('h', 0) >= 0.9 and ft['kind'] not in ('hut_roof',):
            x0, z0, x1, z1 = ft['box']; fill_poly(lvn, [(x0, z0), (x1, z0), (x1, z1), (x0, z1)], 0)
        if ft['kind'] == 'tower_crane_mast':
            cx, cz = ft['center']; fill_poly(lvn, [(cx - 1, cz - 1), (cx + 1, cz - 1), (cx + 1, cz + 1), (cx - 1, cz + 1)], 0)
# terrace features that block
for ft in ex['terrace']['features']:
    if ft.get('h', 0) >= 0.9 and ft['kind'] not in ('rain_canopy',):
        x0, z0, x1, z1 = ft['box']; fill_poly(0, [(x0, z0), (x1, z0), (x1, z1), (x0, z1)], 0)

# vertical links: (lv, i, j) -> list of (lv2, i2, j2, cost, who)  who: 'all' | 'atk'
links = {}


def link(a, b, cost, who='all', both=True):
    links.setdefault(a, []).append((b, cost, who))
    if both: links.setdefault(b, []).append((a, cost, who))


def near_walkable(lv, x, z, allow=(1, 2)):
    i, j = cell(x, z)
    best = None
    for di in range(-4, 5):
        for dj in range(-4, 5):
            ii, jj = i + di, j + dj
            if 0 <= ii < NX and 0 <= jj < NZ and grid[lv][ii][jj] in allow:
                d = di * di + dj * dj
                if best is None or d < best[0]: best = (d, (lv, ii, jj))
    return best[1] if best else None


miss = []
for st in L['stairs']:
    fls = st['floors']
    for k in range(len(fls) - 1):
        a_lv, b_lv = LV[fls[k]], LV[fls[k + 1]]
        if st['kind'] == 'switchback':
            x0, z0, x1, z1 = st['box']
            zl = z1 - 0.8 if st['landing'] == 'south' else z0 + 0.8
            A = near_walkable(a_lv, (x0 + x1) / 2, zl, (1,)); B = near_walkable(b_lv, (x0 + x1) / 2, zl, (1,)); cost = 4.5
        elif st['kind'] == 'spiral':
            c = st['center']; A = near_walkable(a_lv, c[0], c[1] + 1.8, (1,)); B = near_walkable(b_lv, c[0], c[1] + 1.8, (1,)); cost = 4.0
        else:
            p0, p1 = st['path'][0], st['path'][-1]
            ux, uz = p1[0] - p0[0], p1[2] - p0[2]; d = math.hypot(ux, uz); ux, uz = ux / d, uz / d
            A = near_walkable(a_lv, p0[0] - ux * 0.6, p0[2] - uz * 0.6, (1,)); B = near_walkable(b_lv, p1[0] + ux * 0.6, p1[2] + uz * 0.6, (1,))
            cost = math.hypot(d, 4.2) / 3.5
        if A and B: link(A, B, cost)
        else: miss.append(st['id'])
for ld in L['ladders']:
    y = ld['y0']; prevc = None
    while y <= ld['y1'] + 1e-6:
        lv = None
        for f in L['floors']:
            if abs(f['y'] - y) < 0.01: lv = LV[f['id']]
        if ld['id'] == 'LD_bridge':
            A = near_walkable(1, ld['x'], ld['z'] - 0.8, (2,)); B = near_walkable(2, ld['x'], ld['z'] - 0.8, (2,))
            if A and B: link(A, B, 3.0, 'atk')
            break
        if lv is not None:
            c = near_walkable(lv, ld['x'], ld['z'], (1,) if ld['interior'] else (2,))
            if c and prevc: link(prevc, c, 3.2, 'all' if ld['interior'] else 'atk')
            if not c: miss.append(ld['id'])
            prevc = c
        y += 4.2
# exterior links: hoist ramp (deck -> F2 ledge), truss service stair (hall -> truss), working cradle (F2 <-> F3 ledge)
if 'hoist_ramp' in ex:
    hr = ex['hoist_ramp']
    A = near_walkable(1, hr['a'][0], hr['a'][1], (2,)); B = near_walkable(2, hr['b'][0], hr['b'][1], (2,))
    if A and B: link(A, B, seg_len(T(hr['a']), T(hr['b'])) / 4.0, 'atk')
    else: miss.append('BR_ramp')
for nb in ex['neighbours']:
    for ft in nb.get('features', []):
        if ft['kind'] == 'service_stair':
            x0, z0, x1, z1 = ft['box']
            A = near_walkable(1, (x0 + x1) / 2, (z0 + z1) / 2, (2,)); B = near_walkable(0, x0 - 0.5, (z0 + z1) / 2 - 2.5, (2,))
            if A and B: link(A, B, 4.0, 'atk')
            else: miss.append('service_stair')
if ex['cradle'].get('moving'):
    cx, cz = ex['cradle']['center']
    A = near_walkable(1, cx, cz, (2,)); B = near_walkable(2, cx, cz, (2,))
    if A and B: link(A, B, ex['cradle']['moving']['travel_s'] + 2.0, 'atk')
    else: miss.append('CR_cradle')
for h in L['hatches']:
    a_lv = LV[h['floor']]; b_lv = a_lv - 1
    A = near_walkable(a_lv, h['x'], h['z'], (1,)); B = near_walkable(b_lv, h['x'], h['z'], (1,))
    if A and B: link(A, B, 2.0, 'all', both=False)
# rappel between ledge/terrace cells at the same xz (exterior cells within 1.2 m outside the outline)
rap = 0
for i in range(NX):
    for j in range(NZ):
        p = ctr(i, j)
        if abs(p[0]) > 28 or abs(p[1]) > 28: continue
        if point_in_poly(p, outline): continue
        d = min(dist_point_seg(p, outline[k], outline[(k + 1) % len(outline)])[0] for k in range(len(outline)))
        if d > 1.2: continue
        for lv in range(len(FL) - 1):
            if grid[lv][i][j] == 2 and grid[lv + 1][i][j] == 2:
                link((lv, i, j), (lv + 1, i, j), 2.2, 'atk'); rap += 1


def dijkstra(sources, who):
    dist = {}
    pq = []
    for s in sources:
        dist[s] = 0.0; heapq.heappush(pq, (0.0, s))
    step = RES / SPEED; diag = step * math.sqrt(2)
    while pq:
        d, (lv, i, j) = heapq.heappop(pq)
        if d > dist.get((lv, i, j), 1e9): continue
        g = grid[lv]
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                if not di and not dj: continue
                ii, jj = i + di, j + dj
                if not (0 <= ii < NX and 0 <= jj < NZ): continue
                v = g[ii][jj]
                if not v or (who == 'def' and v == 2): continue
                if di and dj and (not g[i + di][j] or not g[i][j + dj]): continue
                c = d + (diag if di and dj else step) + (pen[lv].get((ii, jj), 0) * (0.5 if who == 'atk' else 0.1))
                if c < dist.get((lv, ii, jj), 1e9):
                    dist[(lv, ii, jj)] = c; heapq.heappush(pq, (c, (lv, ii, jj)))
        for (nb, cost, w) in links.get((lv, i, j), []):
            if w == 'atk' and who == 'def': continue
            c = d + cost
            if c < dist.get(nb, 1e9):
                dist[nb] = c; heapq.heappush(pq, (c, nb))
    return dist


def at(pos, allow=(1,)):
    lv = min(range(len(FL)), key=lambda k: abs(L['floors'][k]['y'] - pos[1]))
    return near_walkable(lv, pos[0], pos[2], allow)


res = {'attack': {}, 'defend': {}, 'unreachable': [], 'missing_links': miss}
objs = [(s['id'], o) for s in L['sites'] for o in s['objectives']]
for sp in L['spawns']['attackers']:
    srcs = [c for c in (at(p, (2,)) for p in sp['points']) if c]
    dist = dijkstra(srcs, 'atk')
    row = {}
    for sid, o in objs:
        c = at(o['pos']); t = dist.get(c)
        row[o['id']] = round(t, 1) if t is not None else None
    # first entry into the building (first interior cell)
    first = min((d for (lv, i, j), d in dist.items() if grid[lv][i][j] == 1), default=None)
    row['building'] = round(first, 1) if first is not None else None
    res['attack'][sp['id']] = row
    if sp['id'] == 'A1':
        reach_all = dist
for sid, o in objs:
    if not o['id'].endswith('A'): continue
    dist = dijkstra([at(o['pos'])], 'def')
    row = {}
    for sid2, o2 in objs:
        if o2['id'].endswith('A'):
            t = dist.get(at(o2['pos'])); row[o2['id'][:2]] = round(t, 1) if t is not None else None
    res['defend'][sid] = row
# interior reachability: every playable room should be reachable by attackers and defenders
dist_def = dijkstra([at([0, 4.2, 0])], 'def')
for lv in range(len(FL)):
    seen = {}
    for (i, j), rid in room_of[lv].items():
        if grid[lv][i][j]:
            seen.setdefault(rid, False)
            if (lv, i, j) in dist_def: seen[rid] = True
    for rid, ok in seen.items():
        if not ok and not rid.endswith(('shaft', 'studio_void')): res['unreachable'].append(rid)

print('attacker spawn -> objective (s), first interior cell:')
hdr = [o['id'] for _, o in objs]
print('      ' + ' '.join('%6s' % h for h in hdr) + '  building')
for k, row in res['attack'].items():
    print('%-5s ' % k + ' '.join('%6s' % row[h] for h in hdr) + '  %6s' % row['building'])
print('defender rotations, objective A to objective A (s, interior only):')
print('      ' + ' '.join('%6s' % s['id'] for s in L['sites']))
for k, row in res['defend'].items():
    print('%-5s ' % k + ' '.join('%6s' % row[s['id']] for s in L['sites']))
print('rappel links %d; missing vertical links: %s' % (rap, miss or 'none'))
print('unreachable rooms for defenders:', res['unreachable'] or 'none')
if '--json' in sys.argv:
    out = sys.argv[sys.argv.index('--json') + 1]
    json.dump(res, open(out, 'w'), indent=1)
