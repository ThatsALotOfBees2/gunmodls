/* ================================================================== N1CK core */
// Proportions, rig, materials and procedural textures, detail helpers, blockouts and the part loader.
// Metres, +Y up, N1CK faces +Z and his left is +X. Rest pose: T-pose with every bone at identity
// rotation, so at rest a bone's local axes are the world axes and local = world - joint position.
// See SPEC.md for the contract the part files build against.

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const deg = THREE.MathUtils.degToRad;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const clampR = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/* ------------------------------------------------------------------ proportions */

const HEIGHT = 1.85;
// joint centres in the rest T-pose, world metres; right-side joints mirror x
const JOINT_L = {
  hips: [0, 1.0, 0], spine: [0, 1.09, -0.005], chest: [0, 1.215, -0.01], upper_chest: [0, 1.345, -0.012],
  neck: [0, 1.555, -0.02], head: [0, 1.64, -0.01],
  shoulder_l: [0.03, 1.47, -0.015], upper_arm_l: [0.185, 1.47, -0.025], lower_arm_l: [0.485, 1.47, -0.025], hand_l: [0.75, 1.47, -0.025],
  upper_leg_l: [0.092, 0.955, 0], lower_leg_l: [0.092, 0.515, 0.006], foot_l: [0.092, 0.09, -0.012], toes_l: [0.092, 0.026, 0.15],
};
// fingers of the left hand: knuckle offset from the wrist, segment lengths (proximal, middle, distal),
// width (across the hand) and thickness (back to palm). The thumb runs along dir; the others along +X.
const FINGER = {
  thumb: { base: [0.024, -0.012, 0.022], dir: [0.62, -0.3, 0.72], len: [0.046, 0.033, 0.028], w: 0.022, t: 0.019 },
  index: { base: [0.094, 0.003, 0.028], len: [0.043, 0.026, 0.021], w: 0.019, t: 0.017 },
  middle: { base: [0.098, 0.004, 0.008], len: [0.047, 0.03, 0.022], w: 0.0195, t: 0.0175 },
  ring: { base: [0.094, 0.002, -0.012], len: [0.044, 0.028, 0.02], w: 0.018, t: 0.0165 },
  pinky: { base: [0.086, -0.002, -0.031], len: [0.034, 0.021, 0.018], w: 0.016, t: 0.015 },
};
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

const J = {}, PARENT = {}, BONE_NAMES = [], TIP = {};
(function buildJoints() {
  const put = (n, p, v) => { J[n] = v; PARENT[n] = p; BONE_NAMES.push(n); };
  const spine = [['hips', null], ['spine', 'hips'], ['chest', 'spine'], ['upper_chest', 'chest'], ['neck', 'upper_chest'], ['head', 'neck']];
  for (const [n, p] of spine) put(n, p, V3(...JOINT_L[n]));
  for (const s of ['l', 'r']) {
    const m = s === 'l' ? 1 : -1, mv = (p) => V3(p[0] * m, p[1], p[2]);
    put('shoulder_' + s, 'upper_chest', mv(JOINT_L.shoulder_l));
    put('upper_arm_' + s, 'shoulder_' + s, mv(JOINT_L.upper_arm_l));
    put('lower_arm_' + s, 'upper_arm_' + s, mv(JOINT_L.lower_arm_l));
    put('hand_' + s, 'lower_arm_' + s, mv(JOINT_L.hand_l));
    const wrist = J['hand_' + s];
    for (const f of FINGERS) {
      const F = FINGER[f], dir = F.dir ? V3(...F.dir).normalize() : V3(1, 0, 0);
      dir.x *= m;
      let p = wrist.clone().add(mv(F.base)), parent = 'hand_' + s;
      for (let i = 0; i < 3; i++) { const n = `${f}_${i + 1}_${s}`; put(n, parent, p.clone()); parent = n; p = p.clone().addScaledVector(dir, F.len[i]); }
      TIP[`${f}_${s}`] = p;
    }
  }
  for (const s of ['l', 'r']) {
    const m = s === 'l' ? 1 : -1, mv = (p) => V3(p[0] * m, p[1], p[2]);
    put('upper_leg_' + s, 'hips', mv(JOINT_L.upper_leg_l));
    put('lower_leg_' + s, 'upper_leg_' + s, mv(JOINT_L.lower_leg_l));
    put('foot_' + s, 'lower_leg_' + s, mv(JOINT_L.foot_l));
    put('toes_' + s, 'foot_' + s, mv(JOINT_L.toes_l));
    TIP['toe_' + s] = V3(m * 0.092, 0.03, 0.215);
    TIP['heel_' + s] = V3(m * 0.092, 0.03, -0.075);
  }
  TIP.head_top = V3(0, HEIGHT, -0.008);
})();

// Unity Humanoid bone for each rig bone (pinky = "Little" in Unity)
const HUMAN = { hips: 'Hips', spine: 'Spine', chest: 'Chest', upper_chest: 'UpperChest', neck: 'Neck', head: 'Head' };
for (const s of ['l', 'r']) {
  const S = s === 'l' ? 'Left' : 'Right';
  Object.assign(HUMAN, {
    ['shoulder_' + s]: S + 'Shoulder', ['upper_arm_' + s]: S + 'UpperArm', ['lower_arm_' + s]: S + 'LowerArm', ['hand_' + s]: S + 'Hand',
    ['upper_leg_' + s]: S + 'UpperLeg', ['lower_leg_' + s]: S + 'LowerLeg', ['foot_' + s]: S + 'Foot', ['toes_' + s]: S + 'Toes',
  });
  for (const f of FINGERS) for (let i = 0; i < 3; i++) {
    HUMAN[`${f}_${i + 1}_${s}`] = `${S} ${f === 'pinky' ? 'Little' : f[0].toUpperCase() + f.slice(1)} ${['Proximal', 'Intermediate', 'Distal'][i]}`;
  }
}

// body envelope (world metres, rest pose). Part builders size their shells from these numbers.
const D = {
  height: HEIGHT, J, TIP, PARENT, FINGER, FINGERS, BONES: BONE_NAMES, HUMAN,
  len: { upper_arm: 0.3, lower_arm: 0.265, hand: 0.195, palm: 0.098, upper_leg: 0.44, lower_leg: 0.425, foot: 0.29, neck: 0.085 },
  // limb envelope radii [near joint, far joint]: arms are a touch deeper (z) than tall (y)
  limbR: { upper_arm: [0.05, 0.041], lower_arm: [0.044, 0.032], upper_leg: [0.078, 0.056], lower_leg: [0.06, 0.042] },
  torso: {
    crotchY: 0.86, hipY: 0.99, waistY: 1.13, chestY: 1.37, collarY: 1.555,
    hipHalfW: 0.163, waistHalfW: 0.134, chestHalfW: 0.17, shoulderOuter: 0.245,
    hipFront: 0.1, hipBack: -0.116, waistFront: 0.09, waistBack: -0.098, chestFront: 0.114, chestBack: -0.126,
  },
  head: {
    halfW: 0.092, bottom: 1.615, top: HEIGHT, front: 0.095, back: -0.11, corner: 0.05,
    screen: { cx: 0, cy: 1.735, w: 0.136, h: 0.102, r: 0.014, z: 0.083 },          // display surface, recessed behind the bezel face
    ear: { x: 0.104, y: 1.73, z: -0.012, r: 0.026, len: 0.024 },                    // cylinder axis along X, x = outer face centre
  },
  hand: { palmHalfW: 0.044, palmTop: 0.015, palmBot: -0.017, palmLen: 0.1 },
  foot: { heelZ: -0.075, toeZ: 0.215, soleH: 0.025, halfW: 0.05, ankleY: 0.09 },
  emitter: { x: 0.115, y: 1.47, z: -0.128, normal: [0.5, 0.35, -1], r: 0.032 },     // left one; right mirrors x
  cell: { y: 1.15, z: -0.13, r: 0.03, h: 0.085 },                                   // power cell centre and core size
};
D.thumbFlexAxis_l = V3(...FINGER.thumb.dir).normalize().cross(V3(0, -1, 0)).normalize();

/* ------------------------------------------------------------------ procedural textures */
// Every texture tiles. Albedo is sRGB; normal maps use the OpenGL convention (+Y up the image);
// "orm" packs R = 1, G = roughness, B = metalness the way glTF stores them.

function prng(seed) { let s = (Math.floor(Math.abs(seed) * 9973) % 2147483646) + 1; return () => (s = s * 16807 % 2147483647) / 2147483647; }
// tileable value noise: px x py lattice cells across an N x N tile
function vnoise(N, px, py, rnd) {
  const L = new Float32Array(px * py); for (let i = 0; i < L.length; i++) L[i] = rnd();
  const out = new Float32Array(N * N), X0 = new Int32Array(N), X1 = new Int32Array(N), SX = new Float32Array(N);
  for (let x = 0; x < N; x++) { const f = x / N * px, i = Math.floor(f), t = f - i; X0[x] = i % px; X1[x] = (i + 1) % px; SX[x] = t * t * (3 - 2 * t); }
  for (let y = 0; y < N; y++) {
    const f = y / N * py, i = Math.floor(f), t = f - i, sy = t * t * (3 - 2 * t), r0 = (i % py) * px, r1 = ((i + 1) % py) * px;
    for (let x = 0; x < N; x++) {
      const a = L[r0 + X0[x]], b = L[r0 + X1[x]], c = L[r1 + X0[x]], d = L[r1 + X1[x]], sx = SX[x];
      out[y * N + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}
// fractal sum; ar stretches the lattice along the image's y (ar > 1: streaks along x)
function fbmT(N, p, oct, rnd, { gain = 0.5, ar = 1 } = {}) {
  const out = new Float32Array(N * N); let a = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const px = Math.max(1, Math.min(N, Math.round(p * 2 ** o))), py = Math.max(1, Math.min(N, Math.round(p * ar * 2 ** o)));
    const n = vnoise(N, px, py, rnd);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * a;
    tot += a; a *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function stretch(a) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < a.length; i++) { const v = a[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const k = 1 / Math.max(1e-6, hi - lo); for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) * k;
  return a;
}
// separable box blur that wraps around the tile
function blurW(src, N, r) {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(N * N), out = new Float32Array(N * N), w = 2 * r + 1, wrap = (i) => ((i % N) + N) % N;
  for (let y = 0; y < N; y++) {
    const row = y * N; let s = 0;
    for (let k = -r; k <= r; k++) s += src[row + wrap(k)];
    for (let x = 0; x < N; x++) { tmp[row + x] = s / w; s += src[row + wrap(x + r + 1)] - src[row + wrap(x - r)]; }
  }
  for (let x = 0; x < N; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[wrap(k) * N + x];
    for (let y = 0; y < N; y++) { out[y * N + x] = s / w; s += tmp[wrap(y + r + 1) * N + x] - tmp[wrap(y - r) * N + x]; }
  }
  return out;
}
// a smooth bowl pressed into the height field (hammer strike, peen mark, pit); wraps
function addDimple(H, N, cx, cy, r, depth) {
  const r2 = r * r, x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy, row = (((y % N) + N) % N) * N;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, d2 = dx * dx + dy * dy; if (d2 >= r2) continue;
      const k = 1 - d2 / r2; H[row + (((x % N) + N) % N)] -= depth * k * k;
    }
  }
}
// a thin scratch with tapered ends; keeps the strongest value where scratches cross
function addScratch(B, N, x, y, ang, len, curv, val) {
  for (let s = 0; s < len; s += 0.6) {
    const fade = Math.sin(Math.PI * s / len), ix = ((Math.round(x) % N) + N) % N, iy = ((Math.round(y) % N) + N) % N, i = iy * N + ix;
    B[i] = Math.max(B[i], val * (0.35 + 0.65 * fade));
    x += Math.cos(ang) * 0.6; y += Math.sin(ang) * 0.6; ang += curv;
  }
}
function rgbaCanvas(N, M, fn) {
  const c = canvas(N, M), ctx = c.getContext('2d'), img = ctx.createImageData(N, M), d = img.data, px = [0, 0, 0, 1];
  for (let i = 0; i < N * M; i++) { px[3] = 1; fn(i, px); const o = i * 4; d[o] = px[0] * 255; d[o + 1] = px[1] * 255; d[o + 2] = px[2] * 255; d[o + 3] = px[3] * 255; }
  ctx.putImageData(img, 0, 0); return c;
}
function normalFrom(H, N, s) {
  const c = canvas(N, N), ctx = c.getContext('2d'), img = ctx.createImageData(N, N), d = img.data;
  for (let y = 0; y < N; y++) {
    const ym = ((y - 1 + N) % N) * N, yp = ((y + 1) % N) * N, row = y * N;
    for (let x = 0; x < N; x++) {
      const xm = (x - 1 + N) % N, xp = (x + 1) % N;
      // canvas y runs down the image; the texture's +V runs up it
      const nx = -(H[row + xp] - H[row + xm]) * 0.5 * s, ny = (H[yp + x] - H[ym + x]) * 0.5 * s, l = 1 / Math.hypot(nx, ny, 1), o = (row + x) * 4;
      d[o] = (nx * l * 0.5 + 0.5) * 255; d[o + 1] = (ny * l * 0.5 + 0.5) * 255; d[o + 2] = (l * 0.5 + 0.5) * 255; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0); return c;
}

// forged iron plate: soft hammer facets and peen marks, blue-black mill scale with small lighter flakes
// where it has come away, fine pitting, a few short scratches. Kept low in contrast: it should read as
// dark gunmetal from a few metres and reward a close look.
function ironMaps(N, seed) {
  const R = prng(seed), n2 = N * N, k = N / 1024, H = new Float32Array(n2);
  const warp = fbmT(N, 4, 4, R);
  for (let i = 0; i < n2; i++) H[i] = (warp[i] - 0.5) * 0.7;
  for (let j = 0; j < 180; j++) addDimple(H, N, R() * N, R() * N, (40 + R() * 80) * k, 0.16 + R() * 0.22);
  for (let j = 0; j < 1600; j++) addDimple(H, N, R() * N, R() * N, (5 + R() * 11) * k, 0.03 + R() * 0.05);
  const F = stretch(fbmT(N, 14, 4, R, { gain: 0.55 })), flake = new Float32Array(n2);
  for (let i = 0; i < n2; i++) flake[i] = 1 - sstep(0.3, 0.335, F[i]);     // 1 where the scale has flaked off
  const pits = new Float32Array(n2), pm = stretch(fbmT(N, 5, 3, R));
  for (let j = 0; j < 2200; j++) { const x = R() * N, y = R() * N; if (pm[(y | 0) * N + (x | 0)] > 0.45 + R() * 0.3) addDimple(pits, N, x, y, (0.7 + R() * 1.6) * k, 0.6 + R() * 0.4); }
  const scr = new Float32Array(n2); for (let j = 0; j < 140; j++) addScratch(scr, N, R() * N, R() * N, R() * 6.283, (8 + R() * 60) * k, (R() - 0.5) * 0.004, 0.3 + R() * 0.7);
  for (let i = 0; i < n2; i++) H[i] += -flake[i] * 0.035 + pits[i] * 0.04 - scr[i] * 0.025;
  const br = Math.max(1, Math.round(5 * k)), Bl = blurW(blurW(H, N, br), N, br);
  const blot = stretch(fbmT(N, 2, 3, R)), warm = stretch(fbmT(N, 3, 3, R)), fine = fbmT(N, 96, 2, R);
  const map = rgbaCanvas(N, N, (i, o) => {
    const fl = flake[i], cv = clampR((H[i] - Bl[i]) * 2.4, -1, 1), w = (warm[i] - 0.5) * 0.08;
    const t = (0.88 + 0.22 * blot[i]) * (1 + 0.08 * cv) * (0.95 + 0.1 * fine[i]) * (1 + pits[i] * 0.5);
    const sc = Math.min(1, scr[i] * 0.45);
    o[0] = lerp(lerp(0.19, 0.245, fl) * t * (1 + w), 0.42, sc);
    o[1] = lerp(lerp(0.196, 0.236, fl) * t, 0.4, sc);
    o[2] = lerp(lerp(0.208, 0.224, fl) * t * (1 - w), 0.37, sc);
  });
  const orm = rgbaCanvas(N, N, (i, o) => {
    const fl = flake[i], cv = Math.max(0, (H[i] - Bl[i]) * 2.4);
    o[0] = 1;
    o[1] = clampR(lerp(0.56, 0.46, fl) - 0.06 * cv - 0.16 * scr[i] + 0.1 * (blot[i] - 0.5) - pits[i] * 0.12, 0.2, 0.92);
    o[2] = clampR(lerp(0.7, 0.8, fl) + 0.12 * scr[i], 0, 1);
  });
  return { map, normal: normalFrom(H, N, 5.5 / k), orm };
}
// bare iron on worn edges: warm ground metal, grind scratches, left-over islands of dark scale
function wearMaps(N, seed) {
  const R = prng(seed), n2 = N * N, k = N / 1024, H = new Float32Array(n2), scr = new Float32Array(n2);
  for (let j = 0; j < 700; j++) { const a = R() < 0.7 ? (R() - 0.5) * 0.6 : R() * 6.283; addScratch(scr, N, R() * N, R() * N, a, (8 + R() * 70) * k, (R() - 0.5) * 0.004, 0.3 + R() * 0.7); }
  const P = stretch(fbmT(N, 20, 4, R, { gain: 0.55 })), blot = stretch(fbmT(N, 3, 3, R)), fine = fbmT(N, 128, 1, R), patch = new Float32Array(n2);
  for (let i = 0; i < n2; i++) { patch[i] = sstep(0.6, 0.64, P[i]); H[i] = patch[i] * 0.08 - scr[i] * 0.05 + (fine[i] - 0.5) * 0.04; }
  const map = rgbaCanvas(N, N, (i, o) => {
    const t = (0.86 + 0.26 * blot[i]) * (0.95 + 0.1 * fine[i]), s = scr[i] * 0.16, p = patch[i];
    o[0] = lerp(0.52 * t + s, 0.21, p); o[1] = lerp(0.49 * t + s, 0.21, p); o[2] = lerp(0.445 * t + s, 0.215, p);
  });
  const orm = rgbaCanvas(N, N, (i, o) => { o[0] = 1; o[1] = lerp(0.36 + 0.1 * blot[i] - 0.1 * scr[i], 0.6, patch[i]); o[2] = lerp(1, 0.6, patch[i]); });
  return { map, normal: normalFrom(H, N, 7 / k), orm };
}
// crevices and inner frames: dark iron with a faint warm rust bloom
function innerMaps(N, seed) {
  const R = prng(seed), n2 = N * N, k = N / 1024, H = new Float32Array(n2);
  const rm = stretch(fbmT(N, 6, 5, R)), fine = stretch(fbmT(N, 48, 3, R)), blot = stretch(fbmT(N, 2, 3, R)), rust = new Float32Array(n2);
  for (let i = 0; i < n2; i++) { rust[i] = sstep(0.6, 0.82, rm[i]) * (0.45 + 0.55 * fine[i]); H[i] = (fine[i] - 0.5) * 0.25 + rust[i] * 0.2; }
  for (let j = 0; j < 1200; j++) addDimple(H, N, R() * N, R() * N, (1.5 + R() * 3) * k, 0.3);
  const map = rgbaCanvas(N, N, (i, o) => {
    const t = 0.85 + 0.3 * blot[i], r = rust[i] * 0.8;
    o[0] = lerp(0.13 * t, 0.3, r); o[1] = lerp(0.125 * t, 0.16, r); o[2] = lerp(0.12 * t, 0.09, r);
  });
  const orm = rgbaCanvas(N, N, (i, o) => { o[0] = 1; o[1] = lerp(0.68, 0.92, rust[i]); o[2] = lerp(0.6, 0.08, rust[i]); });
  return { map, normal: normalFrom(H, N, 6 / k), orm };
}
// machined gunmetal: fine turning/milling streaks along U, a few dings
function gunmetalMaps(N, seed) {
  const R = prng(seed), n2 = N * N, k = N / 1024, H = new Float32Array(n2);
  const streak = stretch(fbmT(N, 2, 5, R, { ar: 48 })), blot = stretch(fbmT(N, 3, 3, R));
  for (let i = 0; i < n2; i++) H[i] = streak[i] * 0.05;
  for (let j = 0; j < 60; j++) addDimple(H, N, R() * N, R() * N, (3 + R() * 6) * k, 0.25);
  const scr = new Float32Array(n2); for (let j = 0; j < 80; j++) addScratch(scr, N, R() * N, R() * N, R() * 6.283, (10 + R() * 80) * k, 0, 0.5 + R() * 0.5);
  for (let i = 0; i < n2; i++) H[i] -= scr[i] * 0.03;
  const map = rgbaCanvas(N, N, (i, o) => { const t = (0.9 + 0.16 * streak[i]) * (0.94 + 0.12 * blot[i]) + scr[i] * 0.25; o[0] = 0.255 * t; o[1] = 0.268 * t; o[2] = 0.29 * t; });
  const orm = rgbaCanvas(N, N, (i, o) => { o[0] = 1; o[1] = 0.3 + 0.1 * streak[i] + 0.06 * blot[i] - 0.1 * scr[i]; o[2] = 0.95; });
  return { map, normal: normalFrom(H, N, 6 / k), orm };
}
// brushed stainless: bright, cool, satin streaks along U
function stainlessMaps(N, seed) {
  const R = prng(seed), n2 = N * N, k = N / 1024, H = new Float32Array(n2);
  const br = stretch(fbmT(N, 2, 6, R, { ar: 96 })), blot = stretch(fbmT(N, 2, 3, R)), scr = new Float32Array(n2);
  for (let j = 0; j < 50; j++) addScratch(scr, N, R() * N, R() * N, R() * 6.283, (8 + R() * 60) * k, (R() - 0.5) * 0.02, 0.4 + R() * 0.6);
  for (let i = 0; i < n2; i++) H[i] = br[i] * 0.06 - scr[i] * 0.02;
  const map = rgbaCanvas(N, N, (i, o) => { const t = (0.9 + 0.18 * br[i]) * (0.96 + 0.08 * blot[i]); o[0] = 0.7 * t; o[1] = 0.715 * t; o[2] = 0.73 * t; });
  const orm = rgbaCanvas(N, N, (i, o) => { o[0] = 1; o[1] = 0.28 + 0.12 * br[i] + 0.05 * blot[i] - 0.06 * scr[i]; o[2] = 1; });
  return { map, normal: normalFrom(H, N, 5 / k), orm };
}
// weld metal: dark with heat-tint bands (straw, blue, violet) and spatter grain
function weldMaps(N, seed) {
  const R = prng(seed), n2 = N * N, k = N / 1024, H = new Float32Array(n2);
  const a = stretch(fbmT(N, 6, 4, R)), b = stretch(fbmT(N, 8, 4, R)), g = stretch(fbmT(N, 32, 3, R));
  for (let i = 0; i < n2; i++) H[i] = (g[i] - 0.5) * 0.4;
  for (let j = 0; j < 300; j++) addDimple(H, N, R() * N, R() * N, (2 + R() * 5) * k, -0.4);
  const map = rgbaCanvas(N, N, (i, o) => {
    const t = 0.85 + 0.3 * g[i], straw = sstep(0.6, 0.85, a[i]) * 0.4, blue = sstep(0.62, 0.88, b[i]) * 0.38;
    let r = 0.2 * t, gg = 0.19 * t, bb = 0.185 * t;
    r = lerp(r, 0.46, straw); gg = lerp(gg, 0.38, straw); bb = lerp(bb, 0.22, straw);
    r = lerp(r, 0.25, blue); gg = lerp(gg, 0.23, blue); bb = lerp(bb, 0.4, blue);
    o[0] = r; o[1] = gg; o[2] = bb;
  });
  const orm = rgbaCanvas(N, N, (i, o) => { o[0] = 1; o[1] = 0.42 + 0.16 * g[i]; o[2] = 0.75; });
  return { map, normal: normalFrom(H, N, 8 / k), orm };
}
// braided steel sleeve: two families of strands woven over and under
function braidMaps(N) {
  const H = new Float32Array(N * N), n = 4, wires = 4;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, pa = (u + v) * n, pb = (u - v + 1) * n, fa = pa - Math.floor(pa), fb = pb - Math.floor(pb);
    const over = (Math.floor(pa) + Math.floor(pb)) % 2 === 0;
    const f = over ? fa : fb, prof = Math.pow(Math.sin(Math.PI * f), 0.6) + 0.12 * Math.sin(Math.PI * ((f * wires) % 1));
    H[y * N + x] = prof * (over ? 1 : 0.7);
  }
  const map = rgbaCanvas(N, N, (i, o) => { const t = 0.55 + 0.6 * H[i]; o[0] = 0.21 * t; o[1] = 0.215 * t; o[2] = 0.23 * t; });
  const orm = rgbaCanvas(N, N, (i, o) => { o[0] = 1; o[1] = 0.62 - 0.22 * H[i]; o[2] = 0.75; });
  return { map, normal: normalFrom(H, N, 3), orm };
}
function rubberMaps(N, seed) {
  const R = prng(seed), g = stretch(fbmT(N, 32, 3, R)), blot = stretch(fbmT(N, 2, 3, R)), H = new Float32Array(N * N);
  for (let i = 0; i < H.length; i++) H[i] = g[i] * 0.2;
  const map = rgbaCanvas(N, N, (i, o) => { const t = 0.85 + 0.25 * blot[i] + 0.1 * g[i]; o[0] = 0.075 * t; o[1] = 0.074 * t; o[2] = 0.076 * t; });
  const orm = rgbaCanvas(N, N, (i, o) => { o[0] = 1; o[1] = 0.78 + 0.12 * g[i]; o[2] = 0; });
  return { map, normal: normalFrom(H, N, 2), orm };
}
// emissive gradients: discs (radial: hot red centre, dark red body, purple edge) and the cell (band along V)
function glowRadial(N = 256) {
  const c = canvas(N, N), x = c.getContext('2d'), g = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  g.addColorStop(0, '#ff7a6a'); g.addColorStop(0.22, '#c4202a'); g.addColorStop(0.55, '#6b0f12'); g.addColorStop(0.78, '#8a4dff'); g.addColorStop(0.9, '#3a1880'); g.addColorStop(1, '#000000');
  x.fillStyle = g; x.fillRect(0, 0, N, N); return c;
}
function glowBand(W = 128, H = 256) {
  const c = canvas(W, H), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#8a4dff'); g.addColorStop(0.14, '#6b0f12'); g.addColorStop(0.5, '#e0343c'); g.addColorStop(0.86, '#6b0f12'); g.addColorStop(1, '#8a4dff');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // faint filaments running along the cell
  const R = prng(5); x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) { const px = R() * W; x.strokeStyle = `rgba(255,120,110,${0.04 + R() * 0.1})`; x.lineWidth = 1 + R() * 2; x.beginPath(); x.moveTo(px, 0); for (let y = 0; y <= H; y += 16) x.lineTo(px + Math.sin(y * 0.05 + i) * 4, y); x.stroke(); }
  return c;
}

/* ------------------------------------------------------------------ face atlas */
// 4 x 4 cells of 256 x 192 px (4:3, the screen's shape); each face is a 32 x 24 grid of LEDs at 8 px.
// Cell i sits at column i % 4, row floor(i / 4) from the top-left. The screen mesh's UVs cover cell 0;
// another face shows by offsetting the emissive map by (col / 4, -row / 4).

const FACE_COLS = 4, FACE_ROWS = 4, FACE_CELL = [256, 192], FACE_GRID = [32, 24];
const FACES = ['neutral', 'neutral_blink', 'happy', 'happy_blink', 'worried', 'worried_blink', 'laughing_a', 'laughing_b',
  'sad', 'sad_blink', 'alert', 'alert_blink', 'talk_a', 'talk_b', 'focus', 'off'];
const FACE_INDEX = Object.fromEntries(FACES.map((f, i) => [f, i]));
const FACE_WARM = [255, 236, 204], FACE_RED = [255, 58, 44];
const FACE_DRAW = (() => {
  const EL = 10.5, ER = 21.5, EY = 9.5;
  const rr = (S, x, y, w, h, r) => { S.beginPath(); S.roundRect(x - w / 2, y - h / 2, w, h, r); S.fill(); };
  const line = (S, pts, lw = 1.35) => { S.lineWidth = lw; S.beginPath(); S.moveTo(...pts[0]); for (const p of pts.slice(1)) S.lineTo(...p); S.stroke(); };
  const quad = (S, a, c, b, lw = 1.35) => { S.lineWidth = lw; S.beginPath(); S.moveTo(...a); S.quadraticCurveTo(...c, ...b); S.stroke(); };
  const fillPath = (S, f) => { S.beginPath(); f(); S.fill(); };
  const eyes = (S, w = 3.2, h = 6, y = EY) => { rr(S, EL, y, w, h, 1.4); rr(S, ER, y, w, h, 1.4); };
  const lids = (S, y = EY + 1, w = 4.6) => { line(S, [[EL - w / 2, y], [EL + w / 2, y]], 1.4); line(S, [[ER - w / 2, y], [ER + w / 2, y]], 1.4); };
  const smile = (S, w = 9, d = 1.8, y = 16.4, lw = 1.35) => quad(S, [16 - w / 2, y], [16, y + d * 2], [16 + w / 2, y], lw);
  const frown = (S, w = 8, d = 1.6, y = 19, lw = 1.35) => quad(S, [16 - w / 2, y], [16, y - d * 2], [16 + w / 2, y], lw);
  const arcs = (S, y = EY + 1.4) => { quad(S, [EL - 2.7, y], [EL, y - 4.4], [EL + 2.7, y], 1.45); quad(S, [ER - 2.7, y], [ER, y - 4.4], [ER + 2.7, y], 1.45); };
  const worriedBrows = (S) => { line(S, [[EL - 2.9, 4.4], [EL + 2.5, 2.8]], 1.2); line(S, [[ER - 2.5, 2.8], [ER + 2.9, 4.4]], 1.2); };
  const wavy = (S) => { S.lineWidth = 1.25; S.beginPath(); S.moveTo(11.2, 18.4); S.quadraticCurveTo(12.8, 15.6, 14.4, 18); S.quadraticCurveTo(16, 20.4, 17.6, 18); S.quadraticCurveTo(19.2, 15.6, 20.8, 18.4); S.stroke(); };
  const alertBrows = (S) => { line(S, [[EL - 3, 2.6], [EL + 2.8, 4.6]], 1.35); line(S, [[ER - 2.8, 4.6], [ER + 3, 2.6]], 1.35); };
  const cut = (S, f) => { S.globalCompositeOperation = 'destination-out'; f(); S.globalCompositeOperation = 'source-over'; };
  return {
    neutral: (S) => { eyes(S); smile(S); },
    neutral_blink: (S) => { lids(S); smile(S); },
    happy: (S) => { for (const x of [EL, ER]) fillPath(S, () => { S.moveTo(x - 2, EY + 2.6); S.lineTo(x - 2, EY - 0.6); S.quadraticCurveTo(x, EY - 4.8, x + 2, EY - 0.6); S.lineTo(x + 2, EY + 2.6); S.quadraticCurveTo(x, EY + 0.2, x - 2, EY + 2.6); }); smile(S, 12, 2.6, 15.8, 1.5); },
    happy_blink: (S) => { arcs(S); smile(S, 12, 2.6, 15.8, 1.5); },
    worried: (S) => { eyes(S, 3, 5.2, EY + 0.9); worriedBrows(S); wavy(S); },
    worried_blink: (S) => { lids(S, EY + 1.7, 4.2); worriedBrows(S); wavy(S); },
    laughing_a: (S) => {
      line(S, [[EL - 2.4, EY - 2.4], [EL + 2, EY], [EL - 2.4, EY + 2.4]], 1.4); line(S, [[ER + 2.4, EY - 2.4], [ER - 2, EY], [ER + 2.4, EY + 2.4]], 1.4);
      fillPath(S, () => { S.moveTo(10.5, 15); S.lineTo(21.5, 15); S.quadraticCurveTo(16, 24.6, 10.5, 15); });
    },
    laughing_b: (S) => { arcs(S, EY + 1.2); fillPath(S, () => { S.moveTo(11.2, 15.4); S.lineTo(20.8, 15.4); S.quadraticCurveTo(16, 22.4, 11.2, 15.4); }); },
    sad: (S) => {
      eyes(S, 3.2, 5, EY + 1.4);
      cut(S, () => { fillPath(S, () => { S.moveTo(EL - 3.4, EY + 1.4); S.lineTo(EL + 2.2, EY - 1.8); S.lineTo(EL - 3.4, EY - 3); }); fillPath(S, () => { S.moveTo(ER + 3.4, EY + 1.4); S.lineTo(ER - 2.2, EY - 1.8); S.lineTo(ER + 3.4, EY - 3); }); });
      line(S, [[EL - 2.6, 5.2], [EL + 2.4, 4.0]], 1.1); line(S, [[ER - 2.4, 4.0], [ER + 2.6, 5.2]], 1.1);
      frown(S); rr(S, EL - 1.4, 15.8, 1, 1.8, 0.4);
    },
    sad_blink: (S) => { line(S, [[EL - 2.4, EY + 2.8], [EL + 2.2, EY + 1.8]], 1.35); line(S, [[ER - 2.2, EY + 1.8], [ER + 2.4, EY + 2.8]], 1.35); frown(S); },
    alert: (S) => { eyes(S, 4.4, 6.8, EY + 0.6); alertBrows(S); line(S, [[12.6, 18.2], [19.4, 18.2]], 1.4); },
    alert_blink: (S) => { lids(S, EY + 1.2, 5); alertBrows(S); line(S, [[12.6, 18.2], [19.4, 18.2]], 1.4); },
    talk_a: (S) => { eyes(S); fillPath(S, () => { S.ellipse(16, 17.8, 2.6, 2.1, 0, 0, 7); }); },
    talk_b: (S) => { eyes(S); fillPath(S, () => { S.moveTo(12.4, 16.4); S.lineTo(19.6, 16.4); S.quadraticCurveTo(16, 21.2, 12.4, 16.4); }); },
    focus: (S) => { rr(S, EL, EY + 0.6, 4.6, 2.6, 1); rr(S, ER, EY + 0.6, 4.6, 2.6, 1); line(S, [[EL - 2.6, 5.4], [EL + 2.6, 6.2]], 1.2); line(S, [[ER - 2.6, 6.2], [ER + 2.6, 5.4]], 1.2); quad(S, [12.6, 17.4], [16.6, 19.2], [19.8, 16.6], 1.3); },
    off: () => { },
  };
})();
function faceAtlas() {
  const [cw, ch] = FACE_CELL, [gw, gh] = FACE_GRID, pitch = cw / gw;
  const atlas = canvas(cw * FACE_COLS, ch * FACE_ROWS), A = atlas.getContext('2d');
  A.fillStyle = '#000'; A.fillRect(0, 0, atlas.width, atlas.height);
  const small = canvas(gw, gh), S = small.getContext('2d', { willReadFrequently: true });
  FACES.forEach((name, idx) => {
    S.clearRect(0, 0, gw, gh); S.fillStyle = S.strokeStyle = '#fff'; S.lineCap = 'round'; S.lineJoin = 'round';
    FACE_DRAW[name](S);
    const px = S.getImageData(0, 0, gw, gh).data, ox = (idx % FACE_COLS) * cw, oy = Math.floor(idx / FACE_COLS) * ch;
    const col = name.startsWith('alert') ? FACE_RED : FACE_WARM;
    A.save(); A.beginPath(); A.rect(ox, oy, cw, ch); A.clip();
    A.fillStyle = '#080605'; A.fillRect(ox, oy, cw, ch);
    const lit = [];
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const a = px[(j * gw + i) * 4 + 3] / 255, b = a < 0.2 ? 0 : a < 0.5 ? 0.42 : a < 0.78 ? 0.72 : 1;
      const x = ox + i * pitch, y = oy + j * pitch;
      if (!b) { A.fillStyle = 'rgb(27,21,17)'; A.beginPath(); A.roundRect(x + 1, y + 1, pitch - 2, pitch - 2, 1.6); A.fill(); continue; }
      A.fillStyle = `rgb(${col[0] * b | 0},${col[1] * b | 0},${col[2] * b | 0})`; A.beginPath(); A.roundRect(x + 0.8, y + 0.8, pitch - 1.6, pitch - 1.6, 1.8); A.fill();
      lit.push([x + pitch / 2, y + pitch / 2, b]);
    }
    // glow bleeding between lit pixels
    A.globalCompositeOperation = 'lighter';
    for (const [x, y, b] of lit) {
      const g = A.createRadialGradient(x, y, 0, x, y, pitch * 1.4);
      g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${0.16 * b})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      A.fillStyle = g; A.fillRect(x - pitch * 1.5, y - pitch * 1.5, pitch * 3, pitch * 3);
    }
    A.globalCompositeOperation = 'source-over';
    // soft vignette toward the bezel
    const v = A.createRadialGradient(ox + cw / 2, oy + ch / 2, ch * 0.35, ox + cw / 2, oy + ch / 2, cw * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)');
    A.fillStyle = v; A.fillRect(ox, oy, cw, ch);
    A.restore();
  });
  return atlas;
}
function faceOffset(name) { const i = FACE_INDEX[name] ?? 0; return [(i % FACE_COLS) / FACE_COLS, -Math.floor(i / FACE_COLS) / FACE_ROWS]; }

/* ------------------------------------------------------------------ the scratched "Nick" */
// A child's handwriting, scratched in with a nail: each stroke gone over two or three times, wobbly,
// letters of uneven size on a drifting baseline. Bright bare metal with a dark burr; alpha-tested decal.
function nickCanvas() {
  const W = 512, Hh = 224, c = canvas(W, Hh), x = c.getContext('2d'), R = prng(1207);
  const U = 108, X0 = 52, Y0 = 178;
  const letters = [
    { s: 1.0, at: [0, 0.02], rot: -0.07, strokes: [[[0, 0], [0.03, 1.02], [0.68, 0.06], [0.73, 1.08]]] },
    { s: 0.92, at: [0.98, 0.0], rot: 0.09, strokes: [[[0, 0], [0.03, 0.56]]], dot: [0.06, 0.86] },
    { s: 0.96, at: [1.28, -0.03], rot: 0.12, arc: [0.27, 0.3, 0.28, 0.32, 0.7, 5.75] },
    { s: 1.1, at: [1.98, 0.05], rot: -0.05, strokes: [[[0.0, -0.02], [-0.02, 1.06]], [[0.38, 0.64], [0.03, 0.33], [0.4, -0.03]]] },
  ];
  const wob = (p, a) => [p[0] + (R() - 0.5) * a, p[1] + (R() - 0.5) * a];
  const toPx = (L, p) => { const cs = Math.cos(L.rot), sn = Math.sin(L.rot), px = p[0] * L.s, py = p[1] * L.s; return [X0 + (L.at[0] + px * cs - py * sn) * U, Y0 - (L.at[1] + px * sn + py * cs) * U]; };
  const dense = (pts) => { const out = []; for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]], n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.06)); for (let k = 0; k < n; k++) out.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]); } out.push(pts[pts.length - 1]); return out; };
  const paths = [];
  for (const L of letters) {
    const strokes = (L.strokes || []).map(dense);
    if (L.arc) { const [cx, cy, rx, ry, a0, a1] = L.arc, pts = []; for (let k = 0; k <= 24; k++) { const a = lerp(a0, a1, k / 24); pts.push([cx + Math.cos(a) * rx * (1 + 0.08 * Math.sin(a * 3)), cy + Math.sin(a) * ry]); } strokes.push(pts); }
    if (L.dot) { const pts = []; for (let k = 0; k <= 10; k++) { const a = k / 10 * 6.6; pts.push([L.dot[0] + Math.cos(a) * 0.05, L.dot[1] + Math.sin(a) * 0.055]); } strokes.push(pts); }
    for (const s of strokes) paths.push(s.map((p) => toPx(L, p)));
  }
  const draw = (pts, dx, dy, a) => { x.beginPath(); pts.forEach((p, i) => { const q = wob(p, a); i ? x.lineTo(q[0] + dx, q[1] + dy) : x.moveTo(q[0] + dx, q[1] + dy); }); x.stroke(); };
  x.lineCap = 'round'; x.lineJoin = 'round';
  // dark burr and groove shadow under each scratch
  x.strokeStyle = 'rgba(14,11,9,0.9)'; x.lineWidth = 7;
  for (const p of paths) draw(p, 1.2, 1.8, 1.5);
  // the scratches: two or three passes with a nail, slightly off each other
  for (const p of paths) {
    const passes = 2 + (R() < 0.5 ? 1 : 0);
    for (let k = 0; k < passes; k++) { x.strokeStyle = `rgba(${236 - k * 14},${229 - k * 14},${216 - k * 14},${0.95 - k * 0.2})`; x.lineWidth = k ? 1.4 : 2.8; draw(p, (R() - 0.5) * 3, (R() - 0.5) * 3, 2.2); }
  }
  return c;
}

/* ------------------------------------------------------------------ materials */

const TX = {}, M = {};
function asTex(c, { srgb = false, jpeg = false, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  t.userData.mimeType = jpeg ? 'image/jpeg' : 'image/png';
  return t;
}
function texSet(name, maps) {
  const s = { map: asTex(maps.map, { srgb: true, jpeg: true }), normal: asTex(maps.normal), orm: asTex(maps.orm) };
  s.map.name = name + '_albedo'; s.normal.name = name + '_normal'; s.orm.name = name + '_orm';
  return s;
}
// PBR material on a texture set: colour, roughness and metalness factors multiply the maps
function pbr(name, set, tile, o = {}, ns = 1) {
  const m = new THREE.MeshStandardMaterial({ name, color: '#ffffff', roughness: 1, metalness: 1, map: set.map, normalMap: set.normal, roughnessMap: set.orm, metalnessMap: set.orm, ...o });
  m.normalScale.set(ns, ns); m.userData.tile = tile;
  return m;
}
function buildMaterials() {
  const t0 = performance.now();
  TX.iron = texSet('iron', ironMaps(1024, 11));
  TX.wear = texSet('wear', wearMaps(512, 23));
  TX.inner = texSet('inner', innerMaps(512, 37));
  TX.gunmetal = texSet('gunmetal', gunmetalMaps(512, 41));
  TX.stainless = texSet('stainless', stainlessMaps(512, 53));
  TX.weld = texSet('weld', weldMaps(256, 61));
  TX.braid = texSet('braid', braidMaps(256));
  TX.rubber = texSet('rubber', rubberMaps(256, 71));
  TX.faceAtlasCanvas = faceAtlas();
  TX.faceAtlas = asTex(TX.faceAtlasCanvas, { srgb: true, repeat: false }); TX.faceAtlas.name = 'face_atlas';
  TX.glowRadial = asTex(glowRadial(), { srgb: true, repeat: false }); TX.glowRadial.name = 'glow_radial';
  TX.glowBand = asTex(glowBand(), { srgb: true }); TX.glowBand.name = 'glow_band';
  TX.nickCanvas = nickCanvas();
  TX.nick = asTex(TX.nickCanvas, { srgb: true, repeat: false }); TX.nick.name = 'nick_scratch';

  M.iron = pbr('iron_plate', TX.iron, 0.3, {}, 1);
  M.rivet = pbr('rivet_iron', TX.iron, 0.08, { color: '#d6cec4' }, 0.8);
  M.wear = pbr('iron_wear', TX.wear, 0.3, {}, 0.7);
  M.inner = pbr('iron_inner', TX.inner, 0.25, {}, 0.8);
  M.gunmetal = pbr('gunmetal', TX.gunmetal, 0.15, {}, 0.6);
  M.chrome = pbr('piston_chrome', TX.stainless, 0.1, { color: '#f2f2f4', roughness: 0.42 }, 0.3);
  M.stainless = pbr('stainless_shroud', TX.stainless, 0.12, {}, 0.6);
  M.weld = pbr('weld_bead', TX.weld, 0.05, {}, 0.25);
  M.cable = pbr('cable_braid', TX.braid, 0.02, {}, 1);
  M.rubber = pbr('rubber', TX.rubber, 0.1, {}, 0.6);
  M.screen = new THREE.MeshStandardMaterial({ name: 'screen_face', color: '#0b0908', roughness: 0.7, metalness: 0, emissive: '#ffffff', emissiveMap: TX.faceAtlas, emissiveIntensity: 1.0 });
  M.glass = new THREE.MeshPhysicalMaterial({ name: 'screen_glass', color: '#14161c', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.18, clearcoat: 1, clearcoatRoughness: 0.04, depthWrite: false });
  M.core = new THREE.MeshStandardMaterial({ name: 'energy_core', color: '#1a0305', roughness: 0.35, metalness: 0, emissive: '#ffffff', emissiveMap: TX.glowBand, emissiveIntensity: 2.6 });
  M.rim = new THREE.MeshStandardMaterial({ name: 'energy_rim', color: '#120a22', roughness: 0.4, metalness: 0, emissive: '#8a4dff', emissiveIntensity: 1.8 });
  M.field = new THREE.MeshStandardMaterial({ name: 'nullfield_glow', color: '#1a0305', roughness: 0.4, metalness: 0, emissive: '#ffffff', emissiveMap: TX.glowRadial, emissiveIntensity: 1.2 });
  M.fieldRim = new THREE.MeshStandardMaterial({ name: 'nullfield_rim', color: '#120a22', roughness: 0.4, metalness: 0, emissive: '#8a4dff', emissiveIntensity: 0.9 });
  M.nick = new THREE.MeshStandardMaterial({ name: 'nick_scratch', map: TX.nick, alphaTest: 0.4, roughness: 0.32, metalness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const m of [M.screen, M.glass, M.core, M.rim, M.field, M.fieldRim, M.nick]) m.userData.tile = 0.1;
  M.screen.userData.rest = { emissive: '#ffffff', intensity: 1.0 };
  M.field.userData.rest = 1.2; M.fieldRim.userData.rest = 0.9; M.core.userData.rest = 2.6; M.rim.userData.rest = 1.8;
  return performance.now() - t0;
}

/* ------------------------------------------------------------------ geometry helpers */

// non-indexed copy with position + normal (+ uv when present)
function prepUV(g) {
  g = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  g.morphAttributes = {};
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
// box projection: each triangle takes the plane its face normal points at most; 1 UV = tile metres
function boxUV(g, tile = 0.3, off = [0, 0]) {
  g = prepUV(g);
  const p = g.attributes.position.array, uv = new Float32Array(p.length / 3 * 2);
  for (let i = 0; i < p.length; i += 9) {
    const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2], vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, X = Math.abs(nx), Y = Math.abs(ny), Z = Math.abs(nz);
    for (let k = 0; k < 3; k++) {
      const x = p[i + k * 3], y = p[i + k * 3 + 1], z = p[i + k * 3 + 2]; let u, w;
      if (X >= Y && X >= Z) { u = nx > 0 ? -z : z; w = y; } else if (Y >= Z) { u = x; w = ny > 0 ? -z : z; } else { u = nz > 0 ? x : -x; w = y; }
      const o = (i / 3 + k) * 2; uv[o] = u / tile + off[0]; uv[o + 1] = w / tile + off[1];
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
function nameOffset(name) { let h = 2166136261; for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619); return [((h >>> 0) % 997) / 997, ((h >>> 10) % 991) / 991]; }
// merge geometries; any without UVs gets box UVs at this tile size first
function mergeUV(list, tile = 0.3) {
  const gs = list.filter(Boolean).map((g) => prepUV(g)), anyUV = gs.some((g) => g.attributes.uv);
  return mergeGeometries(gs.map((g) => (anyUV && !g.attributes.uv) ? boxUV(g, tile) : g));
}
// mirror across x = 0, keeping faces outward
function mirrorX(g) {
  g = prepUV(g); g.scale(-1, 1, 1);
  for (const k of Object.keys(g.attributes)) {
    const a = g.attributes[k].array, n = g.attributes[k].itemSize;
    for (let i = 0; i < a.length; i += 3 * n) for (let j = 0; j < n; j++) { const t = a[i + n + j]; a[i + n + j] = a[i + 2 * n + j]; a[i + 2 * n + j] = t; }
    g.attributes[k].needsUpdate = true;
  }
  return g;
}
// rotate a geometry so its local axis `from` points along `to` (both vectors)
function orient(g, from, to) { return g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize())); }
function latheY(pts, seg = 32) { return new THREE.LatheGeometry(pts.map(([y, r]) => new THREE.Vector2(Math.max(0, r), y)), seg); }
const rect = (x0, x1, y0, y1, r) => roundedShape([[x0, y0, r], [x1, y0, r], [x1, y1, r], [x0, y1, r]]);

// closed winding check: flip the triangles if the signed volume is negative (faces pointing in)
function outward(g) {
  const p = g.attributes.position, idx = g.index ? g.index.array : null, n = idx ? idx.length : p.count;
  let vol = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(p, idx ? idx[i] : i); b.fromBufferAttribute(p, idx ? idx[i + 1] : i + 1); c.fromBufferAttribute(p, idx ? idx[i + 2] : i + 2);
    vol += a.dot(b.cross(c));
  }
  if (vol < 0) {
    if (idx) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.index.needsUpdate = true; }
    else { const a2 = p.array; for (let i = 0; i < a2.length; i += 9) for (let j = 0; j < 3; j++) { const t = a2[i + 3 + j]; a2[i + 3 + j] = a2[i + 6 + j]; a2[i + 6 + j] = t; } p.needsUpdate = true; }
  }
  g.computeVertexNormals();
  return g;
}

// Superellipse loft along an axis. Stations: [s, a, b, n, o1, o2] (s along the axis, sorted ascending):
//   axis 'y': a = half width in x, b = half depth in z, o1/o2 = x/z offsets
//   axis 'x': a = half height in y, b = half depth in z, o1/o2 = y/z offsets
//   axis 'z': a = half width in x, b = half height in y, o1/o2 = x/y offsets
// n: 2 = ellipse, higher = squarer. Values between stations follow a monotone cubic. roundStart/roundEnd
// roll the ends over by that radius; ends are capped flat.
function sLoft(st, { axis = 'y', seg = 48, steps = 48, roundStart = 0, roundEnd = 0, cap = true } = {}) {
  const S = st.map((r) => r[0]), s0 = S[0], s1 = S[S.length - 1];
  const f = [1, 2, 3, 4, 5].map((i) => curve(st.map((r) => [r[0], r[i] ?? (i === 3 ? 2.5 : 0)])));
  const pos = [], idx = [], ss = [];
  for (let i = 0; i <= steps; i++) { const u = i / steps, e = 0.5 - 0.5 * Math.cos(Math.PI * u); ss.push(s0 + (s1 - s0) * (0.5 * u + 0.5 * e)); }
  const put = (s, l1, l2) => { if (axis === 'y') pos.push(l1, s, l2); else if (axis === 'x') pos.push(s, l1, l2); else pos.push(l1, l2, s); };
  for (const s of ss) {
    let a = f[0](s), b = f[1](s); const n = f[2](s), o1 = f[3](s), o2 = f[4](s);
    let inset = 0; const ds = s - s0, de = s1 - s;
    if (roundStart > 0 && ds < roundStart) inset = Math.max(inset, roundStart - Math.sqrt(Math.max(0, roundStart ** 2 - (roundStart - ds) ** 2)));
    if (roundEnd > 0 && de < roundEnd) inset = Math.max(inset, roundEnd - Math.sqrt(Math.max(0, roundEnd ** 2 - (roundEnd - de) ** 2)));
    a = Math.max(0.0015, a - inset); b = Math.max(0.0015, b - inset);
    const e = 2 / n;
    for (let j = 0; j < seg; j++) {
      const t = j / seg * Math.PI * 2, c = Math.cos(t), si = Math.sin(t);
      put(s, o1 + a * Math.sign(c) * Math.pow(Math.abs(c), e), o2 + b * Math.sign(si) * Math.pow(Math.abs(si), e));
    }
  }
  for (let i = 0; i < ss.length - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, b = i * seg + (j + 1) % seg, c = (i + 1) * seg + j, d = (i + 1) * seg + (j + 1) % seg;
    idx.push(a, c, b, b, c, d);
  }
  if (cap) for (const [ri, flip] of [[0, true], [ss.length - 1, false]]) {
    const base = pos.length / 3, s = ss[ri];
    put(s, f[3](s), f[4](s));
    for (let j = 0; j < seg; j++) { const a = ri * seg + j, b = ri * seg + (j + 1) % seg; flip ? idx.push(base, a, b) : idx.push(base, b, a); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return outward(g);
}

// Plate: outline shape in XY, thickness t from z = 0 (back) to z = t (face), the outline kept exact
// (the bevel eats inward). bendY / bendX wrap it around a cylinder of that radius about Y / X whose axis
// lies behind the plate (positive: the face is convex, like armour on a torso). geo.userData.surf(x, y, h)
// returns { p, n } of the bent face at plate coordinates (x, y), h above the back (default t).
function plate(shape, t, { bevel = 0.0025, segs = 0, bendY = 0, bendX = 0, tess = 0.02, curveSegments = 10, crease = 44 } = {}) {
  const bv = Math.min(bevel, t * 0.45);
  segs = segs || Math.max(2, Math.ceil(bv / 0.0025));
  let g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.0004, t - 2 * bv), bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv * 0.9, bevelOffset: -bv * 0.9, bevelSegments: segs, curveSegments });
  g.translate(0, 0, bv); g.deleteAttribute('uv');
  const bend = (x, y, z) => {
    let X = x, Y = y, Z = z;
    if (bendY) { const a = X / bendY, r = bendY + Z; X = r * Math.sin(a); Z = r * Math.cos(a) - bendY; }
    if (bendX) { const a = Y / bendX, r = bendX + Z; Y = r * Math.sin(a); Z = r * Math.cos(a) - bendX; }
    return [X, Y, Z];
  };
  if (bendY || bendX) {
    g = new TessellateModifier(tess, 8).modify(g.toNonIndexed());
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) { const q = bend(p[i], p[i + 1], p[i + 2]); p[i] = q[0]; p[i + 1] = q[1]; p[i + 2] = q[2]; }
    g.deleteAttribute('normal');
  }
  g = creased(g, crease);
  g.userData.surf = (x, y, h = t) => {
    const p = V3(...bend(x, y, h)), px = V3(...bend(x + 1e-4, y, h)).sub(p), py = V3(...bend(x, y + 1e-4, h)).sub(p);
    return { p, n: px.cross(py).normalize() };
  };
  return g;
}

// domed rivet head built along +Y, underside at y = 0
const _rivetCache = new Map();
function rivetHead(r, seg = 12) {
  const key = r + ':' + seg;
  if (!_rivetCache.has(key)) _rivetCache.set(key, latheY([[0, 0], [0, r], [r * 0.12, r], [r * 0.36, r * 0.93], [r * 0.56, r * 0.78], [r * 0.7, r * 0.52], [r * 0.76, r * 0.22], [r * 0.77, 0]], seg));
  return _rivetCache.get(key).clone();
}
// rivets at [{ p, n }] (or [p, n] pairs): hand-set, so each sits a little squashed and tilted
function rivets(list, r = 0.0045, seed = 1) {
  const R = prng(seed), out = [];
  for (const it of list) {
    const p = it.p || it[0], n = (it.n || it[1]).clone().normalize(), g = rivetHead(r * (0.94 + R() * 0.12));
    g.scale(1, 0.85 + R() * 0.25, 1);
    g.rotateY(R() * 6.283); g.rotateX((R() - 0.5) * 0.12); g.rotateZ((R() - 0.5) * 0.12);
    orient(g, V3(0, 1, 0), n); g.translate(p.x - n.x * 0.0005, p.y - n.y * 0.0005, p.z - n.z * 0.0005);
    out.push(g);
  }
  return mergeUV(out);
}
// rivets along a straight line a -> b on a surface with this normal (n can be a function of the point)
function rivetLine(a, b, count, n, r, seed) {
  const list = []; for (let i = 0; i < count; i++) { const p = a.clone().lerp(b, count === 1 ? 0.5 : i / (count - 1)); list.push({ p, n: typeof n === 'function' ? n(p) : n }); }
  return rivets(list, r, seed);
}
// rivets on a plate made by plate(): pts are [x, y] in plate coordinates
function rivetsOn(plateGeo, pts, r, seed) { return rivets(pts.map(([x, y]) => plateGeo.userData.surf(x, y)), r, seed); }

// Weld bead along a path (V3 points, 2+), sitting on surfaces with the given normal (a V3, an array per
// point, or a function of s in 0..1). A flattened half-round with crescent ripples every `pitch`, hand-laid
// width wobble and cratered ends; its base sinks slightly into the surface. Material: M.weld.
function weld(points, normals, { w = 0.009, h = 0.0022, pitch = 0.0036, ripple = 0.14, seg = 12, seed = 1 } = {}) {
  const crv = points.length > 2 ? new THREE.CatmullRomCurve3(points.map((p) => p.clone()), false, 'centripetal') : new THREE.LineCurve3(points[0].clone(), points[1].clone());
  const L = crv.getLength(), n = Math.max(4, Math.ceil(L / (pitch / 5))), R = prng(seed), ph1 = R() * 6.28, ph2 = R() * 6.28;
  const nrm = (s) => {
    if (typeof normals === 'function') return normals(s).clone();
    if (Array.isArray(normals)) { const f = s * (normals.length - 1), i = Math.min(normals.length - 2, Math.floor(f)); return normals[i].clone().lerp(normals[i + 1], f - i).normalize(); }
    return normals.clone();
  };
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n, d = s * L, P = crv.getPointAt(s), T = crv.getTangentAt(s);
    const N = nrm(s); N.addScaledVector(T, -N.dot(T)).normalize(); const B = new THREE.Vector3().crossVectors(T, N);
    const taper = Math.sqrt(sstep(0, 0.006, d) * sstep(0, 0.006, L - d)), ww = w * (0.92 + 0.08 * Math.sin(d * 130 + ph1) + 0.06 * Math.sin(d * 57 + ph2));
    for (let j = 0; j <= seg; j++) {
      const th = Math.PI * j / seg, lat = Math.cos(th), up = Math.sin(th), ph = d / pitch + 1.5 * lat * lat, fr = ph - Math.floor(ph);
      const hh = h * taper * Math.pow(up, 0.55) * (1 + ripple * (sstep(0, 0.25, fr) * (1 - sstep(0.25, 1, fr)) * 2 - 0.5)) - 0.0004, lw = lat * ww / 2 * (0.35 + 0.65 * taper);
      pos.push(P.x + B.x * lw + N.x * hh, P.y + B.y * lw + N.y * hh, P.z + B.z * lw + N.z * hh);
      uv.push(d / 0.05, j / seg * 0.3);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + 1, c = a + seg + 1, e = c + 1; idx.push(a, b, c, b, e, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  // the crown must face away from the surface
  const mid = Math.floor(n / 2) * (seg + 1) + Math.floor(seg / 2), nn = V3().fromBufferAttribute(g.attributes.normal, mid);
  if (nn.dot(nrm(0.5)) < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}
// weld along plate coordinates of a plate() geometry, sitting on its face
function weldOn(plateGeo, pts, opts) { const s = pts.map(([x, y]) => plateGeo.userData.surf(x, y)); return weld(s.map((q) => q.p), s.map((q) => q.n), opts); }

// Cable through points (V3): braided sleeve, UVs along the length so the braid wraps. Material: M.cable.
function cable(points, r = 0.005, { seg = 10, tile = 0.02, tension = 0.5 } = {}) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => p.clone()), false, 'catmullrom', tension), L = c.getLength();
  const g = new THREE.TubeGeometry(c, Math.max(4, Math.ceil(L / 0.006)), r, seg, false);
  const uv = g.attributes.uv.array, k = Math.max(1, Math.round(2 * Math.PI * r / tile));
  for (let i = 0; i < uv.length; i += 2) { uv[i] = uv[i] * L / tile; uv[i + 1] = uv[i + 1] * k; }
  return g;
}
// several cables twisted around one path; twist in turns per metre
function cableBundle(points, { n = 3, r = 0.004, twist = 6, gap = 1.06, seg = 8, tile = 0.02 } = {}) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => p.clone())), L = c.getLength(), steps = Math.max(8, Math.ceil(L / 0.005));
  const fr = c.computeFrenetFrames(steps, false), R0 = n === 1 ? 0 : r * gap / Math.sin(Math.PI / n), out = [];
  for (let k = 0; k < n; k++) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const s = i / steps, a = 2 * Math.PI * (k / n + twist * s * L), P = c.getPointAt(s);
      pts.push(P.addScaledVector(fr.normals[i], Math.cos(a) * R0).addScaledVector(fr.binormals[i], Math.sin(a) * R0));
    }
    out.push(cable(pts, r, { seg, tile, tension: 0.5 }));
  }
  return mergeUV(out);
}
// metal ferrules where a cable (or bundle of outer radius r) enters a part, at both ends of the path
function cableEnds(points, r, len = 0.014) {
  const out = [];
  for (const [p, q] of [[points[0], points[1]], [points[points.length - 1], points[points.length - 2]]]) {
    const dir = q.clone().sub(p).normalize(), g = latheY([[0, r * 1.45], [len * 0.25, r * 1.5], [len * 0.3, r * 1.3], [len, r * 1.18], [len, 0]], 20);
    g.translate(0, -len * 0.3, 0); orient(g, V3(0, 1, 0), dir); g.translate(p.x, p.y, p.z); out.push(g);
  }
  return mergeUV(out);
}

// Hydraulic piston parts along +Y for anchors d0 apart: { body, rod, eyes } (gunmetal, chrome, gunmetal).
// The body runs from its eye at y = 0; the rod is built from its own eye at y = 0 (it lives on the other node).
function pistonGeos(d0, r = 0.011) {
  const Lc = d0 * 0.6, Lr = d0 * 0.62, rr = r * 0.52;
  const body = latheY([[0.6 * r, 0], [0.6 * r, r * 0.75], [0.6 * r + 0.004, r], [Lc * 0.35, r], [Lc * 0.35 + 0.0015, r * 0.92], [Lc * 0.35 + 0.0035, r * 0.92], [Lc * 0.35 + 0.005, r], [Lc - 0.005, r], [Lc - 0.002, r * 0.9], [Lc, rr * 1.35], [Lc + 0.004, rr * 1.25], [Lc + 0.004, 0]], 24);
  const port = new THREE.CylinderGeometry(r * 0.32, r * 0.36, r * 0.9, 12).rotateZ(Math.PI / 2).translate(r * 0.95, Lc * 0.22, 0);
  const rod = new THREE.CylinderGeometry(rr, rr, Lr, 18).translate(0, Lr / 2 + 0.6 * r, 0);
  const eye = () => mergeUV([new THREE.CylinderGeometry(r * 0.75, r * 0.75, r * 1.5, 18).rotateZ(Math.PI / 2), new THREE.CylinderGeometry(r * 0.32, r * 0.32, r * 1.9, 12).rotateZ(Math.PI / 2)]);
  return { body: mergeUV([body, port]), rod, eyeA: eye(), eyeB: eye() };
}
// Rotary joint actuator around the X axis, centred on the origin: radius r, width w.
// { housing (gunmetal), cap (iron), bolts (rivet) }. Rotate it for other axes.
function rotary(r, w, { bolts = 6, ribs = 3 } = {}) {
  const h = w / 2, pts = [[-h, 0], [-h, r * 0.55], [-h + 0.002, r * 0.6], [-h + 0.003, r * 0.86], [-h + 0.006, r * 0.95], [-h + 0.009, r]];
  for (let i = 0; i < ribs; i++) { const x = lerp(-h + 0.012, h - 0.012, (i + 0.5) / ribs); pts.push([x - 0.0025, r], [x - 0.0015, r * 0.94], [x + 0.0015, r * 0.94], [x + 0.0025, r]); }
  pts.push([h - 0.009, r], [h - 0.006, r * 0.95], [h - 0.003, r * 0.86], [h - 0.002, r * 0.6], [h, r * 0.55], [h, 0]);
  const housing = latheX(pts, 40);
  const cap = mergeUV([latheX([[h - 0.001, 0], [h - 0.001, r * 0.58], [h + 0.003, r * 0.56], [h + 0.005, r * 0.42], [h + 0.005, 0]], 32), mirrorX(latheX([[h - 0.001, 0], [h - 0.001, r * 0.58], [h + 0.003, r * 0.56], [h + 0.005, r * 0.42], [h + 0.005, 0]], 32))]);
  const bl = []; for (const sx of [1, -1]) for (let i = 0; i < bolts; i++) { const a = i / bolts * Math.PI * 2 + 0.3; bl.push({ p: V3(sx * (h + 0.003), Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72), n: V3(sx, 0, 0) }); }
  return { housing, cap, bolts: rivets(bl, Math.min(0.004, r * 0.11), 9) };
}

// UVs for the face screen: geometry in a plane facing +Z, the screen rectangle centred at (cx, cy), w x h.
// Points outside the rectangle (bevels) clamp to its edge.
function screenUV(g, cx, cy, w, h) {
  g = prepUV(g);
  const p = g.attributes.position.array, uv = new Float32Array(p.length / 3 * 2);
  for (let i = 0, j = 0; i < p.length; i += 3, j += 2) {
    const u = clamp01((p[i] - (cx - w / 2)) / w), v = clamp01((p[i + 1] - (cy - h / 2)) / h);
    uv[j] = (0.002 + u * 0.996) / FACE_COLS; uv[j + 1] = 1 - 1 / FACE_ROWS + (0.002 + v * 0.996) / FACE_ROWS;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// planar UVs for a glow disc of radius R centred on the origin, facing along n (for TX.glowRadial)
function discUV(g, n, R) {
  g = prepUV(g);
  const N = n.clone().normalize(), T = Math.abs(N.y) < 0.9 ? V3(0, 1, 0).cross(N).normalize() : V3(1, 0, 0).cross(N).normalize(), B = N.clone().cross(T);
  const p = g.attributes.position.array, uv = new Float32Array(p.length / 3 * 2), q = new THREE.Vector3();
  for (let i = 0, j = 0; i < p.length; i += 3, j += 2) { q.set(p[i], p[i + 1], p[i + 2]); uv[j] = 0.5 + q.dot(T) / (2 * R); uv[j + 1] = 0.5 + q.dot(B) / (2 * R); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// the "Nick" decal: a plane facing +Z, w wide, centred on the origin. Material: M.nick.
function nickDecal(w = 0.04) { const g = new THREE.PlaneGeometry(w, w * 224 / 512); return g; }

// Edge wear and crevices from curvature, as material groups that survive export: triangles on sharp
// convex edges (curvature above k rad/m, i.e. radius below 1/k) go to the wear material, broken up by
// noise so the edges look chipped; triangles in tight concave creases go to the crevice material.
function hash3(x, y, z) { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t, h = (i, j, k) => hash3(ix + i, iy + j, iz + k);
  return l(l(l(h(0, 0, 0), h(1, 0, 0), sx), l(h(0, 1, 0), h(1, 1, 0), sx), sy), l(l(h(0, 0, 1), h(1, 0, 1), sx), l(h(0, 1, 1), h(1, 1, 1), sx), sy), sz);
}
function wearSplit(geo, { k = 110, kIn = 110, chip = 0.32, freq = 60, inner = true } = {}) {
  const g = prepUV(geo), P = g.attributes.position.array, nt = P.length / 9;
  const fn = new Float32Array(nt * 3), fc = new Float32Array(nt * 3), cvx = new Float32Array(nt), ccv = new Float32Array(nt);
  for (let t = 0; t < nt; t++) {
    const o = t * 9, ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2], vx = P[o + 6] - P[o], vy = P[o + 7] - P[o + 1], vz = P[o + 8] - P[o + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
    fn[t * 3] = nx / l; fn[t * 3 + 1] = ny / l; fn[t * 3 + 2] = nz / l;
    fc[t * 3] = (P[o] + P[o + 3] + P[o + 6]) / 3; fc[t * 3 + 1] = (P[o + 1] + P[o + 4] + P[o + 7]) / 3; fc[t * 3 + 2] = (P[o + 2] + P[o + 5] + P[o + 8]) / 3;
  }
  const ids = new Int32Array(nt * 3), weldMap = new Map(); let nid = 0;
  for (let v = 0; v < nt * 3; v++) {
    const key = Math.round(P[v * 3] * 2e4) + ',' + Math.round(P[v * 3 + 1] * 2e4) + ',' + Math.round(P[v * 3 + 2] * 2e4);
    let id = weldMap.get(key); if (id === undefined) { id = nid++; weldMap.set(key, id); } ids[v] = id;
  }
  const edges = new Map();
  for (let t = 0; t < nt; t++) for (let e = 0; e < 3; e++) {
    const a = ids[t * 3 + e], b = ids[t * 3 + (e + 1) % 3]; if (a === b) continue;
    const key = a < b ? a * nid + b : b * nid + a, u = edges.get(key);
    if (u === undefined) { edges.set(key, t); continue; }
    if (u < 0) continue;
    edges.set(key, -1);
    const d = fn[u * 3] * fn[t * 3] + fn[u * 3 + 1] * fn[t * 3 + 1] + fn[u * 3 + 2] * fn[t * 3 + 2], ang = Math.acos(clampR(d, -1, 1));
    if (ang < 0.03) continue;
    const dx = fc[t * 3] - fc[u * 3], dy = fc[t * 3 + 1] - fc[u * 3 + 1], dz = fc[t * 3 + 2] - fc[u * 3 + 2], dist = Math.max(1e-4, Math.hypot(dx, dy, dz));
    const side = dx * fn[u * 3] + dy * fn[u * 3 + 1] + dz * fn[u * 3 + 2] - (dx * fn[t * 3] + dy * fn[t * 3 + 1] + dz * fn[t * 3 + 2]), kk = ang / dist;
    if (side < 0) { cvx[t] = Math.max(cvx[t], kk); cvx[u] = Math.max(cvx[u], kk); } else { ccv[t] = Math.max(ccv[t], kk); ccv[u] = Math.max(ccv[u], kk); }
  }
  // quad partners: the neighbour across each triangle's longest edge, when that edge is its longest too
  const longest = new Float64Array(nt), partner = new Int32Array(nt).fill(-1), byEdge = new Map();
  for (let t = 0; t < nt; t++) {
    let best = -1, bl = -1;
    for (let e = 0; e < 3; e++) { const a = t * 9 + e * 3, b = t * 9 + ((e + 1) % 3) * 3, l = (P[a] - P[b]) ** 2 + (P[a + 1] - P[b + 1]) ** 2 + (P[a + 2] - P[b + 2]) ** 2; if (l > bl) { bl = l; best = e; } }
    const a = ids[t * 3 + best], b = ids[t * 3 + (best + 1) % 3], key = a < b ? a * nid + b : b * nid + a, u = byEdge.get(key);
    if (u === undefined) byEdge.set(key, t); else { partner[t] = u; partner[u] = t; }
    longest[t] = bl;
  }
  for (let t = 0; t < nt; t++) { const u = partner[t]; if (u > t) { const c = Math.max(cvx[t], cvx[u]), d = Math.max(ccv[t], ccv[u]); cvx[t] = cvx[u] = c; ccv[t] = ccv[u] = d; fc[u * 3] = fc[t * 3]; fc[u * 3 + 1] = fc[t * 3 + 1]; fc[u * 3 + 2] = fc[t * 3 + 2]; } }
  const cls = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) {
    const x = fc[t * 3] * freq, y = fc[t * 3 + 1] * freq, z = fc[t * 3 + 2] * freq, nz = 0.65 * noise3(x, y, z) + 0.35 * noise3(x * 3.1 + 7, y * 3.1, z * 3.1);
    if (cvx[t] > k && nz > chip) cls[t] = 1; else if (inner && ccv[t] > kIn) cls[t] = 2;
  }
  const out = [null, null, null];
  for (let c = 0; c < 3; c++) {
    let cnt = 0; for (let t = 0; t < nt; t++) if (cls[t] === c) cnt++;
    if (!cnt) continue;
    const ng = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) {
      const n = attr.itemSize, src = attr.array, dst = new Float32Array(cnt * 3 * n); let w = 0;
      for (let t = 0; t < nt; t++) if (cls[t] === c) { dst.set(src.subarray(t * 3 * n, t * 3 * n + 3 * n), w); w += 3 * n; }
      ng.setAttribute(name, new THREE.BufferAttribute(dst, n));
    }
    out[c] = ng;
  }
  return { base: out[0], wear: out[1], inner: out[2] };
}

/* ------------------------------------------------------------------ rig */

function buildRig() {
  const root = new THREE.Group(); root.name = 'n1ck';
  const bones = {};
  for (const n of BONE_NAMES) {
    const g = new THREE.Group(); g.name = n; bones[n] = g;
    const p = PARENT[n]; (p ? bones[p] : root).add(g);
    g.position.copy(J[n]); if (p) g.position.sub(J[p]);
  }
  // face channel for clips: position.x = face atlas cell, .y = alarm tint (0 warm, 1 red), .z = nullfield glow 0..1
  const faceCtrl = new THREE.Group(); faceCtrl.name = 'face_ctrl'; root.add(faceCtrl);
  return { root, bones, faceCtrl, pistons: [] };
}

// mesh(es) on a bone (or any node of the rig). world = the geometry is modelled in rest-pose world space.
function addTo(rig, node, geo, mat, name, opts = {}, world = false) {
  const b = typeof node === 'string' ? rig.bones[node] : node;
  if (!b) throw new Error('addTo: no bone ' + node);
  if (!mat) throw new Error('addTo: no material for ' + name);
  let g = prepUV(geo);
  if (world) {
    rig.root.updateMatrixWorld(true);
    const m = new THREE.Matrix4().copy(rig.root.matrixWorld).invert().multiply(b.matrixWorld).invert();
    g.applyMatrix4(m);
  }
  if (!g.attributes.uv) g = boxUV(g, mat.userData.tile || 0.3, nameOffset(name));
  const out = [];
  const make = (gg, mm, nn) => { const m = new THREE.Mesh(gg, mm); m.name = nn; m.castShadow = opts.cast !== false; m.receiveShadow = opts.receive !== false; b.add(m); out.push(m); };
  if (opts.wear) {
    const w = wearSplit(g, opts.wear === true ? {} : opts.wear);
    if (w.base) make(w.base, mat, name);
    if (w.wear) make(w.wear, opts.wearMat || M.wear, name + '_wear');
    if (w.inner) make(w.inner, opts.innerMat || M.inner, name + '_inner');
  } else make(g, mat, name);
  return out[0];
}

// Piston between two bones: the body hangs on boneA at pa, the rod on boneB at pb (rest-pose world
// points). Nodes pist_<name>_a / _b aim at each other after every pose (solveConstraints).
function addPiston(rig, name, boneA, pa, boneB, pb, { r = 0.011 } = {}) {
  const A = rig.bones[boneA], B = rig.bones[boneB];
  const na = new THREE.Group(), nb = new THREE.Group(); na.name = `pist_${name}_a`; nb.name = `pist_${name}_b`;
  na.position.copy(pa).sub(J[boneA]); nb.position.copy(pb).sub(J[boneB]); A.add(na); B.add(nb);
  const d0 = pa.distanceTo(pb), G = pistonGeos(d0, r);
  const ra = { dir: pb.clone().sub(pa).normalize() }, rb = { dir: pa.clone().sub(pb).normalize() };
  ra.q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), ra.dir); rb.q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), rb.dir);
  na.quaternion.copy(ra.q); nb.quaternion.copy(rb.q);
  addTo(rig, na, G.body, M.gunmetal, `pist_${name}_body`); addTo(rig, na, G.eyeA, M.gunmetal, `pist_${name}_eye_a`);
  addTo(rig, nb, G.rod, M.chrome, `pist_${name}_rod`); addTo(rig, nb, G.eyeB, M.gunmetal, `pist_${name}_eye_b`);
  const p = { name, a: na, b: nb, restA: ra, restB: rb, d0 };
  rig.pistons.push(p);
  return p;
}
const _qa = new THREE.Quaternion(), _va = new THREE.Vector3();
function solveConstraints(rig) {
  if (!rig.pistons.length) return;
  rig.root.updateMatrixWorld(true);
  for (const p of rig.pistons) for (const [self, other, rest] of [[p.a, p.b, p.restA], [p.b, p.a, p.restB]]) {
    other.getWorldPosition(_va); self.parent.worldToLocal(_va);
    const dir = _va.sub(self.position).normalize();
    self.quaternion.copy(_qa.setFromUnitVectors(rest.dir, dir)).multiply(rest.q);
    self.updateMatrixWorld(true);
  }
}

/* ------------------------------------------------------------------ blockouts */
// Plain stand-ins with the right proportions, used until (or when) a part builder fails.

const BLOCKOUT = {};
const TORSO_ST = [   // y, half width, half depth, exponent, z centre
  [0.86, 0.09, 0.075, 2.4, 0.0], [0.92, 0.15, 0.1, 2.6, -0.006], [0.99, 0.163, 0.108, 2.7, -0.008], [1.06, 0.145, 0.098, 2.6, -0.006],
  [1.13, 0.134, 0.094, 2.6, -0.004], [1.24, 0.152, 0.108, 2.7, -0.004], [1.37, 0.17, 0.12, 2.9, -0.006], [1.46, 0.168, 0.116, 3.0, -0.01],
  [1.52, 0.13, 0.095, 3.0, -0.016], [1.555, 0.075, 0.062, 2.6, -0.02],
];
function torsoStations(y0, y1) {
  const f = [1, 2, 3, 4].map((i) => curve(TORSO_ST.map((r) => [r[0], r[i]])));
  const ys = [y0, ...TORSO_ST.map((r) => r[0]).filter((y) => y > y0 + 0.005 && y < y1 - 0.005), y1];
  return ys.map((y) => [y, f[0](y), f[1](y), f[2](y), 0, f[3](y)]);
}
BLOCKOUT.torso = (K) => {
  const { M, D } = K;
  K.addW('hips', sLoft(torsoStations(0.86, 1.07), { roundStart: 0.03 }), M.iron, 'pelvis_shell', { wear: true });
  K.addW('spine', sLoft(torsoStations(1.05, 1.21)), M.inner, 'abdomen_core');
  K.addW('chest', sLoft(torsoStations(1.19, 1.35)), M.iron, 'chest_shell', { wear: true });
  K.addW('upper_chest', sLoft(torsoStations(1.33, 1.555), { roundEnd: 0.02 }), M.iron, 'upper_chest_shell', { wear: true });
  // power cell low on the back in an open stainless shroud
  const c = D.cell;
  K.addW('spine', new THREE.CylinderGeometry(c.r * 0.8, c.r * 0.8, c.h, 24).translate(0, c.y, c.z), M.core, 'cell_core', { cast: false });
  const cage = [new THREE.TorusGeometry(c.r * 1.3, 0.005, 8, 36).rotateX(Math.PI / 2).translate(0, c.y + c.h / 2, c.z), new THREE.TorusGeometry(c.r * 1.3, 0.005, 8, 36).rotateX(Math.PI / 2).translate(0, c.y - c.h / 2, c.z)];
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cage.push(new THREE.CylinderGeometry(0.0042, 0.0042, c.h, 8).translate(Math.cos(a) * c.r * 1.3, c.y, c.z + Math.sin(a) * c.r * 1.3)); }
  K.addW('spine', mergeUV(cage), M.stainless, 'cell_shroud');
  K.addW('spine', box(-0.045, 0.045, c.y - 0.06, c.y + 0.06, c.z + 0.012, c.z + 0.04), M.gunmetal, 'cell_mount');
  // Nullfield emitters on the upper back
  for (const s of [1, -1]) {
    const e = D.emitter, n = V3(s * e.normal[0], e.normal[1], e.normal[2]).normalize(), p = V3(s * e.x, e.y, e.z);
    const put = (g) => orient(g, V3(0, 1, 0), n).translate(p.x, p.y, p.z);
    K.addW('upper_chest', put(new THREE.CylinderGeometry(e.r * 0.92, e.r * 1.05, 0.014, 32).translate(0, 0.004, 0)), M.gunmetal, `emitter_${s > 0 ? 'l' : 'r'}_housing`);
    K.addW('upper_chest', put(discUV(new THREE.CircleGeometry(e.r * 0.7, 32).rotateX(-Math.PI / 2), V3(0, 1, 0), e.r * 0.7).translate(0, 0.0115, 0)), M.field, `emitter_${s > 0 ? 'l' : 'r'}_glow`, { cast: false });
    K.addW('upper_chest', put(new THREE.TorusGeometry(e.r * 0.76, 0.0022, 8, 40).rotateX(Math.PI / 2).translate(0, 0.0115, 0)), M.fieldRim, `emitter_${s > 0 ? 'l' : 'r'}_rim`, { cast: false });
  }
};
BLOCKOUT.head = (K) => {
  const { M, D } = K, h = D.head, sc = h.screen;
  const rings = []; for (let k = 0; k < 3; k++) rings.push(new THREE.TorusGeometry(0.036, 0.0085, 10, 32).rotateX(Math.PI / 2).translate(0, 0.012 + k * 0.023, 0));
  K.add('neck', mergeUV(rings), M.gunmetal, 'neck_rings');
  K.add('neck', new THREE.CylinderGeometry(0.026, 0.03, 0.09, 20).translate(0, 0.04, 0), M.inner, 'neck_core');
  // housing: rounded front profile pushed back along -Z, screen set into the face
  const hw = h.halfW, depth = h.front - h.back;
  const housing = plate(rect(-hw, hw, h.bottom, h.top, h.corner), depth, { bevel: 0.012 }).translate(0, 0, h.back);
  K.addW('head', housing, M.iron, 'head_housing', { wear: true });
  const bezel = plate(rect(-sc.w / 2 - 0.006, sc.w / 2 + 0.006, sc.cy - sc.h / 2 - 0.006, sc.cy + sc.h / 2 + 0.006, sc.r + 0.006), 0.004, { bevel: 0.0015, segs: 1 }).translate(0, 0, h.front - 0.002);
  K.addW('head', bezel, M.inner, 'screen_bezel');
  const scr = screenUV(new THREE.ShapeGeometry(rect(-sc.w / 2, sc.w / 2, sc.cy - sc.h / 2, sc.cy + sc.h / 2, sc.r), 6), 0, sc.cy, sc.w, sc.h).translate(0, 0, h.front + 0.0025);
  K.addW('head', scr, M.screen, 'screen', { cast: false });
  for (const s of [1, -1]) {
    const e = h.ear, g = new THREE.CylinderGeometry(e.r, e.r, e.len, 28).rotateZ(Math.PI / 2).translate(s * (e.x - e.len / 2), e.y, e.z);
    K.addW('head', g, M.gunmetal, `ear_${s > 0 ? 'l' : 'r'}`);
  }
};
function segGeo(len, w, t, dir = V3(1, 0, 0)) {
  const g = sLoft([[0.001, t / 2, w / 2, 2.4], [len - 0.001, t / 2 * 0.9, w / 2 * 0.92, 2.4]], { axis: 'x', seg: 16, steps: 10, roundStart: Math.min(t, w) * 0.45, roundEnd: Math.min(t, w) * 0.45 });
  return orient(g, V3(1, 0, 0), dir);
}
BLOCKOUT.arms = (K) => {
  const { M, D } = K;
  for (const s of ['l', 'r']) {
    const side = (g) => s === 'l' ? g : mirrorX(g);
    K.add('shoulder_' + s, side(segGeo(0.13, 0.05, 0.04).translate(0.02, 0.035, -0.005)), M.iron, `clavicle_${s}`, { wear: true });
    K.add('upper_arm_' + s, side(new THREE.SphereGeometry(0.072, 28, 18).scale(1, 0.88, 1).translate(0.0, 0.012, 0)), M.iron, `pauldron_${s}`, { wear: true });
    K.add('upper_arm_' + s, side(sLoft([[0.03, 0.044, 0.047, 2.3], [0.15, 0.042, 0.045, 2.3], [0.265, 0.036, 0.039, 2.3]], { axis: 'x', roundStart: 0.01, roundEnd: 0.012 })), M.iron, `upper_arm_${s}_shell`, { wear: true });
    K.add('lower_arm_' + s, side(new THREE.SphereGeometry(0.036, 24, 16)), M.gunmetal, `elbow_${s}`);
    K.add('lower_arm_' + s, side(sLoft([[0.03, 0.038, 0.041, 2.3], [0.09, 0.04, 0.043, 2.3], [0.24, 0.028, 0.034, 2.3]], { axis: 'x', roundStart: 0.01, roundEnd: 0.01 })), M.iron, `forearm_${s}_shell`, { wear: true });
    K.add('hand_' + s, side(new THREE.SphereGeometry(0.024, 20, 14)), M.gunmetal, `wrist_${s}`);
    K.add('hand_' + s, side(sLoft([[0.008, 0.014, 0.033, 2.6, -0.001], [0.06, 0.016, 0.042, 2.8, -0.001], [0.1, 0.014, 0.043, 2.8, 0.0]], { axis: 'x', roundStart: 0.008, roundEnd: 0.008 })), M.iron, `palm_${s}`, { wear: true });
    for (const f of FINGERS) {
      const F = D.FINGER[f], dir = F.dir ? V3(...F.dir).normalize() : V3(1, 0, 0);
      for (let i = 0; i < 3; i++) {
        const k = 1 - i * 0.06;
        K.add(`${f}_${i + 1}_${s}`, side(segGeo(F.len[i], F.w * k, F.t * k, dir)), i === 2 ? M.iron : M.gunmetal, `${f}_${i + 1}_${s}_seg`);
      }
    }
  }
};
BLOCKOUT.legs = (K) => {
  const { M, D } = K, f = D.foot;
  for (const s of ['l', 'r']) {
    const side = (g) => s === 'l' ? g : mirrorX(g);
    K.add('upper_leg_' + s, side(new THREE.SphereGeometry(0.058, 24, 16)), M.gunmetal, `hip_ball_${s}`);
    K.add('upper_leg_' + s, side(sLoft([[-0.42, 0.05, 0.055, 2.3], [-0.3, 0.062, 0.068, 2.4], [-0.12, 0.072, 0.078, 2.5, 0, 0.004], [-0.03, 0.07, 0.074, 2.5, 0, 0.002]], { axis: 'y', roundStart: 0.015, roundEnd: 0.02 })), M.iron, `thigh_${s}_shell`, { wear: true });
    K.add('lower_leg_' + s, side(new THREE.SphereGeometry(0.05, 24, 16)), M.gunmetal, `knee_${s}`);
    K.add('lower_leg_' + s, side(sLoft([[-0.39, 0.04, 0.045, 2.3], [-0.25, 0.05, 0.058, 2.4, 0, -0.008], [-0.035, 0.05, 0.054, 2.4]], { axis: 'y', roundStart: 0.012, roundEnd: 0.015 })), M.iron, `shin_${s}_shell`, { wear: true });
    // boot: side profile (z, y in world) pushed across x
    const bootProf = roundedShape([[f.heelZ, f.soleH, 0.012], [0.15, f.soleH, 0.004], [0.15, 0.075, 0.02], [0.06, 0.12, 0.03], [0.03, 0.17, 0.01], [-0.06, 0.17, 0.01], [f.heelZ, 0.1, 0.02]]);
    const boot = slab(bootProf, 0.088, { bevel: 0.006, segs: 2 }).rotateY(-Math.PI / 2).translate(D.J['foot_' + s].x, 0, 0);
    K.addW('foot_' + s, boot, M.iron, `boot_${s}`, { wear: true });
    const toe = slab(roundedShape([[0.15, f.soleH, 0.002], [f.toeZ, f.soleH, 0.012], [f.toeZ, 0.055, 0.025], [0.15, 0.075, 0.004]]), 0.086, { bevel: 0.006, segs: 2 }).rotateY(-Math.PI / 2).translate(D.J['foot_' + s].x, 0, 0);
    K.addW('toes_' + s, toe, M.iron, `toecap_${s}`, { wear: true });
    K.addW('foot_' + s, box(-0.048, 0.048, 0, f.soleH, f.heelZ + 0.004, 0.15).translate(D.J['foot_' + s].x, 0, 0), M.rubber, `sole_${s}`);
    K.addW('toes_' + s, box(-0.047, 0.047, 0, f.soleH, 0.15, f.toeZ - 0.006).translate(D.J['foot_' + s].x, 0, 0), M.rubber, `sole_toe_${s}`);
  }
};

/* ------------------------------------------------------------------ kit and part loader */

const PARTS = {};   // parts/*.js fill these: PARTS.head, PARTS.torso, PARTS.arms, PARTS.legs
const REGIONS = ['torso', 'legs', 'arms', 'head'];
const REGION_BONES = {
  head: ['neck', 'head'],
  torso: ['hips', 'spine', 'chest', 'upper_chest'],
  arms: BONE_NAMES.filter((n) => /^(shoulder|upper_arm|lower_arm|hand|thumb|index|middle|ring|pinky)_/.test(n)),
  legs: BONE_NAMES.filter((n) => /^(upper_leg|lower_leg|foot|toes)_/.test(n)),
};
function makeKit(rig) {
  return {
    THREE, D, J, TIP, FINGER, FINGERS, HUMAN, M, TX, bones: rig.bones, rig, hooks: {}, timings: {}, blockout: BLOCKOUT,
    add: (bone, geo, mat, name, opts) => addTo(rig, bone, geo, mat, name, opts, false),
    addW: (bone, geo, mat, name, opts) => addTo(rig, bone, geo, mat, name, opts, true),
    local: (bone, v) => v.clone().sub(J[bone]),
    toLocal: (bone, geo) => geo.translate(-J[bone].x, -J[bone].y, -J[bone].z),
    piston: (name, boneA, pa, boneB, pb, opts) => addPiston(rig, name, boneA, pa, boneB, pb, opts),
    merge: mergeUV, mirrorX, orient, boxUV, prepUV, sLoft, plate, rect, rshape: roundedShape, roundedShape, slab, loft, latheX, latheY, curve,
    rivets, rivetLine, rivetsOn, rivetHead, weld, weldOn, cable, cableBundle, cableEnds, pistonGeos, rotary,
    screenUV, discUV, nickDecal, wearSplit, hexScrew: (r, pos, normal, spin = 0.3) => placeScrew(screwHead(r, { style: 'hex', h: r * 0.55, seg: 18 }), pos, normal, spin),
    screwHead, placeScrew, subtract, subtractEach, box, creased, clean, prng, noise3, V3, deg, lerp, clamp01, sstep,
  };
}
function buildParts(K) {
  window.__partErrors = window.__partErrors || [];
  for (const r of REGIONS) {
    const t0 = performance.now(), nodes = [];
    K.rig.root.traverse((o) => nodes.push(o));
    const before = new Map(nodes.map((o) => [o, o.children.slice()])), np = K.rig.pistons.length;
    try {
      if (typeof PARTS[r] !== 'function') throw new Error('no builder for ' + r);
      PARTS[r](K);
    } catch (e) {
      console.error(`part ${r} failed:`, e);
      window.__partErrors.push({ region: r, message: String(e && e.message || e), stack: String(e && e.stack || '').split('\n').slice(0, 6).join('\n') });
      for (const [o, kids] of before) for (const c of o.children.slice()) if (!kids.includes(c)) o.remove(c);
      K.rig.pistons.length = np;
      try { BLOCKOUT[r](K); } catch (e2) { console.error('blockout failed', r, e2); window.__partErrors.push({ region: r, message: 'blockout: ' + e2.message }); }
    }
    K.timings[r] = Math.round(performance.now() - t0);
  }
}

/* ------------------------------------------------------------------ poses and faces */
// A pose: { rot: { bone: [x, y, z] degrees, Euler order XYZ (Rx * Ry * Rz) }, hips: [dx, dy, dz] metres
// from rest }. Missing bones are at identity (rest). Mirror a left value to the right with [x, -y, -z].
const POSE = {
  mirror: (v) => [v[0], -v[1], -v[2]],
  sym(rot, base, v) { rot[base + '_l'] = v.slice(); rot[base + '_r'] = [v[0], -v[1], -v[2]]; return rot; },
  // finger curl in degrees per joint (positive bends toward the palm); spread fans the proximal joint
  curl(rot, s, finger, a, spread = 0) {
    for (let i = 0; i < 3; i++) {
      let v;
      if (finger === 'thumb') { const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromAxisAngle(D.thumbFlexAxis_l, deg(a[i])), 'XYZ'); v = [e.x, e.y, e.z].map(THREE.MathUtils.radToDeg); }
      else v = [0, i === 0 ? spread : 0, -a[i]];
      rot[`${finger}_${i + 1}_${s}`] = s === 'l' ? v : [v[0], -v[1], -v[2]];
    }
    return rot;
  },
  // Euler XYZ degrees for a rotation of angle degrees about an axis (V3, bone-local)
  axis: (axis, angle) => { const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), deg(angle)), 'XYZ'); return [e.x, e.y, e.z].map(THREE.MathUtils.radToDeg); },
  quats(pose) {
    const out = {};
    for (const n of BONE_NAMES) { const r = pose.rot && pose.rot[n]; out[n] = r ? new THREE.Quaternion().setFromEuler(new THREE.Euler(deg(r[0]), deg(r[1]), deg(r[2]), 'XYZ')) : new THREE.Quaternion(); }
    return out;
  },
  // set the rig to a pose; with `from` (another pose) and w, blend from -> pose by w
  apply(rig, pose, from = null, w = 1) {
    const qb = POSE.quats(pose), qa = from ? POSE.quats(from) : null;
    for (const n of BONE_NAMES) { const q = rig.bones[n].quaternion; q.copy(qb[n]); if (qa) q.copy(qa[n]).slerp(qb[n], w); }
    const h = pose.hips || [0, 0, 0], h0 = from ? (from.hips || [0, 0, 0]) : h;
    rig.bones.hips.position.set(J.hips.x + lerp(h0[0], h[0], w), J.hips.y + lerp(h0[1], h[1], w), J.hips.z + lerp(h0[2], h[2], w));
    solveConstraints(rig);
  },
  rest(rig) { POSE.apply(rig, { rot: {} }); },
};
// show a face cell on the screen material and record it on the face channel:
// face_ctrl.position = (cell index, alarm tint 0..1, nullfield glow 0..1)
function setFace(rig, name, tint = 0, field = 0) {
  const [u, v] = faceOffset(name);
  M.screen.emissiveMap.offset.set(u, v);
  M.screen.emissive.set('#ffffff').lerp(new THREE.Color('#d8141a'), clamp01(tint));
  if (rig) rig.faceCtrl.position.set(FACE_INDEX[name] ?? 0, tint, field);
}

// A board of samples of every detail helper and material (debug only, not part of the character).
// The board stands at the origin facing +Z, about 0.6 m wide, 0.2 to 1.2 m up.
function buildSampleBoard(K) {
  const G = new THREE.Group(); G.name = 'sample_board';
  const add = (geo, mat, name, opts) => addTo(K.rig, G, geo, mat, name, opts, false);
  // two bent plates meeting at a welded seam, riveted along their outer edges
  const pa = plate(rect(-0.16, 0, -0.1, 0.1, 0.02), 0.008, { bevel: 0.003, segs: 2, bendY: 0.3 }), pb = plate(rect(0.0, 0.16, -0.1, 0.1, 0.02), 0.008, { bevel: 0.003, segs: 2, bendY: 0.3 });
  const place = (g) => g.translate(0, 0.95, 0);
  add(place(pa.clone()), M.iron, 'plate_a', { wear: true }); add(place(pb.clone()), M.iron, 'plate_b', { wear: true });
  add(place(weldOn(pa, [[-0.002, -0.088], [-0.001, 0], [-0.002, 0.088]], { seed: 3 })), M.weld, 'seam_weld');
  add(place(mergeUV([rivetsOn(pa, [[-0.14, -0.08], [-0.14, -0.027], [-0.14, 0.027], [-0.14, 0.08], [-0.1, 0.085], [-0.05, 0.085]], 0.0048, 4), rivetsOn(pb, [[0.14, -0.08], [0.14, -0.027], [0.14, 0.027], [0.14, 0.08]], 0.0048, 5)])), M.rivet, 'rivets');
  // cable bundle with ferrules
  const path = [V3(-0.25, 0.62, 0.0), V3(-0.12, 0.7, 0.05), V3(0.05, 0.64, 0.06), V3(0.24, 0.72, 0.0)];
  add(cableBundle(path, { n: 3, r: 0.0045, twist: 5 }), M.cable, 'cable_bundle');
  add(cableEnds(path, 0.011), M.gunmetal, 'cable_ferrules');
  // piston (static), rotary actuator, stainless shroud with a glowing core, emitter disc
  const P = pistonGeos(0.22, 0.012);
  add(P.body.clone().translate(-0.2, 0.25, 0.02), M.gunmetal, 'piston_body'); add(P.eyeA.clone().translate(-0.2, 0.25, 0.02), M.gunmetal, 'piston_eye_a');
  add(P.rod.clone().rotateZ(Math.PI).translate(-0.2, 0.47 + 0.0144, 0.02), M.chrome, 'piston_rod');
  const Rt = rotary(0.045, 0.05); for (const [k, g] of Object.entries(Rt)) add(g.clone().translate(0.0, 0.36, 0.03), k === 'housing' ? M.gunmetal : k === 'cap' ? M.iron : M.rivet, 'rotary_' + k, k === 'cap' ? { wear: true } : {});
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 40, 1, true).translate(0.2, 0.36, 0.02), M.stainless, 'shroud_sample');
  add(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 24).translate(0.2, 0.36, 0.02), M.core, 'core_sample', { cast: false });
  const dn = V3(0, 0, 1);
  add(orient(new THREE.CylinderGeometry(0.03, 0.034, 0.012, 32), V3(0, 1, 0), dn).translate(0.2, 0.2, 0.0), M.gunmetal, 'disc_housing');
  add(discUV(new THREE.CircleGeometry(0.022, 32), dn, 0.022).translate(0.2, 0.2, 0.0065), M.field, 'disc_glow', { cast: false });
  // screen and the scratched name on a little plate
  const sp = plate(rect(-0.09, 0.09, -0.07, 0.07, 0.018), 0.01, { bevel: 0.003 }); add(sp.translate(-0.05, 0.2, -0.01), M.iron, 'screen_frame', { wear: true });
  add(screenUV(new THREE.ShapeGeometry(rect(-0.068, 0.068, -0.051, 0.051, 0.012), 6), 0, 0, 0.136, 0.102).translate(-0.05, 0.2, 0.0015), M.screen, 'screen_sample', { cast: false });
  add(plate(rect(-0.05, 0.05, -0.025, 0.025, 0.006), 0.004, { bevel: 0.001 }).translate(0.06, 0.08, 0), M.iron, 'nick_plate');
  add(nickDecal(0.06).translate(0.06, 0.08, 0.0042), M.nick, 'nick', { cast: false });
  return G;
}

// Build everything: materials, rig, parts. Returns { rig, K, timings }.
function buildN1CK() {
  const t0 = performance.now(), timings = {};
  if (!M.iron) timings.materials = Math.round(buildMaterials());
  const rig = buildRig(), K = makeKit(rig);
  buildParts(K);
  Object.assign(timings, K.timings, { total: Math.round(performance.now() - t0) });
  POSE.rest(rig);
  return { rig, K, timings };
}
