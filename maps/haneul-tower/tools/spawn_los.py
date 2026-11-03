# Spawn-peek check: can a defender standing just inside a shootable facade opening see an attacker spawn point?
# Eye 1.6 m above the floor (and 5.0 m in double-height bays), 0.4 m inside the glass; spawn eyes at 1.0 and 1.7 m.
# Tempered glass (the skybridge tube) is see-through but not shoot-through, so lines through it do not count.
import math

SHOOT = ('window_barricadable', 'door_barricadable', 'glass_breakable')


def seg_box(p, q, b):
    x0, z0, x1, z1, y0, y1 = b[:6]
    t0, t1 = 0.0, 1.0
    for i, (lo, hi) in zip((0, 2, 1), ((x0, x1), (z0, z1), (y0, y1))):
        d = q[i] - p[i]
        if abs(d) < 1e-9:
            if p[i] < lo or p[i] > hi: return False
        else:
            a = (lo - p[i]) / d; c = (hi - p[i]) / d
            if a > c: a, c = c, a
            t0 = max(t0, a); t1 = min(t1, c)
            if t0 > t1: return False
    return True


def blockers(L):
    E = L['exterior']; out = []
    for f in E['terrace']['features']:
        if f['kind'] == 'rain_canopy': out.append((*f['box'], f['h'] - 0.4, f['h'], 'canopy_roof'))
        elif f.get('h', 0) >= 1.0: out.append((*f['box'], 0.0, f['h'], f['kind']))
    for nb in E['neighbours']:
        base = nb['top_y']
        if nb['id'] == 'NB_east': continue
        for f in nb.get('features', []):
            if 'box' in f:
                y0 = base + f['h'] - 0.2 if f['kind'] == 'hut_roof' else base
                out.append((*f['box'], y0, base + f['h'], f['kind']))
            elif f['kind'] == 'tower_crane_mast':
                c = f['center']; out.append((c[0] - 1, c[1] - 1, c[0] + 1, c[1] + 1, base, base + f['h'], 'mast'))
        if nb['id'] != 'NB_lowerblock':
            xs = [p[0] for p in nb['footprint']]; zs = [p[1] for p in nb['footprint']]
            out.append((min(xs), min(zs), max(xs), max(zs), -400, base - 0.01, nb['id'] + '_mass'))
    return out


def east_tower(L):
    nb = [n for n in L['exterior']['neighbours'] if n['id'] == 'NB_east'][0]
    xs = [p[0] for p in nb['footprint']]; zs = [p[1] for p in nb['footprint']]
    baffles = [(*f['box'], f['y0'], f['y0'] + f['h']) for f in nb.get('features', []) if f['kind'] == 'baffle']
    sb = L['exterior']['skybridge']
    mouth = (sb['a'][1] - sb['width'] / 2, sb['a'][1] + sb['width'] / 2, sb['y'], sb['roof_y'] - 0.2)
    return (min(xs), min(zs), max(xs), max(zs)), baffles, mouth


def east_blocked(p, q, et):
    (x0, z0, x1, z1), baffles, (mz0, mz1, my0, my1) = et
    if not seg_box(p, q, (x0, z0, x1, z1, -400, 400)): return False
    if p[0] >= x0 or q[0] <= x0: return True  # only lines entering from the west face can pass the mouth
    t = (x0 - p[0]) / (q[0] - p[0])
    y = p[1] + (q[1] - p[1]) * t; z = p[2] + (q[2] - p[2]) * t
    if not (mz0 <= z <= mz1 and my0 <= y <= my1): return True
    e = (x0, y, z)
    return any(seg_box(e, q, b) for b in baffles)


def tube_glass(p, q, L):
    sb = L['exterior']['skybridge']
    zc = sb['a'][1]; hw = sb['width'] / 2
    b = (sb['a'][0], zc - hw, sb['b'][0], zc + hw, sb['y'], sb['roof_y'])
    if not seg_box(p, q, b): return False

    def inmouth(x):
        if abs(q[0] - p[0]) < 1e-9: return False
        t = (x - p[0]) / (q[0] - p[0])
        if not (0 <= t <= 1): return None
        y = p[1] + (q[1] - p[1]) * t; z = p[2] + (q[2] - p[2]) * t
        return zc - hw <= z <= zc + hw and sb['y'] <= y <= sb['roof_y'] - 0.2
    m0 = inmouth(sb['a'][0]); m1 = inmouth(sb['b'][0])
    return not (m0 and (m1 or m1 is None))


def viewpoints(L):
    FY = {f['id']: f['y'] for f in L['floors']}
    for b in L['facade']['bays']:
        a = b['a']; bb = b['b']; dx = bb[0] - a[0]; dz = bb[1] - a[1]; ln = math.hypot(dx, dz)
        n_in = (-dz / ln, dx / ln); fy = FY[b['floor']]
        spans = [(l['u0'], l['u1'], '%s_%d' % (b['id'], k), l['type']) for k, l in enumerate(b.get('lites', [])) if l['type'] in SHOOT]
        if b.get('opening'): spans.append((b['opening']['u0'], b['opening']['u1'], b['id'] + '_opening', 'door_barricadable'))
        for (u0, u1, name, ty) in spans:
            eyes = []
            for su in (0.2, 0.5, 0.8):
                u = u0 + (u1 - u0) * su
                gx = a[0] + dx * u / ln; gz = a[1] + dz * u / ln
                for ey in (fy + 1.6,) + ((fy + 5.0,) if b.get('double_height') else ()):
                    eyes.append((gx + n_in[0] * 0.4, ey, gz + n_in[1] * 0.4))
            yield name, b, n_in, eyes


def check(L):
    bl = blockers(L); et = east_tower(L)
    hits = []
    for name, b, n_in, eyes in viewpoints(L):
        for sp in L['spawns']['attackers']:
            for pt in sp['points']:
                seen = False
                for p in eyes:
                    for py in (pt[1] + 1.0, pt[1] + 1.7):
                        q = (pt[0], py, pt[2])
                        if (q[0] - p[0]) * n_in[0] + (q[2] - p[2]) * n_in[1] >= -0.05: continue
                        if any(seg_box(p, q, bx) for bx in bl): continue
                        if east_blocked(p, q, et): continue
                        if tube_glass(p, q, L): continue
                        seen = True; break
                    if seen: break
                if seen:
                    hits.append((name, b['room'], sp['id'], pt, round(math.hypot(pt[0] - eyes[0][0], pt[2] - eyes[0][2]), 1)))
    return hits


if __name__ == '__main__':
    import json, sys
    L = json.load(open(sys.argv[1]))
    h = check(L)
    for x in h: print(x)
    print(len(h), 'visible spawn points')
