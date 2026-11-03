#!/usr/bin/env python3
# Checks layout.json for consistency. Usage: python3 tools/validate_layout.py [layout.json]
import json, math, os, sys
from collections import defaultdict, Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geom import (area, point_in_poly, dist_point_seg, on_polyline, seg_len, seg_point, segs_cross, poly_edges)

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'layout.json')
L = json.load(open(path))
errors, warns = [], []
def err(m): errors.append(m)
def warn(m): warns.append(m)

T = lambda p: (p[0], p[1])
outline = [T(p) for p in L['outline']]
core = [T(p) for p in L['core']['outline']]
floors = [f['id'] for f in L['floors']]
rooms = L['rooms']
walls = L['walls']
voids = L['voids']
byfloor = defaultdict(list)
for r in rooms: byfloor[r['floor']].append(r)
wallsf = defaultdict(list)
for w in walls: wallsf[w['floor']].append(w)
PLAY = ('room', 'corridor', 'core', 'stair', 'shaft')


def room_at(fl, p, kinds=None):
    for r in byfloor[fl]:
        if kinds and r['kind'] not in kinds: continue
        if point_in_poly(p, [T(q) for q in r['polygon']]): return r
    return None


def void_polys(fl):
    return [[T(q) for q in v['polygon']] for v in voids if v['floor'] == fl]


plate = abs(area(outline))
# ---- rooms tile the plate
for fl in floors:
    s = sum(abs(area([T(q) for q in r['polygon']])) for r in byfloor[fl])
    if abs(s - plate) > 0.5: err('%s: room areas %.1f != plate %.1f' % (fl, s, plate))
    rs = byfloor[fl]
    for i in range(len(rs)):
        for j in range(i + 1, len(rs)):
            a = [T(q) for q in rs[i]['polygon']]; b = [T(q) for q in rs[j]['polygon']]
            # sample grid points inside a; if strictly inside b too -> overlap
            xs = [p[0] for p in a]; zs = [p[1] for p in a]
            hit = False
            x = min(xs) + 0.25
            while x < max(xs) and not hit:
                z = min(zs) + 0.25
                while z < max(zs):
                    if point_in_poly((x, z), a) and point_in_poly((x, z), b):
                        if all(dist_point_seg((x, z), e0, e1)[0] > 0.05 for e0, e1 in poly_edges(b)) and \
                           all(dist_point_seg((x, z), e0, e1)[0] > 0.05 for e0, e1 in poly_edges(a)):
                            hit = True; break
                    z += 0.5
                x += 0.5
            if hit: err('%s: rooms overlap: %s / %s' % (fl, rs[i]['name'], rs[j]['name']))
    for r in rs:
        if r['kind'] in ('core', 'stair', 'shaft', 'solid'): continue
        for p in r['polygon']:
            if point_in_poly(T(p), core) and all(dist_point_seg(T(p), e0, e1)[0] > 0.05 for e0, e1 in poly_edges(core)):
                err('%s: room %s has a vertex inside the core' % (fl, r['name']))
        for p in r['polygon']:
            if not (point_in_poly(T(p), outline) or on_polyline(T(p), outline)):
                err('%s: room %s vertex %s outside the plate' % (fl, r['name'], p))

# ---- walls
def on_any_wall(fl, p, skip=None, tol=0.02):
    for w in wallsf[fl]:
        if w is skip: continue
        if dist_point_seg(p, T(w['a']), T(w['b']))[0] <= tol: return True
    return False


def in_column(p, pad=0.0):
    for c in L['columns']:
        if abs(p[0] - c['x']) <= c['w'] / 2 + pad and abs(p[1] - c['z']) <= c['d'] / 2 + pad: return c
    return None


walk = defaultdict(list)
for wk in L.get('walkways', []): walk[wk['floor']].append([T(q) for q in wk['polygon']])

for w in walls:
    fl = w['floor']; a, b = T(w['a']), T(w['b'])
    Lw = seg_len(a, b)
    if abs(Lw - w['length']) > 0.01: err('%s length mismatch' % w['id'])
    if not w.get('freestanding'):
        for p in (a, b):
            ok = on_any_wall(fl, p, w) or on_polyline(p, outline) or on_polyline(p, core) or \
                 any(on_polyline(p, vp) for vp in void_polys(fl)) or in_column(p, 0.02)
            if not ok: err('%s %s: endpoint %s is loose' % (fl, w['id'], p))
    if not w.get('core'):
        for k in range(1, 20):
            p = seg_point(a, b, Lw * k / 20)
            if point_in_poly(p, core) and all(dist_point_seg(p, e0, e1)[0] > 0.31 for e0, e1 in poly_edges(core)):
                err('%s %s passes through the core' % (fl, w['id'])); break
    if not w.get('column_wrap') and not w.get('core'):
        for k in range(0, 41):
            p = seg_point(a, b, Lw * k / 40)
            c = in_column(p, -0.02)
            if c: err('%s %s runs into column %s at %s' % (fl, w['id'], c['id'], tuple(round(v, 2) for v in p))); break
    for o in w['openings']:
        for k in range(0, 11):
            p = seg_point(a, b, o['u0'] + (o['u1'] - o['u0']) * k / 10)
            c = in_column(p, 0.05)
            if c: err('%s %s opening %s is behind column %s' % (fl, w['id'], o['id'], c['id'])); break
    ops = sorted(w['openings'], key=lambda o: o['u0'])
    for o in ops:
        if o['u0'] < 0.1 - 1e-6 or o['u1'] > Lw - 0.1 + 1e-6:
            err('%s %s: opening %s [%.2f, %.2f] not inside wall (len %.2f)' % (fl, w['id'], o['id'], o['u0'], o['u1'], Lw))
    for i in range(len(ops) - 1):
        if ops[i]['u1'] > ops[i + 1]['u0'] - 0.2: err('%s %s: openings %s and %s overlap or touch' % (fl, w['id'], ops[i]['id'], ops[i + 1]['id']))
    if w['type'] == 'reinforceable':
        ps = w['reinforce']['panels']
        if ps[0]['u0'] < -1e-6 or ps[-1]['u1'] > Lw + 1e-6: err('%s reinforce units outside the wall' % w['id'])
        for p in ps:
            if abs((p['u1'] - p['u0']) - L['rules']['reinforce']['sizes'][p['size']]) > 1e-3: err('%s unit %s has the wrong width' % (w['id'], p['size']))
    for w2 in wallsf[fl]:
        if w2 is w or w2['id'] < w['id']: continue
        if segs_cross(a, b, T(w2['a']), T(w2['b'])): err('%s: walls cross: %s x %s' % (fl, w['id'], w2['id']))
        # collinear overlap
        a2, b2 = T(w2['a']), T(w2['b'])
        if dist_point_seg(a2, a, b)[0] < 0.01 and dist_point_seg(b2, a, b)[0] < 0.01:
            m = ((a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2)
            if dist_point_seg(m, a, b)[0] < 0.01 and seg_len(a2, b2) > 0.01:
                if not (seg_len(m, a) < 1e-6 or seg_len(m, b) < 1e-6):
                    ins = min(seg_len(a2, a), seg_len(a2, b)) > 0.01 or min(seg_len(b2, a), seg_len(b2, b)) > 0.01
                    if ins and dist_point_seg(m, a, b)[0] < 0.01 and 0.01 < seg_len(a, m) < Lw - 0.01:
                        err('%s: walls overlap: %s / %s' % (fl, w['id'], w2['id']))

# ---- room edges covered by walls / facade / core / void edges
for r in rooms:
    if r['kind'] in ('solid', 'void'): continue
    fl = r['floor']
    for e0, e1 in poly_edges([T(q) for q in r['polygon']]):
        n = max(2, int(seg_len(e0, e1) / 0.25))
        bad = []
        for k in range(n + 1):
            p = seg_point(e0, e1, seg_len(e0, e1) * k / n)
            if on_any_wall(fl, p) or on_polyline(p, outline) or on_polyline(p, core) or any(on_polyline(p, vp) for vp in void_polys(fl)) or in_column(p):
                continue
            bad.append(p)
        if bad: err('%s room %s: edge %s-%s not closed (%d samples)' % (fl, r['name'], e0, e1, len(bad)))

# ---- connectivity per floor (doors, openings, open walls, gaps) + stairs
adj = defaultdict(set)
def side_rooms(w, u):
    a, b = T(w['a']), T(w['b']); Lw = seg_len(a, b)
    p = seg_point(a, b, u)
    nx, nz = -(b[1] - a[1]) / Lw, (b[0] - a[0]) / Lw
    r1 = room_at(w['floor'], (p[0] + nx * 0.4, p[1] + nz * 0.4))
    r2 = room_at(w['floor'], (p[0] - nx * 0.4, p[1] - nz * 0.4))
    return r1, r2
for w in walls:
    links = []
    if w['type'] == 'open': links.append(w['length'] / 2)
    for o in w['openings']:
        if o['kind'] == 'lift_door' or True: links.append((o['u0'] + o['u1']) / 2)
    for u in links:
        r1, r2 = side_rooms(w, u)
        if r1 and r2:
            adj[r1['id']].add(r2['id']); adj[r2['id']].add(r1['id'])
        elif w['type'] != 'balustrade':
            warn('%s %s: opening at u=%.2f has a room only on one side' % (w['floor'], w['id'], u))
# void-side: balustrade rooms are joined with the void room
for st in L['stairs']:
    if st['kind'] == 'switchback':
        ids = ['%s_%s' % (f, st['name'].lower().replace(' ', '_')) for f in st['floors']]
    elif st['kind'] == 'spiral':
        c = st['center']; ids = [room_at(f, (c[0], c[1]), PLAY)['id'] for f in st['floors']]
    else:
        p0, p1 = st['path'][0], st['path'][-1]
        r0 = room_at(st['floors'][0], (p0[0], p0[2]), PLAY); r1 = room_at(st['floors'][-1], (p1[0], p1[2] + (0 if st['id'] != 'ST_garden' else -0.6)), PLAY)
        if st['id'] == 'ST_studio':
            r1 = {'id': 'F3_studio_void'}
        if not r0 or not r1: err('stair %s ends not in rooms' % st['id']); continue
        ids = [r0['id'], r1['id']]
    for i in range(len(ids) - 1):
        adj[ids[i]].add(ids[i + 1]); adj[ids[i + 1]].add(ids[i])
# grid catwalks join Control Room and Archive via the void
for a_, b_ in (('F3_studio_void', 'F3_control_room'), ('F3_studio_void', 'F3_archive')):
    adj[a_].add(b_); adj[b_].add(a_)
adj['F1_shaft'] |= {'F2_shaft'}; adj['F2_shaft'] |= {'F1_shaft', 'F3_shaft'}; adj['F3_shaft'] |= {'F2_shaft'}
seen = set(); todo = [r['id'] for r in rooms if r['floor'] == 'F2' and r['kind'] == 'core'][:1]
while todo:
    x = todo.pop()
    if x in seen: continue
    seen.add(x); todo.extend(adj[x])
for r in rooms:
    if r['kind'] in PLAY and r['id'] not in seen: err('room %s (%s) unreachable' % (r['name'], r['floor']))
    if r['kind'] in ('room', 'corridor') and len(adj[r['id']]) < 2 and r['id'] in seen:
        warn('room %s (%s) has a single way in' % (r['name'], r['floor']))

# ---- hatches / patches
for h in L['hatches'] + L['floor_patches']:
    fl = h['floor']; p = (h['x'], h['z'])
    if not h['top_room'] or not h['bottom_room']: err('%s not over two rooms' % h['id'])
    half = h.get('size', h.get('w', 1.2)) / 2
    for w in wallsf[fl] + wallsf[{'F2': 'F1', 'F3': 'F2'}[fl]]:
        if w['type'] == 'open': continue
        d = dist_point_seg(p, T(w['a']), T(w['b']))[0]
        if d < half + w['thickness'] / 2 + 0.15: err('%s too close to wall %s (%.2f m)' % (h['id'], w['id'], d))
    for vp in void_polys(fl):
        if point_in_poly(p, vp): err('%s in a void' % h['id'])
    for so in L['slab_openings']:
        if so['floor'] in (fl, 'all') and point_in_poly(p, [T(q) for q in so['polygon']]): err('%s in slab opening %s' % (h['id'], so['id']))

# ---- props, objectives, spawns
def blocked_by_prop(fl, p, pad=0.0):
    for pr in L.get('props', []):
        if pr['floor'] != fl or pr['h'] < 0.9: continue
        x0, z0, x1, z1 = pr['box']
        if x0 - pad <= p[0] <= x1 + pad and z0 - pad <= p[1] <= z1 + pad: return pr['id']
    return None
for pr in L.get('props', []):
    fl = pr['floor']; x0, z0, x1, z1 = pr['box']
    if not pr['room']: err('prop %s not in a room' % pr['id'])
    for q in ((x0, z0), (x1, z0), (x1, z1), (x0, z1)):
        if not point_in_poly(q, outline): err('prop %s corner %s outside the plate' % (pr['id'], q))
    for c in L['columns']:
        if x0 < c['x'] + c['w'] / 2 and x1 > c['x'] - c['w'] / 2 and z0 < c['z'] + c['d'] / 2 and z1 > c['z'] - c['d'] / 2:
            err('prop %s hits column %s' % (pr['id'], c['id']))
    for st in L['stairs']:
        if st['kind'] == 'spiral' and fl in st['floors']:
            cx, cz = st['center']; r = st['radius'] + 0.3
            if x0 - r < cx < x1 + r and z0 - r < cz < z1 + r: err('prop %s hits %s' % (pr['id'], st['id']))
        if st['kind'] == 'straight' and fl == st['floors'][0]:
            p0, p1 = st['path'][0], st['path'][-1]
            for k in range(11):
                q = (p0[0] + (p1[0] - p0[0]) * k / 10, p0[2] + (p1[2] - p0[2]) * k / 10)
                if x0 - st['width'] / 2 < q[0] < x1 + st['width'] / 2 and z0 - st['width'] / 2 < q[1] < z1 + st['width'] / 2:
                    err('prop %s hits %s' % (pr['id'], st['id'])); break
    for w in wallsf[fl]:
        if w['type'] == 'open': continue
        a, b = T(w['a']), T(w['b'])
        for q in ((x0, z0), (x1, z0), (x1, z1), (x0, z1), ((x0 + x1) / 2, (z0 + z1) / 2)):
            if dist_point_seg(q, a, b)[0] < w['thickness'] / 2 + 0.05:
                err('prop %s touches wall %s' % (pr['id'], w['id'])); break
    for h in L['hatches'] + L['floor_patches']:
        hh = (h.get('size') or h.get('w')) / 2 + 0.1
        if h['floor'] == fl and x0 - hh < h['x'] < x1 + hh and z0 - hh < h['z'] < z1 + hh:
            err('prop %s covers %s' % (pr['id'], h['id']))
FLY = {f['id']: f['y'] for f in L['floors']}
def floor_of_y(y):
    return min(FLY, key=lambda k: abs(FLY[k] - y))
for s in L['sites']:
    for o in s['objectives']:
        fl = floor_of_y(o['pos'][1]); r = room_at(fl, (o['pos'][0], o['pos'][2]))
        if not r or r['id'] != o['room']: err('objective %s not in %s' % (o['id'], o['room']))
        if blocked_by_prop(fl, (o['pos'][0], o['pos'][2]), 0.4): err('objective %s inside a prop' % o['id'])
for sp in L['spawns']['defenders']:
    site = [s for s in L['sites'] if s['id'] == sp['site']][0]
    for p in sp['points']:
        r = room_at(sp['floor'], (p[0], p[2]))
        if not r or r['id'] not in site['rooms']: err('defender spawn %s point %s outside its site' % (sp['id'], p))
        if blocked_by_prop(sp['floor'], (p[0], p[2]), 0.3): err('defender spawn %s point %s in a prop' % (sp['id'], p))
for c in L['cover']:
    if not room_at(c['floor'], (c['x'], c['z'])) and not point_in_poly((c['x'], c['z']), [T(q) for q in L['exterior']['terrace']['polygon']]) and abs(c['x']) < 26:
        warn('cover %s outside rooms' % c['id'])
    if blocked_by_prop(c['floor'], (c['x'], c['z']), 0.2): err('cover %s inside a prop' % c['id'])
for w in walls:
    if w['type'] == 'reinforceable' and w['reinforce'].get('defender_side') == 'either':
        warn('reinforceable %s has no site side' % w['id'])

# ---- facade
for b in L['facade']['bays']:
    if b['kind'] == 'glass':
        if abs(b['lites'][-1]['u1'] - b['width']) > 1e-3 or b['lites'][0]['u0'] != 0: err('bay %s lites do not cover the bay' % b['id'])
    if not b['room']: err('bay %s has no room behind it' % b['id'])

# ---- facade entries: clear of columns, double doors not split by a mullion
from facade_clear import entry_clear, entries
for bay, name, u0, u1 in entries(L):
    c = entry_clear(L, bay, u0, u1)
    if c < 1.2 - 1e-6: err('facade entry %s (%s) has only %.2f m clear behind a column' % (name, bay['room'], c))
    if name.endswith('_opening') and len(bay.get('lites', [])) != 1 and u0 < bay['width'] / 2 < u1 and not bay.get('omit_mullion'):
        err('facade opening %s straddles the centre mullion without omit_mullion' % name)

# ---- reinforcement: units on a clear face, trims, no clashes, budget per site
RF = L['rules']['reinforce']; BAND, TRIM, BUDGET = RF['band'], RF['trim'], RF['budget']


def wrect(w):
    a, b = w['a'], w['b']; h = w['thickness'] / 2
    hz = abs(a[1] - b[1]) < 1e-6
    return (min(a[0], b[0]) - (0 if hz else h), min(a[1], b[1]) - (h if hz else 0), max(a[0], b[0]) + (0 if hz else h), max(a[1], b[1]) + (h if hz else 0))


def band(w, u0, u1, depth=BAND):
    a, b = w['a'], w['b']; Lw = w['length']; nx, nz = w['n']
    sg = 1 if w['reinforce']['defender_side'] == 'pos' else -1
    pts = []
    for u in (u0, u1):
        px, pz = a[0] + (b[0] - a[0]) * u / Lw, a[1] + (b[1] - a[1]) * u / Lw
        for t in (w['thickness'] / 2 + 0.005, w['thickness'] / 2 + depth):
            pts.append((px + sg * nx * t, pz + sg * nz * t))
    return (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))


def boxhit(r, s, eps=1e-4):
    return min(r[2], s[2]) - max(r[0], s[0]) > eps and min(r[3], s[3]) - max(r[1], s[1]) > eps


bands = []
for w in walls:
    if w['type'] != 'reinforceable': continue
    rf = w['reinforce']
    if rf.get('defender_side') not in ('pos', 'neg'): continue
    ps = rf['panels']
    run = band(w, ps[0]['u0'] - TRIM, ps[-1]['u1'] + TRIM)
    for o in wallsf[w['floor']]:
        if o is w or o['type'] == 'open': continue
        if boxhit(run, wrect(o)): err('%s units (with %.2f m trims) clash with wall %s' % (w['id'], TRIM, o['id']))
    for c in L['columns']:
        if boxhit(run, (c['x'] - c['w'] / 2, c['z'] - c['d'] / 2, c['x'] + c['w'] / 2, c['z'] + c['d'] / 2)): err('%s units clash with column %s' % (w['id'], c['id']))
    for pl in L.get('pilasters', []):
        if pl['floor'] == w['floor'] and boxhit(band(w, ps[0]['u0'], ps[-1]['u1']), (pl['x'] - pl['w'] / 2, pl['z'] - pl['d'] / 2, pl['x'] + pl['w'] / 2, pl['z'] + pl['d'] / 2)):
            err('%s units clash with pilaster %s' % (w['id'], pl['id']))
    for pr in L.get('props', []):
        if pr['floor'] == w['floor'] and pr['h'] > 0 and boxhit(band(w, ps[0]['u0'], ps[-1]['u1']), tuple(pr['box'])):
            err('%s units clash with prop %s' % (w['id'], pr['id']))
    bands.append((w, band(w, ps[0]['u0'], ps[-1]['u1'])))
for i in range(len(bands)):
    for j in range(i + 1, len(bands)):
        (w1, b1), (w2, b2) = bands[i], bands[j]
        if w1['floor'] == w2['floor'] and boxhit(b1, b2): err('deployed units of %s and %s collide' % (w1['id'], w2['id']))
budget_report = []
for s in L['sites']:
    units = sum(len(w['reinforce']['panels']) for w in walls if w['type'] == 'reinforceable' and w['reinforce'].get('site') == s['id'])
    hs = [h['id'] for h in L['hatches'] if (h['reinforce_from'] == 'below' and h['bottom_room'] in s['rooms']) or
          (h['reinforce_from'] == 'above' and h['top_room'] in s['rooms'])]
    cand = units + len(hs)
    budget_report.append('%s candidates %d (wall units %d + hatches %s) vs budget %d' % (s['id'], cand, units, hs, BUDGET))
    if cand < BUDGET + 2: err('site %s has %d reinforcement candidates; needs at least budget + 2 = %d' % (s['id'], cand, BUDGET + 2))
    if cand > BUDGET + 6: warn('site %s has %d candidates (budget %d): maybe too many' % (s['id'], cand, BUDGET))
SITE_OF = {rid: s['id'] for s in L['sites'] for rid in s['rooms']}
for h in L['hatches']:
    if h.get('reinforce_from') not in ('above', 'below'): err('%s has no reinforce_from' % h['id'])
    elif h['reinforce_from'] == 'below' and h['bottom_room'] not in SITE_OF: warn('%s is reinforced from below but the room below is not a site' % h['id'])

# ---- prop clearances: door aprons, facade entries, stairs
APRON, APRON_EXT = 1.0, 1.5
aprons = []
for w in walls:
    a, b = T(w['a']), T(w['b']); Lw = w['length']; nx, nz = w['n']
    for o in w['openings']:
        if o['kind'] == 'gap': continue
        p0, p1 = seg_point(a, b, o['u0']), seg_point(a, b, o['u1'])
        pts = [(p[0] + nx * s * APRON, p[1] + nz * s * APRON) for p in (p0, p1) for s in (-1, 1)]
        aprons.append((w['floor'], o['id'], (min(q[0] for q in pts), min(q[1] for q in pts), max(q[0] for q in pts), max(q[1] for q in pts))))
for bay, name, u0, u1 in entries(L):
    a, b = T(bay['a']), T(bay['b']); Lb = seg_len(a, b); nx, nz = -(b[1] - a[1]) / Lb, (b[0] - a[0]) / Lb
    p0, p1 = seg_point(a, b, u0), seg_point(a, b, u1)
    pts = [p0, p1, (p0[0] + nx * APRON_EXT, p0[1] + nz * APRON_EXT), (p1[0] + nx * APRON_EXT, p1[1] + nz * APRON_EXT)]
    aprons.append((bay['floor'], name, (min(q[0] for q in pts), min(q[1] for q in pts), max(q[0] for q in pts), max(q[1] for q in pts))))
for pr in L.get('props', []):
    if pr['h'] <= 0.0: continue
    for fl, oid, ap in aprons:
        if fl == pr['floor'] and boxhit(ap, tuple(pr['box'])): err('prop %s (%s) blocks the approach to %s' % (pr['id'], pr['kind'], oid))
    for st in L['stairs']:
        if st['kind'] != 'straight': continue
        for k in range(len(st['path']) - 1):
            p0, p1 = st['path'][k], st['path'][k + 1]
            hw = st['width'] / 2 + 0.2
            fl_ = floor_of_y(p0[1]) if False else None
        p0, p1 = st['path'][0], st['path'][-1]
        ux, uz = p1[0] - p0[0], p1[2] - p0[2]; d = math.hypot(ux, uz); ux, uz = ux / d, uz / d
        for (pt, sgn, fl_) in ((p0, -1, st['floors'][0]), (p1, 1, st['floors'][-1])):
            if fl_ != pr['floor']: continue
            q = (pt[0] + ux * sgn * 1.5, pt[2] + uz * sgn * 1.5)
            box = (min(pt[0], q[0]) - st['width'] / 2, min(pt[2], q[1]) - st['width'] / 2, max(pt[0], q[0]) + st['width'] / 2, max(pt[2], q[1]) + st['width'] / 2)
            if boxhit(box, tuple(pr['box'])): err('prop %s blocks the end of %s' % (pr['id'], st['id']))

# ---- spawn peeks and long door chains
import spawn_los, door_lines
los_hits = spawn_los.check(L)
for hname, room, sid, pt, d in los_hits: err('spawn peek: %s (%s) sees %s point %s at %.0f m' % (hname, room, sid, pt, d))
chains = door_lines.check(L)
for (fl, ln, p, q, ids, kind, sev) in chains:
    msg = '%s %s door chain %.1f m %s -> %s through %s' % (fl, kind, ln, p, q, ', '.join(ids))
    (err if sev == 'error' else warn)(msg)

# ---- sites
wall_types_by_room = defaultdict(Counter)
for w in walls:
    if w['type'] == 'open': continue
    for k in range(1, 4):
        r1, r2 = side_rooms(w, w['length'] * k / 4)
        for r in (r1, r2):
            if r: wall_types_by_room[r['id']][w['type']] += 1
site_report = []
for s in L['sites']:
    mix = Counter()
    for rid in s['rooms']:
        mix.update({k: 1 for k in wall_types_by_room[rid]})
    vert = [h['id'] for h in L['hatches'] + L['floor_patches'] if h['top_room'] in s['rooms'] or h['bottom_room'] in s['rooms']]
    ext = [b['id'] for b in L['facade']['bays'] if b['room'] in s['rooms'] and any(l['type'] in ('window_barricadable', 'glass_breakable') for l in b.get('lites', []))]
    for need in ('reinforceable', 'soft', 'hard'):
        if not mix[need]: err('site %s lacks a %s wall' % (s['id'], need))
    if not vert: err('site %s has no hatch or soft floor above/below' % s['id'])
    site_report.append('%s %-28s walls:%s vertical:%s exterior bays:%d' % (s['id'], s['name'], dict(mix), vert, len(ext)))

# ---- counts
cnt = Counter()
for w in walls:
    if w['type'] != 'open': cnt['wall_' + w['type']] += 1
    cnt['wall_m_' + w['type']] += w['length']
    for o in w['openings']:
        if o['kind'] in ('door', 'double_door'): cnt['door_barricadable' if o['barricadable'] else 'door_open'] += 1
        elif o['kind'] == 'window': cnt['window_barricadable'] += 1
        elif o['kind'] != 'gap': cnt['opening_' + o['kind']] += 1
    if w['type'] == 'reinforceable':
        for p in w['reinforce']['panels']: cnt['panel_' + p['size']] += 1
for b in L['facade']['bays']:
    if b['kind'] == 'portal': cnt['facade_portal'] += 1
    for l in b.get('lites', []): cnt['lite_' + l['type']] += 1
    if b.get('opening'): cnt['facade_double_door'] += 1
cnt['hatch'] = len(L['hatches']); cnt['soft_floor'] = len(L['floor_patches'])
cnt['pilaster'] = len(L.get('pilasters', [])); cnt['column_wrap'] = sum(1 for w in walls if w.get('column_wrap'))
cnt['prop'] = len(L['props']); cnt['spawn_peeks'] = len(los_hits)

print('== %s' % path)
for s in site_report: print(s)
for s in budget_report: print(s)
print('counts:', ', '.join('%s=%s' % (k, round(v, 1) if isinstance(v, float) else v) for k, v in sorted(cnt.items())))
for w_ in warns: print('WARN', w_)
for e in errors: print('ERROR', e)
print('%d errors, %d warnings' % (len(errors), len(warns)))
sys.exit(1 if errors else 0)
