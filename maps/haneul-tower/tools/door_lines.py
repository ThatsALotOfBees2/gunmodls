# Long sightlines through chains of doors (all barricades broken, interior glass and rails see-through).
# Flags straight lines longer than MAXLEN that pass through two or more wall openings.
import math

MAXLEN = 30.0      # chains longer than this are reported (warnings)
MAXLEN_ANY = 40.0  # chains longer than this are errors
AXIAL_DEG = 12.0
OPEN_KINDS = ('door', 'double_door', 'opening', 'window', 'vault', 'lift_door')


def floor_geom(L, fl):
    opaque, gaps = [], []
    for w in L['walls']:
        if w['floor'] != fl or w['type'] in ('open',): continue
        a, b = w['a'], w['b']; ln = w['length']
        P = lambda u: (a[0] + (b[0] - a[0]) * u / ln, a[1] + (b[1] - a[1]) * u / ln)
        ops = sorted((o['u0'], o['u1'], o['id']) for o in w['openings'] if o['kind'] in OPEN_KINDS)
        for (u0, u1, oid) in ops: gaps.append((P(u0), P(u1), oid))
        if w['type'] in ('glass', 'balustrade'): continue
        u = 0.0
        for (u0, u1, _) in ops + [(ln, ln, None)]:
            if u0 > u + 1e-6: opaque.append((P(u), P(u0)))
            u = max(u, u1)
    o = L['outline']
    for i in range(len(o)): opaque.append((tuple(o[i]), tuple(o[(i + 1) % len(o)])))
    boxes = [(c['x'] - c['w'] / 2, c['z'] - c['d'] / 2, c['x'] + c['w'] / 2, c['z'] + c['d'] / 2) for c in L['columns']]
    boxes += [tuple(p['box']) for p in L['props'] if p['floor'] == fl and p['h'] >= 1.7]
    boxes += [(p['x'] - p['w'] / 2, p['z'] - p['d'] / 2, p['x'] + p['w'] / 2, p['z'] + p['d'] / 2) for p in L.get('pilasters', []) if p['floor'] == fl]
    for (x0, z0, x1, z1) in boxes:
        opaque += [((x0, z0), (x1, z0)), ((x1, z0), (x1, z1)), ((x1, z1), (x0, z1)), ((x0, z1), (x0, z0))]
    return opaque, gaps


import numpy as np


def rays(P, D, A, B, maxd=80.0):
    # distance along each direction D[k] from P to the nearest segment A[i]-B[i]
    E = B - A                                   # (n, 2)
    den = D[:, None, 0] * E[None, :, 1] - D[:, None, 1] * E[None, :, 0]   # (k, n)
    AP = A - P                                  # (n, 2)
    with np.errstate(divide='ignore', invalid='ignore'):
        t = (AP[None, :, 0] * E[None, :, 1] - AP[None, :, 1] * E[None, :, 0]) / den
        s = (AP[None, :, 0] * D[:, None, 1] - AP[None, :, 1] * D[:, None, 0]) / den
    ok = (np.abs(den) > 1e-9) & (t > 1e-6) & (s >= -1e-6) & (s <= 1 + 1e-6)
    t = np.where(ok, t, maxd)
    return np.minimum(t.min(axis=1), maxd)


def crosses(p, q, a, b):
    def orient(u, v, w): return (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0])
    return orient(p, q, a) * orient(p, q, b) < 0 and orient(a, b, p) * orient(a, b, q) < 0


def in_poly(x, z, P):
    ins = False
    for i in range(len(P)):
        x1, z1 = P[i]; x2, z2 = P[(i + 1) % len(P)]
        if (z1 > z) != (z2 > z) and x < x1 + (z - z1) * (x2 - x1) / (z2 - z1): ins = not ins
    return ins


WIDE = 0.25   # the line must stay clear when shifted this far to either side (a body-width lane, not a pinhole)


def check(L, step=1.0, dang=2):
    out = []
    ang = np.radians(np.arange(0, 180, dang)); D = np.stack([np.cos(ang), np.sin(ang)], 1)
    N = np.stack([-D[:, 1], D[:, 0]], 1)
    for fl in [f['id'] for f in L['floors']]:
        S, G = floor_geom(L, fl)
        A = np.array([s[0] for s in S], float); B = np.array([s[1] for s in S], float)
        rooms = [r for r in L['rooms'] if r['floor'] == fl and r['kind'] in ('room', 'corridor', 'core', 'void')]
        found = {}
        for x in np.arange(-25.5, 26, step):
            for z in np.arange(-25.5, 26, step):
                if not any(in_poly(x, z, r['polygon']) for r in rooms): continue
                P = np.array([x, z])
                t1 = rays(P, D, A, B); t2 = rays(P, -D, A, B)
                cand = np.where((t1 + t2 > MAXLEN) & (t1 < 79) & (t2 < 79))[0]
                for k in cand:
                    d = D[k]; n = N[k]
                    p = (x - d[0] * t2[k], z - d[1] * t2[k]); q = (x + d[0] * t1[k], z + d[1] * t1[k])
                    ids = tuple(sorted(g[2] for g in G if crosses(p, q, g[0], g[1])))
                    if len(ids) < 2: continue
                    wide = True
                    for o in (-WIDE, WIDE):
                        P2 = P + n * o
                        a1 = rays(P2, d[None], A, B)[0]; a2 = rays(P2, -d[None], A, B)[0]
                        if a1 + a2 < MAXLEN: wide = False; break
                    if not wide: continue
                    ln = float(t1[k] + t2[k])
                    if ids not in found or found[ids][0] < ln:
                        found[ids] = (round(ln, 1), (round(p[0], 1), round(p[1], 1)), (round(q[0], 1), round(q[1], 1)))
        keys = sorted(found, key=lambda k: -found[k][0])
        kept = []
        for k in keys:
            if any(set(k) <= set(k2) for k2 in kept): continue
            kept.append(k)
        for k in kept:
            ln, p, q = found[k]
            ang = math.degrees(math.atan2(abs(q[1] - p[1]), abs(q[0] - p[0])))
            axial = min(ang, 90 - ang) <= AXIAL_DEG
            sev = 'error' if ln > MAXLEN_ANY else 'warn'
            out.append((fl, ln, (float(p[0]), float(p[1])), (float(q[0]), float(q[1])), k, 'axial' if axial else 'diagonal', sev))
    return out


if __name__ == '__main__':
    import json, sys
    L = json.load(open(sys.argv[1]))
    r = check(L)
    for x in sorted(r, key=lambda x: (x[6], x[0], -x[1])): print(x)
    print(sum(1 for x in r if x[6] == 'error'), 'errors,', sum(1 for x in r if x[6] == 'warn'), 'warnings')
