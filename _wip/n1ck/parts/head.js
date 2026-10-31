/* ------------------------------------------------------------------ part: head (neck, head housing, screen, ears) */
// Owner: the head agent. Attach to K.bones.neck and K.bones.head only. Contract: SPEC.md.
// Everything is modelled in rest-pose world space and attached with K.addW.
PARTS.head = function buildHead(K) {
  const { THREE, D, M, TX, V3 } = K;
  const H = D.head, SC = H.screen, E = H.ear;
  const CY = (H.bottom + H.top) / 2, HW = H.halfW, ZF = H.front;

  /* ---------------- small local helpers */
  // superellipse point (the same parametrisation sLoft uses, so outlines match the shell)
  const se = (t, a, b, n) => { const c = Math.cos(t), s = Math.sin(t), e = 2 / n; return [a * Math.sign(c) * Math.pow(Math.abs(c), e), b * Math.sign(s) * Math.pow(Math.abs(s), e)]; };
  const seShape = (a, b, n, N = 96, path = new THREE.Shape()) => { for (let i = 0; i < N; i++) { const [x, y] = se(i / N * Math.PI * 2, a, b, n); i ? path.lineTo(x, y) : path.moveTo(x, y); } path.closePath(); return path; };
  const rrPath = (x0, x1, y0, y1, r) => K.roundedShape([[x0, y0, r], [x1, y0, r], [x1, y1, r], [x0, y1, r]], new THREE.Path());
  // smooth value noise for hand-beaten surface waviness
  const n3 = (x, y, z) => K.noise3(x, y, z) - 0.5;
  const beat = (g, amp, f) => {
    const p = g.attributes.position, nm = g.attributes.normal, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const d = amp * (n3(v.x * f, v.y * f, v.z * f) + 0.5 * n3(v.x * f * 2.3 + 5, v.y * f * 2.3, v.z * f * 2.3));
      p.setXYZ(i, v.x + nm.getX(i) * d, v.y + nm.getY(i) * d, v.z + nm.getZ(i) * d);
    }
    p.needsUpdate = true; g.computeVertexNormals();
    return g;
  };

  /* ---------------- shared bits */
  // the head housing narrows a little toward the jaw: x scales from 1 at the crown to 1 - TAPER at the chin
  const TAPER = 0.06, tS = (y) => 1 - TAPER * (H.top - y) / (H.top - H.bottom), tD = -TAPER / (H.top - H.bottom) * -1;
  const taper = (g) => {
    const p = g.attributes.position, nm = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), s = tS(y);
      p.setX(i, x * s);
      if (nm) { const nx = nm.getX(i) / s, ny = nm.getY(i) - nm.getX(i) * x * tD / s, nz = nm.getZ(i), l = Math.hypot(nx, ny, nz) || 1; nm.setXYZ(i, nx / l, ny / l, nz / l); }
    }
    p.needsUpdate = true; if (nm) nm.needsUpdate = true;
    return g;
  };
  const add = (bone, geo, mat, name, opts) => K.addW(bone, bone === 'head' ? taper(geo) : geo, mat, name, opts);
  const beatD = (v, amp, f) => amp * (n3(v.x * f, v.y * f, v.z * f) + 0.5 * n3(v.x * f * 2.3 + 5, v.y * f * 2.3, v.z * f * 2.3));
  // hand-set rivets (light lathe heads), slightly squashed and tilted
  const rivetSet = (list, r, seed) => {
    const Rn = K.prng(seed), out = [];
    for (const { p, n } of list) {
      const g = K.rivetHead(r * (0.94 + Rn() * 0.12), 7), nn = n.clone().normalize();
      g.scale(1, 0.85 + Rn() * 0.25, 1); g.rotateY(Rn() * 6.283); g.rotateX((Rn() - 0.5) * 0.12); g.rotateZ((Rn() - 0.5) * 0.12);
      K.orient(g, V3(0, 1, 0), nn); g.translate(p.x - nn.x * 0.0005, p.y - nn.y * 0.0005, p.z - nn.z * 0.0005); out.push(g);
    }
    return K.merge(out);
  };
  // one hex socket screw head (CSG once), placed many times
  const hexProto = K.screwHead(0.0042, { style: 'hex', h: 0.0042 * 0.55, seg: 10 });
  const hexAt = (pos, n, spin) => K.placeScrew(hexProto.clone(), pos.clone().addScaledVector(n.clone().normalize(), -0.0003), n, spin);
  // closed sweep: rings of profile points -> indexed geometry with outward faces
  const gridGeo = (rings, closedU = true, closedV = true, flip = null) => {
    const N = rings.length, P = rings[0].length, pos = [], idx = [];
    for (const r of rings) for (const p of r) pos.push(p[0], p[1], p[2]);
    for (let i = 0; i < (closedU ? N : N - 1); i++) for (let k = 0; k < (closedV ? P : P - 1); k++) {
      const a = i * P + k, b = i * P + (k + 1) % P, c = ((i + 1) % N) * P + k, d = ((i + 1) % N) * P + (k + 1) % P;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    // outward: flip if the signed volume is negative
    let vol = 0; const A = V3(), B = V3(), C = V3(), pa = g.attributes.position;
    if (flip === null) for (let i = 0; i < idx.length; i += 3) { A.fromBufferAttribute(pa, idx[i]); B.fromBufferAttribute(pa, idx[i + 1]); C.fromBufferAttribute(pa, idx[i + 2]); vol += A.dot(B.cross(C)); }
    g.userData.flip = flip === null ? vol < 0 : flip;
    if (g.userData.flip) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); }
    g.computeVertexNormals();
    return g;
  };
  const outward2 = (P) => P.map((p, i) => { const t = P[(i + 1) % P.length].clone().sub(P[(i - 1 + P.length) % P.length]); return new THREE.Vector2(t.y, -t.x).normalize(); });

  /* ---------------- shell: forged rounded box behind the face plate */
  // stations along z: [z, half x, half y, exponent, x offset, y offset]
  const shellSt = [
    [-0.110, 0.080, 0.103, 3.3, 0, CY - 0.004],
    [-0.092, 0.0872, 0.1115, 3.6, 0, CY - 0.002],
    [-0.055, 0.0895, 0.1150, 3.8, 0, CY],
    [0.020, 0.0895, 0.1150, 3.8, 0, CY],
    [0.070, 0.0892, 0.1146, 3.8, 0, CY],
  ];
  const SH_ROUND = 0.032, SH_AMP = 0.00045, SH_F = 26;
  const shF = [1, 2, 3, 4, 5].map((i) => K.curve(shellSt.map((r) => [r[0], r[i]])));
  const shellSec = (z) => { let a = shF[0](z), b = shF[1](z); const ds = z - shellSt[0][0]; if (ds < SH_ROUND) { const ins = SH_ROUND - Math.sqrt(Math.max(0, SH_ROUND ** 2 - (SH_ROUND - ds) ** 2)); a -= ins; b -= ins; } return { a, b, n: shF[2](z), oy: shF[4](z) }; };
  const shell = K.sLoft(shellSt, { axis: 'z', seg: 52, steps: 30, roundStart: SH_ROUND });
  beat(shell, SH_AMP, SH_F);
  add('head', shell, M.iron, 'head_shell');

  /* ---------------- face plate: the thick iron bezel, gently curved, with the screen well */
  // A swept ring from the outer outline to the screen hole: rounded outer rim, slightly beaten front,
  // rounded lip and the well wall down past the display. Bent around Y and X like the plate() helper.
  const FP_T = 0.022, BY = 0.5, BX = 0.9, hy0 = SC.cy - CY, FA = HW, FB = H.top - CY, FN = 3.8;
  const bend = (x, y, h) => {
    let X = x, Y = y, Z = h;
    { const a = X / BY, r = BY + Z; X = r * Math.sin(a); Z = r * Math.cos(a) - BY; }
    { const a = Y / BX, r = BX + Z; Y = r * Math.sin(a); Z = r * Math.cos(a) - BX; }
    return V3(X, Y + CY, Z + ZF - FP_T);
  };
  const bendN = (x, y, h) => { const p = bend(x, y, h), px = bend(x + 1e-4, y, h).sub(p), py = bend(x, y + 1e-4, h).sub(p); return px.cross(py).normalize(); };
  const fpBeat = (x, y) => 0.0004 * (n3(x * 34, y * 34, 3.1) + 0.5 * n3(x * 80, y * 80, 7.7));
  {
    const N = 112, r2 = 0.003, T = FP_T;
    const hole = rrPath(-SC.w / 2, SC.w / 2, hy0 - SC.h / 2, hy0 + SC.h / 2, SC.r);
    const I = hole.getSpacedPoints(N).slice(0, N).map((p) => new THREE.Vector2(p.x, p.y));
    const polarR = (th) => Math.pow(Math.pow(Math.abs(Math.cos(th) / FA), FN) + Math.pow(Math.abs(Math.sin(th) / FB), FN), -1 / FN);
    const O = I.map((p) => { const th = Math.atan2(p.y, p.x), r = polarR(th); return new THREE.Vector2(Math.cos(th) * r, Math.sin(th) * r); });
    const nO = outward2(O), nI = outward2(I);
    // outer edge: a 45 degree chamfer between two tight fillets (the fillets take the edge wear as thin lines)
    const CH = 0.0055, FR = 0.0016 * Math.tan(Math.PI / 8);
    const mark = {};
    const rings = I.map((ii, i) => {
      const o = O[i], no = nO[i], ni = nI[i], pts = [];
      const P = (v, h) => { const q = bend(v.x, v.y, h); pts.push([q.x, q.y, q.z]); };
      const at = (b, d, s) => b.clone().addScaledVector(d, s);
      const E = (s, h) => P(at(o, no, -s), h);                       // s = inset from the outline
      const fil = (q, u1, u2) => { const S0 = [q[0] - u1[0] * FR, q[1] - u1[1] * FR], E0 = [q[0] + u2[0] * FR, q[1] + u2[1] * FR]; E(...S0); E(0.25 * S0[0] + 0.5 * q[0] + 0.25 * E0[0], 0.25 * S0[1] + 0.5 * q[1] + 0.25 * E0[1]); E(...E0); };
      const d45 = [Math.SQRT1_2, Math.SQRT1_2];
      E(0.0012, 0); E(0, 0.0012);
      fil([0, T - CH], [0, 1], d45); fil([CH, T], d45, [1, 0]);
      const A = at(o, no, -(CH + FR)), B = at(ii, ni, r2);
      for (let k = 1; k <= 4; k++) { const v = A.clone().lerp(B, k / 5); P(v, T + fpBeat(v.x, v.y)); }
      mark.lip = pts.length;
      for (let k = 0; k <= 3; k++) { const f = k / 3 * Math.PI / 2; P(at(ii, ni, r2 * (1 - Math.sin(f))), T - r2 + r2 * Math.cos(f)); }
      mark.well = pts.length - 1;
      P(ii, 0.0075); P(at(ii, ni, 0.0012), 0); P(A.clone().lerp(B, 0.5), 0);
      mark.n = pts.length;
      return pts;
    });
    // three meshes: back, rim and face up to the lip (worn); the lip (clean iron); the well (dark crevice iron)
    const flip = gridGeo(rings).userData.flip, L = mark.n - 1;
    add('head', gridGeo(rings.map((r) => [r[L], ...r.slice(0, mark.lip + 1)]), true, false, flip), M.iron, 'face_plate', { wear: { k: 160, chip: 0.42, freq: 120, inner: false } });
    add('head', gridGeo(rings.map((r) => r.slice(mark.lip, mark.well + 1)), true, false, flip), M.iron, 'face_plate_lip');
    add('head', gridGeo(rings.map((r) => r.slice(mark.well)), true, false, flip), M.inner, 'face_plate_well');
  }
  // screen: the display surface 12 mm behind the bezel face, curved with it; UVs on atlas cell 0
  const SCR_H = FP_T - 0.012;
  const bentPlane = (w, h, hh, bulge = 0) => {
    const g = new THREE.PlaneGeometry(w, h, 12, 9), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i) + hy0, q = bend(x, y, hh), u = x / (w / 2), v = (y - hy0) / (h / 2);
      p.setXYZ(i, q.x, q.y, q.z + bulge * Math.max(0, 1 - u * u) * Math.max(0, 1 - v * v));
    }
    g.computeVertexNormals(); return g;
  };
  add('head', K.screenUV(bentPlane(SC.w + 0.008, SC.h + 0.008, SCR_H), SC.cx, SC.cy, SC.w, SC.h), M.screen, 'screen', { cast: false });
  // optional cover glass (M.glass) 1.6 mm in front; off because the viewer's screen light sits on the eye line
  // and would show as a hot spot on the glass in frontal views
  const GLASS = false;
  if (GLASS) add('head', bentPlane(SC.w + 0.006, SC.h + 0.006, SCR_H + 0.0016), M.glass, 'screen_glass', { cast: false, receive: false });
  // four socket screws hold the bezel at its corners
  const fpScrews = [];
  for (const [x, y] of [[-0.064, 0.084], [0.064, 0.084], [-0.064, -0.081], [0.064, -0.081]]) fpScrews.push(hexAt(bend(x, y, FP_T + fpBeat(x, y)), bendN(x, y, FP_T), 0.3 + x * 20 + y * 13));
  add('head', K.merge(fpScrews), M.gunmetal, 'face_plate_screws', { cast: false });

  /* ---------------- riveted band: an iron strap round the housing just behind the face plate */
  const BAND_Z0 = 0.039, BAND_Z1 = 0.056, BAND_D = 0.0026;
  const secPts = (z, n = 96) => { const s = shellSec(z), P = []; for (let j = 0; j < n; j++) { const [x, y] = se(j / n * Math.PI * 2, s.a, s.b, s.n); P.push(new THREE.Vector2(x, y + s.oy)); } return P; };
  {
    const P = secPts((BAND_Z0 + BAND_Z1) / 2, 96), nP = outward2(P), rc = 0.0013, prof = [];
    prof.push([-0.0015, BAND_Z0]);
    for (let k = 0; k <= 3; k++) { const f = k / 3 * Math.PI / 2; prof.push([BAND_D - rc + rc * Math.sin(f), BAND_Z0 + rc - rc * Math.cos(f)]); }
    for (let k = 0; k <= 3; k++) { const f = k / 3 * Math.PI / 2; prof.push([BAND_D - rc + rc * Math.cos(f), BAND_Z1 - rc + rc * Math.sin(f)]); }
    prof.push([-0.0015, BAND_Z1]);
    const rings = P.map((p, j) => prof.map(([d, z]) => { const q = p.clone().addScaledVector(nP[j], d); return [q.x, q.y, z]; }));
    add('head', gridGeo(rings), M.iron, 'head_band', { wear: { k: 140, chip: 0.55, freq: 70 } });
    // rivets every ~38 mm round the band, spaced by arc length
    const fine = secPts((BAND_Z0 + BAND_Z1) / 2, 720), nf = outward2(fine), L = [0];
    for (let j = 1; j <= fine.length; j++) L.push(L[j - 1] + fine[j % fine.length].distanceTo(fine[j - 1]));
    const cnt = 16, list = [];
    for (let c = 0; c < cnt; c++) {
      const target = (c + 0.5) / cnt * L[fine.length]; let j = 0; while (L[j + 1] < target) j++;
      const p = fine[j], n = nf[j];
      list.push({ p: V3(p.x + n.x * BAND_D, p.y + n.y * BAND_D, (BAND_Z0 + BAND_Z1) / 2), n: V3(n.x, n.y, 0) });
    }
    add('head', rivetSet(list, 0.0036, 31), M.rivet, 'head_band_rivets', { cast: false });
  }

  /* ---------------- crown seam: the two pressed halves welded over the top and down the back */
  {
    const pts = [], nrm = [];
    const top = (z) => { const s = shellSec(z); return s.oy + s.b; };
    for (let z = BAND_Z0 - 0.003; z > shellSt[0][0] + 0.0012; z -= 0.004) { const p = V3(0, top(z), z); p.y += beatD(p, SH_AMP, SH_F); pts.push(p); }
    const z0 = shellSt[0][0], yb = top(z0 + 0.0001);
    for (let y = yb - 0.004; y > CY + 0.058; y -= 0.006) { const p = V3(0, y, z0); p.z -= beatD(p, SH_AMP, SH_F); pts.push(p); }
    for (let i = 0; i < pts.length; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], t = b.clone().sub(a); nrm.push(V3(0, -t.z, t.y).normalize()); }
    add('head', K.weld(pts, nrm, { w: 0.0082, h: 0.0022, pitch: 0.0062, seg: 6, seed: 5 }), M.weld, 'crown_weld', { cast: false });
  }

  /* ---------------- back: heat-sink panel with fins, screws, cable port */
  {
    const z0 = shellSt[0][0], py = CY + 0.004;
    const panel = K.plate(K.rect(-0.046, 0.046, -0.042, 0.042, 0.012), 0.0048, { bevel: 0.0016, curveSegments: 6 }).rotateY(Math.PI).translate(0, py, z0 + 0.0002);
    add('head', panel, M.iron, 'back_panel', { wear: { k: 150, chip: 0.5 } });
    const fin = K.plate(K.rect(-0.034, 0.034, -0.0016, 0.0016, 0.0015), 0.0075, { bevel: 0.0011, curveSegments: 2 }).rotateY(Math.PI);
    add('head', K.merge([-0.024, -0.012, 0, 0.012, 0.024].map((dy) => fin.clone().translate(0, py + dy, z0 - 0.0044))), M.gunmetal, 'back_fins');
    add('head', K.merge([[-0.04, 0.035], [0.04, 0.035], [-0.04, -0.035], [0.04, -0.035]].map(([x, y], i) => hexAt(V3(x, py + y, z0 - 0.0046), V3(0, 0, -1), i * 0.7))), M.gunmetal, 'back_panel_screws', { cast: false });
  }

  /* ---------------- ears: speaker (his left) and mic (his right) housings on riveted ear plates */
  {
    const earX0 = shellSec(E.z).a - 0.0006, FL = 0.0997;     // shell side, grille floor
    const plateG = K.plate(K.roundedShape([[-0.034, -0.034, 0.034], [0.034, -0.034, 0.034], [0.034, 0.034, 0.034], [-0.034, 0.034, 0.034]]), 0.005, { bevel: 0.0018, curveSegments: 10 }).rotateY(Math.PI / 2).translate(earX0 - 0.0004, E.y, E.z);
    const housing = K.latheX([[0.088, 0], [0.088, 0.031], [0.0952, 0.031], [0.0962, 0.0298], [0.0968, 0.0272], [0.0972, 0.026], [0.1028, 0.026], [0.1038, 0.0252], [0.1042, 0.0236], [0.1042, 0.0212], [0.1036, 0.0206], [FL + 0.0001, 0.0203], [FL, 0]], 32).translate(0, E.y, E.z);
    const well = new THREE.CircleGeometry(0.0204, 28).rotateY(Math.PI / 2).translate(FL + 0.00015, E.y, E.z);
    const ringL = (r0, r1, x1 = 0.1026) => K.latheX([[FL, r1], [x1 - 0.0003, r1], [x1, r1 - 0.0004], [x1, r0 + 0.0004], [x1 - 0.0003, r0], [FL, r0]], 20);
    // speaker: concentric rings, four spokes and a centre cap
    const spk = [ringL(0.004, 0.006), ringL(0.0088, 0.0108), ringL(0.0136, 0.0156), ringL(0.0184, 0.0205, 0.1024), K.latheX([[FL, 0.0034], [0.1022, 0.0034], [0.1028, 0.0024], [0.103, 0]], 20)];
    for (let k = 0; k < 4; k++) spk.push(K.box(FL, 0.1022, -0.0007, 0.0007, 0.0045, 0.0186).rotateX(k * Math.PI / 2 + Math.PI / 4));
    const speaker = K.merge(spk).translate(0, E.y, E.z);
    // mic: perforated dome in a clamp ring
    const domeP = [[0, 0.1046], [0.0038, 0.1045], [0.0078, 0.1041], [0.0118, 0.1034], [0.0148, 0.1024], [0.0165, 0.1012]];
    const domeX = (r) => { for (let i = 1; i < domeP.length; i++) if (r <= domeP[i][0]) { const t = (r - domeP[i - 1][0]) / (domeP[i][0] - domeP[i - 1][0]); return K.lerp(domeP[i - 1][1], domeP[i][1], t); } return domeP[domeP.length - 1][1]; };
    const mic = K.merge([K.latheX([[FL, 0.0165], ...domeP.slice().reverse().map(([r, x]) => [x, r])], 32), ringL(0.0163, 0.0205, 0.1027)]).translate(0, E.y, E.z);
    const dots = [];
    for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) {
      const y = j * 0.0026 * 0.866, z = (i + (j & 1) * 0.5) * 0.0026, r = Math.hypot(y, z); if (r > 0.0128) continue;
      const x = domeX(r), dx = (domeX(r + 1e-4) - x) / 1e-4, n = V3(1, -dx * y / Math.max(r, 1e-6), -dx * z / Math.max(r, 1e-6)).normalize();
      dots.push(K.orient(new THREE.CircleGeometry(0.00072, 6), V3(0, 0, 1), n).translate(x + n.x * 0.00008, E.y + y + n.y * 0.00008, E.z + z + n.z * 0.00008));
    }
    const micDots = K.merge(dots);
    for (const s of [1, -1]) {
      const side = (g) => s > 0 ? g : K.mirrorX(g), sfx = s > 0 ? 'l' : 'r';
      add('head', side(plateG.clone()), M.iron, `ear_plate_${sfx}`, { wear: { k: 150, chip: 0.5 } });
      add('head', side(housing.clone()), M.gunmetal, `ear_${sfx}`);
      add('head', side(well.clone()), M.inner, `ear_${sfx}_well`, { cast: false });
      if (s > 0) add('head', speaker, M.gunmetal, 'ear_l_speaker_grille', { cast: false });
      else { add('head', K.mirrorX(mic), M.gunmetal, 'ear_r_mic', { cast: false }); add('head', K.mirrorX(micDots), M.inner, 'ear_r_mic_holes', { cast: false }); }
      // audio lead: from behind the ear plate back along the side into the rear of the housing, two clips
      const lead = []; for (const [y, z] of [[1.711, -0.041], [1.703, -0.058], [1.688, -0.073], [1.672, -0.085], [1.66, -0.096]]) lead.push(V3(shellSec(z).a + 0.0031, y, z));
      const le = lead[lead.length - 1]; lead.push(V3(le.x - 0.006, le.y - 0.003, le.z - 0.004));
      add('head', side(K.cable(lead, 0.0027, { seg: 7 })), M.cable, `ear_${sfx}_lead`, { cast: false });
      add('head', side(K.cableEnds([lead[0], lead[1], lead[4], lead[5]], 0.0029, 0.009)), M.gunmetal, `ear_${sfx}_lead_ferrules`, { cast: false });
      const crv = new THREE.CatmullRomCurve3(lead), clips = [], clipRv = [];
      for (const u of [0.28, 0.62]) {
        const q = crv.getPointAt(u), t = crv.getTangentAt(u);
        clips.push(K.orient(K.latheY([[-0.003, 0.0036], [-0.0026, 0.0041], [0.0026, 0.0041], [0.003, 0.0036]], 14), V3(0, 1, 0), t).translate(q.x, q.y, q.z));
        const off = V3(0, -t.z, t.y).normalize().multiplyScalar(0.0072);
        clips.push(K.box(-0.0026, 0.0, -0.0028, 0.0028, -0.0028, 0.0028).translate(q.x + off.x, q.y + off.y, q.z + off.z));
        clipRv.push({ p: V3(q.x - 0.0026 + 0.0003, q.y + off.y * 1.15, q.z + off.z * 1.15), n: V3(1, 0, 0) });
      }
      add('head', side(K.merge(clips)), M.gunmetal, `ear_${sfx}_lead_clips`, { cast: false });
      add('head', side(rivetSet(clipRv.map(({ p }) => ({ p: V3(p.x + 0.0026, p.y, p.z), n: V3(1, 0, 0) })), 0.0022, 40 + s)), M.rivet, `ear_${sfx}_lead_rivets`, { cast: false });
      const rv = []; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.52; rv.push({ p: V3(earX0 + 0.0046, E.y + Math.sin(a) * 0.0286, E.z + Math.cos(a) * 0.0286), n: V3(1, 0, 0) }); }
      add('head', side(rivetSet(rv, 0.0033, 20 + s)), M.rivet, `ear_plate_${sfx}_rivets`, { cast: false });
    }
  }

  /* ---------------- neck: segmented rings on a dark spine, braided tendons, socket under the head */
  {
    const NZ = -0.015;
    add('neck', K.latheY([[1.534, 0], [1.534, 0.048], [1.546, 0.048], [1.549, 0.045], [1.551, 0.032], [1.551, 0]], 24).translate(0, 0, NZ), M.gunmetal, 'neck_base');
    add('neck', new THREE.CylinderGeometry(0.027, 0.029, 0.086, 24, 1).translate(0, 1.583, NZ), M.inner, 'neck_spine');
    const vert = (y, r, h = 0.0055) => K.latheY([[y - h, 0.026], [y - h, r - 0.003], [y - h + 0.001, r - 0.0008], [y - h + 0.0025, r], [y + h - 0.0025, r], [y + h - 0.001, r - 0.0008], [y + h, r - 0.003], [y + h, 0.026]], 32);
    // two vertebra rings, then the junction collar the cables plug into (the head swivels just above it)
    add('neck', K.merge([vert(1.5625, 0.043), vert(1.5785, 0.042), vert(1.5965, 0.047, 0.0065)]).translate(0, 0, NZ), M.gunmetal, 'neck_rings');
    // cable sockets under the collar: front left, front right, back ([side, angle from the front])
    const sockP = [[1, Math.PI / 4], [-1, Math.PI / 4], [0, Math.PI]].map(([sd, a]) => V3(sd * Math.sin(a) * 0.0505, 1.5915, NZ + Math.cos(a) * 0.0505));
    add('neck', K.merge(sockP.map((p) => K.latheY([[-0.0062, 0], [-0.0062, 0.0062], [-0.0055, 0.0072], [0.006, 0.0072], [0.006, 0]], 18).translate(p.x, p.y, p.z))), M.gunmetal, 'neck_sockets');
    const tendon = (s) => [V3(s * 0.03, 1.534, NZ + 0.028), V3(s * 0.035, 1.556, NZ + 0.035), V3(s * 0.0362, 1.575, NZ + 0.0362), V3(s * 0.0357, 1.592, NZ + 0.0357)];
    const spineC = [V3(0, 1.534, NZ - 0.038), V3(0, 1.556, NZ - 0.047), V3(0, 1.575, NZ - 0.0505), V3(0, 1.592, NZ - 0.0505)];
    add('neck', K.merge([K.cableBundle(tendon(1), { n: 2, r: 0.0036, twist: 7, seg: 7 }), K.cableBundle(tendon(-1), { n: 2, r: 0.0036, twist: 7, seg: 7 }), K.cableBundle(spineC, { n: 3, r: 0.0031, twist: 6, seg: 7 })]), M.cable, 'neck_cables');
    // clamps tie the tendons to the middle ring
    const clamps = [];
    for (const s of [1, -1]) {
      const c = new THREE.CatmullRomCurve3(tendon(s)); let u = 0.5;
      for (let k = 0; k <= 40; k++) if (Math.abs(c.getPointAt(k / 40).y - 1.5785) < Math.abs(c.getPointAt(u).y - 1.5785)) u = k / 40;
      const p = c.getPointAt(u), t = c.getTangentAt(u);
      clamps.push(K.orient(K.latheY([[-0.0034, 0.0086], [-0.003, 0.0092], [0.003, 0.0092], [0.0034, 0.0086]], 18), V3(0, 1, 0), t).translate(p.x, p.y, p.z));
      const r = V3(p.x, 0, p.z - NZ).normalize();
      clamps.push(K.box(-0.0022, 0.0022, -0.0026, 0.0026, -0.006, 0.0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), r)).translate(p.x - r.x * 0.0083, 1.5785, p.z - r.z * 0.0083));
    }
    add('neck', K.merge(clamps), M.gunmetal, 'neck_clamps', { cast: false });
    // socket flange under the housing, bolted round its rim
    add('head', K.latheY([[1.6045, 0], [1.6045, 0.034], [1.6052, 0.0405], [1.607, 0.0428], [1.6185, 0.0428], [1.62, 0]], 40).translate(0, 0, NZ), M.gunmetal, 'head_socket');
    const sb = []; for (let i = 0; i < 6; i++) { const a = (i + 0.5) / 6 * Math.PI * 2, n = V3(Math.sin(a), 0, Math.cos(a)); sb.push(hexAt(V3(n.x * 0.0428, 1.6128, NZ + n.z * 0.0428), n, a)); }
    add('head', K.merge(sb), M.gunmetal, 'head_socket_bolts', { cast: false });
  }

  /* ---------------- face atlas and the face switching hook */
  const FACE_LIST = ['neutral', 'neutral_blink', 'happy', 'happy_blink', 'worried', 'worried_blink', 'laughing_a', 'laughing_b', 'sad', 'sad_blink', 'alert', 'alert_blink', 'talk_a', 'talk_b', 'focus', 'off'];
  drawAtlas();
  const red = new THREE.Color('#d8141a');
  K.hooks.face = {
    cells: FACE_LIST,
    offset: (i) => [(i % 4) / 4, -Math.floor(i / 4) / 4],
    // show a cell (index or name) and an alarm tint 0..1 on the screen material
    set(cell, tint = 0) {
      const i = typeof cell === 'number' ? cell : Math.max(0, FACE_LIST.indexOf(cell));
      const [u, v] = this.offset(i);
      M.screen.emissiveMap.offset.set(u, v);
      M.screen.emissive.set('#ffffff').lerp(red, Math.min(1, Math.max(0, tint)));
      return i;
    },
  };

  // Crisp warm LED faces with sub-pixel stripes and scan rows, redrawn into TX.faceAtlasCanvas in place
  // (same 4 x 4 layout of 256 x 192 cells, 32 x 24 LEDs at 8 px). Alert cells are red.
  function drawAtlas() {
    const CW = 256, CH = 192, GW = 32, GH = 24, P = 8, SS = 4;
    const cvs = TX.faceAtlasCanvas, ctx = cvs.getContext('2d');
    const img = ctx.createImageData(CW * 4, CH * 4), px = img.data;
    const hi = document.createElement('canvas'); hi.width = GW * SS; hi.height = GH * SS;
    const S = hi.getContext('2d', { willReadFrequently: true });
    const EL = 10.5, ER = 21.5, EY = 9.5;
    const rr = (x, y, w, h, r) => { S.beginPath(); S.roundRect(x - w / 2, y - h / 2, w, h, r); S.fill(); };
    const ln = (pts, lw = 1.5) => { S.lineWidth = lw; S.beginPath(); S.moveTo(...pts[0]); for (const p of pts.slice(1)) S.lineTo(...p); S.stroke(); };
    const qd = (a, c, b, lw = 1.5) => { S.lineWidth = lw; S.beginPath(); S.moveTo(...a); S.quadraticCurveTo(...c, ...b); S.stroke(); };
    const fill = (f) => { S.beginPath(); f(); S.fill(); };
    const both = (f) => { f(EL, 1); f(ER, -1); };
    const eyes = (w = 3.1, h = 6.2, y = EY) => both((x) => rr(x, y, w, h, 1.5));
    const lids = (y = EY + 1, w = 4.6, droop = 0.7) => both((x) => qd([x - w / 2, y], [x, y + droop * 2], [x + w / 2, y], 1.5));
    const smile = (w = 8, d = 1.4, y = 16.8, lw = 1.5) => qd([16 - w / 2, y], [16, y + d * 2], [16 + w / 2, y], lw);
    const frown = (w = 7.6, d = 1.5, y = 19.2) => qd([16 - w / 2, y], [16, y - d * 2], [16 + w / 2, y], 1.5);
    const happyEyes = (lift = 3.4, y = EY + 1.6) => both((x) => qd([x - 2.8, y], [x, y - lift * 1.6], [x + 2.8, y], 1.7));
    const brows = (yo, yi, dx = 0) => both((x, s) => ln([[x - s * 2.8, yo], [x + s * (2.4 + dx), yi]], 1.3));
    const wavy = () => { S.lineWidth = 1.5; S.beginPath(); S.moveTo(11.4, 18.9); S.quadraticCurveTo(13.7, 16.6, 16, 18.4); S.quadraticCurveTo(18.3, 20.2, 20.6, 17.9); S.stroke(); };
    const laughEyes = (dy = 0) => both((x, s) => ln([[x - s * 2.3, EY - 2.3 + dy], [x + s * 1.9, EY + dy], [x - s * 2.3, EY + 2.3 + dy]], 1.6));
    const cut = (f) => { S.globalCompositeOperation = 'destination-out'; f(); S.globalCompositeOperation = 'source-over'; };
    const FACE = {
      neutral: () => { eyes(); smile(); },
      neutral_blink: () => { lids(); smile(); },
      happy: () => { happyEyes(); smile(11, 2.6, 15.9, 1.6); },
      happy_blink: () => { happyEyes(1.6, EY + 1.8); smile(11, 2.6, 15.9, 1.6); },
      worried: () => { eyes(3.0, 5.0, EY + 1.1); brows(5.2, 3.4); wavy(); },
      worried_blink: () => { lids(EY + 1.8, 4.2, 0.5); brows(5.2, 3.4); wavy(); },
      laughing_a: () => { laughEyes(); fill(() => { S.moveTo(10.4, 14.8); S.lineTo(21.6, 14.8); S.quadraticCurveTo(16, 25, 10.4, 14.8); }); },
      laughing_b: () => { laughEyes(-0.5); fill(() => { S.moveTo(11.2, 14.6); S.lineTo(20.8, 14.6); S.quadraticCurveTo(16, 21.8, 11.2, 14.6); }); },
      sad: () => {
        eyes(3.2, 4.8, EY + 1.6);
        cut(() => both((x, s) => fill(() => { S.moveTo(x - s * 3.6, EY + 1.2); S.lineTo(x + s * 2.4, EY - 1.6); S.lineTo(x - s * 3.6, EY - 3.4); })));
        brows(5.4, 3.9, -0.2); frown();
      },
      sad_blink: () => { both((x, s) => ln([[x - s * 2.3, EY + 2.6], [x + s * 2.1, EY + 1.7]], 1.5)); brows(5.4, 3.9, -0.2); frown(); },
      alert: () => { eyes(4.1, 7.4, EY + 0.6); brows(2.6, 2.2); rr(16, 18.2, 4.2, 2.4, 1.1); },
      alert_blink: () => { lids(EY + 1.4, 5, 0.3); brows(2.6, 2.2); rr(16, 18.2, 4.2, 2.4, 1.1); },
      talk_a: () => { eyes(); rr(16, 17.7, 5.2, 2.6, 1.2); },
      talk_b: () => { eyes(); fill(() => { S.moveTo(12.2, 16.1); S.lineTo(19.8, 16.1); S.quadraticCurveTo(16, 21.8, 12.2, 16.1); }); },
      focus: () => { both((x) => rr(x, EY + 0.6, 4.8, 2.4, 1)); brows(5.5, 5.9); qd([12.8, 17.4], [16.6, 19.2], [19.8, 16.5], 1.5); },
      off: () => { },
    };
    const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const WARM = [232, 214, 186], REDC = [236, 46, 34];
    FACE_LIST.forEach((name, idx) => {
      S.setTransform(1, 0, 0, 1, 0, 0); S.clearRect(0, 0, hi.width, hi.height);
      S.setTransform(SS, 0, 0, SS, 0, 0); S.fillStyle = S.strokeStyle = '#fff'; S.lineCap = 'round'; S.lineJoin = 'round';
      FACE[name]();
      const a = S.getImageData(0, 0, hi.width, hi.height).data;
      // LED levels from coverage: off, a dim anti-alias step, on (mirrored for the symmetric faces)
      const cov = new Float32Array(GW * GH), lv = new Float32Array(GW * GH), sym = !/^(worried|focus)/.test(name);
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        let c = 0; for (let y = 0; y < SS; y++) for (let x = 0; x < SS; x++) c += a[((j * SS + y) * hi.width + i * SS + x) * 4 + 3];
        cov[j * GW + i] = c / (SS * SS * 255);
      }
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        const c = sym ? Math.max(cov[j * GW + i], cov[j * GW + GW - 1 - i]) : cov[j * GW + i];
        lv[j * GW + i] = c < 0.22 ? 0 : c < 0.5 ? 0.42 : 1;
      }
      // soft glow: the LED levels blurred
      const gl = new Float32Array(GW * GH), kr = 2;
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        let s = 0, w = 0;
        for (let y = -kr; y <= kr; y++) for (let x = -kr; x <= kr; x++) { const ii = i + x, jj = j + y, k = Math.exp(-(x * x + y * y) / 1.6); w += k; if (ii >= 0 && jj >= 0 && ii < GW && jj < GH) s += lv[jj * GW + ii] * k; }
        gl[j * GW + i] = s / w;
      }
      const glow = (fx, fy) => {
        const x = Math.min(GW - 1.001, Math.max(0, fx - 0.5)), y = Math.min(GH - 1.001, Math.max(0, fy - 0.5)), i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j;
        const g = (ii, jj) => gl[Math.min(GH - 1, jj) * GW + Math.min(GW - 1, ii)];
        return (g(i, j) * (1 - u) + g(i + 1, j) * u) * (1 - v) + (g(i, j + 1) * (1 - u) + g(i + 1, j + 1) * u) * v;
      };
      const isRed = name.startsWith('alert'), col = isRed ? REDC : WARM, base = isRed ? [14, 5, 4] : [12, 10, 8], ground = isRed ? [5, 2, 2] : [4, 3, 3];
      const ox = (idx % 4) * CW, oy = Math.floor(idx / 4) * CH, rnd = K.prng(77 + idx * 13);
      const vary = new Float32Array(GW * GH); for (let k = 0; k < vary.length; k++) vary[k] = 0.9 + rnd() * 0.16;
      for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
        const i = x >> 3, j = y >> 3, lx = x & 7, ly = y & 7, k = j * GW + i, b = lv[k] * vary[k];
        // LED cell: 6 x 6 lit area with clipped corners, one dark pixel of gap all round
        const inX = lx >= 1 && lx <= 6, inY = ly >= 1 && ly <= 6, corner = (lx === 1 || lx === 6) && (ly === 1 || ly === 6);
        const mask = inX && inY ? (corner ? 0.45 : 1) : 0;
        // sub-pixel stripes (R G B, two columns each) and a dim scan row at the bottom of each LED
        const sp = lx <= 2 ? 0 : lx <= 4 ? 1 : 2, scan = ly === 6 ? 0.72 : ly === 1 ? 0.92 : 1;
        const cx = lx - 3.5, cy = ly - 3.5, hot = 1 + 0.18 * Math.max(0, 1 - Math.sqrt(cx * cx + cy * cy) / 3.2);
        const vx = (x + 0.5) / CW - 0.5, vy = (y + 0.5) / CH - 0.5, vig = 1 - 0.32 * sstep(0.28, 0.62, Math.sqrt(vx * vx + vy * vy * 1.6));
        const g = glow((x + 0.5) / P, (y + 0.5) / P);
        const o = ((oy + y) * CW * 4 + ox + x) * 4;
        for (let c = 0; c < 3; c++) {
          const stripe = 0.94 + (c === sp ? 0.14 : 0);
          let v = mask ? base[c] * (0.7 + 0.3 * vary[k]) : ground[c];
          v += mask * b * col[c] * stripe * scan * hot;
          v += col[c] * g * (mask ? 0.1 : 0.2);
          px[o + c] = Math.min(255, v * vig);
        }
        px[o + 3] = 255;
      }
    });
    ctx.putImageData(img, 0, 0);
    TX.faceAtlas.needsUpdate = true;
  }
};
