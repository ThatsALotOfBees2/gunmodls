/* ================================================================== PARTS.exterior */
// Exterior and city: Seoul 2111, a rainy night near midnight, 403 m up on the north bank of the river.
// Builds: the night sky and a low cloud deck, mountain ridges and mist, the river with its banks, expressways and six
// lit bridges, the street grid far below (baked emissive textures), procedural towers and apartment slabs, a lattice
// broadcast tower on a forested hill to the NNE, giant translucent holo screens (abstract imagery only), Haneul's own
// fins, corner lights and crown above and below the map, neighbour dressing, terrace puddles and planting, and the
// viewer-only effects (rain, rain curtains, splashes, moving traffic, a train, beacon blink, lightning).
// Far surfaces use a cheap distance haze (onBeforeCompile on the fog chunk; viewer only, it does not export).
// Rules: no logos, no readable text anywhere; nothing on ledges, rails, gantries, bridge decks or near entries.
PARTS.exterior = function (K) {
  const { THREE, P2 } = K;
  const L = K.L, EXT = L.exterior, G = -(EXT.elevation_f1 || 403.2), FAST = K.fast;
  K.dropFallback();
  const T0 = performance.now(), TM = {};
  const mark = (k, t) => { TM[k] = Math.round(performance.now() - t); return performance.now(); };
  let tq = performance.now();

  /* ---------------------------------------------------------------- river and city plan (plan x east, z south) */
  const zc = (x) => 860 + 380 * (1 - Math.cos(Math.max(-3.1, Math.min(3.1, x / 2600))));
  const hw = (x) => 600 + 55 * Math.sin(x / 1300);
  const bankN = (x) => zc(x) - hw(x), bankS = (x) => zc(x) + hw(x);
  const inRiver = (x, z, m = 0) => z > bankN(x) - m && z < bankS(x) + m;
  const ISL = { x: -1050, a: 430, b: 120 }; ISL.z = zc(ISL.x) - 60;
  const HILL = { x: 900, z: -2800, r: 640, h: 262 };
  const HILL_ANG = Math.atan2(HILL.x, -HILL.z);
  const BRIDGES = [{ x: -2700, t: 'girder', c: 'gc' }, { x: -1580, t: 'truss', c: 'gk' }, { x: -380, t: 'arch', c: 'gp' }, { x: 700, t: 'cable', c: 'gc' }, { x: 1820, t: 'arch2', c: 'gk' }, { x: 2950, t: 'girder', c: 'gp' }];
  const XS = []; for (let k = -27; k <= 27; k++) XS.push({ x: 45 + 150 * k, w: k === 0 ? 20 : (((k % 3) + 3) % 3 === 1 ? 38 : 22) });
  const ZN = []; for (let j = 0; j <= 24; j++) ZN.push({ z: 75 - 170 * j, w: j % 3 === 2 ? 38 : 22 });
  const ZS = []; for (let j = 0; j <= 14; j++) ZS.push({ z: 1730 + 170 * j, w: j % 3 === 1 ? 38 : 22 });
  const RIVERSIDE_N = (x) => bankN(x) - 92, RIVERSIDE_S = (x) => bankS(x) + 92, EXPRESS_N = (x) => bankN(x) - 42, EXPRESS_S = (x) => bankS(x) + 42;
  const RANGE = 4096;

  /* ---------------------------------------------------------------- haze and material helpers */
  const HZ = { value: new THREE.Color('#252033') }, HZ0 = HZ.value.clone();
  // distance haze on the fog chunk (only when the scene has fog, so the x-ray view and the export are unaffected)
  function haze(m, scale = 1, add = false) {
    const d = (0.00045 * scale).toFixed(7);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uHaze = HZ;
      sh.fragmentShader = 'uniform vec3 uHaze;\n' + sh.fragmentShader.replace('#include <fog_fragment>',
        '#ifdef USE_FOG\n  float hzF = 1.0 - exp(-vFogDepth * ' + d + ');\n' + (add ? '  gl_FragColor.rgb *= 1.0 - hzF;\n' : '  gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, hzF);\n') + '#endif');
    };
    m.customProgramCacheKey = () => 'hz' + d + (add ? 'a' : 'm');
    return m;
  }
  const tex = (c, srgb, name, jpeg = true) => K.asTex(c, srgb, 'ext_' + name, jpeg);
  function std(key, p, o = {}) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 1, metalness: 0 }, p));
    m.name = key;
    if (o.ns && m.normalMap) m.normalScale.set(o.ns, o.ns);
    if (o.haze != null) haze(m, o.haze, !!o.add);
    K.material(key, m, { tile: o.tile || 1, env: o.env || 'out', envI: o.envI ?? 1 });
    return m;
  }
  // emissive-only (looks unlit; no environment reflection)
  const glow = (key, col, ei, hz = 1) => std(key, { color: '#000000', emissive: col, emissiveIntensity: ei, roughness: 0.6 }, { haze: hz, envI: 0 });
  // additive transparent emissive (screens, reflections): map carries the alpha so the export blends too
  function additive(key, t, col, ei, opacity = 1, hz = 1) {
    const m = std(key, { color: '#000000', map: t, emissiveMap: t, emissive: col, emissiveIntensity: ei, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, roughness: 1 }, { haze: hz, add: true, envI: 0 });
    m.blending = THREE.AdditiveBlending;
    return m;
  }
  const lin = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // bilinear sample of a tileable noise array n x n at (u, v) (1 = one texture repeat)
  const samp = (N, n, u, v) => {
    u = ((u % 1) + 1) % 1 * n; v = ((v % 1) + 1) % 1 * n;
    const i = Math.floor(u) % n, j = Math.floor(v) % n, fu = u - Math.floor(u), fv = v - Math.floor(v), i1 = (i + 1) % n, j1 = (j + 1) % n;
    return lin(lin(N[j * n + i], N[j * n + i1], fu), lin(N[j1 * n + i], N[j1 * n + i1], fu), fv);
  };
  // normal map from a height array
  function nrm(H, n, s) {
    return K.img(n, n, (i, j, o) => {
      const l = H[j * n + (i + n - 1) % n], r = H[j * n + (i + 1) % n], u = H[((j + n - 1) % n) * n + i], d = H[((j + 1) % n) * n + i];
      const x = (l - r) * s, y = (d - u) * s, k = 1 / Math.hypot(x, y, 1);
      o[0] = (x * k * 0.5 + 0.5) * 255; o[1] = (y * k * 0.5 + 0.5) * 255; o[2] = (k * 0.5 + 0.5) * 255;
    });
  }
  // grid geometry: fn(u, v) -> [x, y, z, U, V]; flip reverses the winding
  function grid(nu, nv, fn, flip = false) {
    const P = [], UV = [], I = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const r = fn(i / nu, j / nv); P.push(r[0], r[1], r[2]); UV.push(r[3] ?? i / nu, r[4] ?? j / nv); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
      if (flip) I.push(a, d, b, b, d, c); else I.push(a, b, d, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeVertexNormals();
    return g;
  }
  // quads with full 0..1 UVs: list of [p0, p1, p2, p3]
  function quadGeo(list) {
    const P = [], UV = [], I = [];
    for (const q of list) { const b = P.length / 3; for (const p of q) P.push(p[0], p[1], p[2]); UV.push(0, 0, 1, 0, 1, 1, 0, 1); I.push(b, b + 1, b + 2, b, b + 2, b + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeVertexNormals();
    return g;
  }
  // deco buckets that roll over to a new node every ~12k vertices (the engine merges with push(...spread), which
  // overflows the call stack on very large buffers)
  const CHUNKS = new Map();
  const deco = (kind, layer = 'skyline', fid = 'X') => ({
    gb(mk) {
      const key = fid + '|' + kind + '|' + layer + '|' + mk;
      if (CHUNKS.has(key)) return CHUNKS.get(key);
      let n = 0, cur = null;
      const next = () => { cur = K.deco(fid, kind + (n ? '_' + n : ''), layer).gb(mk); n++; };
      next();
      const w = { isGB: true, face(p, nn) { if (cur.nv > 12000) next(); cur.face(p, nn); }, addGeo(g, m, k) { if (cur.nv > 12000) next(); cur.addGeo(g, m, k); }, get nv() { return cur.nv; }, get tris() { return cur.tris; } };
      CHUNKS.set(key, w); return w;
    },
  });
  const addUV = (kind, geo, mk, layer = 'skyline', fid = 'X') => { K.add(fid, geo, mk, { kind, layer, keepUV: true }); geo.dispose(); };
  const area = (P) => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s; };
  const sgo = (P) => (area(P) > 0 ? 1 : -1);   // outward normal of edge direction d is [d1, -d0] * sgo

  /* ---------------------------------------------------------------- facade textures (2D canvas, abstract: no text) */
  const FP = FAST ? 512 : 1024;
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
  const WARM = [[255, 196, 140], [255, 210, 160], [255, 178, 118]], COOL = [[200, 218, 255], [226, 236, 255], [176, 200, 248]], ACC = [[168, 112, 255], [255, 120, 220], [120, 150, 255]];
  // one lit room behind a lite: ceiling glow, falloff, a person's silhouette now and then, curtains or blinds
  function room(e, x, y, w, h, col, b, R, office) {
    const g = e.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, rgba(col, b)); g.addColorStop(0.18, rgba(col, b * 0.9)); g.addColorStop(1, rgba(col, b * (office ? 0.55 : 0.32)));
    e.fillStyle = g; e.fillRect(x, y, w, h);
    e.fillStyle = rgba([255, 255, 255], b * 0.55); e.fillRect(x, y + h * 0.03, w, Math.max(1, h * 0.025));
    if (office) for (let s = 0.25; s < 1; s += 0.5) { e.fillStyle = rgba([255, 255, 255], b * 0.35); e.fillRect(x + w * (s - 0.18), y + h * 0.08, w * 0.36, Math.max(1, h * 0.02)); }
    if (R() < 0.18) { const px = x + R() * w * 0.8, pw = w * 0.07; e.fillStyle = 'rgba(0,0,0,0.6)'; e.fillRect(px, y + h * 0.42, pw, h * 0.58); e.beginPath(); e.arc(px + pw / 2, y + h * 0.36, pw * 0.6, 0, 7); e.fill(); }
    const cr = R();
    if (!office && cr < 0.45) { const cw2 = w * (0.3 + R() * 0.7), left = R() < 0.5; e.fillStyle = rgba([col[0] * 0.8, col[1] * 0.62, col[2] * 0.45], b * 0.5); e.fillRect(left ? x : x + w - cw2, y, cw2, h); }
    else if (office && cr < 0.2) { e.fillStyle = 'rgba(0,0,0,0.35)'; for (let s = y; s < y + h * 0.7; s += Math.max(2, h * 0.05)) e.fillRect(x, s, w, Math.max(1, h * 0.018)); }
  }
  // o: cols, floors, tu, tv (metres per repeat), seed, band ('top' spandrel / 'bottom' balcony parapet), bandFrac,
  // glass rgb, frame and band colours, rows(R, f) -> {occ, kind, b, office}, fins, glowEvery, core (apartment stair column)
  function facadeTex(name, o) {
    const W = o.w || FP, H = Math.round(W * o.tv / o.tu), R = K.rng(o.seed), cw = W / o.cols, fh = H / o.floors;
    const A = K.canvas(W, H), E = K.canvas(W, H), O = K.canvas(W, H), a = A.getContext('2d'), e = E.getContext('2d'), r = O.getContext('2d');
    a.fillStyle = o.frame; a.fillRect(0, 0, W, H); e.fillStyle = '#000'; e.fillRect(0, 0, W, H); r.fillStyle = 'rgb(255,118,205)'; r.fillRect(0, 0, W, H);
    const bh = fh * o.bandFrac, mw = Math.max(1, cw * (o.mullion || 0.05));
    for (let f = 0; f < o.floors; f++) {
      const top = H - (f + 1) * fh, row = o.rows(R, f), vy = o.band === 'bottom' ? top : top + bh, vh = fh - bh;
      for (let c = 0; c < o.cols; c++) {
        const x0 = c * cw + mw / 2, w = cw - mw, gl = o.glass, v = 0.85 + R() * 0.3;
        a.fillStyle = `rgb(${gl[0] * v | 0},${gl[1] * v | 0},${gl[2] * v | 0})`; a.fillRect(x0, vy, w, vh);
        r.fillStyle = `rgb(255,${o.glassRough || 26},${o.glassMetal || 150})`; r.fillRect(x0, vy, w, vh);
        if (o.core && c % o.core === o.core - 1) { e.fillStyle = rgba([180, 205, 240], 0.32); e.fillRect(x0 + w * 0.3, vy + vh * 0.2, w * 0.4, vh * 0.6); continue; }
        if (R() < row.occ) {
          const kind = row.acc && R() < row.acc ? 'acc' : row.kind === 'mix' ? (R() < 0.5 ? 'warm' : 'cool') : row.kind;
          const pal = kind === 'cool' ? COOL : kind === 'acc' ? ACC : WARM, col = pal[Math.floor(R() * pal.length)];
          room(e, x0, vy, w, vh, col, row.b * (0.6 + R() * 0.4), R, row.office);
        } else if (R() < 0.08) { e.fillStyle = rgba([90, 110, 200], 0.12); e.fillRect(x0, vy + vh * 0.5, w, vh * 0.5); }
      }
      const by = o.band === 'bottom' ? top + fh - bh : top;
      a.fillStyle = o.bandCol; a.fillRect(0, by, W, bh);
      if (o.band === 'bottom') { a.fillStyle = 'rgba(255,255,255,0.08)'; a.fillRect(0, by, W, Math.max(1, bh * 0.12)); }
      r.fillStyle = 'rgb(255,150,120)'; r.fillRect(0, by, W, bh);
    }
    if (o.fins) for (let c = 0; c < o.cols; c += o.fins) { a.fillStyle = '#3c4048'; a.fillRect(c * cw, 0, Math.max(1, cw * 0.07), H); }
    if (o.glowEvery) for (let c = 0; c < o.cols; c += o.glowEvery) { e.fillStyle = 'rgb(138,77,255)'; e.fillRect(c * cw, 0, Math.max(1, cw * 0.04), H); a.fillStyle = '#20123a'; a.fillRect(c * cw, 0, Math.max(1, cw * 0.04), H); }
    return { map: tex(A, true, name + '_albedo'), emissiveMap: tex(E, true, name + '_emissive'), orm: tex(O, false, name + '_orm') };
  }
  const facadeMat = (key, tx, o) => std(key, { map: tx.map, emissiveMap: tx.emissiveMap, emissive: '#ffffff', emissiveIntensity: o.ei ?? 1, roughnessMap: tx.orm, metalnessMap: tx.orm, roughness: 1, metalness: 1 }, { tile: o.tile, haze: o.haze ?? 1, envI: o.envI ?? 1.2 });
  const rowHotel = (R) => ({ occ: R() < 0.15 ? 0.04 : 0.12 + R() * 0.22, kind: 'warm', b: 0.72, acc: 0.04 });
  const rowOffice = (R) => { const r = R(); return r < 0.08 ? { occ: 0.85, kind: 'mix', b: 0.75, office: true } : r < 0.3 ? { occ: 0.18, kind: 'warm', b: 0.7, office: true } : { occ: 0.03, kind: 'mix', b: 0.6, office: true }; };
  const rowMixed = (R) => { const r = R(); return r < 0.07 ? { occ: 0.8, kind: 'warm', b: 0.75, office: true } : r < 0.1 ? { occ: 0.35, kind: 'acc', b: 0.55 } : { occ: 0.03 + R() * 0.13, kind: 'warm', b: 0.68 }; };
  const rowApt = (R) => ({ occ: 0.08 + R() * 0.16, kind: 'warm', b: 0.66 });
  // Haneul above and below the map (hotel residences, fins every 3 m, purple on every third fin)
  facadeMat('tower_facade', facadeTex('haneul', { cols: 16, floors: 6, tu: 24, tv: 25.2, seed: 185, band: 'top', bandFrac: 0.262, glass: [16, 19, 28], frame: '#0b0c10', bandCol: '#15161b', rows: rowHotel, fins: 2, glowEvery: 6 }), { tile: [24, 25.2], ei: 0.75, envI: 1.4 });
  // neighbours and the generic glass towers
  facadeMat('env_facade', facadeTex('glass', { cols: 16, floors: 6, tu: 24, tv: 25.2, seed: 181, band: 'top', bandFrac: 0.24, glass: [14, 17, 24], frame: '#0a0b0e', bandCol: '#111216', rows: rowMixed, fins: 4 }), { tile: [24, 25.2], ei: 0.7 });
  facadeMat('ext_office', facadeTex('office', { cols: 16, floors: 6, tu: 24, tv: 25.2, seed: 193, band: 'top', bandFrac: 0.3, glass: [18, 21, 28], frame: '#0d0e12', bandCol: '#1a1b20', rows: rowOffice, mullion: 0.08 }), { tile: [24, 25.2], ei: 0.8 });
  // Korean apartment slabs: 3 m units, 2.8 m floors, balcony parapets, a lit stair column every fourth unit
  facadeMat('ext_apt', facadeTex('apt', { cols: 8, floors: 6, tu: 24, tv: 16.8, seed: 211, band: 'bottom', bandFrac: 0.3, glass: [22, 24, 30], frame: '#2a2b30', bandCol: '#3b3c42', rows: rowApt, core: 4, mullion: 0.1, glassMetal: 90 }), { tile: [24, 16.8], ei: 0.95, envI: 0.8 });
  facadeMat('ext_mid', facadeTex('mid', { w: FP / 2, cols: 32, floors: 12, tu: 48, tv: 50.4, seed: 223, band: 'top', bandFrac: 0.3, glass: [16, 18, 24], frame: '#0c0d10', bandCol: '#141519', rows: rowMixed, mullion: 0.12 }), { tile: [48, 50.4], ei: 0.8 });
  {
    // apartment end walls: plain, a stair-light strip, no numbers or marks
    const n = 256, c = K.canvas(n, n), x = c.getContext('2d'), e = K.canvas(n, n), y = e.getContext('2d');
    x.fillStyle = '#34353b'; x.fillRect(0, 0, n, n); x.fillStyle = '#2a2b30'; for (let j = 0; j < n; j += n / 6) x.fillRect(0, j, n, 2);
    y.fillStyle = '#000'; y.fillRect(0, 0, n, n); y.fillStyle = 'rgba(170,195,235,0.35)'; for (let j = 0; j < n; j += n / 6) y.fillRect(n * 0.46, j + 10, n * 0.08, n / 6 - 22);
    std('ext_aptend', { map: tex(c, true, 'aptend_albedo'), emissiveMap: tex(e, true, 'aptend_emissive'), emissive: '#ffffff', emissiveIntensity: 0.8, roughness: 0.8 }, { tile: [16, 16.8], haze: 1, envI: 0.4 });
  }
  {
    // flat roofs: dark membrane with seams
    const n = 256, N = K.noise(n, 8, 8, 301, 3), c = K.img(n, n, (i, j, o, k) => { const s = (i % 64 < 2 || j % 64 < 2) ? 0.6 : 1, v = (20 + 14 * N[k]) * s; o[0] = v; o[1] = v; o[2] = v * 1.1; });
    std('ext_roof', { map: tex(c, true, 'roof_albedo'), roughness: 0.35, metalness: 0.1 }, { tile: 12, haze: 1, envI: 1.0 });
  }
  {
    // an open concrete frame under construction: slab edges, columns, a few work lights
    const W = 512, H = 358, c = K.canvas(W, H), x = c.getContext('2d'), e = K.canvas(W, H), y = e.getContext('2d'), R = K.rng(41);
    x.fillStyle = '#07070a'; x.fillRect(0, 0, W, H); y.fillStyle = '#000'; y.fillRect(0, 0, W, H);
    for (let f = 0; f < 2; f++) { const t = f * H / 2; x.fillStyle = '#5a5955'; x.fillRect(0, t, W, H * 0.06); x.fillStyle = '#3e3d3a'; for (let c2 = 0; c2 < 2; c2++) x.fillRect(c2 * W / 2 + W / 4 - 8, t, 16, H / 2); }
    for (let k = 0; k < 5; k++) { const px = R() * W, py = H * (0.15 + 0.5 * Math.floor(R() * 2)) + R() * 40, g = y.createRadialGradient(px, py, 1, px, py, 14); g.addColorStop(0, 'rgba(235,240,255,0.7)'); g.addColorStop(1, 'rgba(235,240,255,0)'); y.fillStyle = g; y.fillRect(px - 14, py - 14, 28, 28); }
    std('ext_frame', { map: tex(c, true, 'frame_albedo'), emissiveMap: tex(e, true, 'frame_emissive'), emissive: '#ffffff', emissiveIntensity: 1, roughness: 0.9 }, { tile: [12, 8.4], haze: 1 });
  }
  // emissive line materials with haze (city scale) and a blinking aircraft beacon
  glow('ext_gp', '#8a4dff', 3.0); glow('ext_gk', '#ff4fd8', 2.6); glow('ext_gw', '#ffd2a0', 2.0); glow('ext_gc', '#dfe8ff', 2.0);
  glow('ext_gr', '#ff3a30', 2.4); glow('ext_gs', '#ffbf80', 1.6); glow('ext_gb', '#6f9dff', 2.2);
  glow('ext_beacon', '#ff2a20', 3.0, 0.6);
  std('ext_conc', { color: '#3c3b40', roughness: 0.7 }, { haze: 1, envI: 0.5 });
  std('ext_steel', { color: '#2b2d33', roughness: 0.45, metalness: 0.8 }, { haze: 1 });
  std('ext_asphalt', { color: '#141418', roughness: 0.22, metalness: 0.0 }, { haze: 1, envI: 1.3 });
  tq = mark('facades', tq);

  /* ---------------------------------------------------------------- sky dome and cloud deck */
  {
    const W = FAST ? 512 : 1024, H = W / 2, N = K.noise(256, 5, 5, 401, 5), N2 = K.noise(256, 12, 12, 402, 4), eMin = -0.32;
    const hz = [0.145, 0.125, 0.2], hor = [0.25, 0.21, 0.31], mid = [0.12, 0.105, 0.155], zen = [0.045, 0.042, 0.06];
    const c = K.img(W, H, (i, j, o) => {
      const v = 1 - (j + 0.5) / H, el = eMin + v * (Math.PI / 2 - eMin), e = el * 180 / Math.PI, az = (i / W) * Math.PI * 2;
      let col;
      if (e < 0) col = hz.map((h, q) => lin(h, hor[q], Math.exp(e / 1.5)));
      else {
        const g = Math.exp(-e / 7) * (0.85 + 0.25 * Math.cos(az - Math.PI) + 0.12 * Math.exp(-(((az - 0.7) / 0.5) ** 2)));
        const base = mid.map((m, q) => lin(m, zen[q], sst(12, 75, e)));
        const cl = samp(N, 256, az / (Math.PI * 2) * 3, v * 1.6 + samp(N2, 256, az, v) * 0.15), cloud = sst(0.38, 0.72, cl) * (1 - g * 0.6);
        col = base.map((b2, q) => lin(b2, hor[q], clamp(g, 0, 1)) * (0.72 + 0.62 * cloud));
        col[0] += 0.05 * Math.exp(-(((az - 0.7) / 0.45) ** 2)) * Math.exp(-e / 9); col[2] += 0.02 * Math.exp(-e / 9);
      }
      o[0] = clamp(col[0], 0, 1) * 255; o[1] = clamp(col[1], 0, 1) * 255; o[2] = clamp(col[2], 0, 1) * 255;
    });
    const t = tex(c, true, 'sky_emissive');
    const skm = std('ext_sky', { color: '#000000', emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 1, side: THREE.DoubleSide }, { envI: 0 });
    skm.fog = false;
    // pin the dome to the far plane so an off-centre camera never clips it (viewer only)
    skm.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  gl_Position.z = gl_Position.w * 0.99999;'); };
    skm.customProgramCacheKey = () => 'skyfar';
    const Rs = 8800;
    addUV('sky', grid(96, 24, (u, v) => { const el = eMin + v * (Math.PI / 2 - eMin), a = u * Math.PI * 2; return [Math.sin(a) * Math.cos(el) * Rs, Math.sin(el) * Rs, Math.cos(a) * Math.cos(el) * Rs, u, v]; }, true), 'ext_sky');
    // low cloud deck 175 m above the map, lit from below by the city
    const n = FAST ? 256 : 512, NC = K.noise(n, 4, 4, 411, 6, 0.55), NC2 = K.noise(n, 9, 9, 412, 3);
    const cc = K.img(n, n, (i, j, o, k) => {
      const v = NC[k] * 0.8 + NC2[k] * 0.2, a = sst(0.36, 0.7, v);
      o[0] = (78 + 64 * v) * (0.75 + 0.25 * a); o[1] = (68 + 52 * v) * (0.75 + 0.25 * a); o[2] = (100 + 66 * v) * (0.75 + 0.25 * a); o[3] = a * 215;
    });
    const ct = tex(cc, true, 'cloud', false);
    std('ext_cloud', { color: '#000000', map: ct, emissiveMap: ct, emissive: '#ffffff', emissiveIntensity: 0.9, transparent: true, depthWrite: false, side: THREE.DoubleSide }, { envI: 0 }).fog = false;
    const yc = 175, RC = 7200, TL = 1700;
    addUV('clouds', grid(64, 14, (u, v) => { const a = u * Math.PI * 2, r = RC * Math.pow(v, 1.6), x = Math.sin(a) * r, z = Math.cos(a) * r; return [x, yc + 10 * Math.sin(x / 900) * Math.cos(z / 700), z, x / TL, z / TL]; }), 'ext_cloud');
  }
  tq = mark('sky', tq);

  /* ---------------------------------------------------------------- city plan: blocks, lots, hero towers */
  const LOTS = [], blocksN = [], blocksS = [], PARKS = [];
  for (let k = 0; k < XS.length - 1; k++) {
    const xa = XS[k].x + XS[k].w / 2, xb = XS[k + 1].x - XS[k + 1].w / 2;
    const rz = Math.min(RIVERSIDE_N(xa), RIVERSIDE_N(xb)) - 16;
    if (rz - (ZN[0].z + ZN[0].w / 2) > 40) blocksN.push([xa, ZN[0].z + ZN[0].w / 2, xb, rz, 'river']);
    for (let j = 0; j < ZN.length - 1; j++) blocksN.push([xa, ZN[j + 1].z + ZN[j + 1].w / 2, xb, ZN[j].z - ZN[j].w / 2, '']);
    const sz = Math.max(RIVERSIDE_S(xa), RIVERSIDE_S(xb)) + 16;
    if (ZS[0].z - ZS[0].w / 2 - sz > 40) blocksS.push([xa, sz, xb, ZS[0].z - ZS[0].w / 2, 'river']);
    for (let j = 0; j < ZS.length - 1; j++) blocksS.push([xa, ZS[j].z + ZS[j].w / 2, xb, ZS[j + 1].z - ZS[j + 1].w / 2, '']);
  }
  const OURS = [-105, -95, 45, 75];   // the Haneul block (tower, West Roof, Crane Deck): nothing procedural
  const hillD = (x, z) => Math.hypot(x - HILL.x, z - HILL.z);
  {
    const R = K.rng(5150);
    const lot = (x0, z0, x1, z1, o) => LOTS.push(Object.assign({ x0, z0, x1, z1 }, o));
    const wedge = (x, z) => Math.abs(Math.atan2(x, -z) - HILL_ANG) < 0.16 && z < 0;
    const place = (b, south) => {
      const [x0, z0, x1, z1, tag] = b, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, d = Math.hypot(cx, cz);
      if (d > (FAST ? 2200 : 3000) || Math.abs(cx) > RANGE - 200 || Math.abs(cz) > RANGE - 200) return;
      if (x1 > OURS[0] && x0 < OURS[2] && z1 > OURS[1] && z0 < OURS[3]) return;
      if (hillD(cx, cz) < HILL.r + 60 || Math.hypot(cx - ISL.x, cz - ISL.z) < 300) return;
      if (R() < (d < 900 ? 0.05 : 0.1)) { PARKS.push(b); return; }
      const eastBlock = x0 < 82 && x1 > 56 && z0 < 32 && z1 > -6, bx0 = eastBlock ? 92 : x0;
      const cbdS = south && Math.hypot(cx - 1250, cz - 2050) < 650;
      const capH = (h, x, z) => { if (wedge(x, z)) h = Math.min(h, 300); if (tag === 'river' && !south) h = Math.min(h, Math.abs(x) < 450 ? 60 : 150); return h; };
      if (!cbdS && (d > 950 || south) && (tag === 'river' ? south : R() < 0.42)) {
        // apartment danji: slabs in rows, long axis east-west
        const hb = tag === 'river' && south ? 85 + R() * 30 : 45 + R() * 50;
        for (let z = z0 + 10; z + 13 < z1 - 8; z += 36 + R() * 8) {
          for (let x = bx0 + 8; x < x1 - 30;) {
            const l = Math.min(x1 - 8 - x, 44 + R() * 40); if (l < 26) break;
            lot(x, z, x + l, z + 13, { h: capH(Math.round((hb + R() * 18) / 2.8) * 2.8, x, z), type: 'apt' });
            x += l + 10 + R() * 8;
          }
        }
        return;
      }
      // towers and mid-rise: split the block into 1-4 lots
      const W = x1 - bx0, D = z1 - z0, nx = W > 100 && R() < 0.6 ? 2 : 1, nz = D > 100 && R() < 0.6 ? 2 : 1;
      for (let a = 0; a < nx; a++) for (let c = 0; c < nz; c++) {
        const lx0 = bx0 + (W * a) / nx, lx1 = bx0 + (W * (a + 1)) / nx, lz0 = z0 + (D * c) / nz, lz1 = z0 + (D * (c + 1)) / nz, s = 5 + R() * 6;
        const px = (lx0 + lx1) / 2, pz = (lz0 + lz1) / 2, dd = Math.hypot(px, pz);
        let h, type;
        if (cbdS) { h = 180 + R() * 300; type = R() < 0.5 ? 'office' : 'glass'; }
        else if (dd < 950) { h = (dd < 500 ? 200 : 120) + R() * (dd < 500 ? 230 : 200); type = R() < 0.45 ? 'office' : 'glass'; }
        else if (dd < 1900) { h = 40 + R() * (R() < 0.2 ? 200 : 90); type = h > 120 ? (R() < 0.5 ? 'office' : 'glass') : 'mid'; }
        else { h = 25 + R() * 70; type = 'mid'; }
        lot(lx0 + s, lz0 + s, lx1 - s, lz1 - s, { h: capH(Math.round(h / 4.2) * 4.2, px, pz), type });
      }
    };
    for (const b of blocksN) place(b, false);
    for (const b of blocksS) place(b, true);
    // hero towers near the map: fixed so the skyline reads the same every time
    const HERO = [
      { x: 270, z: -190, w: 50, d: 50, h: 562, type: 'office', oct: 9, crown: 'spire', holo: { face: 'z1', y0: 210, y1: 400 } },
      { x: -185, z: -185, w: 44, d: 56, h: 498, type: 'glass', tiers: 3, crown: 'frame' },
      { x: 270, z: -15, w: 46, d: 46, h: 430, type: 'glass', oct: 8, crown: 'ring' },
      { x: -335, z: -10, w: 38, d: 62, h: 384, type: 'office', tiers: 2, crown: 'frame' },
      { x: 430, z: -350, w: 42, d: 42, h: 470, type: 'glass', oct: 7, crown: 'spire' },
      { x: -185, z: -350, w: 54, d: 34, h: 440, type: 'office', tiers: 2, crown: 'ring' },
      { x: 120, z: -190, w: 40, d: 40, h: 356, type: 'office', crown: 'frame' },
      { x: -335, z: -185, w: 40, d: 40, h: 410, type: 'glass', oct: 6, crown: 'ring', holo: { face: 'x1', y0: 160, y1: 330 } },
      { x: 120, z: -360, w: 46, d: 46, h: 300, type: 'glass', crown: 'frame' },
      { x: 590, z: -15, w: 44, d: 44, h: 400, type: 'office', crown: 'spire' },
      { x: -490, z: -350, w: 40, d: 40, h: 360, type: 'glass', oct: 6, crown: 'frame' },
      { x: 1240, z: 1980, w: 60, d: 60, h: 540, type: 'office', oct: 10, crown: 'spire', holo: { face: 'z0', y0: 220, y1: 470 } },
      { x: 1520, z: 2140, w: 46, d: 46, h: 470, type: 'glass', crown: 'ring' },
      { x: 980, z: 2160, w: 44, d: 44, h: 420, type: 'glass', oct: 7, crown: 'frame' },
      { x: 320, z: 1960, w: 52, d: 52, h: 610, type: 'glass', oct: 9, crown: 'ring', holo: { face: 'z0', y0: 300, y1: 540 } },
      { x: -620, z: 2120, w: 48, d: 48, h: 520, type: 'office', tiers: 3, crown: 'spire' },
      { x: -1480, z: 2040, w: 46, d: 46, h: 480, type: 'glass', crown: 'frame' },
      { x: 2150, z: 2300, w: 50, d: 50, h: 560, type: 'office', oct: 8, crown: 'spire', holo: { face: 'z0', y0: 260, y1: 480 } },
      { x: 1700, z: 1890, w: 40, d: 40, h: 455, type: 'glass', oct: 6, crown: 'ring' },
      { x: 30, z: 2280, w: 44, d: 44, h: 500, type: 'office', crown: 'frame' },
    ];
    for (const H of HERO) {
      for (let i = LOTS.length - 1; i >= 0; i--) { const q = LOTS[i]; if (q.x1 > H.x - H.w / 2 - 20 && q.x0 < H.x + H.w / 2 + 20 && q.z1 > H.z - H.d / 2 - 20 && q.z0 < H.z + H.d / 2 + 20) LOTS.splice(i, 1); }
      LOTS.push(Object.assign({ x0: H.x - H.w / 2, x1: H.x + H.w / 2, z0: H.z - H.d / 2, z1: H.z + H.d / 2, hero: true }, H));
    }
    // a mid-rise behind the East Tower in its own block; a low riverfront podium south of the Haneul block
    LOTS.push({ x0: 100, x1: 150, z0: -70, z1: 10, h: 210, type: 'office' });
    LOTS.push({ x0: -90, x1: -20, z0: 96, z1: 150, h: 26, type: 'mid' }, { x0: 0, x1: 30, z0: 96, z1: 140, h: 18, type: 'mid' });
  }
  tq = mark('plan', tq);

  /* ---------------------------------------------------------------- ground: the street grid baked into two textures */
  {
    // albedo (wet asphalt, sidewalks, parks, plazas) and emissive (street lights, crossings, static light trails)
    function paint(Wpx, Hpx, X0, Z0, Wm, Hm, near) {
      const A = K.canvas(Wpx, Hpx), E = K.canvas(Wpx, Hpx), a = A.getContext('2d'), e = E.getContext('2d'), s = Wpx / Wm, sz = Hpx / Hm, R = K.rng(near ? 71 : 72);
      a.setTransform(s, 0, 0, sz, -X0 * s, -Z0 * sz); e.setTransform(s, 0, 0, sz, -X0 * s, -Z0 * sz);
      const px = Wm / Wpx;
      a.fillStyle = '#0f0f13'; a.fillRect(X0, Z0, Wm, Hm); e.fillStyle = '#000'; e.fillRect(X0, Z0, Wm, Hm);
      const inView = (x0, z0, x1, z1) => x1 > X0 && x0 < X0 + Wm && z1 > Z0 && z0 < Z0 + Hm;
      for (const b of [...blocksN, ...blocksS]) { if (!inView(b[0], b[1], b[2], b[3])) continue; a.fillStyle = '#1d1d22'; a.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); a.fillStyle = '#121216'; a.fillRect(b[0] + 5, b[1] + 5, b[2] - b[0] - 10, b[3] - b[1] - 10); }
      for (const p of PARKS) { if (!inView(p[0], p[1], p[2], p[3])) continue; a.fillStyle = '#0b120c'; a.fillRect(p[0] + 4, p[1] + 4, p[2] - p[0] - 8, p[3] - p[1] - 8); e.strokeStyle = 'rgba(255,205,150,0.35)'; e.lineWidth = Math.max(px, 1.2); e.beginPath(); e.ellipse((p[0] + p[2]) / 2, (p[1] + p[3]) / 2, (p[2] - p[0]) * 0.33, (p[3] - p[1]) * 0.33, 0, 0, 7); e.stroke(); }
      // shop-front light round every building base
      for (const q of LOTS) { if (!inView(q.x0, q.z0, q.x1, q.z1)) continue; e.strokeStyle = 'rgba(255,196,140,0.16)'; e.lineWidth = 7; e.strokeRect(q.x0 - 3, q.z0 - 3, q.x1 - q.x0 + 6, q.z1 - q.z0 + 6); e.strokeStyle = 'rgba(255,215,170,0.3)'; e.lineWidth = Math.max(px, 1); e.strokeRect(q.x0 - 1, q.z0 - 1, q.x1 - q.x0 + 2, q.z1 - q.z0 + 2); }
      // the Haneul plaza: wet stone, purple LED lines, bollard lights
      a.fillStyle = '#26262c'; a.fillRect(OURS[0] + 6, OURS[1] + 6, OURS[2] - OURS[0] - 12, OURS[3] - OURS[1] - 12);
      e.strokeStyle = 'rgba(150,90,255,0.75)'; e.lineWidth = Math.max(px, 0.4);
      for (const off of [3, 7]) { e.beginPath(); e.moveTo(-34 - off, 21); e.lineTo(-34 - off, 57 + off); e.lineTo(34 + off, 57 + off); e.lineTo(34 + off, 21); e.stroke(); }
      e.fillStyle = 'rgba(255,210,160,0.8)'; for (let x = -100; x <= 40; x += 6) e.fillRect(x, 70, Math.max(px, 0.5), Math.max(px, 0.5));
      const street = (x0, z0, x1, z1) => { a.fillStyle = '#18181d'; a.fillRect(x0, z0, x1 - x0, z1 - z0); };
      const lightsAlong = (ax, az, bx, bz, w, sp, avenue) => {
        const L2 = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L2, dz = (bz - az) / L2, nx = -dz, nz = dx;
        e.lineCap = 'butt';
        e.strokeStyle = `rgba(255,178,110,${avenue ? 0.16 : 0.11})`; e.lineWidth = w * 0.9; e.beginPath(); e.moveTo(ax, az); e.lineTo(bx, bz); e.stroke();
        for (const f of avenue ? [0.12, 0.3] : [0.2]) {
          // static long-exposure trails: warm white one way, red the other
          e.lineWidth = Math.max(px * 0.8, near ? 0.5 : 1.2);
          e.strokeStyle = 'rgba(255,236,210,0.32)'; e.beginPath(); e.moveTo(ax + nx * w * f, az + nz * w * f); e.lineTo(bx + nx * w * f, bz + nz * w * f); e.stroke();
          e.strokeStyle = 'rgba(255,50,40,0.36)'; e.beginPath(); e.moveTo(ax - nx * w * f, az - nz * w * f); e.lineTo(bx - nx * w * f, bz - nz * w * f); e.stroke();
        }
        if (near) {
          a.strokeStyle = 'rgba(170,170,180,0.35)'; a.lineWidth = 0.18; a.setLineDash([3, 6]); a.beginPath(); a.moveTo(ax, az); a.lineTo(bx, bz); a.stroke(); a.setLineDash([]);
          for (let t = R() * sp; t < L2; t += sp) for (const sg of [1, -1]) {
            const x = ax + dx * t + nx * sg * (w / 2 + 1.5), z = az + dz * t + nz * sg * (w / 2 + 1.5);
            if (x < X0 || x > X0 + Wm || z < Z0 || z > Z0 + Hm) continue;
            const g = e.createRadialGradient(x, z, 0.3, x, z, 11); g.addColorStop(0, 'rgba(255,214,170,0.5)'); g.addColorStop(1, 'rgba(255,190,130,0)'); e.fillStyle = g; e.fillRect(x - 11, z - 11, 22, 22);
            a.fillStyle = '#0b100c'; a.beginPath(); a.arc(x + dx * sp / 2, z + dz * sp / 2, 2.6, 0, 7); a.fill();
          }
        } else {
          e.strokeStyle = 'rgba(255,210,160,0.22)'; e.lineWidth = Math.max(px, 2); e.setLineDash([2 * px, 26]);
          for (const sg of [1, -1]) { e.beginPath(); e.moveTo(ax + nx * sg * w / 2, az + nz * sg * w / 2); e.lineTo(bx + nx * sg * w / 2, bz + nz * sg * w / 2); e.stroke(); }
          e.setLineDash([]);
        }
      };
      const crossing = (x, z, w1, w2) => {
        const g = e.createRadialGradient(x, z, 1, x, z, near ? 24 : 30); g.addColorStop(0, 'rgba(255,232,206,0.35)'); g.addColorStop(1, 'rgba(255,232,206,0)'); e.fillStyle = g; e.fillRect(x - 30, z - 30, 60, 60);
        if (!near) return;
        a.fillStyle = 'rgba(200,200,210,0.32)';
        for (let t = -w1 / 2 + 1; t < w1 / 2 - 1; t += 1.2) { a.fillRect(x + t, z - w2 / 2 - 4, 0.6, 3); a.fillRect(x + t, z + w2 / 2 + 1, 0.6, 3); }
        for (let t = -w2 / 2 + 1; t < w2 / 2 - 1; t += 1.2) { a.fillRect(x - w1 / 2 - 4, z + t, 3, 0.6); a.fillRect(x + w1 / 2 + 1, z + t, 3, 0.6); }
      };
      for (const S of XS) {
        if (S.x < X0 - 40 || S.x > X0 + Wm + 40) continue;
        const zb = RIVERSIDE_N(S.x), za = Math.max(Z0, -RANGE);
        if (zb > za) { street(S.x - S.w / 2, za, S.x + S.w / 2, zb); lightsAlong(S.x, za, S.x, zb, S.w, 26, S.w > 30); }
        const sa = RIVERSIDE_S(S.x);
        if (sa < Z0 + Hm) { street(S.x - S.w / 2, sa, S.x + S.w / 2, RANGE); lightsAlong(S.x, sa, S.x, RANGE, S.w, 26, S.w > 30); }
      }
      for (const S of [...ZN, ...ZS]) {
        if (S.z < Z0 - 40 || S.z > Z0 + Hm + 40) continue;
        street(Math.max(X0, -RANGE), S.z - S.w / 2, Math.min(X0 + Wm, RANGE), S.z + S.w / 2); lightsAlong(Math.max(X0, -RANGE), S.z, Math.min(X0 + Wm, RANGE), S.z, S.w, 26, S.w > 30);
        for (const X of XS) if (X.x > X0 && X.x < X0 + Wm) crossing(X.x, S.z, X.w, S.w);
      }
      // riverside roads (curved) and the riverside parks between the expressways and the water
      for (const [fn, park0, park1] of [[RIVERSIDE_N, (x) => EXPRESS_N(x) + 18, bankN], [RIVERSIDE_S, bankS, (x) => EXPRESS_S(x) - 18]]) {
        const path = (c) => { c.beginPath(); for (let x = X0 - 50; x <= X0 + Wm + 50; x += 25) c.lineTo(x, fn(x)); };
        a.strokeStyle = '#18181d'; a.lineWidth = 26; path(a); a.stroke();
        e.strokeStyle = 'rgba(255,190,120,0.16)'; e.lineWidth = 24; path(e); e.stroke();
        a.fillStyle = '#0a110c'; a.beginPath(); for (let x = X0 - 50; x <= X0 + Wm + 50; x += 25) a.lineTo(x, park0(x)); for (let x = X0 + Wm + 50; x >= X0 - 50; x -= 25) a.lineTo(x, park1(x)); a.closePath(); a.fill();
        e.fillStyle = 'rgba(255,214,170,0.55)'; for (let x = X0; x <= X0 + Wm; x += near ? 14 : 28) { const z = lin(park0(x), park1(x), 0.55 + 0.2 * Math.sin(x / 140)); e.fillRect(x, z, Math.max(px, 0.6), Math.max(px, 0.6)); }
      }
      // the island park and the forested hill
      a.fillStyle = '#0a110c'; a.beginPath(); a.ellipse(ISL.x, ISL.z, ISL.a, ISL.b, 0, 0, 7); a.fill();
      e.strokeStyle = 'rgba(255,214,170,0.45)'; e.lineWidth = Math.max(px, 1.5); e.setLineDash([px * 2, 18]); e.beginPath(); e.ellipse(ISL.x, ISL.z, ISL.a * 0.8, ISL.b * 0.6, 0, 0, 7); e.stroke(); e.setLineDash([]);
      a.fillStyle = '#080b08'; a.beginPath(); a.arc(HILL.x, HILL.z, HILL.r + 40, 0, 7); a.fill();
      return { A, E };
    }
    const NW = FAST ? 1024 : 2048, nearB = [-700, -700, 1400, 900];
    const far = paint(NW, NW, -RANGE, -RANGE, RANGE * 2, RANGE * 2, false);
    const nr = paint(NW, Math.round(NW * nearB[3] / nearB[2]), nearB[0], nearB[1], nearB[2], nearB[3], true);
    const gm = (key, P) => std(key, { map: tex(P.A, true, key + '_albedo'), emissiveMap: tex(P.E, true, key + '_emissive'), emissive: '#ffffff', emissiveIntensity: 1.0, roughness: 0.26, metalness: 0.05 }, { haze: 1, envI: 1.3 });
    gm('ext_ground', far); gm('ext_ground_near', nr);
    const uvF = (x, z) => [(x + RANGE) / (2 * RANGE), 1 - (z + RANGE) / (2 * RANGE)];
    // north and south land (the river channel stays open), the near patch, the island
    addUV('ground', grid(220, 1, (u, v) => { const x = -RANGE + 2 * RANGE * u, z = v < 0.5 ? -RANGE : bankN(x); return [x, G, z, ...uvF(x, z)]; }, true), 'ext_ground');
    addUV('ground', grid(220, 1, (u, v) => { const x = -RANGE + 2 * RANGE * u, z = v < 0.5 ? bankS(x) : RANGE; return [x, G, z, ...uvF(x, z)]; }, true), 'ext_ground');
    addUV('ground', grid(1, 1, (u, v) => { const x = nearB[0] + nearB[2] * u, z = nearB[1] + nearB[3] * v; return [x, G + 0.8, z, u, 1 - v]; }, true), 'ext_ground_near');
    addUV('ground', grid(32, 4, (u, v) => { const a = u * Math.PI * 2, x = ISL.x + Math.sin(a) * ISL.a * v, z = ISL.z + Math.cos(a) * ISL.b * v; return [x, G - 1.5, z, ...uvF(x, z)]; }, true), 'ext_ground');
    // outer land to the horizon (plain, hazed out); the river keeps flowing out east and west
    std('ext_land_out', { color: '#0c0b10', emissive: '#120c1c', emissiveIntensity: 1, roughness: 0.4 }, { haze: 1, envI: 0.6 });
    const og = deco('ground').gb('ext_land_out'), F = 9000;
    og.face([[-F, G, -F], [F, G, -F], [F, G, -RANGE], [-F, G, -RANGE]], [0, 1, 0]); og.face([[-F, G, RANGE], [F, G, RANGE], [F, G, F], [-F, G, F]], [0, 1, 0]);
    for (const [x0, x1] of [[-F, -RANGE], [RANGE, F]]) { const xe = x0 < 0 ? x1 : x0; og.face([[x0, G, -RANGE], [x1, G, -RANGE], [x1, G, bankN(xe)], [x0, G, bankN(xe)]], [0, 1, 0]); og.face([[x0, G, bankS(xe)], [x1, G, bankS(xe)], [x1, G, RANGE], [x0, G, RANGE]], [0, 1, 0]); }
  }
  tq = mark('ground', tq);

  /* ---------------------------------------------------------------- the river: water, embankments, expressways */
  const REFL = { w: [], c: [], r: [], p: [], k: [] };
  // a reflection streak on the water from a light at (x, z), stretched toward the map
  const refl = (col, x, z, w, len) => {
    if (!inRiver(x, z, -6)) return;
    const d = P2.norm([-x, -z]), n = [-d[1], d[0]], y = G - 4.85, a = [x - n[0] * w / 2, z - n[1] * w / 2], b = [x + n[0] * w / 2, z + n[1] * w / 2];
    let t = 1; for (let s = 0.1; s <= 1.001; s += 0.1) { const p = P2.add([x, z], P2.mul(d, len * s)); if (!inRiver(p[0], p[1], -6)) { t = Math.max(0.1, s - 0.1); break; } }
    const e = P2.mul(d, len * t), a2 = P2.add(a, e), b2 = P2.add(b, e);
    REFL[col].push([[a[0], y, a[1]], [b[0], y, b[1]], [b2[0], y, b2[1]], [a2[0], y, a2[1]]]);
  };
  {
    const n = FAST ? 256 : 512, NH = K.noise(n, 24, 24, 501, 3), NR = K.noise(n, 64, 64, 502, 2), H = new Float32Array(n * n);
    for (let k = 0; k < H.length; k++) H[k] = NH[k] * 0.6 + NR[k] * 0.4;
    const alb = K.img(64, 64, (i, j, o) => { o[0] = 8; o[1] = 10; o[2] = 16; });
    std('ext_river', { map: tex(alb, true, 'river_albedo'), normalMap: tex(nrm(H, n, 2.2), false, 'river_normal'), color: '#ffffff', emissive: '#0d0a16', emissiveIntensity: 1, roughness: 0.08, metalness: 0.6 }, { tile: 60, haze: 1, envI: 2.6, ns: 0.5 });
    deco('river').gb('ext_river').face([[-9000, G - 5, -200], [9000, G - 5, -200], [9000, G - 5, 3200], [-9000, G - 5, 3200]], [0, 1, 0]);
    // embankment walls and the promenade lamps
    const bk = deco('river').gb('ext_conc'), lamp = deco('river').gb('ext_gw');
    for (const [fn, sg] of [[bankN, 1], [bankS, -1]]) {
      for (let x = -RANGE; x < RANGE; x += 40) {
        const a = [x, fn(x)], b = [x + 40, fn(x + 40)];
        bk.face([[a[0], G - 5, a[1]], [b[0], G - 5, b[1]], [b[0], G + 0.8, b[1]], [a[0], G + 0.8, a[1]]], [0, 0, sg]);
        if (Math.abs(x) < 3200) K.abox(lamp, x - 0.5, x + 0.5, G + 1, G + 1.8, a[1] - sg * 4 - 0.5, a[1] - sg * 4 + 0.5);
      }
    }
    for (let k = 0; k < 32; k++) { const a0 = k / 32 * Math.PI * 2, a1 = (k + 1) / 32 * Math.PI * 2, p0 = [ISL.x + Math.sin(a0) * ISL.a, ISL.z + Math.cos(a0) * ISL.b], p1 = [ISL.x + Math.sin(a1) * ISL.a, ISL.z + Math.cos(a1) * ISL.b], nn = P2.norm([(p0[0] + p1[0]) / 2 - ISL.x, ((p0[1] + p1[1]) / 2 - ISL.z) * (ISL.a / ISL.b)]); bk.face([[p0[0], G - 5, p0[1]], [p1[0], G - 5, p1[1]], [p1[0], G - 1.5, p1[1]], [p0[0], G - 1.5, p0[1]]], [nn[0], 0, nn[1]]); }
    // riverside expressways: raised decks with trail lines (white one way, red the other) and purple edge lines
    const ex = deco('roads'), dk = ex.gb('ext_asphalt'), tw = ex.gb('ext_gc'), tr = ex.gb('ext_gr'), ed = ex.gb('ext_gp');
    for (const fn of [EXPRESS_N, EXPRESS_S]) {
      for (let x = -RANGE; x < RANGE; x += 100) {
        const a = [x, fn(x)], b = [x + 100, fn(x + 100)], d = P2.norm(P2.sub(b, a)), nn = [-d[1], d[0]];
        K.sbox(dk, a, b, 32, G + 1.0, G + 1.8);
        for (const [off, g] of [[-9, tw], [-5, tw], [5, tr], [9, tr]]) K.sbox(g, P2.add(a, P2.mul(nn, off)), P2.add(b, P2.mul(nn, off)), 0.5, G + 1.8, G + 1.95);
        if (Math.abs(x) < 3000) for (const sg of [1, -1]) K.sbox(ed, P2.add(a, P2.mul(nn, sg * 16.2)), P2.add(b, P2.mul(nn, sg * 16.2)), 0.3, G + 1.2, G + 1.5);
      }
    }
  }
  tq = mark('river', tq);

  /* ---------------------------------------------------------------- bridges */
  {
    const bd = deco('bridges'), deckH = G + 20, R = K.rng(707);
    for (const B of BRIDGES) {
      const x = B.x, z0 = bankN(x) - 70, z1 = bankS(x) + 70, W = B.t === 'truss' ? 26 : 30, w2 = W / 2;
      const c = bd.gb('ext_conc'), st = bd.gb('ext_steel'), led = bd.gb('ext_' + B.c), lw = bd.gb('ext_gs');
      K.abox(c, x - w2, x + w2, deckH - 3.2, deckH, z0, z1);
      K.beam(c, [x, G + 2.6, z0 - 220], [x, deckH - 1.6, z0], W, 3.2); K.beam(c, [x, deckH - 1.6, z1], [x, G + 2.6, z1 + 220], W, 3.2);
      // piers with uplights
      const span = B.t === 'cable' ? 160 : B.t.startsWith('arch') ? 190 : 85;
      for (let z = z0 + span / 2; z < z1 - 20; z += span) {
        K.abox(c, x - w2 + 3, x + w2 - 3, G - 6, deckH - 3.2, z - 4, z + 4, '+y');
        K.abox(bd.gb(B.c === 'gk' ? 'ext_gk' : 'ext_gb'), x - w2 + 2.9, x + w2 - 2.9, G - 4.8, G - 4.4, z - 4.1, z + 4.1, '+y-y');
        refl(B.c === 'gk' ? 'k' : 'p', x, z, 10, 120);
      }
      // deck edge LED lines (the bridge's colour), lamp heads, trails
      for (const sg of [-1, 1]) {
        K.abox(led, x + sg * w2 - 0.15, x + sg * w2 + 0.15, deckH - 1.6, deckH - 1.1, z0, z1);
        for (let z = z0 + 10; z < z1; z += 40) {
          K.abox(lw, x + sg * (w2 - 1) - 0.7, x + sg * (w2 - 1) + 0.7, deckH + 9.4, deckH + 10, z - 0.9, z + 0.9, '+y');
          if (R() < 0.6) refl('w', x + sg * (w2 - 1), z, 9 + R() * 6, 110 + R() * 80);
        }
        for (const o of [5.5, 9.5]) K.abox(bd.gb(sg < 0 ? 'ext_gc' : 'ext_gr'), x + sg * o - 0.3, x + sg * o + 0.3, deckH + 0.05, deckH + 0.2, z0, z1);
        K.abox(st, x + sg * w2 - 0.3, x + sg * w2 + 0.3, deckH, deckH + 1.2, z0, z1);
      }
      for (let z = z0 + 60; z < z1; z += 140) refl(B.c === 'gk' ? 'k' : B.c === 'gp' ? 'p' : 'c', x, z, 18, 200);
      if (B.t === 'arch' || B.t === 'arch2') {
        // a run of steel arches (lit), hangers
        const n = Math.floor((z1 - z0) / span);
        for (let k = 0; k < n; k++) {
          const za = z0 + span / 2 + k * span, zb = za + span, H = B.t === 'arch' ? 42 : 30;
          for (const sg of [-1, 1]) {
            const xx = x + sg * (w2 + 0.8), pts = [];
            for (let s = 0; s <= 14; s++) { const t = s / 14; pts.push([xx, deckH + H * 4 * t * (1 - t), lin(za, zb, t)]); }
            for (let s = 0; s < 14; s++) { K.beam(st, pts[s], pts[s + 1], 1.6, 2.2); K.beam(bd.gb(B.t === 'arch' ? 'ext_gp' : 'ext_gk'), [pts[s][0] + sg * 0.9, pts[s][1], pts[s][2]], [pts[s + 1][0] + sg * 0.9, pts[s + 1][1], pts[s + 1][2]], 0.5, 0.5); }
            for (let s = 1; s < 14; s++) K.beam(bd.gb('ext_gc'), [xx, deckH, pts[s][2]], [xx, pts[s][1] - 1, pts[s][2]], 0.25);
          }
          if (B.t === 'arch2') { const zm = (za + zb) / 2; K.beam(st, [x - w2 - 0.8, deckH + H - 1, zm], [x + w2 + 0.8, deckH + H - 1, zm], 1.2); }
        }
      } else if (B.t === 'cable') {
        // one pylon mid-river, a fan of lit cables both ways
        const zm = zc(x), top = deckH + 150;
        for (const sg of [-1, 1]) K.beam(st, [x + sg * (w2 + 1), G - 5, zm], [x + sg * 2.5, top, zm], 4.5, 6);
        K.beam(bd.gb('ext_gc'), [x - w2 - 2.6, deckH + 4, zm], [x - 4.2, top, zm], 0.8); K.beam(bd.gb('ext_gc'), [x + w2 + 2.6, deckH + 4, zm], [x + 4.2, top, zm], 0.8);
        K.abox(bd.gb('ext_beacon'), x - 1.5, x + 1.5, top, top + 3, zm - 1.5, zm + 1.5);
        for (let k = 1; k <= 14; k++) for (const dz of [-1, 1]) for (const sg of [-1, 1]) K.beam(bd.gb('ext_gc'), [x + sg * 2.5, top - 8 - k * 4.5, zm], [x + sg * (w2 - 0.5), deckH + 0.6, zm + dz * k * 34], 0.45);
        refl('c', x, zm + 20, 12, 260);
      } else if (B.t === 'truss') {
        // double-deck truss: diagonal members along both sides, a lit lower deck
        for (const sg of [-1, 1]) {
          const xx = x + sg * (w2 + 0.4);
          K.beam(st, [xx, deckH + 12, z0 + 100], [xx, deckH + 12, z1 - 100], 1.0);
          for (let z = z0 + 100; z < z1 - 100; z += 24) { K.beam(st, [xx, deckH, z], [xx, deckH + 12, z + 12], 0.7); K.beam(st, [xx, deckH + 12, z + 12], [xx, deckH, z + 24], 0.7); }
          K.beam(bd.gb('ext_gk'), [xx + sg * 0.6, deckH + 12.5, z0 + 100], [xx + sg * 0.6, deckH + 12.5, z1 - 100], 0.4);
        }
        K.abox(c, x - w2, x + w2, deckH - 9, deckH - 7.4, z0 + 60, z1 - 60);
        K.abox(bd.gb('ext_gw'), x - w2 + 1, x + w2 - 1, deckH - 9.2, deckH - 9.0, z0 + 60, z1 - 60, '+y');
      }
    }
  }
  tq = mark('bridges', tq);

  /* ---------------------------------------------------------------- city buildings */
  const HOLOS = [], BEACONS = [];
  {
    const city = deco('city'), roof = city.gb('ext_roof'), R = K.rng(6060);
    const facOf = (t) => (t === 'office' ? 'ext_office' : t === 'glass' ? 'env_facade' : t === 'apt' ? 'ext_apt' : 'ext_mid');
    const box = (fk, x0, x1, y0, y1, z0, z1, endKey) => { const f = city.gb(fk); K.abox({ x: endKey ? city.gb(endKey) : f, y: roof, z: f }, x0, x1, y0, y1, z0, z1, '-y'); };
    // edge lines as single outward quads (cheap): a roof outline and vertical corner lines
    const outline = (gk, x0, x1, y, z0, z1, t = 0.5) => {
      const g = city.gb(gk), e = 0.06, X0 = x0 - e, X1 = x1 + e, Z0 = z0 - e, Z1 = z1 + e, y0 = y - t;
      g.face([[X0, y0, Z0], [X1, y0, Z0], [X1, y, Z0], [X0, y, Z0]], [0, 0, -1]); g.face([[X0, y0, Z1], [X1, y0, Z1], [X1, y, Z1], [X0, y, Z1]], [0, 0, 1]);
      g.face([[X0, y0, Z0], [X0, y0, Z1], [X0, y, Z1], [X0, y, Z0]], [-1, 0, 0]); g.face([[X1, y0, Z0], [X1, y0, Z1], [X1, y, Z1], [X1, y, Z0]], [1, 0, 0]);
    };
    const corners = (gk, x0, x1, y0, y1, z0, z1, t = 0.45) => {
      const g = city.gb(gk), e = 0.06;
      for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
        const sx = cx === x0 ? -1 : 1, sz = cz === z0 ? -1 : 1, X = cx + sx * e, Z = cz + sz * e;
        g.face([[X, y0, cz - sz * t], [X, y0, Z], [X, y1, Z], [X, y1, cz - sz * t]], [sx, 0, 0]); g.face([[cx - sx * t, y0, Z], [X, y0, Z], [X, y1, Z], [cx - sx * t, y1, Z]], [0, 0, sz]);
      }
    };
    const octo = (cx, cz, w, d, ch) => [[cx - w / 2 + ch, cz - d / 2], [cx + w / 2 - ch, cz - d / 2], [cx + w / 2, cz - d / 2 + ch], [cx + w / 2, cz + d / 2 - ch], [cx + w / 2 - ch, cz + d / 2], [cx - w / 2 + ch, cz + d / 2], [cx - w / 2, cz + d / 2 - ch], [cx - w / 2, cz - d / 2 + ch]];
    for (const q of LOTS) {
      const y0 = G, top = G + q.h, fk = facOf(q.type), tall = q.h > 150, cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2;
      if (q.type === 'apt') {
        box(fk, q.x0, q.x1, y0, top, q.z0, q.z1, 'ext_aptend');
        K.abox(roof, q.x0 + 4, q.x0 + 10, top, top + 4, q.z0 + 3, q.z1 - 3, '-y');
        if (R() < 0.06) outline('ext_gc', q.x0, q.x1, top, q.z0, q.z1, 0.3);
      } else if (q.oct) {
        const P = octo(cx, cz, q.x1 - q.x0, q.z1 - q.z0, q.oct);
        K.prism(K.region([P]), y0, top, roof, null, city.gb(fk));
        for (const p of P) K.abox(city.gb('ext_gp'), p[0] - 0.3, p[0] + 0.3, top - q.h * 0.55, top, p[1] - 0.3, p[1] + 0.3);
        for (let i = 0; i < P.length; i++) K.sbox(city.gb(q.crown === 'ring' ? 'ext_gk' : 'ext_gp'), P[i], P[(i + 1) % P.length], 0.6, top - 0.6, top);
      } else if (q.tiers) {
        let x0 = q.x0, x1 = q.x1, z0 = q.z0, z1 = q.z1, yb = y0;
        for (let t = 0; t < q.tiers; t++) {
          const yt = t === q.tiers - 1 ? top : yb + q.h * (t === 0 ? 0.55 : 0.28);
          box(fk, x0, x1, yb, yt, z0, z1); outline('ext_gp', x0, x1, yt, z0, z1, 0.5);
          if (t === q.tiers - 1) corners('ext_gp', x0, x1, yb, yt, z0, z1);
          yb = yt; const s = Math.min(x1 - x0, z1 - z0) * 0.12; x0 += s; x1 -= s; z0 += s; z1 -= s;
        }
      } else {
        box(fk, q.x0, q.x1, y0, top, q.z0, q.z1);
        const r = R();
        if (tall && r < 0.3) corners(r < 0.2 ? 'ext_gp' : 'ext_gk', q.x0, q.x1, top - Math.min(q.h, 120 + R() * 200), top, q.z0, q.z1);
        if (r < 0.16 || q.hero) outline(R() < 0.6 ? 'ext_gp' : R() < 0.5 ? 'ext_gc' : 'ext_gk', q.x0, q.x1, top, q.z0, q.z1, 0.5);
        else if (r < 0.3) outline('ext_gw', q.x0, q.x1, top, q.z0, q.z1, 0.3);
        if (q.h > 60 && R() < 0.6) { const s = Math.min(q.x1 - q.x0, q.z1 - q.z0) * 0.25; K.abox({ x: city.gb('louvre'), y: roof, z: city.gb('louvre') }, cx - s, cx + s, top, top + 5 + R() * 6, cz - s, cz + s, '-y'); }
      }
      if (q.crown === 'spire') { K.beam(city.gb('ext_steel'), [cx, top, cz], [cx, top + 60, cz], 1.4); K.beam(city.gb('ext_gp'), [cx + 0.8, top, cz], [cx + 0.8, top + 58, cz], 0.35); BEACONS.push([cx, top + 61, cz, 1.4]); }
      else if (q.crown === 'frame') { const s = 0.18 * Math.min(q.x1 - q.x0, q.z1 - q.z0); for (const [ax, az] of [[q.x0 + s, q.z0 + s], [q.x1 - s, q.z0 + s], [q.x1 - s, q.z1 - s], [q.x0 + s, q.z1 - s]]) K.beam(city.gb('ext_steel'), [ax, top, az], [ax, top + 22, az], 0.9); outline('ext_gp', q.x0 + s, q.x1 - s, top + 22, q.z0 + s, q.z1 - s, 0.6); BEACONS.push([q.x0 + s, top + 23, q.z0 + s, 1]); }
      else if (q.crown === 'ring') { const r2 = 0.42 * Math.min(q.x1 - q.x0, q.z1 - q.z0); for (let k = 0; k < 24; k++) { const a0 = k / 24 * Math.PI * 2, a1 = (k + 1) / 24 * Math.PI * 2; K.sbox(city.gb('ext_gk'), [cx + Math.sin(a0) * r2, cz + Math.cos(a0) * r2], [cx + Math.sin(a1) * r2, cz + Math.cos(a1) * r2], 0.6, top + 14, top + 15.2); } for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.4; K.beam(city.gb('ext_steel'), [cx + Math.sin(a) * r2, top, cz + Math.cos(a) * r2], [cx + Math.sin(a) * r2, top + 14, cz + Math.cos(a) * r2], 0.6); } BEACONS.push([cx, top + 16, cz, 1]); }
      else if (q.h > 200) BEACONS.push([q.x0 + 1, top + 1, q.z0 + 1, 0.9]);
      if (q.holo) HOLOS.push(Object.assign({ q }, q.holo));
      // riverfront buildings mirror in the water
      if (q.z1 > bankS(cx) && q.z0 < bankS(cx) + 260 && q.h > 40) refl(R() < 0.6 ? 'w' : 'c', cx + (R() - 0.5) * (q.x1 - q.x0), bankS(cx) - 8, 8 + R() * 10, 140 + q.h * 0.6);
      if (q.z0 < bankN(cx) && q.z1 > bankN(cx) - 300 && q.h > 30 && R() < 0.5) refl(R() < 0.7 ? 'w' : 'c', cx, bankN(cx) + 8, 8, 40 + q.h * 0.2);
    }
    // glass skybridges between neighbouring towers down in the city (warm lit tubes with purple undersides)
    std('ext_tube', { color: '#141820', emissive: '#ffcf9e', emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.5 }, { haze: 1, envI: 1.4 });
    const tube = city.gb('ext_tube'), talls = LOTS.filter((q) => q.h > 180 && Math.hypot((q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2) < 1300);
    let nTubes = 0;
    for (let i = 0; i < talls.length && nTubes < 10; i++) for (let j = i + 1; j < talls.length && nTubes < 10; j++) {
      const a = talls[i], b = talls[j], ax = (a.x0 + a.x1) / 2, az = (a.z0 + a.z1) / 2, bx = (b.x0 + b.x1) / 2, bz = (b.z0 + b.z1) / 2;
      if (Math.hypot(ax - bx, az - bz) > 175) continue;
      const y = G + 60 + ((i * 37 + j * 11) % 5) * 26;
      if (y > G + Math.min(a.h, b.h) - 20) continue;
      if (Math.abs(ax - bx) > Math.abs(az - bz)) { const lo = Math.max(a.z0, b.z0), hi = Math.min(a.z1, b.z1); if (hi - lo < 12) continue; const zm = (lo + hi) / 2, xa = Math.min(a.x1, b.x1), xb = Math.max(a.x0, b.x0); K.abox(tube, xa, xb, y, y + 5, zm - 3, zm + 3); K.abox(city.gb('ext_gp'), xa, xb, y - 0.3, y, zm - 3.2, zm + 3.2); }
      else { const lo = Math.max(a.x0, b.x0), hi = Math.min(a.x1, b.x1); if (hi - lo < 12) continue; const xm = (lo + hi) / 2, za = Math.min(a.z1, b.z1), zb = Math.max(a.z0, b.z0); K.abox(tube, xm - 3, xm + 3, y, y + 5, za, zb); K.abox(city.gb('ext_gp'), xm - 3.2, xm + 3.2, y - 0.3, y, za, zb); }
      nTubes++;
    }
    // an elevated light-rail viaduct along the north riverside (the train itself is viewer-only)
    const vz = (x) => RIVERSIDE_N(x) - 30;
    for (let x = -3000; x < 3000; x += 60) {
      const a = [x, vz(x)], b = [x + 60, vz(x + 60)];
      K.sbox(city.gb('ext_conc'), a, b, 9, G + 14, G + 16);
      K.sbox(city.gb('ext_gp'), P2.add(a, [0, 4.6]), P2.add(b, [0, 4.6]), 0.25, G + 13.8, G + 14.1);
      K.abox(city.gb('ext_conc'), x - 1.5, x + 1.5, G, G + 14, a[1] - 1.5, a[1] + 1.5, '+y-y');
    }
  }
  tq = mark('city', tq);

  /* ---------------------------------------------------------------- holo screens (abstract imagery only) */
  function ribbonCanvas(seed, w, h, hue) {   // long flowing light ribbons and drifting particles (a parallax layer)
    const c = K.canvas(w, h), x = c.getContext('2d'), R = K.rng(seed);
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 9; k++) {
      const y0 = h * (0.1 + R() * 0.8), amp = h * (0.05 + R() * 0.1), ph = R() * 6, lw = 4 + R() * 14;
      x.strokeStyle = `hsla(${hue + R() * 60},100%,${55 + R() * 20}%,${0.12 + R() * 0.18})`; x.lineWidth = lw; x.shadowColor = x.strokeStyle; x.shadowBlur = lw * 2;
      x.beginPath(); for (let i = 0; i <= 48; i++) { const u = i / 48, yy = y0 + Math.sin(u * 5 + ph) * amp - u * h * 0.2; i ? x.lineTo(u * w, yy) : x.moveTo(0, yy); } x.stroke();
    }
    x.shadowBlur = 0; for (let i = 0; i < 260; i++) { x.fillStyle = `hsla(${hue + R() * 60},100%,85%,${R() * 0.5})`; const r = R() * 2.5; x.fillRect(R() * w, R() * h, r, r); }
    return c;
  }
  function glowCanvas(w, h, hue) {   // a big soft halo (additive glow in front of the screen wall)
    const c = K.canvas(w, h), x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    const g = x.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, w * 0.75); g.addColorStop(0, `hsla(${hue},100%,60%,0.35)`); g.addColorStop(0.5, `hsla(${hue + 20},100%,45%,0.12)`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h); return c;
  }
  function inkCanvas(seed, w, h, hue) {
    // layered mountain strokes like an ink landscape, a pale moon disc, a few cranes in flight (silhouettes)
    const c = K.canvas(w, h), x = c.getContext('2d'), R = K.rng(seed);
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, `hsl(${hue},70%,10%)`); g.addColorStop(1, `hsl(${hue + 30},80%,16%)`); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'lighter';
    x.fillStyle = `hsla(${hue + 50},90%,80%,0.35)`; x.beginPath(); x.arc(w * 0.68, h * 0.2, w * 0.13, 0, 7); x.fill();
    for (let l = 0; l < 6; l++) {
      const base = h * (0.38 + l * 0.1), amp = h * (0.16 - l * 0.016);
      x.fillStyle = `hsla(${hue + l * 12},85%,${35 + l * 7}%,${0.18 + l * 0.05})`; x.beginPath(); x.moveTo(0, h);
      for (let i = 0; i <= 64; i++) x.lineTo((i / 64) * w, base - amp * Math.abs(Math.sin(i * 0.31 + l * 1.7 + R() * 0.35)) * (0.6 + 0.4 * Math.sin(i * 0.07 + l)));
      x.lineTo(w, h); x.closePath(); x.fill();
      x.strokeStyle = `hsla(${hue + 40},100%,85%,0.25)`; x.lineWidth = 1.5; x.stroke();
    }
    x.strokeStyle = `hsla(${hue + 60},100%,90%,0.7)`; x.lineWidth = 2.2;
    for (let k = 0; k < 5; k++) { const cx = w * (0.15 + R() * 0.5), cy = h * (0.12 + R() * 0.2), s = w * (0.02 + R() * 0.02); x.beginPath(); x.moveTo(cx - s * 2, cy + s * 0.3); x.quadraticCurveTo(cx - s, cy - s, cx, cy); x.quadraticCurveTo(cx + s, cy - s, cx + s * 2, cy + s * 0.3); x.stroke(); }
    x.globalCompositeOperation = 'source-over'; x.fillStyle = 'rgba(0,0,0,0.2)'; for (let y = 0; y < h; y += 3) x.fillRect(0, y, w, 1);
    return c;
  }
  function fanCanvas(seed, w, h, hue) {
    // concentric fans (a fan-dance flower), petals in pink and violet light
    const c = K.canvas(w, h), x = c.getContext('2d'), R = K.rng(seed);
    x.fillStyle = `hsl(${hue},70%,7%)`; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'lighter';
    const cx = w / 2, cy = h * 0.45;
    for (let ring = 0; ring < 4; ring++) {
      const n = 10 + ring * 4, r0 = w * (0.08 + ring * 0.1), r1 = r0 + w * 0.12;
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2 + ring * 0.3, a1 = a0 + (Math.PI * 2) / n * 0.8;
        const g = x.createRadialGradient(cx, cy, r0, cx, cy, r1); g.addColorStop(0, `hsla(${hue + 30 + ring * 15},95%,70%,0.05)`); g.addColorStop(1, `hsla(${hue + 50 + ring * 10},100%,75%,${0.25 + R() * 0.2})`);
        x.fillStyle = g; x.beginPath(); x.moveTo(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0); x.arc(cx, cy, r1, a0, a1); x.lineTo(cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0); x.closePath(); x.fill();
      }
    }
    for (let i = 0; i < 200; i++) { x.fillStyle = `hsla(${hue + R() * 60},100%,85%,${R() * 0.6})`; x.fillRect(R() * w, R() * h, 2, 2); }
    x.globalCompositeOperation = 'source-over'; x.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < h; y += 3) x.fillRect(0, y, w, 1);
    return c;
  }
  function figureCanvas(seed, w, h, hue) {
    // a translucent wireframe figure (head and shoulders in three-quarter profile) built from glowing facets,
    // with flowing ribbons, sparks and scanlines; no text
    const c = K.canvas(w, h), x = c.getContext('2d'), R = K.rng(seed);
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'lighter';
    const P = (u, v) => [u * w, v * h];
    // silhouette outline (u, v in 0..1), head tilted slightly, long hair falling to one side
    const out = [[0.5, 0.17], [0.6, 0.18], [0.67, 0.23], [0.7, 0.3], [0.7, 0.36], [0.73, 0.4], [0.7, 0.42], [0.69, 0.47], [0.65, 0.52], [0.6, 0.55], [0.6, 0.6], [0.7, 0.63], [0.86, 0.69], [0.95, 0.78], [0.98, 0.9], [0.02, 0.9], [0.06, 0.76], [0.18, 0.66], [0.3, 0.6], [0.33, 0.52], [0.3, 0.42], [0.32, 0.3], [0.38, 0.22]];
    const pts = out.map(([u, v]) => P(u, v));
    const inside = (px, py) => { let c2 = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > py) !== (b[1] > py) && px < ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0]) c2 = !c2; } return c2; };
    const inner = []; for (let k = 0; k < 600 && inner.length < 90; k++) { const px = R() * w, py = h * (0.15 + R() * 0.78); if (inside(px, py)) inner.push([px, py]); }
    const all = pts.concat(inner);
    // soft volumetric fill: the silhouette filled with a radial glow, blurred, so the figure reads as light, not lines
    const sil = () => { x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); };
    const fg = x.createRadialGradient(w * 0.5, h * 0.42, w * 0.04, w * 0.5, h * 0.55, w * 0.62);
    fg.addColorStop(0, `hsla(${hue + 40},100%,78%,0.75)`); fg.addColorStop(0.45, `hsla(${hue + 15},95%,55%,0.45)`); fg.addColorStop(1, `hsla(${hue},90%,35%,0.18)`);
    x.save(); x.shadowColor = `hsla(${hue + 20},100%,65%,0.9)`; x.shadowBlur = w * 0.08; x.fillStyle = fg; sil(); x.fill(); x.restore();
    x.save(); sil(); x.clip(); for (let y = 0; y < h; y += 6) { x.fillStyle = `hsla(${hue + 30},100%,80%,${0.05 + 0.05 * Math.sin(y * 0.07)})`; x.fillRect(0, y, w, 2); } x.restore();
    // facets: connect each point to its 3 nearest neighbours, fill small triangles faintly
    for (let i = 0; i < all.length; i++) {
      const a = all[i], near = all.map((b, j) => [Math.hypot(b[0] - a[0], b[1] - a[1]), j]).filter((d) => d[1] !== i).sort((p, q) => p[0] - q[0]).slice(0, 3);
      x.fillStyle = `hsla(${hue + R() * 50},90%,${45 + R() * 30}%,${0.05 + R() * 0.08})`;
      const b = all[near[0][1]], c3 = all[near[1][1]]; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(c3[0], c3[1]); x.fill();
      x.strokeStyle = `hsla(${hue + 25},100%,78%,0.45)`; x.lineWidth = 1.4;
      for (const [, j] of near) { const b2 = all[j]; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b2[0], b2[1]); x.stroke(); }
    }
    x.strokeStyle = `hsla(${hue + 35},100%,85%,0.9)`; x.lineWidth = 3; x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); x.stroke();
    // flowing hair / ribbons from the head, sweeping down and out
    for (let k = 0; k < 16; k++) {
      x.strokeStyle = `hsla(${hue + 10 + R() * 60},100%,${60 + R() * 20}%,${0.18 + R() * 0.25})`; x.lineWidth = 1 + R() * 3;
      const s = P(0.36 + R() * 0.2, 0.2 + R() * 0.06); x.beginPath(); x.moveTo(s[0], s[1]); x.bezierCurveTo(w * (0.1 + R() * 0.2), h * (0.3 + R() * 0.1), w * (0.05 + R() * 0.3), h * (0.5 + R() * 0.2), w * (R() * 0.3), h * (0.7 + R() * 0.2)); x.stroke();
    }
    for (let i = 0; i < 380; i++) { x.fillStyle = `hsla(${hue + R() * 60},100%,85%,${R() * 0.7})`; const r = R() * 2.4; x.fillRect(R() * w, R() * h, r, r); }
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < h; y += 4) x.fillRect(0, y, w, 1.5);
    for (let k = 0; k < 6; k++) { const y = R() * h; x.fillStyle = `hsla(${hue + 30},100%,70%,0.12)`; x.fillRect(0, y, w, 2 + R() * 6); }
    // soft frame glow
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, `hsla(${hue},90%,40%,0.12)`); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, `hsla(${hue + 30},90%,40%,0.16)`);
    x.globalCompositeOperation = 'lighter'; x.fillStyle = g; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'source-over';
    return c;
  }
  {
    const HS = FAST ? 256 : 512;
    const mk = (key, c, ei, op) => additive(key, tex(c, true, key.slice(4)), '#ffffff', ei, op, 0.8);
    mk('ext_holo_a', figureCanvas(11, HS, HS * 2, 262), 2.4, 0.9);
    mk('ext_holo_b', inkCanvas(12, HS, HS * 2, 262), 1.3, 0.8);
    mk('ext_holo_c', fanCanvas(13, HS, HS * 2, 300), 1.4, 0.8);
    mk('ext_holo_e', K.abstractCanvas(17, HS, HS * 2, { hue: 250, bg: 2 }), 2.0, 0.9);
    mk('ext_holo_d', K.abstractCanvas(14, HS, HS * 2, { hue: 290, bg: 2 }), 2.0, 0.9);
    mk('ext_holo_rib', ribbonCanvas(15, HS, HS * 2, 275), 1.2, 0.7);
    mk('ext_holo_glow', glowCanvas(HS / 2, HS, 268), 0.9, 0.6);
    // East Tower west face: the big one beside the skybridge (above the bridge roof), a second below the truss
    const nb = EXT.neighbours.find((n) => n.id === 'NB_east'), xw = nb ? nb.footprint[0][0] - 0.6 : 55.4, top = nb ? nb.top_y : 160;
    addUV('holo', quadGeo([[[xw, 10.5, -5], [xw, 10.5, 31], [xw, top - 30, 31], [xw, top - 30, -5]]]), 'ext_holo_a', 'deco');
    addUV('holo', quadGeo([[[xw, -150, 0], [xw, -150, 26], [xw, -40, 26], [xw, -40, 0]]]), 'ext_holo_c', 'deco');
    // parallax layers in front of the big figure: flowing ribbons at 0.7 m and a soft additive glow plane at 1.8 m
    addUV('holo', quadGeo([[[xw - 0.7, 8.0, -9], [xw - 0.7, 8.0, 35], [xw - 0.7, top - 24, 35], [xw - 0.7, top - 24, -9]]]), 'ext_holo_rib', 'deco');
    addUV('holo', quadGeo([[[xw - 1.8, 0.0, -16], [xw - 1.8, 0.0, 42], [xw - 1.8, top - 14, 42], [xw - 1.8, top - 14, -16]]]), 'ext_holo_glow', 'deco');
    const fr = deco('holo', 'deco').gb('glow_purple');
    for (const [y0, y1, z0, z1] of [[10.5, top - 30, -5, 31], [-150, -40, 0, 26]]) { K.abox(fr, xw - 0.1, xw + 0.1, y0 - 0.25, y0, z0 - 0.25, z1 + 0.25); K.abox(fr, xw - 0.1, xw + 0.1, y1, y1 + 0.25, z0 - 0.25, z1 + 0.25); K.abox(fr, xw - 0.1, xw + 0.1, y0, y1, z0 - 0.25, z0); K.abox(fr, xw - 0.1, xw + 0.1, y0, y1, z1, z1 + 0.25); }
    // hero towers
    const keys = ['ext_holo_d', 'ext_holo_b', 'ext_holo_e', 'ext_holo_c', 'ext_holo_b'];
    HOLOS.forEach((h, i) => {
      const q = h.q, y0 = G + h.y0, y1 = G + h.y1, o = 1.5;
      const quad = h.face === 'z1' ? [[q.x0 + 4, y0, q.z1 + o], [q.x1 - 4, y0, q.z1 + o], [q.x1 - 4, y1, q.z1 + o], [q.x0 + 4, y1, q.z1 + o]]
        : h.face === 'z0' ? [[q.x1 - 4, y0, q.z0 - o], [q.x0 + 4, y0, q.z0 - o], [q.x0 + 4, y1, q.z0 - o], [q.x1 - 4, y1, q.z0 - o]]
          : [[q.x1 + o, y0, q.z1 - 4], [q.x1 + o, y0, q.z0 + 4], [q.x1 + o, y1, q.z0 + 4], [q.x1 + o, y1, q.z1 - 4]];
      addUV('holo_city', quadGeo([quad]), keys[i % keys.length]);
      const cx = (q.x0 + q.x1) / 2;
      if (h.face === 'z0') for (let s = -1; s <= 1; s++) refl('k', cx + s * 12, bankS(cx) - 10, 14, 420);
    });
  }
  tq = mark('holo', tq);

  /* ---------------------------------------------------------------- far city bands, ridges, mist, the hill and the broadcast tower */
  {
    const band = (key, seed, W, Hpx, maxH) => {
      const A = K.canvas(W, Hpx), E = K.canvas(W, Hpx), a = A.getContext('2d'), e = E.getContext('2d'), R = K.rng(seed);
      a.clearRect(0, 0, W, Hpx); e.fillStyle = '#000'; e.fillRect(0, 0, W, Hpx);
      const gb = e.createLinearGradient(0, Hpx * 0.6, 0, Hpx); gb.addColorStop(0, 'rgba(255,170,120,0)'); gb.addColorStop(1, 'rgba(255,170,120,0.35)'); e.fillStyle = gb; e.fillRect(0, 0, W, Hpx);
      let x = 0;
      while (x < W) {
        const w = 3 + R() * 18, cl = 0.5 + 0.5 * Math.sin(x / W * Math.PI * 6 + seed) * Math.sin(x / W * Math.PI * 14), hh = Hpx * clamp(0.12 + R() * 0.35 + cl * 0.45 * R(), 0.06, 0.98) * maxH;
        a.fillStyle = `rgb(${14 + R() * 6 | 0},${12 + R() * 5 | 0},${22 + R() * 8 | 0})`; a.fillRect(x, Hpx - hh, w, hh);
        for (let k = 0; k < hh * w * 0.06; k++) { const px = x + R() * w, py = Hpx - R() * hh; e.fillStyle = R() < 0.4 ? 'rgba(190,210,255,0.8)' : 'rgba(255,200,140,0.85)'; e.fillRect(px | 0, py | 0, 1, 1); }
        if (R() < 0.12) { e.fillStyle = R() < 0.6 ? 'rgb(138,77,255)' : 'rgb(255,79,216)'; e.fillRect(x, Hpx - hh, w, 1.5); }
        if (R() < 0.05) { e.fillStyle = 'rgb(255,40,30)'; e.fillRect(x + w / 2, Hpx - hh - 1, 1, 1); }
        x += w + (R() < 0.3 ? R() * 6 : 0);
      }
      return std(key, { color: '#ffffff', map: tex(A, true, key.slice(4) + '_albedo', false), emissiveMap: tex(E, true, key.slice(4) + '_emissive'), emissive: '#ffffff', emissiveIntensity: 1.2, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }, { haze: 0.62, envI: 0.2 });
    };
    const ring = (key, Rr, Hm, tileM, gapFn) => {
      const n = 220, pos = [], uv = [], idx = [];
      for (let i = 0; i < n; i++) {
        const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, am = (a0 + a1) / 2;
        if (gapFn(Math.sin(am) * Rr, Math.cos(am) * Rr)) continue;
        const p0 = [Math.sin(a0) * Rr, Math.cos(a0) * Rr], p1 = [Math.sin(a1) * Rr, Math.cos(a1) * Rr], u0 = i * (2 * Math.PI * Rr / n) / tileM, u1 = (i + 1) * (2 * Math.PI * Rr / n) / tileM, b = pos.length / 3;
        pos.push(p0[0], G, p0[1], p1[0], G, p1[1], p1[0], G + Hm, p1[1], p0[0], G + Hm, p0[1]); uv.push(u0, 0, u1, 0, u1, 1, u0, 1); idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      addUV('far', g, key);
    };
    const BW = FAST ? 1024 : 2048;
    band('ext_band1', 801, BW, 256, 1.0); band('ext_band2', 802, BW, 256, 0.85);
    const riverGap = (x, z) => inRiver(x, z, 80) || hillD(x, z) < HILL.r;
    ring('ext_band1', 3350, 300, 3400, riverGap); ring('ext_band2', 4150, 360, 4200, riverGap);
    // ridges: a nearer forested ring and the high granite ridge behind (highest to the north), dipping where the river flows
    const RN = K.noise(256, 9, 1, 811, 5), RF = K.noise(256, 14, 1, 812, 5);
    const rivA = [Math.atan2(5200, zc(5200)), Math.atan2(-5200, zc(-5200)) + Math.PI * 2];
    const dip = (a) => { let d = 1; for (const ra of rivA) d *= 1 - 0.88 * Math.exp(-(((a - ra) / 0.14) ** 2)); return d; };
    const ridgeMat = (key, top, base, seed) => {
      const W = 512, H = 128, N = K.noise(128, 16, 4, seed, 4);
      const c = K.img(W, H, (i, j, o) => {
        const v = 1 - j / H, f = samp(N, 128, i / W * 4, v), t = sst(0.0, 0.6, v);
        for (let q = 0; q < 3; q++) o[q] = lin(base[q], top[q], t) * (0.8 + 0.4 * f);
        if (v > 0.955) { const r = sst(0.955, 0.995, v); o[0] += 70 * r; o[1] += 50 * r; o[2] += 110 * r; }   // faint rim from the city glow
        if (v < 0.45 && ((i * 7919 + j * 104729) % 1013) < 2) { o[0] = 255; o[1] = 196; o[2] = 140; }
      });
      return std(key, { color: '#000000', emissiveMap: tex(c, true, key.slice(4) + '_emissive'), emissive: '#ffffff', emissiveIntensity: 1, side: THREE.DoubleSide, roughness: 1 }, { haze: 0.42, envI: 0 });
    };
    ridgeMat('ext_ridge_near', [8, 7, 12], [34, 26, 50], 821); ridgeMat('ext_ridge_far', [13, 11, 20], [44, 34, 62], 822);
    const rN = (a) => (240 + 300 * samp(RN, 256, a / (Math.PI * 2), 0.3) + 200 * Math.exp(-(((a - Math.PI) / 0.7) ** 2)) + 120 * Math.exp(-(((a - 0.4) / 0.4) ** 2))) * dip(a);
    const rF = (a) => (420 + 520 * Math.pow(samp(RF, 256, a / (Math.PI * 2), 0.5), 1.6) + 680 * Math.exp(-(((a - Math.PI - 0.15) / 0.5) ** 2)) + 380 * Math.exp(-(((a - 0.3) / 0.35) ** 2))) * (0.25 + 0.75 * dip(a));
    addUV('ridges', grid(240, 1, (u, v) => { const a = u * Math.PI * 2, r = 5300 + 400 * Math.sin(a * 3); return [Math.sin(a) * r, G + v * rN(a), Math.cos(a) * r, u * 10, v]; }), 'ext_ridge_near');
    addUV('ridges', grid(300, 1, (u, v) => { const a = u * Math.PI * 2, r = 7600 + 300 * Math.sin(a * 2 + 1); return [Math.sin(a) * r, G + v * rF(a), Math.cos(a) * r, u * 8, v]; }), 'ext_ridge_far');
    // mist at the feet of the ridges
    const mt = tex(K.img(16, 128, (i, j, o) => { const v = 1 - j / 128; o[0] = 70; o[1] = 56; o[2] = 104; o[3] = 255 * 0.55 * Math.pow(1 - v, 1.6); }), true, 'mist', false);
    std('ext_mist', { color: '#000000', map: mt, emissiveMap: mt, emissive: '#ffffff', emissiveIntensity: 0.9, transparent: true, depthWrite: false, side: THREE.DoubleSide }, { envI: 0 }).fog = false;
    addUV('ridges', grid(120, 1, (u, v) => { const a = u * Math.PI * 2, r = 4700; return [Math.sin(a) * r, G + v * 260, Math.cos(a) * r, u * 20, v]; }), 'ext_mist');
    // purple-grey rain haze layers between the city rings (depth)
    const ht = tex(K.img(16, 128, (i, j, o) => { const v = 1 - j / 128; o[0] = 58; o[1] = 50; o[2] = 82; o[3] = 255 * 0.32 * Math.pow(1 - v, 1.2); }), true, 'rainhaze', false);
    std('ext_rainhaze', { color: '#000000', map: ht, emissiveMap: ht, emissive: '#ffffff', emissiveIntensity: 0.8, transparent: true, depthWrite: false, side: THREE.DoubleSide }, { envI: 0 }).fog = false;
    for (const [r, hh] of [[1700, 260], [2600, 380], [3900, 480]]) addUV('ridges', grid(96, 1, (u, v) => { const a = u * Math.PI * 2; return [Math.sin(a) * r, G + v * hh, Math.cos(a) * r, u * 16, v]; }), 'ext_rainhaze');
    // the forested hill (polar texture: dark trees and a lit road winding to the top)
    const HN = K.noise(256, 12, 12, 831, 4);
    const hc = K.img(256, 256, (i, j, o, k) => { const v = 0.035 + 0.06 * HN[k] * HN[k]; o[0] = v * 95; o[1] = v * 135; o[2] = v * 110; });   // tree canopy mottling
    const he = K.canvas(256, 256), hx = he.getContext('2d'); hx.fillStyle = '#000'; hx.fillRect(0, 0, 256, 256);
    hx.fillStyle = 'rgba(255,205,150,0.95)'; for (let t = 0; t < 1; t += 0.008) hx.fillRect(((t * 3.2) % 1) * 256, t * 256, 1.2, 1.2);
    { const R2 = K.rng(832); for (let k = 0; k < 70; k++) { hx.fillStyle = R2() < 0.8 ? 'rgba(255,200,140,0.8)' : 'rgba(180,150,255,0.8)'; hx.fillRect(R2() * 256, 40 + R2() * 216, 1, 1); } }
    std('ext_hill', { map: tex(hc, true, 'hill_albedo'), emissiveMap: tex(he, true, 'hill_emissive'), emissive: '#ffffff', emissiveIntensity: 1.2, roughness: 0.9, side: THREE.DoubleSide }, { haze: 0.55, envI: 0.3 });
    const hprof = (t) => HILL.h * (Math.exp(-3.2 * t * t) - 0.04 * t) / 1.0;   // rounded dome, not a mesa
    addUV('hill', grid(48, 12, (u, v) => { const a = u * Math.PI * 2, t = 1 - v, r = HILL.r * t * (1 + 0.08 * Math.sin(a * 5)); return [HILL.x + Math.sin(a) * r, G + hprof(t) + HILL.h * 0.025 * Math.sin(a * 23 + t * 17) * Math.sin(t * 3.1), HILL.z + Math.cos(a) * r, u, v]; }), 'ext_hill');
    // lattice broadcast tower (generic): four legs tapering to an observation pod, lattice bracing, a mast
    const bt = deco('hill'), base = G + HILL.h - 2, X = HILL.x, Z = HILL.z;
    glow('ext_bt_pink', '#ff5ad8', 3.2, 0.35); glow('ext_bt_purple', '#9a5cff', 3.0, 0.35); glow('ext_bt_warm', '#ffd8b0', 2.4, 0.35);
    std('ext_bt_steel', { color: '#1d1a26', roughness: 0.5, metalness: 0.7 }, { haze: 0.35 });
    const legs = (y) => { const s = lin(26, 6, Math.pow((y - base) / 170, 0.8)); return [[X - s, Z - s], [X + s, Z - s], [X + s, Z + s], [X - s, Z + s]]; };
    const lv = [0, 30, 60, 90, 120, 150, 170].map((d) => base + d);
    for (let i = 0; i < lv.length - 1; i++) {
      const A = legs(lv[i]), B = legs(lv[i + 1]);
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        K.beam(bt.gb('ext_bt_pink'), [A[k][0], lv[i], A[k][1]], [B[k][0], lv[i + 1], B[k][1]], 2.4);
        K.beam(bt.gb('ext_bt_purple'), [A[k][0], lv[i], A[k][1]], [B[k2][0], lv[i + 1], B[k2][1]], 1.2); K.beam(bt.gb('ext_bt_purple'), [A[k2][0], lv[i], A[k2][1]], [B[k][0], lv[i + 1], B[k][1]], 1.2);
        K.beam(bt.gb('ext_bt_steel'), [B[k][0], lv[i + 1], B[k][1]], [B[k2][0], lv[i + 1], B[k2][1]], 1.4);
      }
    }
    K.prism(K.region([[[X - 13, Z - 6], [X - 6, Z - 13], [X + 6, Z - 13], [X + 13, Z - 6], [X + 13, Z + 6], [X + 6, Z + 13], [X - 6, Z + 13], [X - 13, Z + 6]]]), base + 170, base + 182, bt.gb('ext_bt_steel'), bt.gb('ext_bt_steel'), bt.gb('ext_bt_warm'));
    K.prism(K.region([[[X - 7, Z - 7], [X + 7, Z - 7], [X + 7, Z + 7], [X - 7, Z + 7]]]), base + 182, base + 186, bt.gb('ext_bt_pink'), null, bt.gb('ext_bt_pink'));
    K.beam(bt.gb('ext_bt_steel'), [X, base + 186, Z], [X, base + 236, Z], 2.6); K.beam(bt.gb('ext_bt_pink'), [X + 1.4, base + 186, Z], [X + 1.4, base + 232, Z], 0.9);
    BEACONS.push([X, base + 238, Z, 3]);
    // a soft haze halo behind the tower (a billboard facing the map)
    const hg = K.img(128, 256, (i, j, o) => { const u = (i + 0.5) / 128 - 0.5, v = 1 - (j + 0.5) / 256, r2 = (u / 0.2) ** 2 + ((v - 0.42) / 0.24) ** 2, a = Math.exp(-r2) * sst(0.5, 0.3, Math.abs(u)) * sst(0, 0.1, v) * sst(1, 0.85, v); o[0] = 200 * a + 40 * a * a; o[1] = 90 * a; o[2] = 255 * a; o[3] = 255 * a; });
    additive('ext_halo', tex(hg, true, 'halo', false), '#ffffff', 1.0, 0.9, 0.3);
    const dn = P2.norm([-X, -Z]), sd = [-dn[1], dn[0]], cb = [X + dn[0] * 30, Z + dn[1] * 30], hw2 = 170;
    addUV('hill', quadGeo([[[cb[0] - sd[0] * hw2, base - 40, cb[1] - sd[1] * hw2], [cb[0] + sd[0] * hw2, base - 40, cb[1] + sd[1] * hw2], [cb[0] + sd[0] * hw2, base + 300, cb[1] + sd[1] * hw2], [cb[0] - sd[0] * hw2, base + 300, cb[1] - sd[1] * hw2]]]), 'ext_halo');
  }
  tq = mark('far', tq);

  /* ---------------------------------------------------------------- reflections: build the quads */
  {
    const n = 64, cR = K.canvas(n, 256), x = cR.getContext('2d'), NN = K.noise(64, 1, 24, 901, 3), im = x.createImageData(n, 256);
    for (let j = 0; j < 256; j++) for (let i = 0; i < n; i++) {
      const v = 1 - j / 256, u = (i + 0.5) / n, ac = Math.exp(-(((u - 0.5) / 0.22) ** 2)), al = Math.pow(1 - v, 1.4) * (0.55 + 0.45 * sst(0.3, 0.7, NN[(j % 64) * 64 + i]));
      const a = clamp(ac * al, 0, 1), k = (j * n + i) * 4; im.data[k] = im.data[k + 1] = im.data[k + 2] = 255 * a; im.data[k + 3] = 255 * a;
    }
    x.putImageData(im, 0, 0);
    const rt = tex(cR, true, 'reflection', false), cols = { w: '#ffc88a', c: '#cfe0ff', r: '#ff4030', p: '#9a5cff', k: '#ff5ad8' };
    for (const [k, list] of Object.entries(REFL)) if (list.length) { additive('ext_rf_' + k, rt, cols[k], 1.8, 0.9, 1); addUV('river', quadGeo(list), 'ext_rf_' + k); }
  }

  /* ---------------------------------------------------------------- Haneul: fins, corner lights and crown above and below the map */
  {
    const ta = EXT.tower_above, mf = EXT.mech_floor, yA = mf.y1, yB = ta.crown_y - 12;
    const up = deco('tower', 'deco', 'R'), dn = deco('tower', 'deco', 'X'), sgT = sgo(L.outline);
    const finsAlong = (g, gGlow, pts, y0, y1, s) => {
      for (const [p, d, lit] of pts) {
        const o = [d[1] * s, -d[0] * s];
        K.obox(g, [p[0] + o[0] * 0.225, (y0 + y1) / 2, p[1] + o[1] * 0.225], [d[0], 0, d[1]], [0, 1, 0], [o[0], 0, o[1]], [0.035, (y1 - y0) / 2, 0.225]);
        if (lit) K.obox(gGlow, [p[0] + o[0] * 0.457, (y0 + y1) / 2, p[1] + o[1] * 0.457], [d[0], 0, d[1]], [0, 1, 0], [o[0], 0, o[1]], [0.014, (y1 - y0) / 2, 0.008]);
      }
    };
    // above: continue the playable floors' fin lines (every bay start), purple on every third
    const finPts = L.facade.bays.filter((b) => b.floor === K.FIDS[K.FIDS.length - 1]).map((b) => [b.a, P2.norm(P2.sub(b.b, b.a)), b.index % 3 === 0]);
    finsAlong(up.gb('alloy'), up.gb('glow_purple'), finPts, yA, yB, sgT);
    // below: the lower block (fins every 3 m along its footprint)
    const lb = EXT.neighbours.find((n) => n.id === 'NB_lowerblock'), FPl = lb ? lb.footprint : L.outline, sgL = sgo(FPl), ptsB = [];
    for (let i = 0; i < FPl.length; i++) {
      const a = FPl[i], b = FPl[(i + 1) % FPl.length], l = P2.len(P2.sub(b, a)), d = P2.norm(P2.sub(b, a)), nn = Math.max(1, Math.round(l / 3));
      for (let k = 0; k < nn; k++) ptsB.push([P2.add(a, P2.mul(d, (l * k) / nn)), d, (ptsB.length % 3) === 0]);
    }
    finsAlong(dn.gb('alloy'), dn.gb('glow_purple'), ptsB, G, -0.5, sgL);
    // the lower block shell in Haneul's own facade (the engine block keeps its generic glass just inside), a purple band
    const sh = dn.gb('tower_facade');
    for (let i = 0; i < FPl.length; i++) {
      const a = FPl[i], b = FPl[(i + 1) % FPl.length], d = P2.norm(P2.sub(b, a)), on = [d[1] * sgL, -d[0] * sgL], A = P2.add(a, P2.mul(on, 0.06)), B = P2.add(b, P2.mul(on, 0.06));
      sh.face([[A[0], G, A[1]], [B[0], G, B[1]], [B[0], -0.42, B[1]], [A[0], -0.42, A[1]]], [on[0], 0, on[1]]);
      K.sbox(dn.gb('glow_purple'), P2.add(a, P2.mul(on, 0.12)), P2.add(b, P2.mul(on, 0.12)), 0.05, -0.62, -0.56);
    }
    // corner light strips (the reference's bright edge lines)
    const cornerStrips = (g, P, s, y0, y1) => {
      for (let i = 0; i < P.length; i++) {
        const p = P[i], pr = P[(i - 1 + P.length) % P.length], nx = P[(i + 1) % P.length], d1 = P2.norm(P2.sub(p, pr)), d2 = P2.norm(P2.sub(nx, p)), o = P2.norm(P2.add([d1[1] * s, -d1[0] * s], [d2[1] * s, -d2[0] * s]));
        const c = P2.add(p, P2.mul(o, 0.5)); K.abox(g, c[0] - 0.08, c[0] + 0.08, y0, y1, c[1] - 0.08, c[1] + 0.08);
      }
    };
    cornerStrips(up.gb('glow_purple'), L.outline, sgT, yA, yB);
    cornerStrips(dn.gb('glow_purple'), FPl, sgL, G, -0.7);
    // amenity bands on the way up (purple lines) and the crown: halo rings, a lantern, beacons
    const ringAt = (g, scale, y0, y1, w, off = 0) => { const P = L.outline.map((p) => P2.mul(p, scale)); for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], d = P2.norm(P2.sub(b, a)), o = [d[1] * sgT * off, -d[0] * sgT * off]; K.sbox(g, P2.add(a, o), P2.add(b, o), w, y0, y1); } };
    for (const y of [58.8, 100.8]) ringAt(up.gb('glow_purple'), 1, y, y + 0.22, 0.08, 0.5);
    ringAt(up.gb('glow_pink'), 0.66, yB + 6, yB + 6.4, 0.3);
    ringAt(up.gb('glow_purple'), 1.0, yB - 0.2, yB + 0.1, 0.12, 0.3);
    ringAt(up.gb('glow_purple'), 0.5, ta.crown_y - 0.3, ta.crown_y, 0.3);
    std('ext_lantern', { color: '#20152e', emissive: '#c49aff', emissiveIntensity: 0.7, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85 }, { envI: 1.2 });
    K.prism(K.region([L.outline.map((p) => P2.mul(p, 0.48))]), yB + 0.4, ta.crown_y - 0.4, null, null, up.gb('ext_lantern'));
    for (const p of L.outline.filter((_, i) => i % 2 === 0)) BEACONS.push([p[0] * 0.55, ta.crown_y + 0.6, p[1] * 0.55, 0.6]);
    BEACONS.push([0, ta.crown_y + 15, 0, 0.8]);
    // the lattice crown: three tapering tiers of diagonal bracing round the lantern, purple on the diagonals, a mast
    const sc = [1.0, 0.84, 0.68, 0.55], ys = [yB, yB + 4, yB + 8, ta.crown_y], st = up.gb('alloy'), gl = up.gb('glow_purple');
    const ringPts = (t) => { const out = []; const P = L.outline.map((p) => P2.mul(p, sc[t])); for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], nn = Math.max(1, Math.round(P2.len(P2.sub(b, a)) / (6 * sc[t]))); for (let k = 0; k < nn; k++) out.push(P2.lerp(a, b, k / nn)); } return out; };
    const n0 = ringPts(0).length;
    for (let t = 0; t < 3; t++) {
      const A = ringPts(t), B = ringPts(t + 1);
      if (A.length !== n0 || B.length !== n0) continue;
      for (let k = 0; k < n0; k++) {
        const a0 = A[k], a1 = A[(k + 1) % n0], b0 = B[k], b1 = B[(k + 1) % n0];
        K.beam(st, [a0[0], ys[t], a0[1]], [b1[0], ys[t + 1], b1[1]], 0.35); K.beam(st, [a1[0], ys[t], a1[1]], [b0[0], ys[t + 1], b0[1]], 0.35);
        if (k % 2 === 0) K.beam(gl, [a0[0], ys[t], a0[1]], [b1[0], ys[t + 1], b1[1]], 0.12, 0.5);
        K.beam(st, [b0[0], ys[t + 1], b0[1]], [b1[0], ys[t + 1], b1[1]], 0.4);
      }
    }
    K.beam(st, [0, ta.crown_y, 0], [0, ta.crown_y + 14.2, 0], 0.7);
    K.beam(gl, [0.45, ta.crown_y, 0], [0.45, ta.crown_y + 13.5, 0], 0.12);
  }

  /* ---------------------------------------------------------------- neighbours: down to the street, construction top, edge lines */
  {
    const nd = deco('neighbours', 'deco');
    for (const nb of EXT.neighbours) {
      if (nb.id === 'NB_lowerblock') continue;
      K.prism(K.region([nb.footprint]), G, -180, null, null, nd.gb('env_facade'));
      const [x0, z0, x1, z1] = K.polyBox(nb.footprint);
      if (nb.id === 'NB_crane') {
        // the Crane Deck tower is still a bare concrete frame for its top floors
        const o = 0.08, g = nd.gb('ext_frame'), y0 = nb.top_y - 0.3 - 25.2, y1 = nb.top_y - 0.32;
        g.face([[x0 - o, y0, z0 - o], [x1 + o, y0, z0 - o], [x1 + o, y1, z0 - o], [x0 - o, y1, z0 - o]], [0, 0, -1]);
        g.face([[x0 - o, y0, z1 + o], [x1 + o, y0, z1 + o], [x1 + o, y1, z1 + o], [x0 - o, y1, z1 + o]], [0, 0, 1]);
        g.face([[x0 - o, y0, z0 - o], [x0 - o, y0, z1 + o], [x0 - o, y1, z1 + o], [x0 - o, y1, z0 - o]], [-1, 0, 0]);
        g.face([[x1 + o, y0, z0 - o], [x1 + o, y0, z1 + o], [x1 + o, y1, z1 + o], [x1 + o, y1, z0 - o]], [1, 0, 0]);
      }
      if (nb.id === 'NB_east') {
        const t = nb.top_y, g = nd.gb('glow_purple');
        K.abox(g, x0 - 0.15, x0 + 0.15, -180, t, z0 - 0.15, z0 + 0.15); K.abox(g, x0 - 0.15, x0 + 0.15, -180, t, z1 - 0.15, z1 + 0.15);
        K.abox(g, x0 - 0.2, x1 + 0.2, t - 0.4, t, z0 - 0.2, z0); K.abox(g, x0 - 0.2, x1 + 0.2, t - 0.4, t, z1, z1 + 0.2); K.abox(g, x0 - 0.2, x0, t - 0.4, t, z0, z1); K.abox(g, x1, x1 + 0.2, t - 0.4, t, z0, z1);
        BEACONS.push([x0 + 1, t + 1, z0 + 1, 0.6], [x1 - 1, t + 1, z1 - 1, 0.6]);
      }
      if (nb.id === 'NB_west') {
        // a purple line on the outside face of the parapet, below its top (nothing on the deck)
        const fp = nb.footprint, y = nb.top_y, cc = [(x0 + x1) / 2, (z0 + z1) / 2];
        for (let i = 0; i < fp.length; i++) { const a = fp[i], b = fp[(i + 1) % fp.length], o = P2.norm(P2.sub(P2.lerp(a, b, 0.5), cc)), oo = Math.abs(o[0]) > Math.abs(o[1]) ? [Math.sign(o[0]), 0] : [0, Math.sign(o[1])]; K.sbox(nd.gb('glow_purple'), P2.add(a, P2.mul(oo, 0.04)), P2.add(b, P2.mul(oo, 0.04)), 0.05, y - 0.55, y - 0.48); }
      }
    }
  }

  /* ---------------------------------------------------------------- beacons (aircraft warning lights) */
  {
    // the tower's own crown beacons go with the tower above (fk R), so floor isolation hides them in plan views
    const g = deco('beacons').gb('ext_beacon'), gR = deco('beacons_crown', 'skyline', 'R').gb('ext_beacon');
    for (const [x, y, z, s] of BEACONS) K.abox(Math.abs(x) < 30 && Math.abs(z) < 30 ? gR : g, x - s, x + s, y - s, y + s, z - s, z + s);
  }
  tq = mark('tower_beacons', tq);

  /* ---------------------------------------------------------------- terrace and roofs: puddles, drains, low planting */
  {
    const n = 128, NH = K.noise(n, 10, 10, 951, 3), H = new Float32Array(n * n); for (let k = 0; k < H.length; k++) H[k] = NH[k];
    std('ext_puddle', { color: '#07080b', roughness: 0.03, metalness: 0.15, normalMap: tex(nrm(H, n, 1.2), false, 'puddle_normal') }, { tile: 1.5, envI: 2.4, ns: 0.25, env: 'out' });
    std('ext_leaf', { map: tex(K.img(128, 128, (i, j, o, k) => { const v = 0.7 + 0.6 * NH[k]; o[0] = 52 * v; o[1] = 92 * v; o[2] = 50 * v; }), true, 'leaf_albedo'), roughness: 0.45, metalness: 0 }, { tile: 0.6, envI: 0.8 });
    // soft wet patches: an alpha mask with ragged, feathered edges and streaky reflections (no hard decal edges)
    {
      const W2 = 256, NW = K.noise(W2, 6, 6, 952, 4), NS = K.noise(W2, 2, 40, 953, 3);
      const wc = K.img(W2, W2, (i, j, o, k) => { const u = (i + 0.5) / W2 - 0.5, v = (j + 0.5) / W2 - 0.5, r = Math.hypot(u, v) * 2, a = sst(1.0, 0.45, r + (NW[k] - 0.5) * 0.55);
        const st = 0.85 + 0.3 * NS[k]; o[0] = 10 * st; o[1] = 11 * st; o[2] = 16 * st; o[3] = 255 * a * 0.85; });
      std('ext_wet', { color: '#ffffff', map: tex(wc, true, 'wet', false), roughness: 0.04, metalness: 0.2, transparent: true, depthWrite: false, normalMap: tex(nrm(H, n, 0.6), false, 'wet_normal') }, { envI: 2.6, ns: 0.15, env: 'out' }).polygonOffset = true;
      K.M.ext_wet.polygonOffsetFactor = -2;
    }
    const WETQ = [];
    const td = deco('terrace', 'deco'), pu = WETQ, R = K.rng(971), T = EXT.terrace, feats = T.features.map((f) => f.box);
    const clearOf = (x, z, r) => feats.every((b) => x + r < b[0] - 0.3 || x - r > b[2] + 0.3 || z + r < b[1] - 0.3 || z - r > b[3] + 0.3);
    const puddle = (g, x, y, z, rx, rz, rot) => { const c = Math.cos(rot), sn = Math.sin(rot), P = (u, v) => [x + u * rx * 1.3 * c - v * rz * 1.3 * sn, y, z + u * rx * 1.3 * sn + v * rz * 1.3 * c]; g.push([P(-1, 1), P(1, 1), P(1, -1), P(-1, -1)]); };
    const inT = (x, z) => K.inPoly([x, z], T.polygon) && !K.inPoly([x, z], L.outline) && K.polyDist([x, z], T.polygon) > 1.2 && K.polyDist([x, z], L.outline) > 1.6;
    for (let t = 0, np = 0; t < 400 && np < 46; t++) {
      const x = -33 + R() * 66, z = 22 + R() * 34, rx = 0.5 + R() * 2.0, rz = 0.4 + R() * 1.4;
      if (!inT(x, z) || !clearOf(x, z, Math.max(rx, rz))) continue;
      puddle(pu, x, T.y + 0.006, z, rx, rz, R() * 3); np++;
    }
    // drain channel just inside the parapet, and in-floor uplights
    const dr = td.gb('grating'), upl = td.gb('glow_warm');
    for (let i = 0; i < T.polygon.length; i++) {
      const a = T.polygon[i], b = T.polygon[(i + 1) % T.polygon.length], m = P2.lerp(a, b, 0.5);
      if (K.polyDist(m, L.outline) < 0.1) continue;
      const d = P2.norm(P2.sub(b, a)), nn = [-d[1], d[0]], ins = K.inPoly(P2.add(m, P2.mul(nn, 0.5)), T.polygon) ? 1 : -1, o = P2.mul(nn, ins * 0.42);
      let aa = a, bb = b; if (K.polyDist(a, L.outline) < 0.1) aa = P2.add(a, P2.mul(d, 1.2)); if (K.polyDist(b, L.outline) < 0.1) bb = P2.add(b, P2.mul(d, -1.2));
      K.sbox(dr, P2.add(aa, o), P2.add(bb, o), 0.18, T.y, T.y + 0.004);
      const l = P2.len(P2.sub(bb, aa)); for (let s = 3; s < l - 1; s += 6) { const p = P2.add(P2.add(aa, P2.mul(d, s)), P2.mul(nn, ins * 0.75)); K.abox(upl, p[0] - 0.09, p[0] + 0.09, T.y, T.y + 0.008, p[1] - 0.09, p[1] + 0.09); }
    }
    // low ground cover on the planters (stays under 0.2 m so the planters' cover heights do not change)
    const leaf = td.gb('ext_leaf'), tuft = new THREE.ConeGeometry(0.2, 0.16, 6, 1), M4 = new THREE.Matrix4(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3();
    for (const f of T.features) {
      if (f.kind !== 'planter') continue;
      const [x0, z0, x1, z1] = f.box, top = T.y + f.h - 0.02;
      for (let x = x0 + 0.2; x < x1 - 0.12; x += 0.27) for (let z = z0 + 0.2; z < z1 - 0.12; z += 0.27) {
        leaf.addGeo(tuft, M4.compose(V.set(x + (R() - 0.5) * 0.1, top + 0.07, z + (R() - 0.5) * 0.1), Q.setFromEuler(E.set(0, R() * 6, 0)), S.set(1, 0.6 + R() * 0.5, 1)));
      }
    }
    tuft.dispose();
    // puddles on the West Roof and the Crane Deck (clear of the plant room, stacks, hut and walkway landings)
    const rg = WETQ;
    for (const nb of EXT.neighbours) {
      if (nb.id !== 'NB_west' && nb.id !== 'NB_crane') continue;
      const [x0, z0, x1, z1] = K.polyBox(nb.footprint), boxes = nb.features.filter((f) => f.box).map((f) => f.box);
      for (let t = 0, k = 0; t < 300 && k < 22; t++) {
        const x = x0 + 3 + R() * (x1 - x0 - 6), z = z0 + 3 + R() * (z1 - z0 - 6), rx = 0.5 + R() * 1.8, rz = 0.4 + R() * 1.2;
        if (boxes.some((b) => x + rx > b[0] - 0.4 && x - rx < b[2] + 0.4 && z + rx > b[1] - 0.4 && z - rx < b[3] + 0.4)) continue;
        puddle(rg, x, nb.top_y + 0.006, z, rx, rz, R() * 3); k++;
      }
    }
    if (WETQ.length) addUV('terrace_wet', quadGeo(WETQ), 'ext_wet', 'deco');
  }
  tq = mark('terrace', tq);

  /* ---------------------------------------------------------------- real lights (2 outside): the holo spill and the A1 canopy */
  K.light('X', { pos: [50, 16, 13.5], color: '#9a5cff', intensity: 1400, distance: 70, decay: 1.7 });
  K.light('X', { pos: [0, 2.9, 54.5], color: '#ffc58e', intensity: 26, distance: 12, decay: 2 });

  /* ---------------------------------------------------------------- viewer only: rain, curtains, splashes, traffic, train, blink, lightning */
  const camPos = () => { try { return camera.position; } catch (e) { return null; } };
  {
    const RR = K.rng(33);
    // near rain: streaks in a box that follows the camera; two lengths, a little wind
    {
      const n = FAST ? 3000 : 11000, W = 66, H = 46, pos = new Float32Array(n * 6), at = new Float32Array(n * 2), ln = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { const x = RR() * W, y = RR() * H, z = RR() * W, l = RR() < 0.2 ? 1.3 : 0.6 + RR() * 0.3; pos.set([x, y, z, x, y, z], i * 6); at[i * 2] = 0; at[i * 2 + 1] = 1; ln[i * 2] = ln[i * 2 + 1] = l; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(at, 1)); g.setAttribute('aLen', new THREE.BufferAttribute(ln, 1));
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uT: { value: 0 }, uCam: { value: new THREE.Vector3() } },
        vertexShader: `attribute float aEnd; attribute float aLen; uniform float uT; uniform vec3 uCam; varying float vA; varying float vD;
          void main() { vec3 p = position; float W = ${W.toFixed(1)}, H = ${H.toFixed(1)};
            p.y = mod(p.y - uT * 12.5 * (0.8 + 0.3 * aLen), H); p.x = mod(p.x - uCam.x + uT * 1.8, W); p.z = mod(p.z - uCam.z + uT * 0.6, W);
            p = p + uCam - vec3(W * 0.5, H * 0.5, W * 0.5); p += aEnd * vec3(0.07, 0.95, 0.02) * aLen; vA = aEnd;
            vec4 mv = viewMatrix * vec4(p, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying float vA; varying float vD; void main() { float f = smoothstep(0.8, 3.0, vD) * (1.0 - smoothstep(18.0, 33.0, vD)); gl_FragColor = vec4(0.58, 0.62, 0.7, 0.13 * f * (1.0 - vA * 0.85)); }`,
      });
      const l = new THREE.LineSegments(g, mat); l.frustumCulled = false; l.renderOrder = 5;
      K.view(l, 'rain'); K.onTick((dt, t) => { mat.uniforms.uT.value = t; const c = camPos(); if (c) mat.uniforms.uCam.value.copy(c); });
    }
    // rain curtains: big soft sheets in the middle distance catching the city light
    {
      const c = K.canvas(128, 512), x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 128, 512);
      for (let i = 0; i < 260; i++) { const px = RR() * 128, py = RR() * 512, l = 20 + RR() * 90, g = x.createLinearGradient(0, py, 0, py + l); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${(0.2 + RR() * 0.35).toFixed(3)})`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(px, py, 1, l); x.fillRect(px, py - 512, 1, l); }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
      // soft edges computed from the plane's own uv, so no sheet ever shows a straight border
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uMap: { value: t }, uOff: { value: t.offset }, uCol: { value: new THREE.Color('#8e86c8') }, uOp: { value: 0.07 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform sampler2D uMap; uniform vec2 uOff; uniform vec3 uCol; uniform float uOp; varying vec2 vUv;
          void main() { float e = pow(sin(3.14159 * vUv.x), 2.0) * pow(sin(3.14159 * vUv.y), 1.5); float s = texture2D(uMap, vUv * vec2(3.0, 1.4) + uOff).r;
            gl_FragColor = vec4(uCol * s, uOp * e); }`,
      });
      const grp = new THREE.Group();
      for (let i = 0; i < (FAST ? 8 : 16); i++) {
        const a = RR() * Math.PI * 2, d = 160 + RR() * 520, w = 140 + RR() * 220;
        const p = new THREE.Mesh(new THREE.PlaneGeometry(w, 360), m); p.position.set(Math.sin(a) * d, -120 + RR() * 60, Math.cos(a) * d); p.lookAt(0, p.position.y, 0); grp.add(p);
      }
      K.view(grp, 'rain'); K.onTick((dt) => { t.offset.y += dt * 0.9; t.offset.x += dt * 0.02; });
    }
    // splashes on the terrace and the neighbour roofs
    {
      const pts = [], T = EXT.terrace, R2 = K.rng(55);
      for (let t = 0; t < (FAST ? 900 : 2600); t++) { const x = -33 + R2() * 66, z = 21.5 + R2() * 35; if (K.inPoly([x, z], T.polygon) && !K.inPoly([x, z], L.outline)) pts.push(x, T.y + 0.03, z, R2()); }
      for (const nb of EXT.neighbours) { if (nb.id !== 'NB_west' && nb.id !== 'NB_crane') continue; const [x0, z0, x1, z1] = K.polyBox(nb.footprint); for (let t = 0; t < (FAST ? 300 : 900); t++) pts.push(x0 + R2() * (x1 - x0), nb.top_y + 0.03, z0 + R2() * (z1 - z0), R2()); }
      const n = pts.length / 4, P = new Float32Array(n * 3), PH = new Float32Array(n);
      for (let i = 0; i < n; i++) { P[i * 3] = pts[i * 4]; P[i * 3 + 1] = pts[i * 4 + 1]; P[i * 3 + 2] = pts[i * 4 + 2]; PH[i] = pts[i * 4 + 3]; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(PH, 1));
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 } },
        vertexShader: `attribute float aPh; uniform float uT; varying float vC;
          void main() { float c = fract(uT * 1.7 + aPh * 7.0); vC = c; vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = max(0.5, -mv.z);
            gl_PointSize = clamp((0.03 + 0.11 * c) * 700.0 / d, 0.0, 9.0) * step(d, 30.0); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying float vC; void main() { vec2 q = gl_PointCoord - 0.5; q.y *= 2.6; float r = length(q); float a = smoothstep(0.5, 0.36, r) * smoothstep(0.2, 0.34, r) * (1.0 - vC); if (a < 0.01) discard; gl_FragColor = vec4(0.75, 0.78, 0.95, 0.16 * a); }`,
      });
      const pnt = new THREE.Points(g, mat); pnt.frustumCulled = false; K.view(pnt, 'rain'); K.onTick((dt, t) => { mat.uniforms.uT.value = t; });
    }
    // moving traffic: headlights one way, tail lights the other, on streets, expressways and bridges
    {
      const lanes = [], R3 = K.rng(77), LIM = FAST ? 1400 : 2400;
      const lane = (ax, ay, az, bx, by, bz, sp) => { if (Math.hypot(bx - ax, bz - az) > 30) lanes.push([ax, ay, az, bx, by, bz, sp]); };
      for (const S of XS) {
        if (Math.abs(S.x) > LIM) continue;
        for (const [za, zb] of [[-LIM, RIVERSIDE_N(S.x)], [RIVERSIDE_S(S.x), LIM + 1500]]) { if (zb <= za) continue; for (const o of S.w > 30 ? [0.15, 0.32] : [0.22]) { lane(S.x + S.w * o, G + 1.2, za, S.x + S.w * o, G + 1.2, zb, 1); lane(S.x - S.w * o, G + 1.2, zb, S.x - S.w * o, G + 1.2, za, 0); } }
      }
      for (const S of [...ZN, ...ZS]) { if (S.z < -LIM || S.z > LIM + 1500) continue; for (const o of S.w > 30 ? [0.15, 0.32] : [0.22]) { lane(-LIM, G + 1.2, S.z + S.w * o, LIM, G + 1.2, S.z + S.w * o, 1); lane(LIM, G + 1.2, S.z - S.w * o, -LIM, G + 1.2, S.z - S.w * o, 0); } }
      for (const fn of [EXPRESS_N, EXPRESS_S]) for (let x = -RANGE; x < RANGE; x += 200) for (const [o, w] of [[-9, 1], [-5, 1], [5, 0], [9, 0]]) { const a = [x, fn(x)], b = [x + 200, fn(x + 200)], d = P2.norm(P2.sub(b, a)), nn = [-d[1], d[0]], A = P2.add(a, P2.mul(nn, o)), B = P2.add(b, P2.mul(nn, o)); if (w) lane(A[0], G + 2.2, A[1], B[0], G + 2.2, B[1], 3); else lane(B[0], G + 2.2, B[1], A[0], G + 2.2, A[1], 2); }
      for (const B of BRIDGES) { const z0 = bankN(B.x) - 70, z1 = bankS(B.x) + 70; for (const o of [3.5, 7.5]) { lane(B.x + o, G + 20.6, z1, B.x + o, G + 20.6, z0, 3); lane(B.x - o, G + 20.6, z0, B.x - o, G + 20.6, z1, 2); } }
      const A = [], Bv = [], Pp = [];
      for (const l of lanes) {
        const len = Math.hypot(l[3] - l[0], l[5] - l[2]), sp = l[6] >= 2 ? 26 : 14, gap = l[6] >= 2 ? 45 : 70, n = Math.max(1, Math.floor(len / gap * (0.6 + R3() * 0.6)));
        for (let k = 0; k < n; k++) { A.push(l[0], l[1], l[2]); Bv.push(l[3], l[4], l[5]); Pp.push(R3(), (sp * (0.75 + R3() * 0.5)) / len, l[6] % 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(A, 3)); g.setAttribute('aB', new THREE.Float32BufferAttribute(Bv, 3)); g.setAttribute('aP', new THREE.Float32BufferAttribute(Pp, 3));
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 } },
        vertexShader: `attribute vec3 aB; attribute vec3 aP; uniform float uT; varying vec3 vC;
          void main() { float t = fract(aP.x + uT * aP.y); vec3 p = mix(position, aB, t); vec4 mv = modelViewMatrix * vec4(p, 1.0); float d = -mv.z;
            vC = (aP.z > 0.5 ? vec3(1.0, 0.93, 0.82) : vec3(1.0, 0.16, 0.1)) * exp(-d * 0.00042) * 1.3;
            gl_PointSize = clamp(2600.0 / d, 1.0, 3.2); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec3 vC; void main() { vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.15, length(q)); gl_FragColor = vec4(vC * a, a); }`,
      });
      const pts = new THREE.Points(g, mat); pts.frustumCulled = false; K.view(pts, 'skyline');
      K.onTick((dt, t) => { mat.uniforms.uT.value = t; });
      K.timings.exterior_cars = A.length / 3;
    }
    // the light-rail train on the riverside viaduct
    {
      const vz = (x) => RIVERSIDE_N(x) - 30, grp = new THREE.Group(), car = new THREE.BoxGeometry(19, 3.4, 3.2), strip = new THREE.BoxGeometry(19, 0.3, 3.3);
      const m = new THREE.MeshBasicMaterial({ color: '#ffd9b6' }), m2 = new THREE.MeshBasicMaterial({ color: '#8a4dff' }), cars = [];
      for (let k = 0; k < 8; k++) { const c = new THREE.Mesh(car, m), s = new THREE.Mesh(strip, m2); s.position.y = -1.8; c.add(s); grp.add(c); cars.push(c); }
      K.view(grp, 'skyline');
      K.onTick((dt, t) => { const head = ((t * 22) % 6000) - 3000; cars.forEach((c, k) => { const x = head - k * 20; c.position.set(x, G + 18, vz(x)); c.rotation.y = -Math.atan2(vz(x + 1) - vz(x - 1), 2); c.visible = x > -3000; }); });
    }
    // the crown's sky beam: a thin shaft of violet light up into the cloud deck and the lit patch it makes there
    {
      const y0 = EXT.tower_above.crown_y + 14, c = K.canvas(16, 256), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.35, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,1)'); x.fillStyle = g; x.fillRect(0, 0, 16, 256);
      const bm = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: '#9a6cff', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 0.35, 260, 12, 1, true), bm); beam.position.set(0, y0 + 130, 0);
      const pc = K.img(128, 128, (i, j, o) => { const r = Math.hypot(i - 64, j - 64) / 64, a = Math.exp(-r * r * 4) * sst(1, 0.8, r); o[0] = o[1] = o[2] = 255 * a; });
      const pm = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pc), color: '#7a54d8', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), pm); patch.rotation.x = -Math.PI / 2; patch.position.set(0, 173.5, 0);
      const grp = new THREE.Group(); grp.add(beam, patch); K.view(grp, 'skyline', 'R');
      K.onTick((dt, t) => { bm.opacity = 0.26 + 0.05 * Math.sin(t * 0.9); });
    }
    // beacons blink; lightning brightens the sky, the clouds and the haze (in step with the viewer's sky pulse); screens flicker
    {
      const B = K.M.ext_beacon, S = K.M.ext_sky, Cl = K.M.ext_cloud, flash = new THREE.Color('#5a4c86');
      K.onTick((dt, t) => {
        B.emissiveIntensity = (t % 1.6) < 0.22 ? 4.0 : 0.25;
        let f = 0; try { f = clamp((hemi.intensity - 0.45) / 1.4, 0, 1); } catch (e) { f = 0; }
        S.emissiveIntensity = 1 + 1.4 * f; Cl.emissiveIntensity = 0.9 + 1.6 * f;
        HZ.value.copy(HZ0).lerp(flash, f * 0.5);
        for (const k of ['ext_holo_a', 'ext_holo_b', 'ext_holo_c', 'ext_holo_d', 'ext_holo_e']) { const m = K.M[k]; if (m) m.opacity = 0.8 + 0.06 * Math.sin(t * 2.3 + k.charCodeAt(9)) + 0.03 * Math.sin(t * 17.0 + k.charCodeAt(9)); }
      });
    }
  }
  tq = mark('viewer', tq);
  K.timings.exterior_detail = TM;
  K.timings.exterior_total = Math.round(performance.now() - T0);
};
