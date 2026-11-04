/* ================================================================== PARTS.floor_2 */
// Interior architecture of F2 (97F Sky Lobby): gallery, reception and river lounge, S2 concierge and deposit, S3 lounge
// bar and wine room, the broadcast studio, noraebang and booths.
// No furniture: finishes, built-in fixtures and lights only. Layout props that are not built-in become empty PROP_<id>
// markers (the furniture pack goes there). No logos and no readable text anywhere: screens carry abstract graphics only.
PARTS.floor_2 = function (K) {
  const FID = 'F2';
  // ---- shared dressing kit (the same block is in floor_1.js and floor_2.js; generated from t-f12arch/src) ----
  const T = K.THREE, Y = K.FY(FID), CE = K.CEIL, FAST = K.fast, PI = Math.PI;
  const RN = K.rng(FID === 'F1' ? 1201 : 1202);
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
    const F = K.wallFrame(w), fa = K.outlineDist(w.a) < 0.05, fb = K.outlineDist(w.b) < 0.05;
    // uLo/uHi: dressing on a face stays 0.46 m clear of a wall end on the glass (blast shutter curtain and housing)
    return { w, F, side, s: (side * F.t) / 2, room: side > 0 ? w.side_pos : w.side_neg, uLo: fa ? SHUT_CLEAR : -1e9, uHi: fb ? F.len - SHUT_CLEAR : 1e9 };
  }
  const SHUT_CLEAR = 0.46, FAC_INSET = 0.64;
  // plan limit of the shutter zone: a run along one axis at cross coordinate c stays 0.46 m inside the glass
  const inPlate = (c) => { const lim = Math.min(26 - SHUT_CLEAR, 47 - SHUT_CLEAR * Math.SQRT2 - Math.abs(c)); return [-lim, lim]; };
  // u ranges of the openings on a wall, padded
  const holesOf = (w, pad = 0.05) => (w.openings || []).map((o) => [o.u0 - pad, o.u1 + pad]);
  const hitsHole = (fc, u0, u1) => holesOf(fc.w).some(([a, b]) => u0 < b && u1 > a);
  // box on a wall face: u along the wall, y relative to the floor, d0..d1 out from the face
  function fbox(g, mk, fc, u0, u1, y0, y1, d0, d1, skip = '') {
    if (fc.uLo != null) { u0 = Math.max(u0, fc.uLo); u1 = Math.min(u1, fc.uHi); if (u1 - u0 < 0.02) return; }
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
    if (fc.uLo != null) { u0 = Math.max(u0, fc.uLo); u1 = Math.min(u1, fc.uHi); if (u1 - u0 < 0.3) return false; }
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
    if (fc.uLo != null) { u0 = Math.max(u0, fc.uLo); u1 = Math.min(u1, fc.uHi); if (u1 - u0 < 0.3) return false; }
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
      // edges on the glass sit behind the blast shutter zone (curtain and housing to 0.45 m inside the glass)
      const ins = (k) => { const p = P[(k + n) % n], q = P[(k + 1 + n) % n]; return K.outlineDist([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]) < 0.05 ? FAC_INSET : inset; };
      const iA = ins(i - 1), iS = ins(i), iB = ins(i + 1);
      const q0 = [a[0] + d[0] * iA + nn[0] * iS, a[1] + d[1] * iA + nn[1] * iS], q1 = [b[0] - d[0] * iB + nn[0] * iS, b[1] - d[1] * iB + nn[1] * iS];
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
      const [lo, hi] = inPlate(c);
      const run = (u0, u1) => { u0 = Math.max(u0, A0, lo + 0.05); u1 = Math.min(u1, A1, hi - 0.05); if (u1 - u0 > 0.2 && Math.abs(c) + 0.05 < 26 - SHUT_CLEAR) { if (X) B(g, mk, u0, u1, CE - depth, CE - 0.005, c - 0.05, c + 0.05, '+y'); else B(g, mk, c - 0.05, c + 0.05, CE - depth, CE - 0.005, u0, u1, '+y'); } };
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
  // ================= F2 97F Sky Lobby: gallery, reception, S2 concierge / deposit, S3 lounge bar / wine room, studio (architecture only) =================
  for (const r of ['F2_lounge_bar', 'F2_cigar_room', 'F2_wine_room', 'F2_river_lounge', 'F2_vip_lounge', 'F2_gallery', 'F2_garden_void']) K.ceiling(r, 'dz_wood_ceil');
  for (const r of ['F2_noraebang', 'F2_booth_1', 'F2_booth_2', 'F2_security', 'F2_deposit', 'F2_bridge_lobby']) K.ceiling(r, 'ceiling_dark');
  for (const r of ['F2_reception', 'F2_concierge', 'F2_cloakroom']) K.ceiling(r, 'dz_wood_ceil');
  K.finish('F2_lounge_bar', 'stone_dark');

  // lights (4): reception, lounge bar, studio stage, S2 pair
  K.light(FID, { pos: [2.0, Y + 2.8, 14.0], color: '#ffcf9c', intensity: 7, distance: 13, decay: 2 });
  K.light(FID, { pos: [-18.0, Y + 2.7, 3.2], color: '#ffb36b', intensity: 7, distance: 12, decay: 2 });
  K.light(FID, { pos: [17.0, Y + 5.2, -17.5], color: '#a070ff', intensity: 14, distance: 18, decay: 2 });
  K.light(FID, { pos: [19.0, Y + 2.7, 0.0], color: '#ffd9b0', intensity: 6, distance: 13, decay: 2 });

  const SCR_ART = screenMat('dz_scr_art', paintAbstract(211, 268, 6), { ei: 1.2 });
  const SCR_PINK = screenMat('dz_scr_pink', paintAbstract(212, 310, 8), { ei: 1.3 });
  const SCR_BARS = screenMat('dz_scr_bars', paintBars(213, 270, 330), { ei: 1.4 });
  const SCR_FEED = screenMat('dz_scr_feed', paintFeeds(214), { ei: 1.1 });
  const SCR_TEAL = screenMat('dz_scr_teal', paintAbstract(215, 196, 7), { ei: 1.2 });
  // the room-side face of a hard wall
  const roomFace = (wid, room) => { const f = face(wid, 1); return f && (f.room === room ? f : face(wid, -1)); };

  // built-in layout props (architecture): the round holo stage only. Everything else is a PROP_ marker.
  const BUILTIN = new Set(['PR42']);

  // ---------------- core faces: purple sconce rhythm (Reception north, Vault / Cellar Hall, Backstage) ----------------
  {
    const g = D('core_sconces');
    const runs = [['z', 9.0, -8.2, 8.2, 1], ['z', -9.0, -8.2, 8.2, -1], ['x', 9.0, -8.2, 8.2, 1], ['x', -9.0, -8.2, 8.2, -1]];
    for (const [ax, c0, a0, a1, s] of runs) for (let u = a0; u <= a1 + 0.01; u += 2.05) {
      const c = c0 + s * 0.3;
      const box = ax === 'z' ? [u - 0.2, c - 0.1, u + 0.2, c + 0.1] : [c - 0.1, u - 0.2, c + 0.1, u + 0.2];
      if (!free(box, 'core sconce')) continue;
      if (ax === 'z') { B(g, 'steel_dark', u - 0.08, u + 0.08, 0.5, 2.7, c, c + s * 0.05); B(g, 'glow_purple', u - 0.02, u + 0.02, 0.6, 2.6, c + s * 0.05, c + s * 0.06); }
      else { B(g, 'steel_dark', c, c + s * 0.05, 0.5, 2.7, u - 0.08, u + 0.08); B(g, 'glow_purple', c + s * 0.05, c + s * 0.06, 0.6, 2.6, u - 0.02, u + 0.02); }
    }
  }

  // ---------------- Gallery ----------------
  {
    const g = D('gallery');
    for (const [x, z] of [[-24.5, 10.5], [-19.5, 10.5], [-15.0, 10.5], [-10.5, 13.0], [-10.5, 20.0], [-10.5, 24.5]]) if (freeHigh([x - 0.3, z - 0.3, x + 0.3, z + 0.3], 'gallery pendant')) pendant(g, x, z, 2.55, 0.18, 0.5);
    const gf = roomFace('F2_W80', 'F2_gallery');
    if (gf) flattice(g, gf, 0.1, gf.F.len - 0.1, 0.3, 2.8, { cell: 0.2 });
    const lf = roomFace('F2_W15', 'F2_gallery');
    if (lf) fslats(g, lf, 0.05, lf.F.len - 0.05, 0, 3.05, { glow: 'glow_purple' });
  }

  // ---------------- Reception ----------------
  {
    const g = D('reception');
    // backdrop wall (hard): lattice and hanji on the west face, a large abstract art screen on the east face
    const bw = face('F2_W84', 1), bw2 = face('F2_W84', -1);
    if (bw && bw2) {
      const west = bw.F.n[0] * bw.side < 0 ? bw : bw2, east = west === bw ? bw2 : bw, L = bw.F.len;
      flattice(g, west, 0.2, L - 0.2, 0.25, 2.95, { cell: 0.22, mk: 'wood' });
      fbox(g, 'black', east, 0.2, L - 0.2, 0.4, 2.85, 0, 0.05); fscreen(g, SCR_ART, east, L / 2, 1.62, L - 0.6, 2.3, 0.056);
      fbox(g, 'glow_purple', east, 0.2, L - 0.2, 0.36, 0.38, 0, 0.05);
    }
    // hanji light coffer in the ceiling over the reception floor, and a ring of stone inlay in the floor
    if (freeHigh([-1.2, 11.9, 5.2, 13.0], 'reception coffer')) { BT(g, 'wood_dark', 'wood_dark', -1.2, 5.2, 2.9, 2.96, 11.9, 13.0, '+y'); B(g, 'dz_lamp', -1.1, 5.1, 2.96, 3.06, 12.0, 12.9, '+y'); }
    const ring = new T.RingGeometry(1.7, 1.78, 48); ring.rotateX(-PI / 2); GE(g, 'glow_warm', ring, MX(-4.0, 0.003, 17.8));
    const dsk = new T.CircleGeometry(1.7, 48); dsk.rotateX(-PI / 2); GE(g, 'stone_warm', dsk, MX(-4.0, 0.002, 17.8));
    cove('F2_reception');
  }

  // ---------------- River Lounge ----------------
  {
    const g = D('river');
    for (const [x, z] of [[3.5, 23.8], [-6.5, 21.5], [6.5, 24.6]]) if (freeHigh([x - 0.3, z - 0.3, x + 0.3, z + 0.3], 'river pendant')) pendant(g, x, z, 2.6, 0.2, 0.4);
    const rf = roomFace('F2_W80', 'F2_river_lounge'), cf = roomFace('F2_W86', 'F2_river_lounge');
    if (rf) fslats(g, rf, 0.05, rf.F.len - 0.05, 0, 3.05, { glow: 'glow_warm' });
    if (cf) fslats(g, cf, 0.05, cf.F.len - 0.05, 0, 3.05, { glow: 'glow_warm' });
    cove('F2_river_lounge', 'glow_purple');
  }

  // ---------------- Security, Cloakroom, Bridge Lobby, VIP ----------------
  {
    const g = D('east_lobby');
    // security: ceiling-hung monitor array along the north side
    if (freeHigh([9.4, 9.2, 13.6, 9.6], 'security monitors')) {
      // one row, lower edge 2.22 m: the doors below keep their 2.0 m envelope plus head room
      for (let k = 0; k < 3; k++) wallScreen(g, k === 1 ? SCR_TEAL : SCR_FEED, 10.2 + k * 1.3, 2.5, 9.5, 1.2, 0.56, [0, 1]);
      B(g, 'black', 9.4, 13.6, 2.75, 2.8, 9.4, 9.46); for (const x of [9.6, 13.4]) C(g, 'black', 'black', x, 9.43, 0.01, 2.8, CE, 4, false);
    }
    // bridge lobby: art screen on the hard bridge screen's west face, a light ring, floor guide lines to the portal
    const sw = face('F2_W77', 1), sw2 = face('F2_W77', -1);
    if (sw && sw2) { const west = sw.F.n[0] * sw.side < 0 ? sw : sw2, L = sw.F.len; fbox(g, 'black', west, 0.2, L - 0.2, 0.35, 2.7, 0, 0.05); fscreen(g, SCR_ART, west, L / 2, 1.52, L - 0.6, 2.2, 0.056); }
    // its east face is what the skybridge looks at through the portal: a lit arrival wall (teal-violet art panel in a
    // bronze frame, a warm wash above and below) so the portal reads as a doorway into a lit lobby, not a dead end
    if (sw && sw2) { const east = sw.F.n[0] * sw.side > 0 ? sw : sw2, L = sw.F.len; fbox(g, 'bronze', east, 0.15, L - 0.15, 0.3, 2.75, 0, 0.04); fbox(g, 'black', east, 0.22, L - 0.22, 0.37, 2.68, 0.04, 0.05); fscreen(g, SCR_TEAL, east, L / 2, 1.52, L - 0.6, 2.2, 0.056); fbox(g, 'glow_warm', east, 0.15, L - 0.15, 2.95, 2.98, 0, 0.03); fbox(g, 'glow_warm', east, 0.15, L - 0.15, 0.02, 0.04, 0, 0.03); }
    if (freeHigh([17.6, 11.2, 20.8, 14.4], 'arrival ring')) { const tor = new T.TorusGeometry(1.6, 0.03, 6, 48); tor.rotateX(PI / 2); GE(g, 'glow_purple', tor, MX(19.2, 3.0, 12.8)); }
    for (const z of [13.1, 13.9]) B(g, 'glow_purple', 23.0, 25.9, 0, 0.002, z - 0.01, z + 0.01, '-y');
    // VIP: pendants and a cove; cloakroom cove
    for (const [x, z] of [[18.5, 21.0], [22.5, 22.0]]) if (freeHigh([x - 0.3, z - 0.3, x + 0.3, z + 0.3], 'vip pendant')) pendant(g, x, z, 2.5, 0.22, 0.36, 'dz_lamp_cool');
    const vf = roomFace('F2_W76', 'F2_vip_lounge'), cl = roomFace('F2_W86', 'F2_cloakroom');
    if (vf) flattice(g, vf, 0.05, vf.F.len - 0.05, 0.3, 2.8, { back: 'dz_lamp_cool' });
    if (cl) fslats(g, cl, 0.05, cl.F.len - 0.05, 0, 3.05);
    cove('F2_vip_lounge', 'glow_purple'); cove('F2_cloakroom');
  }

  // ---------------- S2 Concierge / Deposit ----------------
  dress('PR42', (g, i) => {   // round holo stage: LED skirt and concentric light rings on a black glass top (built-in)
    const [x0, z0, x1, z1] = i.box, h = i.h, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, r = Math.min(x1 - x0, z1 - z0) / 2;
    C(g, 'steel_dark', 'black', cx, cz, r, 0, h, 48);
    C(g, 'glow_purple', 'glow_purple', cx, cz, r + 0.004, 0.05, 0.08, 48, false);
    for (let k = 0; k < 24; k++) { const a = (k / 24) * PI * 2; B(g, 'alloy', cx + Math.sin(a) * (r + 0.005) - 0.02, cx + Math.sin(a) * (r + 0.005) + 0.02, 0.1, h - 0.05, cz + Math.cos(a) * (r + 0.005) - 0.02, cz + Math.cos(a) * (r + 0.005) + 0.02); }
    for (const [ra, rb, mk] of [[0.4, 0.46, 'glow_pink'], [1.3, 1.34, 'glow_purple'], [2.2, 2.24, 'glow_purple'], [3.0, 3.04, 'glow_cool']]) { const rg = new T.RingGeometry(ra, rb, 64); rg.rotateX(-PI / 2); GE(g, mk, rg, MX(cx, h + 0.003, cz)); }
  });
  {
    const g = D('site2');
    // deposit: built-in lockbox wall cladding on the hard backing wall (deposit face)
    const df = roomFace('F2_W54', 'F2_deposit');
    if (df) {
      const L = df.F.len;
      fbox(g, 'steel_dark', df, 0.1, L - 0.1, 0, 2.7, 0, 0.12);
      for (let y = 0.15; y < 2.4; y += 0.3) for (let u = 0.2; u < L - 0.5; u += 0.4) { fbox(g, 'bronze', df, u + 0.01, u + 0.37, y + 0.01, y + 0.28, 0.12, 0.132); fbox(g, 'black', df, u + 0.16, u + 0.2, y + 0.12, y + 0.16, 0.132, 0.137); }
      fbox(g, 'glow_warm', df, 0.15, L - 0.15, 2.6, 2.62, 0.12, 0.13);
    }
    const d2 = roomFace('F2_W58', 'F2_deposit'), c2 = roomFace('F2_W65', 'F2_concierge');
    // second lockbox wall (deposit face of the column wrap) with a stainless trim band
    if (d2) { const L = d2.F.len; fbox(g, 'steel_dark', d2, 0.05, L - 0.05, 0, 2.7, 0, 0.1); for (let y = 0.15; y < 2.4; y += 0.3) for (let u = 0.12; u < L - 0.4; u += 0.4) fbox(g, 'bronze', d2, u + 0.01, u + 0.37, y + 0.01, y + 0.28, 0.1, 0.112); fbox(g, 'dz_steel', d2, 0.05, L - 0.05, 2.45, 2.52, 0.1, 0.12); }
    // concierge: backlit onyx panels on the hard wraps
    for (const f of [c2, roomFace('F2_W70', 'F2_concierge')]) if (f) { const L = f.F.len; fbox(g, 'dz_onyx', f, 0.08, L - 0.08, 0.1, 2.95, 0, 0.03); fbox(g, 'bronze', f, 0.04, L - 0.04, 0, 0.1, 0, 0.05); }
    K.pool(FID, 15.5, -4.5, 1.8, 'pool_purple'); K.pool(FID, 22.0, -5.5, 1.8, 'pool_purple'); K.pool(FID, 24.4, -7.5, 1.3, 'pool_warm');
    K.pool(FID, 19.0, 3.8, 2.4, 'pool_warm'); K.pool(FID, 24.6, 4.5, 1.4, 'pool_warm');
    // concierge: hanji lanterns hung in a canopy line
    if (freeHigh([15.6, 3.0, 22.4, 4.6], 'concierge canopy')) {
      for (let k = 0; k < 6; k++) { const x = 16.0 + k * 1.15; lantern(g, x, 3.8, 2.45 - (k % 2) * 0.15, 0.32, 0.5); C(g, 'black', 'black', x, 3.8, 0.004, 2.95 - (k % 2) * 0.15, CE, 3, false); }
    }
    cove('F2_concierge'); cove('F2_deposit', 'glow_purple');
  }

  // ---------------- Studio ----------------
  {
    const g = D('studio');
    // LED volume on the studio face of the hard backing wall
    const sf = roomFace('F2_W54', 'F2_studio');
    if (sf) { const L = sf.F.len; fbox(g, 'black', sf, 0.05, L - 0.05, 0.1, 3.85, 0, 0.1); fscreen(g, SCR_PINK, sf, L / 2, 1.97, L - 0.2, 3.7, 0.106); }
    // lighting truss over the stage: cans end 2.34 m above the grid catwalks (>= 2.2 m clear)
    const ty = 6.95;
    for (const z of [-20.5, -14.5]) { B(g, 'alloy', 11.5, 25.0, ty, ty + 0.06, z - 0.2, z - 0.15); B(g, 'alloy', 11.5, 25.0, ty, ty + 0.06, z + 0.15, z + 0.2); for (let x = 11.6; x < 25; x += 0.5) BM(g, 'alloy', [x, ty + 0.03, z - 0.17], [x + 0.25, ty + 0.03, z + 0.17], 0.025); }
    for (const x of [12.5, 21.5]) { B(g, 'alloy', x - 0.2, x - 0.15, ty, ty + 0.06, -24.5, -10.5); B(g, 'alloy', x + 0.15, x + 0.2, ty, ty + 0.06, -24.5, -10.5); }
    for (const [x, z] of [[11.6, -20.4], [11.6, -14.6], [24.9, -20.4], [24.9, -14.6]]) C(g, 'black', 'black', x, z, 0.008, ty, 7.3, 3, false);
    const can = new T.CylinderGeometry(0.13, 0.16, 0.36, 10), lens = new T.CircleGeometry(0.12, 10); lens.rotateX(PI / 2);
    for (const z of [-20.5, -14.5]) for (let x = 13.0; x <= 21.0; x += 1.6) { GE(g, 'black', can, MX(x, ty - 0.22, z)); GE(g, (Math.round(x) % 3) ? 'glow_cool' : 'glow_pink', lens, MX(x, ty - 0.405, z)); }
    const gf = roomFace('F2_W51', 'F2_studio');
    if (gf) fslats(g, gf, 0.05, gf.F.len - 0.05, 0, 3.05, { mk: 'alloy', back: 'black', glow: 'glow_pink' });
    haze([[17.0, 1.2, -17.5, 4.5], [15.0, 2.2, -19.0, 4.0], [19.0, 1.8, -16.0, 4.2]], '#b48cff', 0.06);
  }

  // ---------------- Backstage: Green Room, Makeup, Wardrobe ----------------
  {
    const g = D('backstage');
    for (const [x, z] of [[3.0, -21.8], [6.5, -22.5], [7.5, -14.0]]) if (freeHigh([x - 0.3, z - 0.3, x + 0.3, z + 0.3], 'green pendant')) pendant(g, x, z, 2.5, 0.2, 0.36);
    for (const [x, z] of [[-6.9, -15.2], [-2.6, -15.2], [-4.5, -22.5]]) if (freeHigh([x - 0.3, z - 0.3, x + 0.3, z + 0.3], 'makeup pendant')) pendant(g, x, z, 2.55, 0.16, 0.3, 'dz_lamp_cool');
    const gw = roomFace('F2_W48', 'F2_green_room'), ww = roomFace('F2_W48', 'F2_wardrobe'), w2 = roomFace('F2_W43', 'F2_wardrobe');
    if (gw) fslats(g, gw, 0.05, gw.F.len - 0.05, 0, 3.05, { glow: 'glow_warm' });
    if (ww) fslats(g, ww, 0.05, ww.F.len - 0.05, 0, 3.05);
    if (w2) fslats(g, w2, 0.05, w2.F.len - 0.05, 0, 3.05);
    cove('F2_green_room'); cove('F2_makeup', 'glow_cool');
  }

  // ---------------- Noraebang and Booths ----------------
  {
    const g = D('noraebang');
    // the big karaoke screen on the stone cellar wall (hard)
    const kf = roomFace('F2_W31', 'F2_noraebang');
    if (kf) { const L = kf.F.len; fbox(g, 'black', kf, L / 2 - 2.3, L / 2 + 2.3, 0.35, 2.85, 0, 0.05); fscreen(g, SCR_BARS, kf, L / 2, 1.6, 4.4, 2.4, 0.056); fbox(g, 'glow_pink', kf, L / 2 - 2.3, L / 2 + 2.3, 0.3, 0.32, 0, 0.05); }
    for (const [x, z, r, mk] of [[-14.0, -16.0, 1.2, 'glow_pink'], [-11.5, -21.5, 0.9, 'glow_purple'], [-16.2, -24.5, 0.7, 'glow_purple']]) if (freeHigh([x - r, z - r, x + r, z + r], 'karaoke ring')) { const tor = new T.TorusGeometry(r, 0.03, 6, 40); tor.rotateX(PI / 2); GE(g, mk, tor, MX(x, 3.02, z)); }
    // booths: ceiling-hung screens and rings (Booth 2's hatch stays clear)
    if (freeHigh([-24.6, -12.6, -21.0, -12.2], 'booth1 screen')) { wallScreen(g, SCR_PINK, -22.8, 2.65, -12.45, 2.6, 0.8, [0, -1]); /* over door F2_O16: lower edge 2.25 m */ for (const x of [-24.0, -21.6]) C(g, 'black', 'black', x, -12.42, 0.006, 2.6, CE, 3, false); }
    if (freeHigh([-24.8, -18.6, -20.8, -18.2], 'booth2 screen')) { wallScreen(g, SCR_ART, -22.8, 1.95, -18.35, 2.6, 1.3, [0, -1]); for (const x of [-24.0, -21.6]) C(g, 'black', 'black', x, -18.32, 0.006, 2.6, CE, 3, false); }
    for (const [x, z] of [[-20.0, -14.0], [-19.5, -22.5]]) if (freeHigh([x - 0.7, z - 0.7, x + 0.7, z + 0.7], 'booth ring')) { const tor = new T.TorusGeometry(0.6, 0.025, 6, 32); tor.rotateX(PI / 2); GE(g, 'glow_pink', tor, MX(x, 3.03, z)); }
    const b1 = roomFace('F2_W40', 'F2_booth_1'), b2 = roomFace('F2_W40', 'F2_booth_2'), n2 = roomFace('F2_W38', 'F2_noraebang');
    for (const f of [b1, b2, n2]) if (f) fslats(g, f, 0.05, f.F.len - 0.05, 0, 3.05, { mk: 'dz_wood_black', back: 'black', glow: 'glow_pink' });
  }

  // ---------------- S3 Lounge Bar / Wine Room, Cigar Room ----------------
  {
    const g = D('site3');
    const [bx0, , bx1] = K.prop('PR34').box;   // pendants over the planned bar line
    for (let x = bx0 + 0.5; x < bx1; x += 1.25) if (freeHigh([x - 0.25, 3.7, x + 0.25, 4.3], 'bar pendant')) pendant(g, x, 4.0, 2.2, 0.12, 0.42, 'dz_lamp');
    if (freeHigh([-16.4, -5.6, -15.6, -4.9], 'wine pendant')) pendant(g, -16.0, -5.25, 2.2, 0.28, 0.2);
    for (const [x, z] of [[-24.0, -3.0], [-22.0, -10.5]]) if (freeHigh([x - 0.3, z - 0.3, x + 0.3, z + 0.3], 'cigar pendant')) pendant(g, x, z, 2.3, 0.2, 0.3);
    // lounge bar: lattice on its wall stubs; wine room: backlit stone panels with glowing seams on the cellar walls
    const lb = roomFace('F2_W15', 'F2_lounge_bar'), lc = roomFace('F2_W27', 'F2_lounge_bar'), cg = roomFace('F2_W27', 'F2_cigar_room');
    if (lb) flattice(g, lb, 0.05, lb.F.len - 0.05, 0.3, 2.8);
    if (lc) flattice(g, lc, 0.05, lc.F.len - 0.05, 0.3, 2.8);
    if (cg) fslats(g, cg, 0.05, cg.F.len - 0.05, 0, 3.05, { mk: 'dz_wood_black', back: 'black', glow: 'glow_warm' });
    for (const wid of ['F2_W31', 'F2_W32']) {
      const wf = roomFace(wid, 'F2_wine_room'); if (!wf) continue;
      const L = wf.F.len, n = Math.max(1, Math.round(L / 1.0)), pw = L / n;
      fbox(g, 'black', wf, 0.05, L - 0.05, 0.2, 2.8, 0, 0.01);
      for (let k = 0; k < n; k++) for (const [y0, y1] of [[0.0, 1.0], [1.04, 2.0], [2.04, 3.05]]) fbox(g, 'stone_dry', wf, k * pw + 0.02, (k + 1) * pw - 0.02, y0, y1, 0.01, 0.06);
      // wine niches: rows of dark cells with a warm lamp line at each shelf head
      for (let k = 0; k < n; k++) for (const y of [0.35, 0.75, 1.15, 1.55]) { fbox(g, 'black', wf, k * pw + 0.12, (k + 1) * pw - 0.12, y, y + 0.3, 0.06, 0.062); fbox(g, 'glow_warm', wf, k * pw + 0.14, (k + 1) * pw - 0.14, y + 0.28, y + 0.29, 0.062, 0.066); }
    }
    cove('F2_lounge_bar'); cove('F2_cigar_room'); cove('F2_wine_room');
    rafters([-25.6, 0.4, -12.4, 8.6], 'x', 1.0, 'dz_wood_black', 0.16);
  }

  // skirtings and corridor wayfinding strips on every hard wall face, then the prop markers
  // ---------------- room identity pass: S3 story lighting and the bronze bar raft ----------------
  {
    const g = D('identity');
    const pb = K.prop('PR34');
    if (pb) { const [x0, z0, x1, z1] = pb.box; if (freeHigh([x0 - 0.3, z0 - 0.6, x1 + 0.3, z1 + 0.6], 'bar raft')) { B(g, 'bronze', x0 - 0.3, x1 + 0.3, 2.86, 2.92, z0 - 0.6, z1 + 0.6); B(g, 'glow_warm', x0 - 0.28, x1 + 0.28, 2.855, 2.86, z0 - 0.58, z0 - 0.55, '+y'); B(g, 'glow_warm', x0 - 0.28, x1 + 0.28, 2.855, 2.86, z1 + 0.55, z1 + 0.58, '+y'); }
      for (let x = x0 + 0.5; x < x1; x += 1.25) K.pool(FID, x, (z0 + z1) / 2, 1.1, 'pool_warm'); }
    K.pool(FID, -16.0, -10.6, 2.2, 'pool_warm'); K.pool(FID, -16.0, -5.25, 1.2, 'pool_warm');
    K.pool(FID, -24.0, -3.0, 1.0, 'pool_warm'); K.pool(FID, -22.0, -10.5, 1.0, 'pool_warm');
  }
  skirtings((id) => (typeof FINISH !== 'undefined' ? FINISH.get(id) : ''));
  propMarkers(BUILTIN);
};
