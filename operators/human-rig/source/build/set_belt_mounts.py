"""set_belt_mounts.py NAME=THETA ...: rewrite MNT_belt_* entries of base/mounts.json at a new belt angle (raw ring,
before common._belt_fit; same maths as common._ring_frame). Plain python, no bpy.
    python3 set_belt_mounts.py MNT_belt_pmag1=95 MNT_belt_pmag2=109 MNT_belt_dump=130"""
import os, sys, json, math
import numpy as np
RIG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(RIG, 'base', 'mounts.json')
M = json.load(open(P)); R = M['rings']['belt']
th = np.array(R['theta']); r = np.array(R['outer']); c = R['center']
def p(a):
    q = float(np.interp(a, th, r, period=2 * np.pi)); return np.array([c[0] + q * math.sin(a), c[1] - q * math.cos(a), 0.0])
for arg in sys.argv[1:]:
    name, deg = arg.split('='); t = math.radians(float(deg))
    tan = p(t + 1e-3) - p(t - 1e-3); tan /= np.linalg.norm(tan)
    up = np.array([0, 0, 1.0]); nrm = np.cross(tan, up); nrm /= np.linalg.norm(nrm)
    if nrm @ np.array([math.sin(t), -math.cos(t), 0]) < 0: nrm = -nrm
    x = np.cross(up, nrm); loc = p(t); loc[2] = R['z']
    m = M['mounts'][name]
    m.update(loc=[round(v, 5) for v in loc], x=[round(v, 5) for v in x], y=[0.0, 0.0, 1.0], z=[round(v, 5) for v in nrm])
    m['theta_deg'] = float(deg)
    print(name, deg, m['loc'])
json.dump(M, open(P, 'w'), indent=1)
