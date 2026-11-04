/* ================================================================== PARTS.floor_1 */
// Interior architecture of F1 (96F Garden Level): sky garden and pavilion, S4 tea room and ondol lounge, spa and bath,
// kitchen, dining and back of house.
// No furniture: finishes, built-in fixtures and lights only. Layout props that are not built-in become empty PROP_<id>
// markers (the furniture pack goes there). No logos and no readable text anywhere: screens carry abstract graphics only.
PARTS.floor_1 = function (K) {
  const FID = 'F1';
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
  mat('dz_lacquer', 'plaster', { color: '#9a2e20', rough: 0.3, tile: 1.2, ns: 0.2 });   // smooth lacquer (no plank bands on the posts)
  mat('dz_wood_mid', 'wood', { color: '#9a6a44', rough: 0.55, tile: 1.2 });
  mat('dz_wood_black', 'wood', { color: '#2a1d17', rough: 0.4, tile: 1.2 });
  mat('dz_wood_ceil', 'wood', { color: '#3b2a20', rough: 0.7, tile: 3.6, ns: 0.4 });   // broad boards: no moire at a distance
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
  mat('dz_giwa', 'polished', { color: '#3a3c43', rough: 0.5, tile: 1.0, ns: 0.4 });
  mat('dz_giwa_r', 'polished', { color: '#2c2e34', rough: 0.45, tile: 1.0, ns: 0.4 });
  mat('dz_basalt', 'polished', { color: '#3d3c3b', rough: 0.25, tile: 1.0, ns: 0.6 });
  mat('dz_earth', 'carpet', { color: '#2a2219', rough: 1.0, tile: 0.8, ns: 1.0 });
  mat('dz_maple', 'carpet', { color: '#8a2416', rough: 0.85, tile: 0.4, ns: 1.0 });
  mat('dz_maple2', 'carpet', { color: '#b05a1c', rough: 0.85, tile: 0.4, ns: 1.0 });
  mat('dz_lamp_dim', 'hanji', { color: '#d8cbb6', rough: 0.8, tile: 0.6, em: '#ffb878', ei: 0.45 });
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
  const ICO = new T.IcosahedronGeometry(1, 1), ICO0 = new T.IcosahedronGeometry(1, 0), SPH = new T.SphereGeometry(1, 9, 6), SPH0 = new T.SphereGeometry(1, 7, 5);
  function shrub(g, x, z, y0, r, h, mk = 'dz_foliage', n = 4, seed = 1) {
    const R = K.rng(seed);
    for (let k = 0; k < n; k++) { const a = R() * PI * 2, d = R() * r * 0.5; GE(g, mk, FAST ? SPH0 : SPH, MX(x + Math.cos(a) * d, y0 + h * (0.35 + R() * 0.3), z + Math.sin(a) * d, R() * 3, r * (0.55 + R() * 0.3), h * (0.35 + R() * 0.2), r * (0.55 + R() * 0.3))); }
  }
  // a sculpted pine: leaning trunk and flat cloud pads
  function pine(g, x, z, y0, h, seed = 3, lean = [0.5, 0.2]) {
    const R = K.rng(seed); let p = [x, y0, z];
    for (let k = 0; k < 4; k++) { const q = [p[0] + lean[0] * (0.25 + R() * 0.2), p[1] + h / 4.6, p[2] + lean[1] * (0.25 + R() * 0.2)]; BM(g, 'dz_wood_black', p, q, 0.16 - k * 0.025); p = q; }
    for (let k = 0; k < 6; k++) { const yy = y0 + h * (0.5 + k * 0.085), a = R() * PI * 2, d = 0.25 + R() * 0.45, px = p[0] + Math.cos(a) * d - lean[0] * (1 - k * 0.2), pz = p[2] + Math.sin(a) * d;
      for (let j = 0; j < 6; j++) GE(g, j % 3 ? 'dz_pine' : 'dz_foliage', SPH0, MX(px + (R() - 0.5) * 0.55, yy + (k === 5 ? 0.1 : 0) + (R() - 0.5) * 0.05, pz + (R() - 0.5) * 0.55, R() * 3, 0.2 + R() * 0.12, 0.07 + R() * 0.03, 0.17 + R() * 0.1)); }
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
  // ================= F1 96F Garden Level: sky garden, spa, kitchen and back of house (architecture only) =================
  // finishes and ceilings
  for (const r of ['F1_tea_room', 'F1_ondol_lounge', 'F1_veranda', 'F1_dining_room', 'F1_garden', 'F1_garden_lobby', 'F1_lockers', 'F1_treatment']) K.ceiling(r, 'dz_wood_ceil');
  for (const r of ['F1_bathhouse', 'F1_steam_room', 'F1_changing', 'F1_salt_room']) K.ceiling(r, 'ceiling_dark');
  K.finish('F1_bathhouse', 'stone_dark'); K.finish('F1_spa_hall', 'stone_dark');

  // lights (4): pavilion, site pair, bath, dining
  K.light(FID, { pos: [-15.4, Y + 3.0, 19.0], color: '#ffc58a', intensity: 9, distance: 15, decay: 2 });
  K.light(FID, { pos: [0, Y + 2.7, 16.5], color: '#ffcf9c', intensity: 6, distance: 12, decay: 2 });
  K.light(FID, { pos: [20.7, Y + 2.4, 15.0], color: '#9a6bff', intensity: 8, distance: 13, decay: 2 });
  K.light(FID, { pos: [-18.5, Y + 2.6, -17.5], color: '#ffc58a', intensity: 6, distance: 12, decay: 2 });

  // built-in layout props (architecture): pavilion, pool, garden rocks, stone screen, maru floor, ondol bench,
  // steam bench, shower block, hot pool. Everything else on this floor is a PROP_ marker for the furniture pack.
  const BUILTIN = new Set(['PR01', 'PR02', 'PR03', 'PR04', 'PR05', 'PR07', 'PR11', 'PR18', 'PR19']);

  // ---------------- Garden ----------------
  dress('PR01', (g, i) => {   // pavilion: stone plinth, timber deck, cinnabar posts, steep sweeping roof
    const [x0, z0, x1, z1] = i.box, h = i.h, r = i.rec.roof, eb = r.eaves_box;
    BT(g, 'stone_dark', 'stone_dark', x0, x1, 0, h - 0.14, z0, z1);
    BT(g, 'wood_dark', 'dz_wood_mid', x0 + 0.08, x1 - 0.08, h - 0.14, h, z0 + 0.08, z1 - 0.08);
    for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.6) B(g, 'black', x - 0.006, x + 0.006, h, h + 0.002, z0 + 0.1, z1 - 0.1);
    B(g, 'glow_warm', x0 + 0.1, x1 - 0.1, h - 0.16, h - 0.14, z0 + 0.1, z1 - 0.1, '+y');   // under-deck glow line
    const px = [x0 + 0.35, x1 - 0.35], pz = [z0 + 0.35, z1 - 0.35], ty = r.eave_y - 0.15;
    for (const x of px) for (const z of pz) { C(g, 'dz_lacquer', 'stone_dark', x, z, 0.11, h, ty, 10); C(g, 'stone_dark', 'stone_dark', x, z, 0.17, h, h + 0.12, 10); }
    for (const z of pz) B(g, 'dz_lacquer', px[0] - 0.12, px[1] + 0.12, ty - 0.3, ty, z - 0.08, z + 0.08);
    for (const x of px) B(g, 'dz_lacquer', x - 0.08, x + 0.08, ty - 0.3, ty, pz[0] - 0.12, pz[1] + 0.12);
    for (const x of px) for (const z of pz) {   // ikgong brackets: a capital block and stepped wing arms along both beams
      B(g, 'wood_dark', x - 0.2, x + 0.2, ty, ty + 0.14, z - 0.2, z + 0.2);
      B(g, 'dz_wood_mid', x - 0.55, x + 0.55, ty - 0.24, ty - 0.06, z - 0.06, z + 0.06); B(g, 'dz_wood_mid', x - 0.06, x + 0.06, ty - 0.24, ty - 0.06, z - 0.55, z + 0.55);
      B(g, 'dz_celadon', x - 0.4, x + 0.4, ty - 0.3, ty - 0.24, z - 0.065, z + 0.065); B(g, 'dz_celadon', x - 0.065, x + 0.065, ty - 0.3, ty - 0.24, z - 0.4, z + 0.4);
      B(g, 'wood_dark', x - 0.14, x + 0.14, ty - 0.06, ty, z - 0.14, z + 0.14);
    }
    for (const x of px) B(g, 'dz_wood_mid', x - 0.09, x + 0.09, ty + 0.14, ty + 0.26, eb[1] + 0.3, eb[3] - 0.3);   // purlins under the rafters
    for (const z of pz) B(g, 'dz_celadon', px[0] - 0.12, px[1] + 0.12, ty - 0.2, ty - 0.17, z - 0.085, z + 0.085);
    lattice(g, 'x', px[0] + 0.12, px[1] - 0.12, pz[0], h + 1.6, ty - 0.32, 0.03, 0.26, 'wood_dark', 'dz_lamp_dim');   // rear lattice, softly lit
    // roof: concave sweep with upturned eaves, extruded along z
    const cx = (eb[0] + eb[2]) / 2, hw = (eb[2] - eb[0]) / 2, ey = r.eave_y, ry = r.ridge_y, N = 10, top = [];
    for (let k = 0; k <= N; k++) { const t = k / N, s = -hw + t * hw, y = ey + 0.22 * (1 - t) ** 3 + (ry - ey - 0.12) * t ** 1.7; top.push([s, y]); }
    const up = []; for (let k = 0; k <= N; k++) up.push(top[k]); for (let k = N - 1; k >= 0; k--) up.push([-top[k][0], top[k][1]]);
    const shape = up.concat(up.slice().reverse().map((p) => [p[0], p[1] - 0.16]));
    const zc = (eb[1] + eb[3]) / 2, len = eb[3] - eb[1];
    K.extrudeProfile({ cap: g('dz_wood_mid'), top: g('dz_giwa'), side: g('dz_wood_mid') }, shape, [cx, Y, zc], [1, 0, 0], [0, 0, 1], len);
    for (let z = eb[1] + 0.15; z < eb[3] - 0.1; z += 0.3) for (const sg of [-1, 1]) for (let k = 0; k < N; k++) {
      const a = top[k], b = top[k + 1]; BM(g, 'dz_giwa_r', [cx + sg * -a[0], a[1] + 0.03, z], [cx + sg * -b[0], b[1] + 0.03, z], 0.07, 0.045);
    }
    B(g, 'black', cx - 0.14, cx + 0.14, ry - 0.1, ry + 0.12, eb[1] - 0.05, eb[3] + 0.05);
    // exposed seokkarae under the eaves (warm wood, cinnabar ends), seen from the garden floor
    for (let z = eb[1] + 0.2; z < eb[3] - 0.1; z += 0.4) for (const sg of [-1, 1]) {
      const a = top[0], b = top[6]; BM(g, 'dz_wood_mid', [cx + sg * -a[0] * 0.98, a[1] - 0.2, z], [cx + sg * -b[0], b[1] - 0.2, z], 0.07, 0.07);
      B(g, 'dz_lacquer', cx + sg * -a[0] * 0.98 - 0.04, cx + sg * -a[0] * 0.98 + 0.04, a[1] - 0.24, a[1] - 0.16, z - 0.04, z + 0.04);
    }
    for (const sg of [-1, 1]) B(g, 'glow_purple', cx + sg * (hw - 0.04) - 0.02, cx + sg * (hw - 0.04) + 0.02, ey + 0.02, ey + 0.05, eb[1], eb[3]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) BM(g, 'wood_dark', [cx + sx * (hw - 0.5), ey + 0.1, zc + sz * (len / 2 - 0.4)], [cx + sx * (hw + 0.02), ey + 0.36, zc + sz * (len / 2 + 0.02)], 0.12, 0.1);
    // a hanji lantern hung from the ridge beam (fixed light)
    lantern(g, cx + 0.15, zc, ty - 1.25, 0.42, 0.62); C(g, 'black', 'black', cx + 0.15, zc, 0.006, ty - 0.63, ty - 0.3, 4, false);
  });
  dress('PR02', (g, i) => {   // reflecting pool
    const [x0, z0, x1, z1] = i.box;
    BT(g, 'dz_basalt', 'dz_basalt', x0, x1, 0, 0.08, z0, z0 + 0.22); BT(g, 'dz_basalt', 'dz_basalt', x0, x1, 0, 0.08, z1 - 0.22, z1);
    BT(g, 'dz_basalt', 'dz_basalt', x0, x0 + 0.22, 0, 0.08, z0 + 0.22, z1 - 0.22); BT(g, 'dz_basalt', 'dz_basalt', x1 - 0.22, x1, 0, 0.08, z0 + 0.22, z1 - 0.22);
    B(g, 'water', x0 + 0.18, x1 - 0.18, 0.0, 0.03, z0 + 0.18, z1 - 0.18, '-y');
    B(g, 'glow_purple', x0 + 0.18, x1 - 0.18, 0.03, 0.034, z0 + 0.18, z0 + 0.2, '-y'); B(g, 'glow_purple', x0 + 0.18, x1 - 0.18, 0.03, 0.034, z1 - 0.2, z1 - 0.18, '-y');
  });
  dress('PR03', (g, i) => {   // landscape: gravel bed, set rocks and a planted pine
    const [x0, z0, x1, z1] = i.box, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    B(g, 'dz_gravel', x0, x1, 0, 0.04, z0, z1, '-y');
    GE(g, 'dz_rock', ICO0, MX(cx - 0.35, 0.5, cz + 0.1, 0.4, 0.75, 0.6, 0.6));
    GE(g, 'dz_rock', ICO0, MX(cx + 0.55, 0.32, cz - 0.3, 1.2, 0.5, 0.36, 0.45));
    GE(g, 'dz_rock', ICO0, MX(cx + 0.4, 0.2, cz + 0.5, 2.1, 0.4, 0.22, 0.32));
    shrub(g, cx - 0.8, cz + 0.6, 0.04, 0.3, 0.25, 'dz_moss', 3, 5);
    pine(g, cx + 0.1, cz - 0.2, 0.7, 3.2, 9, [0.45, 0.25]);
  });
  dress('PR04', (g, i) => {   // dry-stone screen wall (keeps its exact box)
    const [x0, z0, x1, z1] = i.box, h = i.h;
    BT(g, 'stone_dry', 'stone_dark', x0, x1, 0, h - 0.08, z0, z1);
    B(g, 'dz_wood_black', x0, x1, h - 0.08, h, z0, z1);
    const R = K.rng(41);
    for (let y = 0.15; y < h - 0.2; y += 0.28) for (let z = z0 + 0.1; z < z1 - 0.1; z += 0.35 + R() * 0.2) { const w = 0.22 + R() * 0.18; B(g, 'dz_rock', x0, x0 + 0.02, y, y + 0.2, z, Math.min(z1 - 0.05, z + w)); B(g, 'dz_rock', x1 - 0.02, x1, y + 0.1, y + 0.3, z, Math.min(z1 - 0.05, z + w)); }
    B(g, 'glow_warm', x0 + 0.1, x1 - 0.1, 0.0, 0.02, z0, z0 + 0.02);
  });
  {   // garden: raked gravel bed (floor finish), lantern field high in the void, arcade pendants, stone cladding
    const g = D('garden');
    if (free([-24.4, 18.7, -21.3, 21.9], 'garden gravel bed')) {
      B(g, 'dz_gravel', -24.4, -21.3, 0, 0.03, 18.7, 21.9, '-y');
      for (let z = 18.8; z < 21.8; z += 0.12) B(g, 'black', -24.3, -21.4, 0.03, 0.032, z, z + 0.012, '-y');
      shrub(g, -23.8, 19.3, 0.03, 0.45, 0.2, 'dz_moss', 4, 11); shrub(g, -22.0, 21.3, 0.03, 0.4, 0.18, 'dz_moss', 3, 12);
    }
    const R = K.rng(7);
    for (let k = 0; k < (FAST ? 14 : 34); k++) {
      const x = -25 + R() * 12.3, z = 12.8 + R() * 12.4, y1 = 7.05 - R() * 0.25, s = 0.24 + R() * 0.14;
      C(g, 'black', 'black', x, z, 0.004, y1, 7.3, 3, false); lantern(g, x, z, y1 - s * 1.4, s, s * 1.4, R() < 0.25 ? 'dz_lamp_cool' : 'dz_lamp');
    }
    for (const [x, z] of [[-10.5, 13.5], [-10.5, 17.0], [-10.5, 20.5], [-10.5, 24.0], [-17.5, 10.5], [-21.5, 10.5]]) if (freeHigh([x - 0.3, z - 0.3, x + 0.3, z + 0.3], 'arcade pendant')) pendant(g, x, z, 2.75, 0.2, 0.32);
    // dry-stone cladding with warm seams on the garden face of the tea room wall
    const fc = face('F1_W18', 1);
    if (fc) {
      const tea = fc.room === 'F1_garden' ? fc : face('F1_W18', -1), Rr = K.rng(43);
      for (const [a, b] of [[2.1, 8.8]]) if (!hitsHole(tea, a, b)) {
        fbox(g, 'stone_dry', tea, a, b, 0, 3.05, 0, 0.03);
        for (let y = 0.1; y < 2.9; y += 0.32) for (let u = a + 0.05; u < b - 0.2; u += 0.4 + Rr() * 0.3) fbox(g, 'dz_rock', tea, u, Math.min(b - 0.05, u + 0.3 + Rr() * 0.2), y, y + 0.24, 0.03, 0.045 + Rr() * 0.02);
        fbox(g, 'glow_warm', tea, a, b, 0.02, 0.035, 0.03, 0.04);
      }
    }
  }

  // ---------------- Sky garden planting (built-in landscape): moss beds with stone edging, pines, maples, stepping stones ----------------
  {
    const g = D('garden_plant'), R = K.rng(77);
    // maple: a short dark trunk and clusters of small leaf masses in deep red and amber
    const maple = (x, z, h, seed) => { const Q = K.rng(seed); BM(g, 'dz_wood_black', [x, 0, z], [x + 0.15, h * 0.55, z + 0.1], 0.1);
      for (const [ty, tr, nn] of [[0.55, 1.0, 18], [0.7, 0.85, 15], [0.84, 0.6, 11], [0.95, 0.3, 5]]) for (let k = 0; k < nn; k++) { const a = (k / nn) * PI * 2 + Q(), d = tr * (0.25 + Q() * 0.75); GE(g, Q() < 0.55 ? 'dz_maple' : 'dz_maple2', SPH0, MX(x + 0.15 + Math.cos(a) * d, h * ty + (Q() - 0.5) * 0.14, z + 0.1 + Math.sin(a) * d, Q() * 3, 0.15 + Q() * 0.1, 0.06 + Q() * 0.04, 0.14 + Q() * 0.09)); }
      for (let k = 0; k < 4; k++) BM(g, 'dz_wood_black', [x + 0.1, h * 0.45, z + 0.07], [x + 0.15 + Math.cos(k * 1.7) * 0.7, h * (0.62 + k * 0.06), z + 0.1 + Math.sin(k * 1.7) * 0.7], 0.035); };
    const bed = (x0, z0, x1, z1, plant) => {
      if (!free([x0, z0, x1, z1], 'garden bed')) return false;
      B(g, 'dz_basalt', x0, x1, 0, 0.14, z0, z0 + 0.12); B(g, 'dz_basalt', x0, x1, 0, 0.14, z1 - 0.12, z1);
      B(g, 'dz_basalt', x0, x0 + 0.12, 0, 0.14, z0 + 0.12, z1 - 0.12); B(g, 'dz_basalt', x1 - 0.12, x1, 0, 0.14, z0 + 0.12, z1 - 0.12);
      B(g, 'dz_earth', x0 + 0.12, x1 - 0.12, 0, 0.1, z0 + 0.12, z1 - 0.12, '-y');
      for (let k = 0; k < Math.round((x1 - x0) * (z1 - z0) * (FAST ? 1.6 : 3.2)); k++) shrub(g, x0 + 0.22 + R() * (x1 - x0 - 0.44), z0 + 0.22 + R() * (z1 - z0 - 0.44), 0.06, 0.16 + R() * 0.2, 0.1 + R() * 0.16, R() < 0.55 ? 'dz_moss' : R() < 0.7 ? 'dz_foliage' : 'dz_pine', 3, 100 + k);
      plant(); K.pool(FID, (x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) * 0.6, 'pool_warm', 0.11);
      B(g, 'glow_warm', x0 + 0.14, x1 - 0.14, 0.14, 0.15, z0 + 0.1, z0 + 0.12, '-y');   // low uplight line in the edging
      return true;
    };
    // candidate beds; free() drops any that would block an entry, column, stair or prop (first fit per group wins)
    const beds = [
      [[-24.7, 12.7, -22.6, 15.0], [-25.2, 12.6, -23.4, 14.6]],
      [[-17.4, 22.0, -15.3, 24.0], [-17.2, 21.6, -15.6, 23.4]],
      [[-14.7, 18.4, -12.6, 21.6], [-14.4, 12.8, -12.6, 15.6]],
      [[-24.6, 19.9, -23.4, 21.3]],
    ];
    const plants = [(c) => { pine(g, c[0] + 0.9, c[1], 0.1, 3.6, 21, [0.5, 0.3]); maple(c[0] - 0.4, c[1] + 0.6, 2.8, 22); },
      (c) => { maple(c[0], c[1], 3.2, 23); shrub(g, c[0] + 0.6, c[1] + 0.5, 0.1, 0.4, 0.5, 'dz_pine', 4, 24); },
      (c) => { pine(g, c[0], c[1], 0.1, 2.8, 25, [-0.4, 0.3]); }, (c) => { maple(c[0], c[1], 2.4, 26); }];
    beds.forEach((opts, k) => { for (const [x0, z0, x1, z1] of opts) if (bed(x0, z0, x1, z1, () => plants[k]([(x0 + x1) / 2, (z0 + z1) / 2]))) break; });
    // more planting: small moss beds along the glass and round the pavilion and pool wherever free() allows
    let extra = 0;
    for (const [x0, z0, x1, z1] of [[-22.4, 24.3, -20.4, 25.4], [-19.8, 24.3, -18.0, 25.4], [-25.5, 15.6, -24.4, 17.6], [-25.5, 18.2, -24.4, 20.2], [-20.8, 12.7, -19.0, 13.8], [-15.8, 12.7, -14.0, 13.8], [-12.9, 16.0, -12.2, 18.0], [-21.0, 22.2, -19.2, 23.4], [-19.4, 15.0, -18.2, 16.6], [-24.0, 21.0, -22.6, 21.9]]) {
      if (extra >= 8) break;
      if (bed(x0, z0, x1, z1, () => { if ((x1 - x0) * (z1 - z0) > 1.6) maple((x0 + x1) / 2, (z0 + z1) / 2, 1.8, 30 + extra); else shrub(g, (x0 + x1) / 2, (z0 + z1) / 2, 0.08, 0.35, 0.45, 'dz_pine', 4, 40 + extra); })) extra++;
    }
    LOG.garden_extra_beds = extra;
    // soft warm mist in the void (two faint additive glow layers, export as emissive alpha)
    if (!K.M.dz_mist) {
      const c = K.img(64, 64, (i, j, o) => { const u = (i + 0.5) / 64 - 0.5, v = (j + 0.5) / 64 - 0.5, a = Math.exp(-(u * u + v * v) * 9); o[0] = o[1] = o[2] = 255; o[3] = 255 * a * 0.6; });
      const t = K.asTex(c, true, 'dz_mist', false), m = new T.MeshStandardMaterial({ color: '#000000', map: t, emissive: new T.Color('#c9a0ff'), emissiveMap: t, emissiveIntensity: 0.18, transparent: true, depthWrite: false, side: T.DoubleSide, roughness: 1 });
      m.name = 'dz_mist'; K.material('dz_mist', m, { tile: 1, env: 'in' });
    }
    // the square sheets would cross the SW chamfer glass at their corner: vertices past a line 0.46 m inside the chamfer
    // (x - z = -47, blast shutter zone) are pulled back onto it (the mist is ~1 % alpha there, so the look is unchanged)
    const MIST_CX = -19.0, MIST_CZ = 19.0, MIST_LIM = -47 + SHUT_CLEAR * Math.SQRT2 - (MIST_CX - MIST_CZ);
    for (const [yy, s2] of [[3.6, 11], [6.2, 12]]) {
      const pl = new T.PlaneGeometry(s2, s2, 16, 16); pl.rotateX(-PI / 2);
      const pa = pl.attributes.position;
      for (let i = 0; i < pa.count; i++) { const k = pa.getX(i) - pa.getZ(i); if (k < MIST_LIM) { const t = (MIST_LIM - k) / 2; pa.setX(i, pa.getX(i) + t); pa.setZ(i, pa.getZ(i) - t); } }
      GE(g, 'dz_mist', pl, MX(MIST_CX, yy, MIST_CZ), true);
    }

    // stepping stones from the garden doors toward the pavilion (flush with the paving)
    for (let k = 0; k < 9; k++) { const x = -13.6 - k * 0.45 + Math.sin(k * 1.3) * 0.25, z = 25.2 - k * 0.62; if (free([x - 0.3, z - 0.25, x + 0.3, z + 0.25], 'stepping stone')) { const st = new T.CylinderGeometry(0.3 - (k % 3) * 0.03, 0.3, 0.02, 9); GE(g, 'dz_basalt', st, MX(x, 0.01, z, k)); } }
    // rain on the 7 m glass reads from inside: soft purple uplight pools along the south and west glass
    for (let x = -24; x < -12; x += 3) K.pool(FID, x, 25.3, 1.2, 'pool_purple', 0.006);
    for (let z = 13; z < 22; z += 3) K.pool(FID, -25.3, z, 1.2, 'pool_purple', 0.006);
  }

  // ---------------- S4 Tea Room / Ondol Lounge ----------------
  dress('PR05', (g, i) => {   // maru: raised timber floor platform (built-in)
    const [x0, z0, x1, z1] = i.box, h = i.h;
    BT(g, 'dz_wood_black', 'dz_wood_black', x0 + 0.1, x1 - 0.1, 0, h - 0.06, z0 + 0.1, z1 - 0.1);
    BT(g, 'dz_wood_mid', 'wood', x0, x1, h - 0.06, h, z0, z1);
    for (let x = x0 + 0.25; x < x1; x += 0.25) B(g, 'wood_dark', x - 0.004, x + 0.004, h, h + 0.001, z0 + 0.02, z1 - 0.02);
    for (const x of [x0 + 0.15, (x0 + x1) / 2, x1 - 0.15]) for (const z of [z0 + 0.15, z1 - 0.15]) B(g, 'wood_dark', x - 0.07, x + 0.07, 0, h - 0.06, z - 0.07, z + 0.07);
    B(g, 'glow_warm', x0 + 0.12, x1 - 0.12, 0.03, 0.05, z1 - 0.1, z1 - 0.08);
  });
  dress('PR07', (g, i) => {   // warm stone ondol bench with glowing seams (built-in)
    const [x0, z0, x1, z1] = i.box, h = i.h;
    BT(g, 'stone_warm', 'stone_warm', x0 + 0.05, x1 - 0.05, 0, h - 0.12, z0 + 0.05, z1 - 0.05);
    BT(g, 'dz_wood_black', 'dz_wood_mid', x0, x1, h - 0.12, h, z0, z1);
    B(g, 'glow_warm', x0 + 0.04, x1 - 0.04, 0.12, 0.14, z0 + 0.04, z1 - 0.04);
  });
  {
    const g = D('site4');
    // tea room: glowing changsal lattice panelling on its stone wall, exposed rafters, pendants
    const tw = face('F1_W18', 1), tea = tw && (tw.room === 'F1_tea_room' ? tw : face('F1_W18', -1));
    if (tea) { flattice(g, tea, 2.3, 5.4, 0.35, 2.75, { cell: 0.2 }); flattice(g, tea, 5.6, 8.7, 0.35, 2.75, { cell: 0.2 }); fbox(g, 'dz_wood_black', tea, 2.1, 8.9, 2.85, 2.95, 0, 0.08); }
    rafters([-8.8, 12.2, -0.2, 20.8], 'z', 0.9);
    for (const [x, z] of [[-6.6, 16.3], [-4.4, 16.6], [-6.0, 19.0]]) if (freeHigh([x - 0.3, z - 0.3, x + 0.3, z + 0.3], 'tea pendant')) pendant(g, x, z, 2.45, 0.24, 0.42);
    // ondol lounge: glowing floor seams on a 2.4 m grid, a lattice canopy over the bench, pendants
    for (let x = 2.4; x < 9; x += 2.4) B(g, 'black', x - 0.004, x + 0.004, 0, 0.0015, 12.4, 20.6, '-y');
    for (let z = 14.4; z < 21; z += 2.4) B(g, 'black', 0.4, 8.6, 0, 0.0015, z - 0.004, z + 0.004, '-y');
    K.pool(FID, 4.6, 16.6, 4.2, 'pool_warm', 0.003);   // heated stone: a broad warm glow
    if (freeHigh([5.1, 17.1, 7.9, 19.9], 'ondol canopy')) {
      for (let k = 0; k <= 6; k++) { B(g, 'wood_dark', 5.1 + k * 0.467 - 0.015, 5.1 + k * 0.467 + 0.015, 2.62, 2.68, 17.1, 19.9); B(g, 'wood_dark', 5.1, 7.9, 2.6, 2.64, 17.1 + k * 0.467 - 0.015, 17.1 + k * 0.467 + 0.015); }
      B(g, 'dz_lamp', 5.15, 7.85, 2.69, 2.7, 17.15, 19.85, '+y');
      for (const [x, z] of [[5.15, 17.15], [7.85, 17.15], [5.15, 19.85], [7.85, 19.85]]) C(g, 'black', 'black', x, z, 0.005, 2.68, CE, 3, false);
    }
    for (const [x, z] of [[2.0, 15.6], [3.4, 18.6]]) if (freeHigh([x - 0.3, z - 0.3, x + 0.3, z + 0.3], 'ondol pendant')) pendant(g, x, z, 2.5, 0.2, 0.36);
    cove('F1_tea_room'); cove('F1_ondol_lounge');
  }

  // ---------------- Veranda ----------------
  {
    const g = D('veranda');
    for (const [x, z] of [[-4.5, 23.4], [0.0, 22.2], [5.0, 24.0]]) if (freeHigh([x - 0.3, z - 0.3, x + 0.3, z + 0.3], 'veranda pendant')) pendant(g, x, z, 2.6, 0.18, 0.5);
    rafters([-8.8, 21.2, 8.8, 25.8], 'x', 0.9);
  }

  // ---------------- Spa Hall, Garden Lobby and the core faces: purple sconce rhythm ----------------
  {
    const g = D('core_sconces');
    const runs = [['z', 9.0, -8.2, 8.2, 1], ['z', -9.0, -8.2, 8.2, -1], ['x', 9.0, -8.2, 8.2, 1], ['x', -9.0, -8.2, 8.2, -1]];
    for (const [ax, c0, a0, a1, s] of runs) for (let u = a0; u <= a1 + 0.01; u += 2.05) {
      const c = c0 + s * 0.3;   // the core walls are 0.6 m thick: sconces sit on the outer face
      const box = ax === 'z' ? [u - 0.2, c - 0.1, u + 0.2, c + 0.1] : [c - 0.1, u - 0.2, c + 0.1, u + 0.2];
      if (!free(box, 'core sconce')) continue;
      if (ax === 'z') { B(g, 'steel_dark', u - 0.08, u + 0.08, 0.5, 2.7, c, c + s * 0.05); B(g, 'glow_purple', u - 0.02, u + 0.02, 0.6, 2.6, c + s * 0.05, c + s * 0.06); }
      else { B(g, 'steel_dark', c, c + s * 0.05, 0.5, 2.7, u - 0.08, u + 0.08); B(g, 'glow_purple', c + s * 0.05, c + s * 0.06, 0.6, 2.6, u - 0.02, u + 0.02); }
    }
    B(g, 'glow_warm', -8.6, 14.6, 0, 0.002, 10.49, 10.51, '-y');   // stone inlay runner down the Spa Hall
    B(g, 'stone', -8.6, 14.6, 0, 0.001, 10.2, 10.8, '-y');
  }

  // ---------------- Changing, Steam Room, Bathhouse ----------------
  dress('PR18', (g, i) => {   // steam room stone bench with timber slats (built-in)
    const [x0, z0, x1, z1] = i.box, h = i.h;
    BT(g, 'stone_dark', 'stone_dark', x0, x1, 0, h - 0.06, z0, z1);
    for (let x = x0 + 0.05; x < x1 - 0.05; x += 0.12) B(g, 'dz_wood_mid', x, x + 0.09, h - 0.06, h, z0 + 0.03, z1 - 0.03);
    B(g, 'glow_purple', x0, x1, 0.04, 0.06, z0 - 0.01, z0);
  });
  dress('PR19', (g, i) => {   // tiled shower block with rain heads (built-in)
    const [x0, z0, x1, z1] = i.box, h = i.h;
    BT(g, 'dz_tile', 'stone_dark', x0, x1, 0, h, z0, z1);
    B(g, 'glow_cool', x0 - 0.01, x1 + 0.01, h - 0.08, h - 0.05, z0 - 0.01, z1 + 0.01, '+y-y');
    for (const z of [z0 + 0.55, z1 - 0.55]) for (const s of [-1, 1]) { const x = s < 0 ? x0 : x1; B(g, 'dz_steel', x, x + s * 0.1, 1.98, 2.0, z - 0.1, z + 0.1); B(g, 'dz_steel', x, x + s * 0.03, 1.0, 1.98, z - 0.015, z + 0.015); }
    for (const x of [x0 + 0.5, x1 - 0.5]) for (const z of [z0, z1]) { const s = z === z0 ? -1 : 1; B(g, 'dz_steel', x - 0.1, x + 0.1, 1.98, 2.0, z, z + s * 0.1); }
  });
  dress('PR11', (g, i) => {   // sunken hot pool: stone rim, dark water, purple glow line, steps
    const [x0, z0, x1, z1] = i.box;
    for (const [a, b, c, d] of [[x0 - 0.3, x1 + 0.3, z0 - 0.3, z0], [x0 - 0.3, x1 + 0.3, z1, z1 + 0.3], [x0 - 0.3, x0, z0, z1], [x1, x1 + 0.3, z0, z1]]) BT(g, 'stone_dark', 'stone', a, b, 0, 0.08, c, d);
    B(g, 'water', x0, x1, -0.03, -0.02, z0, z1, '-y');
    for (const [a, b, c, d] of [[x0, x1, z0, z0 + 0.03], [x0, x1, z1 - 0.03, z1], [x0, x0 + 0.03, z0, z1], [x1 - 0.03, x1, z0, z1]]) B(g, 'glow_purple', a, b, -0.05, -0.015, c, d, '-y');
    for (let k = 0; k < 3; k++) B(g, 'stone', x0 + 1.0 + k * 0.01, x0 + 2.2, -0.2 - k * 0.15, -0.19 - k * 0.15, z1 - 0.3 - k * 0.3, z1 - k * 0.3);
  });
  {
    const g = D('bath');
    haze([[20.7, 0.3, 15.0, 2.6], [19.0, 0.5, 13.5, 2.2], [22.5, 0.4, 16.5, 2.4], [21.5, 0.6, 13.0, 2.0], [12.0, 0.8, 21.5, 2.6], [13.0, 0.6, 24.5, 2.2]], '#d8c8ff', 0.1);
    // timber duckboard set into the bathhouse floor beside the pool
    if (free([18.0, 18.5, 23.5, 19.3], 'bath duckboard')) for (let x = 18.05; x < 23.45; x += 0.16) B(g, 'dz_wood_mid', x, x + 0.11, 0, 0.02, 18.55, 19.25);
    for (const z of [12.45, 17.6]) if (freeHigh([17.6, z - 0.05, 23.9, z + 0.05], 'bath ceiling line')) B(g, 'glow_purple', 17.6, 23.9, 3.06, 3.1, z - 0.03, z + 0.03, '+y');
    for (const [x, z] of [[11.0, 21.0], [13.5, 21.0]]) if (freeHigh([x - 0.3, z - 0.3, x + 0.3, z + 0.3], 'steam pendant')) pendant(g, x, z, 2.7, 0.14, 0.3, 'dz_lamp_cool');
    // stone cladding on the bathhouse end of the lockers wall
    const bw = face('F1_W45', 1), bf = bw && (bw.room === 'F1_bathhouse' ? bw : face('F1_W45', -1));
    if (bf) { fbox(g, 'stone_dry', bf, 0, bf.F.len, 0, 3.05, 0, 0.03); fbox(g, 'glow_purple', bf, 0.05, bf.F.len - 0.05, 2.9, 2.92, 0.03, 0.04); }
    cove('F1_changing', 'glow_cool');
  }

  // ---------------- Lockers, Treatment, Salt Room ----------------
  {
    const g = D('treatment');
    for (const [x, z] of [[15.0, -7.5], [17.0, -7.5], [16.0, -3.0]]) if (freeHigh([x - 0.3, z - 0.3, x + 0.3, z + 0.3], 'treatment pendant')) pendant(g, x, z, 2.5, 0.2, 0.3);
    cove('F1_treatment'); cove('F1_lockers');
    for (const [x, z] of [[15.5, 4.5], [19.5, 4.5], [23.0, 2.0], [23.0, 7.6]]) if (freeHigh([x - 0.3, z - 0.3, x + 0.3, z + 0.3], 'lockers pendant')) pendant(g, x, z, 2.55, 0.18, 0.3);
    // salt room: a glowing salt-brick ceiling and salt cladding on its hard wall stub
    const sb = [];
    for (let x = 20.45; x + 0.38 < 25.5; x += 0.42) for (let z = -11.55; z < -0.5; z += 0.42) if (freeHigh([x, z, x + 0.38, z + 0.38], 'salt ceiling')) sb.push([x, z]);
    for (const [x, z] of sb) B(g, 'dz_salt', x, x + 0.38, CE - 0.06, CE - 0.01, z, z + 0.38, '+y');
    const sw = face('F1_W50', 1), sf = sw && (sw.room === 'F1_salt_room' ? sw : face('F1_W50', -1));
    if (sf) for (let y = 0; y < 2.9; y += 0.14) for (let u = (y * 7) % 0.3 - 0.3; u < sf.F.len; u += 0.3) { const a = Math.max(0, u), b = Math.min(sf.F.len, u + 0.28); if (b - a > 0.05) fbox(g, 'dz_salt', sf, a, b, y, y + 0.12, 0, 0.04); }
  }

  // ---------------- Laundry ----------------
  {
    const g = D('laundry');
    if (freeHigh([13.0, -25.0, 21.0, -24.2], 'laundry duct')) { B(g, 'alloy', 13.0, 21.0, 2.55, 2.95, -25.0, -24.3); for (let x = 13.4; x < 21; x += 1.2) B(g, 'steel_dark', x, x + 0.06, 2.52, 2.98, -25.05, -24.25); }
    cove('F1_laundry', 'glow_cool');
  }

  // ---------------- Kitchen and Servery ----------------
  {
    const g = D('kitchen');
    for (const id of ['PR08', 'PR09']) {   // extraction hoods fixed to the ceiling over the planned island spots
      const [x0, z0, x1, z1] = K.prop(id).box;
      if (!freeHigh([x0, z0 - 0.1, x1, z1 + 0.1], 'hood ' + id)) continue;
      BT(g, 'dz_steel', 'dz_steel', x0 - 0.1, x1 + 0.1, 2.25, 2.6, z0 - 0.1, z1 + 0.1);
      B(g, 'dz_steel', (x0 + x1) / 2 - 0.4, (x0 + x1) / 2 + 0.4, 2.6, CE, (z0 + z1) / 2 - 0.3, (z0 + z1) / 2 + 0.3);
      B(g, 'glow_cool', x0, x1, 2.245, 2.25, z0 + 0.1, z0 + 0.16, '+y'); B(g, 'glow_cool', x0, x1, 2.245, 2.25, z1 - 0.16, z1 - 0.1, '+y');
    }
    // white tile cladding on the kitchen face of the cold store wall, with a steel rail
    const kw = face('F1_W60', 1), kf = kw && (kw.room === 'F1_kitchen' ? kw : face('F1_W60', -1));
    if (kf) { fbox(g, 'dz_tile', kf, 0.4, kf.F.len, 0, 2.4, 0, 0.015); fbox(g, 'dz_steel', kf, 0.4, kf.F.len, 1.6, 1.63, 0.015, 0.06); fbox(g, 'glow_cool', kf, 0.45, kf.F.len - 0.05, 2.35, 2.37, 0.015, 0.02); }
    const sw = face('F1_W61', 1), sf = sw && (sw.room === 'F1_servery' ? sw : face('F1_W61', -1));
    if (sf) { fbox(g, 'dz_tile', sf, 0.2, sf.F.len - 0.2, 0, 2.4, 0, 0.015); fbox(g, 'glow_warm', sf, 0.25, sf.F.len - 0.25, 2.35, 2.37, 0.015, 0.02); }
    const [x0, z0, x1, z1] = K.prop('PR28').box;   // heat lamps over the planned servery line
    for (let x = x0 + 0.5; x < x1; x += 1.0) if (freeHigh([x - 0.2, z0, x + 0.2, z1], 'heat lamp')) { C(g, 'black', 'black', x, (z0 + z1) / 2, 0.006, 1.9, CE, 3, false); C(g, 'steel_dark', 'glow_red', x, (z0 + z1) / 2, 0.14, 1.75, 1.9, 12); }
  }

  // ---------------- Dining Room ----------------
  {
    const g = D('dining');
    for (const [x, z] of [[-21.4, -18.6], [-18.2, -18.6], [-21.4, -15.9], [-18.2, -15.9], [-24.0, -14.0], [-12.0, -24.0]]) if (freeHigh([x - 0.35, z - 0.35, x + 0.35, z + 0.35], 'dining pendant')) { pendant(g, x, z, 2.15, 0.3, 0.22); pendant(g, x + 0.25, z + 0.2, 2.45, 0.16, 0.3); }
    const dw = face('F1_W62', 1), df = dw && (dw.room === 'F1_dining_room' ? dw : face('F1_W62', -1));
    if (df) { flattice(g, df, 0.2, df.F.len / 2 - 0.1, 0.25, 2.8, { cell: 0.24 }); flattice(g, df, df.F.len / 2 + 0.1, df.F.len - 0.2, 0.25, 2.8, { cell: 0.24 }); }
    rafters([-25.6, -25.6, -9.4, -12.4], 'x', 1.2, 'dz_wood_black', 0.18);
    cove('F1_dining_room');
  }

  // ---------------- Staff Entry, Plant Room, Canteen ----------------
  {
    const g = D('back_of_house');
    if (freeHigh([-18.8, -11.8, -12.2, -0.2], 'plant ducts')) {
      B(g, 'alloy', -18.6, -12.3, 2.45, 2.95, -8.9, -8.1); B(g, 'alloy', -16.0, -15.2, 2.45, 2.95, -8.1, -0.4);
      for (let x = -18.4; x < -12.3; x += 1.2) B(g, 'steel_dark', x, x + 0.06, 2.42, 2.98, -8.95, -8.05);
      const pipe = new T.CylinderGeometry(0.08, 0.08, 1, 8); for (const z of [-5.5, -5.2]) GE(g, 'steel_dark', pipe, MX(-15.6, 2.7, z, 0, 1, 1, 1).multiply(new T.Matrix4().makeRotationZ(PI / 2)).multiply(new T.Matrix4().makeScale(1, 6.2, 1)));
    }
    for (const [x, z] of [[-20.0, 3.6], [-17.2, 3.6], [-20.0, 4.9], [-17.2, 4.9]]) if (freeHigh([x - 0.3, z - 0.3, x + 0.3, z + 0.3], 'canteen pendant')) pendant(g, x, z, 2.35, 0.26, 0.2);
    cove('F1_canteen', 'glow_warm');
  }

  // skirtings and corridor wayfinding strips on every hard wall face, then the prop markers
  // ---------------- room identity pass: S4 lit from the hanji lightbox and pendants ----------------
  K.pool(FID, -8.2, 15.4, 1.6, 'pool_warm'); K.pool(FID, -8.2, 18.6, 1.6, 'pool_warm');
  for (const [x, z] of [[-6.6, 16.3], [-4.4, 16.6], [-6.0, 19.0], [2.0, 15.6], [3.4, 18.6]]) K.pool(FID, x, z, 1.0, 'pool_warm');
  K.pool(FID, 6.5, 18.5, 1.8, 'pool_warm');
  skirtings((id) => (typeof FINISH !== 'undefined' ? FINISH.get(id) : ''));
  propMarkers(BUILTIN);
};
