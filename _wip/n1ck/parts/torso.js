/* ------------------------------------------------------------------ part: torso (pelvis, torso plates, back, power cell, emitters, chest panel) */
// Owner: the torso agent. Attach to K.bones.hips / spine / chest / upper_chest only. Contract: SPEC.md.
// The body is a sculpted surface (superellipse sections by height, pinched under the shoulders). Armour
// plates are drawn as outlines in surface coordinates (u = arc length from the front or back centre, y)
// and wrapped onto it with real rounded bevels, so they hug the body and lap over each other.
PARTS.torso = function buildTorso(K) {
  const { THREE, D, J, M, V3 } = K;
  const PI = Math.PI, sst = K.sstep;

  /* ---------------- small vector helpers on [x, y, z] arrays */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const addv = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const v3 = (a) => V3(a[0], a[1], a[2]);

  /* ---------------- body surfaces */
  // rows: [y, half width, front z, back z, exponent, side pinch]. The pinch pulls the sides in under the
  // shoulder joints so the arms keep their clearance while the chest and shoulder blades stay full.
  const CORE_ROWS = [
    [0.99, 0.13, 0.082, -0.094, 2.6, 0], [1.02, 0.137, 0.087, -0.098, 2.6, 0], [1.05, 0.141, 0.087, -0.099, 2.7, 0],
    [1.09, 0.131, 0.081, -0.093, 2.7, 0], [1.13, 0.123, 0.077, -0.089, 2.6, 0], [1.2, 0.137, 0.088, -0.099, 2.8, 0],
    [1.28, 0.149, 0.097, -0.108, 2.9, 0], [1.355, 0.154, 0.101, -0.114, 3.0, 0], [1.41, 0.15, 0.098, -0.118, 3.3, 0.14],
    [1.46, 0.138, 0.088, -0.121, 3.6, 0.26], [1.5, 0.118, 0.072, -0.113, 3.4, 0.18], [1.538, 0.09, 0.052, -0.094, 3.0, 0.06],
    [1.56, 0.07, 0.04, -0.08, 2.6, 0],
  ];
  // the pelvis below the hip band: only the front (codpiece) and seat plates use it
  const PELV_ROWS = [
    [0.858, 0.026, 0.028, -0.042, 2.2, 0], [0.885, 0.068, 0.058, -0.076, 2.3, 0], [0.92, 0.102, 0.074, -0.092, 2.5, 0],
    [0.96, 0.12, 0.077, -0.096, 2.6, 0], [1.0, 0.128, 0.075, -0.09, 2.7, 0], [1.04, 0.134, 0.074, -0.088, 2.7, 0],
  ];
  function surface(rows, { pz = -0.02, pw = 0.045 } = {}) {
    const col = (i) => K.curve(rows.map((r) => [r[0], r[i] || 0]));
    const fa = col(1), ff = col(2), fb = col(3), fn = col(4), fp = col(5);
    const NS = 480, STEP = 0.001, cache = new Map();
    const sec = (iy) => {
      let s = cache.get(iy); if (s) return s;
      const y = iy * STEP, a = fa(y), f = ff(y), bk = fb(y), n = fn(y), pin = fp(y), c = (f + bk) / 2, b = (f - bk) / 2, e = 2 / n;
      const X = new Float64Array(NS + 1), Z = new Float64Array(NS + 1), L = new Float64Array(NS + 1);
      for (let i = 0; i <= NS; i++) {
        const t = PI / 2 - PI * i / NS, ct = Math.cos(t), st = Math.sin(t);
        let x = a * Math.pow(Math.abs(ct), e); const z = c + b * Math.sign(st) * Math.pow(Math.abs(st), e);
        if (pin) x *= 1 - pin * Math.exp(-(((z - pz) / pw) ** 2));
        X[i] = x; Z[i] = z; L[i] = i ? L[i - 1] + Math.hypot(x - X[i - 1], z - Z[i - 1]) : 0;
      }
      s = { X, Z, L, half: L[NS] }; cache.set(iy, s); return s;
    };
    // u: arc length from the front centre (or from the back centre when back), + toward his left (+x)
    const at = (s, u, back) => {
      const sg = u < 0 ? -1 : 1; let a = Math.abs(u);
      if (back) a = s.half - a;
      a = Math.min(Math.max(a, 0), s.half);
      let lo = 0, hi = NS;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s.L[m] <= a) lo = m; else hi = m; }
      const f = (a - s.L[lo]) / ((s.L[hi] - s.L[lo]) || 1);
      return [sg * (s.X[lo] + (s.X[hi] - s.X[lo]) * f), s.Z[lo] + (s.Z[hi] - s.Z[lo]) * f];
    };
    const P = (u, y, back = false) => {
      const fy = y / STEP, i0 = Math.floor(fy), w = fy - i0, p0 = at(sec(i0), u, back), p1 = at(sec(i0 + 1), u, back);
      return [p0[0] + (p1[0] - p0[0]) * w, y, p0[1] + (p1[1] - p0[1]) * w];
    };
    const half = (y) => { const fy = y / STEP, i0 = Math.floor(fy), w = fy - i0; return K.lerp(sec(i0).half, sec(i0 + 1).half, w); };
    return { P, half, cz: (y) => (ff(y) + fb(y)) / 2 };
  }
  const CORE = surface(CORE_ROWS, { pw: 0.052 }), PELV = surface(PELV_ROWS);

  // frame of the lifted surface at (u, y): base point P, base normal N, lift L, face normal n, tangents tu, tv
  const DD = 0.003;
  function framer(S, liftF, back) {
    const cache = new Map();
    return (u, y) => {
      const key = Math.round(u * 1e6) * 4e6 + Math.round(y * 1e6);
      let f = cache.get(key); if (f) return f;
      const su = sub(S.P(u + DD, y, back), S.P(u - DD, y, back)), sv = sub(S.P(u, y + DD, back), S.P(u, y - DD, back));
      let N = nrm(crs(su, sv)); if (back) N = [-N[0], -N[1], -N[2]];
      const L = liftF(u, y), Lu = liftF(u + DD, y) - liftF(u - DD, y), Lv = liftF(u, y + DD) - liftF(u, y - DD);
      const fu = addv(su, N, Lu), fv = addv(sv, N, Lv);
      let n = nrm(crs(fu, fv)); if (back) n = [-n[0], -n[1], -n[2]];
      const tu = nrm(fu); let tv = addv(fv, tu, -dot(fv, tu)); tv = nrm(addv(tv, n, -dot(tv, n)));
      f = { P: S.P(u, y, back), N, L, n, tu, tv }; cache.set(key, f); return f;
    };
  }
  const liftOf = (l) => typeof l === 'function' ? l : () => (l || 0);
  // lift that rises toward a plate's lower edge, so each plate laps over the one below
  const ramp = (yTop, yBot, l0, l1) => (u, y) => l0 + (l1 - l0) * sst(yTop, yBot, y);
  const backFr = framer(CORE, () => 0, true), frontFr = framer(CORE, () => 0, false);
  const onBack = (u, y, h) => v3(addv(CORE.P(u, y, true), backFr(u, y).N, h));

  /* ---------------- plates wrapped onto a surface */
  function contour(path, maxSeg, div = 6) {
    const dd = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let pts = path.getPoints(div).map((p) => [p.x, p.y]);
    if (pts.length > 2 && dd(pts[0], pts[pts.length - 1]) < 1e-7) pts.pop();
    pts = pts.filter((p, i) => i === 0 || dd(p, pts[i - 1]) > 1e-6);
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], n = Math.max(1, Math.ceil(dd(a, b) / maxSeg));
      for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    return out;
  }
  const area2 = (c) => { let s = 0; for (let i = 0; i < c.length; i++) { const a = c[i], b = c[(i + 1) % c.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  const inPoly = (c, x, y) => { let ins = false; for (let i = 0, j = c.length - 1; i < c.length; j = i++) { const a = c[i], b = c[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins; } return ins; };
  // per-vertex inset direction (into the material) scaled for the corner, and the unit normal
  function miters(c) {
    const n = c.length, out = [];
    for (let i = 0; i < n; i++) {
      const p = c[(i - 1 + n) % n], q = c[i], r = c[(i + 1) % n];
      const d1 = [q[0] - p[0], q[1] - p[1]], d2 = [r[0] - q[0], r[1] - q[1]], l1 = Math.hypot(d1[0], d1[1]) || 1, l2 = Math.hypot(d2[0], d2[1]) || 1;
      const a = [-d1[1] / l1, d1[0] / l1], b = [-d2[1] / l2, d2[0] / l2];
      let m = [a[0] + b[0], a[1] + b[1]]; const ml = Math.hypot(m[0], m[1]) || 1; m = [m[0] / ml, m[1] / ml];
      const k = 1 / Math.max(0.55, m[0] * a[0] + m[1] * a[1]);
      out.push([m[0] * k, m[1] * k, m[0], m[1]]);
    }
    return out;
  }
  // A plate: outline `shape` (holes allowed) in surface coordinates, thickness t above the lifted surface,
  // a rounded bevel and a thin flat margin (where the edge wear lands). Open at the back unless keepBack.
  // UVs are planar in plate space (bevels unrolled), so the iron texture runs across each plate unbroken.
  function skin(S, shape, o = {}) {
    const t = o.t ?? 0.007, bv = Math.min(o.bevel ?? 0.0025, t * 0.45), segs = o.segs ?? 2, mg = o.margin ?? 0.002;
    const back = !!o.back, tile = o.tile ?? 0.3, grid = o.grid ?? 0.02, maxSeg = o.maxSeg ?? 0.014;
    // edge wear: bevel and margin strips go bare where the chip noise is high; side walls less often
    const chip = o.chip ?? 0.44, wf = o.freq ?? 46, wearOn = o.wear !== false;
    const chipN = (p) => 0.65 * K.noise3(p[0] * wf, p[1] * wf, p[2] * wf) + 0.35 * K.noise3(p[0] * wf * 3.1 + 7, p[1] * wf * 3.1, p[2] * wf * 3.1);
    const liftF = liftOf(o.lift), Rr = K.prng(o.seed || 1), uo = [Rr() * 3, Rr() * 3], fr = framer(S, liftF, back);
    const div = o.div ?? 6, cs = [contour(shape, maxSeg, div)]; if (area2(cs[0]) < 0) cs[0].reverse();
    for (const h of shape.holes || []) { const c = contour(h, maxSeg, div); if (area2(c) > 0) c.reverse(); cs.push(c); }
    const prof = [[0, 0, 1, 0], [0, t - bv, 1, 0]];
    for (let k = 1; k <= segs; k++) { const th = k / segs * PI / 2; prof.push([bv * (1 - Math.cos(th)), t - bv + bv * Math.sin(th), Math.cos(th), Math.sin(th)]); }
    if (mg > 0) prof.push([bv + mg, t, 0, 1]);
    const sd = prof.map(() => 0); for (let k = prof.length - 2; k >= 0; k--) sd[k] = sd[k + 1] + Math.hypot(prof[k][0] - prof[k + 1][0], prof[k][1] - prof[k + 1][1]);
    const vtx = (x, y, z, nx, ny, nz, uu, vv) => {
      const f = fr(x, y);
      return { p: addv(f.P, f.N, f.L + z), n: nrm([nx * f.tu[0] + ny * f.tv[0] + nz * f.n[0], nx * f.tu[1] + ny * f.tv[1] + nz * f.n[1], nx * f.tu[2] + ny * f.tv[2] + nz * f.n[2]]), uv: [uu, vv] };
    };
    const P = [], N = [], U = [], CL = [];
    const tri = (a, b, c, cl = 0) => {
      const g = crs(sub(b.p, a.p), sub(c.p, a.p));
      if (dot(g, addv(addv(a.n, b.n), c.n)) < 0) { const t2 = b; b = c; c = t2; }
      for (const v of [a, b, c]) { P.push(v.p[0], v.p[1], v.p[2]); N.push(v.n[0], v.n[1], v.n[2]); U.push(v.uv[0], v.uv[1]); }
      CL.push(cl);
    };
    const top = [], bot = [];
    for (const c of cs) {
      const mt = miters(c);
      const rings = prof.map(([ins, z, wo, wz], k) => c.map((q, i) => {
        const m = mt[i], base = bv + mg - sd[k];
        return vtx(q[0] + m[0] * ins, q[1] + m[1] * ins, z, -m[2] * wo, -m[3] * wo, wz, (q[0] + m[0] * base) / tile + uo[0], (q[1] + m[1] * base) / tile + uo[1]);
      }));
      for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < c.length; i++) {
        const j = (i + 1) % c.length, a = rings[k][i], b = rings[k][j], cc = rings[k + 1][j], d = rings[k + 1][i];
        const cl = wearOn && chipN(addv(a.p, sub(cc.p, a.p), 0.5)) > (k === 0 ? chip + 0.17 : chip) ? 1 : 0;
        tri(a, b, cc, cl); tri(a, cc, d, cl);
      }
      top.push({ flat: c.map((q, i) => [q[0] + mt[i][0] * (bv + mg), q[1] + mt[i][1] * (bv + mg)]), v: rings[rings.length - 1] });
      if (o.keepBack) bot.push({ flat: c.slice(), v: c.map((q) => vtx(q[0], q[1], 0, 0, 0, -1, q[0] / tile + uo[0], q[1] / tile + uo[1])) });
    }
    const face = (rs, z, nz) => {
      const outer = rs[0].flat, holes = rs.slice(1).map((r) => r.flat), all = rs.flatMap((r) => r.flat), st = [];
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of outer) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
      const g2 = (grid * 0.55) ** 2;
      for (let y = y0 + grid * 0.5, row = 0; y < y1; y += grid * 0.87, row++) for (let x = x0 + grid * (row % 2 ? 0.75 : 0.25); x < x1; x += grid) {
        if (!inPoly(outer, x, y) || holes.some((h) => inPoly(h, x, y))) continue;
        let ok = true; for (const q of all) if ((q[0] - x) ** 2 + (q[1] - y) ** 2 < g2) { ok = false; break; }
        if (ok) st.push([x, y]);
      }
      const V2 = (q) => new THREE.Vector2(q[0], q[1]);
      const tris = THREE.ShapeUtils.triangulateShape(outer.map(V2), holes.map((h) => h.map(V2)).concat(st.map((q) => [V2(q)])));
      const vs = [...rs.flatMap((r) => r.v), ...st.map((q) => vtx(q[0], q[1], z, 0, 0, nz, q[0] / tile + uo[0], q[1] / tile + uo[1]))];
      for (const [a, b, c] of tris) tri(vs[a], vs[b], vs[c]);
    };
    face(top, t, 1);
    if (o.keepBack) face(bot, 0, -1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.userData.surf = (x, y, h = t) => { const f = fr(x, y); return { p: v3(addv(f.P, f.N, f.L + h)), n: v3(f.n) }; };
    g.userData.fr = fr; g.userData.t = t; g.userData.cls = CL;
    return g;
  }
  // split a skin by its wear classes: name (iron), name_wear (bare edges)
  function splitCls(g) {
    const cls = g.userData.cls, out = [[], []];
    if (!cls) return [g, null];
    const at = g.attributes;
    for (let c = 0; c < 2; c++) {
      const n = cls.reduce((s, v) => s + (v === c ? 1 : 0), 0); if (!n) { out[c] = null; continue; }
      const ng = new THREE.BufferGeometry();
      for (const [k, a] of Object.entries(at)) {
        const sz = a.itemSize, dst = new Float32Array(n * 3 * sz); let w = 0;
        for (let t2 = 0; t2 < cls.length; t2++) if (cls[t2] === c) { dst.set(a.array.subarray(t2 * 3 * sz, t2 * 3 * sz + 3 * sz), w); w += 3 * sz; }
        ng.setAttribute(k, new THREE.BufferAttribute(dst, sz));
      }
      out[c] = ng;
    }
    return out;
  }

  /* ---------------- core shells (the dark body under the plates) */
  // grid on the surface: rows by height, columns by fraction of the half perimeter; domed ends;
  // corr(y) pushes the surface out along its normal (bellows); skip(u, y) cuts a hole.
  function shell(S, y0, y1, o = {}) {
    const cols = o.cols || 56, n = Math.max(2, Math.ceil((y1 - y0) / (o.dy || 0.012))), fr = framer(S, () => 0, false), tile = o.tile || 0.25;
    const rows = [];
    if (o.capBot) for (const a of [90, 62, 34]) rows.push({ y: y0, dy: -o.capBot * Math.sin(K.deg(a)), sc: Math.cos(K.deg(a)) });
    for (let i = 0; i <= n; i++) rows.push({ y: y0 + (y1 - y0) * i / n, dy: 0, sc: 1 });
    if (o.capTop) for (const a of [34, 62, 90]) rows.push({ y: y1, dy: o.capTop * Math.sin(K.deg(a)), sc: Math.cos(K.deg(a)) });
    const pos = [], uv = [], keep = [];
    for (const r of rows) {
      const hf = S.half(r.y), cz = S.cz(r.y), c = o.corr ? o.corr(r.y) : 0;
      for (let j = 0; j <= cols; j++) {
        const u = (-1 + 2 * j / cols) * hf;
        let p = S.P(u, r.y);
        if (c) p = addv(p, fr(u, r.y).N, c);
        pos.push(p[0] * r.sc, r.y + r.dy, cz + (p[2] - cz) * r.sc); uv.push(u / tile, (r.y + r.dy) / tile);
        keep.push(!(o.skip && r.sc === 1 && o.skip(u, r.y)));
      }
    }
    const idx = [], W = cols + 1;
    for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < cols; j++) {
      const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
      if (o.skip && !(keep[a] && keep[b] && keep[c] && keep[d])) continue;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    // weld the normals across the back seam
    const nA = g.attributes.normal;
    for (let i = 0; i < rows.length; i++) {
      const a = i * W, b = a + cols, s = V3().fromBufferAttribute(nA, a).add(V3().fromBufferAttribute(nA, b)).normalize();
      nA.setXYZ(a, s.x, s.y, s.z); nA.setXYZ(b, s.x, s.y, s.z);
    }
    return g;
  }

  /* ---------------- detail helpers */
  const R = K.prng(707);
  const rivHeadCache = {};
  const rivHead = (r) => (rivHeadCache[r] ||= K.latheY([[0, r], [0.3 * r, 0.93 * r], [0.55 * r, 0.72 * r], [0.72 * r, 0.38 * r], [0.77 * r, 0]], 7)).clone();
  // hand-set rivets (low poly): [{p, n}], slightly squashed and tilted, sunk 0.5 mm
  function rivetSet(list, r = 0.0045) {
    const out = [];
    for (const it of list) {
      const n = it.n.clone().normalize(), g = rivHead(r * (0.94 + R() * 0.12));
      g.scale(1, 0.85 + R() * 0.25, 1); g.rotateY(R() * 6.283); g.rotateX((R() - 0.5) * 0.12); g.rotateZ((R() - 0.5) * 0.12);
      K.orient(g, V3(0, 1, 0), n); g.translate(it.p.x - n.x * 0.0005, it.p.y - n.y * 0.0005, it.p.z - n.z * 0.0005);
      out.push(g);
    }
    return out;
  }
  // ferrules where a lead enters a part, at both ends of a path
  const ferHead = {};
  function ferrules(points, r, len = 0.012) {
    const out = [];
    for (const [p, q] of [[points[0], points[1]], [points[points.length - 1], points[points.length - 2]]]) {
      const key = r + ':' + len, g = (ferHead[key] ||= K.latheY([[-len * 0.3, r * 1.45], [len * 0.25 - len * 0.3, r * 1.5], [len * 0.3 - len * 0.3, r * 1.3], [len * 0.7, r * 1.18], [len * 0.7, r * 0.9]], 10)).clone();
      K.orient(g, V3(0, 1, 0), q.clone().sub(p).normalize()); g.translate(p.x, p.y, p.z); out.push(g);
    }
    return K.merge(out);
  }
  const on = (plateGeo, pts, h) => pts.map(([x, y]) => plateGeo.userData.surf(x, y, h));
  const hexCache = {};
  const hex = (r, pos, n, spin = R() * 3) => K.placeScrew((hexCache[r] ||= K.screwHead(r, { style: 'hex', h: r * 0.55, seg: 8 })).clone(), pos, n, spin);
  const BONES = ['hips', 'spine', 'chest', 'upper_chest'], bag = () => Object.fromEntries(BONES.map((b) => [b, []]));
  const rivetsAll = bag(), screwsAll = bag(), weldsAll = bag(), cablesAll = bag(), ferrAll = bag();
  const mirrorPts = (pts) => pts.map(([x, y]) => [-x, y]);
  const shapeOf = (pts, sx = 1) => K.roundedShape(pts.map(([x, y, r]) => [x * sx, y, r || 0]));
  // left plate and its mirror (rebuilt, so the texture differs side to side)
  const pair = (S, pts, o) => [skin(S, shapeOf(pts), { ...o, seed: (o.seed || 1) }), skin(S, shapeOf(pts, -1), { ...o, seed: (o.seed || 1) + 50 })];
  const plateW = (bone, g, name) => { const [a, b] = splitCls(g); const m0 = a && K.addW(bone, a, M.iron, name); if (b) K.addW(bone, b, M.wear, name + '_wear'); return m0; };
  const gm = (g) => K.boxUV(g, 0.15);   // machined parts: UVs at the gunmetal tile

  /* ================================================================ cores */
  // chest panel opening (left pec, over the heart) in front surface coordinates
  const HATCH = { u0: 0.03, u1: 0.104, y0: 1.345, y1: 1.43, r: 0.011 };
  const cavity = { u0: HATCH.u0 - 0.004, u1: HATCH.u1 + 0.004, y0: HATCH.y0 - 0.004, y1: HATCH.y1 + 0.004 };
  K.addW('hips', shell(CORE, 1.03, 1.1, { capBot: 0.012, dy: 0.016, cols: 44 }), M.inner, 'pelvis_core');
  // waist: machined bellows, seen at the flanks between the ab bands and the lumbar plates
  K.addW('spine', shell(CORE, 1.072, 1.234, { dy: 0.0045, cols: 52, corr: (y) => 0.0046 * (0.5 + 0.5 * Math.cos(2 * PI * (y - 1.072) / 0.018)) - 0.001 }), M.gunmetal, 'waist_bellows');
  K.addW('chest', shell(CORE, 1.2, 1.356, { dy: 0.016, cols: 44 }), M.inner, 'ribcage_core');
  K.addW('upper_chest', shell(CORE, 1.33, 1.536, {
    dy: 0.013, capTop: 0.006, cols: 50,
    skip: (u, y) => u > cavity.u0 - 0.002 && u < cavity.u1 + 0.002 && y > cavity.y0 - 0.002 && y < cavity.y1 + 0.002,
  }), M.inner, 'upper_chest_core');

  /* ================================================================ front plates */
  const pecLift = ramp(1.36, 1.3, 0.002, 0.01);
  const PEC = [[0.0013, 1.296, 0.002], [0.07, 1.303, 0.03], [0.138, 1.33, 0.025], [0.163, 1.39, 0.03], [0.148, 1.452, 0.03], [0.108, 1.503, 0.025], [0.06, 1.528, 0.02], [0.0013, 1.536, 0.002]];
  const pecShapeL = shapeOf(PEC); pecShapeL.holes.push(K.rect(HATCH.u0, HATCH.u1, HATCH.y0, HATCH.y1, HATCH.r));
  const pecO = { t: 0.008, bevel: 0.0028, lift: pecLift };
  const pecL = skin(CORE, pecShapeL, { ...pecO, seed: 3 }), pecR = skin(CORE, shapeOf(PEC, -1), { ...pecO, seed: 53 });
  plateW('upper_chest', pecL, 'pec_plate_l'); plateW('upper_chest', pecR, 'pec_plate_r');
  const pecRiv = [[0.022, 1.309], [0.052, 1.313], [0.083, 1.319], [0.113, 1.331], [0.138, 1.35], [0.151, 1.384], [0.148, 1.42], [0.136, 1.452]];
  rivetsAll.upper_chest.push(...rivetSet(on(pecL, pecRiv)), ...rivetSet(on(pecR, mirrorPts(pecRiv))));

  const lowLift = ramp(1.25, 1.205, 0.001, 0.01);
  const LOWC = [[0.0013, 1.199, 0.002], [0.06, 1.203, 0.03], [0.112, 1.213, 0.02], [0.131, 1.337, 0.012], [0.0013, 1.339, 0.002]];
  const [lowL, lowR] = pair(CORE, LOWC, { t: 0.007, bevel: 0.0025, lift: lowLift, seed: 5 });
  plateW('chest', lowL, 'sternum_plate_l'); plateW('chest', lowR, 'sternum_plate_r');
  const lowRiv = [[0.104, 1.226], [0.11, 1.262], [0.116, 1.298]];
  rivetsAll.chest.push(...rivetSet(on(lowL, lowRiv)), ...rivetSet(on(lowR, mirrorPts(lowRiv))));

  // central seam: one butt weld down the pec and sternum plates
  const seam = (g, y0, y1, step = 0.012) => { const pts = [], ns = []; for (let y = y0; y <= y1 + 1e-6; y += step) { const s = g.userData.surf(0.0, y); pts.push(s.p); ns.push(s.n); } return K.weld(pts, ns, { w: 0.0088, h: 0.0024, pitch: 0.0062, seg: 5, seed: Math.round(y0 * 100) }); };
  weldsAll.upper_chest.push(seam(pecL, 1.302, 1.532));
  weldsAll.chest.push(seam(lowL, 1.204, 1.336));

  // repair patch on the right sternum plate, welded all round
  {
    const f = lowR.userData, h0 = f.t, u0 = -0.082, u1 = -0.05, y0 = 1.24, y1 = 1.268;
    const patch = skin(CORE, K.rect(u0, u1, y0, y1, 0.004), { t: 0.0035, bevel: 0.0013, segs: 1, margin: 0.0012, lift: (u, y) => lowLift(u, y) + h0, seed: 81, grid: 0.014, maxSeg: 0.008, div: 3, chip: 0.3 });
    plateW('chest', patch, 'sternum_patch');
    const e = 0.0012, path = [[u0 - e, y0 + 0.004], [u0 - e, y1 - 0.004], [u0 + 0.004, y1 + e], [u1 - 0.004, y1 + e], [u1 + e, y1 - 0.004], [u1 + e, y0 + 0.004], [u1 - 0.004, y0 - e], [u0 + 0.004, y0 - e], [u0 - e, y0 + 0.004]];
    const dense = []; for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < 4; k++) dense.push([K.lerp(path[i][0], path[i + 1][0], k / 4), K.lerp(path[i][1], path[i + 1][1], k / 4)]);
    dense.push(path[path.length - 1]);
    const s = dense.map(([x, y]) => f.surf(x, y));
    weldsAll.chest.push(K.weld(s.map((q) => q.p), s.map((q) => q.n), { w: 0.0055, h: 0.0017, pitch: 0.0045, seg: 5, seed: 12 }));
  }

  // ab bands, lapping down over each other
  const AB1 = [[-0.118, 1.156, 0.02], [0, 1.148, 0], [0.118, 1.156, 0.02], [0.127, 1.216, 0.018], [0, 1.221, 0], [-0.127, 1.216, 0.018]];
  const AB2 = [[-0.112, 1.093, 0.02], [0, 1.085, 0], [0.112, 1.093, 0.02], [0.12, 1.16, 0.018], [0, 1.163, 0], [-0.12, 1.16, 0.018]];
  const ab1 = skin(CORE, shapeOf(AB1), { t: 0.007, bevel: 0.0025, lift: ramp(1.19, 1.15, 0.001, 0.0095), seed: 7 });
  const ab2 = skin(CORE, shapeOf(AB2), { t: 0.007, bevel: 0.0025, lift: ramp(1.13, 1.088, 0.001, 0.011), seed: 9 });
  plateW('spine', ab1, 'ab_band_upper'); plateW('spine', ab2, 'ab_band_lower');
  rivetsAll.spine.push(...rivetSet(on(ab1, [[0.108, 1.172], [0.112, 1.203], [-0.108, 1.172], [-0.112, 1.203]])), ...rivetSet(on(ab2, [[0.1, 1.11], [0.105, 1.143], [-0.1, 1.11], [-0.105, 1.143]])));

  // flank ribs: three louvred slats a side between the sternum and back plates
  for (const [k, yb, yt] of [[1, 1.3, 1.334], [2, 1.259, 1.293], [3, 1.218, 1.252]]) {
    const ym = (yb + yt) / 2, ua = 0.122 + (ym - 1.212) / 0.124 * 0.018, ub = CORE.half(ym) - 0.157, um = (ua + ub) / 2, sl = 0.075;
    // rib coordinates: y rises toward the back by sl per metre of u
    const Y = (u, y) => y + sl * (u - um);
    const pts = [[ua, Y(ua, yb) + 0.012, 0.008], [ua + 0.022, Y(ua + 0.022, yb), 0.016], [ub, Y(ub, yb), 0.01], [ub + 0.003, Y(ub, yt), 0.01], [ua + 0.014, Y(ua + 0.014, yt), 0.018], [ua + 0.002, Y(ua, yt) - 0.006, 0.006]];
    const lift = (u, y) => 0.001 + 0.0042 * sst(yt, yb, y - sl * (Math.abs(u) - um));
    const [rl, rr] = pair(CORE, pts, { t: 0.006, bevel: 0.0022, lift, seed: 20 + k });
    plateW('chest', rl, `rib_${k}_l`); plateW('chest', rr, `rib_${k}_r`);
    const rp = [[ua + 0.014, Y(ua + 0.014, ym)], [ub - 0.008, Y(ub - 0.008, ym)]];
    rivetsAll.chest.push(...rivetSet(on(rl, rp), 0.0038), ...rivetSet(on(rr, mirrorPts(rp)), 0.0038));
  }

  // braided leads down each flank over the bellows
  for (const s of [1, -1]) {
    const ys = [1.232, 1.205, 1.17, 1.135, 1.1, 1.078], uu = (y) => s * (CORE.half(y) * 0.5 + 0.004);
    const path = ys.map((y, i) => v3(addv(CORE.P(uu(y), y), frontFr(uu(y), y).N, 0.0068 + 0.0035 * Math.sin(PI * i / (ys.length - 1)))));
    cablesAll.spine.push(K.cableBundle(path, { n: 2, r: 0.0031, twist: 5, seg: 6 }));
    ferrAll.spine.push(ferrules(path, 0.0068, 0.011));
  }

  /* ================================================================ back plates */
  const scapLift = ramp(1.37, 1.336, 0.002, 0.01);
  const SCAP = [[0.017, 1.334, 0.002], [0.115, 1.336, 0.025], [0.142, 1.38, 0.03], [0.14, 1.45, 0.03], [0.105, 1.512, 0.03], [0.05, 1.531, 0.015], [0.017, 1.533, 0.002]];
  const [scL, scR] = pair(CORE, SCAP, { t: 0.008, bevel: 0.0028, lift: scapLift, back: true, seed: 31 });
  plateW('upper_chest', scL, 'scapula_plate_l'); plateW('upper_chest', scR, 'scapula_plate_r');
  const scRiv = [[0.026, 1.355], [0.026, 1.39], [0.026, 1.425], [0.026, 1.46], [0.03, 1.495], [0.065, 1.346], [0.1, 1.348]];
  rivetsAll.upper_chest.push(...rivetSet(on(scL, scRiv)), ...rivetSet(on(scR, mirrorPts(scRiv))));

  const midLift = ramp(1.25, 1.208, 0.001, 0.01);
  const MIDB = [[0.017, 1.206, 0.002], [0.13, 1.21, 0.025], [0.15, 1.3, 0.025], [0.145, 1.346, 0.02], [0.017, 1.348, 0.002]];
  const [mbL, mbR] = pair(CORE, MIDB, { t: 0.007, bevel: 0.0025, lift: midLift, back: true, seed: 35 });
  plateW('chest', mbL, 'midback_plate_l'); plateW('chest', mbR, 'midback_plate_r');
  const mbRiv = [[0.026, 1.228], [0.026, 1.268], [0.026, 1.308], [0.133, 1.235], [0.14, 1.29]];
  rivetsAll.chest.push(...rivetSet(on(mbL, mbRiv)), ...rivetSet(on(mbR, mirrorPts(mbRiv))));

  const lumLift = ramp(1.12, 1.08, 0.001, 0.011);
  const LUMB = [[0.034, 1.078, 0.006], [0.112, 1.082, 0.02], [0.128, 1.215, 0.02], [0.034, 1.218, 0.006]];
  const [lbL, lbR] = pair(CORE, LUMB, { t: 0.007, bevel: 0.0025, lift: lumLift, back: true, seed: 37 });
  plateW('spine', lbL, 'lumbar_plate_l'); plateW('spine', lbR, 'lumbar_plate_r');
  const lbRiv = [[0.1, 1.098], [0.115, 1.2], [0.047, 1.198]];
  rivetsAll.spine.push(...rivetSet(on(lbL, lbRiv)), ...rivetSet(on(lbR, mirrorPts(lbRiv))));

  // spine column: machined vertebrae down the back, cables threaded through them
  const vertebrae = (bone, ys) => {
    const out = [];
    for (const y of ys) out.push(skin(CORE, K.rect(-0.0135, 0.0135, y - 0.0093, y + 0.0093, 0.0055), { t: 0.02, bevel: 0.0032, segs: 2, margin: 0, back: true, grid: 0.03, maxSeg: 0.012, div: 3, seed: Math.round(y * 1000), tile: 0.15, wear: false }));
    K.addW(bone, K.merge(out), M.gunmetal, bone === 'chest' ? 'spine_column_lower' : 'spine_column_upper');
  };
  vertebrae('upper_chest', [1.358, 1.384, 1.41, 1.436, 1.462, 1.488, 1.514]);
  vertebrae('chest', [1.228, 1.254, 1.28, 1.306, 1.332]);
  const channel = (y0, y1, sx) => { const pts = []; for (let y = y0; y <= y1 + 1e-6; y += 0.02) pts.push(onBack(sx * 0.0088, y, 0.0042)); return pts; };
  for (const sx of [1, -1]) {
    cablesAll.upper_chest.push(K.cable(channel(1.338, 1.526, sx), 0.0033, { seg: 7 }));
    cablesAll.chest.push(K.cable(channel(1.206, 1.346, sx), 0.0033, { seg: 7 }));
  }

  /* ================================================================ hips: band, codpiece, seat */
  {
    const bl = 0.0005, frontEnd = 0.198, beltTop = 1.09;
    const BF = [[-frontEnd, 1.014, 0.008], [-0.1, 1.004, 0.03], [0, 0.998, 0], [0.1, 1.004, 0.03], [frontEnd, 1.014, 0.008], [frontEnd, beltTop, 0.006], [-frontEnd, beltTop, 0.006]];
    const beltF = skin(CORE, shapeOf(BF), { t: 0.009, bevel: 0.003, lift: bl, keepBack: true, seed: 41 });
    const side = (y) => CORE.half(y) - frontEnd - 0.005;
    const BB = [[-side(1.014), 1.014, 0.008], [0, 1.0, 0], [side(1.014), 1.014, 0.008], [side(1.05), 1.05, 0], [side(beltTop), beltTop, 0.006], [-side(beltTop), beltTop, 0.006], [-side(1.05), 1.05, 0]];
    const beltB = skin(CORE, shapeOf(BB), { t: 0.009, bevel: 0.003, lift: bl, back: true, keepBack: true, seed: 43 });
    plateW('hips', beltF, 'hip_band_front'); plateW('hips', beltB, 'hip_band_back');
    const grid2 = (g, us, ys) => { const l = []; for (const y of ys) for (const u of us) l.push([u, y]); return on(g, l); };
    rivetsAll.hips.push(...rivetSet(grid2(beltF, [-0.165, -0.11, -0.055, 0, 0.055, 0.11, 0.165], [1.079])), ...rivetSet(grid2(beltF, [-0.165, 0.165], [1.024])));
    rivetsAll.hips.push(...rivetSet(grid2(beltB, [-0.15, -0.1, -0.05, 0.05, 0.1, 0.15], [1.079])), ...rivetSet(grid2(beltB, [-0.15, 0.15], [1.022])));
    // side clamps over the band joints
    const clamps = [];
    for (const s of [1, -1]) {
      const uc = s * (frontEnd + 0.0025);
      const clamp = skin(CORE, K.rect(uc - 0.014, uc + 0.014, 1.018, 1.084, 0.006), { t: 0.005, bevel: 0.002, segs: 2, lift: bl + 0.0093, seed: 45 + s, grid: 0.02, div: 3, tile: 0.15, wear: false });
      clamps.push(clamp);
      for (const y of [1.031, 1.071]) { const q = clamp.userData.surf(uc, y); screwsAll.hips.push(hex(0.0042, q.p, q.n)); }
    }
    K.addW('hips', K.merge(clamps), M.gunmetal, 'hip_band_clamps');
    const CU = [[-0.064, 0.958, 0.016], [0, 0.952, 0], [0.064, 0.958, 0.016], [0.073, 1.032, 0.008], [-0.073, 1.032, 0.008]];
    const CL2 = [[0, 0.874, 0], [0.022, 0.879, 0.01], [0.041, 0.904, 0.016], [0.055, 0.966, 0.012], [-0.055, 0.966, 0.012], [-0.041, 0.904, 0.016], [-0.022, 0.879, 0.01]];
    const codU = skin(PELV, shapeOf(CU), { t: 0.008, bevel: 0.0028, lift: ramp(0.985, 0.955, 0.0, 0.0085), seed: 47 });
    const codL = skin(PELV, shapeOf(CL2), { t: 0.007, bevel: 0.0025, lift: 0, seed: 48 });
    plateW('hips', codU, 'pelvis_front_plate'); plateW('hips', codL, 'pelvis_guard');
    rivetsAll.hips.push(...rivetSet(on(codU, [[0.056, 0.985], [-0.056, 0.985], [0.058, 1.016], [-0.058, 1.016]])), ...rivetSet(on(codL, [[0, 0.893], [0.03, 0.935], [-0.03, 0.935]]), 0.004));
    const SEAT = [[0.006, 0.906, 0.004], [0.07, 0.9, 0.035], [0.104, 0.94, 0.026], [0.112, 1.032, 0.01], [0.006, 1.032, 0.004]];
    const [stL, stR] = pair(PELV, SEAT, { t: 0.008, bevel: 0.0028, lift: 0, back: true, seed: 49 });
    plateW('hips', stL, 'seat_plate_l'); plateW('hips', stR, 'seat_plate_r');
    const stRiv = [[0.02, 0.93], [0.066, 0.918], [0.094, 0.95]];
    rivetsAll.hips.push(...rivetSet(on(stL, stRiv)), ...rivetSet(on(stR, mirrorPts(stRiv))));
    // crotch keel and the web up into the pelvis
    const keel = K.sLoft([[-0.072, 0.016, 0.015, 2.6, 0, 0.902], [-0.02, 0.021, 0.019, 2.8, 0, 0.888], [0.03, 0.021, 0.019, 2.8, 0, 0.887], [0.062, 0.015, 0.013, 2.6, 0, 0.896]], { axis: 'z', seg: 20, steps: 14, roundStart: 0.007, roundEnd: 0.007 });
    K.addW('hips', keel, M.gunmetal, 'crotch_keel');
    K.addW('hips', K.sLoft([[0.89, 0.011, 0.052, 4, 0, -0.006], [1.04, 0.011, 0.07, 4, 0, -0.008]], { axis: 'y', seg: 16, steps: 4 }), M.inner, 'pelvis_web');
  }

  /* ================================================================ collar */
  {
    const cz = J.neck.z, prof = [[1.528, 0.057], [1.55, 0.057], [1.566, 0.057], [1.571, 0.061], [1.573, 0.067], [1.573, 0.077], [1.57, 0.084], [1.563, 0.088], [1.548, 0.09], [1.537, 0.094], [1.53, 0.095], [1.526, 0.093], [1.526, 0.06], [1.528, 0.057]];
    let g = K.latheY(prof, 44);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z) || 1, a = Math.atan2(z, x), e = Math.max(0, r - 0.0575), k = r < 0.058 ? r / 0.0575 : 1;
      p.setXYZ(i, Math.cos(a) * (0.0575 + e * 1.38) * k, p.getY(i), cz + Math.sin(a) * (0.0575 + e * 0.62) * k);
    }
    g = K.creased(g, 40);
    K.addW('upper_chest', g, M.iron, 'collar_ring', { wear: true });
    for (let i = 0; i < 6; i++) { const a = (i + 0.5) / 6 * PI * 2; screwsAll.upper_chest.push(hex(0.0042, V3(Math.cos(a) * (0.0575 + 0.0145 * 1.38), 1.5728, cz + Math.sin(a) * (0.0575 + 0.0145 * 0.62)), V3(0, 1, 0))); }
  }

  /* ================================================================ chest panel (hinged, "Nick" inside) */
  {
    const fr = framer(CORE, pecLift, false), face = (u, y, dh = 0) => { const f = fr(u, y); return addv(f.P, f.N, f.L + 0.008 + dh); };
    // the hinge line runs down the medial edge, just proud of the face
    const ua = 0.0285, A = face(ua, HATCH.y0 + 0.002, 0.0028), B = face(ua, HATCH.y1 - 0.002, 0.0028), axis = v3(nrm(sub(B, A))), H = v3(addv(A, sub(B, A), 0.5));
    const node = new THREE.Group(); node.name = 'chest_panel'; node.position.copy(H).sub(J.upper_chest); K.bones.upper_chest.add(node);
    const g = 0.0025, door = skin(CORE, K.rect(HATCH.u0 + g, HATCH.u1 - g, HATCH.y0 + g, HATCH.y1 - g, HATCH.r - g), { t: 0.008, bevel: 0.0026, lift: pecLift, keepBack: true, seed: 61, grid: 0.013 });
    K.addW(node, door, M.iron, 'chest_panel_door', { wear: true });
    // hinge knuckles: frame, door, frame
    const knuckle = (y0, y1) => { const a = v3(face(ua, y0, 0.0028)), b = v3(face(ua, y1, 0.0028)), L = a.distanceTo(b); return K.orient(new THREE.CylinderGeometry(0.0034, 0.0034, L, 14), V3(0, 1, 0), b.clone().sub(a)).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); };
    K.addW('upper_chest', gm(K.merge([knuckle(HATCH.y0 + 0.003, HATCH.y0 + 0.026), knuckle(HATCH.y1 - 0.026, HATCH.y1 - 0.003)])), M.gunmetal, 'chest_panel_hinge_frame');
    K.addW(node, gm(knuckle(HATCH.y0 + 0.0285, HATCH.y1 - 0.0285)), M.gunmetal, 'chest_panel_hinge_door');
    // latch tab on the free edge
    const latch = skin(CORE, K.rect(HATCH.u1 - 0.012, HATCH.u1 - 0.004, 1.38, 1.396, 0.003), { t: 0.004, bevel: 0.0014, segs: 2, margin: 0.001, lift: (u, y) => pecLift(u, y) + 0.008, seed: 63, grid: 0.02, maxSeg: 0.006, div: 2, tile: 0.15, wear: false });
    K.addW(node, latch, M.gunmetal, 'chest_panel_latch');
    // "Nick", scratched into the inside of the door by a child; it reads when the door is open
    {
      const w = 0.042, hgt = w * 224 / 512, uc = (HATCH.u0 + HATCH.u1) / 2 + 0.002, yc = (HATCH.y0 + HATCH.y1) / 2 - 0.002;
      const pg = new THREE.PlaneGeometry(w, hgt, 14, 3).rotateY(PI).translate(uc, yc, 0);
      const p = pg.attributes.position, nA = pg.attributes.normal;
      for (let i = 0; i < p.count; i++) { const f = fr(p.getX(i), p.getY(i)), q = addv(f.P, f.N, f.L - 0.0003); p.setXYZ(i, q[0], q[1], q[2]); nA.setXYZ(i, -f.n[0], -f.n[1], -f.n[2]); }
      K.addW(node, pg, M.nick, 'nick_scratch', { cast: false });
    }
    // the cavity behind the door: a dark well with a small memory module and its lead
    {
      const wellFr = framer(CORE, () => 0, false), W = (u, y, h) => { const f = wellFr(u, y); return addv(f.P, f.N, h); };
      const out = [], depth = -0.02, c = contour(K.rect(cavity.u0, cavity.u1, cavity.y0, cavity.y1, 0.01), 0.008);
      if (area2(c) < 0) c.reverse();
      const quad = (a, b, cc, d) => { out.push(a, b, cc, a, cc, d); };
      const mt = miters(c);
      for (let i = 0; i < c.length; i++) {
        const j = (i + 1) % c.length, a = c[i], b = c[j], fa = [a[0] - mt[i][0] * 0.018, a[1] - mt[i][1] * 0.018], fb = [b[0] - mt[j][0] * 0.018, b[1] - mt[j][1] * 0.018];
        quad(W(a[0], a[1], depth), W(b[0], b[1], depth), W(b[0], b[1], 0.0006), W(a[0], a[1], 0.0006));       // wall
        quad(W(a[0], a[1], 0.0006), W(b[0], b[1], 0.0006), W(fb[0], fb[1], 0.0006), W(fa[0], fa[1], 0.0006));  // flange under the pec
      }
      const fl = new THREE.ShapeGeometry(new THREE.Shape(c.map((q) => new THREE.Vector2(q[0], q[1]))));
      const fp = fl.attributes.position, fi = fl.index.array;
      for (let i = 0; i < fi.length; i += 3) for (let k = 0; k < 3; k++) out.push(W(fp.getX(fi[i + k]), fp.getY(fi[i + k]), depth));
      const pa = new Float32Array(out.length * 3); out.forEach((q, i) => pa.set(q, i * 3));
      // every face looks out of the well (toward someone looking in)
      const eye = W((cavity.u0 + cavity.u1) / 2, (cavity.y0 + cavity.y1) / 2, 0.02);
      for (let i = 0; i < pa.length; i += 9) {
        const a = [pa[i], pa[i + 1], pa[i + 2]], b = [pa[i + 3], pa[i + 4], pa[i + 5]], cc = [pa[i + 6], pa[i + 7], pa[i + 8]], gN = crs(sub(b, a), sub(cc, a));
        const m3 = [(a[0] + b[0] + cc[0]) / 3, (a[1] + b[1] + cc[1]) / 3, (a[2] + b[2] + cc[2]) / 3];
        if (dot(gN, sub(eye, m3)) < 0) for (let k = 0; k < 3; k++) { const t2 = pa[i + 3 + k]; pa[i + 3 + k] = pa[i + 6 + k]; pa[i + 6 + k] = t2; }
      }
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(pa, 3));
      K.addW('upper_chest', K.creased(wg, 50), M.inner, 'chest_cavity');
      // memory module: a finned block on two screws, a braided lead into the well wall
      const mu = (cavity.u0 + cavity.u1) / 2 - 0.004, my = (cavity.y0 + cavity.y1) / 2;
      const mod = skin(CORE, K.rect(mu - 0.022, mu + 0.022, my - 0.02, my + 0.02, 0.005), { t: 0.011, bevel: 0.0022, segs: 2, lift: depth, seed: 65, grid: 0.016, maxSeg: 0.014, div: 3, tile: 0.15, wear: false });
      const fins = []; for (let k = 0; k < 4; k++) { const y = my - 0.012 + k * 0.008; fins.push(skin(CORE, K.rect(mu - 0.014, mu + 0.016, y - 0.0018, y + 0.0018, 0.0012), { t: 0.003, bevel: 0.001, segs: 1, margin: 0, lift: depth + 0.011, seed: 66 + k, grid: 0.03, maxSeg: 0.014, div: 2, tile: 0.15, wear: false })); }
      K.addW('upper_chest', K.merge([mod, ...fins]), M.gunmetal, 'chest_memory_module');
      for (const [u, y] of [[mu - 0.017, my + 0.015], [mu + 0.017, my - 0.015]]) { const q = mod.userData.surf(u, y); screwsAll.upper_chest.push(hex(0.0028, q.p, q.n)); }
      const led = skin(CORE, K.rect(mu + 0.016, mu + 0.019, my + 0.013, my + 0.016, 0.0008), { t: 0.0014, bevel: 0.0005, segs: 1, margin: 0, lift: depth + 0.011, seed: 70, grid: 0.01, maxSeg: 0.004, div: 2, wear: false });
      K.addW('upper_chest', led, M.rim, 'chest_status_led', { cast: false });
      const cp = [[mu - 0.022, my - 0.006, depth + 0.006], [mu - 0.03, my - 0.012, depth + 0.008], [cavity.u0 + 0.004, my - 0.022, depth + 0.006], [cavity.u0 + 0.0005, my - 0.03, depth + 0.004]].map(([u, y, h]) => v3(W(u, y, h)));
      cablesAll.upper_chest.push(K.cable(cp, 0.0024, { seg: 7 }));
      ferrAll.upper_chest.push(ferrules(cp, 0.0026, 0.007));
    }
    K.hooks.chestPanel = (u) => { node.quaternion.setFromAxisAngle(axis, -K.deg(106) * K.clamp01(u)); };
    K.hooks.chestPanel(0);
    const tgt = v3(face((HATCH.u0 + HATCH.u1) / 2, (HATCH.y0 + HATCH.y1) / 2));
    K.hooks.chestView = { pos: [tgt.x + 0.34, tgt.y + 0.07, tgt.z + 0.3], target: [tgt.x + 0.01, tgt.y - 0.004, tgt.z + 0.03] };
  }

  /* ================================================================ Nullfield emitters */
  {
    const e = D.emitter;
    const hp = [[-0.034, 0.038], [-0.016, 0.0418], [-0.009, 0.0412], [-0.004, 0.0398], [-0.001, 0.0388], [0.0012, 0.0362], [0.0094, 0.0352], [0.0094, 0.029], [0.0102, 0.0279], [0.0102, 0.0]];
    const housing = gm(K.creased(K.latheY(hp, 36), 48).rotateX(PI / 2));
    const bezel = K.creased(K.latheY([[0.0092, 0.0358], [0.0112, 0.0356], [0.0124, 0.0342], [0.0129, 0.0316], [0.0126, 0.0296], [0.0112, 0.0288], [0.0098, 0.0292], [0.0092, 0.0358]], 36), 40).rotateX(PI / 2);
    const glow = K.discUV(new THREE.CircleGeometry(0.0279, 44), V3(0, 0, 1), 0.0279).translate(0, 0, 0.0106);
    const rim = new THREE.TorusGeometry(0.0284, 0.00145, 5, 40).translate(0, 0, 0.011);
    for (const s of [1, -1]) {
      const side = s > 0 ? 'l' : 'r', n = V3(s * e.normal[0], e.normal[1], e.normal[2]).normalize(), C = V3(s * e.x, e.y, e.z);
      const node = new THREE.Group(); node.name = `emitter_${side}`; node.position.copy(C).sub(J.upper_chest);
      node.quaternion.setFromUnitVectors(V3(0, 0, 1), n); K.bones.upper_chest.add(node);
      K.add(node, housing.clone(), M.gunmetal, `emitter_${side}_housing`);
      K.add(node, bezel.clone(), M.iron, `emitter_${side}_bezel`, { wear: { k: 90 } });
      K.add(node, glow.clone(), M.field, `emitter_${side}_glow`, { cast: false });
      K.add(node, rim.clone(), M.fieldRim, `emitter_${side}_rim`, { cast: false });
      const bolts = []; for (let i = 0; i < 5; i++) { const a = (i + 0.3) / 5 * PI * 2, rr = V3(Math.cos(a), Math.sin(a), 0); bolts.push(hex(0.0034, rr.clone().multiplyScalar(0.0407).add(V3(0, 0, -0.0055)), rr.clone().multiplyScalar(0.95).add(V3(0, 0, 0.3)))); }
      K.add(node, K.merge(bolts), M.rivet, `emitter_${side}_bolts`, { cast: false });
      // power lead from the housing into the spine column
      const sf = (s > 0 ? scL : scR).userData;
      const md = V3(-s, -0.25, 0); md.addScaledVector(n, -md.dot(n)).normalize();
      const p0 = C.clone().addScaledVector(md, 0.04).addScaledVector(n, -0.009), p1 = C.clone().addScaledVector(md, 0.052).addScaledVector(n, -0.014);
      const path = [p0, p1, sf.surf(s * 0.052, 1.458, sf.t + 0.0045).p, sf.surf(s * 0.026, 1.452, sf.t + 0.004).p, onBack(s * 0.011, 1.449, 0.006)];
      cablesAll.upper_chest.push(K.cableBundle(path, { n: 2, r: 0.0024, twist: 9, seg: 6 }));
      ferrAll.upper_chest.push(ferrules(path, 0.0052, 0.01));
    }
  }

  /* ================================================================ power cell, stainless shroud */
  {
    const c = D.cell, C = V3(0, c.y, c.z), at = (g) => g.translate(C.x, C.y, C.z);
    K.addW('spine', at(new THREE.CylinderGeometry(0.0285, 0.0285, 0.088, 36, 1, true)), M.core, 'cell_core', { cast: false });
    K.addW('spine', at(K.merge([new THREE.TorusGeometry(0.0293, 0.0017, 5, 32).rotateX(PI / 2).translate(0, 0.036, 0), new THREE.TorusGeometry(0.0293, 0.0017, 5, 32).rotateX(PI / 2).translate(0, -0.036, 0)])), M.rim, 'cell_rim', { cast: false });
    // the shroud: two collars, six brushed staves with glowing slots between, domed end caps
    const band = (y0, y1) => K.latheY([[y0, 0.0318], [y0, 0.0352], [y0 + 0.0015, 0.0372], [y0 + 0.004, 0.0378], [y1 - 0.004, 0.0378], [y1 - 0.0015, 0.0372], [y1, 0.0352], [y1, 0.0318], [y0, 0.0318]], 40);
    const RC = 0.0322, CYL = surface([[-0.07, RC, RC, -RC, 2, 0], [0.07, RC, RC, -RC, 2, 0]]), staves = [];
    for (let i = 0; i < 6; i++) {
      const uc = (i < 3 ? 1 : -1) * (PI / 6 + (i % 3) * PI / 3) * RC;
      staves.push(skin(CYL, K.rect(uc - 0.0148, uc + 0.0148, -0.036, 0.036, 0.0022), { t: 0.0034, bevel: 0.0012, segs: 1, margin: 0, grid: 0.014, maxSeg: 0.012, div: 3, tile: 0.12, wear: false, seed: 95 + i }));
    }
    const capTop = K.latheY([[0.048, 0.0378], [0.0505, 0.0376], [0.053, 0.0352], [0.0565, 0.03], [0.059, 0.0215], [0.0598, 0.013], [0.0598, 0.0]], 40);
    const capBot = K.latheY([[-0.0598, 0.0], [-0.0598, 0.013], [-0.059, 0.0215], [-0.0565, 0.03], [-0.053, 0.0352], [-0.0505, 0.0376], [-0.048, 0.0378]], 40);
    const shroud = K.merge([K.creased(band(-0.05, -0.034), 40), K.creased(band(0.034, 0.05), 40), ...staves, K.creased(capTop, 40), K.creased(capBot, 40)].map((g) => K.boxUV(g, 0.12)));
    // brushed grain runs around the cylinder: UVs by angle
    {
      const p = shroud.attributes.position, uv = shroud.attributes.uv;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); uv.setXY(i, (Math.atan2(z, x) + PI) * 0.035 / 0.12, (y + Math.hypot(x, z) * 0.6) / 0.12 * 4); }
    }
    K.addW('spine', at(shroud), M.stainless, 'cell_shroud');
    // straps hold it into the channel between the lumbar plates
    const straps = [], ears = [];
    for (const y of [-0.042, 0.042]) {
      straps.push(at(gm(K.creased(K.latheY([[y - 0.0045, 0.0376], [y - 0.0045, 0.0402], [y - 0.0035, 0.0412], [y + 0.0035, 0.0412], [y + 0.0045, 0.0402], [y + 0.0045, 0.0376]], 36), 40))));
      for (const s of [1, -1]) {
        const f = (s > 0 ? lbL : lbR).userData, yy = C.y + y, uE = s * 0.052;
        const ear = skin(CORE, K.rect(uE - 0.015, uE + 0.015, yy - 0.0045, yy + 0.0045, 0.003), { t: 0.004, bevel: 0.0013, segs: 1, margin: 0, back: true, lift: (u, y2) => lumLift(u, y2) + f.t, seed: 90, grid: 0.03, maxSeg: 0.01, div: 3, tile: 0.15, wear: false });
        ears.push(ear);
        const q = ear.userData.surf(s * 0.058, yy); screwsAll.spine.push(hex(0.0036, q.p, q.n));
      }
    }
    K.addW('spine', K.merge([...straps, ...ears]), M.gunmetal, 'cell_straps');
    // saddle in the channel and the terminal on top
    const saddle = skin(CORE, K.rect(-0.031, 0.031, 1.084, 1.214, 0.006), { t: 0.006, bevel: 0.002, segs: 2, back: true, lift: 0.0005, seed: 92, grid: 0.024, div: 3, tile: 0.15, wear: false });
    const term = at(gm(K.latheY([[0.0596, 0.0125], [0.0632, 0.0122], [0.0655, 0.0105], [0.0668, 0.006], [0.067, 0.0]], 24)));
    const outlets = []; for (const s of [1, -1]) outlets.push(gm(K.orient(new THREE.CylinderGeometry(0.0042, 0.005, 0.012, 14), V3(0, 1, 0), V3(s * 0.25, 0.6, 0.75)).translate(C.x + s * 0.012, C.y + 0.0605, C.z + 0.014)));
    K.addW('spine', K.merge([saddle, term, ...outlets]), M.gunmetal, 'cell_mount');
    for (const [u, y] of [[0.022, 1.093], [-0.022, 1.093], [0.022, 1.205], [-0.022, 1.205]]) { const q = saddle.userData.surf(u, y); screwsAll.spine.push(hex(0.0034, q.p, q.n)); }
    // leads from the cell up into the spine column
    for (const s of [1, -1]) {
      const path = [V3(C.x + s * 0.0135, C.y + 0.0645, C.z + 0.018), V3(C.x + s * 0.0125, C.y + 0.071, C.z + 0.025), onBack(s * 0.0088, 1.228, 0.007), onBack(s * 0.0088, 1.238, 0.0042)];
      cablesAll.spine.push(K.cable(path, 0.0033, { seg: 7 }));
      ferrAll.spine.push(ferrules(path, 0.0034, 0.008));
    }
  }

  /* ================================================================ merged small parts per bone */
  for (const b of BONES) {
    if (rivetsAll[b].length) K.addW(b, K.merge(rivetsAll[b]), M.rivet, `${b}_rivets`, { cast: false });
    if (screwsAll[b].length) K.addW(b, K.merge(screwsAll[b]), M.rivet, `${b}_screws`, { cast: false });
    if (weldsAll[b].length) K.addW(b, K.merge(weldsAll[b]), M.weld, `${b}_welds`, { cast: false });
    if (cablesAll[b].length) K.addW(b, K.merge(cablesAll[b]), M.cable, `${b}_cables`);
    if (ferrAll[b].length) K.addW(b, K.merge(ferrAll[b]), M.gunmetal, `${b}_cable_ferrules`);
  }
};
