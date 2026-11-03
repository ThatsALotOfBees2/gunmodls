# Clear width of facade entry openings after columns (shared by the validator).
import math


def entry_clear(L, bay, u0, u1, depth=1.6):
    # clear width of [u0, u1] on the bay after removing columns within `depth` inside the glass
    a, b = bay['a'], bay['b']; Lb = math.hypot(b[0] - a[0], b[1] - a[1])
    ux, uz = (b[0] - a[0]) / Lb, (b[1] - a[1]) / Lb
    nx, nz = -uz, ux  # inward
    cuts = []
    for c in L['columns']:
        corners = [(c['x'] + sx * c['w'] / 2, c['z'] + sz * c['d'] / 2) for sx in (-1, 1) for sz in (-1, 1)]
        us = [(p[0] - a[0]) * ux + (p[1] - a[1]) * uz for p in corners]
        ds = [(p[0] - a[0]) * nx + (p[1] - a[1]) * nz for p in corners]
        if min(ds) > depth or max(ds) < 0: continue
        cuts.append((min(us), max(us)))
    free = [(u0, u1)]
    for (c0, c1) in cuts:
        nf = []
        for (f0, f1) in free:
            if c1 <= f0 or c0 >= f1: nf.append((f0, f1)); continue
            if c0 > f0: nf.append((f0, c0))
            if c1 < f1: nf.append((c1, f1))
        free = nf
    return max([f1 - f0 for f0, f1 in free] + [0.0])


def entries(L):
    for bay in L['facade']['bays']:
        for k, lt in enumerate(bay.get('lites', [])):
            if lt['type'] in ('window_barricadable', 'door_barricadable'):
                yield bay, '%s_%d' % (bay['id'], k), lt['u0'], lt['u1']
        if bay.get('opening'):
            o = bay['opening']; yield bay, bay['id'] + '_opening', o['u0'], o['u1']
