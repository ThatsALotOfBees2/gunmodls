/* ================================================================== PARTS.floor_3 */
// Interior architecture of F3 (98F Broadcast): S1 control room and render farm, the grid over the studio, edit rooms,
// podcast and newsroom, executive office and boardroom, the sky suite, screening room, archive and writers room.
// No furniture: finishes, built-in fixtures and lights only. Layout props that are not built-in become empty PROP_<id>
// markers (the furniture pack goes there). No logos and no readable text anywhere: screens carry abstract graphics only.
PARTS.floor_3 = function (K) {
  const FID = 'F3';
  // ---- shared dressing kit (same kit as floor_1.js and floor_2.js) ----
  const T = K.THREE, Y = K.FY(FID), CE = K.CEIL, FAST = K.fast, PI = Math.PI;
  const RN = K.rng(1203);
  const LOG = ((window.__dress = window.__dress || {})[FID] = { skipped: [], placed: 0 });
  // materials built on the engine's texture sets (every non-emissive one carries real maps)
  function mat(key, tex, o = {}) {
    if (K.M[key]) return key;
    const t = K.TX[tex] || {}, p = { color: o.color || '#ffffff', roughness: o.rough ?? 0.6, metalness: o.metal ?? 0 };
    if (t.map) p.map = t.map;
    if (t.normal && o.nrm !== false) p.normalMap = t.normal;
    if (o.em) { p.emissive = new T.Color(o.em); p.emissiveIntensity = o.ei ?? 1; if (t.map && o.emMap !== false) p.emissiveMap = t.map; }
    if (o.opacity != null) { p.transparent = true; p.opacity = o.opacity; p.depthWrite = false; }
    if (o.side) p.side = o.side;
    const m = new T.MeshStandardMaterial(p); m.name = key;
    if (p.normalMap) m.normalScale.set(o.ns ?? 0.6, o.ns ?? 0.6);
    K.material(key, m, { tile: o.tile || 1, env: o.env || 'in' });
    return key;
  }
  // emissive screen material from a painted canvas (abstract shapes only, never text)
  function screenMat(key, paint, o = {}) {
    if (K.M[key]) return key;
    const c = paint(), t = K.asTex(c, true, key);
    const m = new T.MeshStandardMaterial({ color: '#000000', map: t, emissive: new T.Color('#ffffff'), emissiveMap: t, emissiveIntensity: o.ei ?? 1.3, roughness: 0.25 });
    m.name = key; K.material(key, m, { tile: 1, env: 'in' });
    return key;
  }
  const paintAbstract = (seed, hue, bg) => () => K.abstractCanvas(seed, 512, 512, { hue, bg });
  // equaliser bars and soft waves (noraebang, studio monitors)
  const paintBars = (seed, h0, h1) => () => {
    const c = K.canvas(512, 256), x = c.getContext('2d'), R = K.rng(seed);
    const g = x.createLinearGradient(0, 0, 512, 256); g.addColorStop(0, `hsl(${h0},70%,7%)`); g.addColorStop(1, `hsl(${h1},70%,12%)`); x.fillStyle = g; x.fillRect(0, 0, 512, 256);
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) { x.strokeStyle = `hsla(${h0 + R() * (h1 - h0)},90%,60%,0.35)`; x.lineWidth = 3 + R() * 6; x.beginPath(); for (let k = 0; k <= 64; k++) { const xx = k * 8, yy = 128 + Math.sin(k * (0.15 + R() * 0.02) + i) * (30 + i * 12); k ? x.lineTo(xx, yy) : x.moveTo(xx, yy); } x.stroke(); }
    for (let i = 0; i < 32; i++) { const hh = 20 + R() * 150, hue = h0 + (i / 32) * (h1 - h0); for (let s = 0; s < hh; s += 9) { x.fillStyle = `hsla(${hue},95%,${55 + s / 8}%,0.8)`; x.fillRect(10 + i * 15.6, 240 - s, 11, 6); } }
    x.globalCompositeOperation = 'source-over'; x.fillStyle = 'rgba(0,0,0,0.2)'; for (let y = 0; y < 256; y += 3) x.fillRect(0, y, 512, 1);
    return c;
  };
  // a mosaic of abstract camera feeds (blobs and outlines, no text)
  const paintFeeds = (seed) => () => {
    const c = K.canvas(512, 512), x = c.getContext('2d'), R = K.rng(seed);
    x.fillStyle = '#05060a'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const x0 = i * 128 + 4, y0 = j * 128 + 4, hue = R() < 0.5 ? 200 : 268;
      const g = x.createLinearGradient(x0, y0, x0, y0 + 120); g.addColorStop(0, `hsl(${hue},40%,${10 + R() * 14}%)`); g.addColorStop(1, `hsl(${hue + 20},30%,${4 + R() * 6}%)`); x.fillStyle = g; x.fillRect(x0, y0, 120, 120);
      x.strokeStyle = `hsla(${hue},80%,70%,0.5)`; x.lineWidth = 1.5; for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(x0 + R() * 120, y0 + 120); x.lineTo(x0 + 60 + (R() - 0.5) * 30, y0 + 40 + R() * 20); x.stroke(); }
      x.fillStyle = `hsla(${hue + 40},90%,75%,0.5)`; x.beginPath(); x.ellipse(x0 + 30 + R() * 60, y0 + 70 + R() * 30, 6 + R() * 8, 14 + R() * 10, 0, 0, PI * 2); x.fill();
      x.strokeStyle = 'rgba(255,80,60,0.7)'; x.strokeRect(x0 + 6, y0 + 6, 10, 10);
    }
    x.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < 512; y += 3) x.fillRect(0, y, 512, 1);
    return c;
  };
  // the dressing palette
  mat('dz_fab_indigo', 'carpet', { color: '#353c78', rough: 0.95, tile: 0.7, ns: 0.8 });
  mat('dz_lacquer', 'wood', { color: '#9a2e20', rough: 0.3, tile: 1.2, ns: 0.3 });
  mat('dz_wood_mid', 'wood', { color: '#9a6a44', rough: 0.55, tile: 1.2 });
  mat('dz_wood_black', 'wood', { color: '#2a1d17', rough: 0.4, tile: 1.2 });
  mat('dz_wood_ceil', 'wood', { color: '#3b2a20', rough: 0.7, tile: 1.6 });
  mat('dz_celadon', 'polished', { color: '#97c2a8', rough: 0.12, tile: 0.6, ns: 0.2 });
  mat('dz_foliage', 'carpet', { color: '#2a4a26', rough: 0.85, tile: 0.4, ns: 1.0 });
  mat('dz_pine', 'carpet', { color: '#4a7a42', rough: 0.85, tile: 0.35, ns: 1.0 });
  mat('dz_moss', 'carpet', { color: '#3c5a2a', rough: 0.95, tile: 0.5, ns: 1.0 });
  mat('dz_gravel', 'terrazzo', { color: '#8a857c', rough: 0.9, tile: 0.7, ns: 1.0 });
  mat('dz_rock', 'drystone', { color: '#6a655e', rough: 0.85, tile: 1.4, ns: 1.0 });
  mat('dz_steel', 'brushed', { color: '#b9bdc4', rough: 0.32, metal: 0.9, tile: 0.8, ns: 0.4 });
  mat('dz_tile', 'paver', { color: '#e6e3dc', rough: 0.25, tile: 0.6, ns: 0.4 });
  mat('dz_lamp', 'hanji', { color: '#fff4e2', rough: 0.8, tile: 0.6, em: '#ffc68a', ei: 1.5 });
  mat('dz_lamp_cool', 'hanji', { color: '#efeaff', rough: 0.8, tile: 0.6, em: '#b79cff', ei: 1.4 });
  mat('dz_salt', 'drystone', { color: '#f0b37a', rough: 0.6, tile: 0.6, em: '#ff9a4a', ei: 0.9 });
  mat('dz_underwater', 'water', { color: '#163a52', rough: 0.2, tile: 2, em: '#3d7dff', ei: 0.6 });
  mat('dz_white', 'plaster', { color: '#d9d6d0', rough: 0.4, tile: 1 });
  mat('dz_seam', 'led', { color: '#3a2a1a', rough: 0.4, em: '#ffad66', ei: 0.7, emMap: false });
  // deco bucket for free dressing: D('kind')(materialKey) -> GB in world space
  const D = (kind) => { const e = K.deco(FID, kind); return (mk) => e.gb(mk); };
  // boxes in absolute coordinates; y values passed relative to the floor (+Y)
  const B = (g, mk, x0, x1, y0, y1, z0, z1, skip = '') => K.abox(g(mk), Math.min(x0, x1), Math.max(x0, x1), Y + Math.min(y0, y1), Y + Math.max(y0, y1), Math.min(z0, z1), Math.max(z0, z1), skip);
  const BT = (g, side, top, x0, x1, y0, y1, z0, z1, skip = '') => K.abox({ x: g(side), y: g(top), z: g(side) }, Math.min(x0, x1), Math.max(x0, x1), Y + y0, Y + y1, Math.min(z0, z1), Math.max(z0, z1), skip);
  const C = (g, side, top, cx, cz, r, y0, y1, seg = 12, caps = true) => K.cylY({ side: g(side), top: g(top) }, cx, cz, r, Y + y0, Y + y1, seg, caps);
  const BM = (g, mk, a, b, w, h) => K.beam(g(mk), [a[0], Y + a[1], a[2]], [b[0], Y + b[1], b[2]], w, h);
  const MX = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => new T.Matrix4().compose(new T.Vector3(x, Y + y, z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), ry), new T.Vector3(sx, sy, sz));
  const GE = (g, mk, geo, m, keepUV = false) => g(mk).addGeo(geo, m, keepUV);
  // emissive screen plane: centre (y relative), size, facing plan direction [nx, nz]
  const PLANE = new T.PlaneGeometry(1, 1);
  function screen(g, mk, cx, cy, cz, w, h, n) {
    const m = K.frameZ([cx, Y + cy, cz], n); m.multiply(new T.Matrix4().makeScale(w, h, 1)); g(mk).addGeo(PLANE, m, true);
  }
  // keep-outs for free dressing: the engine's list plus 0.45 m off both faces of every reinforceable wall
  const RWALL = K.L.walls.filter((w) => w.floor === FID && w.type === 'reinforceable').map((w) => [Math.min(w.a[0], w.b[0]) - 0.45, Math.min(w.a[1], w.b[1]) - 0.45, Math.max(w.a[0], w.b[0]) + 0.45, Math.max(w.a[1], w.b[1]) + 0.45, w.id]);
  const COLS = K.L.columns.map((c) => [c.x - c.w / 2 - 0.05, c.z - c.w / 2 - 0.05, c.x + c.w / 2 + 0.05, c.z + c.w / 2 + 0.05, c.id]);
  const ov = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  // free floor dressing: plan box [x0, z0, x1, z1]; returns false (and logs) when it would block something
  function free(box, why) {
    const hits = K.check(FID, box).map((k) => k.why).concat(RWALL.filter((r) => ov(box, r)).map((r) => 'reinf ' + r[4]), COLS.filter((r) => ov(box, r)).map((r) => 'column ' + r[4]));
    if (hits.length) { LOG.skipped.push(why + ': ' + hits.join(', ')); return false; }
    LOG.placed++; return true;
  }
  // overhead dressing (above 2.3 m): only hatch and patch keep-outs matter
  function freeHigh(box, why) {
    const hits = K.check(FID, box).filter((k) => /hatch|patch/.test(k.why)).map((k) => k.why);
    if (hits.length) { LOG.skipped.push(why + ': ' + hits.join(', ')); return false; }
    LOG.placed++; return true;
  }
  const dress = (id, fn) => { if (!K.prop(id)) { K.warn('missing prop ' + id); return; } K.dressProp(id, fn); };
  // hanji lantern: a glowing paper box with a dark wood frame, centre x z, base y, size w, height h
  function lantern(g, x, z, y0, w, h, lamp = 'dz_lamp', frame = 'wood_dark') {
    B(g, lamp, x - w / 2 + 0.02, x + w / 2 - 0.02, y0 + 0.03, y0 + h - 0.03, z - w / 2 + 0.02, z + w / 2 - 0.02);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(g, frame, x + a * w / 2 - (a > 0 ? 0.035 : 0), x + a * w / 2 + (a < 0 ? 0.035 : 0), y0, y0 + h, z + b * w / 2 - (b > 0 ? 0.035 : 0), z + b * w / 2 + (b < 0 ? 0.035 : 0));
    B(g, frame, x - w / 2, x + w / 2, y0 + h - 0.03, y0 + h, z - w / 2, z + w / 2); B(g, frame, x - w / 2, x + w / 2, y0, y0 + 0.03, z - w / 2, z + w / 2);
  }
  // pendant: cord from the ceiling and a hanji drum
  function pendant(g, x, z, y1, r = 0.22, h = 0.34, lamp = 'dz_lamp') { C(g, 'black', 'black', x, z, 0.006, y1, CE, 4, false); C(g, lamp, lamp, x, z, r, y1 - h, y1, 14); C(g, 'wood_dark', 'wood_dark', x, z, r + 0.01, y1 - 0.02, y1, 14); }
  // changsal lattice panel in the plane x0..x1 (z fixed) or z0..z1 (x fixed): frame plus a grid of thin bars
  function lattice(g, along, a0, a1, c, y0, y1, t = 0.05, cell = 0.22, mk = 'wood', back = null) {
    const bx = (u0, u1, v0, v1, w0, w1) => along === 'x' ? B(g, mk, u0, u1, v0, v1, c + w0, c + w1) : B(g, mk, c + w0, c + w1, v0, v1, u0, u1);
    const f = 0.06;
    bx(a0, a0 + f, y0, y1, -t, t); bx(a1 - f, a1, y0, y1, -t, t); bx(a0, a1, y0, y0 + f, -t, t); bx(a0, a1, y1 - f, y1, -t, t);
    const nu = Math.max(1, Math.round((a1 - a0) / cell)), nv = Math.max(1, Math.round((y1 - y0) / cell));
    for (let k = 1; k < nu; k++) { const u = a0 + ((a1 - a0) * k) / nu; bx(u - 0.012, u + 0.012, y0 + f, y1 - f, -t * 0.6, t * 0.6); }
    for (let k = 1; k < nv; k++) { const v = y0 + ((y1 - y0) * k) / nv; bx(a0 + f, a1 - f, v - 0.012, v + 0.012, -t * 0.5, t * 0.5); }
    if (back) { if (along === 'x') B(g, back, a0 + f, a1 - f, y0 + f, y1 - f, c - 0.008, c + 0.008); else B(g, back, c - 0.008, c + 0.008, y0 + f, y1 - f, a0 + f, a1 - f); }
  }
  // shrub / plant mass from a few squashed icosahedra
  const ICO = new T.IcosahedronGeometry(1, 1), ICO0 = new T.IcosahedronGeometry(1, 0);
  function shrub(g, x, z, y0, r, h, mk = 'dz_foliage', n = 4, seed = 1) {
    const R = K.rng(seed);
    for (let k = 0; k < n; k++) { const a = R() * PI * 2, d = R() * r * 0.5; GE(g, mk, FAST ? ICO0 : ICO, MX(x + Math.cos(a) * d, y0 + h * (0.35 + R() * 0.3), z + Math.sin(a) * d, R() * 3, r * (0.55 + R() * 0.3), h * (0.35 + R() * 0.2), r * (0.55 + R() * 0.3))); }
  }
  // a sculpted pine: leaning trunk and flat cloud pads
  function pine(g, x, z, y0, h, seed = 3, lean = [0.5, 0.2]) {
    const R = K.rng(seed); let p = [x, y0, z];
    for (let k = 0; k < 4; k++) { const q = [p[0] + lean[0] * (0.25 + R() * 0.2), p[1] + h / 4.6, p[2] + lean[1] * (0.25 + R() * 0.2)]; BM(g, 'dz_wood_black', p, q, 0.16 - k * 0.025); p = q; }
    for (let k = 0; k < 6; k++) { const yy = y0 + h * (0.5 + k * 0.085), a = R() * PI * 2, d = 0.25 + R() * 0.45, px = p[0] + Math.cos(a) * d - lean[0] * (1 - k * 0.2), pz = p[2] + Math.sin(a) * d;
      for (let j = 0; j < 3; j++) GE(g, 'dz_pine', ICO0, MX(px + (R() - 0.5) * 0.4, yy + (k === 5 ? 0.1 : 0), pz + (R() - 0.5) * 0.4, R() * 3, 0.16 + R() * 0.1, 0.09, 0.14 + R() * 0.08)); }
  }
  // wall-hung abstract screen with a dark bezel; n = facing
  function wallScreen(g, mk, cx, cy, cz, w, h, n, bezel = 'black') {
    const d = 0.05, X = Math.abs(n[0]) > 0.5;
    if (X) B(g, bezel, cx - n[0] * d, cx, cy - h / 2 - 0.03, cy + h / 2 + 0.03, cz - w / 2 - 0.03, cz + w / 2 + 0.03);
    else B(g, bezel, cx - w / 2 - 0.03, cx + w / 2 + 0.03, cy - h / 2 - 0.03, cy + h / 2 + 0.03, cz - n[1] * d, cz);
    screen(g, mk, cx + n[0] * 0.004, cy, cz + n[1] * 0.004, w, h, n);
  }
  // flat polygon disc facing plan direction n (bottle ends, lenses): seg vertices, one face
  function disc(g, mk, cx, cy, cz, r, n, seg = 8) {
    const t = [-n[1], 0, n[0]], pts = [];
    for (let k = 0; k < seg; k++) { const a = (k / seg) * PI * 2, u = Math.cos(a) * r, v = Math.sin(a) * r; pts.push([cx + t[0] * u, Y + cy + v, cz + t[2] * u]); }
    g(mk).face(pts, [n[0], 0, n[1]]);
  }
  // steam / haze sprites (viewer only, slow drift)
  function haze(list, color = '#ffffff', op = 0.12) {
    if (FAST) return;
    const c = K.canvas(128, 128), x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    const tex = new T.CanvasTexture(c), grp = new T.Group(); grp.name = 'haze_' + FID;
    for (const [px, py, pz, s] of list) { const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, color, transparent: true, opacity: op, depthWrite: false })); sp.position.set(px, Y + py, pz); sp.scale.set(s, s, s); sp.userData.b = [px, py, pz, RN() * 6]; grp.add(sp); }
    K.view(grp, 'fx', FID);
    K.onTick((dt, t) => { for (const sp of grp.children) { const b = sp.userData.b; sp.position.y = Y + b[1] + ((t * 0.12 + b[3]) % 1.2); sp.material.opacity = op * (1 - ((t * 0.12 + b[3]) % 1.2) / 1.2); } });
  }
  // ---- architecture kit: wall faces, skirtings, coves, prop markers ----
  // a face of a layout wall: side +1 is the +n side (side_pos room), -1 the other
  function face(id, side) {
    const w = K.wall(id); if (!w) { K.warn('missing wall ' + id); return null; }
    const F = K.wallFrame(w); return { w, F, side, s: (side * F.t) / 2, room: side > 0 ? w.side_pos : w.side_neg };
  }
  // u ranges of the openings on a wall, padded
  const holesOf = (w, pad = 0.05) => (w.openings || []).map((o) => [o.u0 - pad, o.u1 + pad]);
  const hitsHole = (fc, u0, u1) => holesOf(fc.w).some(([a, b]) => u0 < b && u1 > a);
  // box on a wall face: u along the wall, y relative to the floor, d0..d1 out from the face
  function fbox(g, mk, fc, u0, u1, y0, y1, d0, d1, skip = '') {
    const s0 = fc.s + fc.side * d0, s1 = fc.s + fc.side * d1;
    K.wbox(g(mk), fc.F, u0, u1, y0, y1, Math.min(s0, s1), Math.max(s0, s1), skip);
  }
  // emissive plane on a wall face (abstract graphics only)
  function fscreen(g, mk, fc, u, y, w, h, d = 0.006) {
    const p = K.wp(fc.F, u, y, fc.s + fc.side * d), m = K.frameZ(p, [fc.F.n[0] * fc.side, fc.F.n[2] * fc.side]);
    m.multiply(new T.Matrix4().makeScale(w, h, 1)); g(mk).addGeo(PLANE, m, true);
  }
  // changsal lattice panelling on a wall face with a glowing hanji back
  function flattice(g, fc, u0, u1, y0, y1, o = {}) {
    if (hitsHole(fc, u0, u1)) { LOG.skipped.push('lattice on ' + fc.w.id + ': opening'); return false; }
    const mk = o.mk || 'wood_dark', back = o.back === undefined ? 'dz_lamp' : o.back, cell = o.cell || 0.22, d = o.d || 0.05, f = 0.06;
    if (back) fbox(g, back, fc, u0 + f, u1 - f, y0 + f, y1 - f, 0.0, 0.012);
    fbox(g, mk, fc, u0, u0 + f, y0, y1, 0, d); fbox(g, mk, fc, u1 - f, u1, y0, y1, 0, d);
    fbox(g, mk, fc, u0, u1, y0, y0 + f, 0, d); fbox(g, mk, fc, u0, u1, y1 - f, y1, 0, d);
    const nu = Math.max(1, Math.round((u1 - u0) / cell)), nv = Math.max(1, Math.round((y1 - y0) / cell));
    for (let k = 1; k < nu; k++) { const u = u0 + ((u1 - u0) * k) / nu; fbox(g, mk, fc, u - 0.012, u + 0.012, y0 + f, y1 - f, 0.012, d * 0.8); }
    for (let k = 1; k < nv; k++) { const v = y0 + ((y1 - y0) * k) / nv; fbox(g, mk, fc, u0 + f, u1 - f, v - 0.012, v + 0.012, 0.012, d * 0.7); }
    LOG.placed++; return true;
  }
  // vertical timber slat panelling (built-in), optional glow reveal behind the slats
  function fslats(g, fc, u0, u1, y0, y1, o = {}) {
    if (hitsHole(fc, u0, u1)) { LOG.skipped.push('slats on ' + fc.w.id + ': opening'); return false; }
    const mk = o.mk || 'wood', pitch = o.pitch || 0.12, sw = o.sw || 0.06;
    fbox(g, o.back || 'dz_wood_black', fc, u0, u1, y0, y1, 0, 0.01);
    if (o.glow) fbox(g, o.glow, fc, u0 + 0.05, u1 - 0.05, y1 - 0.06, y1 - 0.04, 0.01, 0.014);
    for (let u = u0 + 0.02; u + sw <= u1 - 0.02; u += pitch) fbox(g, mk, fc, u, u + sw, y0, y1, 0.01, 0.045);
    LOG.placed++; return true;
  }
  // skirtings on the hard wall faces of this floor; corridors also get a low purple wayfinding strip
  const SKIRT = (fin) => (/wood|carpet/.test(fin) ? 'wood_dark' : /stone|terrazzo/.test(fin) ? 'stone_dark' : /epoxy|concrete/.test(fin) ? 'rubber' : 'steel_dark');
  function skirtings(finishOf) {
    const g = D('skirting');
    for (const w of K.L.walls) {
      if (w.floor !== FID || w.type !== 'hard') continue;
      for (const side of [1, -1]) {
        const fc = face(w.id, side), r = K.room(fc.room);
        if (!r || ['solid', 'shaft', 'void'].includes(r.kind)) continue;
        const ext = w.core ? 0.3 : 0, U0 = -ext, U1 = fc.F.len + ext, hs = holesOf(w, 0.02).sort((a, b) => a[0] - b[0]);
        const runs = []; let u = U0;
        for (const [a, b] of hs) { if (a > u) runs.push([u, a]); u = Math.max(u, b); }
        if (u < U1) runs.push([u, U1]);
        const mk = SKIRT(finishOf(r.id) || ''), corr = r.kind === 'corridor';
        for (const [a, b] of runs) {
          if (b - a < 0.1) continue;
          fbox(g, mk, fc, a, b, 0, 0.1, 0, 0.014, '-y');
          if (corr) fbox(g, 'glow_purple', fc, a + 0.05, b - 0.05, 0.13, 0.145, 0, 0.008, '-y');
        }
      }
    }
  }
  // ceiling cove: a dark recess band and a glow line inset from the room outline
  function cove(roomId, glow = 'glow_warm', inset = 0.35) {
    const r = K.room(roomId); if (!r) return;
    const P = r.polygon, n = P.length, g = D('coves');
    let A = 0; for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; A += a[0] * b[1] - b[0] * a[1]; }
    const sg = A > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      if (L < 1.4) continue;
      const d = [dx / L, dz / L], nn = [-d[1] * sg, d[0] * sg];   // inward normal
      const q0 = [a[0] + d[0] * inset + nn[0] * inset, a[1] + d[1] * inset + nn[1] * inset], q1 = [b[0] - d[0] * inset + nn[0] * inset, b[1] - d[1] * inset + nn[1] * inset];
      const bx = [Math.min(q0[0], q1[0]) - 0.1, Math.min(q0[1], q1[1]) - 0.1, Math.max(q0[0], q1[0]) + 0.1, Math.max(q0[1], q1[1]) + 0.1];
      if (!freeHigh(bx, 'cove ' + roomId)) continue;
      const m = [(q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2], len = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]), D3 = [d[0], 0, d[1]], N3 = [nn[0], 0, nn[1]];
      K.obox(g('black'), [m[0] - nn[0] * 0.12, Y + CE - 0.01, m[1] - nn[1] * 0.12], D3, [0, 1, 0], N3, [len / 2 + 0.12, 0.01, 0.13], '+y');
      K.obox(g(glow), [m[0], Y + CE - 0.022, m[1]], D3, [0, 1, 0], N3, [len / 2, 0.006, 0.025], '+y');
    }
  }
  // timber rafters (seokkarae) under a ceiling: plan box, along 'x' or 'z', pitch; clipped around hatches, patches,
  // stairwells and slab openings (0.3 m margin) so nothing hangs over a stair
  const STAIRCUTS = (() => {
    const out = [], nf = { F1: 'F2', F2: 'F3', F3: null }[FID], m = 0.3;
    for (const so of K.L.slab_openings) if (so.floor === nf || (so.floor === 'all' && nf)) { const b = K.polyBox(so.polygon); out.push([b[0] - m, b[1] - m, b[2] + m, b[3] + m]); }
    for (const st of K.L.stairs) {
      if (!(st.floors || []).includes(FID)) continue;
      if (st.box) out.push([st.box[0] - m, st.box[1] - m, st.box[2] + m, st.box[3] + m]);
      else if (st.center) out.push([st.center[0] - st.radius - m, st.center[1] - st.radius - m, st.center[0] + st.radius + m, st.center[1] + st.radius + m]);
      else if (st.path) { const xs = st.path.map((p) => p[0]), zs = st.path.map((p) => p[2]), hw = (st.width || 1.4) / 2 + m; out.push([Math.min(...xs) - hw, Math.min(...zs) - hw, Math.max(...xs) + hw, Math.max(...zs) + hw]); }
    }
    return out;
  })();
  function rafters(box, along, pitch = 0.6, mk = 'wood_dark', depth = 0.14) {
    const g = D('rafters'), [x0, z0, x1, z1] = box;
    const cuts = K.keepouts(FID).filter((k) => /hatch|patch/.test(k.why)).map((k) => k.box).concat(STAIRCUTS);
    const X = along === 'x', A0 = X ? x0 : z0, A1 = X ? x1 : z1;
    for (let c = (X ? z0 : x0) + pitch / 2; c < (X ? z1 : x1); c += pitch) {
      const ivs = cuts.filter((k) => (X ? c + 0.05 > k[1] && c - 0.05 < k[3] : c + 0.05 > k[0] && c - 0.05 < k[2])).map((k) => (X ? [k[0], k[2]] : [k[1], k[3]])).sort((p, q) => p[0] - q[0]);
      let a = A0;
      const run = (u0, u1) => { u0 = Math.max(u0, A0); u1 = Math.min(u1, A1); if (u1 - u0 > 0.2) { if (X) B(g, mk, u0, u1, CE - depth, CE - 0.005, c - 0.05, c + 0.05, '+y'); else B(g, mk, c - 0.05, c + 0.05, CE - depth, CE - 0.005, u0, u1, '+y'); } };
      for (const [c0, c1] of ivs) { if (c0 > a) run(a, c0); a = Math.max(a, c1); }
      run(a, A1);
    }
  }

  // ---- layout props: no furniture in the map. Built-in architecture keeps its typed node and is dressed; every other
  // prop becomes an empty PROP_<id> marker (position, size, kind in extras), its blockout and collider are dropped, and
  // the viewer draws a faint footprint (viewer only, never exported; P toggles it). Built-ins also get a PROP_ marker.
  const UNDO = (fn) => { if (typeof JOURNAL !== 'undefined' && JOURNAL) JOURNAL.push(fn); };
  function propMarkers(builtIn) {
    const fills = [], lines = { full: [], half: [], none: [] }, yy = Y + 0.012;
    const internals = typeof empty === 'function' && typeof EMPT !== 'undefined' && typeof BYNAME !== 'undefined';
    if (!internals) K.warn('engine internals not reachable: prop blockouts kept');
    for (const info of K.props(FID)) {
      const p = info.rec, [x0, z0, x1, z1] = p.box, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, bi = builtIn.has(p.id);
      const ex = {
        surface: 'prop_marker', id: p.id, kind: p.kind, floor: FID, room: p.room, pos: [cx, Y, cz].map((v) => +v.toFixed(3)),
        size: [+(x1 - x0).toFixed(3), +Math.abs(p.h).toFixed(3), +(z1 - z0).toFixed(3)], box: p.box, h: p.h, cover: p.cover, type: p.type,
        shape: p.shape || 'box', note: p.note, breaks_sightline: /breaks|splits/.test(p.note || ''), built_in: bi,
        node: bi ? info.node.name : null, place: bi ? 'built into the map' : 'place a furniture-pack piece here (keep box and h when breaks_sightline)',
      };
      if (!internals) continue;
      empty('PROP_' + p.id, { fk: FID, group: 'MARKERS', pos: ex.pos, extras: ex });
      if (bi) continue;
      // drop the blockout node and its collider
      const e = info.node, wasD = e.display, wasE = e.export;
      e.display = false; e.export = false; UNDO(() => { e.display = wasD; e.export = wasE; });
      for (const cn of ['COL_' + p.id, 'COL_' + p.id + '_roof']) {
        const c = BYNAME.get(cn), i = c ? EMPT.indexOf(c) : -1;
        if (i < 0) continue;
        EMPT.splice(i, 1); BYNAME.delete(cn); UNDO(() => { EMPT.push(c); BYNAME.set(cn, c); });
      }
      // footprint: outline, corner ticks and a faint fill
      const L2 = lines[p.cover] || lines.none;
      if (p.shape === 'round') {
        const r = Math.min(x1 - x0, z1 - z0) / 2, N = 40;
        for (let k = 0; k < N; k++) { const a0 = (k / N) * PI * 2, a1 = ((k + 1) / N) * PI * 2; L2.push(cx + Math.sin(a0) * r, yy, cz + Math.cos(a0) * r, cx + Math.sin(a1) * r, yy, cz + Math.cos(a1) * r); }
      } else {
        const q = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
        for (let k = 0; k < 4; k++) L2.push(q[k][0], yy, q[k][1], q[(k + 1) % 4][0], yy, q[(k + 1) % 4][1]);
        if (ex.breaks_sightline) { L2.push(x0, yy, z0, x1, yy, z1, x1, yy, z0, x0, yy, z1); }
      }
      fills.push([x0, z0, x1, z1]);
    }
    if (!internals || !fills.length) return;
    const grp = new T.Group(); grp.name = 'propplan_' + FID;
    const col = { full: '#ff8a4c', half: '#ffd166', none: '#8fd3ff' };
    for (const [k, arr] of Object.entries(lines)) {
      if (!arr.length) continue;
      const gg = new T.BufferGeometry(); gg.setAttribute('position', new T.Float32BufferAttribute(arr, 3));
      const ls = new T.LineSegments(gg, new T.LineBasicMaterial({ color: col[k], transparent: true, opacity: 0.55, depthWrite: false, fog: false, toneMapped: false }));
      ls.renderOrder = 5; grp.add(ls);
    }
    const fp = []; for (const [x0, z0, x1, z1] of fills) fp.push(x0, yy - 0.002, z0, x1, yy - 0.002, z0, x1, yy - 0.002, z1, x0, yy - 0.002, z0, x1, yy - 0.002, z1, x0, yy - 0.002, z1);
    const fg = new T.BufferGeometry(); fg.setAttribute('position', new T.Float32BufferAttribute(fp, 3));
    grp.add(new T.Mesh(fg, new T.MeshBasicMaterial({ color: '#ffd9a8', transparent: true, opacity: 0.07, depthWrite: false, side: T.DoubleSide, fog: false, toneMapped: false })));
    K.view(grp, 'propplan', FID);
    // shared toggle for every floor: window.__propPlan.set(on); key P in the viewer
    const PP = window.__propPlan || (window.__propPlan = { on: true, groups: [], set(v) { this.on = !!v; for (const o of this.groups) if (!this.on) o.visible = false; else { const d = window.__model && window.__model.debug; if (d && d.applyVis) d.applyVis(); } } });
    PP.groups.push(grp);
    if (!PP.key) { PP.key = true; window.addEventListener('keydown', (e) => { if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && e.key.toLowerCase() === 'p') PP.set(!PP.on); }); }
    K.onTick(() => { if (!PP.on) grp.visible = false; });
  }
  // ================= F3 98F Broadcast: S1 control room / render farm, the grid, media and executive floor (architecture only) =================
  // Above this floor is 99F, the mechanical floor: its underside shows in the studio void as beams, ducts and the lighting rig.

  // ---- finishes and ceilings (before the engine lays the slabs) ----
  mat('f3_raised', 'epoxy', { color: '#3a3c44', rough: 0.55, tile: 1.2, ns: 0.3 });      // raised access floor (S1, matches P01 / P02)
  mat('f3_felt', 'carpet', { color: '#26262e', rough: 0.97, tile: 0.6, ns: 0.9 });       // acoustic felt
  mat('f3_felt_indigo', 'carpet', { color: '#2c2f5c', rough: 0.97, tile: 0.6, ns: 0.9 });
  mat('f3_felt_ochre', 'carpet', { color: '#a87a36', rough: 0.97, tile: 0.6, ns: 0.9 });
  mat('f3_felt_cinnabar', 'carpet', { color: '#8e2e22', rough: 0.97, tile: 0.6, ns: 0.9 });
  mat('f3_deck', 'concrete', { color: '#4a4c52', rough: 0.85, tile: 1.5 });              // 99F slab underside
  mat('f3_bathwater', 'water', { color: '#1d3e4c', rough: 0.08, tile: 1.5, em: '#2c6a8a', ei: 0.35 });
  mat('f3_red', 'led', { color: '#3a0a0a', rough: 0.4, em: '#ff3030', ei: 1.6, emMap: false });
  mat('f3_star', 'led', { color: '#202030', rough: 0.4, em: '#e8dcff', ei: 2.2, emMap: false });
  mat('f3_perf', 'grating', { color: '#7c8496', rough: 0.45, metal: 0.6, tile: 0.6, ns: 0.5 });
  mat('f3_lamp_soft', 'hanji', { color: '#fff1dc', rough: 0.8, tile: 0.6, em: '#ffc08a', ei: 0.75 });
  mat('f3_pipe_red', 'brushed', { color: '#8e2018', rough: 0.4, metal: 0.4, tile: 0.8, ns: 0.3 });
  for (const r of ['F3_control_room', 'F3_render_farm']) K.finish(r, 'f3_raised');
  K.finish('F3_exec_hall', 'stone_dark'); K.finish('F3_archive_hall', 'carpet'); K.finish('F3_bedroom', 'wood'); K.finish('F3_writers_room', 'wood');
  for (const r of ['F3_exec_office', 'F3_boardroom', 'F3_suite_lounge', 'F3_bedroom', 'F3_exec_hall', 'F3_writers_room']) K.ceiling(r, 'dz_wood_ceil');
  for (const r of ['F3_foyer', 'F3_suite_bath']) K.ceiling(r, r === 'F3_foyer' ? 'ceiling_dark' : 'plaster');
  K.ceiling('F3_studio_void', 'f3_deck');

  // ---- lights (4): S1 control room, newsroom, suite lounge, boardroom. Everything else is emissive. ----
  K.light(FID, { pos: [4.5, Y + 2.7, -19.0], color: '#9a7cff', intensity: 6, distance: 12, decay: 2 });
  K.light(FID, { pos: [-19.0, Y + 2.7, 3.0], color: '#ffd7ae', intensity: 6, distance: 13, decay: 2 });
  K.light(FID, { pos: [2.0, Y + 2.6, 13.0], color: '#ffc58a', intensity: 6, distance: 12, decay: 2 });
  K.light(FID, { pos: [-19.0, Y + 2.6, 20.5], color: '#ffcf9c', intensity: 6, distance: 12, decay: 2 });

  // ---- screens: abstract graphics only ----
  const SCR_FEED = screenMat('f3_scr_feed', paintFeeds(311), { ei: 1.1 });
  const SCR_WAVE = screenMat('f3_scr_wave', paintBars(312, 250, 300), { ei: 1.3 });
  // rack fronts: rows of tiny status LEDs on black (no text)
  const SCR_RACK = screenMat('f3_scr_rack', () => { const c = K.canvas(256, 256), x = c.getContext('2d'), R = K.rng(313); x.fillStyle = '#040508'; x.fillRect(0, 0, 256, 256);
    for (let j = 0; j < 32; j++) { x.fillStyle = '#0c0e14'; x.fillRect(4, j * 8 + 1, 248, 6); for (let i = 0; i < 24; i++) if (R() < 0.55) { x.fillStyle = R() < 0.7 ? '#4aa8ff' : R() < 0.6 ? '#5dff9a' : '#b07bff'; x.fillRect(8 + i * 10, j * 8 + 3, 3, 2); } }
    return c; }, { ei: 1.2 });
  const SCR_ART = screenMat('f3_scr_art', paintAbstract(313, 268, 6), { ei: 1.2 });
  const SCR_CINE = screenMat('f3_scr_cine', paintAbstract(314, 300, 10), { ei: 1.5 });
  const SCR_TEAL = screenMat('f3_scr_teal', paintAbstract(315, 196, 7), { ei: 1.2 });
  // newsroom ring: bands of soft bars and blobs that read as a ticker without any glyphs
  const SCR_RING = screenMat('f3_scr_ring', () => {
    const c = K.canvas(1024, 128), x = c.getContext('2d'), R = K.rng(316);
    const g = x.createLinearGradient(0, 0, 1024, 0); g.addColorStop(0, '#120a2a'); g.addColorStop(0.5, '#1c0c3a'); g.addColorStop(1, '#120a2a'); x.fillStyle = g; x.fillRect(0, 0, 1024, 128);
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) { const w = 6 + R() * 40, h = 6 + R() * 10, y = R() < 0.5 ? 30 : 80; x.fillStyle = `hsla(${250 + R() * 70},90%,${50 + R() * 25}%,0.6)`; x.fillRect(R() * 1024, y + (R() - 0.5) * 8, w, h); }
    x.strokeStyle = 'hsla(300,90%,70%,0.5)'; x.lineWidth = 3; x.beginPath(); for (let k = 0; k <= 128; k++) { const xx = k * 8, yy = 64 + Math.sin(k * 0.35) * 10; k ? x.lineTo(xx, yy) : x.moveTo(xx, yy); } x.stroke();
    x.globalCompositeOperation = 'source-over'; x.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < 128; y += 3) x.fillRect(0, y, 1024, 1);
    return c;
  }, { ei: 1.4 });

  const roomFace = (wid, room) => { const f = face(wid, 1); return f && (f.room === room ? f : face(wid, -1)); };
  const inPoly = (p, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const ROOMS = K.rooms(FID), roomAt = (p) => ROOMS.find((r) => inPoly(p, r.polygon));
  const CUTS = K.keepouts(FID).filter((k) => /hatch|patch/.test(k.why)).map((k) => k.box);
  // split [a0, a1] along an axis into runs that miss the hatch / patch boxes crossed at the other coordinate c (+- w)
  function runsAvoid(axis, a0, a1, c, w = 0.1) {
    const ivs = CUTS.filter((b) => (axis === 'x' ? c + w > b[1] && c - w < b[3] : c + w > b[0] && c - w < b[2])).map((b) => (axis === 'x' ? [b[0], b[2]] : [b[1], b[3]])).sort((p, q) => p[0] - q[0]);
    const out = []; let a = a0;
    for (const [c0, c1] of ivs) { if (c1 < a0 || c0 > a1) continue; if (c0 > a + 0.15) out.push([a, Math.min(c0, a1)]); a = Math.max(a, c1); }
    if (a1 > a + 0.15) out.push([a, a1]);
    return out;
  }
  // flush floor seam grid over a room box (raised floor, stone joints), clear of hatches and patches
  function seams(box, pitch, mk = 'black', w = 0.006) {
    const g = D('seams'), [x0, z0, x1, z1] = box;
    for (let x = x0 + pitch; x < x1 - 0.05; x += pitch) for (const [a, b] of runsAvoid('z', z0, z1, x, 0.01)) B(g, mk, x - w, x + w, 0.0005, 0.0015, a, b, '-y');
    for (let z = z0 + pitch; z < z1 - 0.05; z += pitch) for (const [a, b] of runsAvoid('x', x0, x1, z, 0.01)) B(g, mk, a, b, 0.0005, 0.0015, z - w, z + w, '-y');
  }
  // ceiling-hung panel (acoustic cloud, light coffer): plan box, bottom height, thickness, glow edge
  function cloud(g, mk, box, yb, th = 0.05, edge = null, why = 'cloud') {
    const [x0, z0, x1, z1] = box;
    if (!freeHigh(box, why)) return false;
    B(g, mk, x0, x1, yb, yb + th, z0, z1);
    if (edge) { B(g, edge, x0 - 0.01, x1 + 0.01, yb + th * 0.3, yb + th * 0.6, z0 - 0.012, z0); B(g, edge, x0 - 0.01, x1 + 0.01, yb + th * 0.3, yb + th * 0.6, z1, z1 + 0.012); }
    for (const [x, z] of [[x0 + 0.1, z0 + 0.1], [x1 - 0.1, z0 + 0.1], [x0 + 0.1, z1 - 0.1], [x1 - 0.1, z1 - 0.1]]) C(g, 'black', 'black', x, z, 0.004, yb + th, CE, 3, false);
    return true;
  }
  // rectangular frame of four bars (coffer rims), y relative
  function rim(g, mk, x0, x1, z0, z1, w, y0, y1) { B(g, mk, x0, x1, y0, y1, z0, z0 + w, '+y'); B(g, mk, x0, x1, y0, y1, z1 - w, z1, '+y'); B(g, mk, x0, x0 + w, y0, y1, z0 + w, z1 - w, '+y'); B(g, mk, x1 - w, x1, y0, y1, z0 + w, z1 - w, '+y'); }
  const BUILTIN = new Set(['PR73', 'PR75']);   // screening tiers (stepped floor) and the stone bath are part of the building

  // ---------------- core faces: purple sconce rhythm (Media Hall, News Hall, Archive Hall) ----------------
  {
    const g = D('core_sconces');
    const runs = [['z', -9.0, -8.2, 8.2, -1], ['x', 9.0, -8.2, 8.2, 1], ['x', -9.0, -8.2, 8.2, -1]];
    for (const [ax, c0, a0, a1, s] of runs) for (let u = a0; u <= a1 + 0.01; u += 2.05) {
      const c = c0 + s * 0.3;
      const box = ax === 'z' ? [u - 0.2, Math.min(c, c + s * 0.1), u + 0.2, Math.max(c, c + s * 0.1)] : [Math.min(c, c + s * 0.1), u - 0.2, Math.max(c, c + s * 0.1), u + 0.2];
      if (!free(box, 'core sconce')) continue;
      if (ax === 'z') { B(g, 'steel_dark', u - 0.08, u + 0.08, 0.5, 2.7, c, c + s * 0.05); B(g, 'glow_purple', u - 0.02, u + 0.02, 0.6, 2.6, c + s * 0.05, c + s * 0.06); }
      else { B(g, 'steel_dark', c, c + s * 0.05, 0.5, 2.7, u - 0.08, u + 0.08); B(g, 'glow_purple', c + s * 0.05, c + s * 0.06, 0.6, 2.6, u - 0.02, u + 0.02); }
    }
  }

  // ---------------- Media Lifts: hanji light coffer down the lobby, stone bands in the terrazzo ----------------
  {
    const g = D('lifts');
    if (freeHigh([-7.6, -0.9, 7.6, 0.9], 'lift coffer')) {
      rim(g, 'wood_dark', -7.6, 7.6, -0.9, 0.9, 0.1, 2.92, 3.1);
      B(g, 'dz_lamp_cool', -7.5, 7.5, 3.0, 3.09, -0.8, 0.8, '+y');
      for (let x = -7.2; x <= 7.21; x += 0.6) B(g, 'wood_dark', x - 0.02, x + 0.02, 2.95, 3.0, -0.8, 0.8, '+y');
    }
    for (const x of [-6.0, -3.0, 0.0, 3.0, 6.0]) B(g, 'stone_dark', x - 0.06, x + 0.06, 0.0005, 0.002, -1.7, 1.7, '-y');
  }

  // ---------------- S1 Control Room: raised floor, acoustic baffles, multiviewer on the void wall, tally ring ----------------
  {
    const g = D('control');
    seams([0.15, -25.85, 8.85, -12.15], 0.6);
    // acoustic baffles, north-south, over the console zone (hatches stay clear)
    for (let x = 1.0; x <= 8.2; x += 0.6) for (const [a, b] of runsAvoid('z', -25.2, -12.8, x, 0.04)) if (b - a > 0.6) B(g, 'f3_felt', x - 0.025, x + 0.025, 2.72, 3.08, a + 0.1, b - 0.1);
    // multiviewer on the hard void wall (control face), 3 x 2 panels with a purple under-glow
    const vf = roomFace('F3_W12', 'F3_control_room');
    if (vf) {
      const L = vf.F.len; fbox(g, 'black', vf, 0.05, L - 0.05, 0.9, 2.75, 0, 0.06);
      for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) fscreen(g, (k + j) % 3 === 1 ? SCR_WAVE : SCR_FEED, vf, 0.12 + (L - 0.24) * (k + 0.5) / 3, 1.32 + j * 0.86, (L - 0.3) / 3, 0.8, 0.066);
      fbox(g, 'glow_purple', vf, 0.05, L - 0.05, 0.86, 0.88, 0, 0.06);
    }
    const wf = roomFace('F3_W13', 'F3_control_room'), rf = roomFace('F3_W24', 'F3_control_room');
    for (const f of [wf, rf]) if (f) fslats(g, f, 0.05, f.F.len - 0.05, 0, 3.05, { mk: 'f3_felt', back: 'black', glow: 'glow_purple', pitch: 0.1, sw: 0.07 });
    // tally ring over the holo console mark, and a glow line along the director window base
    if (freeHigh([6.2, -19.8, 8.8, -17.4], 'tally ring')) { const tor = new T.TorusGeometry(1.0, 0.03, 6, 40); tor.rotateX(PI / 2); GE(g, 'glow_purple', tor, MX(7.5, 3.0, -18.6)); }
    B(g, 'glow_purple', 8.7, 8.76, 0.0005, 0.003, -21.9, -17.1, '-y');
    B(g, 'glow_purple', 8.66, 8.72, 3.07, 3.09, -21.9, -17.1, '+y');
    // plain red tally disc over the grid door (a pictogram, no text)
    if (freeHigh([8.3, -16.1, 8.7, -15.4], 'tally')) { disc(g, 'black', 8.62, 2.35, -15.75, 0.13, [-1, 0], 16); disc(g, 'f3_red', 8.615, 2.35, -15.75, 0.09, [-1, 0], 16); C(g, 'black', 'black', 8.63, -15.75, 0.005, 2.48, CE, 3, false); }
    cove('F3_control_room', 'glow_purple');
  }

  // ---------------- S1 Render Farm: cold-aisle tiles, overhead cable ladders on the planned rack lines, fire wall manifold ----------------
  {
    const g = D('render');
    seams([-8.85, -25.85, -0.15, -12.15], 0.6);
    // cold aisles: perforated tiles between the planned rack rows (flush)
    for (const [z0, z1] of [[-24.05, -22.45], [-21.55, -18.25]]) for (const [a, b] of runsAvoid('x', -8.0, -1.5, (z0 + z1) / 2, (z1 - z0) / 2)) B(g, 'f3_perf', a, b, 0.0008, 0.002, z0 + 0.1, z1 - 0.1, '-y');
    // cable ladders over each rack line (2.55 m), on drop rods
    for (const id of ['PR66', 'PR67', 'PR68', 'PR69']) {
      const p = K.prop(id); if (!p) continue;
      const [x0, z0, x1, z1] = p.rec.box, zc = (z0 + z1) / 2;
      for (const [a, b] of runsAvoid('x', x0 - 0.3, x1 + 0.3, zc, 0.3)) {
        if (!freeHigh([a, zc - 0.3, b, zc + 0.3], 'cable ladder')) continue;
        B(g, 'steel_dark', a, b, 2.55, 2.6, zc - 0.3, zc - 0.27); B(g, 'steel_dark', a, b, 2.55, 2.6, zc + 0.27, zc + 0.3);
        for (let x = a + 0.15; x < b; x += 0.3) B(g, 'steel_dark', x - 0.015, x + 0.015, 2.55, 2.565, zc - 0.27, zc + 0.27);
        B(g, 'black', a + 0.05, b - 0.05, 2.565, 2.62, zc - 0.2, zc + 0.2);
        B(g, 'glow_cool', a + 0.05, b - 0.05, 2.545, 2.55, zc - 0.015, zc + 0.015, '+y');
        for (let x = a + 0.2; x < b; x += 1.2) for (const s of [-1, 1]) C(g, 'steel_dark', 'steel_dark', x, zc + s * 0.31, 0.008, 2.6, CE, 4, false);
      }
    }
    // the vault fire wall (render face): red suppression manifold and a steel wainscot
    for (const wid of ['F3_W25', 'F3_W26']) {
      const f = roomFace(wid, 'F3_render_farm'); if (!f) continue;
      const L = f.F.len;
      fbox(g, 'steel_dark', f, 0.02, L - 0.02, 0, 1.1, 0, 0.03);
      for (let u = 0.3; u < L - 0.1; u += 0.6) fbox(g, 'black', f, u - 0.004, u + 0.004, 0.02, 1.08, 0.03, 0.034);
      fbox(g, 'f3_pipe_red', f, 0.02, L - 0.02, 2.62, 2.74, 0.06, 0.18);
      for (let u = 0.5; u < L - 0.2; u += 0.9) fbox(g, 'f3_pipe_red', f, u - 0.03, u + 0.03, 2.48, 2.62, 0.09, 0.15);
    }
    cove('F3_render_farm', 'glow_cool');
  }

  // ---------------- Media Hall and the other halls: ceiling cable trays, linear slots ----------------
  {
    const g = D('halls');
    const tray = (axis, a0, a1, c, y = 2.78) => {
      for (const [a, b] of runsAvoid(axis, a0, a1, c, 0.2)) {
        if (axis === 'x') { B(g, 'steel_dark', a, b, y, y + 0.08, c - 0.2, c - 0.18); B(g, 'steel_dark', a, b, y, y + 0.08, c + 0.18, c + 0.2); B(g, 'steel_dark', a, b, y, y + 0.012, c - 0.18, c + 0.18); B(g, 'black', a + 0.05, b - 0.05, y + 0.012, y + 0.06, c - 0.14, c + 0.14); }
        else { B(g, 'steel_dark', c - 0.2, c - 0.18, y, y + 0.08, a, b); B(g, 'steel_dark', c + 0.18, c + 0.2, y, y + 0.08, a, b); B(g, 'steel_dark', c - 0.18, c + 0.18, y, y + 0.012, a, b); B(g, 'black', c - 0.14, c + 0.14, y + 0.012, y + 0.06, a + 0.05, b - 0.05); }
        for (let s = a + 0.4; s < b; s += 1.5) for (const o of [-0.19, 0.19]) axis === 'x' ? C(g, 'black', 'black', s, c + o, 0.006, y + 0.08, CE, 3, false) : C(g, 'black', 'black', c + o, s, 0.006, y + 0.08, CE, 3, false);
      }
    };
    tray('x', -8.8, 8.8, -10.0);          // Media Hall (H13 stays clear)
    tray('z', -11.8, 8.8, -11.0);         // News Hall
    tray('z', -8.8, 8.8, 11.0);           // Archive Hall
    // Exec Hall: timber ceiling slats across the corridor
    for (let z = 9.4; z < 25.7; z += 0.3) B(g, 'wood', -11.85, -9.15, 2.96, 3.06, z - 0.03, z + 0.03, '+y');
    B(g, 'glow_warm', -11.9, -11.85, 2.9, 2.93, 9.2, 25.8);
    seams([-11.95, 9.05, -9.05, 25.95], 0.9, 'black');
  }

  // ---------------- the Grid: the 99F underside over the studio void (beams, ducts, rig, cable drops) ----------------
  {
    const g = D('grid');
    const z0At = (x) => Math.max(-25.7, -26 + Math.max(0, x - 21) + 0.35);
    // primary steel beams north-south (deep I-sections under the deck)
    for (const x of [11.0, 14.0, 17.0, 20.0, 23.0]) {
      const a = z0At(x), b = -9.35;
      B(g, 'steel_dark', x - 0.15, x + 0.15, 2.78, 2.8, a, b); B(g, 'steel_dark', x - 0.15, x + 0.15, 3.08, 3.1, a, b, '+y'); B(g, 'steel_dark', x - 0.012, x + 0.012, 2.8, 3.08, a, b);
    }
    // secondary purlins east-west
    for (const z of [-23.0, -19.0, -13.0]) { const xs = z < -21 ? 9.35 : 9.35, xe = z < -21 ? 26 + (z + 21) - 0.4 : 25.65; B(g, 'steel_dark', xs, xe, 2.95, 3.08, z - 0.06, z + 0.06, '+y'); }
    // round supply duct east-west along the south edge, and a return duct along the west
    const duct = new T.CylinderGeometry(0.32, 0.32, 1, 14, 1, true);
    { const m = new T.Matrix4().makeRotationZ(PI / 2); const mm = MX(17.4, 2.72, -10.2, 0, 1, 1, 1).multiply(m).multiply(new T.Matrix4().makeScale(1, 15.6, 1)); GE(g, 'alloy', duct, mm); }
    for (let x = 10.2; x < 25; x += 2.4) { const r = new T.TorusGeometry(0.335, 0.02, 4, 14); r.rotateY(PI / 2); GE(g, 'steel_dark', r, MX(x, 2.72, -10.2)); }
    for (const x of [11.5, 15.0, 18.6, 22.2]) { B(g, 'steel_dark', x - 0.22, x + 0.22, 2.32, 2.4, -10.55, -10.45); B(g, 'louvre', x - 0.2, x + 0.2, 2.36, 2.44, -10.5, -10.42); }
    // lighting pipes (2.7 m above the grid floor) with hanging fixtures, all above head height on the catwalks
    const pipeZ = [-24.0, -20.5, -17.8, -12.0];
    for (const z of pipeZ) { const xe = z < -21 ? 26 + (z + 21) - 0.5 : 25.5; BM(g, 'alloy', [9.4, 2.7, z], [xe, 2.7, z], 0.05); for (let x = 11.0; x < xe; x += 3.0) C(g, 'black', 'black', x, z, 0.008, 2.7, 2.95, 3, false); }
    const can = new T.CylinderGeometry(0.12, 0.15, 0.34, 10), lens = new T.CircleGeometry(0.11, 10); lens.rotateX(PI / 2);
    const yoke = new T.BoxGeometry(0.32, 0.04, 0.04);
    let n = 0;
    for (const z of pipeZ) for (let x = 10.4; x < 25.2; x += 1.45) {
      if (z < -21 && x > 26 + (z + 21) - 0.8) continue;
      const tilt = ((n++ % 3) - 1) * 0.35, m = MX(x, 2.48, z).multiply(new T.Matrix4().makeRotationX(tilt));
      GE(g, 'black', can, m); GE(g, n % 4 ? 'glow_cool' : 'glow_pink', lens, m.clone().multiply(new T.Matrix4().makeTranslation(0, -0.175, 0)));
      GE(g, 'steel_dark', yoke, MX(x, 2.67, z));
    }
    // cable drops and a hanging cyclorama light bar over the stage centre
    for (const [x, z] of [[12.2, -20.5], [15.6, -24.0], [21.1, -12.0], [23.8, -17.8]]) C(g, 'black', 'black', x, z, 0.012, 1.7, 2.7, 4, false);
    B(g, 'black', 13.0, 21.0, 2.55, 2.6, -21.6, -21.4); B(g, 'glow_purple', 13.05, 20.95, 2.545, 2.55, -21.55, -21.45, '+y');
    haze([[17.0, 0.6, -19.0, 5.0], [13.5, 1.2, -21.5, 4.0], [21.0, 0.9, -13.5, 4.5], [19.0, 2.0, -20.0, 4.0]], '#b48cff', 0.05);
  }

  // ---------------- Edit Bay, Edit 1, Edit 2: acoustic clouds, slatted hard faces ----------------
  {
    const g = D('edit');
    for (const [x0, z0, x1, z1] of [[-24.4, -20.6, -21.6, -18.6], [-20.8, -20.6, -18.0, -18.6], [-24.4, -17.6, -21.6, -16.0], [-20.8, -17.6, -16.6, -15.8], [-19.6, -24.8, -16.0, -21.8]]) cloud(g, 'f3_felt_indigo', [x0, z0, x1, z1], 2.78, 0.06, 'glow_cool', 'edit cloud');
    for (const [x0, z0, x1, z1] of [[-14.2, -25.4, -9.8, -22.8], [-14.2, -21.8, -9.8, -19.8]]) cloud(g, 'f3_felt', [x0, z0, x1, z1], 2.8, 0.06, 'glow_purple', 'edit1 cloud');
    for (const [x0, z0, x1, z1] of [[-14.2, -18.3, -9.8, -16.6], [-14.2, -15.8, -12.6, -12.8]]) cloud(g, 'f3_felt', [x0, z0, x1, z1], 2.8, 0.06, 'glow_purple', 'edit2 cloud');
    const e1 = roomFace('F3_W25', 'F3_edit_1'), e2 = roomFace('F3_W26', 'F3_edit_1');
    for (const f of [e1, e2]) if (f) fslats(g, f, 0.05, f.F.len - 0.05, 0, 3.05, { mk: 'f3_felt', back: 'black', glow: 'glow_purple', pitch: 0.1, sw: 0.07 });
    cove('F3_edit_bay', 'glow_cool'); cove('F3_edit_1', 'glow_purple'); cove('F3_edit_2', 'glow_purple');
  }

  // ---------------- Podcast: hexagonal felt clouds, a plain red on-air disc by the door ----------------
  {
    const g = D('podcast');
    const hex = new T.CylinderGeometry(0.62, 0.62, 0.06, 6), halo = new T.CylinderGeometry(0.67, 0.67, 0.012, 6);
    for (const [x, z] of [[-24.0, -10.2], [-22.9, -9.5], [-21.8, -10.2], [-20.7, -9.5], [-19.6, -10.2], [-18.5, -9.5], [-24.0, -6.4], [-22.9, -5.7], [-21.8, -6.4], [-20.7, -5.7], [-18.5, -5.7], [-17.4, -6.4], [-16.3, -5.7]]) {
      if (!freeHigh([x - 0.65, z - 0.65, x + 0.65, z + 0.65], 'podcast hex')) continue;
      GE(g, ['f3_felt_indigo', 'f3_felt_ochre', 'f3_felt_indigo', 'f3_felt_cinnabar'][Math.abs(Math.round(x * 1.3 + z * 0.7)) % 4], hex, MX(x, 2.76, z, PI / 6));
      GE(g, 'glow_warm', halo, MX(x, 2.8, z, PI / 6));
      C(g, 'black', 'black', x, z, 0.004, 2.79, CE, 3, false);
    }
    // on-air disc hung from the ceiling inside the newsroom door (a pictogram: a red disc in a black ring)
    if (freeHigh([-14.9, -3.9, -14.1, -3.7], 'on-air')) {
      disc(g, 'black', -14.5, 2.62, -3.82, 0.17, [0, 1], 16); disc(g, 'f3_red', -14.5, 2.62, -3.815, 0.12, [0, 1], 16);
      disc(g, 'black', -14.5, 2.62, -3.84, 0.17, [0, -1], 16); disc(g, 'f3_red', -14.5, 2.62, -3.845, 0.12, [0, -1], 16);
      C(g, 'black', 'black', -14.5, -3.83, 0.005, 2.79, CE, 3, false);
    }
    cove('F3_podcast', 'glow_purple');
  }

  // ---------------- Newsroom: the ceiling ticker ring, linear light rafts, purple floor inlay ----------------
  {
    const g = D('newsroom');
    const cx = -17.6, cz = -0.4, r = 2.2;
    if (freeHigh([cx - r - 0.1, cz - r - 0.1, cx + r + 0.1, cz + r + 0.1], 'news ring')) {
      const band = new T.CylinderGeometry(r, r, 0.42, 48, 1, true); GE(g, SCR_RING, band, MX(cx, 2.62, cz), true);
      const inner = new T.CylinderGeometry(r - 0.04, r - 0.04, 0.42, 48, 1, true); GE(g, 'black', inner, MX(cx, 2.62, cz));
      for (const y of [2.4, 2.84]) { const tor = new T.TorusGeometry(r, 0.025, 4, 48); tor.rotateX(PI / 2); GE(g, 'glow_purple', tor, MX(cx, y, cz)); }
      for (let k = 0; k < 4; k++) { const a = (k / 4) * PI * 2 + PI / 4; C(g, 'black', 'black', cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0.006, 2.84, CE, 3, false); }
    }
    // light rafts over the planned desk clusters
    for (const id of ['PR70', 'PR71']) {
      const p = K.prop(id); if (!p) continue;
      const [x0, z0, x1, z1] = p.rec.box;
      cloud(g, 'dz_lamp_cool', [x0 + 0.2, (z0 + z1) / 2 - 0.35, x1 - 0.2, (z0 + z1) / 2 + 0.35], 2.7, 0.05, 'glow_purple', 'news raft');
    }
    for (const z of [-2.6, 8.6]) for (const [a, b] of runsAvoid('x', -25.4, -12.4, z, 0.02)) B(g, 'glow_purple', a, b, 0.0005, 0.002, z - 0.015, z + 0.015, '-y');
    const nf = roomFace('F3_W47', 'F3_newsroom');
    if (nf) { fbox(g, 'black', nf, 0.1, nf.F.len - 0.1, 0.8, 2.6, 0, 0.05); fscreen(g, SCR_TEAL, nf, nf.F.len / 2, 1.7, nf.F.len - 0.3, 1.7, 0.056); }
    cove('F3_newsroom', 'glow_cool');
  }

  // ---------------- Exec Office and Boardroom: timber rafters, hanji coffer, stone-clad wraps ----------------
  {
    const g = D('exec');
    rafters([-25.6, 9.3, -12.3, 14.7], 'z', 0.55, 'dz_wood_black', 0.12);
    for (const [x, z] of [[-19.8, 11.5], [-15.0, 12.0]]) if (freeHigh([x - 0.3, z - 0.3, x + 0.3, z + 0.3], 'exec pendant')) pendant(g, x, z, 2.35, 0.22, 0.34);
    const ef = roomFace('F3_W47', 'F3_exec_office');
    if (ef) { const L = ef.F.len; for (const [y0, y1] of [[0, 1.0], [1.03, 2.0], [2.03, 3.05]]) fbox(g, 'stone_dark', ef, 0.02, L - 0.02, y0, y1, 0, 0.04); fbox(g, 'glow_warm', ef, 0.02, L - 0.02, 0.0, 3.05, 0, 0.004); }
    // boardroom: a lattice-and-hanji light coffer over the planned table, pendant line along the glass
    const t = K.prop('PR72');
    if (t) {
      const [x0, z0, x1, z1] = t.rec.box, X0 = x0 - 0.4, X1 = x1 + 0.4, Z0 = z0 - 0.4, Z1 = z1 + 0.4;
      if (freeHigh([X0, Z0, X1, Z1], 'board coffer')) {
        rim(g, 'dz_wood_black', X0 - 0.15, X1 + 0.15, Z0 - 0.15, Z1 + 0.15, 0.15, 2.88, 3.1);
        B(g, 'f3_lamp_soft', X0, X1, 2.96, 3.09, Z0, Z1, '+y');
        for (let x = X0 + 0.25; x < X1 - 0.1; x += 0.25) B(g, 'wood_dark', x - 0.015, x + 0.015, 2.9, 2.97, Z0, Z1, '+y');
        for (let z = Z0 + 0.25; z < Z1 - 0.1; z += 0.25) B(g, 'wood_dark', X0, X1, 2.9, 2.97, z - 0.015, z + 0.015, '+y');
      }
    }
    for (let x = -24.0; x <= -14.0; x += 2.5) if (freeHigh([x - 0.3, 24.0, x + 0.3, 24.6], 'board pendant')) pendant(g, x, 24.3, 2.45, 0.16, 0.42);
    rafters([-25.6, 15.3, -12.3, 25.7], 'z', 0.55, 'dz_wood_black', 0.1);
    cove('F3_exec_office'); cove('F3_boardroom');
  }

  // ---------------- Sky suite: lounge (fireplace in the core wall), bath (built-in stone bath), bedroom ----------------
  {
    const g = D('suite');
    // linear fireplace set into the core face: stone surround, black firebox, warm flame strip (built in, flush)
    const sf = roomFace('F3_W02', 'F3_suite_lounge');
    if (sf) {
      const d = sf.F.d[0] > 0 ? 1 : -1, uAt = (x) => (d > 0 ? x + 9 : 9 - x);
      const ua = Math.min(uAt(3.2), uAt(8.4)), ub = Math.max(uAt(3.2), uAt(8.4));
      if (free([3.2, 9.25, 8.4, 9.45], 'fireplace')) {
        fbox(g, 'stone_dark', sf, ua, ub, 0, 3.05, 0, 0.08);
        fbox(g, 'black', sf, ua + 0.6, ub - 0.6, 0.35, 0.85, 0.08, 0.1);
        fbox(g, 'glow_warm', sf, ua + 0.75, ub - 0.75, 0.42, 0.5, 0.1, 0.11);
        fbox(g, 'dz_lamp', sf, ua + 0.75, ub - 0.75, 0.5, 0.58, 0.1, 0.105);
        fbox(g, 'bronze', sf, ua + 0.55, ub - 0.55, 0.85, 0.88, 0.08, 0.14);
        fbox(g, 'glow_warm', sf, ua, ub, 3.0, 3.02, 0.08, 0.09);
      }
    }
    rafters([-8.7, 11.2, 8.7, 16.7], 'x', 0.55, 'dz_wood_black', 0.12);
    for (const [x, z] of [[-4.5, 13.5], [4.0, 15.2], [-1.0, 15.6]]) if (freeHigh([x - 0.3, z - 0.3, x + 0.3, z + 0.3], 'suite pendant')) pendant(g, x, z, 2.3, 0.26, 0.4);
    cove('F3_suite_lounge');
    // bath: a hanji light panel over the planned bath and a rain-shower ceiling head
    cloud(g, 'dz_lamp', [-8.3, 21.7, -4.7, 25.3], 2.98, 0.05, null, 'bath panel');
    if (freeHigh([-6.0, 18.0, -5.0, 19.0], 'rain head')) { BT(g, 'dz_steel', 'dz_steel', -5.9, -5.1, 3.0, 3.03, 18.1, 18.9); C(g, 'glow_cool', 'glow_cool', -5.5, 18.5, 0.3, 2.995, 3.0, 16); }
    for (const wid of ['F3_W54', 'F3_W58']) { const f = roomFace(wid, 'F3_suite_bath'); if (f) fslats(g, f, 0.05, f.F.len - 0.05, 0, 3.05, { mk: 'stone_warm', back: 'stone_dark', pitch: 0.2, sw: 0.16 }); }
    seams([-8.9, 17.1, -0.1, 25.9], 0.9, 'stone_dark', 0.008);
    // bedroom: a lattice coffer over the planned bed and a warm cove
    const bd = K.prop('PR74');
    if (bd) {
      const [x0, z0, x1, z1] = bd.rec.box;
      if (freeHigh([x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3], 'bed coffer')) {
        rim(g, 'wood_dark', x0 - 0.45, x1 + 0.45, z0 - 0.45, z1 + 0.45, 0.15, 2.9, 3.1);
        B(g, 'f3_lamp_soft', x0 - 0.3, x1 + 0.3, 2.97, 3.09, z0 - 0.3, z1 + 0.3, '+y');
        for (let x = x0 - 0.05; x < x1 + 0.3; x += 0.25) B(g, 'wood_dark', x - 0.015, x + 0.015, 2.91, 2.97, z0 - 0.3, z1 + 0.3, '+y');
      }
    }
    for (const wid of ['F3_W58', 'F3_W62']) { const f = roomFace(wid, 'F3_bedroom'); if (f) fslats(g, f, 0.05, f.F.len - 0.05, 0, 3.05, { glow: 'glow_warm' }); }
    cove('F3_bedroom'); cove('F3_suite_bath', 'glow_cool');
  }

  // ---------------- Projection, Foyer, Screening (built-in tiers, hung cinema screen, fibre-optic star ceilings) ----------------
  {
    const g = D('cinema');
    const stars = (box, n, seed) => {
      const R = K.rng(seed), q = new T.PlaneGeometry(0.03, 0.03); q.rotateX(PI / 2);
      for (let k = 0; k < n; k++) { const x = box[0] + R() * (box[2] - box[0]), z = box[1] + R() * (box[3] - box[1]); if (CUTS.some((b) => x > b[0] - 0.2 && x < b[2] + 0.2 && z > b[1] - 0.2 && z < b[3] + 0.2)) continue; const s = 0.5 + R() * 1.2; GE(g, 'f3_star', q, MX(x, CE - 0.004, z, 0, s, 1, s)); }
    };
    stars([9.4, 15.4, 14.6, 25.6], FAST ? 60 : 180, 331);
    stars([15.4, 9.4, 25.6, 25.6], FAST ? 120 : 420, 332);
    for (const [x, z] of [[12.0, 18.0], [12.0, 23.0]]) if (freeHigh([x - 1.0, z - 1.0, x + 1.0, z + 1.0], 'foyer ring')) { const tor = new T.TorusGeometry(0.9, 0.025, 6, 40); tor.rotateX(PI / 2); GE(g, 'glow_purple', tor, MX(x, 3.03, z)); }
    const ff = roomFace('F3_W62', 'F3_foyer');
    if (ff) fslats(g, ff, 0.05, ff.F.len - 0.05, 0, 3.05, { mk: 'dz_wood_black', back: 'black', glow: 'glow_pink' });
    // screening: the cinema screen hung 0.35 m off the north partition (no text), with a black masking frame
    if (free([18.3, 9.3, 24.1, 9.55], 'cinema screen')) {
      B(g, 'black', 18.3, 24.1, 0.75, 3.0, 9.42, 9.48);
      screen(g, SCR_CINE, 21.2, 1.9, 9.485, 5.5, 2.1, [0, 1]);
      for (const x of [18.6, 23.8]) C(g, 'black', 'black', x, 9.45, 0.006, 3.0, CE, 3, false);
      B(g, 'glow_purple', 18.3, 24.1, 0.72, 0.75, 9.42, 9.48);
    }
    for (const wid of ['F3_W66']) { const f = roomFace(wid, 'F3_screening'); if (f) fslats(g, f, 0.05, f.F.len - 0.05, 0, 3.05, { mk: 'f3_felt_indigo', back: 'black', glow: 'glow_purple', pitch: 0.1, sw: 0.07 }); }
    cove('F3_projection', 'glow_cool'); cove('F3_foyer', 'glow_purple');
  }
  dress('PR73', (g, i) => {   // stepped tiers rising south, 3 x 0.4 m: carpet treads, timber nosings, riser light lines, stone cheeks
    const [x0, z0, x1, z1] = i.box, h = i.h, n = 3, sd = (z1 - z0) / n, sh = h / n;
    for (let k = 0; k < n; k++) {
      const za = z0 + k * sd, ya = k * sh, yb = (k + 1) * sh;
      BT(g, 'stone_dark', 'carpet_indigo', x0 + 0.08, x1 - 0.08, ya, yb, za, z1, k ? '-y' : '');
      B(g, 'wood_dark', x0 + 0.08, x1 - 0.08, yb - 0.04, yb + 0.004, za - 0.02, za + 0.06);
      B(g, 'glow_warm', x0 + 0.2, x1 - 0.2, yb - 0.07, yb - 0.05, za - 0.012, za);
    }
    B(g, 'stone_dark', x0, x0 + 0.08, 0, h + 0.02, z0, z1); B(g, 'stone_dark', x1 - 0.08, x1, 0, h + 0.02, z0, z1);
    for (const x of [x0 + 0.04, x1 - 0.04]) for (let k = 0; k < n; k++) B(g, 'glow_purple', x - 0.042, x + 0.042, (k + 1) * sh - 0.15, (k + 1) * sh - 0.12, z0 + k * sd + 0.2, z0 + k * sd + 0.5);
  });
  dress('PR75', (g, i) => {   // stone bath, built in: rim, basin, still water, a bronze spout line
    const [x0, z0, x1, z1] = i.box, h = i.h, t = 0.14;
    BT(g, 'stone_warm', 'stone_warm', x0, x1, 0, h, z0, z0 + t); BT(g, 'stone_warm', 'stone_warm', x0, x1, 0, h, z1 - t, z1);
    BT(g, 'stone_warm', 'stone_warm', x0, x0 + t, 0, h, z0 + t, z1 - t); BT(g, 'stone_warm', 'stone_warm', x1 - t, x1, 0, h, z0 + t, z1 - t);
    B(g, 'stone_dark', x0 + t, x1 - t, 0, 0.2, z0 + t, z1 - t);
    B(g, 'f3_bathwater', x0 + t, x1 - t, 0.2, h - 0.12, z0 + t, z1 - t, '-y');
    B(g, 'glow_warm', x0 + 0.02, x1 - 0.02, 0.0, 0.03, z0 - 0.01, z0, '-y');
    B(g, 'bronze', x0 + 1.3, x1 - 1.3, h, h + 0.04, z1 - 0.12, z1 - 0.02);
  });

  // ---------------- Archive and Writers Room ----------------
  {
    const g = D('archive');
    const sh = K.prop('PR77');
    if (sh) { const [x0, z0, x1, z1] = sh.rec.box; for (const z of [z0 - 0.9, z1 + 0.9]) for (const [a, b] of runsAvoid('x', x0, x1, z, 0.05)) if (freeHigh([a, z - 0.05, b, z + 0.05], 'archive troffer')) { B(g, 'black', a, b, 3.02, 3.09, z - 0.07, z + 0.07, '+y'); B(g, 'glow_cool', a + 0.05, b - 0.05, 3.015, 3.02, z - 0.04, z + 0.04, '+y'); } }
    for (const x of [14.5, 18.5, 22.5]) cloud(g, 'f3_felt_indigo', [x - 1.4, -4.6, x + 1.4, -3.4], 2.82, 0.05, 'glow_cool', 'archive cloud');
    for (const wid of ['F3_W35', 'F3_W73']) { const f = roomFace(wid, 'F3_archive'); if (f) fslats(g, f, 0.05, f.F.len - 0.05, 0, 3.05, { mk: 'alloy', back: 'black', glow: 'glow_cool' }); }
    const wt = K.prop('PR78');
    if (wt) { const [x0, , x1] = wt.rec.box, zc = (wt.rec.box[1] + wt.rec.box[3]) / 2; for (let x = x0 + 0.6; x < x1; x += 1.25) if (freeHigh([x - 0.3, zc - 0.3, x + 0.3, zc + 0.3], 'writers pendant')) pendant(g, x, zc, 2.3, 0.2, 0.42); }
    rafters([12.3, 0.3, 25.6, 8.7], 'x', 0.6, 'dz_wood_black', 0.1);
    for (const wid of ['F3_W66', 'F3_W73']) { const f = roomFace(wid, 'F3_writers_room'); if (f) fslats(g, f, 0.05, f.F.len - 0.05, 0, 3.05, { glow: 'glow_warm' }); }
    cove('F3_archive', 'glow_cool'); cove('F3_writers_room');
  }

  // ---------------- perimeter: flush trench-heater grilles inside the glass, blind pockets in the ceiling ----------------
  {
    const g = D('perimeter'), O = K.L.outline;
    const colHit = (p, pad) => K.L.columns.some((c) => Math.abs(p[0] - c.x) < c.w / 2 + pad && Math.abs(p[1] - c.z) < c.w / 2 + pad);
    for (let i = 0; i < O.length; i++) {
      const a = O[i], b = O[(i + 1) % O.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      let nn = [-d[1], d[0]]; const mid = [(a[0] + b[0]) / 2 + nn[0] * 0.5, (a[1] + b[1]) / 2 + nn[1] * 0.5]; if (!inPoly(mid, O)) nn = [-nn[0], -nn[1]];
      for (const [off, w, kind] of [[0.42, 0.22, 'trench'], [0.22, 0.12, 'pocket']]) {
        let run = null; const flush = () => {
          if (run && run[1] - run[0] > 0.5) {
            const s0 = run[0], s1 = run[1], m = [a[0] + d[0] * (s0 + s1) / 2 + nn[0] * off, a[1] + d[1] * (s0 + s1) / 2 + nn[1] * off];
            const D3 = [d[0], 0, d[1]], N3 = [nn[0], 0, nn[1]], hl = (s1 - s0) / 2;
            if (kind === 'trench') { K.obox(g('grating'), [m[0], Y + 0.002, m[1]], D3, [0, 1, 0], N3, [hl, 0.002, w / 2], '-y'); K.obox(g('glow_warm'), [m[0] + nn[0] * (w / 2 + 0.01), Y + 0.0015, m[1] + nn[1] * (w / 2 + 0.01)], D3, [0, 1, 0], N3, [hl, 0.0015, 0.01], '-y'); }
            else K.obox(g('black'), [m[0], Y + CE - 0.004, m[1]], D3, [0, 1, 0], N3, [hl, 0.004, w / 2], '+y');
          }
          run = null;
        };
        for (let s = 0.6; s <= L - 0.6 + 1e-6; s += 0.2) {
          const p = [a[0] + d[0] * s + nn[0] * off, a[1] + d[1] * s + nn[1] * off], r = roomAt(p);
          const ok = r && ['room', 'corridor'].includes(r.kind) && !colHit(p, 0.08) && !(kind === 'trench' && CUTS.some((c) => p[0] > c[0] && p[0] < c[2] && p[1] > c[1] && p[1] < c[3]));
          if (ok) { if (!run) run = [s, s]; run[1] = s; } else flush();
        }
        flush();
      }
    }
  }

  // skirtings and corridor wayfinding strips on every hard wall face, then the prop markers
  // ---------------- room identity pass: story lighting pools and built-ins (no furniture) ----------------
  {
    const g = D('identity');
    // S1 Control Room: dim and purple, blue spill from the multiviewer and the director window
    K.pool(FID, 7.6, -23.1, 1.9, 'pool_blue'); K.pool(FID, 7.9, -19.5, 1.6, 'pool_purple'); K.pool(FID, 4.0, -18.5, 2.4, 'pool_purple'); K.pool(FID, 3.0, -14.2, 1.2, 'pool_warm');
    // raked director's sill along the window: a sloped built-in console ledge under the glass (abstract graphics only)
    if (free([8.35, -21.9, 8.95, -17.1], 'director sill')) {
      B(g, 'black', 8.45, 8.95, 0, 0.7, -21.9, -17.1);
      const sl = new T.BoxGeometry(0.6, 0.04, 4.8); sl.rotateZ(0.32); GE(g, 'steel_dark', sl, MX(8.62, 0.76, -19.5));
      for (let k = 0; k < 6; k++) screen(g, k % 2 ? SCR_WAVE : SCR_FEED, 8.44, 0.5, -21.5 + k * 0.8, 0.62, 0.3, [-1, 0]);
    }
    // S1 Render Farm: cold-aisle blue, rack bay recessed in the fire wall with LED fronts
    for (const z of [-23.25, -19.9]) for (const x of [-7.2, -4.8, -2.4]) K.pool(FID, x, z, 1.2, 'pool_blue');
    const rf = roomFace('F3_W25', 'F3_render_farm');
    if (rf) { const L = rf.F.len; fbox(g, 'black', rf, 0.1, L - 0.1, 1.15, 2.45, 0, 0.05); for (let k = 0; k < 3; k++) fscreen(g, SCR_RACK, rf, 0.25 + (L - 0.5) * (k + 0.5) / 3, 1.8, (L - 0.6) / 3, 1.2, 0.056); }
  }
  skirtings((id) => (typeof FINISH !== 'undefined' ? FINISH.get(id) : ''));
  propMarkers(BUILTIN);
};
