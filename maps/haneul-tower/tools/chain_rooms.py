# Debug helper: rooms crossed by each door-chain error.
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import door_lines
L = json.load(open(sys.argv[1]))
def room(fl, x, z):
    for r in L['rooms']:
        if r['floor'] == fl and door_lines.in_poly(x, z, r['polygon']): return r['name']
for (fl, ln, p, q, ids, kind, sev) in door_lines.check(L):
    if sev != 'error' and '-a' not in sys.argv: continue
    seq = []
    for k in range(101):
        x = p[0] + (q[0] - p[0]) * k / 100; z = p[1] + (q[1] - p[1]) * k / 100
        r = room(fl, x, z)
        if r and (not seq or seq[-1] != r): seq.append(r)
    print('%s %5.1f %-8s %s' % (fl, ln, kind, ' > '.join(seq)))
