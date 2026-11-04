/* ================================================================== Haneul Tower: engine (core.js) */
// Builds the whole map from LAYOUT (layout.json, inlined by assemble.sh): structure by surface type, materials with
// real texture maps, one typed node per gameplay surface for the export, merged display meshes for the viewer, the
// tactical overlay, markers, colliders, and the kit K that the dressing parts (parts/*.js) get.
// Units metres. Plan [x, z]: x east, z south (north is -z). y up. F1 floor is y = 0.
// Nothing here draws text: callout names only go to the HTML overlay and to node extras.

const L = LAYOUT;
const FL = {};
L.floors.forEach((f, i) => { FL[f.id] = Object.assign({ n: i + 1 }, f); });
const FIDS = L.floors.map((f) => f.id);
const FY = (fid) => (FL[fid] ? FL[fid].y : 0);
const RU = L.rules, CEIL = RU.ceiling, SLAB = RU.slab, F2F = RU.floor_to_floor;
const TOPF = FIDS[FIDS.length - 1], ROOF_Y = FY(TOPF) + F2F;
const nextFloor = (fid) => FIDS[FIDS.indexOf(fid) + 1] || null;
const ROOM = new Map(L.rooms.map((r) => [r.id, r]));
const WALLS = new Map(L.walls.map((w) => [w.id, w]));
const UP = [0, 1, 0], DOWN = [0, -1, 0];
const r3 = (v) => Math.round(v * 1000) / 1000;

/* ------------------------------------------------------------------ 2D helpers (plan [x, z]) */

const P2 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]], add: (a, b) => [a[0] + b[0], a[1] + b[1]], mul: (a, s) => [a[0] * s, a[1] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1], len: (a) => Math.hypot(a[0], a[1]),
  norm: (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
};
function inPoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
function polyBox(p) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const q of p) { x0 = Math.min(x0, q[0]); z0 = Math.min(z0, q[1]); x1 = Math.max(x1, q[0]); z1 = Math.max(z1, q[1]); }
  return [x0, z0, x1, z1];
}
const rectP = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const sqP = (x, z, h) => rectP(x - h, z - h, x + h, z + h);
function polyArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
function segDist(p, a, b) {
  const ab = P2.sub(b, a), t = Math.max(0, Math.min(1, P2.dot(P2.sub(p, a), ab) / (P2.dot(ab, ab) || 1)));
  return P2.len(P2.sub(p, P2.lerp(a, b, t)));
}
function polyDist(p, poly, closed = true) {
  let d = Infinity; const n = poly.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) d = Math.min(d, segDist(p, poly[i], poly[(i + 1) % n]));
  return d;
}
const outlineDist = (p) => polyDist(p, L.outline);
// plan polyline helper: cumulative lengths, point and frame at arc length s, projection of a point
function polyline(pts, closed = false) {
  const P = closed ? [...pts, pts[0]] : pts.slice(), S = [0];
  for (let i = 1; i < P.length; i++) S.push(S[i - 1] + P2.len(P2.sub(P[i], P[i - 1])));
  const total = S[S.length - 1];
  const at = (s) => {
    s = Math.max(0, Math.min(total, s)); let i = 1; while (i < S.length - 1 && S[i] < s) i++;
    const t = (s - S[i - 1]) / ((S[i] - S[i - 1]) || 1), d = P2.norm(P2.sub(P[i], P[i - 1]));
    return { p: P2.lerp(P[i - 1], P[i], t), d, seg: i - 1 };
  };
  const project = (q) => {
    let best = { dist: Infinity, s: 0 };
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], ab = P2.sub(b, a), l2 = P2.dot(ab, ab) || 1, t = Math.max(0, Math.min(1, P2.dot(P2.sub(q, a), ab) / l2));
      const dd = P2.len(P2.sub(q, P2.lerp(a, b, t)));
      if (dd < best.dist) best = { dist: dd, s: S[i - 1] + t * Math.sqrt(l2) };
    }
    return best;
  };
  return { P, S, total, at, project };
}
// sorted, disjoint interval lists [[a, b], ...]: A minus B
function idiff(A, B) {
  const out = [];
  for (const [a0, a1] of A) {
    let segs = [[a0, a1]];
    for (const [b0, b1] of B) {
      const nx = [];
      for (const [s0, s1] of segs) {
        if (b1 <= s0 + 1e-9 || b0 >= s1 - 1e-9) { nx.push([s0, s1]); continue; }
        if (b0 > s0) nx.push([s0, b0]);
        if (b1 < s1) nx.push([b1, s1]);
      }
      segs = nx;
    }
    for (const s of segs) if (s[1] - s[0] > 1e-6) out.push(s);
  }
  return out;
}

/* ------------------------------------------------------------------ plan regions (polygon booleans) */
// region(add, sub): the area inside any `add` polygon and outside every `sub` polygon, as x-monotone trapezoids
// plus its boundary edges (outward normals). Works for any simple polygons (here: axis lines and 45 degree chamfers).
function region(add, sub = []) {
  const P = [...add.map((p) => ({ p, s: 0 })), ...sub.map((p) => ({ p, s: 1 }))];
  const E = [];
  P.forEach((Q, pi) => {
    const p = Q.p, n = p.length;
    for (let i = 0; i < n; i++) {
      const a = p[i], b = p[(i + 1) % n];
      if (Math.abs(a[0] - b[0]) < 1e-9) continue;
      const [l, r] = a[0] < b[0] ? [a, b] : [b, a];
      E.push({ x0: l[0], z0: l[1], x1: r[0], k: (r[1] - l[1]) / (r[0] - l[0]), pi });
    }
  });
  let xs = [];
  for (const e of E) xs.push(e.x0, e.x1);
  for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
    const a = E[i], b = E[j];
    if (Math.abs(a.k - b.k) < 1e-12) continue;
    const x = (b.z0 - a.z0 + a.k * a.x0 - b.k * b.x0) / (a.k - b.k);
    if (x > Math.max(a.x0, b.x0) + 1e-9 && x < Math.min(a.x1, b.x1) - 1e-9) xs.push(x);
  }
  xs.sort((a, b) => a - b);
  const X = [];
  for (const x of xs) if (!X.length || x - X[X.length - 1] > 1e-7) X.push(x);
  const zAt = (e, x) => e.z0 + e.k * (x - e.x0);
  const S = [];
  for (let i = 0; i < X.length - 1; i++) {
    const xa = X[i], xb = X[i + 1], xm = (xa + xb) / 2;
    const act = E.filter((e) => e.x0 < xm && e.x1 > xm).map((e) => ({ e, zm: zAt(e, xm) })).sort((a, b) => a.zm - b.zm);
    const par = new Uint8Array(P.length), sp = [];
    for (let j = 0; j < act.length - 1; j++) {
      par[act[j].e.pi] ^= 1;
      let inA = false, inB = false;
      for (let k = 0; k < P.length; k++) if (par[k]) { if (P[k].s) inB = true; else inA = true; }
      if (!inA || inB) continue;
      const lo = act[j].e, hi = act[j + 1].e;
      const a0 = zAt(lo, xa), a1 = zAt(hi, xa), b0 = zAt(lo, xb), b1 = zAt(hi, xb);
      if (a1 - a0 < 1e-7 && b1 - b0 < 1e-7) continue;
      const last = sp[sp.length - 1];
      if (last && Math.abs(last.a1 - a0) < 1e-6 && Math.abs(last.b1 - b0) < 1e-6) { last.a1 = a1; last.b1 = b1; }
      else sp.push({ xa, xb, a0, a1, b0, b1 });
    }
    S.push({ xa, xb, sp });
  }
  const traps = S.flatMap((s) => s.sp), sides = [];
  for (const t of traps) {
    sides.push({ p0: [t.xa, t.a0], p1: [t.xb, t.b0], n: P2.norm([t.b0 - t.a0, -(t.xb - t.xa)]) });
    sides.push({ p0: [t.xa, t.a1], p1: [t.xb, t.b1], n: P2.norm([-(t.b1 - t.a1), t.xb - t.xa]) });
  }
  for (let i = 0; i <= S.length; i++) {
    if (!S.length) break;
    const x = i < S.length ? S[i].xa : S[i - 1].xb;
    const left = i > 0 ? S[i - 1].sp.map((t) => [t.b0, t.b1]) : [], right = i < S.length ? S[i].sp.map((t) => [t.a0, t.a1]) : [];
    for (const [z0, z1] of idiff(left, right)) sides.push({ p0: [x, z0], p1: [x, z1], n: [1, 0] });
    for (const [z0, z1] of idiff(right, left)) sides.push({ p0: [x, z0], p1: [x, z1], n: [-1, 0] });
  }
  let area = 0; for (const t of traps) area += (t.xb - t.xa) * ((t.a1 - t.a0) + (t.b1 - t.b0)) / 2;
  return { traps, sides, area };
}

/* ------------------------------------------------------------------ geometry buffers */
// GB collects indexed triangles for one material. UVs are box-projected in metres / tile, so every surface keeps the
// texture's true scale (and the export carries the same UVs).
function projUV(p, n) {
  if (Math.abs(n[1]) > 0.7) return [p[0], n[1] > 0 ? p[2] : -p[2]];
  const h = Math.hypot(n[0], n[2]) || 1;
  return [p[0] * (n[2] / h) - p[2] * (n[0] / h), p[1]];
}
class GB {
  constructor(tile = 1) { this.p = []; this.n = []; this.u = []; this.i = []; this.tu = Array.isArray(tile) ? tile[0] : tile; this.tv = Array.isArray(tile) ? tile[1] : tile; this.isGB = true; }
  get nv() { return this.p.length / 3; }
  get tris() { return this.i.length / 3; }
  // planar convex polygon [x, y, z][] facing n (winding fixed to match n)
  face(pts, n) {
    let q = [];
    for (const p of pts) { const l = q[q.length - 1]; if (!l || Math.abs(l[0] - p[0]) + Math.abs(l[1] - p[1]) + Math.abs(l[2] - p[2]) > 1e-7) q.push(p); }
    while (q.length > 2) { const a = q[0], b = q[q.length - 1]; if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 1e-7) break; q.pop(); }
    if (q.length < 3) return;
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < q.length; k++) {
      const a = q[k], b = q[(k + 1) % q.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    if (Math.abs(nx) + Math.abs(ny) + Math.abs(nz) < 1e-9) return;
    if (nx * n[0] + ny * n[1] + nz * n[2] < 0) q = q.reverse();
    const b0 = this.nv;
    for (const p of q) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); const uv = projUV(p, n); this.u.push(uv[0] / this.tu, uv[1] / this.tv); }
    for (let k = 1; k < q.length - 1; k++) this.i.push(b0, b0 + k, b0 + k + 1);
  }
  // any three.js geometry (world matrix optional); UVs re-projected from the face normals so the scale stays metric
  addGeo(geo, mat4 = null, keepUV = false) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (mat4) g.applyMatrix4(mat4);
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position.array, N = g.attributes.normal.array, U = keepUV && g.attributes.uv ? g.attributes.uv.array : null;
    for (let k = 0; k < P.length; k += 9) {
      const ax = P[k + 3] - P[k], ay = P[k + 4] - P[k + 1], az = P[k + 5] - P[k + 2], bx = P[k + 6] - P[k], by = P[k + 7] - P[k + 1], bz = P[k + 8] - P[k + 2];
      let fx = ay * bz - az * by, fy = az * bx - ax * bz, fz = ax * by - ay * bx; const fl = Math.hypot(fx, fy, fz);
      if (fl < 1e-12) continue;
      const fn = [fx / fl, fy / fl, fz / fl];
      for (let v = 0; v < 3; v++) {
        const o = k + v * 3, p = [P[o], P[o + 1], P[o + 2]];
        this.p.push(p[0], p[1], p[2]); this.n.push(N[o], N[o + 1], N[o + 2]);
        if (U) { const ui = (o / 3) * 2; this.u.push(U[ui], U[ui + 1]); } else { const uv = projUV(p, fn); this.u.push(uv[0] / this.tu, uv[1] / this.tv); }
        this.i.push(this.nv - 1);
      }
    }
    g.dispose();
  }
  append(o) { const b = this.nv; for (const v of o.p) this.p.push(v); for (const v of o.n) this.n.push(v); for (const v of o.u) this.u.push(v); for (const k of o.i) this.i.push(k + b); }   // no spread: big buckets overflow the stack
  bbox() {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let k = 0; k < this.p.length; k += 3) for (let j = 0; j < 3; j++) { b[j] = Math.min(b[j], this.p[k + j]); b[j + 3] = Math.max(b[j + 3], this.p[k + j]); }
    return b;
  }
  toGeo(inv = null) {
    let p = this.p, n = this.n;
    if (inv) {
      const e = inv.elements, P = new Array(p.length), N = new Array(n.length);
      for (let k = 0; k < p.length; k += 3) {
        const x = p[k], y = p[k + 1], z = p[k + 2];
        P[k] = e[0] * x + e[4] * y + e[8] * z + e[12]; P[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; P[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const a = n[k], b = n[k + 1], c = n[k + 2];
        N[k] = e[0] * a + e[4] * b + e[8] * c; N[k + 1] = e[1] * a + e[5] * b + e[9] * c; N[k + 2] = e[2] * a + e[6] * b + e[10] * c;
      }
      p = P; n = N;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.i);
    return g;
  }
}
// box with centre c, unit axes X Y Z and half sizes h. g is a GB or {x, y, z} GBs (faces normal to each axis).
// skip: any of '+x -x +y -y +z -z' to leave faces out.
function obox(g, c, X, Y, Z, h, skip = '') {
  const G = (k) => (g.isGB ? g : g[k]);
  const P = (a, b, d) => [c[0] + X[0] * a * h[0] + Y[0] * b * h[1] + Z[0] * d * h[2], c[1] + X[1] * a * h[0] + Y[1] * b * h[1] + Z[1] * d * h[2], c[2] + X[2] * a * h[0] + Y[2] * b * h[1] + Z[2] * d * h[2]];
  const ng = (v) => [-v[0], -v[1], -v[2]];
  if (!skip.includes('+x')) G('x').face([P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)], X);
  if (!skip.includes('-x')) G('x').face([P(-1, -1, -1), P(-1, 1, -1), P(-1, 1, 1), P(-1, -1, 1)], ng(X));
  if (!skip.includes('+y')) G('y').face([P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1)], Y);
  if (!skip.includes('-y')) G('y').face([P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)], ng(Y));
  if (!skip.includes('+z')) G('z').face([P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)], Z);
  if (!skip.includes('-z')) G('z').face([P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1)], ng(Z));
}
const AX = [1, 0, 0], AY = [0, 1, 0], AZ = [0, 0, 1];
function abox(g, x0, x1, y0, y1, z0, z1, skip = '') {
  if (x1 - x0 < 1e-6 || y1 - y0 < 1e-6 || z1 - z0 < 1e-6) return;
  obox(g, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], AX, AY, AZ, [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2], skip);
}
// oriented box between two plan points a -> b (width across, y0..y1)
function sbox(g, a, b, width, y0, y1, skip = '') {
  const d = P2.norm(P2.sub(b, a)), l = P2.len(P2.sub(b, a)); if (l < 1e-6) return;
  obox(g, [(a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2], [d[0], 0, d[1]], AY, [-d[1], 0, d[0]], [l / 2, (y1 - y0) / 2, width / 2], skip);
}
// box between two 3D points (a beam or post), square section w x h (h along the vertical-ish axis)
function beam(g, a, b, w, h = w) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d); if (l < 1e-6) return;
  const X = d.map((v) => v / l);
  let Z = Math.abs(X[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  let Y = [X[1] * Z[2] - X[2] * Z[1], X[2] * Z[0] - X[0] * Z[2], X[0] * Z[1] - X[1] * Z[0]]; const yl = Math.hypot(...Y); Y = Y.map((v) => v / yl);
  Z = [X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]];
  obox(g, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], X, Z, Y, [l / 2, h / 2, w / 2]);
}
// extrude a closed profile [[s, y], ...] (in the plane of S and up) across C from -w/2 to +w/2, origin o [x, y, z]
function extrudeProfile(g, prof, o, S, C, w) {
  const G = (k) => (g.isGB ? g : g[k]);
  const W = (s, y, c) => [o[0] + S[0] * s + C[0] * c, o[1] + y, o[2] + S[2] * s + C[2] * c];
  const tris = THREE.ShapeUtils.triangulateShape(prof.map((p) => new THREE.Vector2(p[0], p[1])), []);
  for (const t of tris) {
    G('cap').face(t.map((i) => W(prof[i][0], prof[i][1], w / 2)), C);
    G('cap').face(t.map((i) => W(prof[i][0], prof[i][1], -w / 2)), [-C[0], -C[1], -C[2]]);
  }
  const ccw = polyArea(prof) > 0;
  for (let i = 0; i < prof.length; i++) {
    const a = prof[i], b = prof[(i + 1) % prof.length], ds = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(ds, dy); if (l < 1e-9) continue;
    let ns = dy / l, ny = -ds / l; if (!ccw) { ns = -ns; ny = -ny; }
    const N = [S[0] * ns, ny, S[2] * ns];
    G(Math.abs(ny) > 0.7 ? 'top' : 'side').face([W(a[0], a[1], -w / 2), W(b[0], b[1], -w / 2), W(b[0], b[1], w / 2), W(a[0], a[1], w / 2)], N);
  }
}
// region prism between y0 and y1: tops, bottoms and boundary sides (any may be null)
function prism(R, y0, y1, gTop, gBot, gSide) {
  for (const t of R.traps) {
    const q = [[t.xa, y1, t.a0], [t.xb, y1, t.b0], [t.xb, y1, t.b1], [t.xa, y1, t.a1]];
    if (gTop) gTop.face(q, UP);
    if (gBot) gBot.face(q.map((p) => [p[0], y0, p[2]]), DOWN);
  }
  if (gSide && y1 - y0 > 1e-6) for (const s of R.sides) gSide.face([[s.p0[0], y0, s.p0[1]], [s.p1[0], y0, s.p1[1]], [s.p1[0], y1, s.p1[1]], [s.p0[0], y1, s.p0[1]]], [s.n[0], 0, s.n[1]]);
}
// vertical cylinder (or ring) as faces
function cylY(g, cx, cz, r, y0, y1, seg = 24, caps = true) {
  const G = (k) => (g.isGB ? g : g[k]);
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
    const p0 = [cx + Math.sin(a0) * r, cz + Math.cos(a0) * r], p1 = [cx + Math.sin(a1) * r, cz + Math.cos(a1) * r];
    G('side').face([[p0[0], y0, p0[1]], [p1[0], y0, p1[1]], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]]], [Math.sin(am), 0, Math.cos(am)]);
    if (caps) { G('top').face([[cx, y1, cz], [p0[0], y1, p0[1]], [p1[0], y1, p1[1]]], UP); G('top').face([[cx, y0, cz], [p0[0], y0, p0[1]], [p1[0], y0, p1[1]]], DOWN); }
  }
}
// basis with +Y up and +Z along the plan direction nz (unit [x, z]); returns a THREE.Matrix4 at position p
function frameZ(p, nz, flipX = false) {
  const Z = new THREE.Vector3(nz[0], 0, nz[1]).normalize(), Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3().crossVectors(Y, Z);
  const m = new THREE.Matrix4().makeBasis(X, Y, Z); m.setPosition(p[0], p[1], p[2]);
  if (flipX) m.multiply(new THREE.Matrix4().makeRotationX(Math.PI));
  return m;
}

/* ------------------------------------------------------------------ textures (canvas, real maps for the export) */

function cv(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rnd(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
// tileable value noise, n x n pixels, cx x cy lattice cells on the first octave
function noise(n, cx, cy, seed, oct = 4, gain = 0.5) {
  const out = new Float32Array(n * n); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const gx = Math.max(1, Math.round(cx * 2 ** o)), gy = Math.max(1, Math.round(cy * 2 ** o)), R = rnd(seed * 31 + o * 7 + 1), lat = new Float32Array(gx * gy);
    for (let i = 0; i < lat.length; i++) lat[i] = R();
    for (let y = 0; y < n; y++) {
      const fy = (y / n) * gy, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty), y0 = (iy % gy) * gx, y1 = ((iy + 1) % gy) * gx;
      for (let x = 0; x < n; x++) {
        const fx = (x / n) * gx, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx), x0 = ix % gx, x1 = (ix + 1) % gx;
        const a = lat[y0 + x0], b = lat[y0 + x1], c = lat[y1 + x0], d = lat[y1 + x1], top = a + (b - a) * sx;
        out[y * n + x] += amp * (top + (c + (d - c) * sx - top) * sy);
      }
    }
    tot += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function img(w, h, fn) {
  const c = cv(w, h), x = c.getContext('2d'), im = x.createImageData(w, h), d = im.data, o = [0, 0, 0, 255];
  let k = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { o[3] = 255; fn(i, j, o, j * w + i); d[k] = o[0]; d[k + 1] = o[1]; d[k + 2] = o[2]; d[k + 3] = o[3]; k += 4; }
  x.putImageData(im, 0, 0);
  return c;
}
const grey = (o, v, r = 1, g = 1, b = 1) => { v = Math.max(0, Math.min(1, v)) * 255; o[0] = v * r; o[1] = v * g; o[2] = v * b; };
function nmap(H, n, s) {
  return img(n, n, (i, j, o) => {
    const l = H[j * n + (i + n - 1) % n], r = H[j * n + (i + 1) % n], u = H[((j + n - 1) % n) * n + i], d = H[((j + 1) % n) * n + i];
    const x = (l - r) * s, y = (d - u) * s, k = 1 / Math.hypot(x, y, 1);
    o[0] = (x * k * 0.5 + 0.5) * 255; o[1] = (y * k * 0.5 + 0.5) * 255; o[2] = (k * 0.5 + 0.5) * 255;
  });
}
function ormMap(n, R, Mt) { return img(n, n, (i, j, o, k) => { o[0] = 255; o[1] = Math.max(0.02, Math.min(1, R(k))) * 255; o[2] = Math.max(0, Math.min(1, Mt(k))) * 255; }); }
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The generators return { map, normal?, orm?, emissive? } canvases. Sizes are kept small (export size).
const GEN = {
  pool(n = 128) {   // soft light pool on a floor: radial falloff in the alpha (exported as an emissive alpha decal)
    const c = cv(n), x = c.getContext('2d'), g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.35, 'rgba(255,255,255,0.28)'); g.addColorStop(0.7, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, n, n);
    return { map: c, emissive: c, alpha: true };
  },
  board(n = 512) {   // hard-surface cladding: dark honed granite in 1.2 x 0.6 m panels (2.4 m tile) with deep reveals
    const N1 = noise(n, 5, 5, 11, 5), N2 = noise(n, 200, 200, 12, 1), N3 = noise(n, 40, 40, 13, 2), R = rnd(14);
    const cols = 2, rows = 4, pw = n / cols, ph = n / rows, tone = Array.from({ length: cols * rows }, () => R()), rv = 4.5;
    const H = new Float32Array(n * n), A = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      const r = Math.floor(j / ph), fj = j - r * ph, sh = r % 2 ? pw / 2 : 0;
      for (let i = 0; i < n; i++) {
        const ii = (i + sh) % n, c = Math.floor(ii / pw), fi = ii - c * pw, edge = Math.min(fi, pw - fi, fj, ph - fj), k = j * n + i, t = tone[r * cols + c];
        const sp = N2[k] > 0.78 ? 0.1 : N2[k] < 0.2 ? -0.06 : 0;
        let a = 0.36 + 0.07 * (N1[k] - 0.5) + 0.05 * (N3[k] - 0.5) + sp + (t - 0.5) * 0.06, h = 0.5 + 0.05 * (N3[k] - 0.5);
        if (edge < rv) { const q = sstep(rv, 0, edge); a -= 0.3 * q; h -= 0.7 * q; }
        H[k] = h; A[k] = a;
      }
    }
    return { map: img(n, n, (i, j, o, k) => grey(o, A[k], 0.98, 1, 1.04)), normal: nmap(H, n, 2.4), orm: ormMap(n, (k) => 0.42 + 0.12 * (N1[k] - 0.5) + (N2[k] > 0.78 ? -0.1 : 0), () => 0) };
  },
  polished(n = 512) {   // polished dark concrete with aggregate
    const N1 = noise(n, 4, 4, 21, 5), N2 = noise(n, 160, 160, 22, 1), N3 = noise(n, 16, 16, 23, 3), H = new Float32Array(n * n);
    for (let k = 0; k < H.length; k++) H[k] = N3[k] * 0.25 + (N2[k] > 0.8 ? 0.15 : 0);
    return {
      map: img(n, n, (i, j, o, k) => grey(o, 0.42 + 0.2 * (N1[k] - 0.5) + (N2[k] > 0.8 ? 0.12 : N2[k] < 0.16 ? -0.07 : 0) + 0.05 * (N3[k] - 0.5), 1.01, 1, 0.98)),
      normal: nmap(H, n, 1.0), orm: ormMap(n, (k) => 0.34 + 0.24 * (N1[k] - 0.5) + 0.1 * (N3[k] - 0.5), () => 0),
    };
  },
  brushed(n = 256) {   // brushed alloy, streaks along u
    const N = noise(n, 2, 180, 31, 3), N2 = noise(n, 8, 8, 32, 3), H = new Float32Array(n * n);
    for (let k = 0; k < H.length; k++) H[k] = N[k] * 0.4;
    return { map: img(n, n, (i, j, o, k) => grey(o, 0.62 + 0.12 * (N[k] - 0.5) + 0.08 * (N2[k] - 0.5))), normal: nmap(H, n, 1.4), orm: ormMap(n, (k) => 0.34 + 0.14 * (N[k] - 0.5) + 0.08 * (N2[k] - 0.5), () => 1) };
  },
  // hanji changsal on a regular timber lattice (1.2 m tile, rails every 0.6 m), three patterns:
  // grid = fine square sal (hotel), tti = vertical tti-sal with even triple bands (spa), diag = lozenge bit-sal (bar wing)
  lattice(n, o) {
    const NF = noise(n, 96, 96, 41, 2), NL = noise(n, 3, 3, 42, 4), NW = noise(n, 2, 64, 43, 3), H = new Float32Array(n * n), bat = new Float32Array(n * n), dR = new Float32Array(n * n);
    const px = n / 1.2, rp = 0.6 * px, rw = 0.034 * px, cp = o.cell * px, mw = o.mw * px, bands = [0.5];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, dr = Math.min(i % rp, rp - (i % rp), j % rp, rp - (j % rp));
      let dm;
      if (o.kind === 'grid') dm = Math.min(i % cp, cp - (i % cp), j % cp, cp - (j % cp));
      else if (o.kind === 'tti') { const fv = (j % rp) / rp; dm = bands.some((b) => Math.abs(fv - b) * rp < mw * 0.55) ? 0 : Math.min(i % cp, cp - (i % cp)); }
      else { const a = (i + j) % cp, b = (i - j + n * 4) % cp; dm = Math.min(a, cp - a, b, cp - b) * 0.7071; }
      const rail = dr < rw / 2, thin = dm < mw / 2;
      bat[k] = rail || thin ? 1 : 0; dR[k] = dr;
      H[k] = rail ? 0.85 + 0.15 * sstep(rw / 2, 0, dr) : thin ? 0.55 + 0.1 * sstep(mw / 2, 0, dm) : 0.05 * NF[k];
    }
    const W = o.wood, P = o.paper;
    const map = img(n, n, (i, j, o2, k) => { if (bat[k]) grey(o2, 0.16 + 0.05 * NW[k], W[0], W[1], W[2]); else grey(o2, 0.85 + 0.05 * (NL[k] - 0.5) + 0.06 * (NF[k] - 0.5), P[0], P[1], P[2]); });
    const emissive = img(n, n, (i, j, o2, k) => {
      if (bat[k]) { o2[0] = o2[1] = o2[2] = 0; return; }
      const e = (0.6 + 0.4 * NL[k]) * (0.75 + 0.25 * sstep(rw, 60, dR[k])) * (0.92 + 0.08 * NF[k]);
      o2[0] = o.glow[0] * e; o2[1] = o.glow[1] * e; o2[2] = o.glow[2] * e;
    });
    return { map, emissive, normal: nmap(H, n, 2.4), orm: ormMap(n, (k) => (bat[k] ? 0.5 : 0.82), () => 0) };
  },
  hanji(n = 512) { return GEN.lattice(n, { kind: 'grid', cell: 0.1, mw: 0.011, wood: [1.25, 1.0, 0.82], paper: [1.0, 0.95, 0.86], glow: [255, 196, 128] }); },
  hanji_spa(n = 512) { return GEN.lattice(n, { kind: 'tti', cell: 0.06, mw: 0.009, wood: [1.55, 1.3, 1.02], paper: [1.0, 0.97, 0.9], glow: [255, 214, 160] }); },
  hanji_bar(n = 512) { return GEN.lattice(n, { kind: 'diag', cell: 0.15, mw: 0.013, wood: [0.8, 0.58, 0.48], paper: [1.0, 0.88, 0.7], glow: [255, 170, 96] }); },
  acoustic(n = 256) {   // fabric-wrapped acoustic panels 0.6 x 1.2 m (1.2 m tile): fluted ribs every 5 cm, quilted panel edges
    const NF = noise(n, 64, 64, 141, 2), H = new Float32Array(n * n), A = new Float32Array(n * n), px = n / 1.2, rib = 0.05 * px, pw = 0.6 * px;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, e = Math.min(i % pw, pw - (i % pw), j % n, n - (j % n)), r = 0.5 + 0.5 * Math.cos(((i % rib) / rib) * Math.PI * 2);
      const q = sstep(0, 10, e);
      H[k] = q * (0.55 + 0.35 * r) + 0.05 * NF[k]; A[k] = (e < 2 ? 0.12 : 0.42 + 0.1 * r * q + 0.06 * (NF[k] - 0.5));
    }
    return { map: img(n, n, (i, j, o, k) => grey(o, A[k], 0.95, 0.92, 1.12)), normal: nmap(H, n, 3.0), orm: ormMap(n, (k) => 0.92, () => 0) };
  },
  wood(n = 512) {   // walnut-like grain along u, 0.15 m planks
    const N = noise(n, 3, 48, 51, 4), NF = noise(n, 64, 8, 52, 2), R = rnd(53), PL = 8, ph = n / PL, tone = Array.from({ length: PL }, () => R()), off = tone.map(() => Math.floor(R() * n));
    const H = new Float32Array(n * n), A = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      const p = Math.floor(j / ph), e = Math.min(j - p * ph, ph - (j - p * ph));
      for (let i = 0; i < n; i++) {
        const k = j * n + i, g = N[j * n + (i + off[p]) % n], ring = 0.5 + 0.5 * Math.sin((j / n * 40 + g * 7) * Math.PI);
        A[k] = 0.5 + 0.22 * (g - 0.5) + 0.12 * (ring - 0.5) + 0.12 * (tone[p] - 0.5) + 0.04 * (NF[k] - 0.5) - (e < 1.2 ? 0.25 : 0);
        H[k] = 0.3 * ring + 0.2 * g - (e < 1.2 ? 0.6 : 0);
      }
    }
    return { map: img(n, n, (i, j, o, k) => grey(o, A[k], 1.12, 0.92, 0.78)), normal: nmap(H, n, 1.2), orm: ormMap(n, (k) => 0.5 + 0.12 * (N[k] - 0.5), () => 0) };
  },
  plaster(n = 256) {
    const N1 = noise(n, 4, 4, 61, 5), N2 = noise(n, 48, 48, 62, 2), H = new Float32Array(n * n);
    for (let k = 0; k < H.length; k++) H[k] = N2[k] * 0.3 + N1[k] * 0.2;
    return { map: img(n, n, (i, j, o, k) => grey(o, 0.86 + 0.06 * (N1[k] - 0.5) + 0.03 * (N2[k] - 0.5), 1, 0.98, 0.95)), normal: nmap(H, n, 0.8), orm: ormMap(n, (k) => 0.86 + 0.08 * (N2[k] - 0.5), () => 0) };
  },
  carpet(n = 512) {   // 0.6 m carpet tiles laid quarter-turn (2.4 m tile = 4 x 4)
    const Na = noise(n, 160, 40, 71, 2), Nb = noise(n, 40, 160, 72, 2), NF = noise(n, 256, 256, 73, 1), NL = noise(n, 3, 3, 74, 3), R = rnd(75), T = 4, ts = n / T, tone = Array.from({ length: T * T }, () => R());
    const H = new Float32Array(n * n), A = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const ti = Math.floor(i / ts), tj = Math.floor(j / ts), k = j * n + i, f = (ti + tj) % 2 ? Na[k] : Nb[k], e = Math.min(i % ts, ts - (i % ts), j % ts, ts - (j % ts));
      A[k] = 0.5 + 0.22 * (f - 0.5) + 0.14 * (NF[k] - 0.5) + 0.05 * (tone[tj * T + ti] - 0.5) + 0.05 * (NL[k] - 0.5) - (e < 1 ? 0.08 : 0);
      H[k] = 0.5 * f + 0.5 * NF[k] - (e < 1 ? 0.3 : 0);
    }
    return { map: img(n, n, (i, j, o, k) => grey(o, A[k])), normal: nmap(H, n, 1.3), orm: ormMap(n, () => 0.96, () => 0) };
  },
  terrazzo(n = 512) {
    const N1 = noise(n, 4, 4, 81, 4), map = img(n, n, (i, j, o, k) => grey(o, 0.74 + 0.05 * (N1[k] - 0.5), 1.02, 1, 0.96));
    const x = map.getContext('2d'), R = rnd(82), pal = ['#3b3936', '#2a2a2c', '#f2efe8', '#c9b48e', '#8d8a85', '#9a4a3a', '#5e6470'];
    for (let c = 0; c < 2600; c++) {
      const px = R() * n, py = R() * n, r = 1 + R() * R() * 6, col = pal[Math.floor(R() * R() * pal.length)], sides = 4 + Math.floor(R() * 4), rot = R() * 6.28;
      for (const ox of [0, px < 8 ? n : px > n - 8 ? -n : 0]) for (const oy of [0, py < 8 ? n : py > n - 8 ? -n : 0]) {
        x.fillStyle = col; x.beginPath();
        for (let s = 0; s < sides; s++) { const a = rot + (s / sides) * 6.283, rr = r * (0.7 + 0.3 * Math.sin(s * 2.1 + c)); const X = px + ox + Math.cos(a) * rr, Y = py + oy + Math.sin(a) * rr; s ? x.lineTo(X, Y) : x.moveTo(X, Y); }
        x.fill();
      }
    }
    return { map, orm: ormMap(n, (k) => 0.3 + 0.08 * (N1[k] - 0.5), () => 0) };
  },
  paver(n = 512) {   // stone pavers 1.2 x 0.6 m running bond on a 2.4 m tile
    const N1 = noise(n, 8, 8, 91, 4), N2 = noise(n, 64, 64, 92, 2), R = rnd(93), rows = 4, rh = n / rows, cw = n / 2, tone = Array.from({ length: 16 }, () => R());
    const H = new Float32Array(n * n), A = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      const r = Math.floor(j / rh), shift = r % 2 ? cw / 2 : 0, ey = Math.min(j - r * rh, rh - (j - r * rh));
      for (let i = 0; i < n; i++) {
        const ii = (i + shift) % n, c = Math.floor(ii / cw), ex = Math.min(ii - c * cw, cw - (ii - c * cw)), e = Math.min(ex, ey), k = j * n + i, t = tone[(r * 2 + c) % 16];
        A[k] = 0.62 + 0.1 * (N1[k] - 0.5) + 0.06 * (N2[k] - 0.5) + 0.1 * (t - 0.5) - (e < 1.8 ? 0.3 : 0);
        H[k] = e < 1.8 ? 0 : 0.6 + 0.4 * sstep(1.8, 5, e) + 0.15 * N2[k];
      }
    }
    return { map: img(n, n, (i, j, o, k) => grey(o, A[k], 1.02, 1, 0.96)), normal: nmap(H, n, 1.5), orm: ormMap(n, (k) => 0.5 + 0.12 * (N1[k] - 0.5), () => 0) };
  },
  drystone(n = 512) {   // dry-stone wall: rows of flat stones
    const N1 = noise(n, 16, 16, 101, 3), N2 = noise(n, 4, 4, 102, 3), R = rnd(103), rows = [];
    let y = 0; while (y < n) { const h = Math.min(n - y, 22 + Math.floor(R() * 34)); rows.push([y, h]); y += h; }
    const stones = rows.map(() => { const s = []; let x = 0; while (x < n) { const w = Math.min(n - x, 40 + Math.floor(R() * 110)); s.push([x, w, R()]); x += w; } return s; });
    const H = new Float32Array(n * n), A = new Float32Array(n * n);
    rows.forEach(([y0, h], ri) => {
      const off = Math.floor(R() * n);
      for (let j = y0; j < y0 + h; j++) for (let i = 0; i < n; i++) {
        const ii = (i + off) % n, st = stones[ri].find((s) => ii >= s[0] && ii < s[0] + s[1]) || stones[ri][0];
        const e = Math.min(ii - st[0], st[0] + st[1] - ii, j - y0, y0 + h - j), k = j * n + i;
        H[k] = e < 2 ? 0 : (0.5 + 0.5 * sstep(2, 10, e)) * (0.75 + 0.25 * st[2]) + 0.25 * N1[k];
        A[k] = e < 2 ? 0.1 : 0.36 + 0.18 * (st[2] - 0.5) + 0.12 * (N1[k] - 0.5) + 0.08 * (N2[k] - 0.5);
      }
    });
    return { map: img(n, n, (i, j, o, k) => grey(o, A[k], 1.04, 1, 0.94)), normal: nmap(H, n, 3.0), orm: ormMap(n, (k) => 0.86 + 0.08 * (N1[k] - 0.5), () => 0) };
  },
  corten(n = 256) {   // weathered corten (1.2 m tile): rust mottling, run-off streaks, a darker wet foot
    const N1 = noise(n, 8, 8, 171, 4), N2 = noise(n, 48, 48, 172, 2), NS = noise(n, 32, 2, 173, 3), H = new Float32Array(n * n), A = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i, v = 1 - j / n; A[k] = 0.42 + 0.16 * (N1[k] - 0.5) + 0.08 * (N2[k] - 0.5) - 0.12 * sstep(0.45, 0.75, NS[k]) - 0.1 * sstep(0.25, 0, v); H[k] = 0.4 * N2[k] + 0.2 * N1[k]; }
    return { map: img(n, n, (i, j, o, k) => grey(o, A[k], 1.25, 0.66, 0.4)), normal: nmap(H, n, 1.2), orm: ormMap(n, (k) => 0.62 + 0.15 * (N2[k] - 0.5), () => 0.15) };
  },
  wetpaver(n = 512) {   // dark slate pavers 0.9 m, wet with puddles (3.6 m tile)
    const N1 = noise(n, 8, 8, 111, 4), NP = noise(n, 3, 3, 112, 4), N2 = noise(n, 64, 64, 113, 2), R = rnd(114), T = 4, ts = n / T, tone = Array.from({ length: 16 }, () => R());
    const H = new Float32Array(n * n), A = new Float32Array(n * n), PU = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, e = Math.min(i % ts, ts - (i % ts), j % ts, ts - (j % ts)), p = sstep(0.56, 0.64, NP[k]), t = tone[Math.floor(j / ts) * T + Math.floor(i / ts)];
      PU[k] = p; A[k] = (0.26 + 0.08 * (N1[k] - 0.5) + 0.06 * (t - 0.5) - (e < 1.5 ? 0.12 : 0)) * (1 - 0.1 * p);
      H[k] = (e < 1.5 ? 0 : 0.5 + 0.2 * N2[k]) * (1 - 0.7 * p) + 0.35 * p;
    }
    return { map: img(n, n, (i, j, o, k) => grey(o, A[k], 0.96, 0.98, 1.04)), normal: nmap(H, n, 1.4), orm: ormMap(n, (k) => 0.2 + 0.1 * (N1[k] - 0.5) - 0.16 * PU[k], () => 0) };
  },
  grating(n = 256) {   // steel bar grating, 0.6 m tile: bars every 3 cm, cross rods every 10 cm
    const by = n / 20, bx = n / 6, H = new Float32Array(n * n), on = new Uint8Array(n * n), N = noise(n, 16, 16, 121, 2);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i, bar = (j % by) < 3 || (i % bx) < 2.5; on[k] = bar ? 1 : 0; H[k] = bar ? ((j % by) < 3 ? 1 : 0.8) : 0; }
    return { map: img(n, n, (i, j, o, k) => grey(o, on[k] ? 0.42 + 0.1 * N[k] : 0.03)), normal: nmap(H, n, 2.5), orm: ormMap(n, (k) => (on[k] ? 0.42 + 0.12 * N[k] : 0.9), (k) => (on[k] ? 0.9 : 0)) };
  },
  ceiltile(n = 256) {   // hanji-faced ceiling tiles 0.6 m (1.2 m tile)
    const NF = noise(n, 64, 64, 131, 2), NL = noise(n, 3, 3, 132, 3), ts = n / 2, H = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const e = Math.min(i % ts, ts - (i % ts), j % ts, ts - (j % ts)), k = j * n + i; H[k] = e < 1.5 ? 0 : 0.6 + 0.1 * NF[k]; }
    return { map: img(n, n, (i, j, o, k) => grey(o, (H[k] ? 0.9 + 0.04 * (NL[k] - 0.5) + 0.04 * (NF[k] - 0.5) : 0.5), 1, 0.97, 0.92)), normal: nmap(H, n, 1.2), orm: ormMap(n, () => 0.9, () => 0) };
  },
  epoxy(n = 256) {
    const N1 = noise(n, 4, 4, 141, 4), N2 = noise(n, 128, 128, 142, 1);
    return { map: img(n, n, (i, j, o, k) => grey(o, 0.5 + 0.08 * (N1[k] - 0.5) + (N2[k] > 0.85 ? 0.1 : 0))), orm: ormMap(n, (k) => 0.36 + 0.14 * (N1[k] - 0.5), () => 0) };
  },
  led(n = 512) {   // LED volume tiles: 0.5 m modules, 4 px pixel pitch; emissive is an abstract slow gradient
    const N1 = noise(n, 2, 2, 151, 3), N2 = noise(n, 3, 2, 152, 3), ms = n / 4;
    const pal = [[16, 4, 40], [138, 77, 255], [255, 79, 216], [77, 195, 255]];
    const col = (t) => { t = Math.max(0, Math.min(0.999, t)) * (pal.length - 1); const i = Math.floor(t), f = t - i; return pal[i].map((v, c) => v + (pal[i + 1][c] - v) * f); };
    const dot = (i, j) => { const a = i % 4, b = j % 4; return a > 0 && a < 3 && b > 0 && b < 3; };
    const seam = (i, j) => Math.min(i % ms, ms - (i % ms), j % ms, ms - (j % ms)) < 1.5;
    return {
      map: img(n, n, (i, j, o) => grey(o, seam(i, j) ? 0.02 : dot(i, j) ? 0.12 : 0.05)),
      emissive: img(n, n, (i, j, o, k) => { if (seam(i, j) || !dot(i, j)) { o[0] = o[1] = o[2] = 0; return; } const c = col(N1[k] * 0.8 + N2[k] * 0.5 - 0.15); o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; }),
      orm: ormMap(n, () => 0.38, () => 0),
    };
  },
  glassrain(n = 256) {   // dark glass with rain streaks and drops (RGBA, the alpha is the glass opacity)
    const R = rnd(161), H = new Float32Array(n * n), AL = new Float32Array(n * n).fill(0);
    for (let s = 0; s < 70; s++) {
      const x0 = R() * n, ph = R() * 6, amp = 1 + R() * 3, y0 = R() * n, len = n * (0.3 + R() * 0.7), w = 0.6 + R() * 1.2;
      for (let t = 0; t < len; t++) { const y = Math.floor((y0 + t) % n), x = x0 + amp * Math.sin(t * 0.045 + ph); for (let dx = -2; dx <= 2; dx++) { const xi = ((Math.floor(x) + dx) % n + n) % n, f = Math.max(0, 1 - Math.abs(xi - x) / w); if (f > 0) { const k = y * n + xi; H[k] = Math.max(H[k], f); AL[k] = Math.max(AL[k], f); } } }
    }
    for (let d = 0; d < 520; d++) { const cx = R() * n, cy = R() * n, r = 0.5 + R() * 1.1; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) { const dd = Math.hypot(i, j) / r; if (dd < 1) { const k = (((Math.floor(cy) + j) % n + n) % n) * n + (((Math.floor(cx) + i) % n + n) % n); H[k] = Math.max(H[k], Math.sqrt(1 - dd * dd)); AL[k] = Math.max(AL[k], 0.8); } } }
    const map = img(n, n, (i, j, o, k) => { o[0] = 26 + 30 * AL[k]; o[1] = 29 + 28 * AL[k]; o[2] = 40 + 30 * AL[k]; o[3] = (0.34 + 0.16 * AL[k]) * 255; });
    return { map, alpha: true, normal: nmap(H, n, 2.0), orm: ormMap(n, (k) => 0.05 + 0.12 * AL[k], () => 0) };
  },
  frit(n = 128) {   // dot frit (tempered tell): 8 x 8 dots on a 0.24 m tile
    const cs = n / 8;
    return { alpha: true, map: img(n, n, (i, j, o) => { const dx = (i % cs) - cs / 2 + 0.5, dy = (j % cs) - cs / 2 + 0.5, d = Math.hypot(dx, dy) / cs; if (d < 0.34) { o[0] = o[1] = o[2] = 10; o[3] = 240; } else { o[0] = 26; o[1] = 30; o[2] = 42; o[3] = 88; } }) };
  },
  slat(n = 256) {   // blast shutter slat: one slat per v repeat (v is set per slat), brushed dark plate with a pressed centre rib and rolled edges
    const N = noise(n, 2, 160, 201, 3), N2 = noise(n, 6, 6, 202, 3), H = new Float32Array(n * n);
    const prof = (v) => (v < 0.07 ? v / 0.07 * 0.5 : v > 0.93 ? (1 - v) / 0.07 * 0.5 : 0.5) + (Math.abs(v - 0.5) < 0.09 ? 0.35 * Math.cos(((v - 0.5) / 0.09) * Math.PI / 2) : 0);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i; H[k] = prof(j / n) + N[k] * 0.06; }
    return {
      map: img(n, n, (i, j, o, k) => { const v = j / n, seam = v < 0.03 || v > 0.97; grey(o, seam ? 0.1 : 0.55 + 0.1 * (N[k] - 0.5) + 0.07 * (N2[k] - 0.5)); }),
      normal: nmap(H, n, 3.0), orm: ormMap(n, (k) => 0.4 + 0.12 * (N[k] - 0.5) + 0.1 * (N2[k] - 0.5), () => 0.9),
    };
  },
  louvre(n = 256) {   // horizontal louvre slats every 10 cm (1.2 m tile)
    const sp = n / 12, N = noise(n, 4, 64, 171, 2), H = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const f = (j % sp) / sp; H[j * n + i] = f < 0.12 ? 0 : 1 - f * 0.6; }
    return { map: img(n, n, (i, j, o, k) => { const f = (j % sp) / sp; grey(o, f < 0.12 ? 0.04 : 0.5 - 0.3 * f + 0.06 * (N[k] - 0.5)); }), normal: nmap(H, n, 2.0), orm: ormMap(n, (k) => 0.42 + 0.1 * N[k], () => 0.85) };
  },
  windows(n = 512, tower = false) {   // facade seen from afar: 16 lites x 6 floors per tile (24 x 25.2 m), sparse lit lites
    const R = rnd(tower ? 185 : 181), N = noise(n, 8, 8, 182, 3), cols = 16, floors = 6, bx = n / cols, fy = n / floors, lit = [];
    for (let f = 0; f < floors; f++) {
      const occ = R() < 0.2 ? 0 : R() * (tower ? 0.45 : 0.6), cool = R() < (tower ? 0.15 : 0.35);
      for (let b = 0; b < cols; b++) { const r = R(); lit.push(r < occ ? (cool ? 2 : 1) + 0.4 + R() * 0.55 : R() < 0.012 ? 3.8 : 0); }
    }
    const cell = (i, j) => { const b = Math.floor(i / bx), f = Math.floor(j / fy), u = (i % bx) / bx, v = (j % fy) / fy; return { b, f, u, v, fin: b % 2 === 0 && u < 0.09, frame: u < 0.05 || u > 0.95 || v < 0.27, lit: lit[f * cols + b] }; };
    return {
      map: img(n, n, (i, j, o, k) => { const c = cell(i, j); grey(o, c.fin ? 0.16 : c.frame ? 0.05 : 0.08 + 0.05 * N[k], 0.92, 0.95, 1.18); }),
      emissive: img(n, n, (i, j, o, k) => {
        const c = cell(i, j);
        if (tower && c.fin && c.b % 6 === 0) { o[0] = 138; o[1] = 77; o[2] = 255; return; }
        if (c.frame || !c.lit) { o[0] = o[1] = o[2] = 0; return; }
        const kind = Math.floor(c.lit), e = (c.lit - kind) * (0.7 + 0.3 * N[k]) * (0.75 + 0.25 * c.v);
        const col = kind === 1 ? [255, 196, 136] : kind === 2 ? [176, 198, 255] : [168, 110, 255];
        o[0] = col[0] * e; o[1] = col[1] * e; o[2] = col[2] * e;
      }),
      orm: ormMap(n, (k) => 0.1 + 0.05 * N[k], () => 0.4),
    };
  },
  tower(n = 512) { return GEN.windows(n, true); },
  water(n = 256) {
    const N = noise(n, 6, 6, 191, 4), H = new Float32Array(n * n); for (let k = 0; k < H.length; k++) H[k] = N[k];
    return { map: img(n, n, (i, j, o) => grey(o, 0.06, 0.8, 0.95, 1.2)), normal: nmap(H, n, 1.6), orm: ormMap(n, () => 0.04, () => 0) };
  },
};
// abstract screen / hologram graphics (figures and shapes only, never text)
function abstractCanvas(seed, w = 512, h = 512, o = {}) {
  const c = cv(w, h), x = c.getContext('2d'), R = rnd(seed), hue = o.hue ?? 268;
  const g = x.createLinearGradient(0, 0, w * 0.3, h); g.addColorStop(0, `hsl(${hue},80%,${o.bg ?? 8}%)`); g.addColorStop(1, `hsl(${hue + 40},70%,${(o.bg ?? 8) + 6}%)`);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {   // flowing ribbons
    x.strokeStyle = `hsla(${hue + R() * 90 - 30},90%,${55 + R() * 20}%,${0.12 + R() * 0.2})`; x.lineWidth = 2 + R() * 14;
    x.beginPath(); x.moveTo(-20, R() * h); x.bezierCurveTo(w * 0.3, R() * h, w * 0.7, R() * h, w + 20, R() * h); x.stroke();
  }
  // a crystalline abstract figure: head and shoulders built from facets
  const cx = w * (0.35 + R() * 0.3), cy = h * 0.42, s = Math.min(w, h) * (0.22 + R() * 0.08);
  const pts = []; for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2, rr = s * (0.75 + R() * 0.35); pts.push([cx + Math.cos(a) * rr * 0.72, cy + Math.sin(a) * rr]); }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 3) % pts.length];
    x.fillStyle = `hsla(${hue + R() * 40},85%,${50 + R() * 30}%,${0.05 + R() * 0.12})`; x.beginPath(); x.moveTo(cx, cy); x.lineTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.fill();
    x.strokeStyle = `hsla(${hue + 20},90%,80%,0.25)`; x.lineWidth = 1; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke();
  }
  x.fillStyle = `hsla(${hue + 10},80%,60%,0.12)`; x.beginPath(); x.ellipse(cx, cy + s * 2.0, s * 1.6, s * 0.9, 0, Math.PI, 0); x.fill();
  for (let i = 0; i < 260; i++) { x.fillStyle = `hsla(${hue + R() * 60},100%,80%,${R() * 0.5})`; const r = R() * 2.2; x.fillRect(R() * w, R() * h, r, r); }
  x.globalCompositeOperation = 'source-over';
  x.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < h; y += 3) x.fillRect(0, y, w, 1);   // scanlines
  return c;
}

/* ------------------------------------------------------------------ materials */

const M = {}, TX = {};
function asTex(c, srgb, name, jpeg = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.name = name;
  t.userData.mimeType = jpeg ? 'image/jpeg' : 'image/png';
  return t;
}
function texSet(name, gen) {
  if (TX[name]) return TX[name];
  const g = GEN[gen](), s = {};
  s.map = asTex(g.map, true, name + '_albedo', !g.alpha);
  if (g.normal) s.normal = asTex(g.normal, false, name + '_normal');
  if (g.orm) s.orm = asTex(g.orm, false, name + '_orm');
  if (g.emissive) s.emissive = asTex(g.emissive, true, name + '_emissive');
  s.alpha = !!g.alpha;
  return (TX[name] = s);
}
const tileOf = (mk) => (M[mk] ? M[mk].userData.tile : 1);
// a PBR material on a texture set. o: color, rough, metal, emissive, ei, ns (normal scale), tile (metres per repeat),
// env ('in' warm interior env, 'out' night city env), opacity, side
function mat(key, set, o = {}) {
  const p = { name: key, color: o.color || '#ffffff' };
  if (set && set.map) p.map = set.map;
  if (set && set.normal) p.normalMap = set.normal;
  if (set && set.orm) { p.roughnessMap = set.orm; p.metalnessMap = set.orm; p.roughness = o.rough ?? 1; p.metalness = o.metal ?? 1; }
  else { p.roughness = o.rough ?? 0.6; p.metalness = o.metal ?? 0; }
  if (set && set.emissive) { p.emissiveMap = set.emissive; p.emissive = new THREE.Color(o.emissive || '#ffffff'); p.emissiveIntensity = o.ei ?? 1; }
  else if (o.emissive) { p.emissive = new THREE.Color(o.emissive); p.emissiveIntensity = o.ei ?? 1; }
  if (o.opacity != null || (set && set.alpha)) { p.transparent = true; p.opacity = o.opacity ?? 1; p.depthWrite = false; }
  if (o.side) p.side = o.side;
  const m = new THREE.MeshStandardMaterial(p);
  if (set && set.normal) m.normalScale.set(o.ns ?? 1, o.ns ?? 1);
  m.userData = { tile: o.tile || 1, env: o.env || 'in', envI: o.envI ?? 1, ei: p.emissiveIntensity || 0 };
  M[key] = m;
  return m;
}
function buildMaterials() {
  const t0 = performance.now();
  const S = (name, gen) => texSet(name, gen);
  // structure
  mat('concrete_board', S('board', 'board'), { color: '#8e8d92', tile: 2.4, ns: 0.9 });   // every hard wall: honed granite panels
  mat('concrete', S('polished', 'polished'), { color: '#9a9893', tile: 3, ns: 0.6 });
  mat('concrete_dark', S('polished', 'polished'), { color: '#5d5b57', tile: 3, ns: 0.6, env: 'out' });
  mat('alloy', S('brushed', 'brushed'), { color: '#5a5e66', tile: 0.8, ns: 0.5, env: 'out' });
  mat('steel_dark', S('brushed', 'brushed'), { color: '#2a2b30', tile: 0.8, ns: 0.5 });
  mat('bronze', S('brushed', 'brushed'), { color: '#6e4c33', tile: 0.8, ns: 0.5 });
  mat('lift_steel', S('brushed', 'brushed'), { color: '#c3c6cc', tile: 0.8, ns: 0.4 });
  mat('louvre', S('louvre', 'louvre'), { color: '#4a4e56', tile: 1.2, env: 'out' });
  mat('shutter_armour', S('slat', 'slat'), { color: '#8c919b', tile: [1.5, 1], ns: 0.9, env: 'in', envI: 1.1 });   // blast shutter slats (v = one slat)
  // soft walls: hanji paper panels on dark battens with a warm backlight
  mat('hanji', S('hanji', 'hanji'), { tile: 1.2, emissive: '#ffffff', ei: 0.14, ns: 0.8 });
  mat('hanji_spa', S('hanji_spa', 'hanji_spa'), { tile: 1.2, emissive: '#ffffff', ei: 0.14, ns: 0.8 });
  mat('hanji_bar', S('hanji_bar', 'hanji_bar'), { tile: 1.2, emissive: '#ffffff', ei: 0.16, ns: 0.8 });
  mat('wood', S('wood', 'wood'), { color: '#d29f72', tile: 1.2, ns: 0.8 });
  mat('wood_dark', S('wood', 'wood'), { color: '#5e4030', tile: 1.2, ns: 0.8 });
  mat('plaster', S('plaster', 'plaster'), { color: '#f2ebe0', tile: 2 });
  mat('gypsum', S('plaster', 'plaster'), { color: '#bdbab3', tile: 2 });
  mat('acoustic', S('acoustic', 'acoustic'), { color: '#8a84a2', tile: 1.2, ns: 0.9 });
  // floors
  mat('carpet', S('carpet', 'carpet'), { color: '#6c6b72', tile: 2.4 });
  mat('carpet_indigo', S('carpet', 'carpet'), { color: '#4f5592', tile: 2.4 });
  mat('terrazzo', S('terrazzo', 'terrazzo'), { color: '#ffffff', tile: 1.6 });
  mat('stone', S('paver', 'paver'), { color: '#d2c8b8', tile: 2.4 });
  mat('stone_warm', S('paver', 'paver'), { color: '#e0b890', tile: 2.4 });
  mat('stone_dark', S('paver', 'paver'), { color: '#77706a', tile: 2.4 });
  mat('stone_dry', S('drystone', 'drystone'), { color: '#c4bbae', tile: 2.0, ns: 1.0 });
  mat('stone_wet', S('wetpaver', 'wetpaver'), { color: '#c8ccd6', tile: 3.6, env: 'out', envI: 1.7 });
  mat('grating', S('grating', 'grating'), { color: '#9a9ea6', tile: 0.6, env: 'out' });
  mat('epoxy', S('epoxy', 'epoxy'), { color: '#7c817f', tile: 3 });
  mat('ceiling', S('ceiltile', 'ceiltile'), { color: '#b8ab9a', tile: 1.2 });
  mat('ceiling_dark', S('ceiltile', 'ceiltile'), { color: '#4c4d55', tile: 1.2 });
  mat('led', S('led', 'led'), { tile: 2.0, emissive: '#ffffff', ei: 1.3 });
  // glass: tempered facade lites (rain streaks), frit border, breakable lites, interior glass
  mat('glass_t', S('glassrain', 'glassrain'), { color: '#ffffff', tile: 1.6, env: 'out', envI: 1.4, ns: 0.25 });
  mat('glass_frit', S('frit', 'frit'), { tile: 0.24, env: 'out', rough: 0.2, metal: 0 });
  mat('glass_b', S('glassrain', 'glassrain'), { color: '#b9c8e6', tile: 1.6, env: 'out', envI: 1.2, opacity: 0.7, ns: 0.25 });
  mat('glass_e', S('glassrain', 'glassrain'), { color: '#d9c6f2', tile: 1.6, env: 'out', envI: 1.1, opacity: 0.6, ns: 0.25 });
  mat('hatch_plate', S('brushed', 'brushed'), { color: '#6a6e78', tile: 0.6, ns: 0.6, rough: 0.75, metal: 0.55 });
  mat('ceil_hatch', S('hanji', 'hanji'), { color: '#f2e6d2', tile: 1.2, emissive: '#ffffff', ei: 0.35, ns: 0.6 });
  mat('patch_board', S('wood', 'wood'), { color: '#8a6a4a', tile: 2.4, ns: 0.9 });
  mat('glass_i', S('glassrain', 'glassrain'), { color: '#e4ecf6', tile: 1.6, env: 'out', envI: 0.8, opacity: 0.42, ns: 0.1 });
  // emissive accents (no textures)
  mat('glow_purple', null, { color: '#1a0b33', emissive: '#8a4dff', ei: 3.2, rough: 0.4 });
  mat('glow_pink', null, { color: '#2a0920', emissive: '#ff4fd8', ei: 2.6, rough: 0.4 });
  mat('glow_warm', null, { color: '#3a3026', emissive: '#ffcf9a', ei: 1.3, rough: 0.5 });
  mat('glow_cool', null, { color: '#2a2e36', emissive: '#dfe8ff', ei: 1.0, rough: 0.5 });
  mat('glow_down', null, { color: '#3a3026', emissive: '#ffc890', ei: 1.6, rough: 0.5 });
  for (const [k, c, e] of [['pool_warm', '#ffc890', 0.5], ['pool_purple', '#9a5cff', 0.6], ['pool_blue', '#5a8cff', 0.55], ['pool_cool', '#dfe8ff', 0.35]]) { mat(k, S('pool', 'pool'), { color: '#000000', emissive: c, ei: e, rough: 1, metal: 0 }); M[k].polygonOffset = true; M[k].polygonOffsetFactor = -2; }
  mat('ceil_wood', S('wood', 'wood'), { color: '#4a3326', tile: 1.2, ns: 0.8 });
  mat('dz_onyx', S('polished', 'polished'), { color: '#e8c9a0', tile: 1.4, emissive: '#ffb070', ei: 0.55, rough: 0.25 });
  mat('glow_amber', null, { color: '#2a1a06', emissive: '#ffa040', ei: 1.6, rough: 0.5 });
  mat('deck_wet', S('wetpaver', 'wetpaver'), { color: '#5d6068', tile: 2.4, env: 'out', envI: 1.7 });
  mat('corten', S('corten', 'corten'), { color: '#c8b0a0', tile: 1.2, ns: 0.7, env: 'out' });
  mat('glow_red', null, { color: '#250606', emissive: '#ff3a30', ei: 2.4, rough: 0.5 });
  // backdrop and misc
  mat('env_facade', S('windows', 'windows'), { tile: [24, 25.2], emissive: '#ffffff', ei: 0.85, env: 'out', envI: 1.2 });
  mat('tower_facade', S('tower', 'tower'), { tile: [24, 25.2], emissive: '#ffffff', ei: 0.9, env: 'out', envI: 1.3 });
  mat('glow_street', null, { color: '#2a2016', emissive: '#ffcf96', ei: 0.9, rough: 0.5 });
  mat('water', S('water', 'water'), { color: '#9ab0c8', tile: 4, env: 'out', envI: 1.4, ns: 0.6 });
  mat('black', null, { color: '#0b0b0d', rough: 0.9 });
  mat('rubber', null, { color: '#17171a', rough: 0.85 });
  mat('holo', { map: null }, { color: '#000000', emissive: '#ffffff', ei: 1.6, opacity: 0.32, side: THREE.DoubleSide });
  M.holo.blending = THREE.AdditiveBlending;   // light only: a dark texel never darkens the stage behind (no black slab edge-on)
  {
    const t = asTex(abstractCanvas(7, 512, 512, { hue: 268 }), true, 'holo_abstract'); TX.holo = t;
    M.holo.emissiveMap = t; M.holo.map = t; M.holo.depthWrite = false; M.holo.blending = THREE.AdditiveBlending; M.holo.userData.tile = 1;
  }
  return Math.round(performance.now() - t0);
}

/* ------------------------------------------------------------------ registry: typed nodes, empties, viewer objects */
// node(): one exported node per gameplay surface. parts[materialKey] = GB in world coordinates. frame (optional
// THREE.Matrix4) is the node's transform in the export (geometry is stored relative to it).
const REG = [], EMPT = [], BYNAME = new Map(), VIEWONLY = [], TICKS = [], LIGHTS = [];
let JOURNAL = null;   // undo list while a dressing part runs
const STATS = { warnings: [] };
function uniq(name) {
  if (!BYNAME.has(name)) return name;
  let k = 2; while (BYNAME.has(name + '_' + k)) k++;
  STATS.warnings.push('duplicate node name ' + name);
  return name + '_' + k;
}
function node(name, surface, fid, o = {}) {
  name = uniq(name);
  const e = {
    name, surface, fid: fid || null, fk: o.fk || fid || 'X', layer: o.layer || 'struct', ov: o.ov || surface, group: o.group || 'STRUCT',
    extras: Object.assign({ surface, id: o.id || name }, fid ? { floor: fid } : {}, o.extras || {}), frame: o.frame || null, parts: {},
    deco: !!o.deco, env: !!o.env, export: o.export !== false, display: o.display !== false, own: !!o.own, part: o.part || null,
  };
  e.gb = (mk) => e.parts[mk] || (e.parts[mk] = new GB(tileOf(mk)));
  REG.push(e); BYNAME.set(name, e);
  if (JOURNAL) JOURNAL.push(() => { const i = REG.indexOf(e); if (i >= 0) REG.splice(i, 1); BYNAME.delete(name); });
  return e;
}
// empty marker node for the export (slots, spawns, objectives, callouts, zones, colliders)
function empty(name, o = {}) {
  name = uniq(name);
  const e = { name, fk: o.fk || 'X', group: o.group || 'MARKERS', pos: o.pos || [0, 0, 0], quat: o.quat || null, scale: o.scale || null, extras: o.extras || {}, parent: o.parent || null, kind: o.kind || 'marker' };
  EMPT.push(e); BYNAME.set(name, e);
  if (JOURNAL) JOURNAL.push(() => { const i = EMPT.indexOf(e); if (i >= 0) EMPT.splice(i, 1); BYNAME.delete(name); });
  return e;
}
const quatOf = (m) => new THREE.Quaternion().setFromRotationMatrix(m).toArray().map(r3);
// box collider / trigger as an empty: position = centre, rotation = yaw, scale = size (Unity: BoxCollider size 1)
function colBox(name, c, size, yawDeg = 0, o = {}) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(yawDeg)).toArray().map(r3);
  return empty(name, Object.assign({ group: 'COLLIDERS', pos: c.map(r3), quat: q, scale: size.map(r3), kind: 'box' }, o));
}
const yawOf = (d) => THREE.MathUtils.radToDeg(Math.atan2(d[0], d[1]));   // plan direction -> yaw about +Y (0 = +z)

/* ------------------------------------------------------------------ finishes and ceilings per room (parts may override) */

const FINISH_RULES = [
  [/_lifts$/, 'terrazzo'], [/stair_|_shaft$|riser|lifts_|cold_store/, 'concrete'],
  [/_garden$/, 'stone_dark'], [/veranda|spa_hall|suite_bath/, 'stone'], [/ondol|salt_room/, 'stone_warm'],
  [/tea_room|dining|lounge_bar|cigar|exec_office|boardroom|suite_lounge|locker|treatment/, 'wood'],
  [/changing|steam|bathhouse|wine_room|concierge|deposit/, 'stone_dark'],
  [/kitchen|servery|laundry|plant_room|staff_entry|service_hall|canteen|_studio$|backstage/, 'epoxy'],
  [/river_lounge|vip|noraebang|booth|bedroom|screening|foyer|projection/, 'carpet_indigo'],
  [/control|render|edit|news|podcast|archive|writers|media_hall|green_room|makeup|wardrobe|cloak/, 'carpet'],
  [/./, 'terrazzo'],
];
const CEIL_RULES = [
  [/ondol|tea_room|lounge_bar|cigar|wine_room|suite_lounge|exec_office|boardroom/, 'ceil_wood'], [/deposit|concierge/, 'ceiling_dark'],
  [/kitchen|servery|laundry|plant_room|staff_entry|service_hall|canteen|backstage|control|render|edit|news|podcast|archive|writers|media_hall|projection|studio_void|screening/, 'ceiling_dark'],
  [/_lifts$/, 'plaster'], [/./, 'ceiling'],
];
const ruleFor = (rules, id) => rules.find(([re]) => re.test(id))[1];
const FINISH = new Map(), CEILMAT = new Map();
for (const r of L.rooms) { FINISH.set(r.id, ruleFor(FINISH_RULES, r.id)); CEILMAT.set(r.id, ruleFor(CEIL_RULES, r.id)); }

/* ------------------------------------------------------------------ holes in each slab */

function slabHoles(fid) {
  const H = [];
  for (const v of L.voids) if (v.floor === fid) H.push({ poly: v.polygon, kind: 'void', id: v.id });
  for (const s of L.slab_openings) if (s.floor === fid || (s.floor === 'all' && fid !== FIDS[0])) H.push({ poly: s.polygon, kind: 'opening', id: s.id, rail: s.rail });
  for (const h of L.hatches) if (h.floor === fid) H.push({ poly: sqP(h.x, h.z, h.size / 2), kind: 'hatch', id: h.id });
  for (const p of L.floor_patches) if (p.floor === fid) H.push({ poly: rectP(p.x - p.w / 2, p.z - p.d / 2, p.x + p.w / 2, p.z + p.d / 2), kind: 'patch', id: p.id });
  return H;
}

/* ------------------------------------------------------------------ walls */

// wall frame: point at (u along a->b, y above the floor, s along the normal n)
function wallFrame(w) {
  const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], len = Math.hypot(dx, dz);
  return { a: w.a, len, d: [dx / len, 0, dz / len], n: [w.n[0], 0, w.n[1]], y: FY(w.floor), t: w.thickness };
}
const wp = (F, u, y, s = 0) => [F.a[0] + F.d[0] * u + F.n[0] * s, F.y + y, F.a[1] + F.d[2] * u + F.n[2] * s];
function wbox(g, F, u0, u1, y0, y1, s0, s1, skip = '') {
  if (u1 - u0 < 1e-6 || y1 - y0 < 1e-6 || s1 - s0 < 1e-6) return;
  obox(g, wp(F, (u0 + u1) / 2, (y0 + y1) / 2, (s0 + s1) / 2), F.d, AY, F.n, [(u1 - u0) / 2, (y1 - y0) / 2, (s1 - s0) / 2], skip);
}
// rectangles covering [U0, U1] x [Y0, Y1] minus holes {u0, u1, y0, y1}, merged along u where possible
function rectMinus(U0, U1, Y0, Y1, holes) {
  const us = [U0, U1];
  for (const h of holes) for (const u of [h.u0, h.u1]) if (u > U0 + 1e-6 && u < U1 - 1e-6) us.push(u);
  us.sort((a, b) => a - b);
  const out = []; let prev = [];
  for (let i = 0; i < us.length - 1; i++) {
    const a = us[i], b = us[i + 1]; if (b - a < 1e-6) continue;
    const m = (a + b) / 2; let ys = [[Y0, Y1]];
    for (const h of holes) if (h.u0 < m && h.u1 > m) ys = idiff(ys, [[Math.max(Y0, h.y0), Math.min(Y1, h.y1)]]);
    const cur = [];
    for (const [y0, y1] of ys) {
      const p = prev.find((r) => Math.abs(r.y0 - y0) < 1e-6 && Math.abs(r.y1 - y1) < 1e-6 && Math.abs(r.u1 - a) < 1e-6);
      if (p) { p.u1 = b; cur.push(p); } else { const r = { u0: a, u1: b, y0, y1 }; out.push(r); cur.push(r); }
    }
    prev = cur;
  }
  return out;
}
// how far each wall end runs past its end point: L corners get the other wall's half thickness on one wall (no notch),
// ends on the curtain wall stop 6 cm inside the glass
function wallExtensions() {
  const ext = new Map(); for (const w of L.walls) ext.set(w.id, [0, 0]);
  const pri = { hard: 4, reinforceable: 3, soft: 2, glass: 1, balustrade: 0 };
  const dir = (w) => P2.norm(P2.sub(w.b, w.a));
  for (const f of FIDS) {
    const ends = new Map();
    for (const w of L.walls) {
      if (w.floor !== f || w.type === 'open') continue;
      [[0, w.a], [1, w.b]].forEach(([end, p]) => { const k = p[0].toFixed(3) + ',' + p[1].toFixed(3); if (!ends.has(k)) ends.set(k, []); ends.get(k).push({ w, end }); });
    }
    for (const list of ends.values()) {
      if (list.length !== 2) continue;
      const [A, B] = list, da = dir(A.w), db = dir(B.w);
      if (Math.abs(P2.dot(da, db)) > 0.99) continue;
      const aWins = pri[A.w.type] > pri[B.w.type] || (pri[A.w.type] === pri[B.w.type] && (A.w.thickness > B.w.thickness || (A.w.thickness === B.w.thickness && A.w.id < B.w.id)));
      const [X, Y] = aWins ? [A, B] : [B, A];
      const e = ext.get(X.w.id); e[X.end] = Math.max(e[X.end], Y.w.thickness / 2);
    }
  }
  for (const w of L.walls) [[0, w.a], [1, w.b]].forEach(([end, p]) => { if (outlineDist(p) < 0.02) ext.get(w.id)[end] = -0.06; });
  return ext;
}
// soft partitions by programme: hanji changsal in hotel and spa rooms, dark acoustic fabric on the media floor,
// painted gypsum in back of house (all thin partitions; studs show at the door returns)
const MEDIA = /control|render|edit|news|podcast|archive|writers|media_hall|green_room|makeup|wardrobe|screening|projection|studio|booth|noraebang/;
const SPA = /spa|bath|steam|tea_room|ondol|salt|changing|locker|treatment|veranda|garden/, BARW = /lounge_bar|wine|cigar|dining|cellar/;
const FACE_OF = (rid) => {
  if (!rid) return null;
  const R = ROOM.get(rid);
  if (MEDIA.test(rid)) return 'acoustic';
  if (BOH.test(rid)) return 'gypsum';
  if (!R || R.kind === 'corridor') return null;
  return SPA.test(rid) ? 'hanji_spa' : BARW.test(rid) ? 'hanji_bar' : 'hanji';
};
// one finish per face: [pos face, neg face]; a corridor face takes the room's finish on the other side
const SOFT_FACES = (w) => {
  let p = FACE_OF(w.side_pos), n = FACE_OF(w.side_neg);
  if (!p && !n) { const c = [w.side_pos, w.side_neg].filter(Boolean); p = n = c.some((r) => BOH.test(r)) ? 'gypsum' : c.some((r) => MEDIA.test(r)) ? 'acoustic' : 'hanji'; }
  return [p || n, n || p];
};
const SOFT_FACE = (w) => { const [p, n] = SOFT_FACES(w); return p === 'acoustic' || n === 'acoustic' ? 'acoustic' : p === 'gypsum' ? n : p; };
const WALL_FACE = (w) => {
  if (w.core || w.column_wrap) return 'concrete_board';
  const n = (w.note || '').toLowerCase();
  if (n.includes('stone') || w.id === 'F2_W32') return 'stone_dry';
  if (n.includes('led')) return 'led';
  if (n.includes('cold store')) return 'lift_steel';
  return 'concrete_board';
};
function wallExtras(w) {
  return {
    type: w.type, wall: w.id, a: w.a, b: w.b, length: w.length, thickness: w.thickness, y0: w.y0, y1: w.y1, floor_y: FY(w.floor), n: w.n,
    rooms: [w.side_pos, w.side_neg], note: w.note || undefined, core: w.core || undefined, column_wrap: w.column_wrap || undefined,
    openings: w.openings.map((o) => ({ id: o.id, kind: o.kind, u0: o.u0, u1: o.u1, y0: o.y0, y1: o.y1, barricadable: o.barricadable })),
  };
}
// door and window casings (both faces), counters, slots
function openingTrim(e, F, w, o, frameMat) {
  const t = F.t, c = 0.06, p = 0.014, g = e.gb(frameMat);
  for (const sg of [1, -1]) {
    const s0 = sg > 0 ? t / 2 : -t / 2 - p, s1 = sg > 0 ? t / 2 + p : -t / 2;
    wbox(g, F, o.u0 - c, o.u0, o.y0 > 0.01 ? o.y0 - c : 0, Math.min(o.y1 + c, w.y1), s0, s1);
    wbox(g, F, o.u1, o.u1 + c, o.y0 > 0.01 ? o.y0 - c : 0, Math.min(o.y1 + c, w.y1), s0, s1);
    if (o.y1 < w.y1 - 0.01) wbox(g, F, o.u0, o.u1, o.y1, Math.min(o.y1 + c, w.y1), s0, s1);
    if (o.y0 > 0.01) wbox(g, F, o.u0, o.u1, o.y0 - c, o.y0, s0, s1);
  }
  if (o.kind === 'vault') wbox(e.gb('wood'), F, o.u0, o.u1, o.y0 - 0.05, o.y0, -t / 2 - 0.18, t / 2 + 0.18);
  if (o.y0 < 0.01 && w.type !== 'balustrade') wbox(e.gb('steel_dark'), F, o.u0, o.u1, 0, 0.012, -t / 2, t / 2);   // threshold
}
function openingSlot(w, F, o) {
  const kind = o.barricadable ? (o.kind === 'window' ? 'window_barricadable' : 'door_barricadable') : 'opening';
  const pre = kind === 'door_barricadable' ? 'BARR_D_' : kind === 'window_barricadable' ? 'BARR_W_' : 'OPEN_';
  const m = frameZ(wp(F, (o.u0 + o.u1) / 2, 0, 0), [F.n[0], F.n[2]]);
  empty(pre + o.id, {
    fk: w.floor, group: 'SLOTS', pos: [m.elements[12], m.elements[13], m.elements[14]].map(r3), quat: quatOf(m),
    extras: { surface: kind, id: o.id, floor: w.floor, wall: w.id, kind: o.kind, w: r3(o.u1 - o.u0), h: r3(o.y1 - o.y0), y0: o.y0, y1: o.y1, u0: o.u0, u1: o.u1, rooms: [w.side_pos, w.side_neg], facing: '+Z = wall normal n (side_pos room)' },
  });
  SLOTS.push({ fk: w.floor, kind, F, o, w });
}
const SLOTS = [];
function buildWall(w, ext) {
  if (w.type === 'open') return;
  const F = wallFrame(w), t = w.thickness, [ea, eb] = ext.get(w.id), U0 = -ea, U1 = F.len + eb;
  const holes = w.openings.map((o) => ({ u0: o.u0, u1: o.u1, y0: o.y0, y1: o.y1 }));
  const base = { fk: w.floor, group: 'STRUCT', id: w.id };
  if (w.type === 'soft') {
    const e = node('SOFT_' + w.id, 'soft', w.floor, Object.assign({ extras: wallExtras(w) }, base));
    const [fp, fn] = SOFT_FACES(w), gp = { z: e.gb(fp), x: e.gb('wood_dark'), y: e.gb('wood_dark') }, gn = { z: e.gb(fn), x: e.gb('wood_dark'), y: e.gb('wood_dark') };
    const rects = rectMinus(U0, U1, w.y0, w.y1, holes);
    for (const r of rects) {
      if (fp === fn) wbox(gp, F, r.u0, r.u1, r.y0, r.y1, -t / 2, t / 2, r.y0 < 0.01 ? '-y' : '');
      else { wbox(gp, F, r.u0, r.u1, r.y0, r.y1, 0, t / 2, r.y0 < 0.01 ? '-y' : ''); wbox(gn, F, r.u0, r.u1, r.y0, r.y1, -t / 2, 0, r.y0 < 0.01 ? '-y' : ''); }
    }
    e.extras.pieces = rects.map((r) => [r3(r.u0), r3(r.u1), r3(r.y0), r3(r.y1)]);
    for (const o of w.openings) openingTrim(e, F, w, o, 'wood_dark');
  } else if (w.type === 'reinforceable') {
    const R = w.reinforce, ds = R.defender_side === 'pos' ? 1 : -1;
    const hard = node('HARD_' + w.id + '_hdr', 'hard', w.floor, Object.assign({ extras: Object.assign(wallExtras(w), { role: 'reinforce trims, transom and bulkhead (hard)', reinforce_wall: w.id }) }, base));
    const panels = R.panels.map((p) => ({ u0: p.u0, u1: p.u1, y0: R.y0, y1: R.y1 }));
    const rects = rectMinus(U0, U1, w.y0, w.y1, [...holes, ...panels]);
    for (const r of rects) {
      const fm = r.y0 >= R.y1 - 1e-6 ? 'bronze' : 'steel_dark';
      wbox({ z: hard.gb(fm), x: hard.gb('steel_dark'), y: hard.gb('steel_dark') }, F, r.u0, r.u1, r.y0, r.y1, -t / 2, t / 2, r.y0 < 0.01 ? '-y' : '');
    }
    // transom bar on both faces at the top of the unit zone
    for (const sg of [1, -1]) for (const r of rectMinus(U0, U1, R.y1 - 0.03, R.y1 + 0.05, holes)) wbox(hard.gb('steel_dark'), F, r.u0, r.u1, r.y0, r.y1, sg > 0 ? t / 2 : -t / 2 - 0.012, sg > 0 ? t / 2 + 0.012 : -t / 2);
    for (const o of w.openings) openingTrim(hard, F, w, o, 'steel_dark');
    R.panels.forEach((p, k) => {
      const nd = [F.n[0] * ds, F.n[2] * ds], org = wp(F, (p.u0 + p.u1) / 2, 0, (ds * t) / 2), fr = frameZ(org, nd);
      const e = node('REINF_' + w.id + '_' + k, 'reinforceable', w.floor, {
        fk: w.floor, group: 'STRUCT', id: w.id + '_' + k, frame: fr,
        extras: {
          wall: w.id, panel: k, size: p.size, width: r3(p.u1 - p.u0), height: R.y1 - R.y0, u0: p.u0, u1: p.u1, site: R.site, defender_side: R.defender_side,
          defender_room: ds > 0 ? w.side_pos : w.side_neg, attack_room: ds > 0 ? w.side_neg : w.side_pos, thickness: t, far_side_z: R.far_side_z,
          gadget: 'wall-fortification-' + p.size, placement: 'node origin = unit origin (bottom centre on the defender face); +Z faces the defender room; set the unit far_side z to far_side_z',
          reinforce: { panels: R.panels, clear: R.clear, trim: R.trim, defender_side: R.defender_side, n: w.n, thickness: t, far_side_z: R.far_side_z, units: R.units },
        },
      });
      wbox({ z: e.gb(SOFT_FACE(w)), x: e.gb('wood_dark'), y: e.gb('wood_dark') }, F, p.u0, p.u1, R.y0, R.y1, -t / 2, t / 2, '-y');
      // unit seams: dark joints at both panel edges, both faces
      for (const sg of [1, -1]) for (const u of [p.u0, p.u1 - 0.022]) wbox(e.gb('steel_dark'), F, u, u + 0.022, R.y0, R.y1 - 0.03, sg > 0 ? t / 2 : -t / 2 - 0.006, sg > 0 ? t / 2 + 0.006 : -t / 2);
      UNITS.push({ wall: w, F, p, ds, fk: w.floor });
    });
  } else if (w.type === 'hard') {
    const fm = WALL_FACE(w);
    const e = node('HARD_' + w.id, 'hard', w.floor, Object.assign({ extras: wallExtras(w) }, base));
    const edge = fm === 'led' ? 'black' : fm;
    for (const r of rectMinus(U0, U1, w.y0, w.y1, holes)) wbox({ z: e.gb(fm), x: e.gb(edge), y: e.gb(edge) }, F, r.u0, r.u1, r.y0, r.y1, -t / 2, t / 2, r.y0 < 0.01 ? '-y' : '');
    for (const o of w.openings) if (o.kind !== 'lift_door') openingTrim(e, F, w, o, 'steel_dark');
  } else if (w.type === 'glass') {
    const e = node('GLASSI_' + w.id, 'glass', w.floor, Object.assign({ extras: wallExtras(w) }, base));
    const fr = e.gb('steel_dark');
    for (const r of rectMinus(U0, U1, w.y0, w.y1, holes)) {
      wbox(e.gb('glass_i'), F, r.u0, r.u1, r.y0 + (r.y0 < 0.01 ? 0.06 : 0), r.y1 - (r.y1 > w.y1 - 0.01 ? 0.05 : 0), -0.012, 0.012);
      if (r.y0 < 0.01) wbox(fr, F, r.u0, r.u1, 0, 0.06, -t / 2, t / 2, '-y');
      if (r.y1 > w.y1 - 0.01) wbox(fr, F, r.u0, r.u1, w.y1 - 0.05, w.y1, -t / 2, t / 2);
      const nm = Math.max(1, Math.round((r.u1 - r.u0) / 1.5));
      for (let k = 0; k <= nm; k++) { const u = r.u0 + ((r.u1 - r.u0) * k) / nm; wbox(fr, F, Math.max(r.u0, u - 0.025), Math.min(r.u1, u + 0.025), r.y0, r.y1, -t / 2, t / 2); }
    }
    for (const o of w.openings) openingTrim(e, F, w, o, 'steel_dark');
    // drywall bulkhead from the glass head to the slab above: closes the plenum over the glazing (soft)
    const top = F2F - SLAB;
    if (w.y1 < top - 0.01) {
      const b = node('HARD_' + w.id + '_bulk', 'hard', w.floor, Object.assign({ extras: Object.assign(wallExtras(w), { type: 'hard', role: 'plenum bulkhead over interior glass', y0: w.y1, y1: top }) }, base, { id: w.id + '_bulk' }));
      wbox({ z: b.gb('plaster'), x: b.gb('plaster'), y: b.gb('plaster') }, F, U0, U1, w.y1, top, -t / 2, t / 2);
    }
  } else if (w.type === 'balustrade') {
    const e = node('RAIL_' + w.id, 'balustrade', w.floor, Object.assign({ extras: Object.assign(wallExtras(w), { height: w.y1 }) }, base));
    for (const r of rectMinus(U0, U1, w.y0, w.y1, holes)) {
      wbox(e.gb('steel_dark'), F, r.u0, r.u1, 0, 0.1, -0.05, 0.05, '-y');
      wbox(e.gb('glass_i'), F, r.u0, r.u1, 0.1, w.y1 - 0.06, -0.01, 0.01);
      wbox(e.gb('alloy'), F, r.u0, r.u1, w.y1 - 0.06, w.y1, -0.035, 0.035);
    }
  }
  for (const o of w.openings) {
    if (w.type === 'balustrade') continue;
    openingSlot(w, F, o);
    if (o.kind === 'lift_door') liftDoor(F, o, true);
  }
}
const UNITS = [];
// closed lift doors (decoration on the lobby faces) and the pried door into the service shaft
function liftDoor(F, o, pried = false) {
  const e = decoNode(floorOfY(F.y), 'lift');
  const t = F.t, s0 = t / 2;
  const w = o.u1 - o.u0, h = o.y1 - o.y0;
  wbox(e.gb('steel_dark'), F, o.u0 - 0.08, o.u0, 0, h + 0.08, s0, s0 + 0.03);
  wbox(e.gb('steel_dark'), F, o.u1, o.u1 + 0.08, 0, h + 0.08, s0, s0 + 0.03);
  wbox(e.gb('steel_dark'), F, o.u0, o.u1, h, h + 0.08, s0, s0 + 0.03);
  if (pried) {   // the two leaves forced apart, a gap in the middle
    wbox(e.gb('lift_steel'), F, o.u0 - 0.02, o.u0 + w * 0.18, 0.01, h, s0 - 0.06, s0 - 0.03);
    wbox(e.gb('lift_steel'), F, o.u1 - w * 0.18, o.u1 + 0.02, 0.01, h, s0 - 0.06, s0 - 0.03);
  }
}
const floorOfY = (y) => { let best = FIDS[0]; for (const f of FIDS) if (y >= FY(f) - 0.5) best = f; return best; };
// lift banks: closed stainless doors with a pictogram indicator, on the lobby side of the solid lift rooms
function buildLiftBanks() {
  for (const f of FIDS) {
    const y = FY(f), e = decoNode(f, 'lifts');
    const banks = [{ z: -2 + 0.15, n: 1, xs: [-4.5, -1.5, 1.5] }, { z: 2 - 0.15, n: -1, xs: [-1.5, 1.5, 4.5] }];
    for (const b of banks) for (const x of b.xs) {
      const zf = b.z, sz = b.n;
      abox(e.gb('steel_dark'), x - 0.68, x + 0.68, y, y + 2.36, Math.min(zf, zf + sz * 0.04), Math.max(zf, zf + sz * 0.04));
      abox(e.gb('lift_steel'), x - 0.55, x - 0.005, y, y + 2.2, Math.min(zf, zf + sz * 0.05), Math.max(zf, zf + sz * 0.05));
      abox(e.gb('lift_steel'), x + 0.005, x + 0.55, y, y + 2.2, Math.min(zf, zf + sz * 0.05), Math.max(zf, zf + sz * 0.05));
      // pictogram: two small triangles (up and down), no text
      const zz = zf + sz * 0.045, g = e.gb('glow_cool');
      g.face([[x - 0.06, y + 2.5, zz], [x + 0.06, y + 2.5, zz], [x, y + 2.6, zz]], [0, 0, sz]);
      g.face([[x - 0.06, y + 2.46, zz], [x + 0.06, y + 2.46, zz], [x, y + 2.36, zz]], [0, 0, sz]);
    }
  }
}
// decoration bucket per floor and kind (merged per material in the export)
const DECO = new Map();
function decoNode(fk, kind, layer = 'deco') {
  const k = fk + '|' + kind + '|' + layer;
  if (!DECO.has(k)) DECO.set(k, node('DECO_' + fk + '_' + kind, 'deco', null, { fk, layer, ov: 'deco', group: 'DECO', deco: true, extras: { kind } }));
  return DECO.get(k);
}

/* ------------------------------------------------------------------ slabs, finishes, ceilings, hatches */

function buildSlabs() {
  for (const f of FIDS) {
    const y = FY(f), holes = slabHoles(f).map((h) => h.poly);
    const e = node('HARD_slab_' + f, 'hard', f, { fk: f, group: 'STRUCT', extras: { role: 'floor slab with the room finishes on top', y_top: y, thickness: SLAB } });
    prism(region([L.outline], holes), y - SLAB, y, null, e.gb('concrete_dark'), e.gb('concrete_dark'));
    for (const r of L.rooms) {
      if (r.floor !== f || r.kind === 'void') continue;
      const R = region([r.polygon], holes);
      if (R.traps.length) prism(R, y, y, e.gb(FINISH.get(r.id)), null, null);
    }
    SLABNODE[f] = e;
  }
  const e = node('HARD_slab_roof', 'hard', TOPF, { fk: 'R', group: 'STRUCT', id: 'slab_roof', extras: { role: 'underside of the 99F mechanical floor (never opened)', y_bottom: ROOF_Y - SLAB } });
  prism(region([L.outline]), ROOF_Y - SLAB, ROOF_Y, e.gb('concrete_dark'), e.gb('concrete_dark'), e.gb('concrete_dark'));
}
const SLABNODE = {};
function buildCeilings() {
  for (const f of FIDS) {
    const y = FY(f) + CEIL, nf = nextFloor(f), holes = nf ? slabHoles(nf).map((h) => h.poly) : [];
    for (const r of L.rooms) {
      if (r.floor !== f || !['room', 'corridor', 'core', 'void'].includes(r.kind)) continue;
      const R = region([r.polygon], holes);
      if (!R.traps.length) continue;
      const mk = CEILMAT.get(r.id), e = decoNode(f, 'ceiling', 'ceiling');
      prism(R, y, y, null, e.gb(mk), null);
      if (BOH.test(r.id)) lightStrips(e, r, y, holes, 'glow_cool'); else if (!DARKROOM.test(r.id)) downlights(e, r, y, holes, r.kind === 'corridor' ? 2.4 : 3.2);
    }
    // plenum fascia along void and stair-opening edges in the slab above (closes the 3.1-3.9 m gap)
    if (nf) for (const h of slabHoles(nf)) {
      if (h.kind !== 'void' && !h.rail) continue;
      const e = decoNode(f, 'fascia', 'ceiling'), p = h.poly;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length], mid = P2.lerp(a, b, 0.5);
        if (outlineDist(mid) < 0.05) continue;
        const d = P2.norm(P2.sub(b, a)), n = [-d[1], d[0]], inside = inPoly(P2.add(mid, P2.mul(n, 0.05)), p) ? 1 : -1;
        const c0 = P2.add(a, P2.mul(n, inside * 0.03)), c1 = P2.add(b, P2.mul(n, inside * 0.03));
        sbox(e.gb('plaster'), c0, c1, 0.06, y, FY(nf) - SLAB);
      }
    }
  }
}
// back of house keeps tube strips (cool white); every other room gets pools from recessed downlights
// rooms lit only by their own story lighting in the floor parts (dark zones)
const DARKROOM = /control_room|render_farm|wine_room|screening|projection|noraebang|booth|tea_room|cigar|studio/;
const BOH = /kitchen|servery|laundry|plant_room|staff_entry|service_hall|canteen|backstage|cold_store|riser|_shaft/;
function downlights(e, r, y, holes, pitch) {
  const [x0, z0, x1, z1] = polyBox(r.polygon), nx = Math.max(1, Math.round((x1 - x0 - 1.2) / pitch)), nz = Math.max(1, Math.round((z1 - z0 - 1.2) / pitch));
  const g = e.gb('glow_down'), rim = e.gb('black');
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const x = x0 + 0.6 + ((x1 - x0 - 1.2) * (i + 0.5)) / nx, z = z0 + 0.6 + ((z1 - z0 - 1.2) * (k + 0.5)) / nz, p = [x, z];
    if (!inPoly(p, r.polygon) || polyDist(p, r.polygon) < 0.6 || holes.some((h) => inPoly(p, h) || polyDist(p, h) < 0.4)) continue;
    abox(rim, x - 0.13, x + 0.13, y - 0.012, y - 0.002, z - 0.13, z + 0.13, '+y');
    abox(g, x - 0.08, x + 0.08, y - 0.016, y - 0.012, z - 0.08, z + 0.08, '+y');
    lightPool(decoNode(floorOfY(y - CEIL), 'pools'), x, y - CEIL + 0.004, z, 1.3, 'pool_warm');
  }
}
// soft pool decal on a floor (full UV quad, so the radial falloff stays centred)
const POOLGEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function lightPool(e, x, y, z, r, mk = 'pool_warm') {
  e.gb(mk).addGeo(POOLGEO, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(r * 2, 1, r * 2)), true);
}
// linear light strips along the longer axis of each room's ceiling, clipped to the room and around holes
function lightStrips(e, r, y, holes, mk) {
  const [x0, z0, x1, z1] = polyBox(r.polygon), wx = x1 - x0, wz = z1 - z0, alongX = wx >= wz, short = alongX ? wz : wx, long = alongX ? wx : wz;
  if (short < 1.6 || long < 2) return;
  const n = short < 4.2 ? 1 : Math.max(2, Math.round(short / 2.4)), g = e.gb(mk);
  for (let k = 0; k < n; k++) {
    const c = (alongX ? z0 : x0) + (short * (k + 0.5)) / n, a0 = (alongX ? x0 : z0) + 0.9, a1 = (alongX ? x1 : z1) - 0.9;
    let run = null;
    const flush = () => { if (run && run[1] - run[0] > 0.6) { if (alongX) abox(g, run[0], run[1], y - 0.03, y, c - 0.045, c + 0.045, '+y'); else abox(g, c - 0.045, c + 0.045, y - 0.03, y, run[0], run[1], '+y'); } run = null; };
    for (let s = a0; s <= a1 + 1e-6; s += 0.3) {
      const p = alongX ? [s, c] : [c, s], ok = inPoly(p, r.polygon) && polyDist(p, r.polygon) > 0.5 && !holes.some((h) => inPoly(p, h) || polyDist(p, h) < 0.3);
      if (ok) { if (!run) run = [s, s]; run[1] = s; } else flush();
    }
    flush();
  }
}
function buildHatches() {
  for (const h of L.hatches) {
    const y = FY(h.floor), s = h.size / 2, below = h.reinforce_from === 'below', mp = h.mount.pos;
    const fr = frameZ(mp, [0, 1], below);
    const e = node('HATCH_' + h.id, 'hatch', h.floor, {
      fk: h.floor, group: 'STRUCT', id: h.id, frame: fr,
      extras: { size: h.size, reinforceable: h.reinforceable, gadget: h.gadget, reinforce_from: h.reinforce_from, mount: h.mount, top_room: h.top_room, bottom_room: h.bottom_room, note: h.note, placement: 'node origin = hatch unit origin, node +Y = unit up (mount.up)' },
    });
    abox({ x: e.gb('steel_dark'), y: e.gb('concrete_dark'), z: e.gb('steel_dark') }, h.x - s + 0.05, h.x + s - 0.05, y - SLAB, y - 0.002, h.z - s + 0.05, h.z + s - 0.05, '+y');
    abox(e.gb('hatch_plate'), h.x - s + 0.05, h.x + s - 0.05, y - 0.002, y + 0.002, h.z - s + 0.05, h.z + s - 0.05, '-y');
    for (const [a, b, c, d] of [[-s, s, -s, -s + 0.05], [-s, s, s - 0.05, s], [-s, -s + 0.05, -s + 0.05, s - 0.05], [s - 0.05, s, -s + 0.05, s - 0.05]]) abox(e.gb('alloy'), h.x + a, h.x + b, y - SLAB, y + 0.006, h.z + c, h.z + d);
    // a hairline seam ring inside the angle and two recessed lift slots
    for (const [a, b, c, d] of [[-s + 0.05, s - 0.05, -s + 0.05, -s + 0.062], [-s + 0.05, s - 0.05, s - 0.062, s - 0.05], [-s + 0.05, -s + 0.062, -s + 0.062, s - 0.062], [s - 0.062, s - 0.05, -s + 0.062, s - 0.062]]) abox(e.gb('black'), h.x + a, h.x + b, y + 0.002, y + 0.0025, h.z + c, h.z + d, '-y');
    for (const dz of [-0.36, 0.36]) abox(e.gb('black'), h.x - 0.08, h.x + 0.08, y + 0.002, y + 0.003, h.z + dz - 0.016, h.z + dz + 0.016, '-y');
    softCeil(h.id, h.bottom_room, h.x, h.z, h.size, h.size, 'hatch');
  }
  for (const p of L.floor_patches) {
    const y = FY(p.floor);
    const e = node('SOFTFLOOR_' + p.id, 'soft_floor', p.floor, { fk: p.floor, group: 'STRUCT', id: p.id, extras: { w: p.w, d: p.d, reinforceable: false, top_room: p.top_room, bottom_room: p.bottom_room, note: p.note } });
    const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, z0 = p.z - p.d / 2, z1 = p.z + p.d / 2;
    abox({ x: e.gb('wood_dark'), y: e.gb('wood_dark'), z: e.gb('wood_dark') }, x0, x1, y - SLAB, y - 0.004, z0, z1, '+y');
    // patched boards (screwed timber decking in a steel angle): reads as a repair in the floor, unlike a hatch plate
    abox(e.gb('patch_board'), x0 + 0.04, x1 - 0.04, y - 0.004, y + 0.002, z0 + 0.04, z1 - 0.04, '-y');
    for (const [a, b, c, d] of [[x0, x1, z0, z0 + 0.04], [x0, x1, z1 - 0.04, z1], [x0, x0 + 0.04, z0 + 0.04, z1 - 0.04], [x1 - 0.04, x1, z0 + 0.04, z1 - 0.04]]) abox(e.gb('steel_dark'), a, b, y - 0.004, y + 0.005, c, d, '-y');
    for (let k = 1; k < Math.round(p.w / 0.6); k++) abox(e.gb('black'), x0 + k * 0.6 - 0.006, x0 + k * 0.6 + 0.006, y + 0.002, y + 0.0028, z0 + 0.04, z1 - 0.04, '-y');
    for (let k = 0; k < Math.round(p.w / 0.6); k++) for (const zz of [z0 + 0.12, z1 - 0.12]) { const xx = x0 + k * 0.6 + 0.3; abox(e.gb('alloy'), xx - 0.012, xx + 0.012, y + 0.002, y + 0.003, zz - 0.012, zz + 0.012, '-y'); }
    softCeil(p.id, p.bottom_room, p.x, p.z, p.w, p.d, 'patch');
  }
}
function softCeil(id, room, x, z, w, d, kind) {
  const r = ROOM.get(room); if (!r) return;
  const y = FY(r.floor) + CEIL;
  const e = node('SOFTCEIL_' + id, 'soft_floor', r.floor, { fk: r.floor, layer: 'ceiling', ov: 'soft_floor', group: 'STRUCT', id, extras: { role: 'ceiling tile under ' + kind + ' ' + id, room } });
  // a framed tile that breaks the ceiling pattern: lit hanji under a hatch, a dark board under a soft patch, both in a steel trim
  const tile = kind === 'hatch' ? 'ceil_hatch' : 'ceiling_dark';
  abox({ x: e.gb('steel_dark'), y: e.gb(tile), z: e.gb('steel_dark') }, x - w / 2 + 0.035, x + w / 2 - 0.035, y - 0.012, y + 0.02, z - d / 2 + 0.035, z + d / 2 - 0.035);
  for (const [a, b, c, f] of [[-w / 2, w / 2, -d / 2, -d / 2 + 0.035], [-w / 2, w / 2, d / 2 - 0.035, d / 2], [-w / 2, -w / 2 + 0.035, -d / 2 + 0.035, d / 2 - 0.035], [w / 2 - 0.035, w / 2, -d / 2 + 0.035, d / 2 - 0.035]]) abox(e.gb(kind === 'hatch' ? 'alloy' : 'steel_dark'), x + a, x + b, y - 0.03, y + 0.02, z + c, z + f);
  if (kind !== 'hatch') for (let k = 1; k < Math.round(w / 0.6); k++) abox(e.gb('black'), x - w / 2 + k * 0.6 - 0.005, x - w / 2 + k * 0.6 + 0.005, y - 0.014, y - 0.012, z - d / 2 + 0.035, z + d / 2 - 0.035);
}

/* ------------------------------------------------------------------ columns, pilasters, core caps */

function buildColumns() {
  for (const f of FIDS) {
    const y = FY(f);
    for (const c of L.columns) {
      const e = node('HARD_' + c.id + '_' + f, 'hard', f, { fk: f, group: 'STRUCT', id: c.id, extras: { role: 'structural column', kind: c.kind, x: c.x, z: c.z, w: c.w, d: c.d } });
      abox(e.gb('concrete'), c.x - c.w / 2, c.x + c.w / 2, y - SLAB, y + F2F - SLAB, c.z - c.d / 2, c.z + c.d / 2, '-y+y');
      // a dark alloy kick plinth and a purple reveal at the ceiling line
      abox(e.gb('steel_dark'), c.x - c.w / 2 - 0.01, c.x + c.w / 2 + 0.01, y, y + 0.1, c.z - c.d / 2 - 0.01, c.z + c.d / 2 + 0.01, '-y');
    }
  }
  for (const p of L.pilasters) {
    const y = FY(p.floor), e = node('HARD_' + p.id, 'pilaster', p.floor, { fk: p.floor, ov: 'hard', group: 'STRUCT', id: p.id, extras: { role: 'hard jamb', wall: p.wall, x: p.x, z: p.z, w: p.w, d: p.d } });
    abox(e.gb('steel_dark'), p.x - p.w / 2 - 0.015, p.x + p.w / 2 + 0.015, y, y + CEIL, p.z - p.d / 2 - 0.015, p.z + p.d / 2 + 0.015, '-y');
  }
  for (const f of FIDS) {
    const y = FY(f), e = node('HARD_core_' + f, 'hard', f, { fk: f, group: 'STRUCT', id: 'core_' + f, extras: { role: 'solid core rooms (lift banks, risers, locked stores): caps at ceiling height' } });
    for (const r of L.rooms) if (r.floor === f && r.kind === 'solid') prism(region([r.polygon]), y + CEIL - 0.01, y + CEIL, e.gb('concrete_dark'), null, null);
  }
}

/* ------------------------------------------------------------------ stairs and ladders */

function stairProfile(run, rise, n, th) {   // stepped flight profile in (s, y), steps from s 0 to run, y 0 to rise
  const g = run / n, r = rise / n, P = [[0, 0]];
  for (let k = 0; k < n; k++) { P.push([k * g, (k + 1) * r]); P.push([(k + 1) * g, (k + 1) * r]); }
  P.push([run, rise - th]); P.push([0.0, -th]);
  return P;
}
// one flight from plan point a (at y0) to b (at y1), width w
function flight(g, a, b, y0, y1, w, th = 0.22) {
  const d = P2.norm(P2.sub(b, a)), run = P2.len(P2.sub(b, a)), n = Math.max(2, Math.round((y1 - y0) / 0.175));
  extrudeProfile(g, stairProfile(run, y1 - y0, n, th), [a[0], y0, a[1]], [d[0], 0, d[1]], [-d[1], 0, d[0]], w);
  return { n, going: run / n, rise: (y1 - y0) / n };
}
// ramp collider (thin oriented box under the step noses) for a flight
function rampCollider(name, a, b, y0, y1, w, extras = {}) {
  const run = P2.len(P2.sub(b, a)), d = P2.norm(P2.sub(b, a)), ang = Math.atan2(y1 - y0, run), len = Math.hypot(run, y1 - y0);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(d[0], d[1]) - Math.PI / 2, ang, 'YXZ'));
  // box local x along the flight (after yaw), tilted up by ang about local z
  const c = [(a[0] + b[0]) / 2, (y0 + y1) / 2 - 0.05, (a[1] + b[1]) / 2];
  empty('COL_' + name, { group: 'COLLIDERS', fk: floorOfY(y0), pos: c.map(r3), quat: q.toArray().map(r3), scale: [r3(len), 0.1, r3(w)], kind: 'box', extras: Object.assign({ surface: 'collider', role: 'stair ramp (walk surface)', slope_deg: r3(THREE.MathUtils.radToDeg(ang)) }, extras) });
}
function rail3(g, a, b, h = 1.0) {   // a handrail between two 3D points at height h above them, with posts
  const A = [a[0], a[1] + h, a[2]], B = [b[0], b[1] + h, b[2]];
  beam(g, A, B, 0.045);
  const l = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.ceil(l / 1.2));
  for (let k = 0; k <= n; k++) { const t = k / n, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; beam(g, p, [p[0], p[1] + h, p[2]], 0.035); }
}
function buildStairs() {
  for (const st of L.stairs) {
    if (st.kind === 'switchback') switchback(st);
    else if (st.kind === 'straight') straightStair(st);
    else if (st.kind === 'spiral') spiralStair(st);
  }
  for (const so of L.slab_openings) if (so.rail) openingRail(so);
}
function switchback(st) {
  const [x0, z0, x1, z1] = st.box, W = st.width || 2.6, LD = 1.6;
  const south = st.landing === 'south', f1West = /west/.test(st.flight_1);
  const xA = f1West ? [x0, x0 + W] : [x1 - W, x1], xB = f1West ? [x1 - W, x1] : [x0, x0 + W];
  const zFloor = south ? [z1 - LD, z1] : [z0, z0 + LD], zMid = south ? [z0, z0 + LD] : [z1 - LD, z1];
  const sStart = south ? z1 - LD : z0 + LD, sEnd = south ? z0 + LD : z1 - LD;
  for (const f of st.floors) {
    const y = FY(f), last = f === TOPF, e = node('STAIR_' + st.id + '_' + f, 'stair', f, { fk: f, ov: 'circ', group: 'STRUCT', id: st.id + '_' + f, extras: { name: st.name, kind: st.kind, type: st.type, note: st.note, collider: 'COL_STAIR_' + st.id + '_' + f + '_*' } });
    const g = { cap: e.gb('concrete'), top: e.gb('concrete'), side: e.gb('concrete') }, rg = e.gb('steel_dark');
    if (f !== FIDS[0]) {   // floor landing (the slab is open over the stair)
      abox(e.gb('concrete'), x0, x1, y - SLAB, y, zFloor[0], zFloor[1]);
      colBox('COL_STAIR_' + st.id + '_' + f + '_landing', [(x0 + x1) / 2, y - 0.05, (zFloor[0] + zFloor[1]) / 2], [x1 - x0, 0.1, zFloor[1] - zFloor[0]], 0, { fk: f, extras: { surface: 'collider', role: 'stair floor landing (walk surface)', stair: st.id } });
    }
    const cx1 = (xA[0] + xA[1]) / 2, cx2 = (xB[0] + xB[1]) / 2;
    flight(g, [cx1, sStart], [cx1, sEnd], y, y + F2F / 2, W);
    rampCollider('STAIR_' + st.id + '_' + f + '_1', [cx1, sStart], [cx1, sEnd], y, y + F2F / 2, W);
    abox(e.gb('concrete'), x0, x1, y + F2F / 2 - 0.25, y + F2F / 2, zMid[0], zMid[1]);   // mid landing
    colBox('COL_STAIR_' + st.id + '_' + f + '_mid', [(x0 + x1) / 2, y + F2F / 2 - 0.05, (zMid[0] + zMid[1]) / 2], [x1 - x0, 0.1, zMid[1] - zMid[0]], 0, { fk: f, extras: { surface: 'collider', role: 'stair mid landing (walk surface)', stair: st.id } });
    const inner1 = f1West ? xA[1] : xA[0];
    rail3(rg, [inner1, y, sStart], [inner1, y + F2F / 2, sEnd]);
    if (!last) {
      flight(g, [cx2, sEnd], [cx2, sStart], y + F2F / 2, y + F2F, W);
      rampCollider('STAIR_' + st.id + '_' + f + '_2', [cx2, sEnd], [cx2, sStart], y + F2F / 2, y + F2F, W);
      const inner2 = f1West ? xB[0] : xB[1];
      rail3(rg, [inner2, y + F2F / 2, sEnd], [inner2, y + F2F, sStart]);
    } else {
      // top floor: the flight up to 99F is behind a locked steel gate
      const zg = sEnd + (south ? -0.05 : 0.05);
      abox(e.gb('steel_dark'), xB[0], xB[1], y + F2F / 2, y + F2F / 2 + 2.2, Math.min(zg, zg + (south ? -0.06 : 0.06)), Math.max(zg, zg + (south ? -0.06 : 0.06)));
    }
  }
}
function straightStair(st) {
  const w = st.width || 1.4, mat = st.id === 'ST_garden' ? 'stone' : st.id === 'ST_suite' ? 'wood' : 'steel_dark';
  const f = st.floors[0], e = node('STAIR_' + st.id, 'stair', f, { fk: f, ov: 'circ', group: 'STRUCT', id: st.id, extras: { name: st.name, kind: st.kind, floors: st.floors, width: w, note: st.note, collider: 'COL_STAIR_' + st.id + '_*' } });
  // the Garden Stair: stone treads on dark timber stringers with a bronze handrail; others in one material
  const g = st.id === 'ST_garden' ? { cap: e.gb('wood_dark'), top: e.gb('stone_dark'), side: e.gb('stone') } : { cap: e.gb(mat === 'steel_dark' ? 'steel_dark' : mat), top: e.gb(mat), side: e.gb(mat) };
  const rail = node('RAIL_' + st.id, 'balustrade', f, { fk: f, group: 'STRUCT', id: st.id + '_rail', extras: { role: 'stair balustrade', stair: st.id, height: 1.0 } });
  const glassRail = st.id !== 'ST_studio';
  const P = st.path;
  for (let i = 0; i < P.length - 1; i++) {
    const a = [P[i][0], P[i][2]], b = [P[i + 1][0], P[i + 1][2]], ya = P[i][1], yb = P[i + 1][1];
    const d = P2.norm(P2.sub(b, a)), n = [-d[1], d[0]];
    if (Math.abs(yb - ya) > 0.01) {
      const [A, B, y0, y1] = yb > ya ? [a, b, ya, yb] : [b, a, yb, ya];
      flight(g, A, B, y0, y1, w, 0.25);
      rampCollider('STAIR_' + st.id + '_' + i, A, B, y0, y1, w);
    } else {
      const th = 0.25; sbox({ x: e.gb(mat), y: e.gb(mat), z: e.gb(mat) }, a, b, w, ya - th, ya);
      const m = P2.lerp(a, b, 0.5);
      colBox('COL_STAIR_' + st.id + '_' + i + '_landing', [m[0], ya - 0.05, m[1]], [w, 0.1, P2.len(P2.sub(b, a))], yawOf(d), { fk: floorOfY(ya), extras: { surface: 'collider', role: 'stair landing (walk surface)', stair: st.id } });
    }
    for (const sg of [1, -1]) {
      const ea = P2.add(a, P2.mul(n, (sg * w) / 2)), eb = P2.add(b, P2.mul(n, (sg * w) / 2));
      if (glassRail) {
        const l = P2.len(P2.sub(eb, ea)), m = Math.max(1, Math.round(l / 1.2));
        for (let k = 0; k < m; k++) {
          const p0 = P2.lerp(ea, eb, k / m), p1 = P2.lerp(ea, eb, (k + 1) / m), q0 = ya + (yb - ya) * (k / m), q1 = ya + (yb - ya) * ((k + 1) / m);
          const gq = rail.gb('glass_i');
          gq.face([[p0[0], q0 + 0.05, p0[1]], [p1[0], q1 + 0.05, p1[1]], [p1[0], q1 + 1.0, p1[1]], [p0[0], q0 + 1.0, p0[1]]], [n[0] * sg, 0, n[1] * sg]);
          gq.face([[p0[0], q0 + 0.05, p0[1]], [p1[0], q1 + 0.05, p1[1]], [p1[0], q1 + 1.0, p1[1]], [p0[0], q0 + 1.0, p0[1]]], [-n[0] * sg, 0, -n[1] * sg]);
        }
        beam(rail.gb(st.id === 'ST_garden' ? 'bronze' : 'alloy'), [ea[0], ya + 1.02, ea[1]], [eb[0], yb + 1.02, eb[1]], 0.05);
      } else rail3(rail.gb('steel_dark'), [ea[0], ya, ea[1]], [eb[0], yb, eb[1]]);
    }
  }
  if (st.mid_landing) e.extras.mid_landing = st.mid_landing;   // built as the flat path segment
}
function spiralStair(st) {
  const [cx, cz] = st.center, R = st.radius, f = st.floors[0], y0 = FY(f), y1 = FY(st.floors[1]), n = 24, rise = (y1 - y0) / n, da = (Math.PI * 2 * 0.92) / n;
  const e = node('STAIR_' + st.id, 'stair', f, { fk: f, ov: 'circ', group: 'STRUCT', id: st.id, extras: { name: st.name, kind: 'spiral', center: st.center, radius: R, note: st.note } });
  const g = e.gb('steel_dark'), t = e.gb('wood');
  cylY(g, cx, cz, 0.11, y0, y1 + 1.0, 16);
  for (let k = 0; k < n; k++) {
    const a0 = k * da, a1 = (k + 1) * da + 0.02, yt = y0 + (k + 1) * rise, pts = [[cx, cz]];
    for (let s = 0; s <= 4; s++) { const a = a0 + ((a1 - a0) * s) / 4; pts.push([cx + Math.sin(a) * R, cz + Math.cos(a) * R]); }
    prism(region([pts]), yt - 0.05, yt, t, g, g);
    const pa = [cx + Math.sin((a0 + a1) / 2) * (R - 0.04), yt, cz + Math.cos((a0 + a1) / 2) * (R - 0.04)];
    beam(e.gb('steel_dark'), pa, [pa[0], pa[1] + 0.95, pa[2]], 0.025);
    if (k) { const pb = [cx + Math.sin(a0 - da / 2) * (R - 0.04), yt - rise, cz + Math.cos(a0 - da / 2) * (R - 0.04)]; beam(e.gb('alloy'), [pb[0], pb[1] + 0.95, pb[2]], [pa[0], pa[1] + 0.95, pa[2]], 0.045); }
  }
  // one box per tread (radial length R, the tread's outer chord wide, so it covers the render wedge), stepping up 0.175 m: the walk surface in Unity
  for (let k = 0; k < n; k++) {
    const am = (k + 0.5) * da + 0.01, yt = y0 + (k + 1) * rise, dir = [Math.sin(am), Math.cos(am)];
    colBox('COL_STAIR_' + st.id + '_' + k, [cx + dir[0] * R * 0.52, yt - 0.05, cz + dir[1] * R * 0.52], [2 * R * Math.sin((da + 0.02) / 2) * 1.03, 0.1, R * 0.96], yawOf(dir), { fk: f, extras: { surface: 'collider', role: 'spiral stair tread (walk surface)', stair: st.id, step: k } });
  }
}
function openingRail(so) {
  const f = so.floor, y = FY(f), st = L.stairs.find((s) => s.id === so.for), p = so.polygon;
  const top = st && st.path ? [st.path[st.path.length - 1][0], st.path[st.path.length - 1][2]] : st && st.center ? [st.center[0] + Math.sin(Math.PI * 2 * 0.92) * st.radius, st.center[1] + Math.cos(Math.PI * 2 * 0.92) * st.radius] : null;
  const e = node('RAIL_' + so.id, 'balustrade', f, { fk: f, group: 'STRUCT', id: so.id, extras: { role: 'balustrade around a slab opening', stair: so.for, height: 1.1 } });
  let gapEdge = -1, best = Infinity;
  for (let i = 0; i < p.length; i++) { const dd = top ? segDist(top, p[i], p[(i + 1) % p.length]) : Infinity; if (dd < best) { best = dd; gapEdge = i; } }
  for (let i = 0; i < p.length; i++) {
    if (i === gapEdge) continue;
    const a = p[i], b = p[(i + 1) % p.length];
    sbox(e.gb('steel_dark'), a, b, 0.08, y, y + 0.08);
    sbox(e.gb('glass_i'), a, b, 0.02, y + 0.08, y + 1.04);
    sbox(e.gb('alloy'), a, b, 0.06, y + 1.04, y + 1.1);
  }
}
function buildLadders() {
  for (const ld of L.ladders) {
    const fk = floorOfY(ld.y0), e = node('LADDER_' + ld.id, 'ladder', fk, { fk, layer: ld.interior ? 'struct' : 'ext', ov: 'circ', group: ld.interior ? 'STRUCT' : 'EXTERIOR', id: ld.id, extras: { name: ld.name, x: ld.x, z: ld.z, y0: ld.y0, y1: ld.y1, interior: ld.interior, note: ld.note } });
    // rungs run parallel to the nearest facade face (or the given face); the climber stands on the side away from the rails' wall
    let along = [1, 0];
    if (ld.face === 'south' || ld.face === 'north') along = [1, 0];
    else if (!ld.interior) {
      let best = { d: Infinity, dir: [1, 0] };
      const ring = ld.id === 'LD_bridge' ? [[26, 15], [56, 15]] : L.outline;
      for (let i = 0; i < ring.length - (ld.id === 'LD_bridge' ? 1 : 0); i++) { const a = ring[i], b = ring[(i + 1) % ring.length], dd = segDist([ld.x, ld.z], a, b); if (dd < best.d) best = { d: dd, dir: P2.norm(P2.sub(b, a)) }; }
      along = best.dir;
    }
    const hw = 0.23, g = e.gb('steel_dark'), top = ld.y1 + (ld.interior ? 0.2 : 1.0);
    const r0 = [ld.x - along[0] * hw, ld.z - along[1] * hw], r1 = [ld.x + along[0] * hw, ld.z + along[1] * hw];
    beam(g, [r0[0], ld.y0, r0[1]], [r0[0], top, r0[1]], 0.05);
    beam(g, [r1[0], ld.y0, r1[1]], [r1[0], top, r1[1]], 0.05);
    for (let y = ld.y0 + 0.3; y < ld.y1 + 0.05; y += 0.3) beam(e.gb('alloy'), [r0[0], y, r0[1]], [r1[0], y, r1[1]], 0.03);
    colBox('COL_' + ld.id, [ld.x, (ld.y0 + top) / 2, ld.z], [0.55, top - ld.y0, 0.12], yawOf([-along[1], along[0]]), { fk, extras: { surface: 'collider', role: 'ladder climb volume', ladder: ld.id } });
  }
}
function buildWalkways() {
  for (const wk of L.walkways) {
    const f = wk.floor, y = wk.y, e = node('WALK_' + wk.id, 'walkway', f, { fk: f, ov: 'circ', group: 'STRUCT', id: wk.id, extras: { name: wk.name, y, polygon: wk.polygon, note: wk.note } });
    prism(region([wk.polygon]), y - 0.06, y, e.gb('grating'), e.gb('steel_dark'), e.gb('steel_dark'));
    // beams under the deck every 1.5 m
    const [x0, z0, x1, z1] = polyBox(wk.polygon), alongX = x1 - x0 > z1 - z0;
    for (let s = (alongX ? x0 : z0) + 0.4; s < (alongX ? x1 : z1); s += 1.5) {
      if (alongX) abox(e.gb('steel_dark'), s - 0.05, s + 0.05, y - 0.22, y - 0.06, z0, z1); else abox(e.gb('steel_dark'), x0, x1, y - 0.22, y - 0.06, s - 0.05, s + 0.05);
    }
    if (!wk.rails) continue;
    const rail = node('RAIL_' + wk.id, 'balustrade', f, { fk: f, group: 'STRUCT', id: wk.id + '_rail', extras: { role: 'catwalk rail', walkway: wk.id, height: 1.1 } });
    const others = L.walkways.filter((o) => o !== wk && o.floor === f).map((o) => o.polygon), voidP = L.voids.find((v) => v.floor === f);
    const p = wk.polygon;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], d = P2.norm(P2.sub(b, a)), l = P2.len(P2.sub(b, a)), n = [-d[1], d[0]];
      const mid = P2.lerp(a, b, 0.5), out = inPoly(P2.add(mid, P2.mul(n, 0.1)), p) ? P2.mul(n, -1) : n;
      let run = null;
      const flush = () => { if (run && run[1] - run[0] > 0.2) { const A = P2.add(P2.add(a, P2.mul(d, run[0])), P2.mul(out, -0.03)), B = P2.add(P2.add(a, P2.mul(d, run[1])), P2.mul(out, -0.03)); rail3(rail.gb('steel_dark'), [A[0], y, A[1]], [B[0], y, B[1]], 1.1); sbox(rail.gb('steel_dark'), A, B, 0.03, y + 0.5, y + 0.54); sbox(rail.gb('steel_dark'), A, B, 0.02, y, y + 0.12); } run = null; };
      for (let s = 0.05; s <= l - 0.05 + 1e-6; s += 0.1) {
        const q = P2.add(P2.add(a, P2.mul(d, s)), P2.mul(out, 0.15));
        const open = voidP && inPoly(q, voidP.polygon) && !others.some((o) => inPoly(q, o)) && outlineDist(q) > 0.3 && polyDist(q, voidP.polygon) > 0.12;
        if (open) { if (!run) run = [s, s]; run[1] = s; } else flush();
      }
      flush();
    }
  }
}

/* ------------------------------------------------------------------ curtain wall */

function buildFacade() {
  const FAC = {}, FIN = {};
  const fac = (f) => FAC[f] || (FAC[f] = node('HARD_facade_' + f, 'hard', f, { fk: f, layer: 'facade', group: 'FACADE', id: 'facade_' + f, extras: { role: 'curtain wall frame: mullions, transoms, sills, spandrel band (hard)' } }));
  const fin = (f) => FIN[f] || (FIN[f] = node('HARD_fins_' + f, 'hard', f, { fk: f, layer: 'facade', group: 'FACADE', id: 'fins_' + f, extras: { role: 'exterior aluminium fins (hard cover while rappelling); fins hang from 2.3 m above each ledge so the ledges stay walkable' } }));
  for (const bay of L.facade.bays) {
    const f = bay.floor, W = bay.width, d2 = P2.norm(P2.sub(bay.b, bay.a)), n2 = [-d2[1], d2[0]];
    const F = { a: bay.a, len: W, d: [d2[0], 0, d2[1]], n: [n2[0], 0, n2[1]], y: FY(f), t: 0.3 };
    const vy = bay.vision_y1, Y1 = bay.y1, gy0 = 0.06, gy1 = vy - 0.04, GS = [0.035, 0.055];
    const FR = fac(f), fr = FR.gb('alloy');
    wbox(fr, F, -0.03, 0.03, 0, Y1, 0, 0.26);
    if (!bay.omit_mullion && bay.kind !== 'portal') wbox(fr, F, W / 2 - 0.03, W / 2 + 0.03, 0, vy, 0, 0.22);
    wbox(fr, F, 0, W, vy - 0.04, vy + 0.04, 0, 0.2);
    wbox(fr, F, 0, W, 0, 0.06, 0, 0.2);
    wbox(FR.gb('louvre'), F, 0.03, W - 0.03, vy + 0.04, Y1, 0.01, 0.06);
    // fins (outside, s < 0) and the slim mullion cap with a purple edge light on every third
    const lit = bay.index % 3 === 0, FN = fin(f);
    for (let k = 0; k < Math.round(Y1 / F2F); k++) {
      const yb = k * F2F;
      wbox(FN.gb('alloy'), F, -0.03, 0.03, yb + 2.3, yb + F2F - 0.08, -0.45, 0);
      wbox(FN.gb('alloy'), F, -0.035, 0.035, yb, yb + 2.3, -0.06, 0);
      if (lit) { wbox(FN.gb('glow_purple'), F, -0.012, 0.012, yb + 2.3, yb + F2F - 0.08, -0.465, -0.45); wbox(FN.gb('glow_purple'), F, -0.012, 0.012, yb, yb + 2.3, -0.075, -0.06); }
    }
    const bayExtras = { bay: bay.id, face: bay.face, room: bay.room, double_height: bay.double_height, note: bay.note };
    if (bay.kind === 'portal') {
      const op = bay.opening, e = node('HARD_' + bay.id + '_portal', 'portal', f, { fk: f, ov: 'hard', layer: 'facade', group: 'FACADE', id: bay.id + '_portal', extras: Object.assign({ role: 'skybridge portal frame', opening: op }, bayExtras) });
      for (const r of rectMinus(0.03, W - 0.03, 0.06, gy1, [op])) wbox(e.gb('steel_dark'), F, r.u0, r.u1, r.y0, r.y1, 0, 0.3);
      facadeSlot(bay, F, op, 'BARR_D_' + bay.id, 'door_barricadable');
      continue;
    }
    const bayHole = bay.opening ? [{ u0: bay.opening.u0, u1: bay.opening.u1, y0: bay.opening.y0, y1: bay.opening.y1 }] : [];
    if (bay.opening) { doorFrame(FR, F, bay.opening, GS); facadeSlot(bay, F, bay.opening, 'BARR_D_' + bay.id, 'door_barricadable'); }
    bay.lites.forEach((lt, k) => {
      const lu0 = lt.u0 + (lt.u0 < 1e-6 || !bay.omit_mullion ? 0.03 : 0), lu1 = lt.u1 - (lt.u1 > W - 1e-6 || !bay.omit_mullion ? 0.03 : 0);
      const id = bay.id + '_' + k, ex = Object.assign({ lite: k, w: r3(lu1 - lu0), u0: lt.u0, u1: lt.u1 }, bayExtras);
      const op = lt.opening;
      if (lt.type === 'spandrel') {
        const e = node('HARD_' + id, 'spandrel', f, { fk: f, ov: 'hard', layer: 'facade', group: 'FACADE', id, extras: ex });
        wbox(e.gb('louvre'), F, lu0, lu1, gy0, gy1, 0.02, 0.07);
      } else if (lt.type === 'glass_tempered' || lt.type === 'glass_breakable') {
        for (const r of rectMinus(lu0, lu1, gy0, gy1, bayHole)) {
          const e = BYNAME.get((lt.type === 'glass_tempered' ? 'GLASS_T_' : 'GLASS_B_') + id) || node((lt.type === 'glass_tempered' ? 'GLASS_T_' : 'GLASS_B_') + id, lt.type, f, { fk: f, layer: 'facade', group: 'FACADE', id, extras: Object.assign({ h: r3(gy1 - gy0) }, ex) });
          glassLite(e, F, r.u0, r.u1, r.y0, r.y1, lt.type === 'glass_tempered', GS);
        }
      } else if (lt.type === 'window_barricadable') {
        const e = node('GLASS_B_' + id, 'glass_breakable', f, { fk: f, layer: 'facade', group: 'FACADE', id, extras: Object.assign({ entry: true, h: r3(op.y1 - op.y0), sill: op.y0, head: op.y1, slot: 'BARR_W_' + id }, ex) });
        glassLite(e, F, lu0, lu1, op.y0, op.y1, false, GS, true);
        const t = node('GLASS_T_' + id + '_t', 'glass_tempered', f, { fk: f, layer: 'facade', group: 'FACADE', id: id + '_t', extras: Object.assign({ role: 'tempered transom over an entry window' }, ex) });
        glassLite(t, F, lu0, lu1, op.y1 + 0.04, gy1, true, GS);
        wbox(fr, F, lu0, lu1, op.y1, op.y1 + 0.04, 0, 0.12);
        if (op.y0 > 1.0) {
          const b = node('GLASS_T_' + id + '_b', 'glass_tempered', f, { fk: f, layer: 'facade', group: 'FACADE', id: id + '_b', extras: Object.assign({ role: 'tempered lite under a high entry window' }, ex) });
          glassLite(b, F, lu0, lu1, gy0, op.y0 - 0.04, true, GS); wbox(fr, F, lu0, lu1, op.y0 - 0.04, op.y0, 0, 0.12);
        } else {
          const kk = node('HARD_' + id + '_kick', 'hard', f, { fk: f, layer: 'facade', group: 'FACADE', id: id + '_kick', extras: Object.assign({ role: 'kick panel under an entry window' }, ex) });
          wbox(kk.gb('steel_dark'), F, lu0, lu1, gy0, op.y0, 0.03, 0.08);
          wbox(kk.gb('alloy'), F, lu0, lu1, op.y0 - 0.04, op.y0, 0, 0.16);   // steel latch sill
          const um = (lu0 + lu1) / 2;   // rappel anchor plate under the sill, outside, with two bolt heads
          wbox(kk.gb('alloy'), F, um - 0.14, um + 0.14, op.y0 - 0.3, op.y0 - 0.12, GS[0] - 0.023, GS[0] - 0.007);
          for (const du of [-0.08, 0.08]) wbox(kk.gb('black'), F, um + du - 0.018, um + du + 0.018, op.y0 - 0.23, op.y0 - 0.194, GS[0] - 0.031, GS[0] - 0.023);
        }
        facadeSlot(bay, F, { u0: lu0, u1: lu1, y0: op.y0, y1: op.y1 }, 'BARR_W_' + id, 'window_barricadable', { lite: k });
      } else if (lt.type === 'door_barricadable') {
        const t = node('GLASS_T_' + id + '_t', 'glass_tempered', f, { fk: f, layer: 'facade', group: 'FACADE', id: id + '_t', extras: Object.assign({ role: 'tempered transom over a facade door' }, ex) });
        glassLite(t, F, lu0, lu1, op.y1 + 0.06, gy1, true, GS);
        doorFrame(FR, F, { u0: lu0, u1: lu1, y0: 0, y1: op.y1 }, GS);
        facadeSlot(bay, F, { u0: lu0, u1: lu1, y0: 0, y1: op.y1 }, 'BARR_D_' + id, 'door_barricadable', { lite: k });
      }
    });
  }
}
/* ------------------------------------------------------------------ blast shutters (user: every outer room; open by default) */
// One SHUTTER_<bayId> node per facade bay with glass (layout.json shutters[], made by tools/build_layout.py; never over a
// door: the Garden Doors and the skybridge portal get none, a bay with a door lite is shuttered over its glass lite only): an armoured
// slat curtain inside the glass (plane s = rules.shutters.plane behind the mullions, door frames and barricade slots)
// that retracts into a housing in the plenum above the ceiling. The node's mesh is the OPEN state; one morph target,
// 'closed', drops every slat and the bottom rail to its closed place (pure vertical translations, so the linear blend is
// exact at every weight and the curtain never opens a gap mid-travel: slat spacing shrinks, the overlap only grows).
// Static parts (guide channels on the mullion lines, the housing) are HARD_shutters_<F>. Closed-state collider:
// COL_SHUTTER_<id> (box), to be enabled only while the shutter is closed. Node frame: origin at the closed curtain's
// bottom centre, +X along the bay, +Y up, +Z into the building.
const SHUTTERS = [];
function buildShutters() {
  const R = RU.shutters; if (!R || !L.shutters) return;
  const BAYS = new Map(L.facade.bays.map((b) => [b.id, b]));
  const [P0, P1] = R.plane, [G0, G1] = R.guide_s, [H0, H1, HH] = R.housing, sm = (P0 + P1) / 2, pitch = R.slat - R.overlap, INSET = 0.004;
  const HOUSE = {};
  const house = (f) => HOUSE[f] || (HOUSE[f] = node('HARD_shutters_' + f, 'hard', f, { fk: f, layer: 'facade', group: 'FACADE', id: 'shutters_' + f, extras: { role: 'blast shutter guide channels (mullion lines, floor to slab) and housings (plenum, above the ceiling); hard, static' } }));
  for (const sh of L.shutters) {
    const bay = BAYS.get(sh.bay); if (!bay) { STATS.warnings.push('shutter without bay ' + sh.id); continue; }
    const f = sh.floor, W = bay.width, d2 = P2.norm(P2.sub(bay.b, bay.a)), n2 = [-d2[1], d2[0]];
    const F = { a: bay.a, len: W, d: [d2[0], 0, d2[1]], n: [n2[0], 0, n2[1]], y: FY(f), t: 0.3 };
    const vy = sh.y_open, u0 = sh.u0, u1 = sh.u1, um = (u0 + u1) / 2, top = vy + HH;
    // static: housing (no bottom face: the ceiling closes it and the curtain passes there) and guide channels with a
    // small purple status lamp on the room face
    const hs = house(f), hg = hs.gb('steel_dark');
    // a guide sits on its mullion line (guide_u: the bay end, or the door-side line of a door bay, whose door lite is
    // never shuttered), on the curtain's side of it
    const GU = sh.guide_u || {}, gLine = (k) => (k in GU ? GU[k] : k === 'a' ? 0 : W), solo = sh.guides_solo || [];
    const RV = sh.reveal || {}, hEnd = (k, u) => (sh.guides.includes(k) ? gLine(k) : RV[k] ? RV[k].housing_u : u);
    const hu0 = hEnd('a', u0), hu1 = hEnd('b', u1);
    wbox(hg, F, hu0, hu1, vy, top, H0, H1, '-y');
    // reveal plate (chamfer corner beside a facade door): on the door's jamb plane, in the door bay's frame, floor to
    // slab; this curtain end and its housing end sit inside it, so the corner seals with nothing in the doorway
    for (const [k, rv] of Object.entries(RV)) {
      const db = BAYS.get(rv.door_bay), dd = P2.norm(P2.sub(db.b, db.a)), dn = [-dd[1], dd[0]];
      const DF = { a: db.a, len: db.width, d: [dd[0], 0, dd[1]], n: [dn[0], 0, dn[1]], y: FY(f), t: 0.3 };
      const [ru0, ru1] = rv.u, [rs0, rs1] = rv.s, [ry0, ry1] = rv.y;
      wbox(hg, DF, ru0, ru1, ry0, ry1, rs0, rs1);
      const door = db.lites.find((l) => l.type === 'door_barricadable'), face = door && door.u0 < 1e-6 ? ru1 : ru0, sg = face === ru1 ? 1 : -1;
      wbox(hs.gb('alloy'), DF, sg > 0 ? face : face - 0.002, sg > 0 ? face + 0.002 : face, 0.004, ry1 - 0.004, rs1 - 0.09, rs1 - 0.02);   // brushed strip on the doorway face (2 mm: still behind the jamb face)
      wbox(hs.gb('glow_purple'), DF, (ru0 + ru1) / 2 - 0.011, (ru0 + ru1) / 2 + 0.011, 2.19, 2.212, rs1, rs1 + 0.003);   // status dot on the room end
    }
    for (const k of sh.guides) {
      const g0 = k === 'a' ? gLine('a') : gLine('b') - R.guide, g1 = g0 + R.guide, line = gLine(k);
      wbox(hg, F, g0, g1, 0, top, G0, G1, '-y +y');
      wbox(hs.gb('alloy'), F, g0 + 0.008, g1 - 0.008, 0.004, vy - 0.004, G1, G1 + 0.006, '-y +y');   // brushed face strip
      // one status dot per mullion line on its centre ('a' guides; a guide with no partner on its line has its own,
      // kept on its own channel so it never floats over a doorway)
      if (k === 'a' && !solo.includes('a')) wbox(hs.gb('glow_purple'), F, line - 0.011, line + 0.011, 2.19, 2.212, G1 + 0.006, G1 + 0.009);
      else if (solo.includes(k)) wbox(hs.gb('glow_purple'), F, (g0 + g1) / 2 - 0.011, (g0 + g1) / 2 + 0.011, 2.19, 2.212, G1 + 0.006, G1 + 0.009);
    }
    // moving curtain, built CLOSED, then shifted into its open place (the base mesh); e.morph keeps the closed positions
    const frame = frameZ(wp(F, um, 0, sm), n2);
    const e = node('SHUTTER_' + sh.id, 'shutter', f, {
      fk: f, layer: 'shutter', group: 'FACADE', id: sh.id, frame,
      extras: {
        bay: sh.bay, face: sh.face, room: sh.room, site: sh.site || undefined, width: sh.width, double_height: sh.double_height, covers: sh.covers,
        y_closed: sh.y_closed, y_open: sh.y_open, travel_m: sh.travel_m, travel_s: sh.travel_s, slats: sh.slats, default: 'open', state: 'open',
        morph_target: 'closed (weight 1 = closed, 0 = open)', collider: sh.collider, clips: 'shutters_close, shutters_open',
        blocks: sh.door_side ? 'vision and bullets over the glass lite when closed (the door lite is never shuttered)' : 'vision and bullets over the whole bay when closed', door_side: sh.door_side || undefined, destructible: false, frame: 'origin = closed curtain bottom centre; +X along the bay, +Y up, +Z into the building',
      },
    });
    const moves = {};
    const add = (mk, dy, fn, vSlat = null) => {
      const g = e.gb(mk), v0 = g.nv; fn(g);
      if (vSlat != null) for (let i = v0; i < g.nv; i++) g.u[i * 2 + 1] = (g.p[i * 3 + 1] - F.y - vSlat) / R.slat;
      (moves[mk] || (moves[mk] = [])).push([v0, g.nv, dy]);
    };
    const openY0 = vy + R.rail + 0.012;   // every slat's bottom when open (stacked in the housing)
    for (let k = 0; k < sh.slats; k++) {
      const y0 = R.rail - 0.02 + k * pitch, ins = k % 2 ? INSET : 0;
      add('shutter_armour', openY0 - y0, (g) => wbox(g, F, u0, u1, y0, y0 + R.slat, P0 + ins, P1 - ins, '-x +x'), y0);
    }
    add('steel_dark', vy + 0.004, (g) => wbox(g, F, u0, u1, 0.002, R.rail, P0 - 0.012, P1 + 0.012, '-x +x'));   // bottom rail (floor seal)
    add('glow_purple', vy + 0.004, (g) => wbox(g, F, u0 + 0.12, u1 - 0.12, 0.045, 0.058, P1 + 0.012, P1 + 0.015));   // thin LED line, room side
    e.morph = {};
    for (const [mk, list] of Object.entries(moves)) {
      const g = e.parts[mk]; e.morph[mk] = g.p.slice();
      for (const [v0, v1, dy] of list) for (let i = v0; i < v1; i++) g.p[i * 3 + 1] += dy;
    }
    const col = colBox('COL_SHUTTER_' + sh.id, wp(F, um, vy / 2, sm), [u1 - u0, vy, P1 - P0], yawOf(n2), {
      extras: { surface: 'shutter_collider', id: sh.id, floor: f, shutter: 'SHUTTER_' + sh.id, active: 'only while the shutter is closed (disabled by default: shutters start open)' },
    });
    SHUTTERS.push({ e, sh, F, col });
  }
}
function glassLite(e, F, u0, u1, y0, y1, tempered, GS, entry = false) {
  if (u1 - u0 < 0.02 || y1 - y0 < 0.02) return;
  if (tempered) {
    const b = Math.min(0.07, (u1 - u0) / 4, (y1 - y0) / 4);
    wbox(e.gb('glass_t'), F, u0 + b, u1 - b, y0 + b, y1 - b, GS[0], GS[1]);
    const fg = e.gb('glass_frit');
    wbox(fg, F, u0, u1, y0, y0 + b, GS[0], GS[1]); wbox(fg, F, u0, u1, y1 - b, y1, GS[0], GS[1]);
    wbox(fg, F, u0, u0 + b, y0 + b, y1 - b, GS[0], GS[1]); wbox(fg, F, u1 - b, u1, y0 + b, y1 - b, GS[0], GS[1]);
  } else {
    wbox(e.gb(entry ? 'glass_e' : 'glass_b'), F, u0, u1, y0, y1, GS[0], GS[1]);
    if (entry) {
      const fr = e.gb('steel_dark'), w = 0.05, a = GS[0] - 0.02, b = GS[1] + 0.03, um = (u0 + u1) / 2;
      wbox(fr, F, u0, u1, y0, y0 + w, a, b); wbox(fr, F, u0, u1, y1 - w, y1, a, b); wbox(fr, F, u0, u0 + w, y0 + w, y1 - w, a, b); wbox(fr, F, u1 - w, u1, y0 + w, y1 - w, a, b);
      wbox(e.gb('alloy'), F, um - 0.1, um + 0.1, y0 + w + 0.01, y0 + w + 0.04, b, b + 0.035);   // sash pull bar inside
      wbox(e.gb('glow_purple'), F, u0 + w, u1 - w, y0 + w, y0 + w + 0.005, GS[1], GS[1] + 0.003);   // faint sill line
    } else {
      const g = e.gb('glow_purple'), s0 = GS[1], s1 = GS[1] + 0.006, w = 0.012;
      wbox(g, F, u0, u1, y0, y0 + w, s0, s1); wbox(g, F, u0, u1, y1 - w, y1, s0, s1); wbox(g, F, u0, u0 + w, y0, y1, s0, s1); wbox(g, F, u1 - w, u1, y0, y1, s0, s1);
    }
  }
}
function doorFrame(FR, F, op, GS) {
  const g = FR.gb('steel_dark');
  wbox(g, F, op.u0 - 0.06, op.u0, 0, op.y1 + 0.06, 0, 0.22);
  wbox(g, F, op.u1, op.u1 + 0.06, 0, op.y1 + 0.06, 0, 0.22);
  wbox(g, F, op.u0, op.u1, op.y1, op.y1 + 0.06, 0, 0.22);
  wbox(g, F, op.u0, op.u1, 0, 0.012, 0, 0.3);
}
function facadeSlot(bay, F, op, name, kind, more = {}) {
  const m = frameZ(wp(F, (op.u0 + op.u1) / 2, 0, 0.1), [F.n[0], F.n[2]]);
  empty(name, {
    fk: bay.floor, group: 'SLOTS', pos: [m.elements[12], m.elements[13], m.elements[14]].map(r3), quat: quatOf(m),
    extras: Object.assign({ surface: kind, id: name.replace(/^BARR_[DW]_/, ''), floor: bay.floor, bay: bay.id, face: bay.face, room: bay.room, w: r3(op.u1 - op.u0), h: r3(op.y1 - op.y0), y0: op.y0, y1: op.y1, facade: true, facing: '+Z = into the building' }, more),
  });
  SLOTS.push({ fk: bay.floor, kind, F, o: op, facade: true });
}

/* ------------------------------------------------------------------ exterior: ledges, terrace, bridges, cradle, neighbours */

const EXT = L.exterior;
// gaps in a ledge rail: where a walkway, ladder, cradle or landing meets the ledge
function ledgeConnectors(fid) {
  const C = [], y = FY(fid);
  for (const k of ['catwalk', 'catwalk2', 'bridge_truss', 'gantry']) { const b = EXT[k]; if (b && b.floor === fid) C.push({ p: b.a, hw: b.width / 2 + 0.05 }); }
  if (EXT.hoist_ramp && EXT.hoist_ramp.floor === fid) C.push({ p: EXT.hoist_ramp.a, hw: EXT.hoist_ramp.width / 2 + 0.05 });
  const cr = EXT.cradle; if (cr && cr.moving.stops_y.some((s) => Math.abs(s - y) < 0.01)) C.push({ p: cr.center, hw: cr.w / 2 });
  for (const ld of L.ladders) if (!ld.interior && ld.y0 < y - 0.1 && ld.y1 >= y - 0.01 && outlineDist([ld.x, ld.z]) > 0.85) C.push({ p: [ld.x, ld.z], hw: 0.45 });
  const sb = EXT.skybridge;
  if (sb && sb.floor === fid) for (const sd of sb.side_doors) C.push({ p: [26.8, sd.side === 'north' ? 11.5 : 15.5], hw: 0.55 });
  if (sb && Math.abs(sb.roof_y + 0.8 - y) < 0.01) C.push({ p: [26.8, 13.5], hw: 1.5 });
  return C;
}
function buildLedges() {
  for (const lg of EXT.ledges) {
    const f = lg.floor, y = lg.y, w = lg.width, path = lg.path, closed = lg.closed, n = path.length;
    const e = node('LEDGE_' + lg.id, 'ledge', f, { fk: f, layer: 'ext', ov: 'circ', group: 'EXTERIOR', id: lg.id, extras: { y, width: w, rail_h: lg.rail_h, path, closed, breaks: lg.breaks || [], note: lg.note || 'maintenance ledge outside the glass; defender reveal zone' } });
    const outN = (i) => { const a = path[i % n], b = path[(i + 1) % n], d = P2.norm(P2.sub(b, a)); return [d[1], -d[0]]; };
    const off = (i, dist) => {
      const segs = closed ? n : n - 1;
      let o1 = closed ? outN((i - 1 + n) % n) : i > 0 ? outN(i - 1) : null, o2 = closed ? outN(i % n) : i < segs ? outN(i) : null;
      o1 = o1 || o2; o2 = o2 || o1;
      const s = 1 + o1[0] * o2[0] + o1[1] * o2[1];
      return [path[i % n][0] + ((o1[0] + o2[0]) / s) * dist, path[i % n][1] + ((o1[1] + o2[1]) / s) * dist];
    };
    const segs = closed ? n : n - 1;
    const holes = L.ladders.filter((ld) => !ld.interior && ld.y0 < y - 0.1 && ld.y1 >= y - 0.01 && outlineDist([ld.x, ld.z]) < w);
    for (let i = 0; i < segs; i++) {
      const a = path[i], b = path[(i + 1) % n], oa = off(i, w), ob = off(i + 1, w), l = P2.len(P2.sub(b, a)), d = P2.norm(P2.sub(b, a));
      let keep = [[0, 1]];
      for (const br of lg.breaks || []) {
        if (br.face === 'E' && Math.abs(a[0] - 26) < 0.01 && Math.abs(b[0] - 26) < 0.01) { const t0 = (br.z0 - a[1]) / (b[1] - a[1]), t1 = (br.z1 - a[1]) / (b[1] - a[1]); keep = idiff(keep, [[Math.min(t0, t1), Math.max(t0, t1)]]); }
      }
      for (const ld of holes) { const s = P2.dot(P2.sub([ld.x, ld.z], a), d); if (s > -0.5 && s < l + 0.5 && segDist([ld.x, ld.z], a, b) < w) keep = idiff(keep, [[(s - 0.35) / l, (s + 0.35) / l]]); }
      for (const [t0, t1] of keep) {
        const A0 = P2.lerp(a, b, t0), A1 = P2.lerp(a, b, t1), B0 = P2.lerp(oa, ob, t0), B1 = P2.lerp(oa, ob, t1);
        const top = [[A0[0], y, A0[1]], [A1[0], y, A1[1]], [B1[0], y, B1[1]], [B0[0], y, B0[1]]];
        e.gb('grating').face(top, UP);
        e.gb('steel_dark').face(top.map((p) => [p[0], y - 0.08, p[2]]), DOWN);
        const on = outN(i);
        e.gb('steel_dark').face([[B0[0], y - 0.08, B0[1]], [B1[0], y - 0.08, B1[1]], [B1[0], y, B1[1]], [B0[0], y, B0[1]]], [on[0], 0, on[1]]);
        // edge kerb
        sbox(e.gb('steel_dark'), P2.add(B0, P2.mul(on, -0.03)), P2.add(B1, P2.mul(on, -0.03)), 0.06, y, y + 0.1);
      }
    }
    // rail on the outer edge with gaps at connectors and breaks
    const outer = []; for (let i = 0; i < (closed ? n : n); i++) outer.push(off(i, w - 0.03));
    const PL = polyline(outer, closed);
    let gaps = ledgeConnectors(f).map((c) => { const pr = PL.project(c.p); return pr.dist < 2.0 ? [pr.s - c.hw, pr.s + c.hw] : null; }).filter(Boolean);
    for (const br of lg.breaks || []) { const a = PL.project([26.8, br.z0]), b = PL.project([26.8, br.z1]); gaps.push([Math.min(a.s, b.s) - 0.02, Math.max(a.s, b.s) + 0.02]); }
    gaps.sort((p, q) => p[0] - q[0]);
    const rail = node('RAIL_' + lg.id, 'balustrade', f, { fk: f, layer: 'ext', group: 'EXTERIOR', id: lg.id + '_rail', extras: { role: 'ledge rail', ledge: lg.id, height: lg.rail_h } });
    for (const [s0, s1] of idiff([[0, PL.total]], gaps)) railRun(rail, PL, s0, s1, y, lg.rail_h, null);
    LEDGE_PL[lg.id] = PL;
  }
}
const LEDGE_PL = {};
// a bar rail (posts, top rail, mid rail) along a polyline between arc lengths s0..s1; hoard: solid panel height
function railRun(rail, PL, s0, s1, y, h, hoard, yAt = null) {
  if (s1 - s0 < 0.15) return;
  const Y = (s) => (yAt ? yAt(s) : y), g = rail.gb('steel_dark');
  const n = Math.max(1, Math.ceil((s1 - s0) / 1.5)), pts = [];
  for (let k = 0; k <= n; k++) pts.push(s0 + ((s1 - s0) * k) / n);
  // split at polyline vertices so the rails follow corners
  const cuts = new Set(pts); for (const s of PL.S) if (s > s0 && s < s1) cuts.add(s);
  const ss = [...cuts].sort((a, b) => a - b);
  for (let k = 0; k < ss.length - 1; k++) {
    const a = PL.at(ss[k]).p, b = PL.at(ss[k + 1]).p, ya = Y(ss[k]), yb = Y(ss[k + 1]);
    beam(g, [a[0], ya + h, a[1]], [b[0], yb + h, b[1]], 0.05);
    beam(g, [a[0], ya + h * 0.5, a[1]], [b[0], yb + h * 0.5, b[1]], 0.03);
    if (hoard) { const q = rail.gb('steel_dark'), d = P2.norm(P2.sub(b, a)), nn = [-d[1], d[0]]; for (const sg of [1, -1]) q.face([[a[0], ya + 0.02, a[1]], [b[0], yb + 0.02, b[1]], [b[0], yb + hoard, b[1]], [a[0], ya + hoard, a[1]]], [nn[0] * sg, 0, nn[1] * sg]); }
  }
  for (const s of pts) { const p = PL.at(s).p, yy = Y(s); beam(g, [p[0], yy, p[1]], [p[0], yy + h, p[1]], 0.045); }
}
function buildTerrace() {
  const T = EXT.terrace, y = T.y;
  const e = node('TERRACE', 'terrace', FIDS[0], { fk: FIDS[0], layer: 'ext', ov: 'circ', group: 'EXTERIOR', id: T.id, extras: { name: T.name, y, polygon: T.polygon, parapet: T.parapet, note: 'sky terrace on the roof of the lower block (attacker spawn A1); defender reveal zone' } });
  prism(region([T.polygon]), y - 0.3, y, e.gb('stone_wet'), e.gb('concrete_dark'), e.gb('concrete_dark'));
  const rail = node('RAIL_terrace_parapet', 'balustrade', FIDS[0], { fk: FIDS[0], layer: 'ext', group: 'EXTERIOR', id: 'terrace_parapet', extras: { role: 'tempered glass parapet (see through, shoot over)', height: T.parapet.height, type: T.parapet.type } });
  const p = T.polygon, H = T.parapet.height;
  for (let i = 0; i < p.length; i++) {
    let a = p[i], b = p[(i + 1) % p.length];
    if (outlineDist(P2.lerp(a, b, 0.5)) < 0.05) continue;
    const d = P2.norm(P2.sub(b, a));
    if (outlineDist(a) < 0.05) a = P2.add(a, P2.mul(d, 1.0));
    if (outlineDist(b) < 0.05) b = P2.add(b, P2.mul(d, -1.0));
    const n = [-d[1], d[0]], inside = inPoly(P2.add(P2.lerp(a, b, 0.5), P2.mul(n, 0.3)), p) ? 1 : -1, c = P2.mul(n, inside * 0.12);
    const A = P2.add(a, c), B = P2.add(b, c);
    sbox(rail.gb('stone_dark'), A, B, 0.24, y, y + 0.16);
    sbox(rail.gb('glass_t'), A, B, 0.02, y + 0.16, y + H - 0.05);
    sbox(rail.gb('alloy'), A, B, 0.08, y + H - 0.05, y + H);
  }
  T.features.forEach((ft, i) => {
    const [x0, z0, x1, z1] = ft.box, h = ft.h, id = 'TR_' + ft.kind + '_' + i;
    if (ft.kind === 'rain_canopy') {
      const d = decoNode(FIDS[0], 'terrace', 'ext');
      for (const [px, pz] of [[x0 + 0.4, z0 + 0.4], [x1 - 0.4, z0 + 0.4], [x0 + 0.4, z1 - 0.4], [x1 - 0.4, z1 - 0.4]]) abox(d.gb('wood_dark'), px - 0.12, px + 0.12, y, y + 3.2, pz - 0.12, pz + 0.12);
      // roof with sweeping eaves: thin slab with upturned ends (profile across x)
      const hw = (x1 - x0) / 2 + 0.8, xc = (x0 + x1) / 2, topC = [], NC = 14;
      for (let k = 0; k <= NC; k++) { const sx = -hw + (2 * hw * k) / NC; topC.push([xc + sx, 3.5 + 0.3 * Math.pow(Math.abs(sx) / hw, 3)]); }
      const prof = [...topC, ...topC.slice().reverse().map(([sx, yy]) => [sx, yy - 0.09])];
      extrudeProfile({ cap: d.gb('wood_dark'), top: d.gb('steel_dark'), side: d.gb('wood_dark') }, prof.map(([s, yy]) => [s - x0, yy]), [x0, y, (z0 + z1) / 2], [1, 0, 0], [0, 0, 1], z1 - z0 + 0.6);
      colBox('COL_' + id, [(x0 + x1) / 2, y + 3.6, (z0 + z1) / 2], [x1 - x0 + 1.6, 0.3, z1 - z0 + 0.6], 0, { fk: FIDS[0], extras: { surface: 'collider', role: 'canopy roof' } });
      return;
    }
    if (ft.kind === 'pool') {
      const d = decoNode(FIDS[0], 'terrace', 'ext');
      abox(d.gb('water'), x0, x1, y - 0.06, y - 0.05, z0, z1, '-y');
      for (const [a, b, c, dd] of [[x0 - 0.3, x1 + 0.3, z0 - 0.3, z0], [x0 - 0.3, x1 + 0.3, z1, z1 + 0.3], [x0 - 0.3, x0, z0, z1], [x1, x1 + 0.3, z0, z1]]) abox(d.gb('stone_dark'), a, b, y, y + 0.08, c, dd, '-y');
      return;
    }
    const hard = ft.type === 'hard';
    const nd = node((hard ? 'HARD_' : 'DECO_') + id, hard ? 'hard' : 'deco', FIDS[0], { fk: FIDS[0], layer: 'ext', ov: hard ? 'prop_hard' : 'deco', group: 'EXTERIOR', id, deco: !hard, extras: { kind: ft.kind, box: ft.box, h, note: ft.note } });
    if (ft.kind === 'lift_kiosk') {
      abox({ x: nd.gb('steel_dark'), y: nd.gb('concrete_dark'), z: nd.gb('steel_dark') }, x0, x1, y, y + h, z0, z1, '-y');
      for (let xx = x0 + 1.25; xx < x1 - 0.1; xx += 1.25) for (const zz of [z0 - 0.006, z1]) abox(nd.gb('black'), xx - 0.01, xx + 0.01, y + 0.1, y + h - 0.15, zz, zz + 0.006);
      for (const zz of [z0 - 0.006, z1]) abox(nd.gb('alloy'), x0, x1, y + 0.1, y + 0.16, zz, zz + 0.006);
      abox(nd.gb('glow_warm'), x0 + 3.45, x1 - 3.45, y + 2.42, y + 2.46, z0 - 0.03, z0);
      abox(nd.gb('glow_purple'), x0 - 0.01, x1 + 0.01, y + h - 0.12, y + h - 0.08, z0 - 0.01, z1 + 0.01);
      abox(nd.gb('glass_t'), x0 + 3.5, x1 - 3.5, y + 0.1, y + 2.4, z0 - 0.02, z0);
    } else if (ft.kind === 'planter') {
      abox({ x: nd.gb('corten'), y: nd.gb('corten'), z: nd.gb('corten') }, x0, x1, y, y + h, z0, z1, '-y');
      abox(nd.gb('rubber'), x0 + 0.08, x1 - 0.08, y + h - 0.1, y + h - 0.02, z0 + 0.08, z1 - 0.08, '-y');
    } else if (ft.kind === 'lantern_wall') {
      abox({ x: nd.gb('stone_dry'), y: nd.gb('stone_dark'), z: nd.gb('stone_dry') }, x0, x1, y, y + h, z0, z1, '-y');
      for (let k = 0; k < 5; k++) { const xx = x0 + 0.3 + k * ((x1 - x0 - 0.6) / 4); abox(nd.gb('glow_warm'), xx - 0.05, xx + 0.05, y + 0.55, y + 0.85, z0 - 0.01, z1 + 0.01); }
    } else abox(nd.gb(hard ? 'stone_dark' : 'wood'), x0, x1, y, y + h, z0, z1, '-y');
    if (!hard) colBox('COL_' + id, [(x0 + x1) / 2, y + h / 2, (z0 + z1) / 2], [x1 - x0, h, z1 - z0], 0, { fk: FIDS[0], extras: { surface: 'collider', role: ft.kind } });
  });
}
// a straight walkway from a to b (plan), y at each end; steps down at the far end if stepsTo is set; rails and hoarding
function walkway(kind, b, o = {}) {
  const f = b.floor, ya = o.ya ?? b.y, yb = o.yb ?? b.y, a2 = b.a, b2 = b.b, w = b.width, d = P2.norm(P2.sub(b2, a2)), len = P2.len(P2.sub(b2, a2)), n = [-d[1], d[0]];
  const e = node('BRIDGE_' + b.id, 'bridge', f, { fk: f, layer: 'ext', ov: 'circ', group: 'EXTERIOR', id: b.id, extras: { name: b.name, kind, a: a2, b: b2, width: w, y_a: ya, y_b: yb, steps_down_to: b.steps_down_to, from: b.from, note: b.note } });
  const g = { x: e.gb('steel_dark'), y: e.gb('grating'), z: e.gb('steel_dark') };
  let sFlat = len, yAt = (s) => ya + (yb - ya) * (s / len);
  if (b.steps_down_to != null) {
    const drop = ya - b.steps_down_to, nst = Math.round(drop / 0.17), run = nst * 0.28; sFlat = len - run;
    yAt = (s) => (s <= sFlat ? ya : ya - Math.min(drop, Math.ceil((s - sFlat) / 0.28) * (drop / nst)));
    for (let k = 0; k < nst; k++) {
      const s0 = sFlat + k * 0.28, s1 = s0 + 0.28, yt = ya - (k + 1) * (drop / nst);
      sbox(g, P2.add(a2, P2.mul(d, s0)), P2.add(a2, P2.mul(d, s1)), w, yt - 0.06, yt);
    }
    rampCollider('BRIDGE_' + b.id + '_steps', P2.add(a2, P2.mul(d, sFlat)), b2, ya, b.steps_down_to, w, { bridge: b.id });
  }
  if (Math.abs(yb - ya) < 0.01) sbox(g, a2, P2.add(a2, P2.mul(d, sFlat)), w, ya - 0.1, ya);
  else {
    // ramp-stair: sloped deck with cleats every 0.4 m
    const A = [a2[0], ya, a2[1]], B = [b2[0], yb, b2[1]], sl = Math.hypot(len, yb - ya), X = [(B[0] - A[0]) / sl, (B[1] - A[1]) / sl, (B[2] - A[2]) / sl], Z = [n[0], 0, n[1]];
    const Y = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
    const Yu = Y[1] < 0 ? Y.map((v) => -v) : Y;
    obox(g, [(A[0] + B[0]) / 2 - Yu[0] * 0.05, (A[1] + B[1]) / 2 - Yu[1] * 0.05, (A[2] + B[2]) / 2 - Yu[2] * 0.05], X, Yu, Z, [sl / 2, 0.05, w / 2]);
    for (let s = 0.3; s < len; s += 0.4) { const p = P2.add(a2, P2.mul(d, s)), yy = yAt(s); sbox(e.gb('steel_dark'), P2.add(p, P2.mul(d, -0.02)), P2.add(p, P2.mul(d, 0.02)), w - 0.1, yy, yy + 0.04); }
    rampCollider('BRIDGE_' + b.id, a2, b2, ya, yb, w, { bridge: b.id });
  }
  // under-deck beams
  for (let s = 0.5; s < len; s += 2.5) { const p = P2.add(a2, P2.mul(d, s)), yy = yAt(s); sbox(e.gb('steel_dark'), P2.add(p, P2.mul(n, -w / 2)), P2.add(p, P2.mul(n, w / 2)), 0.12, yy - 0.35, yy - 0.1); }
  if (b.rails !== false) {
    const rail = node('RAIL_' + b.id, 'balustrade', f, { fk: f, layer: 'ext', group: 'EXTERIOR', id: b.id + '_rail', extras: { role: 'walkway rail', bridge: b.id, height: 1.1, hoarding: b.hoarding || 0 } });
    for (const sg of [1, -1]) {
      const pa = P2.add(a2, P2.mul(n, sg * (w / 2 - 0.03))), pb = P2.add(b2, P2.mul(n, sg * (w / 2 - 0.03)));
      const PL = polyline([pa, pb]);
      railRun(rail, PL, o.railFrom || 0.0, len - (o.railTo || 0), ya, 1.1, b.hoarding || 0, (s) => yAt(s));
    }
  }
  return e;
}
function buildBridges() {
  for (const k of ['catwalk', 'catwalk2', 'gantry']) if (EXT[k]) walkway(k, EXT[k]);
  if (EXT.hoist_ramp) walkway('hoist_ramp', Object.assign({ y: EXT.hoist_ramp.y_a }, EXT.hoist_ramp), { ya: EXT.hoist_ramp.y_a, yb: EXT.hoist_ramp.y_b });
  if (EXT.bridge_truss) {
    const t = EXT.bridge_truss; walkway('truss', t);
    // truss members from the walkway up to the skybridge deck
    const h = node('HARD_truss_frame', 'hard', t.floor, { fk: t.floor, layer: 'ext', group: 'EXTERIOR', id: 'truss_frame', extras: { role: 'truss under the skybridge (hard)' } }), g = h.gb('steel_dark');
    for (const zz of [12.1, 14.9]) {
      beam(g, [t.a[0], 3.75, zz], [t.b[0], 3.75, zz], 0.18); beam(g, [t.a[0], -0.25, zz], [t.b[0], -0.25, zz], 0.18);
      for (let x = t.a[0]; x < t.b[0] - 0.1; x += 5) { beam(g, [x, -0.25, zz], [x, 3.75, zz], 0.14); beam(g, [x, -0.25, zz], [Math.min(t.b[0], x + 5), 3.75, zz], 0.1); }
    }
    for (let x = t.a[0]; x < t.b[0]; x += 2.5) beam(g, [x, -0.3, 12.1], [x, -0.3, 14.9], 0.1);
  }
  const sb = EXT.skybridge;
  if (sb) {
    const f = sb.floor, y = sb.y, x0 = sb.a[0], x1 = sb.b[0], zc = sb.a[1], z0 = zc - sb.width / 2, z1 = zc + sb.width / 2, yr = sb.roof_y, gf = sb.glass_floor;
    const e = node('BRIDGE_skybridge', 'bridge', f, { fk: f, layer: 'ext', ov: 'circ', group: 'EXTERIOR', id: sb.id, extras: { name: sb.name, a: sb.a, b: sb.b, width: sb.width, y, roof_y: yr, glass: sb.glass, note: 'glass tube; tempered (see through, not shoot through)' } });
    prism(region([rectP(x0, z0, x1, z1)], [rectP(gf.x0, z0 + 0.1, gf.x1, z1 - 0.1)]), y - 0.3, y, e.gb('deck_wet'), e.gb('alloy'), e.gb('alloy'));
    const tf = node('GLASS_TF_skybridge', 'glass_floor', f, { fk: f, layer: 'ext', group: 'EXTERIOR', id: 'skybridge_glass_floor', extras: { x0: gf.x0, x1: gf.x1, type: gf.type, note: gf.note } });
    abox(tf.gb('glass_t'), gf.x0, gf.x1, y - 0.04, y - 0.005, z0 + 0.1, z1 - 0.1);
    for (let x = gf.x0; x <= gf.x1 + 1e-6; x += 1.5) abox(tf.gb('steel_dark'), x - 0.03, x + 0.03, y - 0.3, y - 0.04, z0 + 0.1, z1 - 0.1);
    const FR = node('HARD_skybridge_frame', 'hard', f, { fk: f, layer: 'ext', group: 'EXTERIOR', id: 'skybridge_frame', extras: { role: 'skybridge portal frames and edge beams (hard)' } }), gr = FR.gb('alloy');
    const nb = Math.round((x1 - x0) / sb.frames_every);
    for (let k = 0; k <= nb; k++) {
      const x = x0 + ((x1 - x0) * k) / nb;
      abox(gr, x - 0.1, x + 0.1, y, yr - 0.2, z0 - 0.05, z0 + 0.12); abox(gr, x - 0.1, x + 0.1, y, yr - 0.2, z1 - 0.12, z1 + 0.05);
      abox(FR.gb('glow_purple'), x - 0.02, x + 0.02, y + 0.1, yr - 0.3, z0 - 0.07, z0 - 0.05); abox(FR.gb('glow_purple'), x - 0.02, x + 0.02, y + 0.1, yr - 0.3, z1 + 0.05, z1 + 0.07);
    }
    abox(gr, x0, x1, y, y + 0.12, z0 - 0.05, z0 + 0.1); abox(gr, x0, x1, y, y + 0.12, z1 - 0.1, z1 + 0.05);
    const doors = sb.side_doors.map((sd) => ({ side: sd.side, u0: sd.x - 0.5, u1: sd.x + 0.5 }));
    const ladDoor = { side: 'south', u0: 53.5, u1: 54.5 };
    for (const [side, zz] of [['north', z0], ['south', z1]]) {
      for (let k = 0; k < nb; k++) {
        const xa = x0 + ((x1 - x0) * k) / nb + 0.1, xb = x0 + ((x1 - x0) * (k + 1)) / nb - 0.1;
        const holes = [...doors, ladDoor].filter((dd) => dd.side === side && dd.u0 < xb && dd.u1 > xa).map((dd) => ({ u0: dd.u0, u1: dd.u1, y0: 0, y1: 2.1 }));
        const gn = node('GLASS_T_skybridge_' + side[0].toUpperCase() + k, 'glass_tempered', f, { fk: f, layer: 'ext', group: 'EXTERIOR', id: 'skybridge_' + side + '_' + k, extras: { role: 'skybridge tube glass', side } });
        for (const r of rectMinus(xa, xb, 0.12, yr - y - 0.2, holes)) abox(gn.gb('glass_t'), r.u0, r.u1, y + r.y0, y + r.y1, zz - 0.01, zz + 0.01);
        for (const hh of holes) { abox(gr, hh.u0 - 0.06, hh.u0, y, y + 2.16, zz - 0.06, zz + 0.06); abox(gr, hh.u1, hh.u1 + 0.06, y, y + 2.16, zz - 0.06, zz + 0.06); abox(gr, hh.u0, hh.u1, y + 2.1, y + 2.16, zz - 0.06, zz + 0.06); }
      }
    }
    sb.side_doors.forEach((sd) => {
      const zz = sd.side === 'north' ? z0 : z1, sg = sd.side === 'north' ? -1 : 1;
      empty('OPEN_skybridge_' + sd.side, { fk: f, group: 'SLOTS', pos: [sd.x, y, zz].map(r3), quat: quatOf(frameZ([0, 0, 0], [0, sg])), extras: { surface: 'opening', id: 'skybridge_' + sd.side, kind: 'door', w: 1.0, h: 2.1, to: sd.to, note: 'skybridge side door to the ledge (not barricadable)' } });
      // landing from the side door to the ledge
      const land = node('BRIDGE_skybridge_landing_' + sd.side, 'bridge', f, { fk: f, layer: 'ext', ov: 'circ', group: 'EXTERIOR', id: 'skybridge_landing_' + sd.side, extras: { role: 'landing between the bridge side door and the F2 ledge' } });
      const za = sg < 0 ? zz - 1.0 : zz, zb = sg < 0 ? zz : zz + 1.0;
      abox({ x: land.gb('steel_dark'), y: land.gb('grating'), z: land.gb('steel_dark') }, 26.75, 28.6, y - 0.08, y, za, zb);
      const rl = node('RAIL_skybridge_landing_' + sd.side, 'balustrade', f, { fk: f, layer: 'ext', group: 'EXTERIOR', id: 'skybridge_landing_' + sd.side + '_rail', extras: { role: 'landing rail', height: 1.1 } });
      const ze = sg < 0 ? za + 0.03 : zb - 0.03;
      railRun(rl, polyline([[26.85, ze], [28.55, ze], [28.55, sg < 0 ? zb : za]]), 0, 1.7 + 1.0 - 0.05, y, 1.1, null);
    });
    // ladder platform at the east end (south side) for the Bridge Roof Ladder
    {
      const lp = node('BRIDGE_skybridge_ladder_landing', 'bridge', f, { fk: f, layer: 'ext', ov: 'circ', group: 'EXTERIOR', id: 'skybridge_ladder_landing', extras: { role: 'small landing outside the south ladder door at the East Tower end (engine assumption: the layout has no door here)' } });
      abox({ x: lp.gb('steel_dark'), y: lp.gb('grating'), z: lp.gb('steel_dark') }, 53.2, 55.0, y - 0.08, y, z1, z1 + 0.9);
      empty('OPEN_skybridge_ladder', { fk: f, group: 'SLOTS', pos: [54, y, z1].map(r3), quat: quatOf(frameZ([0, 0, 0], [0, 1])), extras: { surface: 'opening', id: 'skybridge_ladder', kind: 'door', w: 1.0, h: 2.1, note: 'door from the tube to the Bridge Roof Ladder landing' } });
    }
    const roof = node('BRIDGE_skybridge_roof', 'bridge', f, { fk: f, layer: 'ext', ov: 'circ', group: 'EXTERIOR', id: 'skybridge_roof', extras: { y: yr, walkable: true, to: sb.roof.to, note: sb.roof.note } });
    abox({ x: roof.gb('alloy'), y: roof.gb('grating'), z: roof.gb('alloy') }, x0, x1, yr - 0.2, yr, z0 - 0.05, z1 + 0.05);
    abox(roof.gb('ceiling_dark'), x0, x1, yr - 0.21, yr - 0.2, z0 + 0.12, z1 - 0.12, '+y');
    for (let k = 0; k < 3; k++) { const yt = yr + ((k + 1) * 0.8) / 3; abox({ x: roof.gb('steel_dark'), y: roof.gb('grating'), z: roof.gb('steel_dark') }, 26.8 + (2 - k) * 0.6, 26.8 + (3 - k) * 0.6, yr, yt, z0 + 0.1, z1 - 0.1); }
    const rr = node('RAIL_skybridge_roof', 'balustrade', f, { fk: f, layer: 'ext', group: 'EXTERIOR', id: 'skybridge_roof_rail', extras: { role: 'bridge roof rail', height: 1.1 } });
    for (const zz of [z0 + 0.0, z1 - 0.0]) railRun(rr, polyline([[28.6, zz], [x1, zz]]), 0, x1 - 28.6, yr, 1.1, null);
    rampCollider('BRIDGE_skybridge_roof_steps', [28.6, zc], [26.8, zc], yr, yr + 0.8, sb.width - 0.2, { bridge: 'skybridge_roof' });
  }
  if (EXT.cradle) buildCradle(EXT.cradle);
}
function buildCradle(cr) {
  const f = cr.floor, y = cr.y, yaw = THREE.MathUtils.degToRad(cr.yaw_deg);
  const fr = new THREE.Matrix4().makeRotationY(-yaw); fr.setPosition(cr.center[0], y, cr.center[1]);
  const e = node('BRIDGE_CR_' + cr.id.replace(/^CR_/, ''), 'bridge', f, { fk: f, layer: 'ext', ov: 'circ', group: 'EXTERIOR', id: cr.id, frame: fr, own: true, extras: { name: cr.name, center: cr.center, w: cr.w, d: cr.d, yaw_deg: cr.yaw_deg, moving: cr.moving, animated: 'clip cradle_cycle moves this node between the stops', note: cr.note } });
  // build in local coordinates then move to world through the frame
  const lg = { s: new GB(tileOf('steel_dark')), g: new GB(tileOf('grating')), a: new GB(tileOf('alloy')), o: new GB(1) };
  const W = cr.w / 2, D = cr.d / 2;
  abox({ x: lg.s, y: lg.g, z: lg.s }, -W, W, -0.12, 0, -D, D);
  const rails = [[[-W, D - 0.03], [W, D - 0.03]], [[-W + 0.03, -D], [-W + 0.03, D]], [[W - 0.03, -D], [W - 0.03, D]]];
  for (const [a, b] of rails) { beam(lg.s, [a[0], 1.1, a[1]], [b[0], 1.1, b[1]], 0.05); beam(lg.s, [a[0], 0.55, a[1]], [b[0], 0.55, b[1]], 0.03); sbox(lg.s, a, b, 0.02, 0, 1.05); }
  for (const x of [-W + 0.05, W - 0.05]) for (const z of [-D + 0.05, D - 0.05]) beam(lg.s, [x, 0, z], [x, 1.1, z], 0.05);
  // hoist frame and cables up to the BMU rail
  for (const x of [-W + 0.3, W - 0.3]) { beam(lg.a, [x, 1.1, D - 0.03], [x, 2.2, 0], 0.06); beam(lg.a, [x, 2.2, 0], [x, 12.2 - y, 0], 0.015); }
  beam(lg.a, [-W + 0.3, 2.2, 0], [W - 0.3, 2.2, 0], 0.08);
  for (const [mk, g] of [['steel_dark', lg.s], ['grating', lg.g], ['alloy', lg.a]]) { const tg = g.toGeo(); tg.applyMatrix4(fr); e.gb(mk).addGeo(tg, null, false); tg.dispose(); }
  abox(e.gb('glow_purple'), cr.center[0] - 0.05, cr.center[0] + 0.05, y + 2.15, y + 2.25, cr.center[1] - 0.05, cr.center[1] + 0.05);
  CRADLE.node = e; CRADLE.cr = cr;
  // call panels at each stop (pictograms only): small posts beside the ledge
  const d = decoNode('X', 'cradle_panels', 'ext');
  for (const sy of cr.moving.stops_y) { const p = [cr.center[0] - 1.3, cr.center[1] + 1.3]; abox(d.gb('steel_dark'), p[0] - 0.08, p[0] + 0.08, sy, sy + 1.2, p[1] - 0.08, p[1] + 0.08); abox(d.gb('glow_purple'), p[0] - 0.05, p[0] + 0.05, sy + 1.0, sy + 1.12, p[1] + 0.08, p[1] + 0.09); }
}
const CRADLE = {};
function buildNeighbours() {
  for (const nb of EXT.neighbours) {
    if (nb.id === 'NB_east') eastTower(nb);
    else if (nb.id === 'NB_west') westRoof(nb);
    else if (nb.id === 'NB_crane') craneDeck(nb);
    else if (nb.id === 'NB_lowerblock') {
      const e = node('ENV_lowerblock', 'env', null, { fk: 'X', layer: 'env', ov: 'env', group: 'ENV', env: true, extras: { name: nb.name, note: nb.note } });
      prism(region([nb.footprint]), -180, -0.32, null, null, e.gb('env_facade'));
    }
  }
}
function eastTower(nb) {
  const [x0, z0] = [nb.footprint[0][0], nb.footprint[0][1]], [x1, z1] = [nb.footprint[2][0], nb.footprint[2][1]], hall = polyBox(nb.spawn_hall), top = nb.top_y;
  const hy = 4.2, hTop = 7.6;
  const env = node('ENV_NB_east', 'env', null, { fk: 'X', layer: 'env', ov: 'env', group: 'ENV', env: true, extras: { name: nb.name, note: nb.note } });
  const g = env.gb('env_facade');
  const low = [56, 12, 62, 18.5];   // truss landing room at y 0
  abox(g, x0, x1, -180, -0.3, z0, z1, '+y');
  abox(g, hall[2], x1, -0.3, hTop + 0.3, z0, z1, '-y+y');
  abox(g, x0, hall[2], -0.3, hTop + 0.3, z0, hall[1], '-y+y'); abox(g, x0, hall[2], -0.3, hTop + 0.3, hall[3], z1, '-y+y');
  abox(g, low[2], hall[2], -0.3, hy - 0.3, hall[1], hall[3], '-y'); abox(g, x0, low[2], -0.3, hy - 0.3, hall[1], low[1], '-y'); abox(g, x0, low[2], -0.3, hy - 0.3, low[3], hall[3], '-y');
  abox(g, x0, x1, hTop + 0.3, top, z0, z1, '-y');
  const h = node('HARD_NB_east_hall', 'hard', null, { fk: 'X', layer: 'ext', group: 'EXTERIOR', id: 'NB_east_hall', extras: { role: 'A3 spawn hall in the East Tower (floor, walls, ceiling)', polygon: nb.spawn_hall, y: hy } });
  const stair = nb.features.find((ft) => ft.kind === 'service_stair');
  prism(region([nb.spawn_hall], stair ? [rectP(stair.box[0], stair.box[1], stair.box[2], stair.box[3])] : []), hy - 0.3, hy, h.gb('terrazzo'), h.gb('ceiling_dark'), h.gb('concrete_dark'));
  abox(h.gb('ceiling_dark'), hall[0], hall[2], hTop, hTop + 0.3, hall[1], hall[3]);
  // hall walls: the west wall is solid except the bridge mouth (z 12..15)
  const wl = h.gb('plaster'), wc = h.gb('concrete_board');
  abox(wc, hall[0], hall[0] + 0.4, hy, hTop, hall[1], 12); abox(wc, hall[0], hall[0] + 0.4, hy, hTop, 15, hall[3]); abox(wc, hall[0], hall[0] + 0.4, hy + 3.2, hTop, 12, 15);
  abox(wl, hall[2] - 0.4, hall[2], hy, hTop, hall[1], hall[3]); abox(wl, hall[0], hall[2], hy, hTop, hall[1], hall[1] + 0.4); abox(wl, hall[0], hall[2], hy, hTop, hall[3] - 0.4, hall[3]);
  for (let x = hall[0] + 2; x < hall[2] - 1; x += 3) abox(h.gb('glow_cool'), x - 0.05, x + 0.05, hTop - 0.03, hTop, hall[1] + 1, hall[3] - 1);
  // lower room at y 0: truss landing and the service stair
  prism(region([rectP(low[0], low[1], low[2], low[3])]), -0.3, 0, h.gb('concrete'), null, null);
  abox(wc, low[0], low[0] + 0.4, 0, hy - 0.3, low[1], 12.75); abox(wc, low[0], low[0] + 0.4, 0, hy - 0.3, 14.25, low[3]); abox(wc, low[0], low[0] + 0.4, 2.4, hy - 0.3, 12.75, 14.25);
  abox(wl, low[2] - 0.3, low[2], 0, hy - 0.3, low[1], low[3]); abox(wl, low[0], low[2], 0, hy - 0.3, low[1], low[1] + 0.3); abox(wl, low[0], low[2], 0, hy - 0.3, low[3] - 0.3, low[3]);
  empty('OPEN_NB_east_truss', { fk: 'X', group: 'SLOTS', pos: [56, 0, 13.5], quat: quatOf(frameZ([0, 0, 0], [1, 0])), extras: { surface: 'opening', id: 'NB_east_truss', kind: 'door', w: 1.5, h: 2.4, note: 'East Tower service door onto the Bridge Truss' } });
  for (const ft of nb.features) {
    if (ft.kind === 'baffle') {
      const b = node('HARD_NB_east_baffle', 'hard', null, { fk: 'X', layer: 'ext', group: 'EXTERIOR', id: 'NB_east_baffle', extras: { role: 'hard baffle across the bridge mouth (spawn protection)', box: ft.box } });
      abox(b.gb('concrete_board'), ft.box[0], ft.box[2], ft.y0, ft.y0 + ft.h, ft.box[1], ft.box[3], '-y');
      abox(b.gb('glow_purple'), ft.box[0] - 0.01, ft.box[2] + 0.01, ft.y0 + ft.h - 0.1, ft.y0 + ft.h - 0.06, ft.box[1], ft.box[3]);
    } else if (ft.kind === 'service_stair') {
      const s = node('STAIR_NB_east_service', 'stair', null, { fk: 'X', layer: 'ext', ov: 'circ', group: 'EXTERIOR', id: 'NB_east_service', extras: { role: 'East Tower service stair (hall y 4.2 -> truss landing y 0); steep industrial stair', box: ft.box } });
      const zc = (ft.box[1] + ft.box[3]) / 2, w = ft.box[3] - ft.box[1] - 0.2;
      flight({ cap: s.gb('steel_dark'), top: s.gb('grating'), side: s.gb('steel_dark') }, [ft.box[0], zc], [ft.box[2], zc], ft.y0, ft.y1, w, 0.15);
      rampCollider('STAIR_NB_east_service', [ft.box[0], zc], [ft.box[2], zc], ft.y0, ft.y1, w);
    }
  }
}
function westRoof(nb) {
  const y = nb.top_y, fp = nb.footprint, [x0, z0, x1, z1] = polyBox(fp);
  const env = node('ENV_NB_west', 'env', null, { fk: 'X', layer: 'env', ov: 'env', group: 'ENV', env: true, extras: { name: nb.name } });
  prism(region([fp]), -180, y - 0.3, null, null, env.gb('env_facade'));
  const r = node('HARD_NB_west_roof', 'hard', null, { fk: 'X', layer: 'ext', ov: 'circ', group: 'EXTERIOR', id: 'NB_west_roof', extras: { role: 'West Roof deck (A2 spawn); defender reveal zone', y, footprint: fp, note: nb.note } });
  prism(region([fp]), y - 0.3, y, r.gb('stone_wet'), null, r.gb('concrete_dark'));
  // low parapet with gaps at the catwalk landings
  const gaps = ['catwalk', 'catwalk2'].map((k) => EXT[k]).filter(Boolean).map((c) => c.b[1]);
  for (let i = 0; i < fp.length; i++) {
    const a = fp[i], b = fp[(i + 1) % fp.length], d = P2.norm(P2.sub(b, a)), l = P2.len(P2.sub(b, a)), n = [-d[1], d[0]], inside = inPoly(P2.add(P2.lerp(a, b, 0.5), P2.mul(n, 0.3)), fp) ? 1 : -1;
    let keep = [[0, l]];
    if (Math.abs(a[0] - x1) < 0.01 && Math.abs(b[0] - x1) < 0.01) for (const gz of gaps) { const s = (gz - a[1]) / (b[1] - a[1]) * l; keep = idiff(keep, [[s - 1.2, s + 1.2]]); }
    for (const [s0, s1] of keep) sbox(r.gb('concrete_dark'), P2.add(P2.add(a, P2.mul(d, s0)), P2.mul(n, inside * 0.15)), P2.add(P2.add(a, P2.mul(d, s1)), P2.mul(n, inside * 0.15)), 0.3, y, y + 0.9);
  }
  for (const ft of nb.features) {
    if (ft.kind === 'helipad_ring') {
      const d = decoNode('X', 'west_roof', 'ext'), c = ft.center, R = ft.r;
      for (let k = 0; k < 48; k++) { const a0 = (k / 48) * Math.PI * 2, a1 = ((k + 1) / 48) * Math.PI * 2; sbox(d.gb('glow_purple'), [c[0] + Math.sin(a0) * R, c[1] + Math.cos(a0) * R], [c[0] + Math.sin(a1) * R, c[1] + Math.cos(a1) * R], 0.12, y, y + 0.012); }
      continue;
    }
    const id = 'NB_west_' + ft.kind, b = ft.box, e = node('HARD_' + id, 'hard', null, { fk: 'X', layer: 'ext', ov: 'prop_hard', group: 'EXTERIOR', id, extras: { role: ft.kind, box: b, h: ft.h } });
    if (ft.kind === 'plant_room') { abox({ x: e.gb('louvre'), y: e.gb('concrete_dark'), z: e.gb('louvre') }, b[0], b[2], y, y + ft.h, b[1], b[3], '-y'); abox(e.gb('concrete_dark'), b[0] - 0.3, b[2] + 0.3, y + ft.h, y + ft.h + 0.2, b[1] - 0.3, b[3] + 0.3); }
    else { abox({ x: e.gb('alloy'), y: e.gb('steel_dark'), z: e.gb('alloy') }, b[0], b[2], y, y + ft.h, b[1], b[3], '-y'); cylY({ side: e.gb('steel_dark'), top: e.gb('grating') }, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, Math.min(b[2] - b[0], b[3] - b[1]) * 0.42, y + ft.h, y + ft.h + 0.8, 24); }
  }
}
function craneDeck(nb) {
  const y = nb.top_y, fp = nb.footprint, [x0, z0, x1, z1] = polyBox(fp);
  const env = node('ENV_NB_crane', 'env', null, { fk: 'X', layer: 'env', ov: 'env', group: 'ENV', env: true, extras: { name: nb.name } });
  prism(region([fp]), -180, y - 0.3, null, null, env.gb('env_facade'));
  const r = node('HARD_NB_crane_deck', 'hard', null, { fk: 'X', layer: 'ext', ov: 'circ', group: 'EXTERIOR', id: 'NB_crane_deck', extras: { role: 'Crane Deck slab (A4 spawn), level with F3; defender reveal zone', y, footprint: fp, note: nb.note } });
  prism(region([fp]), y - 0.3, y, r.gb('deck_wet'), r.gb('concrete_dark'), r.gb('concrete_dark'));
  // construction hoarding round the edge, open where the gantry and the hoist ramp leave
  const exits = [EXT.gantry && EXT.gantry.b, EXT.hoist_ramp && EXT.hoist_ramp.b].filter(Boolean);
  const PL = polyline(fp, true), gaps = exits.map((p) => { const pr = PL.project(p); return [pr.s - 1.3, pr.s + 1.3]; });
  const hd = node('HARD_NB_crane_hoarding', 'hard', null, { fk: 'X', layer: 'ext', group: 'EXTERIOR', id: 'NB_crane_hoarding', extras: { role: 'edge hoarding 1.2 m (cover)' } });
  for (const [s0, s1] of idiff([[0, PL.total]], gaps)) {
    const cuts = [s0, ...PL.S.filter((s) => s > s0 && s < s1), s1];
    for (let k = 0; k < cuts.length - 1; k++) { const a = PL.at(cuts[k] + 1e-4).p, b = PL.at(cuts[k + 1] - 1e-4).p, mid = P2.lerp(a, b, 0.5), cc = [(x0 + x1) / 2, (z0 + z1) / 2], n = P2.norm(P2.sub(cc, mid)); sbox(hd.gb('steel_dark'), P2.add(a, P2.mul(n, 0.05)), P2.add(b, P2.mul(n, 0.05)), 0.06, y, y + 1.2); }
  }
  nb.features.forEach((ft, fi) => {
    const id = 'NB_crane_' + ft.kind + '_' + fi;
    if (ft.kind === 'tower_crane_mast') {
      const e = node('HARD_' + id, 'hard', null, { fk: 'X', layer: 'ext', group: 'EXTERIOR', id, extras: { role: 'tower crane mast (lattice)', center: ft.center, h: ft.h } }), g = e.gb('alloy'), c = ft.center, s = 1.0;
      const corners = [[c[0] - s, c[1] - s], [c[0] + s, c[1] - s], [c[0] + s, c[1] + s], [c[0] - s, c[1] + s]];
      for (const p of corners) beam(g, [p[0], y, p[1]], [p[0], y + ft.h, p[1]], 0.16);
      for (let yy = y; yy < y + ft.h; yy += 3) for (let k = 0; k < 4; k++) { const a = corners[k], b = corners[(k + 1) % 4]; beam(g, [a[0], yy, a[1]], [b[0], yy + 3, b[1]], 0.07); beam(g, [a[0], yy, a[1]], [b[0], yy, b[1]], 0.07); }
      const yt = y + ft.h;
      beam(g, [c[0] - 14, yt + 1, c[1]], [c[0] + 52, yt + 1, c[1] + 26], 0.5);
      abox(e.gb('concrete_dark'), c[0] - 16, c[0] - 11, yt - 1, yt + 1.5, c[1] - 2, c[1] + 2);
      abox(e.gb('glow_red'), c[0] - 0.2, c[0] + 0.2, yt + 4, yt + 4.4, c[1] - 0.2, c[1] + 0.2);
      beam(g, [c[0], yt, c[1]], [c[0], yt + 4, c[1]], 0.3);
      return;
    }
    const b = ft.box, h = ft.h, e = node('HARD_' + id, 'hard', null, { fk: 'X', layer: 'ext', ov: 'prop_hard', group: 'EXTERIOR', id, extras: { role: ft.kind, box: b, h } });
    if (ft.kind === 'material_stack') { abox(e.gb('wood'), b[0], b[2], y, y + h * 0.5, b[1], b[3], '-y'); abox(e.gb('steel_dark'), b[0] + 0.1, b[2] - 0.1, y + h * 0.5, y + h, b[1] + 0.1, b[3] - 0.1, '-y'); }
    else if (ft.kind === 'hut_roof') abox(e.gb('steel_dark'), b[0] - 0.2, b[2] + 0.2, y + h - 0.15, y + h, b[1] - 0.2, b[3] + 0.2);
    else abox(e.gb('steel_dark'), b[0], b[2], y, y + h, b[1], b[3], '-y');
  });
  // hut posts (west and north sides are open)
  const hi = nb.features.findIndex((ft) => ft.kind === 'hut_roof'), hut = nb.features[hi];
  if (hut) {
    const e = BYNAME.get('HARD_NB_crane_hut_roof_' + hi), b = hut.box; for (const [px, pz] of [[b[0] + 0.1, b[1] + 0.1], [b[0] + 0.1, b[3] - 0.1]]) abox(e.gb('steel_dark'), px - 0.08, px + 0.08, y, y + hut.h, pz - 0.08, pz + 0.08, '-y');
    // site hut dressing: ribbed dark metal on the closed east side, a caged warm work lamp under the roof
    const dh = decoNode('X', 'crane_hut', 'ext'), cx = (b[0] + b[2]) / 2, cz = (b[1] + b[3]) / 2;
    for (let z = b[1] + 0.1; z < b[3] - 0.1; z += 0.2) abox(dh.gb('steel_dark'), b[2] - 0.08, b[2] - 0.03, y + 0.05, y + hut.h - 0.2, z, z + 0.1);
    abox(dh.gb('glow_warm'), cx - 0.12, cx + 0.12, y + hut.h - 0.45, y + hut.h - 0.3, cz - 0.12, cz + 0.12);
    for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) abox(dh.gb('black'), cx + a * 0.15 - 0.01, cx + a * 0.15 + 0.01, y + hut.h - 0.5, y + hut.h - 0.15, cz + c * 0.15 - 0.01, cz + c * 0.15 + 0.01);
  }
  { // amber safety-light strips along the deck edge (no stencils)
    const dh = decoNode('X', 'crane_hut', 'ext');
    for (let i = 0; i < fp.length; i++) { const a = fp[i], b2 = fp[(i + 1) % fp.length], m = P2.lerp(a, b2, 0.5), c = [(x0 + x1) / 2, (z0 + z1) / 2], n = P2.norm(P2.sub(c, m)); sbox(dh.gb('glow_amber'), P2.add(P2.lerp(a, b2, 0.1), P2.mul(n, 0.35)), P2.add(P2.lerp(a, b2, 0.9), P2.mul(n, 0.35)), 0.05, y, y + 0.012); }
  }
}
function buildTowerBands() {
  // 99F mechanical band: louvres and diagonal lattice bracing, BMU rail; the tower above to the crown
  const mf = EXT.mech_floor, ta = EXT.tower_above;
  const e = node('ENV_mech_band', 'env', null, { fk: 'R', layer: 'env', ov: 'env', group: 'ENV', env: true, extras: { role: '99F mechanical floor band (hard, not playable)', y0: mf.y0, y1: mf.y1 } });
  prism(region([L.outline]), mf.y0, mf.y1, null, null, e.gb('louvre'));
  const P = L.outline;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], d = P2.norm(P2.sub(b, a)), l = P2.len(P2.sub(b, a)), o = [d[1], -d[0]], nb = Math.max(1, Math.round(l / 6));
    for (let k = 0; k < nb; k++) {
      const p0 = P2.add(P2.lerp(a, b, k / nb), P2.mul(o, 0.12)), p1 = P2.add(P2.lerp(a, b, (k + 1) / nb), P2.mul(o, 0.12));
      beam(e.gb('alloy'), [p0[0], mf.y0, p0[1]], [p1[0], mf.y1, p1[1]], 0.35); beam(e.gb('alloy'), [p1[0], mf.y0, p1[1]], [p0[0], mf.y1, p0[1]], 0.35);
    }
    const q0 = P2.add(a, P2.mul(o, 0.1)), q1 = P2.add(b, P2.mul(o, 0.1));
    sbox(e.gb('alloy'), q0, q1, 0.3, mf.y0, mf.y0 + 0.4); sbox(e.gb('alloy'), q0, q1, 0.3, mf.y1 - 0.4, mf.y1);
    sbox(e.gb('glow_purple'), P2.add(a, P2.mul(o, 0.26)), P2.add(b, P2.mul(o, 0.26)), 0.03, mf.y0 + 0.15, mf.y0 + 0.19);
  }
  // BMU rail at 12.2 (rappel anchor) 0.6 m outside the glass, on brackets
  const bmu = node('ENV_bmu_rail', 'env', null, { fk: 'R', layer: 'env', ov: 'env', group: 'ENV', env: true, extras: { role: 'BMU rail: rappel anchor line', y: EXT.rappel.y1, anchor: EXT.rappel.anchor } });
  const ring = []; for (let i = 0; i < P.length; i++) { const pr = P[(i - 1 + P.length) % P.length], c = P[i], nx = P[(i + 1) % P.length], d1 = P2.norm(P2.sub(c, pr)), d2 = P2.norm(P2.sub(nx, c)), o1 = [d1[1], -d1[0]], o2 = [d2[1], -d2[0]], s = 1 + P2.dot(o1, o2); ring.push(P2.add(c, P2.mul(P2.add(o1, o2), 0.6 / s))); }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]; sbox(bmu.gb('steel_dark'), a, b, 0.16, EXT.rappel.y1 - 0.12, EXT.rappel.y1 + 0.12);
    const l = P2.len(P2.sub(b, a)), d = P2.norm(P2.sub(b, a));
    for (let s = 1.5; s < l; s += 3) { const p = P2.add(a, P2.mul(d, s)), q = P2.lerp(p, P2.lerp(P[i], P[(i + 1) % P.length], s / l), 1); sbox(bmu.gb('steel_dark'), p, q, 0.08, EXT.rappel.y1 + 0.05, EXT.rappel.y1 + 0.4); }
  }
  const t = node('ENV_tower_above', 'env', null, { fk: 'R', layer: 'env', ov: 'env', group: 'ENV', env: true, extras: { role: 'tower above the map: ' + ta.floors, crown_y: ta.crown_y } });
  const body = ta.crown_y - 12;
  prism(region([L.outline]), mf.y1, body, null, null, t.gb('tower_facade'));
  prism(region([L.outline]), body, body + 0.4, t.gb('concrete_dark'), null, t.gb('alloy'));
  // lattice crown with purple edge light
  const cr = L.outline.map((p) => P2.mul(p, 0.78));
  for (let i = 0; i < cr.length; i++) {
    const a = cr[i], b = cr[(i + 1) % cr.length], top = P2.mul(a, 0.55);
    beam(t.gb('alloy'), [a[0], body, a[1]], [top[0], ta.crown_y, top[1]], 0.4);
    beam(t.gb('alloy'), [a[0], body, a[1]], [b[0], body + 6, b[1]], 0.25);
    beam(t.gb('glow_purple'), [a[0] * 1.002, body + 0.5, a[1] * 1.002], [top[0] * 1.002, ta.crown_y, top[1] * 1.002], 0.06);
  }
  beam(t.gb('alloy'), [0, ta.crown_y, 0], [0, ta.crown_y + 14, 0], 0.5);
  abox(t.gb('glow_red'), -0.3, 0.3, ta.crown_y + 14, ta.crown_y + 14.6, -0.3, 0.3);
}

/* ------------------------------------------------------------------ gameplay props (blockouts the floor parts may dress) */

const PROPS = new Map();
function buildProps() {
  for (const p of L.props) {
    const y = FY(p.floor), [x0, z0, x1, z1] = p.box, hard = p.type === 'hard';
    const e = node((hard ? 'HARD_' : 'SOFT_') + p.id, hard ? 'hard' : 'soft', p.floor, {
      fk: p.floor, layer: 'props', ov: hard ? 'prop_hard' : 'prop_soft', group: 'PROPS', id: p.id,
      extras: { role: 'gameplay prop', kind: p.kind, box: p.box, h: p.h, cover: p.cover, type: p.type, room: p.room, shape: p.shape, note: p.note, roof: p.roof || undefined, collider: 'COL_' + p.id },
    });
    const info = { id: p.id, rec: p, node: e, y, box: p.box, h: p.h, center: [(x0 + x1) / 2, (z0 + z1) / 2], dressed: false };
    PROPS.set(p.id, info);
    blockoutProp(info);
    const hh = Math.max(0.05, Math.abs(p.h));
    colBox('COL_' + p.id, [(x0 + x1) / 2, y + (p.h >= 0 ? hh / 2 : -hh / 2), (z0 + z1) / 2], [x1 - x0, hh, z1 - z0], 0, { fk: p.floor, extras: { surface: 'collider', role: 'prop ' + p.kind, prop: p.id, type: p.type, cover: p.cover, shape: p.shape } });
    if (p.roof) {
      const r = p.roof, eb = r.eaves_box;
      colBox('COL_' + p.id + '_roof', [(eb[0] + eb[2]) / 2, y + (r.eave_y + r.ridge_y) / 2, (eb[1] + eb[3]) / 2], [eb[2] - eb[0], r.ridge_y - r.eave_y, eb[3] - eb[1]], 0, { fk: p.floor, extras: { surface: 'collider', role: 'pavilion roof: slide-off (not walkable)', walkable: false, pitch_deg: r.pitch_deg } });
    }
  }
}
function blockoutProp(info) {
  const p = info.rec, e = info.node, y = info.y, [x0, z0, x1, z1] = p.box, hard = p.type === 'hard';
  e.parts = {};
  const mk = hard ? 'stone_dark' : 'wood';
  if (p.h < 0) {   // sunken (hot pool)
    abox(e.gb('water'), x0, x1, y - 0.02, y - 0.01, z0, z1, '-y');
    for (const [a, b, c, d] of [[x0 - 0.25, x1 + 0.25, z0 - 0.25, z0], [x0 - 0.25, x1 + 0.25, z1, z1 + 0.25], [x0 - 0.25, x0, z0, z1], [x1, x1 + 0.25, z0, z1]]) abox(e.gb('stone'), a, b, y, y + 0.06, c, d, '-y');
    return;
  }
  if (p.h < 0.01) { abox(e.gb('water'), x0, x1, y + 0.005, y + 0.01, z0, z1, '-y'); return; }
  if (p.shape === 'round') { cylY({ side: e.gb(mk), top: e.gb('steel_dark') }, (x0 + x1) / 2, (z0 + z1) / 2, Math.min(x1 - x0, z1 - z0) / 2, y, y + p.h, 48); return; }
  abox({ x: e.gb(mk), y: e.gb(hard ? 'concrete' : 'wood_dark'), z: e.gb(mk) }, x0, x1, y, y + p.h, z0, z1, '-y');
  if (p.roof) {
    const r = p.roof, eb = r.eaves_box, cx = (eb[0] + eb[2]) / 2;
    for (const [px, pz] of [[x0 + 0.3, z0 + 0.3], [x1 - 0.3, z0 + 0.3], [x0 + 0.3, z1 - 0.3], [x1 - 0.3, z1 - 0.3]]) abox(e.gb('wood_dark'), px - 0.12, px + 0.12, y + p.h, y + r.eave_y, pz - 0.12, pz + 0.12);
    const hw = (eb[2] - eb[0]) / 2, prof = [[-hw - 0.2, r.eave_y + 0.25], [-hw * 0.6, r.eave_y + 0.05], [0, r.ridge_y], [hw * 0.6, r.eave_y + 0.05], [hw + 0.2, r.eave_y + 0.25], [hw + 0.2, r.eave_y + 0.35], [hw * 0.6, r.eave_y + 0.2], [0, r.ridge_y + 0.2], [-hw * 0.6, r.eave_y + 0.2], [-hw - 0.2, r.eave_y + 0.35]];
    extrudeProfile({ cap: e.gb('wood_dark'), top: e.gb('stone_dark'), side: e.gb('wood_dark') }, prof, [cx, y, (eb[1] + eb[3]) / 2], [1, 0, 0], [0, 0, 1], eb[3] - eb[1]);
  }
}

/* ------------------------------------------------------------------ set pieces: the stage hologram */

function buildSetPieces() {
  for (const sp of L.set_pieces) {
    if (sp.kind !== 'holo') continue;
    const f = sp.floor, y = FY(f), [cx, cz] = sp.center;
    const e = node('HOLO_' + sp.id.replace(/^HOLO_/, ''), 'holo', f, { fk: f, layer: 'holo', ov: 'holo', group: 'PROPS', id: sp.id, own: true, extras: { center: sp.center, radius: sp.radius, y0: sp.y0, y1: sp.y1, blocks: sp.blocks, bullets: sp.bullets, default: sp.default, switch: sp.switch, note: sp.note, collider: 'none for bullets and players; use the mesh as a vision blocker' } });
    const g = e.gb('holo'), seg = 40;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = [cx + Math.sin(a0) * sp.radius, cz + Math.cos(a0) * sp.radius], p1 = [cx + Math.sin(a1) * sp.radius, cz + Math.cos(a1) * sp.radius];
      const q = [[p0[0], y + sp.y0, p0[1]], [p1[0], y + sp.y0, p1[1]], [p1[0], y + sp.y1, p1[1]], [p0[0], y + sp.y1, p0[1]]], am = (a0 + a1) / 2;
      const base = g.nv; g.face(q, [Math.sin(am), 0, Math.cos(am)]);
      // the hologram texture wraps once around the cylinder
      for (let k = base; k < g.nv; k++) {
        const px = g.p[k * 3], py = g.p[k * 3 + 1], pz = g.p[k * 3 + 2], near0 = Math.hypot(px - p0[0], pz - p0[1]) < Math.hypot(px - p1[0], pz - p1[1]);
        g.u[k * 2] = (near0 ? i : i + 1) / seg; g.u[k * 2 + 1] = (py - (y + sp.y0)) / (sp.y1 - sp.y0);
      }
    }
    const em = node('HOLO_' + sp.id.replace(/^HOLO_/, '') + '_emitter', 'holo', f, { fk: f, layer: 'props', ov: 'holo', group: 'PROPS', id: sp.id + '_emitter', extras: { role: 'hologram emitter ring (destructible: shooting it kills the hologram for the round)', r: sp.emitter.r, y: sp.emitter.y, destructible: sp.emitter.destructible } });
    const rg = new THREE.TorusGeometry(sp.emitter.r, 0.06, 8, 96); rg.rotateX(Math.PI / 2); rg.translate(cx, y + sp.emitter.y, cz);
    em.gb('glow_purple').addGeo(rg); rg.dispose();
    HOLO.node = e; HOLO.sp = sp;
  }
}
const HOLO = {};

/* ------------------------------------------------------------------ markers: spawns, objectives, cover, callouts, reveal zones */

const LABELS = [];
function buildMarkers() {
  for (const a of L.spawns.attackers) a.points.forEach((p, i) => empty('SPAWN_ATK_' + a.id + '_' + (i + 1), { fk: a.floor, pos: p.map(r3), extras: { surface: 'spawn', team: 'attack', spawn: a.id, name: a.name, floor: a.floor, approach: a.approach } }));
  for (const d of L.spawns.defenders) d.points.forEach((p, i) => empty('SPAWN_DEF_' + d.id + '_' + (i + 1), { fk: d.floor, pos: p.map(r3), extras: { surface: 'spawn', team: 'defend', spawn: d.id, site: d.site, floor: d.floor } }));
  for (const s of L.sites) for (const o of s.objectives) empty('OBJ_' + o.id, { fk: s.floor, pos: o.pos.map(r3), extras: { surface: 'objective', id: o.id, site: s.id, site_name: s.name, room: o.room, floor: s.floor } });
  for (const c of L.cover) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -THREE.MathUtils.degToRad(c.yaw_deg) + Math.PI).toArray().map(r3);
    empty('COVER_' + c.id, { fk: c.floor, pos: [c.x, FY(c.floor), c.z].map(r3), quat: q, extras: { surface: 'cover', id: c.id, kind: c.kind, w: c.w, h: c.h, yaw_deg: c.yaw_deg, floor: c.floor, facing: '+Z = the cover faces yaw (0 = north / -z)' } });
  }
  for (const r of L.rooms) {
    if (r.kind === 'solid') continue;
    const y = FY(r.floor);
    empty('CALLOUT_' + r.id, { fk: r.floor, pos: [r.label[0], y, r.label[1]].map(r3), extras: { surface: 'callout', id: r.id, name: r.name, floor: r.floor, kind: r.kind, site: r.site || undefined } });
    LABELS.push({ text: r.name, pos: [r.label[0], y + 1.4, r.label[1]], fk: r.floor, kind: r.site ? 'site' : r.kind === 'corridor' ? 'corridor' : 'room', site: r.site || null });
  }
  const ext = [['Sky Terrace', [0, 1.6, 40]], ['West Roof', [-52, 0.4, -4]], ['Crane Deck', [-38, 10, -56]], ['East Tower', [64, 9.5, 10]], ['Skybridge', [41, 7.8, 13.5]], ['Bridge Truss', [41, 1.4, 13.5]], ['Catwalk', [-31, 1.6, -5.25]], ['South Catwalk', [-31, 1.6, 15.75]], ['Gantry', [-30.5, 10, -34.2]], ['Hoist Ramp', [-21, 7.6, -34.6]], ['Cradle', [24.4, 6.8, -24.4]]];
  for (const [t, p] of ext) LABELS.push({ text: t, pos: p, fk: 'X', kind: 'ext' });
  for (const a of L.spawns.attackers) { const c = a.points.reduce((s, p) => [s[0] + p[0] / a.points.length, s[1] + p[1] / a.points.length, s[2] + p[2] / a.points.length], [0, 0, 0]); LABELS.push({ text: a.id + ' ' + a.name, pos: [c[0], c[1] + 2.4, c[2]], fk: 'X', kind: 'spawn' }); }
  for (const z of EXT.defender_reveal_zones) {
    const y = Array.isArray(z.y) ? z.y : [z.y, z.y], zr = empty(z.id, { fk: 'X', group: 'MARKERS', pos: [0, y[0], 0], extras: { surface: 'zone_ext', id: z.id, kind: z.kind, ref: z.ref, y: z.y, polygon: z.polygon, path: z.path, closed: z.closed, width: z.width, height: 2.5, note: z.note || 'defender reveal zone (trigger, no geometry); children are box volumes' } });
    zoneBoxes(z, y).forEach((b, k) => colBox(z.id + '_' + k, b.c, b.s, b.yaw, { group: 'MARKERS', parent: zr.name, extras: { surface: 'zone_ext', zone: z.id } }));
  }
}
// trigger volumes for a reveal zone: oriented boxes (rectangles, path strips) or region slabs
function zoneBoxes(z, y) {
  const H = 2.5, out = [], yc = (y[0] + y[1]) / 2 + H / 2, hy = y[1] - y[0] + H;
  if (z.path) {
    const p = z.path, n = p.length, segs = z.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = p[i], b = p[(i + 1) % n], d = P2.norm(P2.sub(b, a)), o = [d[1], -d[0]], l = P2.len(P2.sub(b, a)), c = P2.add(P2.lerp(a, b, 0.5), P2.mul(o, z.width / 2));
      out.push({ c: [c[0], yc, c[1]], s: [z.width, hy, l + z.width], yaw: yawOf(d) });
    }
    return out;
  }
  const p = z.polygon;
  if (p.length === 4) {
    const e0 = P2.sub(p[1], p[0]), e1 = P2.sub(p[2], p[1]);
    if (Math.abs(P2.dot(e0, e1)) < 1e-3 * P2.len(e0) * P2.len(e1)) {
      const c = [(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2];
      out.push({ c: [c[0], yc, c[1]], s: [P2.len(e1), hy, P2.len(e0)], yaw: yawOf(P2.norm(e0)) });
      return out;
    }
  }
  for (const t of region([p]).traps) out.push({ c: [(t.xa + t.xb) / 2, yc, (t.a0 + t.b0 + t.a1 + t.b1) / 4], s: [t.xb - t.xa, hy, ((t.a1 - t.a0) + (t.b1 - t.b0)) / 2], yaw: 0 });
  return out;
}

/* ------------------------------------------------------------------ fallback backdrop (the exterior part may replace it) */
// A cheap night city 403 m below: street grid, the river with lit bridges, towers with lit windows, a ridge ring and a
// lattice broadcast tower on a hill to the NNE. Everything sits in the 'skyline' layer.
function buildFallbackBackdrop() {
  const G = -403, e = node('ENV_skyline_fallback', 'env', null, { fk: 'X', layer: 'skyline', ov: 'env', group: 'ENV', env: true, part: 'fallback', extras: { role: 'fallback skyline backdrop (engine); parts/exterior.js may replace it' } });
  const R = rnd(901), towers = e.gb('env_facade');
  const riverZ = [260, 1460];
  for (let i = 0; i < 260; i++) {
    const a = R() * Math.PI * 2, d = 150 + Math.pow(R(), 0.7) * 2600, x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (z > riverZ[0] - 60 && z < riverZ[1] + 60) continue;
    if (x > 40 && x < 100 && z > -20 && z < 45) continue;
    const w = 22 + R() * 40, dd = 22 + R() * 40, h = d < 380 ? 180 + R() * 190 : d < 1000 ? 220 + R() * 330 : 140 + R() * 420;
    abox(towers, x - w / 2, x + w / 2, G, G + h, z - dd / 2, z + dd / 2, '-y');
    if (R() < 0.18) abox(e.gb('glow_purple'), x - w / 2 - 0.3, x + w / 2 + 0.3, G + h - 1.2, G + h - 0.6, z - dd / 2 - 0.3, z + dd / 2 + 0.3);
  }
  const ground = node('ENV_ground_fallback', 'env', null, { fk: 'X', layer: 'skyline', ov: 'env', group: 'ENV', env: true, part: 'fallback', extras: { role: 'streets and river (fallback)' } });
  abox(ground.gb('stone_wet'), -6000, 6000, G - 1, G, -6000, riverZ[0], '-y');
  abox(ground.gb('stone_wet'), -6000, 6000, G - 1, G, riverZ[1], 6000, '-y');
  abox(ground.gb('water'), -6000, 6000, G - 6, G - 5, riverZ[0], riverZ[1], '-y');
  for (const bx of [-2400, -1100, 300, 1600, 2900]) {
    abox(ground.gb('concrete_dark'), bx - 14, bx + 14, G + 18, G + 22, riverZ[0] - 40, riverZ[1] + 40);
    abox(ground.gb('glow_warm'), bx - 13, bx - 12, G + 22, G + 22.4, riverZ[0] - 40, riverZ[1] + 40);
    abox(ground.gb('glow_red'), bx + 12, bx + 13, G + 22, G + 22.4, riverZ[0] - 40, riverZ[1] + 40);
  }
  // street light lines (a grid of avenues north of the river)
  for (let x = -3000; x <= 3000; x += 240) abox(ground.gb('glow_street'), x - 1.0, x + 1.0, G + 0.2, G + 0.4, -3000, riverZ[0] - 20);
  for (let z = -3000; z < riverZ[0] - 20; z += 240) abox(ground.gb('glow_street'), -3000, 3000, G + 0.2, G + 0.4, z - 1.0, z + 1.0);
  // the ridge ring and the broadcast tower on its hill
  const ridge = node('ENV_ridge_fallback', 'env', null, { fk: 'X', layer: 'skyline', ov: 'env', group: 'ENV', env: true, part: 'fallback', extras: { role: 'mountain ridges (fallback)' } }), rg = ridge.gb('black');
  const RR = rnd(77), segs = 96;
  let prevH = 300;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2, r = 5200, h1 = 260 + RR() * 520 + 160 * Math.sin(a1 * 3);
    const p0 = [Math.sin(a0) * r, Math.cos(a0) * r], p1 = [Math.sin(a1) * r, Math.cos(a1) * r];
    rg.face([[p0[0], G, p0[1]], [p1[0], G, p1[1]], [p1[0], G + h1, p1[1]], [p0[0], G + prevH, p0[1]]], [-Math.sin((a0 + a1) / 2), 0, -Math.cos((a0 + a1) / 2)]);
    prevH = h1;
  }
  const hill = [900, -2800], tw = ridge.gb('glow_pink'), tg = ridge.gb('alloy');
  cylY({ side: rg, top: rg }, hill[0], hill[1], 520, G, G + 210, 24);
  const base = G + 210, H = 240;
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4, b = [hill[0] + Math.sin(a) * 18, hill[1] + Math.cos(a) * 18]; beam(tg, [b[0], base, b[1]], [hill[0], base + H, hill[1]], 1.6); beam(tw, [b[0] + 0.8, base, b[1]], [hill[0] + 0.8, base + H, hill[1]], 0.5); }
  for (let yy = base + 40; yy < base + H - 20; yy += 40) { const s = 18 * (1 - (yy - base) / H); abox(tw, hill[0] - s, hill[0] + s, yy, yy + 1.2, hill[1] - s, hill[1] + s, '+y-y'); }
  abox(ridge.gb('glow_purple'), hill[0] - 6, hill[0] + 6, base + 120, base + 132, hill[1] - 6, hill[1] + 6);
  beam(tw, [hill[0], base + H, hill[1]], [hill[0], base + H + 60, hill[1]], 1.0);
}

/* ------------------------------------------------------------------ the kit for the dressing parts */

const PARTS = {};   // parts/*.js fill these: PARTS.exterior, PARTS.floor_1, PARTS.floor_2, PARTS.floor_3
const PART_ORDER = ['exterior', ...FIDS.map((f, i) => 'floor_' + (i + 1))];
const PART_FLOOR = Object.fromEntries(FIDS.map((f, i) => ['floor_' + (i + 1), f]));
const LAYERS = {};   // viewer-only groups by name (rain, skyline, fx ...)
const BUDGET = { trisPerFloor: 140000, trisExterior: 160000, lightsPerFloor: 4, lightsExterior: 2 };
let CURPART = null;
function makeKit(opts) {
  const K = {
    pool: (fk, x, z, r, mk = 'pool_warm', dy = 0.004) => lightPool(decoNode(fk, 'pools'), x, FY(fk) + dy, z, r, mk),
    THREE, L, FL, FIDS, FY, CEIL, SLAB, F2F, ROOF_Y, M, TX, fast: !!opts.fast, BUDGET, rng: rnd, timings: {},
    // geometry
    GB, obox, abox, sbox, beam, extrudeProfile, region, prism, cylY, rectP, sqP, inPoly, polyBox, polyDist, outlineDist, polyline, frameZ, flight, P2,
    curve, loft, roundedShape, slab, latheX, clean, creased, subtract, subtractEach, box, mergeGeometries,
    canvas: cv, noise, img, abstractCanvas, asTex,
    // layout lookups
    room: (id) => ROOM.get(id), rooms: (fid) => L.rooms.filter((r) => r.floor === fid),
    roomBox: (id) => polyBox(ROOM.get(id).polygon), wall: (id) => WALLS.get(id), wallFrame, wp, wbox,
    prop: (id) => PROPS.get(id), props: (fid) => [...PROPS.values()].filter((p) => p.rec.floor === fid),
    bay: (id) => L.facade.bays.find((b) => b.id === id),
    // materials: K.M[key]; K.material(key, THREE.Material, {tile, env}) registers one (name it, it becomes the glTF material)
    material(key, m, o = {}) { m.name = m.name || key; m.userData = Object.assign({ tile: o.tile || 1, env: o.env || 'in', envI: o.envI ?? 1, ei: m.emissiveIntensity || 0 }, m.userData || {}); M[key] = m; return m; },
    // static dressing in world coordinates, merged per material into DECO_<floor>_<kind> (export) and the display
    deco(fid, kind = 'dressing', layer = 'deco') { return decoNode(fid, (CURPART ? CURPART + '_' : '') + kind, layer); },
    add(fid, geo, mk, o = {}) { const e = K.deco(fid, o.kind || 'dressing', o.layer || 'deco'); e.gb(mk).addGeo(geo, o.matrix || null, !!o.keepUV); return e; },
    instances(fid, geo, mk, matrices, o = {}) { const e = K.deco(fid, o.kind || 'instanced', o.layer || 'deco'); const g = e.gb(mk); for (const m of matrices) g.addGeo(geo, m, !!o.keepUV); return e; },
    // gameplay props: replace a blockout with detail. fn(gb, info) writes world-space geometry: gb(materialKey) -> GB
    dressProp(id, fn) {
      const info = PROPS.get(id); if (!info) throw new Error('no prop ' + id);
      const before = info.node.parts, was = info.dressed;
      if (JOURNAL) JOURNAL.push(() => { info.node.parts = before; info.dressed = was; });
      info.node.parts = {}; fn(info.node.gb, info); info.dressed = true; return info.node;
    },
    // room finishes and ceilings (material keys)
    finish(roomId, mk) { const old = FINISH.get(roomId); if (JOURNAL) JOURNAL.push(() => FINISH.set(roomId, old)); FINISH.set(roomId, mk); },
    ceiling(roomId, mk) { const old = CEILMAT.get(roomId); if (JOURNAL) JOURNAL.push(() => CEILMAT.set(roomId, old)); CEILMAT.set(roomId, mk); },
    // a real light (budgeted; no shadows): {pos, color, intensity, distance, decay}
    light(fid, o) {
      const n = LIGHTS.filter((l) => l.fk === fid).length, max = fid === 'X' ? BUDGET.lightsExterior : BUDGET.lightsPerFloor;
      if (n >= max) { STATS.warnings.push('light budget reached on ' + fid); return null; }
      const l = { fk: fid, o }; LIGHTS.push(l); if (JOURNAL) JOURNAL.push(() => LIGHTS.splice(LIGHTS.indexOf(l), 1)); return l;
    },
    // viewer-only objects (not exported): rain, particles, animated screens. layer: a name the UI can toggle
    view(obj, layer = 'fx', fk = 'X') { obj.userData.fk = fk; obj.userData.layer = layer; VIEWONLY.push(obj); if (JOURNAL) JOURNAL.push(() => VIEWONLY.splice(VIEWONLY.indexOf(obj), 1)); return obj; },
    // remove the engine's fallback skyline (the exterior part calls this when it builds its own)
    dropFallback() { for (const e of REG.filter((r) => r.part === 'fallback')) { e.display = false; e.export = false; if (JOURNAL) JOURNAL.push(() => { e.display = true; e.export = true; }); } FALLBACK_RAIN.on = false; if (JOURNAL) JOURNAL.push(() => { FALLBACK_RAIN.on = true; }); },
    onTick(fn) { TICKS.push(fn); if (JOURNAL) JOURNAL.push(() => TICKS.splice(TICKS.indexOf(fn), 1)); },
    // what dressing must keep clear (plan boxes [x0, z0, x1, z1] with a reason), and a check
    keepouts: (fid) => KEEPOUT.filter((k) => k.fk === fid),
    check(fid, b) { return KEEPOUT.filter((k) => k.fk === fid && b[0] < k.box[2] && b[2] > k.box[0] && b[1] < k.box[3] && b[3] > k.box[1]); },
    warn: (msg) => STATS.warnings.push((CURPART || 'engine') + ': ' + msg),
    // names and types of what the engine built (read only)
    nodes: () => REG.map((e) => ({ name: e.name, surface: e.surface, fk: e.fk })), slots: () => SLOTS, units: () => UNITS,
  };
  return K;
}
const FALLBACK_RAIN = { on: true };
// keep-outs for dressing: 1.0 m each side of every interior opening, 1.5 m inside facade entries, stair ends, hatches,
// patches, cover spots and spawn points
const KEEPOUT = [];
function buildKeepouts() {
  for (const s of SLOTS) {
    const F = s.F, o = s.o, depth = s.facade ? 1.5 : 1.0, sides = s.facade ? [1] : [1, -1];
    for (const sg of sides) {
      const p = [wp(F, o.u0, 0, 0), wp(F, o.u1, 0, 0), wp(F, o.u0, 0, sg * depth), wp(F, o.u1, 0, sg * depth)];
      const xs = p.map((q) => q[0]), zs = p.map((q) => q[2]);
      KEEPOUT.push({ fk: s.fk, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)], why: s.kind + ' ' + (o.id || '') });
    }
  }
  for (const h of L.hatches) KEEPOUT.push({ fk: h.floor, box: [h.x - 0.7, h.z - 0.7, h.x + 0.7, h.z + 0.7], why: 'hatch ' + h.id });
  for (const h of L.hatches) { const r = ROOM.get(h.bottom_room); if (r) KEEPOUT.push({ fk: r.floor, box: [h.x - 0.7, h.z - 0.7, h.x + 0.7, h.z + 0.7], why: 'under hatch ' + h.id }); }
  for (const p of L.floor_patches) KEEPOUT.push({ fk: p.floor, box: [p.x - p.w / 2, p.z - p.d / 2, p.x + p.w / 2, p.z + p.d / 2], why: 'soft patch ' + p.id });
  for (const c of L.cover) KEEPOUT.push({ fk: c.floor, box: [c.x - 0.8, c.z - 0.8, c.x + 0.8, c.z + 0.8], why: 'cover spot ' + c.id });
  for (const d of L.spawns.defenders) for (const p of d.points) KEEPOUT.push({ fk: d.floor, box: [p[0] - 0.4, p[2] - 0.4, p[0] + 0.4, p[2] + 0.4], why: 'defender spawn ' + d.id });
  for (const st of L.stairs) if (st.path) {
    const P = st.path, f = floorOfY(P[0][1]), f2 = floorOfY(P[P.length - 1][1]), w = (st.width || 1.4) / 2 + 0.2;
    for (const [q, fk, q2] of [[P[0], f, P[1]], [P[P.length - 1], f2, P[P.length - 2]]]) {
      const d = P2.norm(P2.sub([q[0], q[2]], [q2[0], q2[2]])), e = P2.add([q[0], q[2]], P2.mul(d, 1.5));
      KEEPOUT.push({ fk, box: [Math.min(q[0], e[0]) - w, Math.min(q[2], e[1]) - w, Math.max(q[0], e[0]) + w, Math.max(q[2], e[1]) + w], why: 'stair end ' + st.id });
    }
  }
}
function runParts(K) {
  window.__partErrors = window.__partErrors || [];
  for (const name of PART_ORDER) {
    const t0 = performance.now(), tri0 = trisOf(name);
    JOURNAL = []; CURPART = name;
    try {
      if (typeof PARTS[name] !== 'function') throw new Error('no builder for ' + name);
      PARTS[name](K);
    } catch (e) {
      console.error('part ' + name + ' failed:', e);
      window.__partErrors.push({ part: name, message: String((e && e.message) || e), stack: String((e && e.stack) || '').split('\n').slice(0, 6).join('\n') });
      for (const u of JOURNAL.reverse()) { try { u(); } catch (e2) { /* keep undoing */ } }
    }
    JOURNAL = null; CURPART = null;
    K.timings[name] = Math.round(performance.now() - t0);
    const used = trisOf(name) - tri0, lim = name === 'exterior' ? BUDGET.trisExterior : BUDGET.trisPerFloor;
    if (used > lim) STATS.warnings.push(`${name}: ${used} dressing triangles (budget ${lim})`);
  }
}
const trisOf = (part) => REG.filter((e) => e.deco && e.name.includes('_' + part + '_')).reduce((s, e) => s + Object.values(e.parts).reduce((a, g) => a + g.tris, 0), 0);

/* ------------------------------------------------------------------ surface legend (overlay colours and the export legend) */
// colour-blind safe (Okabe-Ito based); breakable walls are all reinforceable (one type); hard walls stay neutral
const OVERLAY = {
  hard: { color: '#a3a7b0', label: 'Hard (indestructible)' },
  slab: { color: '#4a4e58', label: 'Floor slab (hard)' },
  soft: { color: '#E69F00', label: 'Soft (unused: every breakable wall is reinforceable)' },
  reinforceable: { color: '#1f7bff', label: 'Breakable + reinforceable panel (Wall Fortification)' },
  glass: { color: '#56B4E9', label: 'Interior glass (breakable)', opacity: 0.6 },
  balustrade: { color: '#d7dbe2', label: 'Rail / balustrade (shoot over, vault)', opacity: 0.55 },
  glass_tempered: { color: '#3d5066', label: 'Facade glass, tempered (unbreakable)', opacity: 0.4 },
  glass_breakable: { color: '#009E73', label: 'Facade glass, breakable', opacity: 0.75 },
  glass_floor: { color: '#7fd6c8', label: 'Glass floor (walkable, tempered)', opacity: 0.6 },
  door_barricadable: { color: '#D55E00', label: 'Barricadable door', opacity: 0.55 },
  window_barricadable: { color: '#F0E442', label: 'Barricadable window / entry', opacity: 0.65 },
  opening: { color: '#ffffff', label: 'Open archway / counter / pried door', opacity: 0.35 },
  hatch: { color: '#CC79A7', label: 'Hatch (breakable, reinforceable)' },
  soft_floor: { color: '#e9b3d2', label: 'Soft floor / ceiling patch' },
  circ: { color: '#5f6e80', label: 'Stairs, ladders, catwalks, ledges, bridges' },
  prop_hard: { color: '#6c717b', label: 'Prop, hard' },
  prop_soft: { color: '#8c6d3f', label: 'Prop, destructible' },
  holo: { color: '#b48cff', label: 'Hologram (blocks vision, not bullets)', opacity: 0.3 },
  shutter: { color: '#c2185b', label: 'Blast shutter (open by default; closed it blocks sight and bullets)', opacity: 0.85 },
  deco: { color: '#2c2f37', label: 'Decoration' },
  env: { color: '#1a1c22', label: 'Backdrop' },
};
const SURFACE_TO_OV = { pilaster: 'hard', spandrel: 'hard', portal: 'hard', stair: 'circ', ladder: 'circ', walkway: 'circ', ledge: 'circ', bridge: 'circ', terrace: 'circ' };

/* ------------------------------------------------------------------ display (viewer): merged meshes per floor, layer and material */

function buildDisplay() {
  const view = new THREE.Group(); view.name = 'haneul_tower_view';
  const buckets = new Map(), ov = new Map(), own = [], shut = [];
  const isT = (mk) => M[mk] && M[mk].transparent;
  for (const e of REG) {
    if (!e.display) continue;
    if (e.morph) { shut.push(e); continue; }
    if (e.own) { own.push(e); continue; }
    for (const [mk, g] of Object.entries(e.parts)) {
      if (!g.i.length) continue;
      const layer = isT(mk) && e.layer !== 'holo' ? (e.layer === 'skyline' ? 'skyline' : 'glass') : e.layer;
      const k = e.fk + '|' + layer + '|' + mk;
      if (!buckets.has(k)) buckets.set(k, { fk: e.fk, layer, mk, g: new GB(1) });
      buckets.get(k).g.append(g);
      if (e.layer === 'skyline') continue;
      if (/^pool_|^ext_wet|^ext_rf_|^ext_river|^ext_puddle|^ext_holo|^holo|_wash_|mist/.test(mk)) continue;   // decals and glows: no x-ray footprint
      let ok = SURFACE_TO_OV[e.surface] || e.ov;
      if (e.name.startsWith('HARD_slab_')) ok = 'slab';
      if (!OVERLAY[ok]) ok = 'hard';
      const ko = e.fk + '|' + ok + '|' + (e.layer === 'ceiling' ? 'ceiling' : e.layer === 'env' ? 'env' : 'main');
      if (!ov.has(ko)) ov.set(ko, { fk: e.fk, ok, layer: e.layer === 'ceiling' ? 'ceiling' : e.layer === 'env' ? 'env' : 'main', g: new GB(1) });
      ov.get(ko).g.append(g);
    }
  }
  const meshes = [];
  let tris = 0;
  for (const b of buckets.values()) {
    const m = new THREE.Mesh(b.g.toGeo(), M[b.mk]); m.name = `${b.fk}_${b.layer}_${b.mk}`;
    if (b.mk === BD.mk && BD.attr && BD.attr.length === b.g.nv * 2) { m.geometry.setAttribute('aBd', new THREE.BufferAttribute(BD.attr, 2)); m.frustumCulled = false; } m.userData = { fk: b.fk, layer: b.layer, mk: b.mk, kind: 'display' };
    m.matrixAutoUpdate = false; m.updateMatrix(); if (b.layer === 'glass' || b.layer === 'holo') m.renderOrder = 2;
    view.add(m); meshes.push(m); tris += b.g.tris;
  }
  for (const e of own) {
    const grp = new THREE.Group(); grp.name = e.name; grp.userData = { fk: e.fk, layer: e.layer, kind: 'display', own: true, entry: e };
    const inv = e.frame ? e.frame.clone().invert() : null;
    for (const [mk, g] of Object.entries(e.parts)) { if (!g.i.length) continue; const m = new THREE.Mesh(g.toGeo(inv), M[mk]); m.name = e.name + '_' + mk; if (M[mk].transparent) m.renderOrder = 3; grp.add(m); tris += g.tris; }
    if (e.frame) { e.frame.decompose(grp.position, grp.quaternion, grp.scale); }
    view.add(grp); meshes.push(grp);
  }
  // blast shutters: one merged mesh per floor and material, with the 'closed' morph target (the viewer drives one weight)
  const shutterMeshes = [], morphMesh = (list, mat, ud, withUV) => {
    const g = new GB(1), cl = [];
    for (const [e, mk] of list) { g.append(e.parts[mk]); for (const v of e.morph[mk]) cl.push(v); }
    const geo = g.toGeo(); if (!withUV) geo.deleteAttribute('uv');
    const ma = new THREE.Float32BufferAttribute(cl, 3); ma.name = 'closed'; geo.morphAttributes.position = [ma];
    const m = new THREE.Mesh(geo, mat); m.updateMorphTargets(); m.morphTargetInfluences[0] = 0; m.userData = ud; m.matrixAutoUpdate = false; m.updateMatrix();
    shutterMeshes.push(m); return m;
  };
  {
    const byKey = new Map(), byFk = new Map();
    for (const e of shut) for (const mk of Object.keys(e.parts)) {
      if (!e.parts[mk].i.length) continue;
      const k = e.fk + '|' + mk; if (!byKey.has(k)) byKey.set(k, { fk: e.fk, mk, list: [] }); byKey.get(k).list.push([e, mk]);
      if (!byFk.has(e.fk)) byFk.set(e.fk, []); byFk.get(e.fk).push([e, mk]);
    }
    for (const b of byKey.values()) { const m = morphMesh(b.list, M[b.mk], { fk: b.fk, layer: 'shutter', mk: b.mk, kind: 'display', shutter: true }, true); m.name = `${b.fk}_shutter_${b.mk}`; view.add(m); meshes.push(m); tris += m.geometry.index.count / 3; }
    D_SHUT.byFk = byFk;
  }
  // closed-state walk blocker (viewer only, never drawn): one box per shutter
  const shutCol = new GB(1);
  for (const x of SHUTTERS) wbox(shutCol, x.F, x.sh.u0, x.sh.u1, 0, x.sh.y_open, RU.shutters.plane[0], RU.shutters.plane[1]);
  const shutterCollider = new THREE.Mesh(shutCol.toGeo(), new THREE.MeshBasicMaterial()); shutterCollider.visible = false; shutterCollider.userData = { layer: 'shutter', kind: 'collider' };
  // overlay meshes (unlit tints) and outlines
  const ovMats = {};
  const matcap = (() => { const c = cv(128, 128), x = c.getContext('2d'), g = x.createRadialGradient(48, 40, 8, 64, 64, 64); g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#e2e2e2'); g.addColorStop(1, '#a8a8a8'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  for (const [k, v] of Object.entries(OVERLAY)) { ovMats[k] = new THREE.MeshMatcapMaterial({ color: v.color, matcap, transparent: v.opacity != null, opacity: v.opacity ?? 1, depthWrite: v.opacity == null, side: THREE.DoubleSide }); ovMats[k].toneMapped = false; }
  const overlay = new THREE.Group(); overlay.name = 'overlay'; overlay.visible = false;
  for (const [fk, list] of D_SHUT.byFk) { const m = morphMesh(list, ovMats.shutter, { fk, layer: 'main', ok: 'shutter', kind: 'overlay', shutter: true }, false); m.renderOrder = 2; overlay.add(m); }
  for (const b of ov.values()) {
    const g = b.g.toGeo(); g.deleteAttribute('uv');
    const m = new THREE.Mesh(g, ovMats[b.ok]); m.userData = { fk: b.fk, layer: b.layer, ok: b.ok, kind: 'overlay' }; m.matrixAutoUpdate = false; m.updateMatrix();
    if (OVERLAY[b.ok].opacity != null) m.renderOrder = 2;
    overlay.add(m);
  }
  // opening fills (barricade slots) and outlines for hatches, patches and reinforcement units
  const fills = new Map();
  for (const s of SLOTS) {
    const key = s.fk + '|' + s.kind; if (!fills.has(key)) fills.set(key, { fk: s.fk, ok: s.kind, g: new GB(1) });
    const F = s.F, o = s.o, t = s.facade ? 0.02 : F.t * 0.5;
    wbox(fills.get(key).g, F, o.u0, o.u1, o.y0, o.y1, s.facade ? 0.03 : -t / 2, s.facade ? 0.05 : t / 2);
  }
  for (const s of SLOTS) {
    const F = s.F, o = s.o, g = fills.get(s.fk + '|' + s.kind).g;
    if (s.facade) wbox(g, F, o.u0, o.u1, 0.0, 0.03, 0.06, 0.5); else wbox(g, F, o.u0, o.u1, 0.0, 0.03, -F.t / 2 - 0.25, F.t / 2 + 0.25);
  }
  // defender-side ticks: a small triangle on the floor pointing into the defender room, one per unit
  const ticks = {};
  for (const u of UNITS) {
    const F = u.F, um = (u.p.u0 + u.p.u1) / 2, s0 = u.ds * (F.t / 2 + 0.08), s1 = u.ds * (F.t / 2 + 0.45), g = ticks[u.fk] || (ticks[u.fk] = new GB(1));
    g.face([wp(F, um - 0.22, 0.03, s0), wp(F, um + 0.22, 0.03, s0), wp(F, um, 0.03, s1)], UP);
  }
  for (const [fk, g] of Object.entries(ticks)) { const m = new THREE.Mesh(g.toGeo(), ovMats.reinforceable); m.userData = { fk, layer: 'main', ok: 'reinforceable', kind: 'overlay', unitTicks: true }; overlay.add(m); }
  for (const b of fills.values()) { const m = new THREE.Mesh(b.g.toGeo(), ovMats[b.ok]); m.userData = { fk: b.fk, layer: 'main', ok: b.ok, kind: 'overlay' }; m.renderOrder = 3; overlay.add(m); }
  const lines = new Map(), addLine = (fk, pts) => { if (!lines.has(fk)) lines.set(fk, []); lines.get(fk).push(...pts); };
  for (const h of L.hatches) { const y = FY(h.floor) + 0.03, s = h.size / 2; const c = [[h.x - s, h.z - s], [h.x + s, h.z - s], [h.x + s, h.z + s], [h.x - s, h.z + s]]; for (let i = 0; i < 4; i++) addLine(h.floor, [c[i][0], y, c[i][1], c[(i + 1) % 4][0], y, c[(i + 1) % 4][1]]); addLine(h.floor, [h.x - s, y, h.z - s, h.x + s, y, h.z + s, h.x + s, y, h.z - s, h.x - s, y, h.z + s]); }
  for (const p of L.floor_patches) { const y = FY(p.floor) + 0.03, c = [[p.x - p.w / 2, p.z - p.d / 2], [p.x + p.w / 2, p.z - p.d / 2], [p.x + p.w / 2, p.z + p.d / 2], [p.x - p.w / 2, p.z + p.d / 2]]; for (let i = 0; i < 4; i++) addLine(p.floor, [c[i][0], y, c[i][1], c[(i + 1) % 4][0], y, c[(i + 1) % 4][1]]); }
  for (const u of UNITS) { const F = u.F, t = F.t / 2 + 0.01; for (const sg of [1, -1]) { const q = [wp(F, u.p.u0, 0.02, sg * t), wp(F, u.p.u1, 0.02, sg * t), wp(F, u.p.u1, 1.97, sg * t), wp(F, u.p.u0, 1.97, sg * t)]; for (let i = 0; i < 4; i++) addLine(u.fk, [...q[i], ...q[(i + 1) % 4]]); } }
  const lineMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 });
  for (const [fk, pts] of lines) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); const l = new THREE.LineSegments(g, lineMat); l.userData = { fk, layer: 'main', kind: 'overlay' }; overlay.add(l); }
  // markers (viewer only): spawns, objectives, cover, routes, sightlines
  const markers = buildMarkerMeshes();
  for (const o of VIEWONLY) view.add(o);
  return { view, meshes, overlay, markers, tris, ovMats, shutterMeshes, shutterCollider };
}
const D_SHUT = {};
function buildMarkerMeshes() {
  const grp = new THREE.Group(); grp.name = 'markers'; grp.visible = false;
  const mk = (c, o = 0.85) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: true });
  const atk = mk('#ff5a5f'), def = mk('#3d8bff'), obj = mk('#ffc21a', 1), cov = mk('#ffffff', 0.9);
  const cone = new THREE.ConeGeometry(0.35, 1.0, 12); cone.translate(0, 0.5, 0); cone.rotateX(Math.PI);  cone.translate(0, 1.0, 0);
  const cyl = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 14); cyl.translate(0, 0.9, 0);
  const oct = new THREE.OctahedronGeometry(0.45); oct.translate(0, 1.2, 0);
  const add = (geo, m, p, fk, kind) => { const x = new THREE.Mesh(geo, m); x.position.set(p[0], p[1], p[2]); x.userData = { fk, kind: 'marker', mkind: kind }; grp.add(x); return x; };
  for (const a of L.spawns.attackers) for (const p of a.points) add(cone, atk, p, 'X', 'attack');
  for (const d of L.spawns.defenders) for (const p of d.points) add(cyl, def, p, d.floor, 'defend');
  for (const s of L.sites) for (const o of s.objectives) add(oct, obj, o.pos, s.floor, 'objective');
  for (const c of L.cover) { const b = new THREE.BoxGeometry(c.w, c.h, 0.08); b.translate(0, c.h / 2, 0); const x = add(b, cov, [c.x, FY(c.floor), c.z], c.floor, 'cover'); x.rotation.y = -THREE.MathUtils.degToRad(c.yaw_deg); }
  const routeMat = { attack: new THREE.LineBasicMaterial({ color: '#ff5a5f' }), rotation: new THREE.LineBasicMaterial({ color: '#3d8bff' }), flank: new THREE.LineBasicMaterial({ color: '#ffc21a' }) };
  for (const r of L.routes) { const g = new THREE.BufferGeometry().setFromPoints(r.points.map((p) => new THREE.Vector3(p[0], p[1] + 0.15, p[2]))); const l = new THREE.Line(g, routeMat[r.kind] || routeMat.flank); l.userData = { fk: 'X', kind: 'marker', mkind: 'route' }; grp.add(l); }
  const slm = new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.7 });
  for (const s of L.sightlines) { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...s.a), new THREE.Vector3(...s.b)]); const l = new THREE.Line(g, slm); l.computeLineDistances(); l.userData = { fk: s.floor === 'all' ? 'X' : s.floor, kind: 'marker', mkind: 'sightline' }; grp.add(l); }
  return grp;
}

/* ------------------------------------------------------------------ export: one node per typed surface, extras everywhere */

const NAMING = {
  HARD_: 'hard (indestructible): walls HARD_<wallId>, column wraps HARD_<wallId>, reinforce trims/transom/bulkhead HARD_<wallId>_hdr, pilasters HARD_<PLid>, columns HARD_<colId>_<floor>, slabs HARD_slab_<floor> (room finishes on top), core caps HARD_core_<floor>, facade frame HARD_facade_<floor>, fins HARD_fins_<floor>, spandrel lites HARD_<bayId>_<k>, kick panels HARD_<bayId>_<k>_kick, portal HARD_<bayId>_portal, hard props HARD_<propId>, neighbour structure HARD_NB_*',
  SOFT_: 'soft wall SOFT_<wallId> (extras.pieces: solid rectangles [u0,u1,y0,y1] along the wall) and soft props SOFT_<propId>',
  REINF_: 'reinforceable panel REINF_<wallId>_<k>, one per Wall Fortification unit; node origin = unit origin, +Z faces the defender room; extras.size/width/gadget/far_side_z',
  GLASSI_: 'interior glass GLASSI_<wallId> (breakable)',
  RAIL_: 'balustrades and walkway, ledge, stair and parapet rails (shoot over, vault)',
  HATCH_: 'hatch HATCH_<id>; node origin = hatch unit origin, +Y = unit up (extras.reinforce_from, extras.mount)',
  SOFTFLOOR_: 'soft floor patch SOFTFLOOR_<id>; SOFTCEIL_<id> is the ceiling tile under a hatch or patch',
  BARR_D_: 'empty: barricade slot at a barricadable door (centre of the opening at floor level, +Z = wall normal)',
  BARR_W_: 'empty: barricade slot at a barricadable window or facade entry window',
  OPEN_: 'empty: non-barricadable opening (archway, counter, pried lift door, bridge doors)',
  GLASS_T_: 'facade or bridge glass, tempered (unbreakable)', GLASS_B_: 'facade glass, breakable (entry windows also have a BARR_W_ slot)', GLASS_TF_: 'walkable tempered glass floor',
  HOLO_: 'stage hologram volume (vision blocker, no collider) and HOLO_*_emitter (destructible)',
  ZONE_EXT_: 'empty: defender reveal zone (extras.polygon or path); children ZONE_EXT_<id>_<k> are box volumes (scale = size)',
  STAIR_: 'stair render mesh (collide with COL_STAIR_* ramps)', LADDER_: 'ladder (COL_<ladderId> is its climb volume)', WALK_: 'catwalk deck', LEDGE_: 'ledge deck outside the glass',
  BRIDGE_: 'skybridge, truss, catwalks, gantry, hoist ramp, landings; BRIDGE_CR_cradle is the moving cradle (clip cradle_cycle)', TERRACE: 'sky terrace deck',
  SPAWN_ATK_: 'empty: attacker spawn point', SPAWN_DEF_: 'empty: defender spawn point', OBJ_: 'empty: objective', COVER_: 'empty: deployable cover spot (+Z faces the yaw)', CALLOUT_: 'empty: callout anchor (extras.name; never render it in the world)',
  PROP_: 'empty: layout prop marker PROP_<propId> (extras: pos, size, box, h, cover, type, breaks_sightline, built_in). built_in markers point at their HARD_/SOFT_ node; the rest are furniture slots for the separate furniture pack (no mesh, no collider here)',
  SHUTTER_: 'blast shutter SHUTTER_<bayId> inside every facade bay with glass except over a door (door bays: none; a door lite is left out, the shutter covers the glass lite beside it): one mesh, base = OPEN (stacked in the plenum housing), one morph target "closed"; clips shutters_close / shutters_open; node origin = closed curtain bottom centre, +Z into the building; not static (it moves)',
  COL_: 'empty: box collider (position, rotation, scale = size; BoxCollider size 1). COL_SHUTTER_<bayId> is the closed-state box of a shutter: enable it only while that shutter is closed',
  DECO_: 'decoration merged per floor, kind and material (no gameplay meaning, no collider)', ENV_: 'scenery bodies of the tower and the gameplay neighbours below and above the map (no collider)',
  BACKDROP_: 'BACKDROP_city: the whole city skyline as ONE mesh with ONE baked material (always drawn as one draw call: no culling tiles, no collider, no shadows, never an occluder); BACKDROP_sky: the sky dome with the cloud deck baked in',
};
/* ------------------------------------------------------------------ city backdrop: one mesh, one material */
// User rule: the whole city skyline backdrop (every piece on the 'skyline' layer: city blocks and towers, streets, the
// river and its bridges, far bands, ridges, the hill and its broadcast tower, holo screens, beacons) is ONE mesh with ONE
// material, in the viewer and in both glbs, always drawn as one draw call. Its materials are baked into one texture set:
// baseColor (sRGB) and emissive (sRGB, linear value / BD.EMAX; the material's strength is EMAX) at 4096 px, and ORM at
// 2048 px (G roughness, B metalness; R holds each source material's environment strength as occlusion, viewer only).
// Tiled textures (facades, roofs, ridges, bands) get a region of Ku x Kv repeats: each triangle is shifted by whole
// repeats (the textures are periodic, so the look is unchanged) and only split where it spans more than its region.
// Untextured materials and very fine tiles (louvres, water ripples) become flat swatches. Double-sided materials are
// written with both windings, so the material stays single-sided. The sky dome (with its baked cloud deck) is the second
// and last backdrop node, BACKDROP_sky. Per-vertex haze strength and the beacon blink flag are viewer-only attributes.
const BD = { mk: 'backdrop_city', A: 4096, G: 8, EMAX: 3.2, ENVMAX: 2.6, attr: null };
const BD_CFG = {   // K: repeats per region (u, v); s: texel scale against the source texture (24 m facade tile at 384 px = 6 cm/px)
  ext_roof: { K: [6, 6], s: 0.75 }, env_facade: { K: [2, 4], s: 0.375 }, ext_office: { K: [2, 4], s: 0.375 }, ext_apt: { K: [2, 6], s: 0.375 },
  ext_aptend: { K: [3, 6], s: 0.75 }, ext_mid: { K: [2, 3], s: 0.75 }, ext_ground_near: { s: 0.75 },
  ext_holo_b: { s: 0.5 }, ext_holo_c: { s: 0.5 }, ext_holo_d: { s: 0.5 }, ext_holo_e: { s: 0.5 },
  louvre: { swatch: true }, ext_river: { swatch: true },
};
function buildBackdrop(K) {
  const t0 = performance.now(), A = BD.A, GU = BD.G, TS = {}; let tq = t0; const tm = (k) => { const n = performance.now(); TS[k] = Math.round(n - tq); tq = n; };
  const items = [];
  for (const e of REG) { if (!e.export || !e.display || e.layer !== 'skyline') continue; for (const [mk, g] of Object.entries(e.parts)) if (g.i.length) items.push({ e, mk, g }); }
  if (!items.length) return null;
  for (const x of items) { x.e.export = false; x.e.display = false; }
  const before = { nodes: new Set(items.map((x) => x.e.name)).size, materials: new Set(items.map((x) => x.mk)).size, tris: items.reduce((s, x) => s + x.g.tris, 0) };
  const sky = items.filter((x) => x.mk === 'ext_sky'), city = items.filter((x) => x.mk !== 'ext_sky');
  if (sky.length) {
    const s = node('BACKDROP_sky', 'backdrop', null, { fk: 'X', layer: 'skyline', ov: 'env', group: 'BACKDROP', extras: { kind: 'sky', role: 'night sky dome with the cloud deck baked in (emissive only); no collider, no shadows, always drawn' } });
    s.backdrop = true; const g = s.gb('ext_sky'); for (const x of sky) g.append(x.g);
  }
  // ---- what each source material needs
  const LUT = new Float32Array(256); for (let k = 0; k < 256; k++) { const v = k / 255; LUT[k] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  const EN = 16384, ENC = new Uint8Array(EN + 1); for (let k = 0; k <= EN; k++) { const v = k / EN; ENC[k] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); }
  const enc = (v) => ENC[Math.round(Math.max(0, Math.min(1, v)) * EN)];
  const mats = {};
  for (const x of city) {
    const m = M[x.mk]; if (!m) throw new Error('backdrop: no material ' + x.mk);
    let r = mats[x.mk];
    if (!r) {
      const c = BD_CFG[x.mk] || {}, srcs = [m.map, m.emissiveMap, m.roughnessMap, m.metalnessMap].filter((t) => t && t.image);
      const key = typeof m.customProgramCacheKey === 'function' ? m.customProgramCacheKey() : '';
      const hz = /^hz/.test(key) ? parseFloat(key.slice(2)) : m.fog === false ? 0 : -1;
      r = mats[x.mk] = { mk: x.mk, m, c, srcs, hz, tris: 0, out: 0, umin: Infinity, umax: -Infinity, vmin: Infinity, vmax: -Infinity, additive: m.blending === THREE.AdditiveBlending, dbl: m.side === THREE.DoubleSide };
    }
    const U = x.g.u; for (let k = 0; k < U.length; k += 2) { r.umin = Math.min(r.umin, U[k]); r.umax = Math.max(r.umax, U[k]); r.vmin = Math.min(r.vmin, U[k + 1]); r.vmax = Math.max(r.vmax, U[k + 1]); }
    r.tris += x.g.tris;
    if (m.transparent && !r.additive) K.warn('backdrop: transparent material ' + x.mk + ' baked opaque');
  }
  // ---- regions (texels per tile from the sources and BD_CFG; if the atlas overflows, the largest region shrinks first)
  const regions = [], shrink = {};
  for (const r of Object.values(mats)) {
    const uniq = r.umin > -1e-3 && r.umax < 1 + 1e-3 && r.vmin > -1e-3 && r.vmax < 1 + 1e-3;
    r.kind = r.c.swatch || !r.srcs.length ? 'swatch' : uniq ? 'unique' : 'tiled';
    r.tw = r.kind === 'swatch' ? 4 : Math.max(...r.srcs.map((t) => t.image.width)); r.th = r.kind === 'swatch' ? 4 : Math.max(...r.srcs.map((t) => t.image.height));
    [r.Ku, r.Kv] = r.kind === 'tiled' ? (r.c.K || [1, 1]) : [1, 1]; r.g = r.kind === 'swatch' ? 0 : GU; r.s = r.kind === 'swatch' ? 1 : r.c.s || 1;
    regions.push(r);
  }
  // skyline packing on 8 px columns; several orders are tried and the one that shrinks least wins
  const CW = 8, NC = A / CW, orders = [(a, b) => b.h - a.h || b.w - a.w, (a, b) => b.w * b.h - a.w * a.h, (a, b) => b.w - a.w || b.h - a.h, (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h)];
  const size = (r) => { if (r.kind !== 'swatch') { r.pw = Math.max(4, Math.round(r.tw * r.s)); r.ph = Math.max(4, Math.round(r.th * r.s)); } else r.pw = r.ph = 4; r.w = r.pw * r.Ku + 2 * r.g; r.h = r.ph * r.Kv + 2 * r.g; };
  const pack = (cmp) => {
    const sky2 = new Int32Array(NC), pos = new Map();
    for (const r of regions.slice().sort(cmp)) {
      const nc = Math.ceil(r.w / CW); let best = -1, bestY = Infinity;
      for (let c = 0; c + nc <= NC; c++) { let y = 0; for (let k = c; k < c + nc; k++) y = Math.max(y, sky2[k]); if (y < bestY) { bestY = y; best = c; } }
      if (best < 0 || bestY + r.h > A) return null;
      pos.set(r, [best * CW, bestY]); for (let k = best; k < best + nc; k++) sky2[k] = bestY + r.h;
    }
    return pos;
  };
  let bestRun = null;
  for (const cmp of orders) {
    for (const r of regions) r.s = r.kind === 'swatch' ? 1 : r.c.s || 1;
    let pos = null;
    for (let attempt = 0; attempt < 80; attempt++) {
      regions.forEach(size); pos = pack(cmp); if (pos) break;
      const big = regions.filter((r) => r.kind !== 'swatch').sort((a, b) => b.w * b.h - a.w * a.h)[0]; big.s *= 0.97;
    }
    if (!pos) continue;
    const area = regions.reduce((t, r) => t + r.w * r.h, 0);
    if (!bestRun || area > bestRun.area) bestRun = { area, pos, s: new Map(regions.map((r) => [r, r.s])) };
  }
  if (!bestRun) throw new Error('backdrop atlas overflow');
  for (const r of regions) { r.s = bestRun.s.get(r); size(r); [r.x, r.y] = bestRun.pos.get(r); if (r.kind !== 'swatch' && Math.abs(r.s - (r.c.s || 1)) > 1e-6) shrink[r.mk] = +r.s.toFixed(3); }
  const used = bestRun.area;
  tm('analyse_pack');
  // ---- bake the three textures
  const base = cv(A, A), emis = cv(A, A), ormF = cv(A, A);
  const bx = base.getContext('2d'), ex = emis.getContext('2d'), ox = ormF.getContext('2d');
  const BI = bx.createImageData(A, A), EI = ex.createImageData(A, A), OI = ox.createImageData(A, A), Bd = BI.data, Ed = EI.data, Od = OI.data;
  for (let k = 0; k < Bd.length; k += 4) { Bd[k + 3] = Ed[k + 3] = Od[k + 3] = 255; Od[k] = 255; Od[k + 1] = 230; }
  const pixCache = new Map();
  const pix = (t, w, h) => {
    const key = t.uuid + w + 'x' + h; if (pixCache.has(key)) return pixCache.get(key);
    const c = cv(w, h), x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(t.image, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data; pixCache.set(key, d); return d;
  };
  tm('alloc');
  for (const r of regions) {
    const m = r.m, col = m.color, emc = m.emissive, ei = m.emissiveIntensity || 0, op = m.opacity ?? 1;
    const envI = (m.userData.envI ?? 1) * (m.userData.env === 'in' ? 0.75 : 1), ao = Math.min(1, envI / BD.ENVMAX);
    const sw = r.kind === 'swatch', w = sw ? 64 : r.pw, h = sw ? 64 : r.ph;
    const MP = m.map && m.map.image ? pix(m.map, w, h) : null, EP = m.emissiveMap && m.emissiveMap.image ? pix(m.emissiveMap, w, h) : null;
    const RP = m.roughnessMap && m.roughnessMap.image ? pix(m.roughnessMap, w, h) : null, MeP = m.metalnessMap && m.metalnessMap.image ? pix(m.metalnessMap, w, h) : null;
    const cr = col.r, cg = col.g, cb = col.b, er = emc.r * ei, eg = emc.g * ei, eb = emc.b * ei, add = r.additive, ro = m.roughness, me = m.metalness;
    const shade = (k, out) => {   // source pixel k (index into w x h) -> linear base rgb, emissive rgb, rough, metal
      const q = k * 4, a = MP ? MP[q + 3] / 255 : 1;
      if (add) { out[0] = out[1] = out[2] = 0; } else if (MP) { out[0] = cr * LUT[MP[q]] * a; out[1] = cg * LUT[MP[q + 1]] * a; out[2] = cb * LUT[MP[q + 2]] * a; } else { out[0] = cr; out[1] = cg; out[2] = cb; }
      const wgt = add ? op * a : 1;
      if (EP) { out[3] = er * wgt * LUT[EP[q]]; out[4] = eg * wgt * LUT[EP[q + 1]]; out[5] = eb * wgt * LUT[EP[q + 2]]; } else { out[3] = er * wgt; out[4] = eg * wgt; out[5] = eb * wgt; }
      out[6] = ro * (RP ? RP[q + 1] / 255 : 1); out[7] = me * (MeP ? MeP[q + 2] / 255 : 1);
    };
    const o = new Float32Array(8);
    if (sw) {
      const acc = new Float64Array(8); for (let k = 0; k < w * h; k++) { shade(k, o); for (let c = 0; c < 8; c++) acc[c] += o[c]; }
      for (let c = 0; c < 8; c++) o[c] = acc[c] / (w * h);
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const q = ((r.y + y) * A + r.x + x) * 4; for (let c = 0; c < 3; c++) { Bd[q + c] = enc(o[c]); Ed[q + c] = enc(o[3 + c] / BD.EMAX); } Od[q] = ao * 255; Od[q + 1] = o[6] * 255; Od[q + 2] = o[7] * 255; }
      continue;
    }
    // shade and encode the tile once, then fill the region (periodic wrap for tiled, clamped edges for unique)
    const T8 = new Uint8Array(w * h * 9), iE = EN / BD.EMAX, ao8 = ao * 255, ro8 = 255 * ro, me8 = 255 * me;
    const E8 = (v) => ENC[v >= EN ? EN : v > 0 ? (v + 0.5) | 0 : 0];
    for (let k = 0, q = 0, p4 = 0; k < w * h; k++, q += 9, p4 += 4) {
      const a = MP ? MP[p4 + 3] / 255 : 1;
      if (add) { T8[q] = T8[q + 1] = T8[q + 2] = 0; }
      else if (MP) { const f = a * EN; T8[q] = E8(cr * LUT[MP[p4]] * f); T8[q + 1] = E8(cg * LUT[MP[p4 + 1]] * f); T8[q + 2] = E8(cb * LUT[MP[p4 + 2]] * f); }
      else { T8[q] = E8(cr * EN); T8[q + 1] = E8(cg * EN); T8[q + 2] = E8(cb * EN); }
      const f = (add ? op * a : 1) * iE;
      if (EP) { T8[q + 3] = E8(er * f * LUT[EP[p4]]); T8[q + 4] = E8(eg * f * LUT[EP[p4 + 1]]); T8[q + 5] = E8(eb * f * LUT[EP[p4 + 2]]); }
      else { T8[q + 3] = E8(er * f); T8[q + 4] = E8(eg * f); T8[q + 5] = E8(eb * f); }
      T8[q + 6] = ao8; T8[q + 7] = RP ? ro * RP[p4 + 1] : ro8; T8[q + 8] = MeP ? me * MeP[p4 + 2] : me8;
    }
    const tiled = r.kind === 'tiled';
    for (let y = 0; y < r.h; y++) {
      const yy = y - r.g, sy = tiled ? ((yy % h) + h) % h : Math.max(0, Math.min(h - 1, yy));
      for (let x = 0; x < r.w; x++) {
        const xx = x - r.g, sx = tiled ? ((xx % w) + w) % w : Math.max(0, Math.min(w - 1, xx)), k = (sy * w + sx) * 9, q = ((r.y + y) * A + r.x + x) * 4;
        Bd[q] = T8[k]; Bd[q + 1] = T8[k + 1]; Bd[q + 2] = T8[k + 2]; Ed[q] = T8[k + 3]; Ed[q + 1] = T8[k + 4]; Ed[q + 2] = T8[k + 5]; Od[q] = T8[k + 6]; Od[q + 1] = T8[k + 7]; Od[q + 2] = T8[k + 8];
      }
    }
  }
  tm('bake');
  bx.putImageData(BI, 0, 0); ex.putImageData(EI, 0, 0); ox.putImageData(OI, 0, 0);
  const orm = cv(A / 2, A / 2), orx = orm.getContext('2d'); orx.imageSmoothingQuality = 'high'; orx.drawImage(ormF, 0, 0, A / 2, A / 2);
  tm('put');
  // ---- geometry: remap every triangle into its region (shift by whole repeats, split only where needed)
  const gb = new GB(1), P = gb.p, Nn = gb.n, UV = gb.u, I = gb.i, AT = [];
  const lerpV = (a, b, t) => ({ p: [0, 1, 2].map((c) => a.p[c] + (b.p[c] - a.p[c]) * t), n: [0, 1, 2].map((c) => a.n[c] + (b.n[c] - a.n[c]) * t), t: [a.t[0] + (b.t[0] - a.t[0]) * t, a.t[1] + (b.t[1] - a.t[1]) * t] });
  const clip = (poly, ax, lo, hi) => {
    let out = poly;
    for (const [lim, sg] of [[lo, 1], [hi, -1]]) {
      const inp = out; out = [];
      for (let k = 0; k < inp.length; k++) {
        const a = inp[k], b = inp[(k + 1) % inp.length], da = (a.t[ax] - lim) * sg, db = (b.t[ax] - lim) * sg;
        if (da >= 0) out.push(a);
        if ((da >= 0) !== (db >= 0)) out.push(lerpV(a, b, da / (da - db)));
      }
      if (out.length < 3) return [];
    }
    return out;
  };
  const emit = (r, poly, su, sv, hz, blink, flip) => {
    const toA = (t) => r.kind === 'swatch' ? [(r.x + 2) / A, 1 - (r.y + 2) / A]
      : [(r.x + r.g + Math.max(0, Math.min(r.Ku, t[0] - su)) * r.pw) / A, 1 - (r.y + r.g + (r.Kv - Math.max(0, Math.min(r.Kv, t[1] - sv))) * r.ph) / A];
    const b0 = P.length / 3;
    for (const v of poly) {
      const l = Math.hypot(...v.n) || 1, s = flip ? -1 : 1, uv = toA(v.t);
      P.push(v.p[0], v.p[1], v.p[2]); Nn.push(s * v.n[0] / l, s * v.n[1] / l, s * v.n[2] / l); UV.push(uv[0], uv[1]); AT.push(hz, blink);
    }
    for (let k = 1; k < poly.length - 1; k++) { if (flip) I.push(b0, b0 + k + 1, b0 + k); else I.push(b0, b0 + k, b0 + k + 1); }
    r.out += poly.length - 2;
  };
  // GB.face() writes each convex polygon as a fan over contiguous vertices; regroup the fans so a quad is clipped whole
  // (a split quad stays quads instead of slivers). Double-sided sources: far pieces are turned to face the map (it is the
  // only place they are seen from), near ones (< 300 m) get both windings.
  const vtx = (g, v) => ({ p: [g.p[v * 3], g.p[v * 3 + 1], g.p[v * 3 + 2]], n: [g.n[v * 3], g.n[v * 3 + 1], g.n[v * 3 + 2]], t: [g.u[v * 2], g.u[v * 2 + 1]] });
  const facesOrigin = (poly) => {
    const [a, b, c] = poly, ux = b.p[0] - a.p[0], uy = b.p[1] - a.p[1], uz = b.p[2] - a.p[2], vx = c.p[0] - a.p[0], vy = c.p[1] - a.p[1], vz = c.p[2] - a.p[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    return nx * (0 - a.p[0]) + ny * (6 - a.p[1]) + nz * (0 - a.p[2]) >= 0;
  };
  for (const x of city) {
    const r = mats[x.mk], g = x.g, blink = x.mk === 'ext_beacon' ? 1 : 0, I0 = g.i;
    for (let t = 0; t < I0.length;) {
      const a0 = I0[t]; let n = 1;
      while (t + 3 * n < I0.length && I0[t + 3 * n] === a0 && I0[t + 3 * n + 1] === a0 + n + 1 - 0 - 0 && I0[t + 3 * n + 2] === a0 + n + 2 && I0[t + 1] === a0 + 1 && I0[t + 2] === a0 + 2) n++;
      const poly = n > 1 ? Array.from({ length: n + 2 }, (_, k) => vtx(g, a0 + k)) : [vtx(g, I0[t]), vtx(g, I0[t + 1]), vtx(g, I0[t + 2])];
      t += 3 * n;
      const pieces = [];
      if (r.kind !== 'tiled') pieces.push([poly, 0, 0]);
      else {
        const us = poly.map((v) => v.t[0]), u0 = Math.floor(Math.min(...us) + 1e-6), u1 = Math.max(...us);
        for (let su = u0; su < u1 - 1e-6 || su === u0; su += r.Ku) {
          const pu = u1 - u0 <= r.Ku + 1e-6 ? poly : clip(poly, 0, su, su + r.Ku); if (!pu.length) continue;
          const vs = pu.map((v) => v.t[1]), v0 = Math.floor(Math.min(...vs) + 1e-6), v1 = Math.max(...vs);
          for (let sv = v0; sv < v1 - 1e-6 || sv === v0; sv += r.Kv) {
            const pv = v1 - v0 <= r.Kv + 1e-6 ? pu : clip(pu, 1, sv, sv + r.Kv); if (pv.length) pieces.push([pv, su, sv]);
            if (v1 - v0 <= r.Kv + 1e-6) break;
          }
          if (u1 - u0 <= r.Ku + 1e-6) break;
        }
      }
      for (const [pc, su, sv] of pieces) {
        if (!r.dbl) { emit(r, pc, su, sv, r.hz, blink, false); continue; }
        const near = pc.some((v) => Math.hypot(v.p[0], v.p[2]) < 300);
        if (near) { emit(r, pc, su, sv, r.hz, blink, false); emit(r, pc, su, sv, r.hz, blink, true); } else emit(r, pc, su, sv, r.hz, blink, !facesOrigin(pc));
      }
    }
  }
  tm('geometry');
  const e = node('BACKDROP_city', 'backdrop', null, { fk: 'X', layer: 'skyline', ov: 'env', group: 'BACKDROP', extras: { kind: 'city', role: 'the whole city skyline backdrop: one mesh, one material (baked atlas); no gameplay meaning, no collider, no shadows, not an occluder, always drawn' } });
  e.backdrop = true; e.parts[BD.mk] = gb; BD.attr = new Float32Array(AT);
  // ---- the material
  const tx = (c, srgb, name) => { const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8; t.name = name; t.userData.mimeType = 'image/jpeg'; return t; };
  const tB = tx(base, true, 'backdrop_city_basecolor'), tE = tx(emis, true, 'backdrop_city_emissive'), tO = tx(orm, false, 'backdrop_city_orm');
  TX.backdrop_city = { map: tB, emissive: tE, orm: tO };
  const mat = new THREE.MeshStandardMaterial({ name: BD.mk, map: tB, emissiveMap: tE, emissive: new THREE.Color('#ffffff'), emissiveIntensity: BD.EMAX, roughnessMap: tO, metalnessMap: tO, roughness: 1, metalness: 1, aoMap: tO, aoMapIntensity: 1 });
  mat.userData = { tile: 1, env: 'out', envI: BD.ENVMAX, ei: BD.EMAX };
  const uBlink = { value: 1 }; K.backdropBlink = uBlink;   // the exterior part's tick blinks the beacons through it
  const HZ = K.backdropHaze || { value: new THREE.Color('#252033') };
  // viewer only: per-vertex haze (aBd.x: >0 haze density, <0 the scene fog, 0 none) and the beacon blink (aBd.y)
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHaze = HZ; sh.uniforms.uBlink = uBlink;
    sh.vertexShader = 'attribute vec2 aBd;\nvarying vec2 vBd;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBd = aBd;');
    sh.fragmentShader = 'uniform vec3 uHaze;\nuniform float uBlink;\nvarying vec2 vBd;\n' + sh.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= mix(1.0, uBlink, vBd.y);')
      .replace('#include <fog_fragment>', ['#ifdef USE_FOG', '  if (vBd.x > 0.0) { gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-vFogDepth * vBd.x)); }', '  else if (vBd.x < -0.5) {',
        '  #ifdef FOG_EXP2', '    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);', '  #else', '    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);', '  #endif',
        '    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor); }', '#endif'].join('\n'));
  };
  mat.customProgramCacheKey = () => 'backdrop_city';
  M[BD.mk] = mat;
  STATS.backdrop = {
    before, after: { nodes: sky.length ? 2 : 1, city_tris: gb.tris, city_verts: gb.nv, sky_tris: sky.reduce((s, x) => s + x.g.tris, 0) },
    atlas: { size: A, orm: A / 2, regions: regions.length, used: +(used / (A * A)).toFixed(3), emax: BD.EMAX, shrink },
    mats: Object.fromEntries(Object.values(mats).map((r) => [r.mk, { kind: r.kind, tris: r.tris, out: r.out, region: r.kind === 'swatch' ? 'swatch' : [r.x, r.y, r.w, r.h, r.Ku, r.Kv] }])),
    ms: Math.round(performance.now() - t0), steps: TS,
  };
  return e;
}
function exportScene(opts = {}) {
  const scene = new THREE.Scene(); scene.name = 'haneul_tower';
  scene.userData = {
    map: L.meta.name, id: L.meta.id, version: L.meta.version, units: 'metres', axes: 'glTF: +Y up; plan x east, z south (glTFast negates X on import)', setting: L.meta.setting, mode: L.meta.mode,
    floors: L.floors.map((f) => ({ id: f.id, level: f.level, name: f.name, y: f.y, ceiling: f.ceiling })),
    surface_types: L.surface_types, legend: Object.fromEntries(Object.entries(OVERLAY).map(([k, v]) => [k, { color: v.color, label: v.label }])), naming: NAMING,
    reinforce: L.rules.reinforce, sites: L.sites.map((s) => ({ id: s.id, name: s.name, floor: s.floor, rooms: s.rooms, objectives: s.objectives.map((o) => o.id) })),
    colliders: 'Typed structure nodes (HARD_ SOFT_ REINF_ GLASSI_ GLASS_T_ GLASS_B_ GLASS_TF_ RAIL_ HATCH_ SOFTFLOOR_ SOFTCEIL_ WALK_ LEDGE_ BRIDGE_ TERRACE) are built from boxes: use their meshes as MeshColliders. STAIR_ meshes are render only (walk on the COL_STAIR_* ramps). Props, ladders, canopy and roofs use the COL_ boxes. DECO_, ENV_ and BACKDROP_ have no colliders. HOLO_ blocks vision only.',
    rule: 'no logos and no readable text in any geometry or texture; callout names live only in extras and the UI',
    source: 'maps/haneul-tower/viewer.html',
  };
  const groups = {};
  const grp = (path) => {
    if (groups[path]) return groups[path];
    const parts = path.split('/'), g = new THREE.Group(); g.name = parts[parts.length - 1];
    (parts.length > 1 ? grp(parts.slice(0, -1).join('/')) : scene).add(g);
    return (groups[path] = g);
  };
  // top groups: F1 F2 F3 ROOF EXTERIOR BACKDROP MARKERS COLLIDERS; sub groups are named <top>_<kind> (unique names)
  const topOf = (fk, layer) => (layer === 'skyline' ? 'BACKDROP' : FL[fk] ? fk : fk === 'R' ? 'ROOF' : 'EXTERIOR');
  const sub = (top, kind) => top + '/' + top + '_' + kind;
  const meshOf = (name, parts, frame) => {
    const inv = frame ? frame.clone().invert() : null, keys = Object.keys(parts).filter((k) => parts[k].i.length);
    if (!keys.length) return null;
    let off = null;
    if (!frame) { const b = new GB(1); for (const k of keys) b.append(parts[k]); const bb = b.bbox(); off = [(bb[0] + bb[3]) / 2, bb[1], (bb[2] + bb[5]) / 2].map((v) => Math.round(v * 100) / 100); }
    const mtx = inv || new THREE.Matrix4().makeTranslation(-off[0], -off[1], -off[2]);
    const all = new GB(1), groupsArr = [];
    for (const k of keys) { const s = all.i.length; all.append(parts[k]); groupsArr.push({ start: s, count: parts[k].i.length, k }); }
    const geo = all.toGeo(mtx), mg = mergeVertices(geo, 1e-5);
    geo.dispose(); mg.clearGroups();
    groupsArr.forEach((g, i) => mg.addGroup(g.start, g.count, i));
    const mesh = new THREE.Mesh(mg, keys.length > 1 ? keys.map((k) => M[k]) : M[keys[0]]);
    if (keys.length === 1) mg.clearGroups();
    mesh.name = name;
    if (frame) frame.decompose(mesh.position, mesh.quaternion, mesh.scale); else mesh.position.set(off[0], off[1], off[2]);
    return mesh;
  };
  // typed nodes
  const decoMerge = new Map(), shutterNodes = [];
  for (const e of REG) {
    if (!e.export) continue;
    if (e.layer === 'skyline' && opts.skyline === false) continue;
    if (e.backdrop) {
      // BACKDROP_city and BACKDROP_sky: one mesh each, straight under BACKDROP (no tiles; the viewer-only occlusion
      // channel stays out of the export)
      const m = meshOf(e.name, e.parts, null); if (!m) continue;
      if (e.parts[BD.mk]) { const xm = M[BD.mk].clone(); xm.aoMap = null; xm.name = BD.mk; m.material = xm; }
      m.userData = JSON.parse(JSON.stringify(e.extras)); grp('BACKDROP').add(m);
      continue;
    }
    if (e.deco || e.env) {
      const key = e.deco ? 'DECO_' + e.fk + '_' + (e.extras.kind || 'misc') : e.name;
      if (!decoMerge.has(key)) decoMerge.set(key, { fk: e.fk, parts: {}, env: e.env, extras: e.extras, layer: e.layer });
      const dm = decoMerge.get(key);
      for (const [mk, g] of Object.entries(e.parts)) { if (!dm.parts[mk]) dm.parts[mk] = new GB(1); dm.parts[mk].append(g); }
      continue;
    }
    if (e.morph) {
      // blast shutter: base = open, one morph target 'closed' (absolute positions; the exporter writes the deltas)
      const keys = Object.keys(e.parts).filter((k) => e.parts[k].i.length), inv = e.frame.clone().invert(), all = new GB(1), cl = [], gr = [];
      for (const k of keys) { const st = all.i.length; all.append(e.parts[k]); for (const v of e.morph[k]) cl.push(v); gr.push({ start: st, count: e.parts[k].i.length }); }
      const geo = all.toGeo(inv), ma = new THREE.Float32BufferAttribute(cl, 3); ma.applyMatrix4(inv); ma.name = 'closed';
      geo.morphAttributes.position = [ma]; gr.forEach((g, i) => geo.addGroup(g.start, g.count, i));
      const m = new THREE.Mesh(geo, keys.map((k) => M[k])); m.name = e.name; m.updateMorphTargets(); m.morphTargetInfluences[0] = 0;
      e.frame.decompose(m.position, m.quaternion, m.scale);
      m.userData = JSON.parse(JSON.stringify(e.extras)); grp(sub(topOf(e.fk, e.layer), e.group)).add(m); shutterNodes.push(m);
      continue;
    }
    const m = meshOf(e.name, e.parts, e.frame); if (!m) continue;
    m.userData = JSON.parse(JSON.stringify(e.extras));
    const top = topOf(e.fk, e.layer); grp(sub(top, top === 'EXTERIOR' && e.group === 'EXTERIOR' ? 'STRUCT' : e.group)).add(m);
  }
  for (const [name, dm] of decoMerge) {
    // DECO and ENV: one node per material so engines can batch them
    for (const [mk, g] of Object.entries(dm.parts)) {
      const m = meshOf(name + '_' + mk, { [mk]: g }, null); if (!m) continue;
      m.userData = { surface: dm.env ? 'env' : 'deco', material: mk, kind: dm.extras.kind || dm.extras.role || undefined };
      const top = topOf(dm.fk, dm.layer);
      grp(sub(top, dm.env ? 'ENV' : 'DECO')).add(m);
    }
  }
  // empties
  const byName = {};
  for (const e of EMPT) {
    const o = new THREE.Object3D(); o.name = e.name; o.position.set(...e.pos); if (e.quat) o.quaternion.set(...e.quat); if (e.scale) o.scale.set(...e.scale);
    o.userData = JSON.parse(JSON.stringify(e.extras)); byName[e.name] = o;
  }
  for (const e of EMPT) {
    const o = byName[e.name];
    if (e.parent && byName[e.parent]) { const p = byName[e.parent]; o.position.sub(p.position); p.add(o); continue; }
    const top = e.group === 'COLLIDERS' ? 'COLLIDERS' : e.group === 'SLOTS' ? sub(topOf(e.fk), 'SLOTS') : 'MARKERS';
    grp(top).add(o);
  }
  const animations = [];
  if (CRADLE.node && CRADLE.cr) {
    const cr = CRADLE.cr, s = cr.moving.stops_y, T = cr.moving.travel_s, p = new THREE.Vector3(); CRADLE.node.frame.decompose(p, new THREE.Quaternion(), new THREE.Vector3());
    const times = [0, 4, 4 + T, 8 + T, 8 + 2 * T], ys = [s[0], s[0], s[1], s[1], s[0]];
    animations.push(new THREE.AnimationClip('cradle_cycle', times[4], [new THREE.VectorKeyframeTrack(CRADLE.node.name + '.position', times, ys.flatMap((y) => [p.x, y, p.z]))]));
  }
  if (shutterNodes.length) {
    // one shared pair of clips for all shutters: eased travel over rules.shutters.travel_s (weight 0 = open, 1 = closed)
    const T = RU.shutters.travel_s, ts = Array.from({ length: 9 }, (_, i) => r3((T * i) / 8)), ws = ts.map((t) => { const u = t / T; return r3(u * u * (3 - 2 * u)); });
    animations.push(new THREE.AnimationClip('shutters_close', T, shutterNodes.map((m) => new THREE.NumberKeyframeTrack(m.name + '.morphTargetInfluences', ts, ws))));
    animations.push(new THREE.AnimationClip('shutters_open', T, shutterNodes.map((m) => new THREE.NumberKeyframeTrack(m.name + '.morphTargetInfluences', ts, ws.map((w) => r3(1 - w))))));
  }
  return { scene, animations };
}

/* ------------------------------------------------------------------ build everything */

function buildMap(opts = {}) {
  const T = {}, t0 = performance.now(), tick = (k, t) => { T[k] = Math.round(performance.now() - t); return performance.now(); };
  let t = performance.now();
  T.materials = buildMaterials(); t = performance.now();
  const ext = wallExtensions();
  for (const w of L.walls) buildWall(w, ext);
  t = tick('walls', t);
  buildColumns(); buildLiftBanks(); t = tick('columns', t);
  buildStairs(); buildLadders(); buildWalkways(); t = tick('circulation', t);
  buildFacade(); buildShutters(); t = tick('facade', t);
  buildLedges(); buildTerrace(); buildBridges(); buildNeighbours(); buildTowerBands(); t = tick('exterior', t);
  buildProps(); buildSetPieces(); buildMarkers(); t = tick('props_markers', t);
  buildFallbackBackdrop(); t = tick('backdrop', t);
  buildKeepouts();
  const K = makeKit(opts);
  runParts(K); t = tick('parts', t);
  buildBackdrop(K); t = tick('backdrop_bake', t);
  // finishes, ceilings and hatches use the (possibly overridden) room materials, so they come after the parts
  buildSlabs(); buildCeilings(); buildHatches(); t = tick('slabs_ceilings', t);
  const D = buildDisplay(); t = tick('display', t);
  T.total = Math.round(performance.now() - t0);
  const count = (pre) => REG.filter((e) => e.name.startsWith(pre)).length + EMPT.filter((e) => e.name.startsWith(pre)).length;
  Object.assign(STATS, {
    timings: T, partTimings: K.timings, displayTris: D.tris, displayMeshes: D.meshes.length, nodes: REG.filter((e) => e.export && !e.deco && !e.env).length, empties: EMPT.length,
    counts: Object.fromEntries(['HARD_', 'SOFT_', 'REINF_', 'GLASSI_', 'RAIL_', 'HATCH_', 'SOFTFLOOR_', 'SOFTCEIL_', 'BARR_D_', 'BARR_W_', 'OPEN_', 'GLASS_T_', 'GLASS_B_', 'GLASS_TF_', 'SHUTTER_', 'COL_SHUTTER_', 'HOLO_', 'ZONE_EXT_', 'STAIR_', 'LADDER_', 'WALK_', 'LEDGE_', 'BRIDGE_', 'TERRACE', 'SPAWN_ATK_', 'SPAWN_DEF_', 'OBJ_', 'COVER_', 'CALLOUT_', 'COL_', 'DECO_', 'ENV_'].map((p) => [p, count(p)])),
  });
  STATS.shutters = { total: SHUTTERS.length, perFloor: Object.fromEntries(FIDS.map((f) => [f, SHUTTERS.filter((x) => x.sh.floor === f).length])), tris: SHUTTERS.reduce((s, x) => s + Object.values(x.e.parts).reduce((t, g) => t + g.tris, 0), 0) };
  return { K, D, STATS, LABELS, LIGHTS, TICKS, CRADLE, HOLO, FALLBACK_RAIN, SHUTTERS, exportScene, REG, EMPT, M, TX, OVERLAY };
}
