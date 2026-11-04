# Small 2D geometry helpers for the plan tools (plan coords: x east, z south).
import math

EPS = 1e-6


def area(poly):
    s = 0.0
    for i in range(len(poly)):
        x0, z0 = poly[i]
        x1, z1 = poly[(i + 1) % len(poly)]
        s += x0 * z1 - x1 * z0
    return s / 2.0


def centroid(poly):
    a = area(poly)
    if abs(a) < EPS:
        xs = [p[0] for p in poly]; zs = [p[1] for p in poly]
        return (sum(xs) / len(xs), sum(zs) / len(zs))
    cx = cz = 0.0
    for i in range(len(poly)):
        x0, z0 = poly[i]
        x1, z1 = poly[(i + 1) % len(poly)]
        f = x0 * z1 - x1 * z0
        cx += (x0 + x1) * f
        cz += (z0 + z1) * f
    return (cx / (6 * a), cz / (6 * a))


def point_in_poly(p, poly):
    x, z = p
    inside = False
    n = len(poly)
    for i in range(n):
        x0, z0 = poly[i]
        x1, z1 = poly[(i + 1) % n]
        if (z0 > z) != (z1 > z):
            xi = x0 + (z - z0) * (x1 - x0) / (z1 - z0)
            if x < xi:
                inside = not inside
    return inside


def dist_point_seg(p, a, b):
    ax, az = a; bx, bz = b; px, pz = p
    dx, dz = bx - ax, bz - az
    L2 = dx * dx + dz * dz
    if L2 < EPS:
        return math.hypot(px - ax, pz - az), 0.0
    t = ((px - ax) * dx + (pz - az) * dz) / L2
    t = max(0.0, min(1.0, t))
    qx, qz = ax + t * dx, az + t * dz
    return math.hypot(px - qx, pz - qz), t


def on_segment(p, a, b, tol=0.02):
    d, _ = dist_point_seg(p, a, b)
    return d <= tol


def on_polyline(p, pts, closed=True, tol=0.02):
    n = len(pts)
    for i in range(n if closed else n - 1):
        if on_segment(p, pts[i], pts[(i + 1) % n], tol):
            return True
    return False


def seg_len(a, b):
    return math.hypot(b[0] - a[0], b[1] - a[1])


def seg_point(a, b, u):
    L = seg_len(a, b)
    t = u / L if L > EPS else 0
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def segs_cross(a, b, c, d):
    # proper crossing of two segments (not touching at ends)
    def orient(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    o1 = orient(a, b, c); o2 = orient(a, b, d)
    o3 = orient(c, d, a); o4 = orient(c, d, b)
    return (o1 * o2 < -EPS) and (o3 * o4 < -EPS)


def rect(x0, z0, x1, z1):
    return [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]


def poly_edges(poly):
    return [(poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly))]


def polys_overlap(p, q, samples=6):
    # cheap overlap test: any interior sample of one inside the other, or crossing edges
    for (a, b) in poly_edges(p):
        for (c, d) in poly_edges(q):
            if segs_cross(a, b, c, d):
                return True
    for poly, other in ((p, q), (q, p)):
        c = centroid(poly)
        if point_in_poly(c, poly) and point_in_poly(c, other):
            # centroid of one strictly inside other (ignore shared boundary)
            inside_strict = all(dist_point_seg(c, a, b)[0] > 0.05 for a, b in poly_edges(other))
            if inside_strict:
                return True
    return False
