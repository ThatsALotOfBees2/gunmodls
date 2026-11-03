/* ------------------------------------------------------------------ helpers */

// Monotone cubic interpolation through [x, y] points (no overshoot).
function curve(pts) {
  const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return x => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
const constant = v => () => v;

// Loft a superellipse cross-section along X. top/bot/hw/n are functions of x.
// round: radius used to roll the edges at both ends; caps are flat.
function loft({ x0, x1, top, bot, hw, n = constant(2.6), cy = null, steps = 160, seg = 72, round = 0, roundStart = round, roundEnd = round, groove = null }) {
  const xs = [];
  // denser stations near the ends so the rolled edges stay smooth
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
    xs.push(x0 + (x1 - x0) * (0.55 * u + 0.45 * e));
  }
  const pos = [], idx = [];
  const ring = (x) => {
    let T = top(x), B = bot(x), W = hw(x);
    const ds = x - x0, de = x1 - x;
    let inset = 0;
    if (roundStart > 0 && ds < roundStart) inset = Math.max(inset, roundStart - Math.sqrt(Math.max(0, roundStart * roundStart - (roundStart - ds) ** 2)));
    if (roundEnd > 0 && de < roundEnd) inset = Math.max(inset, roundEnd - Math.sqrt(Math.max(0, roundEnd * roundEnd - (roundEnd - de) ** 2)));
    let gB = 0, gW = 0;
    if (groove) { const g = groove(x); gB = g; gW = g; }
    T -= inset; B += inset + gB; W -= inset + gW;
    // a rounding radius larger than the section must not turn the ring inside out
    W = Math.max(0.002, W);
    const c = cy ? cy(x) : (T + B) / 2, ry = Math.max(0.001, (T - B) / 2);
    const e = 2 / n(x), out = [];
    for (let j = 0; j < seg; j++) {
      const t = (j / seg) * Math.PI * 2, co = Math.cos(t), si = Math.sin(t);
      const z = W * Math.sign(co) * Math.pow(Math.abs(co), e);
      const y = c + ry * Math.sign(si) * Math.pow(Math.abs(si), e);
      out.push([x, y, z]);
    }
    return out;
  };
  const rings = xs.map(ring);
  rings.forEach(r => r.forEach(p => pos.push(...p)));
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + (j + 1) % seg, c = (i + 1) * seg + j, d = (i + 1) * seg + (j + 1) % seg;
      idx.push(a, c, b, b, c, d);
    }
  }
  // flat caps with their own vertices
  const capAt = (r, flip) => {
    const base = pos.length / 3;
    const cx = r.reduce((s, p) => s + p[1], 0) / r.length;
    pos.push(r[0][0], cx, 0);
    r.forEach(p => pos.push(...p));
    for (let j = 0; j < seg; j++) {
      const a = base + 1 + j, b = base + 1 + (j + 1) % seg;
      flip ? idx.push(base, a, b) : idx.push(base, b, a);
    }
  };
  // caps face outward: -x at the start, +x at the end
  capAt(rings[0], true);
  capAt(rings[rings.length - 1], false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Polygon with per-corner radius: pts = [[x, y, r], ...]
function roundedShape(pts, shape = new THREE.Shape()) {
  const n = pts.length;
  const P = pts.map(p => new THREE.Vector2(p[0], p[1]));
  for (let i = 0; i < n; i++) {
    const prev = P[(i - 1 + n) % n], cur = P[i], next = P[(i + 1) % n], r = pts[i][2] || 0;
    const v1 = prev.clone().sub(cur), v2 = next.clone().sub(cur);
    const l1 = v1.length(), l2 = v2.length();
    const rr = Math.min(r, l1 / 2.05, l2 / 2.05);
    const a = cur.clone().add(v1.normalize().multiplyScalar(rr));
    const b = cur.clone().add(v2.normalize().multiplyScalar(rr));
    if (i === 0) shape.moveTo(a.x, a.y); else shape.lineTo(a.x, a.y);
    if (rr > 0) shape.quadraticCurveTo(cur.x, cur.y, b.x, b.y);
  }
  shape.closePath();
  return shape;
}
function roundedPath(pts) { return roundedShape(pts, new THREE.Path()); }

// Extrude a side-profile shape (in the XY plane) across Z, centred on zc.
function slab(shape, width, { bevel = 0.04, segs = 3, zc = 0, curveSegments = 24 } = {}) {
  const depth = Math.max(0.001, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: segs, curveSegments,
  });
  g.translate(0, 0, zc - depth / 2);
  return g;
}

// Lathe around the X axis. pts = [[x, r], ...]
function latheX(pts, seg = 64) {
  const g = new THREE.LatheGeometry(pts.map(([x, r]) => new THREE.Vector2(r, x)), seg);
  g.rotateZ(-Math.PI / 2);
  g.scale(1, 1, 1);
  // after rotateZ(-90deg) the lathe axis (y) maps to +x
  return g;
}

function clean(g) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
function creased(g, angle = 34) { return toCreasedNormals(clean(g), THREE.MathUtils.degToRad(angle)); }

const evaluator = new Evaluator();
evaluator.attributes = ['position', 'normal'];
evaluator.useGroups = false;
// Cutters passed together must not overlap each other (they are merged into one brush).
function subtract(base, ...cutters) {
  let a = new Brush(clean(base)); a.updateMatrixWorld();
  const cut = new Brush(mergeGeometries(cutters.map(clean))); cut.updateMatrixWorld();
  const r = evaluator.evaluate(a, cut, SUBTRACTION);
  return r.geometry;
}
// For cutters that overlap, subtract them one after another.
function subtractEach(base, ...cutters) {
  let g = base;
  for (const c of cutters) g = subtract(g, c);
  return g;
}
function box(x0, x1, y0, y1, z0, z1) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

