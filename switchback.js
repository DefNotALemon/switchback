// Switchback — game code. Loaded by index.html after three.js.
(() => {
"use strict";
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

/* ---------------- noise ---------------- */
function hash(ix, iy) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vn(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * vn(x * f + i * 17.3, y * f - i * 9.1); n += a; a *= 0.5; f *= 2.03; } return s / n; }
function ridged(x, y, o) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { let r = 1 - Math.abs(vn(x * f + i * 5.7, y * f + i * 3.3) * 2 - 1); r *= r; s += a * r; n += a; a *= 0.5; f *= 2.1; } return s / n; }
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------------- world ---------------- */
// One canyon: a floor running north-south along x≈0, the forested mountain to the west
// climbing to the lookout ridge, rocky bluffs to the east. 1.2 km square, 2 m grid.
const WORLD = 1200, HALF = 600, GRES = 2, GN = WORLD / GRES + 1;
const ground = new Float32Array(GN * GN), surfG = new Uint8Array(GN * GN), trailG = new Float32Array(GN * GN);
// surfaces
const S_DIRT = 0, S_TRAIL = 1, S_GRAVEL = 2, S_ROCK = 3, S_MUD = 4;
const SURF = [
  { n: "DIRT", grip: 0.86, wetGrip: 0.62, roll: 0.022, rut: 0.7, col: [0.36, 0.28, 0.17], dust: 1.0 },
  { n: "TRAIL", grip: 1.0, wetGrip: 0.8, roll: 0.012, rut: 0.35, col: [0.52, 0.40, 0.25], dust: 0.8 },
  { n: "GRAVEL", grip: 0.62, wetGrip: 0.58, roll: 0.03, rut: 0.25, col: [0.55, 0.52, 0.45], dust: 1.4 },
  { n: "ROCK", grip: 0.74, wetGrip: 0.42, roll: 0.014, rut: 0.0, col: [0.47, 0.47, 0.5], dust: 0.2 },
  { n: "MUD", grip: 0.48, wetGrip: 0.34, roll: 0.07, rut: 1.0, col: [0.27, 0.19, 0.12], dust: 0.0 },
];
const streamX = z => 18 * Math.sin(z / 140) + 9 * Math.sin(z / 47 + 1.3);
function baseH(x, z) {
  let h = 24 + (fbm(x / 90 + 3, z / 90 - 5, 3) - 0.5) * 9 + (fbm(x / 28, z / 28, 2) - 0.5) * 2.2;
  const w = sstep(-30, -470, x);                                       // west mountain
  if (w > 0) h += Math.pow(w, 1.45) * 175 + w * ridged(x / 260 + 1.2, z / 260 - 0.4, 4) * 38;
  const e = sstep(50, 430, x);                                         // east bluffs, stepped
  if (e > 0) { const steps = Math.floor(e * 4) / 4, f = e * 4 - Math.floor(e * 4); h += (steps + sstep(0.55, 1, f) * 0.25) * 92 + e * ridged(x / 150, z / 150 + 2, 3) * 24; }
  const sx = x - streamX(z); h -= 3.2 * Math.exp(-(sx * sx) / 140);   // the creek
  const b = sstep(500, 600, Math.max(Math.abs(x), Math.abs(z)));       // valley walls at the edge
  if (b > 0) h += b * (70 + ridged(x / 200, z / 200, 3) * 120);
  return h;
}
function sampleG(arr, x, z) {
  let gx = (x + HALF) / GRES, gz = (z + HALF) / GRES;
  gx = clamp(gx, 0, GN - 1.001); gz = clamp(gz, 0, GN - 1.001);
  const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz, i = iz * GN + ix;
  const a = arr[i], b = arr[i + 1], c = arr[i + GN], d = arr[i + GN + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
const groundAt = (x, z) => sampleG(ground, x, z);
function surfAt(x, z) { const i = clamp(Math.round((x + HALF) / GRES), 0, GN - 1), j = clamp(Math.round((z + HALF) / GRES), 0, GN - 1); return surfG[j * GN + i]; }
const trailAt = (x, z) => sampleG(trailG, x, z);

// Sites. The garage is home; the shed is a charge stop and takes parts; the rest are drops.
const SITES = [
  { id: "garage", n: "Garage", type: "home", x: 34, z: 392, r: 12, yaw: 0 },
  { id: "shed", n: "Repair shed", type: "shed", x: -44, z: -226, r: 10, yaw: Math.PI * 0.5 },
  { id: "cabin", n: "Hollow Cabin", type: "drop", x: -262, z: 150, r: 9, yaw: -0.4 },
  { id: "camp", n: "Bench Trail Camp", type: "drop", x: 224, z: -264, r: 11, yaw: Math.PI * 0.5 },
  { id: "lookout", n: "Ridge Lookout", type: "drop", x: -470, z: 70, r: 9, yaw: Math.PI },
];
const site = id => SITES.find(s => s.id === id);
// Trails: waypoint lists. Between distant points the path zigzags into switchbacks where it's steep.
const TRAILS = [];
// Walk from A to B holding the grade at or under maxG: go straight when that is gentle enough,
// otherwise traverse across the slope and fold back into a hairpin when the leg starts pulling
// away from B. This is how trail crews lay out switchbacks, and it gives every trail a climb
// a bike can actually pedal. The walker reads a smoothed hill so the 2 m bumps don't steer it.
function hS(x, z) { let s = baseH(x, z); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; s += baseH(x + Math.cos(a) * 11, z + Math.sin(a) * 11); } return s / 9; }
function switchback(ax, az, bx, bz, maxG) {
  maxG = maxG || 0.12;
  const pts = [[ax, az]]; let x = ax, z = az, side = 0, leg = 0, hx = 0, hz = 0, head = 0, best = 1e9, stale = 0;
  const step = 4, hB = hS(bx, bz), L0 = Math.hypot(bx - ax, bz - az), cx = (bx - ax) / L0, cz = (bz - az) / L0, corr = Math.min(75, Math.max(40, L0 * 0.3));
  for (let n = 0; n < 900; n++) {
    const dx = bx - x, dz = bz - z, dist = Math.hypot(dx, dz);
    if (dist < step * 1.5) break;
    if (dist < best - 2) { best = dist; stale = 0; } else stale += step;
    const tx = dx / dist, tz = dz / dist, climb = hB - hS(x, z);
    let mx, mz;
    const e = 6, gx = (hS(x + e, z) - hS(x - e, z)) / (2 * e), gz = (hS(x, z + e) - hS(x, z - e)) / (2 * e), gm = Math.hypot(gx, gz);
    const local = Math.abs(gx * tx + gz * tz);                   // grade of the ground straight toward B
    if ((Math.abs(climb) / dist <= maxG * 0.85 && local <= maxG * 1.2) || gm <= maxG || local <= maxG * 0.7 || stale > 400) { mx = tx; mz = tz; side = 0; }
    else {
      const ux = gx / gm, uz = gz / gm, up = climb > 0 ? 1 : -1;
      const px = -uz, pz = ux;                                   // across the slope
      if (side === 0) { side = (px * tx + pz * tz) >= 0 ? 1 : -1; leg = 0; }
      // legs run inside a corridor either side of the straight line A→B; at the edge, fold back
      const lat = (x - ax) * cz - (z - az) * cx, latDir = (px * side) * cz - (pz * side) * cx;
      if ((lat * Math.sign(latDir || 1) > corr && leg > 30) || Math.abs(x) > 540 || Math.abs(z) > 540) { side = -side; leg = 0; }
      const sx = px * side, sz = pz * side;
      const s = Math.min(1, maxG / gm), c = Math.sqrt(1 - s * s);
      mx = sx * c + ux * s * up; mz = sz * c + uz * s * up;
    }
    // turn toward the wanted heading at most 0.4 rad per step: hairpins become 10 m arcs
    const want = Math.atan2(mx, mz);
    if (n === 0) head = want;
    else { let d = ((want - head + Math.PI) % TAU + TAU) % TAU - Math.PI; head += clamp(d, -0.4, 0.4); }
    hx = Math.sin(head); hz = Math.cos(head);
    x += hx * step; z += hz * step; leg += step;
    x = clamp(x, -560, 560); z = clamp(z, -560, 560);
    pts.push([x, z]);
  }
  pts.push([bx, bz]); pts.g = maxG;
  return pts;
}
function makeTrails() {
  const g = site("garage"), sh = site("shed"), c = site("cabin"), cp = site("camp"), lo = site("lookout");
  TRAILS.push(switchback(g.x, g.z, sh.x, sh.z, 0.1));                    // floor road
  TRAILS.push(switchback(g.x - 10, g.z - 30, c.x, c.z, 0.12));           // up to the cabin
  TRAILS.push(switchback(c.x, c.z, lo.x, lo.z, 0.13));                   // cabin to the ridge
  TRAILS.push(switchback(sh.x, sh.z, cp.x, cp.z, 0.12));                 // shed up the bluffs
  TRAILS.push(switchback(sh.x, sh.z, lo.x, lo.z, 0.14));                 // the back way up, steeper
}
// Smooth polyline: Catmull-Rom into dense points
function densify(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const z = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([x, z]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
const trailPts = [], KICK = [];   // dense [x,z,h] for the minimap and the bench cut; kicker spots
// nudge each site onto the flattest ground within 45 m of where it was asked for
function settleSites() {
  const slope = (x, z) => { let m = 0; for (let a = 0; a < 8; a++) { const cx = x + Math.cos(a / 8 * TAU) * 14, cz = z + Math.sin(a / 8 * TAU) * 14; m = Math.max(m, Math.abs(baseH(cx, cz) - baseH(x, z))); } return m; };
  for (const s of SITES) {
    let bx = s.x, bz = s.z, best = slope(s.x, s.z);
    for (let r = 8; r <= 45; r += 8) for (let a = 0; a < 12; a++) { const x = s.x + Math.cos(a / 12 * TAU) * r, z = s.z + Math.sin(a / 12 * TAU) * r, v = slope(x, z) + r * 0.05; if (v < best) { best = v; bx = x; bz = z; } }
    s.x = Math.round(bx); s.z = Math.round(bz);
  }
}
function genWorld() {
  settleSites();
  makeTrails();
  for (let j = 0; j < GN; j++) { const z = j * GRES - HALF; for (let i = 0; i < GN; i++) ground[j * GN + i] = baseH(i * GRES - HALF, z); }
  // flatten the yards around the sites
  for (const s of SITES) {
    const h = baseH(s.x, s.z); s.y = h;
    const ci = Math.round((s.x + HALF) / GRES), cj = Math.round((s.z + HALF) / GRES), R = Math.ceil((s.r + 12) / GRES);
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
      if (i < 0 || j < 0 || i >= GN || j >= GN) continue;
      const dd = Math.hypot(i * GRES - HALF - s.x, j * GRES - HALF - s.z), w = 1 - sstep(s.r, s.r + 12, dd);
      const idx = j * GN + i; ground[idx] += (h - ground[idx]) * w; trailG[idx] = Math.max(trailG[idx], 1 - sstep(s.r, s.r + 3, dd));
    }
  }
  // bench-cut the trails: a 5 m lane whose height follows a smoothed profile of the ground under
  // it, with the climb capped at the trail's grade so the lane digs into the hill where it must.
  // Where two legs of a hairpin come close the heights blend into a saddle instead of a step.
  const cut = new Float32Array(GN * GN), cutW = new Float32Array(GN * GN);
  for (const T of TRAILS) {
    const d = densify(T, 2);
    const hs = d.map(p => baseH(p[0], p[1]));
    for (let pass = 0; pass < 14; pass++) for (let i = 1; i < hs.length - 1; i++) hs[i] = (hs[i - 1] + hs[i] * 2 + hs[i + 1]) / 4;
    const segL = i => Math.max(0.3, Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]));
    // the ends sit in the flat yards of the sites they join
    const p0 = d[0], p1 = d[d.length - 1], s0 = SITES.find(s => Math.hypot(s.x - p0[0], s.z - p0[1]) < s.r + 20), s1 = SITES.find(s => Math.hypot(s.x - p1[0], s.z - p1[1]) < s.r + 20);
    const fixed = d.map((p, i) => (s0 && Math.hypot(s0.x - p[0], s0.z - p[1]) < s0.r + 2) ? s0.y : (s1 && Math.hypot(s1.x - p[0], s1.z - p[1]) < s1.r + 2) ? s1.y : (i === 0 || i === d.length - 1) ? hs[i] : null);
    // the cap can never be tighter than the climb the trail has to make over the length it has
    let free = 0; for (let i = 1; i < d.length; i++) if (fixed[i] === null) free += segL(i);
    const g = Math.max((T.g || 0.12) * 1.15, Math.abs((s1 ? s1.y : hs[hs.length - 1]) - (s0 ? s0.y : hs[0])) / Math.max(free, 1) * 1.12);
    for (let rep = 0; rep < 8; rep++) {
      for (let i = 0; i < hs.length; i++) if (fixed[i] !== null) hs[i] = fixed[i];
      for (let i = 1; i < hs.length; i++) { if (fixed[i] !== null) continue; const L = segL(i) * g; hs[i] = clamp(hs[i], hs[i - 1] - L, hs[i - 1] + L); }
      for (let i = hs.length - 2; i >= 0; i--) { if (fixed[i] !== null) continue; const L = segL(i + 1) * g; hs[i] = clamp(hs[i], hs[i + 1] - L, hs[i + 1] + L); }
    }
    // kickers: a dirt ramp with a sharp lip every 120 m or so on the grades, so the descents have air
    // in them. Built as a 1.2 m rise over 10 m that drops straight off, ridden either way.
    let since = 40;
    for (let i = 6; i < hs.length - 10; i++) {
      since += segL(i);
      if (since > 120 && Math.abs(hs[i + 6] - hs[i]) > 0.5 && fixed[i] === null && fixed[i + 8] === null) {
        const downhill = hs[i + 6] < hs[i], a = downhill ? d[i] : d[i + 5], b = downhill ? d[i + 5] : d[i];
        KICK.push([a[0], a[1], b[0], b[1]]); since = 0; i += 8;
      }
    }
    for (let k = 0; k < d.length; k++) {
      const [x, z] = d[k], h = hs[k]; trailPts.push([x, z, h]);
      const ci = Math.round((x + HALF) / GRES), cj = Math.round((z + HALF) / GRES);
      for (let j = cj - 5; j <= cj + 5; j++) for (let i = ci - 5; i <= ci + 5; i++) {
        if (i < 0 || j < 0 || i >= GN || j >= GN) continue;
        const dd = Math.hypot(i * GRES - HALF - x, j * GRES - HALF - z), w0 = 1 - sstep(2.2, 8, dd);
        if (w0 <= 0) continue;
        const idx = j * GN + i, w = w0 * w0 * w0;
        cut[idx] += h * w; cutW[idx] += w;
        trailG[idx] = Math.max(trailG[idx], 1 - sstep(2.4, 3.6, dd));
      }
    }
  }
  for (let k = 0; k < GN * GN; k++) if (cutW[k] > 0) { const h = cut[k] / cutW[k], m = Math.min(1, Math.cbrt(cutW[k])); ground[k] += (h - ground[k]) * m; }
  // stamp the kickers straight into the grid so the lip stays sharp: a 1.3 m ramp over 10 m that drops off
  for (const K of KICK) {
    const dx = K[2] - K[0], dz = K[3] - K[1], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
    const ci = Math.round((K[0] + HALF) / GRES), cj = Math.round((K[1] + HALF) / GRES);
    for (let j = cj - 8; j <= cj + 8; j++) for (let i = ci - 8; i <= ci + 8; i++) {
      if (i < 0 || j < 0 || i >= GN || j >= GN) continue;
      const px = i * GRES - HALF - K[0], pz = j * GRES - HALF - K[1], s = px * ux + pz * uz, l = Math.abs(px * uz - pz * ux);
      if (s < 0 || s > 9.5 || l > 4) continue;
      ground[j * GN + i] += 1.9 * clamp(s / 9, 0, 1) * (1 - sstep(2.4, 4, l));
    }
  }
  // surfaces
  for (let j = 0; j < GN; j++) {
    const z = j * GRES - HALF;
    for (let i = 0; i < GN; i++) {
      const x = i * GRES - HALF, k = j * GN + i;
      const i0 = Math.max(0, i - 1), i1 = Math.min(GN - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(GN - 1, j + 1);
      const gx = (ground[j * GN + i1] - ground[j * GN + i0]) / ((i1 - i0) * GRES), gz = (ground[j1 * GN + i] - ground[j0 * GN + i]) / ((j1 - j0) * GRES);
      const s = Math.hypot(gx, gz), n = fbm(x / 60 + 9, z / 60 + 2, 3);
      let t = S_DIRT;
      if (trailG[k] > 0.5) t = S_TRAIL;
      else if (s > 0.85 + n * 0.3) t = S_ROCK;
      else if (x > 60 && n > 0.42 && s > 0.2) t = S_GRAVEL;
      else if (Math.abs(x - streamX(z)) < 9 + n * 14 && ground[k] < 40) t = S_MUD;
      else if (n > 0.63 && s < 0.25 && ground[k] < 90) t = S_MUD;
      surfG[k] = t;
    }
  }
}

/* ---------------- ruts: sparse 50 cm grid of tyre cuts ---------------- */
const CELL = 0.5, FN = WORLD / CELL, CH = 32, CPR = FN / CH;
const chunks = new Map();
function chunkOf(ix, iz, make) {
  const key = (iz >> 5) * CPR + (ix >> 5);
  let c = chunks.get(key);
  if (!c && make) { c = new Float32Array(CH * CH); chunks.set(key, c); }
  return c;
}
function rutAt(ix, iz) { if (ix < 0 || iz < 0 || ix >= FN || iz >= FN) return 0; const c = chunkOf(ix, iz, false); return c ? c[(iz & 31) * CH + (ix & 31)] : 0; }
function rutDepth(x, z) {
  const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const a = rutAt(ix, iz), b = rutAt(ix + 1, iz), c = rutAt(ix, iz + 1), d = rutAt(ix + 1, iz + 1);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}
const surf = (x, z) => groundAt(x, z) - rutDepth(x, z);
// press the tyre into the ground: deepens the rut, capped by what the surface allows
function stampRut(x, z, amt, cap) {
  const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL, ix = Math.round(fx), iz = Math.round(fz);
  if (ix < 1 || iz < 1 || ix >= FN - 1 || iz >= FN - 1) return;
  const c = chunkOf(ix, iz, true), k = (iz & 31) * CH + (ix & 31);
  const v = c[k]; if (v < cap) c[k] = Math.min(cap, v + amt * (1 - v / cap));
}

/* ---------------- three.js setup ---------------- */
const canvas = $("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const FOG = new THREE.Color(0xbfd0d8);
scene.fog = new THREE.FogExp2(FOG, 0.0022);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 6000);
camera.rotation.order = "YXZ";
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a5a3a, 0.75); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 1.4); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 });
sun.shadow.bias = -0.0008; sun.shadow.camera.updateProjectionMatrix();
scene.add(sun); scene.add(sun.target);
const skyGeo = new THREE.SphereGeometry(3000, 24, 12);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x4a8fd0) }, hor: { value: new THREE.Color(0xd8e6ee) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color(0xffe0b0) }, glow: { value: 0.6 } },
  vertexShader: "varying vec3 vW; void main(){ vW = (modelMatrix*vec4(position,1.)).xyz - cameraPosition; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.);} ",
  fragmentShader: "uniform vec3 top,hor,sunDir,sunCol; uniform float glow; varying vec3 vW; void main(){ vec3 d=normalize(vW); float t=smoothstep(-0.05,0.55,d.y); vec3 c=mix(hor,top,t); float s=max(dot(d,sunDir),0.); c+=sunCol*(pow(s,180.)*1.2+pow(s,6.)*0.28*glow); gl_FragColor=vec4(c,1.);}"
});
const sky = new THREE.Mesh(skyGeo, skyMat); scene.add(sky);
const starGeo = new THREE.BufferGeometry(); { const a = new Float32Array(900 * 3); const rnd = mulberry32(9); for (let i = 0; i < 900; i++) { const th = rnd() * TAU, ph = Math.acos(rnd() * 0.95); a[i * 3] = Math.sin(ph) * Math.cos(th) * 2500; a[i * 3 + 1] = Math.cos(ph) * 2500; a[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 2500; } starGeo.setAttribute("position", new THREE.BufferAttribute(a, 3)); }
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })); scene.add(stars);

/* ---------------- terrain meshes ---------------- */
// one colour per grid cell, computed once; the near patch samples it bilinearly so the
// 0.5 m mesh doesn't show the 2 m cells as jaggies
const colG = new Float32Array(GN * GN * 3);
function surfColor(k, x, z) {
  const t = surfG[k], c = SURF[t].col, n = vn(x / 9, z / 9), m = vn(x / 41 + 5, z / 41), h = ground[k];
  let r = c[0], g = c[1], b = c[2];
  const grass = t === S_DIRT ? sstep(0.2, 0.7, m) * (1 - sstep(90, 170, h)) : 0;
  r = lerp(r, 0.30, grass); g = lerp(g, 0.42, grass); b = lerp(b, 0.16, grass);
  const snow = sstep(165, 215, h) * (t === S_ROCK ? 1 : 0.85);
  r = lerp(r, 0.9, snow); g = lerp(g, 0.92, snow); b = lerp(b, 0.95, snow);
  const v = 0.85 + n * 0.3;
  return [r * v, g * v, b * v];
}
function buildColors() { for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { const k = j * GN + i, c = surfColor(k, i * GRES - HALF, j * GRES - HALF); colG[k * 3] = c[0]; colG[k * 3 + 1] = c[1]; colG[k * 3 + 2] = c[2]; } }
function colAt(x, z, out) {
  let gx = clamp((x + HALF) / GRES, 0, GN - 1.001), gz = clamp((z + HALF) / GRES, 0, GN - 1.001);
  const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz, i = (iz * GN + ix) * 3;
  for (let c = 0; c < 3; c++) { const a = colG[i + c], b = colG[i + 3 + c], d = colG[i + GN * 3 + c], e = colG[i + GN * 3 + 3 + c]; out[c] = a + (b - a) * fx + (d - a) * fz + (a - b - d + e) * fx * fz; }
  return out;
}
let farMesh, nearMesh;
const NEAR = 72, NRES = 0.5, NN = NEAR / NRES + 1;
function buildFar() {
  buildColors();
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, GN - 1, GN - 1); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), gi = clamp(Math.round((x + HALF) / GRES), 0, GN - 1), gj = clamp(Math.round((z + HALF) / GRES), 0, GN - 1), k = gj * GN + gi;
    pos.setY(i, ground[k]);
    col[i * 3] = colG[k * 3]; col[i * 3 + 1] = colG[k * 3 + 1]; col[i * 3 + 2] = colG[k * 3 + 2];
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  farMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })); farMesh.receiveShadow = true; scene.add(farMesh);
  // near: a high-res patch that follows the bike and shows the ruts
  const ng = new THREE.PlaneGeometry(NEAR, NEAR, NN - 1, NN - 1); ng.rotateX(-Math.PI / 2);
  ng.setAttribute("color", new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 3), 3));
  nearMesh = new THREE.Mesh(ng, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  nearMesh.receiveShadow = true; nearMesh.frustumCulled = false; scene.add(nearMesh);
}
const nearC = { x: 1e9, z: 1e9 }, tmpC = [0, 0, 0];
function updNear(px, pz, force) {
  const cx = Math.round(px / 2) * 2, cz = Math.round(pz / 2) * 2;
  const moved = cx !== nearC.x || cz !== nearC.z;
  nearC.x = cx; nearC.z = cz;
  const pos = nearMesh.geometry.attributes.position, col = nearMesh.geometry.attributes.color;
  const wet = GS.wet;
  for (let j = 0; j < NN; j++) for (let i = 0; i < NN; i++) {
    const n = j * NN + i, x = cx - NEAR / 2 + i * NRES, z = cz - NEAR / 2 + j * NRES;
    const r = rutDepth(x, z), h = groundAt(x, z) - r + 0.03;
    pos.setXYZ(n, x - cx, h, z - cz);
    const c = colAt(x, z, tmpC), dk = 1 - clamp(r / 0.1, 0, 1) * 0.45, wf = 1 - wet * 0.3;
    col.setXYZ(n, c[0] * dk * wf, c[1] * dk * wf, c[2] * dk * wf * (1 + wet * 0.15));
  }
  pos.needsUpdate = true; col.needsUpdate = true; nearMesh.geometry.computeVertexNormals();
  nearMesh.position.set(cx, 0, cz);
}

/* ---------------- props: trees, rocks, buildings ---------------- */
const OBS = new Map(), OBC = 16;
function addOb(o) { const k = Math.floor((o.z + HALF) / OBC) * 256 + Math.floor((o.x + HALF) / OBC); let a = OBS.get(k); if (!a) OBS.set(k, a = []); a.push(o); }
function nearObs(x, z, R) {
  const out = [], i0 = Math.floor((x - R + HALF) / OBC), i1 = Math.floor((x + R + HALF) / OBC), j0 = Math.floor((z - R + HALF) / OBC), j1 = Math.floor((z + R + HALF) / OBC);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const a = OBS.get(j * 256 + i); if (a) for (const o of a) out.push(o); }
  return out;
}
const slopeAt = (x, z, e = 2) => Math.hypot(groundAt(x + e, z) - groundAt(x - e, z), groundAt(x, z + e) - groundAt(x, z - e)) / (2 * e);
function buildProps() {
  const rnd = mulberry32(1234), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();
  // conifers on the west slope and the low forest; deciduous blobs on the floor
  const trunkG = new THREE.CylinderGeometry(0.22, 0.34, 5, 6), coneG = new THREE.ConeGeometry(2.3, 9, 7);
  coneG.translate(0, 8, 0); trunkG.translate(0, 2.5, 0);
  const blobG = new THREE.IcosahedronGeometry(3.2, 1); blobG.translate(0, 5.6, 0);
  const trunks = [], cones = [], blobs = [];
  const dark = 0.35;
  for (let t = 0; t < 12000; t++) {
    const x = rnd() * WORLD - HALF, z = rnd() * WORLD - HALF, h = groundAt(x, z), s = slopeAt(x, z);
    if (trailAt(x, z) > 0.05 || s > 0.75 || Math.abs(x) > 580 || Math.abs(z) > 580) continue;
    let near = false; for (const st of SITES) if (Math.hypot(x - st.x, z - st.z) < st.r + 6) near = true; if (near) continue;
    const forest = fbm(x / 140 + 4, z / 140, 3), evergreen = x < -20 && h < 190 && forest > 0.42 - sstep(-30, -300, x) * 0.12;
    const low = h < 45 && Math.abs(x) < 120 && forest > 0.5;
    if (!evergreen && !low) continue;
    if (surfAt(x, z) === S_ROCK && rnd() < 0.8) continue;
    const sc = 0.7 + rnd() * 0.7, yaw = rnd() * TAU;
    if (evergreen) { trunks.push([x, h, z, sc, yaw]); cones.push([x, h, z, sc, yaw]); }
    else blobs.push([x, h, z, sc * 0.9, yaw]);
    addOb({ x, z, r: 0.45 * sc, tree: true, h });
  }
  const mk = (geo, list, mat) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length); m.castShadow = true; m.receiveShadow = true;
    list.forEach((t, i) => { V.set(t[0], t[1] - 0.3, t[2]); Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t[4]); S.set(t[3], t[3], t[3]); M.compose(V, Q, S); m.setMatrixAt(i, M); });
    m.instanceMatrix.needsUpdate = true; scene.add(m); return m;
  };
  mk(trunkG, trunks, new THREE.MeshLambertMaterial({ color: 0x4a3324 }));
  mk(coneG, cones, new THREE.MeshLambertMaterial({ color: 0x24522c }));
  mk(blobG, blobs, new THREE.MeshLambertMaterial({ color: 0x4d7a2a }));
  mk(trunkG, blobs, new THREE.MeshLambertMaterial({ color: 0x5a4030 }));
  // rocks on rock and gravel
  const rockG = new THREE.DodecahedronGeometry(1, 0), rocks = [];
  for (let t = 0; t < 5000; t++) {
    const x = rnd() * WORLD - HALF, z = rnd() * WORLD - HALF, h = groundAt(x, z), sf = surfAt(x, z);
    if (trailAt(x, z) > 0.05 || Math.abs(x) > 580 || Math.abs(z) > 580) continue;
    let near = false; for (const st of SITES) if (Math.hypot(x - st.x, z - st.z) < st.r + 4) near = true; if (near) continue;
    const p = sf === S_ROCK ? 0.35 : sf === S_GRAVEL ? 0.2 : 0.02;
    if (rnd() > p) continue;
    const sc = 0.5 + rnd() * rnd() * 2.2;
    rocks.push([x, h - sc * 0.35, z, sc, rnd() * TAU]);
    addOb({ x, z, r: sc * 0.85, rock: true, h });
  }
  mk(rockG, rocks, new THREE.MeshLambertMaterial({ color: 0x6e7076 }));
  buildSites();
}
const siteLights = [];
function box(w, h, d, col, x, y, z, rot) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: col })); m.position.set(x, y, z); if (rot) m.rotation.y = rot; m.castShadow = true; m.receiveShadow = true; return m; }
function buildSites() {
  for (const s of SITES) {
    const g = new THREE.Group(); g.position.set(s.x, s.y, s.z); g.rotation.y = s.yaw; s.mesh = g; scene.add(g);
    // buildings sit beside the trail, 9 m off the marker on the site's local +x
    const b = new THREE.Group(); b.position.set(9, 0, 0); g.add(b);
    if (s.type === "home") {
      b.add(box(8, 4.2, 11, 0x8a7a66, 0, 2.1, 0)); b.add(box(8.6, 0.5, 11.6, 0x3a3f44, 0, 4.4, 0));
      b.add(box(0.2, 3.4, 4, 0x2a2f2a, -4.05, 1.7, 0)); const l = new THREE.PointLight(0xffd9a0, 0, 26, 2); l.position.set(-4.5, 3.6, 0); b.add(l); siteLights.push(l);
      b.add(box(0.5, 3, 0.5, 0x555555, -5, 1.5, -4)); b.add(box(0.15, 1.2, 1.6, 0xc6ff3d, -5, 3.4, -4));
    } else if (s.type === "shed") {
      b.add(box(5, 3.2, 7, 0x6b5a45, 0, 1.6, 0)); b.add(box(5.6, 0.4, 7.6, 0x8b2f24, 0, 3.4, 0));
      b.add(box(1.2, 1.2, 1.2, 0x3a5a7a, -3.5, 0.6, 2)); const l = new THREE.PointLight(0xffe2b0, 0, 18, 2); l.position.set(-3, 3, 0); b.add(l); siteLights.push(l);
    } else if (s.id === "cabin") {
      b.add(box(6, 3, 7, 0x5a4a3a, 0, 1.5, 0)); const rf = new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.6, 4), new THREE.MeshLambertMaterial({ color: 0x3f3a33 })); rf.position.set(0, 4.3, 0); rf.rotation.y = Math.PI / 4; rf.castShadow = true; b.add(rf);
      b.add(box(0.8, 1.6, 0.8, 0x777777, 1.5, 5, -1.5)); const l = new THREE.PointLight(0xffc98a, 0, 18, 2); l.position.set(-3.5, 2.5, 0); b.add(l); siteLights.push(l);
    } else if (s.id === "camp") {
      for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.9, 4), new THREE.MeshLambertMaterial({ color: [0xd06a2a, 0x3a7ac0, 0x6a9a3a][i] })); t.position.set((i % 2) * 2, 0.95, -4 + i * 4); t.rotation.y = Math.PI / 4; t.castShadow = true; b.add(t); }
      const fire = new THREE.PointLight(0xff8a30, 0, 16, 2); fire.position.set(-3, 1, 0); b.add(fire); siteLights.push(fire); fire.flicker = true;
      b.add(box(1.4, 0.4, 1.4, 0x333333, -3, 0.2, 0));
    } else if (s.id === "lookout") {
      for (let i = 0; i < 4; i++) b.add(box(0.35, 12, 0.35, 0x6b5a45, (i & 1 ? 2 : -2), 6, (i & 2 ? 2 : -2)));
      b.add(box(5.4, 2.6, 5.4, 0x8a7a66, 0, 13.3, 0)); b.add(box(6, 0.4, 6, 0x3a3f44, 0, 14.8, 0));
      const l = new THREE.PointLight(0xffe2b0, 0, 30, 2); l.position.set(0, 12.6, 0); b.add(l); siteLights.push(l);
    }
    // marker post with the site's colour beside the trail
    g.add(box(0.25, 2.2, 0.25, 0xdddddd, 3, 1.1, 0));
    const flag = box(0.08, 0.7, 1.4, s.type === "home" ? 0xc6ff3d : s.type === "shed" ? 0x7fd0e6 : 0xff7a2f, 3, 1.9, 0.7); g.add(flag); s.flag = flag;
    const ox = Math.cos(s.yaw) * 9, oz = -Math.sin(s.yaw) * 9;   // local +x in world
    addOb({ x: s.x + ox, z: s.z + oz, r: s.id === "lookout" ? 3.4 : s.id === "camp" ? 2.5 : 5, bld: true, h: s.y });
  }
}

/* ---------------- game state ---------------- */
const GS = {
  cash: 0, delivered: 0, hour: 7.0, rain: 0, rainTgt: 0, wet: 0, rainT: 90,
  batt: 1, heat: 0, cut: 0, tier: 1, boost: false, regen: 0,
  job: null, jobs: [], boardOpen: false, garageOpen: false, dead: false, dmg: 0,
  own: { batt: 0, charge: 0, heatTol: 0, torque: 0, boost: 0, regen: 0, sus: 0, tires: ["allround"], tire: "allround", rack: 0 },
  runCrash: 0, runBatt: 0, runT: 0, best: 0,
};
const SET = { hue: 84, sat: 0.9, finish: "gloss", vol: 0.35, mute: false };
let started = false, godOpen = false;

/* ---------------- upgrades ---------------- */
const UPG = {
  batt: { n: "Battery pack", cat: "Battery", lv: ["420 Wh stock", "560 Wh", "720 Wh", "900 Wh long-range"], cost: [0, 260, 520, 900], d: "Capacity. A bigger pack sits on the downtube." },
  charge: { n: "Charger", cat: "Battery", lv: ["Wall charger", "Fast charger", "Depot charger", "Rapid charger"], cost: [0, 150, 320, 600], d: "How fast the garage and the shed fill you up." },
  heatTol: { n: "Cooling", cat: "Battery", lv: ["Stock", "Finned case", "Oil-cooled", "Race cooling"], cost: [0, 200, 420, 760], d: "The motor takes longer to overheat and cools faster." },
  torque: { n: "Torque curve", cat: "Motor", lv: ["250 W stock", "Trail tune", "Enduro tune", "Full-fat"], cost: [0, 300, 620, 1100], d: "Assist strength at every tier. Climbs stop being a negotiation." },
  boost: { n: "Boost", cat: "Motor", lv: ["Stock boost", "Hot boost", "Sprint boost", "Launch control"], cost: [0, 240, 500, 900], d: "Extra shove when you hold Shift, at a heat cost." },
  regen: { n: "Regen", cat: "Motor", lv: ["Trickle", "Regen brake", "Big regen", "Descent harvester"], cost: [0, 180, 400, 720], d: "Coasting and braking downhill puts charge back." },
  sus: { n: "Suspension", cat: "Suspension", lv: ["100 mm hardtail", "130 mm trail", "160 mm enduro", "200 mm downhill"], cost: [0, 280, 560, 980], d: "More travel soaks up bad landings but the bike wallows in corners." },
};
const TIRES = {
  allround: { n: "All-round knobbies", cost: 0, d: "Honest on everything, great at nothing.", grip: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1 }, rut: 1, col: 0x1a1a1a },
  mud: { n: "Mud spikes", cost: 340, d: "Tall paddles. Bite in mud and soft dirt, skate on rock.", grip: { 0: 1.12, 1: 1, 2: 0.95, 3: 0.8, 4: 1.45 }, rut: 1.3, col: 0x2a1e14 },
  gravel: { n: "Gravel semi-slicks", cost: 300, d: "Fast rolling, hold a line on loose stone. Nothing in mud.", grip: { 0: 0.95, 1: 1.1, 2: 1.35, 3: 1.05, 4: 0.7 }, rut: 0.7, col: 0x3a3a3a, roll: 0.8 },
  rock: { n: "Sticky rock compound", cost: 380, d: "Soft rubber that glues to stone, wet or dry. Wears the battery with drag.", grip: { 0: 1, 1: 1.05, 2: 1.05, 3: 1.5, 4: 0.85 }, rut: 0.8, col: 0x22262a, roll: 1.15 },
};
let ST = {};
function stats() {
  const o = GS.own, t = TIRES[o.tire] || TIRES.allround;
  return {
    cap: [420, 560, 720, 900][o.batt], charge: [0.012, 0.022, 0.036, 0.06][o.charge],
    heatCap: [1, 1.35, 1.75, 2.3][o.heatTol], cool: [0.07, 0.09, 0.12, 0.16][o.heatTol],
    torque: [1, 1.25, 1.55, 1.9][o.torque], boostW: [750, 950, 1200, 1500][o.boost],
    regen: [0.35, 0.8, 1.3, 1.9][o.regen], travel: [0.10, 0.13, 0.16, 0.20][o.sus],
    tire: t, roll: t.roll || 1,
  };
}
function restat() { ST = stats(); applyLoadout(); }

/* ---------------- bike model ---------------- */
const bike = new THREE.Group(); scene.add(bike);
const B = {};   // named parts
const frameMat = new THREE.MeshStandardMaterial({ color: 0xc6ff3d, metalness: 0.4, roughness: 0.35 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1f22, metalness: 0.5, roughness: 0.5 });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 });
const alloyMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.8, roughness: 0.35 });
function tube(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); m.castShadow = true; return m;
}
function wheel(r) {
  // built flat in the XY plane (torus axis = z), then the whole thing is turned so the axle
  // runs left-right. Everything that spins lives in `sp`, which rotates about its own z.
  const g = new THREE.Group(), sp = new THREE.Group(); g.add(sp); g.rotation.y = Math.PI / 2;
  const t = new THREE.Mesh(new THREE.TorusGeometry(r - 0.03, 0.05, 8, 22), tireMat); t.castShadow = true; sp.add(t);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r - 0.1, 0.014, 6, 22), alloyMat); sp.add(rim);
  for (let i = 0; i < 12; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, (r - 0.1) * 2, 4), alloyMat); s.rotation.z = i / 12 * Math.PI; sp.add(s); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 10), darkMat); hub.rotation.x = Math.PI / 2; sp.add(hub);
  // knobs
  const kn = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.045, 0.035), tireMat, 28), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3();
  g.setKnobs = ks => { for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; V.set(Math.cos(a) * r, Math.sin(a) * r, (i % 2 ? 0.035 : -0.035)); Q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a); M.compose(V, Q, new THREE.Vector3(1, ks, ks)); kn.setMatrixAt(i, M); } kn.instanceMatrix.needsUpdate = true; };
  g.setKnobs(1); sp.add(kn); g.knobs = kn; g.tire = t; g.sp = sp;
  return g;
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function buildBike() {
  // bike's local frame: +z forward, +y up. Wheelbase 1.2 m, wheel radius 0.35.
  const R = 0.35;
  B.rear = wheel(R); B.rear.position.set(0, R, -0.6); bike.add(B.rear);
  B.frontG = new THREE.Group(); B.frontG.position.set(0, 0, 0.6); bike.add(B.frontG);   // steers
  B.front = wheel(R); B.front.position.set(0, R, 0); B.frontG.add(B.front);
  // fork (compresses): stanchions from crown down to the axle
  B.fork = new THREE.Group(); B.frontG.add(B.fork);
  B.forkL = tube(V3(-0.05, R, 0), V3(-0.05, 0.95, -0.15), 0.02, alloyMat); B.forkR = tube(V3(0.05, R, 0), V3(0.05, 0.95, -0.15), 0.02, alloyMat);
  B.fork.add(B.forkL, B.forkR);
  B.crown = tube(V3(0, 0.95, -0.15), V3(0, 1.16, -0.21), 0.03, darkMat); B.frontG.add(B.crown);
  B.bars = tube(V3(-0.36, 1.18, -0.2), V3(0.36, 1.18, -0.2), 0.016, darkMat); B.frontG.add(B.bars);
  B.stem = tube(V3(0, 1.16, -0.21), V3(0, 1.18, -0.2), 0.02, darkMat); B.frontG.add(B.stem);
  // main triangle (frame group, so paint can hit it all)
  B.frame = new THREE.Group(); bike.add(B.frame);
  const bb = V3(0, 0.33, -0.1), head = V3(0, 1.08, 0.36), seatT = V3(0, 0.86, -0.42), rearA = V3(0, R, -0.6);
  B.frame.add(tube(bb, head, 0.028, frameMat));                      // downtube
  B.frame.add(tube(seatT, V3(0, 1.02, 0.3), 0.024, frameMat));       // toptube
  B.frame.add(tube(bb, seatT, 0.024, frameMat));                     // seat tube
  B.frame.add(tube(seatT, V3(0, 0.96, -0.36), 0.024, frameMat));
  B.swing = new THREE.Group(); B.swing.position.copy(bb); bike.add(B.swing);           // rear swingarm pivots at the BB
  B.swing.add(tube(V3(0, 0, 0), V3(-0.07, R - 0.33, -0.5), 0.016, darkMat), tube(V3(0, 0, 0), V3(0.07, R - 0.33, -0.5), 0.016, darkMat));
  B.swing.add(tube(V3(-0.07, R - 0.33, -0.5), V3(-0.05, 0.5, -0.32), 0.014, darkMat), tube(V3(0.07, R - 0.33, -0.5), V3(0.05, 0.5, -0.32), 0.014, darkMat));
  B.shock = tube(V3(0, 0.5, -0.32), V3(0, 0.86, -0.2), 0.025, alloyMat); bike.add(B.shock);
  // motor at the BB, battery on the downtube
  B.motor = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 14), darkMat); B.motor.position.copy(bb); B.motor.rotation.z = Math.PI / 2; B.motor.castShadow = true; bike.add(B.motor);
  B.batt = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.42), darkMat); B.batt.position.set(0, 0.72, 0.16); B.batt.rotation.x = -Math.atan2(head.y - bb.y, head.z - bb.z) + Math.PI / 2; B.batt.castShadow = true; bike.add(B.batt);
  B.battLed = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.1), new THREE.MeshBasicMaterial({ color: 0xc6ff3d })); B.battLed.position.set(0.04, 0, 0.08); B.batt.add(B.battLed);
  // cranks, seat
  B.crank = new THREE.Group(); B.crank.position.copy(bb); bike.add(B.crank);
  B.crank.add(tube(V3(0.09, 0.17, 0), V3(0.09, -0.17, 0), 0.012, darkMat), tube(V3(0.11, 0.17, 0), V3(0.16, 0.17, 0), 0.02, darkMat), tube(V3(-0.11, -0.17, 0), V3(-0.16, -0.17, 0), 0.02, darkMat));
  B.seat = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.28), darkMat); B.seat.position.set(0, 0.9, -0.4); bike.add(B.seat);
  B.post = tube(V3(0, 0.86, -0.42), V3(0, 0.9, -0.4), 0.014, alloyMat); bike.add(B.post);
  // headlamp
  B.lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 10), darkMat); B.lamp.position.set(0, 1.2, -0.1); B.lamp.rotation.x = Math.PI / 2; B.frontG.add(B.lamp);
  B.lampGlow = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), new THREE.MeshBasicMaterial({ color: 0xfff6d0 })); B.lampGlow.position.set(0, 0, 0.041); B.lamp.add(B.lampGlow);
  B.head = new THREE.SpotLight(0xfff1cc, 0, 60, 0.55, 0.5, 1.2); B.head.position.set(0, 1.2, 0); B.head.target.position.set(0, 0.2, 14); bike.add(B.head, B.head.target);
  // cargo rack + parcel
  B.rack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.36), darkMat); B.rack.position.set(0, 0.74, -0.6); bike.add(B.rack);
  B.parcel = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.3), new THREE.MeshLambertMaterial({ color: 0xb98b5a })); B.parcel.position.set(0, 0.87, -0.6); B.parcel.visible = false; B.parcel.castShadow = true; bike.add(B.parcel);
  // rider: hips on the seat, leaning over the bars
  B.rider = new THREE.Group(); bike.add(B.rider);
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a882 }), kit = new THREE.MeshLambertMaterial({ color: 0x2a3a4a }), helm = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 });
  B.torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.5, 0.2), kit); B.torso.position.set(0, 1.17, -0.08); B.torso.rotation.x = 0.62; B.torso.castShadow = true; B.rider.add(B.torso);
  B.headM = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), helm); B.headM.position.set(0, 1.5, 0.22); B.rider.add(B.headM);
  B.visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.06), darkMat); B.visor.position.set(0, 1.48, 0.33); B.rider.add(B.visor);
  B.armL = tube(V3(-0.16, 1.38, 0.1), V3(-0.33, 1.2, 0.4), 0.035, kit); B.armR = tube(V3(0.16, 1.38, 0.1), V3(0.33, 1.2, 0.4), 0.035, kit); B.rider.add(B.armL, B.armR);
  B.legL = new THREE.Group(); B.legR = new THREE.Group(); B.rider.add(B.legL, B.legR);
  B.legL.add(tube(V3(-0.1, 0.92, -0.36), V3(-0.15, 0.6, 0.02), 0.045, kit), tube(V3(-0.15, 0.6, 0.02), V3(-0.16, 0.2, -0.1), 0.04, kit));
  B.legR.add(tube(V3(0.1, 0.92, -0.36), V3(0.15, 0.6, 0.02), 0.045, kit), tube(V3(0.15, 0.6, 0.02), V3(0.16, 0.2, -0.1), 0.04, kit));
  B.legL.position.set(0, 0.92, -0.36); B.legR.position.set(0, 0.92, -0.36); B.legL.children.forEach(m => m.position.sub(V3(0, 0.92, -0.36))); B.legR.children.forEach(m => m.position.sub(V3(0, 0.92, -0.36)));
  bike.traverse(o => { if (o.isMesh) o.castShadow = true; });
}
function applyLoadout() {
  const o = GS.own, t = ST.tire;
  const bs = [1, 1.25, 1.5, 1.8][o.batt]; B.batt.scale.set(bs, bs, 1 + (bs - 1) * 0.35);
  const ms = [1, 1.1, 1.2, 1.3][o.torque]; B.motor.scale.set(ms, 1, ms);
  const fs = 1 + o.sus * 0.12; B.fork.scale.y = fs; B.shock.scale.set(1 + o.sus * 0.25, 1, 1 + o.sus * 0.25);
  tireMat.color.setHex(t.col);
  const ks = o.tire === "mud" ? 1.6 : o.tire === "gravel" ? 0.6 : 1; [B.front, B.rear].forEach(w => w.setKnobs(ks));
  B.rack.visible = true;
  applyPaint();
}
function applyPaint() {
  const c = new THREE.Color().setHSL(SET.hue / 360, SET.sat, 0.55); frameMat.color.copy(c);
  frameMat.metalness = SET.finish === "chrome" ? 0.95 : SET.finish === "matte" ? 0.05 : 0.4;
  frameMat.roughness = SET.finish === "chrome" ? 0.15 : SET.finish === "matte" ? 0.85 : 0.35;
  frameMat.needsUpdate = true;
}

/* ---------------- particles: dust, spray, rain ---------------- */
const PN = 900, pPos = new Float32Array(PN * 3), pLife = new Float32Array(PN), pVel = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3);
let pHead = 0;
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
function softDot() { const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d"), r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.5, "rgba(255,255,255,.35)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 32, 32); const t = new THREE.CanvasTexture(c); return t; }
const parts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.6, map: softDot(), transparent: true, opacity: 0.55, depthWrite: false, vertexColors: true })); parts.frustumCulled = false; scene.add(parts);
function emit(x, y, z, vx, vy, vz, life, r, g, b) { const i = pHead; pHead = (pHead + 1) % PN; pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z; pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz; pLife[i] = life; pCol[i * 3] = r; pCol[i * 3 + 1] = g; pCol[i * 3 + 2] = b; }
function updParts(dt) {
  for (let i = 0; i < PN; i++) {
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -999; continue; }
    pLife[i] -= dt; pVel[i * 3 + 1] -= 4 * dt; pVel[i * 3] *= 0.96; pVel[i * 3 + 2] *= 0.96;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}
const RN = 1400, rPos = new Float32Array(RN * 3), rGeo = new THREE.BufferGeometry(); rGeo.setAttribute("position", new THREE.BufferAttribute(rPos, 3));
const rain = new THREE.LineSegments(rGeo, new THREE.LineBasicMaterial({ color: 0xcfe0ee, transparent: true, opacity: 0 })); rain.frustumCulled = false; scene.add(rain);
{ for (let i = 0; i < RN / 2; i++) { rPos[i * 6] = (Math.random() - 0.5) * 40; rPos[i * 6 + 1] = Math.random() * 20; rPos[i * 6 + 2] = (Math.random() - 0.5) * 40; } }
function updRain(dt) {
  rain.material.opacity = GS.rain * 0.55; if (GS.rain < 0.02) return;
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, fall = 22;
  for (let i = 0; i < RN / 2; i++) {
    let y = rPos[i * 6 + 1] - fall * dt; if (y < -6) { y += 26; rPos[i * 6] = (Math.random() - 0.5) * 40; rPos[i * 6 + 2] = (Math.random() - 0.5) * 40; }
    rPos[i * 6 + 1] = y; rPos[i * 6 + 3] = rPos[i * 6] + 0.3 * dt; rPos[i * 6 + 4] = y + 0.7; rPos[i * 6 + 5] = rPos[i * 6 + 2];
  }
  rain.position.set(cx, cy, cz); rGeo.attributes.position.needsUpdate = true;
}

/* ---------------- input ---------------- */
const keys = new Set(), input = { thr: 0, brk: 0, back: 0, steer: 0, boost: 0, wh: 0 };
let camMode = 0;
const VIEWS = [{ n: "Chase", d: 6.2, h: 2.4, f: 62 }, { n: "Close chase", d: 3.8, h: 1.6, f: 66 }, { n: "First person", fp: true, f: 80 }, { n: "Drone", d: 14, h: 8, f: 52 }];
const camState = { init: false };
function cycleView() { camMode = (camMode + 1) % VIEWS.length; camState.init = false; toast(VIEWS[camMode].n + " view"); }
addEventListener("keydown", e => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code) || (started && e.ctrlKey && !e.metaKey)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (!started) return;
  if (e.code === "KeyR") resetBike();
  if (e.code === "KeyV" || e.code === "KeyC") cycleView();
  if (e.code === "KeyQ") setTier(GS.tier === 0 ? 1 : 0);
  if (e.code === "KeyH") $("help").hidden = !$("help").hidden;
  gameKey(e);
});
addEventListener("keyup", e => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
let padA = false, padB = false, padY = false, padLB = false, padSel = false, padR3 = false;
function readInput(dt) {
  let thr = (keys.has("KeyW") || keys.has("ArrowUp")) ? 1 : 0, back = (keys.has("KeyS") || keys.has("ArrowDown")) ? 1 : 0, brk = keys.has("Space") ? 1 : 0;
  let st = ((keys.has("KeyD") || keys.has("ArrowRight")) ? 1 : 0) - ((keys.has("KeyA") || keys.has("ArrowLeft")) ? 1 : 0);
  let boost = (keys.has("ShiftLeft") || keys.has("ShiftRight")) ? 1 : 0, wh = (keys.has("ControlLeft") || keys.has("ControlRight")) ? 1 : 0, analog = null;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp) continue;
    const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.12) analog = ax;
    const ay = gp.axes[1] || 0; if (ay < -0.4) thr = Math.max(thr, 1); if (ay > 0.4) back = 1;
    thr = Math.max(thr, gp.buttons[7] ? gp.buttons[7].value : 0); brk = Math.max(brk, gp.buttons[6] ? gp.buttons[6].value : 0);
    if (gp.buttons[5] && gp.buttons[5].pressed) boost = 1;
    if (gp.buttons[2] && gp.buttons[2].pressed) wh = 1;
    const lb = gp.buttons[4] && gp.buttons[4].pressed; if (lb && !padLB) setTier(GS.tier === 0 ? 1 : 0); padLB = lb;
    const a = gp.buttons[0] && gp.buttons[0].pressed; if (a && !padA && started) padPrimary(); padA = a;
    const b = gp.buttons[1] && gp.buttons[1].pressed; if (b && !padB && started) { if (GS.boardOpen) closeBoard(); else if (GS.garageOpen) closeGarage(); else if (!$("settings").hidden) toggleSettings(false); } padB = b;
    const y = gp.buttons[3] && gp.buttons[3].pressed; if (y && !padY && started) toggleGarage(); padY = y;
    const s = gp.buttons[8] && gp.buttons[8].pressed; if (s && !padSel && started) resetBike(); padSel = s;
    const v = gp.buttons[11] && gp.buttons[11].pressed; if (v && !padR3 && started) cycleView(); padR3 = v;
    break;
  }
  input.thr = thr; input.back = back; input.brk = brk; input.boost = boost; input.wh = wh;
  if (analog !== null) input.steer = analog;
  else input.steer += (st - input.steer) * (1 - Math.exp(-(st === 0 ? 10 : 6) * dt));
}
function padPrimary() { if (GS.boardOpen) return; if (nearSite("home")) openBoard(); }
function setTier(t) { GS.tier = t; toast(["Eco assist", "Trail assist"][t]); }

/* ---------------- physics ---------------- */
const MASS = 98, G = 9.81, DRAIN = 6;   // game minutes are short, so the pack drains six times faster than the maths says
const SPAWN = { x: site("garage").x - 5, z: site("garage").z + 7, yaw: Math.PI };
const P = { x: SPAWN.x, y: 0, z: SPAWN.z, vx: 0, vy: 0, vz: 0, yaw: SPAWN.yaw, yr: 0, lean: 0, pitch: 0, pitchV: 0, airT: 0, airPeak: 0, gnd: true,
  susF: 0, susR: 0, susFV: 0, susRV: 0, wh: 0, whRun: 0, whBest: 0, slide: 0, grip: 1, surf: 0, rut: 0, crash: 0, crashSpin: 0, shake: 0, dist: 0, stuckT: 0, odo: 0, wheelSpin: 0, crank: 0, spd: 0, grade: 0, launched: 0 };
function resetBike() {
  const spot = P.safe || SPAWN;
  P.x = spot.x; P.z = spot.z; P.yaw = spot.yaw; P.y = surf(P.x, P.z);
  P.vx = P.vz = P.vy = 0; P.yr = 0; P.lean = 0; P.pitch = 0; P.pitchV = 0; P.crash = 0; P.airT = 0; P.wh = 0; P.slide = 0; P.stuckT = 0;
  GS.heat = Math.min(GS.heat, 0.5);
  if (started) toast("Back on the bike.");
}
function nearSite(type, r) { for (const s of SITES) if ((type === s.type || type === s.id) && Math.hypot(P.x - s.x, P.z - s.z) < (r || s.r) + 4) return s; return null; }
let dustAcc = 0;
function physStep(dt) {
  const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), lx = fz, lz = -fx;
  const hs = surf(P.x, P.z), gnd = P.y <= hs + 0.1;
  const e = 0.9, gx = (groundAt(P.x + e, P.z) - groundAt(P.x - e, P.z)) / (2 * e), gz = (groundAt(P.x, P.z + e) - groundAt(P.x, P.z - e)) / (2 * e);
  let vx = P.vx, vz = P.vz;
  const vf = vx * fx + vz * fz, spd = Math.hypot(vx, vz);
  P.spd = spd;
  const sf = surfAt(P.x, P.z), S = SURF[sf]; P.surf = sf;
  const grade = gx * fx + gz * fz; P.grade = grade;      // >0 uphill ahead
  const crashed = P.crash > 0;
  // ---- e-bike: assist tiers, boost, heat, regen ----
  const pedaling = !crashed && input.thr > 0 && GS.batt >= 0;
  const boosting = pedaling && input.boost && GS.cut <= 0 && GS.batt > 0;
  const tierW = pedaling && GS.batt > 0 && GS.cut <= 0 ? (boosting ? ST.boostW : GS.tier === 0 ? 220 : 420) * ST.torque : 0;
  const humanW = pedaling ? 260 * (1 - GS.dmg * 0.2) : 0;
  GS.boost = boosting;
  if (pedaling && tierW > 0 && started) GS.batt = Math.max(0, GS.batt - DRAIN * tierW * (0.55 + Math.max(0, grade) * 2.2) / 3600 / ST.cap * dt * (boosting ? 1.0 : 0.8) * (ST.tire.roll || 1) * clamp(0.3 + spd / 6, 0.3, 1));
  // heat: boost cooks it, climbs cook it faster; cutout for a few seconds at the top
  const heatIn = boosting ? 0.08 * (1 + Math.max(0, grade) * 5) : tierW > 0 ? 0.012 * (1 + Math.max(0, grade) * 3) * (GS.tier ? 1 : 0.5) : 0;
  GS.heat = clamp(GS.heat + (heatIn / ST.heatCap - ST.cool * (0.6 + Math.min(spd, 12) / 12) * (GS.rain > 0.3 ? 1.5 : 1)) * dt, 0, 1);
  if (GS.heat >= 1 && GS.cut <= 0) { GS.cut = 4.5; toast("Motor overheated. Assist cut.", "bad"); }
  if (GS.cut > 0) { GS.cut -= dt; if (GS.cut <= 0) { GS.heat = Math.min(GS.heat, 0.55); toast("Assist back.", "good"); } }
  // regen: coasting downhill with no pedal, or braking at speed
  let regen = 0;
  if (!pedaling && gnd && spd > 3 && !crashed) {
    const down = Math.max(0, -grade), brk = input.brk + input.back * 0.6;
    regen = (down * spd * 0.9 + brk * spd * 0.6 + (spd > 6 ? 0.05 : 0)) * ST.regen;
    GS.batt = Math.min(1, GS.batt + DRAIN * regen * 6 / 3600 / ST.cap * dt * 60);
  }
  GS.regen = regen;
  // ---- wheelie / manual ----
  const whOn = !crashed && input.wh && gnd && Math.abs(vf) > 2 && (pedaling || vf > 6);
  P.wh = clamp(P.wh + (whOn ? 2.2 : -3) * dt, 0, 1);
  if (P.wh > 0.7 && gnd) { P.whRun += Math.abs(vf) * dt; if (P.whRun > P.whBest) P.whBest = P.whRun; } else if (P.wh < 0.2) P.whRun = 0;
  // ---- steering: lean the bike, the lean turns it. more speed = more lean, slower yaw ----
  const spf = clamp(Math.abs(vf) / 3, 0, 1) / (1 + Math.abs(vf) / 34);
  const leanTgt = crashed ? 0 : input.steer * clamp(Math.abs(vf) / 9, 0.12, 1) * 0.62;
  P.lean += (leanTgt - P.lean) * (1 - Math.exp(-(gnd ? 8 : 3) * dt));
  const tgt = crashed ? 0 : -input.steer * (2.3 - 0.5 * P.wh) * spf * (vf < -0.3 ? -1 : 1) * (1 - ST.travel * 1.6 + 0.16);   // long travel = lazier
  if (gnd) P.yr += (tgt - P.yr) * (1 - Math.exp(-(7 - P.slide * 4) * dt));
  else P.yr *= Math.exp(-1.2 * dt);
  const dyaw = P.yr * dt; P.yaw += dyaw;
  if (gnd) {
    // grip: surface × wetness × tyres × damage, ruts you already cut hold the tyre
    const wet = GS.wet, base = lerp(S.grip, S.wetGrip, wet) * (ST.tire.grip[sf] || 1) * (1 - GS.dmg * 0.15);
    const rd = rutDepth(P.x, P.z), rut = clamp(rd / 0.06, 0, 1) * S.rut; P.rut = rut;
    const mu = base * (1 + rut * 0.35) * lerp(1, 0.75, P.wh);
    P.grip = mu;
    // the turn: velocity follows the nose only as far as the tyres can hold it; the rest becomes slide
    const share = clamp(mu * 0.8, 0.2, 0.95), a = dyaw * share, ca = Math.cos(a), sa = Math.sin(a);
    const nvx = vx * ca + vz * sa, nvz = vz * ca - vx * sa; vx = nvx; vz = nvz;
    // gravity along the slope
    const g2 = gx * gx + gz * gz; vx -= G * gx / (1 + g2) * dt; vz -= G * gz / (1 + g2) * dt;
    // drive: power over speed, capped by a torque limit and by what the rear tyre can push
    let F = 0;
    if (!crashed) {
      const W = humanW + tierW;
      if (W > 0) F += Math.min(W / Math.max(Math.abs(vf), 1.4), 260 * ST.torque + (boosting ? 140 : 0)) * (vf < -0.5 ? 0.35 : 1);
      if (input.back > 0 && vf <= 0.5 && !pedaling) F -= 55 * input.back;   // S with no speed on: creep backwards
    }
    if (F > 0) F = Math.min(F, mu * MASS * G * 0.75);
    vx += F / MASS * fx * dt; vz += F / MASS * fz * dt;
    // brakes always work against the direction of travel and can only ever bring it to a stop
    if (!crashed && (input.brk > 0 || (input.back > 0 && vf > 0.5))) {
      const B = (input.brk > 0 ? (Math.abs(vf) > 0.5 ? 520 : 140) * input.brk * (0.7 + mu * 0.4) : 0) + (input.back > 0 && vf > 0.5 ? 260 * input.back : 0);
      const vf2 = vx * fx + vz * fz, dv = Math.min(Math.abs(vf2), B / MASS * dt) * Math.sign(vf2);
      vx -= dv * fx; vz -= dv * fz;
    }
    // rolling and aero drag; mud and ruts you didn't cut drag hard
    const roll = lerp(S.roll, S.roll * 1.6, wet) * ST.roll * (1 - rut * 0.4) * MASS * G, aero = 0.32 * spd * spd;
    const sp = Math.hypot(vx, vz);
    if (sp > 0.01) { const dv = Math.min(sp, (roll + aero + (crashed ? 400 : 0)) / MASS * dt); vx -= vx / sp * dv; vz -= vz / sp * dv; }
    // lateral: Coulomb grip. beyond the limit the bike slides, and keeps sliding
    const vl = vx * lx + vz * lz, lim = mu * G * dt * (P.slide > 0.5 ? 0.85 : 1.15);
    let rem;
    if (Math.abs(vl) <= lim) { rem = vl; P.slide = Math.max(0, P.slide - 3 * dt); }
    else { rem = Math.sign(vl) * lim; P.slide = Math.min(1, P.slide + 4 * dt); }
    vx -= rem * lx; vz -= rem * lz;
    // sliding: the bike turns into the slide a little, like a foot down
    if (P.slide > 0.3) P.yr -= Math.sign(vl) * P.slide * 1.2 * dt;
    // ruts: cut the ground under the tyres
    if (sp > 1) {
      const cap = S.rut * 0.11 * ST.tire.rut * lerp(1, 1.6, wet), amt = (0.004 + sp * 0.0009 + Math.abs(vl) * 0.004) * (1 + wet);
      if (cap > 0) { stampRut(P.x + fx * 0.6, P.z + fz * 0.6, amt, cap); stampRut(P.x - fx * 0.6, P.z - fz * 0.6, amt * 1.2, cap); }
    }
    // spray & dust
    const dustK = sf === S_MUD || wet > 0.5 ? 0.6 : S.dust;
    dustAcc += (0.15 + Math.abs(vl) * 1.2 + P.slide * 2 + (input.brk * 2)) * Math.min(sp, 14) * dt * dustK;
    while (dustAcc > 1) {
      dustAcc -= 1; const side = (Math.random() - 0.5) * 0.4, mud = sf === S_MUD || wet > 0.5;
      const c = mud ? [0.25, 0.18, 0.12] : sf === S_ROCK || sf === S_GRAVEL ? [0.6, 0.6, 0.6] : [0.55, 0.42, 0.27];
      emit(P.x - fx * 0.7 + lx * side, P.y + 0.1, P.z - fz * 0.7 + lz * side, -fx * sp * 0.2 + vx * 0.2 + (Math.random() - 0.5) * 2, 1 + sp * 0.12 + (mud ? 1.5 : 0), -fz * sp * 0.2 + vz * 0.2 + (Math.random() - 0.5) * 2, mud ? 0.8 : 1.4, c[0], c[1], c[2]);
    }
    // small bumps feed the suspension
    const rough = sf === S_ROCK ? 0.5 : sf === S_GRAVEL ? 0.35 : sf === S_TRAIL ? 0.08 : 0.2;
    P.susFV += (Math.random() - 0.5) * rough * sp * 0.25 * dt * 60; P.susRV += (Math.random() - 0.5) * rough * sp * 0.25 * dt * 60;
    P.pitchV *= Math.exp(-8 * dt); P.pitch += (0 - P.pitch) * (1 - Math.exp(-10 * dt));
  } else {
    // in the air: W/S pull the nose up or push it down. A/D lean a little.
    P.pitchV += (crashed ? 0 : (input.thr - input.back * 1.2)) * 3.2 * dt; P.pitchV *= Math.exp(-1.6 * dt);
    P.pitch = clamp(P.pitch + P.pitchV * dt, -1.1, 1.1);
    P.slide = 0; P.rut = 0; P.launched = Math.max(0, P.launched - dt);
    const sp = Math.hypot(vx, vz); if (sp > 0.01) { const dv = Math.min(sp, 0.32 * sp * sp / MASS * dt); vx -= vx / sp * dv; vz -= vz / sp * dv; }
  }
  P.vy -= G * dt;
  P.x += vx * dt; P.z += vz * dt; P.y += P.vy * dt;
  P.vx = vx; P.vz = vz;
  // ground contact
  const hs2 = surf(P.x, P.z), sv = vx * gx + vz * gz;
  const impact = Math.max(0, sv - P.vy);
  if (P.y <= hs2) { P.y = hs2; if (P.vy < sv) P.vy = sv; }
  else { P.airT += dt; P.airPeak = Math.max(P.airPeak, P.y - hs2); }
  const wasAir = P.airT, peak = P.airPeak;
  P.gnd = P.y <= hs2 + 0.1;
  if (P.gnd && wasAir > 0.25 && peak > 0.3) {
    // landing: compare the bike's pitch to the slope it lands on
    const slopeAng = Math.atan(gx * fx + gz * fz), att = P.pitch - slopeAng;   // + nose up
    const travel = ST.travel, soak = clamp(impact / (7 + travel * 60), 0, 1.6);
    P.susFV -= impact * (att < 0 ? 1.4 : 0.6) * (1 - travel * 2); P.susRV -= impact * (att > 0 ? 1.4 : 0.7) * (1 - travel * 2);
    let bad = 0;
    if (att < -0.3) bad = (-att - 0.3) * 2.2 + soak * 0.5;      // nose-first: the worst way down
    else if (att > 0.45) bad = (att - 0.45) * 1.2 + soak * 0.3;  // tail-first: a bounce
    else bad = Math.max(0, soak - 1) * 0.6;                       // flat but hard
    P.shake = Math.max(P.shake, Math.min(0.9, 0.15 + soak * 0.3 + bad * 0.3));
    if (bad > 1.1 || impact > 13 + travel * 40) { crash(impact, "landing"); }
    else if (bad > 0.35) { const bite = Math.min(0.45, bad * 0.3); P.vx *= 1 - bite; P.vz *= 1 - bite; cargoHit(bad * 30); thud(Math.min(1, 0.4 + bad * 0.3)); toast(att < 0 ? "Nose heavy. Ugly." : "Cased it.", "warn"); }
    else { if (impact > 4) thud(Math.min(1, impact / 14)); if (P.launched > 0 && impact > 2.5 && started) { toast("Clean landing.", "good"); GS.cash += 0; } }
    P.pitchV = 0; P.pitch *= 0.3; P.airT = 0; P.airPeak = 0; P.launched = 0;
  } else if (P.gnd) { P.airT = 0; P.airPeak = 0; }
  else if (P.airT > 0.3 && peak > 1.2) P.launched = 1;
  // suspension spring/damper
  const k = 90 - ST.travel * 200, c = 9;
  P.susFV += (-k * P.susF - c * P.susFV) * dt; P.susF = clamp(P.susF + P.susFV * dt, -0.3, 1);
  P.susRV += (-k * P.susR - c * P.susRV) * dt; P.susR = clamp(P.susR + P.susRV * dt, -0.3, 1);
  if (crashed) { P.crash -= dt; P.crashSpin += dt * 3; if (P.crash <= 0) { P.crash = 0; P.crashSpin = 0; P.lean = 0; } }
  collide(fx, fz);
  P.odo += Math.abs(vf) * dt; P.dist += spd * dt;
  P.wheelSpin += vf / 0.35 * dt; P.crank += (pedaling ? clamp(vf, 1.5, 8) * 0.9 : 0) * dt;
  if (gnd && spd < 0.4 && !crashed && input.thr > 0 && (slopeAt(P.x, P.z) > 0.6 || nearObs(P.x, P.z, 1.2).length)) P.stuckT += dt; else P.stuckT = 0;
  if (gnd && !crashed && spd > 1 && P.slide < 0.2 && slopeAt(P.x, P.z) < 0.5) P.safe = { x: P.x, z: P.z, yaw: P.yaw };
}
function crash(impact, why) {
  if (P.crash > 0) return;
  P.crash = 2.0 + Math.min(1.2, impact * 0.05); P.crashSpin = 0; P.crashWhy = why;
  GS.runCrash++; GS.dmg = Math.min(1, GS.dmg + 0.12 + impact * 0.008);
  cargoHit(20 + impact * 3);
  thud(1); P.shake = 0.9;
  toast(why === "tree" ? "Into a tree. That's a crash." : why === "rock" ? "Rock. Rider down." : "Rider thrown.", "bad");
}
function collide(fx, fz) {
  for (const o of nearObs(P.x, P.z, 4)) {
    const dx = P.x - o.x, dz = P.z - o.z, d = Math.hypot(dx, dz), R = o.r + 0.35;
    if (d >= R || d < 1e-4) continue;
    if (o.tree && P.y > o.h + 6) continue;
    const nx = dx / d, nz = dz / d, vn_ = P.vx * nx + P.vz * nz;
    P.x = o.x + nx * R; P.z = o.z + nz * R;
    if (vn_ < 0) {
      const hit = -vn_;
      P.vx -= nx * vn_ * 1.4; P.vz -= nz * vn_ * 1.4; P.vx *= 0.7; P.vz *= 0.7;
      if (hit > 6.5) crash(hit, o.tree ? "tree" : o.rock ? "rock" : "wall");
      else if (hit > 2.5) { P.shake = Math.max(P.shake, 0.4); cargoHit(hit * 3); thud(0.5); }
      P.yr *= 0.3;
    }
  }
}

/* ---------------- audio ---------------- */
let audio = null;
function initAudio() {
  if (audio) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain(); master.gain.value = SET.mute ? 0 : SET.vol; master.connect(ctx.destination);
    const motor = ctx.createOscillator(); motor.type = "sawtooth"; motor.frequency.value = 120;
    const mf = ctx.createBiquadFilter(); mf.type = "lowpass"; mf.frequency.value = 900; const mg = ctx.createGain(); mg.gain.value = 0;
    motor.connect(mf); mf.connect(mg); mg.connect(master); motor.start();
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const mk = (type, f, q) => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7; const g = ctx.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(master); s.start(); return { g, fl }; };
    const wind = mk("lowpass", 500), tyre = mk("bandpass", 1400, 0.5), rainN = mk("highpass", 3000);
    audio = { ctx, master, motor, mf, mg, wind, tyre, rainN };
  } catch (e) { audio = null; }
}
function thud(v) { if (!audio) return; const c = audio.ctx, o = c.createOscillator(), g = c.createGain(); o.type = "sine"; o.frequency.setValueAtTime(90, c.currentTime); o.frequency.exponentialRampToValueAtTime(35, c.currentTime + 0.18); g.gain.setValueAtTime(0.8 * v, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25); o.connect(g); g.connect(audio.master); o.start(); o.stop(c.currentTime + 0.3); }
function chime(good) { if (!audio) return; const c = audio.ctx; [0, 0.12, 0.24].forEach((t, i) => { const o = c.createOscillator(), g = c.createGain(); o.type = "triangle"; o.frequency.value = good ? [660, 880, 1320][i] : [440, 330, 220][i]; g.gain.setValueAtTime(0.25, c.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + 0.3); o.connect(g); g.connect(audio.master); o.start(c.currentTime + t); o.stop(c.currentTime + t + 0.35); }); }
function updAudio(dt) {
  if (!audio) return;
  const a = audio, t = a.ctx.currentTime, spd = P.spd;
  const W = GS.boost ? ST.boostW : input.thr > 0 && GS.batt > 0 && GS.cut <= 0 ? (GS.tier ? 420 : 220) : 0;
  a.motor.frequency.setTargetAtTime(90 + spd * 14 + W * 0.25, t, 0.08); a.mf.frequency.setTargetAtTime(500 + W * 1.5, t, 0.1);
  a.mg.gain.setTargetAtTime(W > 0 ? 0.05 + W / 8000 : 0, t, 0.1);
  a.wind.g.gain.setTargetAtTime(Math.min(0.5, spd / 26) * 0.5, t, 0.2); a.wind.fl.frequency.setTargetAtTime(300 + spd * 40, t, 0.2);
  const rough = P.gnd ? [0.4, 0.2, 0.9, 0.7, 0.5][P.surf] : 0;
  a.tyre.g.gain.setTargetAtTime(Math.min(0.35, spd / 20) * rough * 0.4 + P.slide * 0.25, t, 0.1); a.tyre.fl.frequency.setTargetAtTime(P.slide > 0.3 ? 2200 : 900 + spd * 30, t, 0.1);
  a.rainN.g.gain.setTargetAtTime(GS.rain * 0.12, t, 0.5);
}

/* ---------------- sky, time, weather ---------------- */
const dayFactor = () => { const el = Math.sin(((GS.hour % 24) - 6) / 12 * Math.PI); return sstep(-0.12, 0.18, el); };
const cTop = new THREE.Color(), cHor = new THREE.Color();
function updSky(dt) {
  GS.hour = (GS.hour + dt / 60) % 24;   // an hour a minute
  const day = dayFactor(), el = Math.sin(((GS.hour % 24) - 6) / 12 * Math.PI), az = ((GS.hour % 24) - 6) / 12 * Math.PI;
  const dusk = sstep(0.35, -0.05, el) * sstep(-0.3, 0, el);
  const rn = GS.rain;
  const rk = 0.12 + 0.88 * day;   // rain clouds go near-black at night
  cTop.setRGB(lerp(0.05, 0.28, day), lerp(0.06, 0.5, day), lerp(0.14, 0.86, day)).lerp(new THREE.Color(0x55606a).multiplyScalar(rk), rn * 0.8);
  cHor.setRGB(lerp(0.06, 0.85, day), lerp(0.07, 0.9, day), lerp(0.12, 0.93, day)).lerp(new THREE.Color(0xff8a4a), dusk * 0.7).lerp(new THREE.Color(0x707a82).multiplyScalar(rk), rn * 0.85);
  skyMat.uniforms.top.value.copy(cTop); skyMat.uniforms.hor.value.copy(cHor);
  const sd = new THREE.Vector3(Math.cos(az) * 0.7, Math.max(el, -0.2), -Math.sin(az) * 0.5).normalize();
  skyMat.uniforms.sunDir.value.copy(sd); skyMat.uniforms.glow.value = (1 - rn) * (0.4 + dusk);
  sun.position.copy(sd).multiplyScalar(180).add(bike.position); sun.target.position.copy(bike.position);
  sun.intensity = 1.5 * day * (1 - rn * 0.75); sun.color.setRGB(1, lerp(0.55, 0.95, 1 - dusk), lerp(0.35, 0.85, 1 - dusk));
  hemi.intensity = lerp(0.08, 0.75, day) * (1 - rn * 0.3);
  FOG.copy(cHor); scene.fog.color.copy(FOG); scene.fog.density = 0.0022 + rn * 0.006 + (1 - day) * 0.001;
  stars.material.opacity = (1 - day) * (1 - rn) * 0.9; stars.position.copy(camera.position); sky.position.copy(camera.position);
  const dark = 1 - day;
  B.head.intensity = dark * 2.6 + rn * 0.4; B.lampGlow.material.color.setScalar(0.3 + B.head.intensity * 0.3);
  for (const l of siteLights) l.intensity = dark * (l.flicker ? 1.6 + Math.sin(performance.now() / 70) * 0.5 : 1.4);
  // rain fronts roll through every few minutes
  GS.rainT -= dt;
  if (GS.rainT <= 0) { GS.rainTgt = GS.rainTgt > 0.2 ? 0 : (Math.random() < 0.55 ? 0.5 + Math.random() * 0.5 : 0); GS.rainT = GS.rainTgt > 0 ? 60 + Math.random() * 90 : 90 + Math.random() * 150; if (GS.rainTgt > 0 && started) toast("Rain coming in.", "warn"); }
  GS.rain += (GS.rainTgt - GS.rain) * (1 - Math.exp(-0.15 * dt));
  GS.wet = clamp(GS.wet + (GS.rain > 0.2 ? 0.05 * GS.rain : -0.012 * (0.5 + day)) * dt, 0, 1);
  $("rain").style.opacity = GS.rain * 0.9;
}

/* ---------------- visuals / camera / hud ---------------- */
const angLerp = (a, b, t) => { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; };
const SR = { on: false, a: 0, drag: false, lx: 0 };
const showroomOn = () => GS.garageOpen || !$("settings").hidden;
function updVisuals(dt) {
  const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
  // the bike sits on its wheels: sample the ground under each axle for pitch
  const hf = surf(P.x + fx * 0.6, P.z + fz * 0.6), hr = surf(P.x - fx * 0.6, P.z - fz * 0.6);
  const gp = P.gnd ? Math.atan2(hf - hr, 1.2) : 0;
  bike.position.set(P.x, P.y + (P.gnd ? -(P.susF + P.susR) * 0.02 : 0), P.z);
  const wh = P.wh * 0.62, crashRoll = P.crash > 0 ? Math.sin(Math.min(P.crashSpin, Math.PI / 2)) * 1.3 : 0;
  const pitch = P.gnd ? gp + wh - (P.susF - P.susR) * 0.15 : P.pitch;
  bike.rotation.set(-pitch, P.yaw, P.lean + crashRoll, "YXZ");
  if (P.wh > 0.01) bike.position.y += Math.sin(wh) * 0.6;
  // suspension: fork slides, swingarm swings
  B.fork.position.y = -P.susF * ST.travel * 0.9; B.front.position.y = 0.35 - P.susF * ST.travel * 0.9;
  B.swing.rotation.x = -P.susR * ST.travel * 1.2; B.rear.position.y = 0.35 - P.susR * ST.travel * 0.55;
  B.frontG.rotation.y = -input.steer * 0.35 * (1 - clamp(P.spd / 12, 0, 0.85));
  B.front.sp.rotation.z = -P.wheelSpin; B.rear.sp.rotation.z = -P.wheelSpin; B.crank.rotation.x = P.crank;
  B.legL.rotation.x = Math.sin(P.crank) * 0.3; B.legR.rotation.x = -Math.sin(P.crank) * 0.3;
  // rider: leans with the bike, tucks at speed, stands up in the air and on rough ground
  const tuck = clamp(P.spd / 16, 0, 1) * 0.25, stand = P.gnd ? P.susF * 0.1 : 0.12;
  B.rider.position.y = stand; B.torso.rotation.x = 0.55 + tuck - (P.gnd ? 0 : 0.15); B.rider.rotation.z = -P.lean * 0.35 - input.steer * 0.1;
  B.headM.position.z = 0.22 + tuck * 0.2;
  B.rider.visible = !(P.crash > 0.6);
  B.parcel.visible = !!GS.job;
  // headlamp follows the bars
  B.head.target.position.set(Math.sin(B.frontG.rotation.y) * 8, 0.1, 14);
  // camera
  const view = VIEWS[camMode], hid = view.fp && !showroomOn();
  if (hid !== B.rider.hid) { B.rider.hid = hid; B.headM.visible = !hid; B.visor.visible = !hid; }
  let look = null;
  if (showroomOn()) {
    const s = site("garage"), ang = SR.a, cx = P.x + Math.sin(ang) * 3.6, cz = P.z + Math.cos(ang) * 3.6;
    camera.position.set(cx, P.y + 1.35, cz); camera.lookAt(P.x, P.y + 0.75, P.z);
    if (Math.abs(camera.fov - 45) > 0.05) { camera.fov = 45; camera.updateProjectionMatrix(); }
    if (!SR.drag) SR.a += dt * 0.25;
    camState.init = false;
    return;
  }
  if (view.fp) {
    const eye = new THREE.Vector3(0, 1.55 - tuck * 0.3, 0.1).applyEuler(bike.rotation).add(bike.position);
    if (!camState.init) { camState.fpYaw = P.yaw + Math.PI; camState.fpPitch = -0.1; camState.init = true; }
    camera.position.copy(eye); camera.position.y = Math.max(camera.position.y, surf(camera.position.x, camera.position.z) + 0.4);
    camState.fpYaw = angLerp(camState.fpYaw, P.yaw + Math.PI, 1 - Math.exp(-14 * dt));
    camState.fpPitch = lerp(camState.fpPitch, -0.1 + (P.gnd ? gp * 0.6 : P.pitch * 0.5), 1 - Math.exp(-6 * dt));
    camera.rotation.set(camState.fpPitch, camState.fpYaw, -P.lean * 0.5);
  } else {
    const want = new THREE.Vector3(P.x - fx * view.d, P.y + view.h, P.z - fz * view.d);
    if (!camState.init) { camera.position.copy(want); camState.init = true; }
    else camera.position.lerp(want, 1 - Math.exp(-6 * dt));
    camera.position.y = Math.max(camera.position.y, surf(camera.position.x, camera.position.z) + 0.7);
    look = new THREE.Vector3(P.x + fx * 2.5, P.y + 1.0, P.z + fz * 2.5);
  }
  const sh = P.shake * 0.12; P.shake = Math.max(0, P.shake - dt * 2.2);
  camera.position.x += (Math.random() - 0.5) * sh; camera.position.y += (Math.random() - 0.5) * sh;
  if (look) camera.lookAt(look);
  const fov = view.f + Math.min(P.spd, 20) * 0.5 + (GS.boost ? 3 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-3 * dt)); camera.updateProjectionMatrix(); }
}
let hudT = 0;
function updHud(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.08;
  const mph = Math.round(P.spd * 2.237); $("spd").textContent = mph;
  const pill = $("pill"), s = SURF[P.surf].n; if (pill.dataset.s !== s) { pill.dataset.s = s; pill.textContent = s; }
  const tier = $("tier"), tn = GS.cut > 0 ? "CUT" : GS.batt <= 0 ? "FLAT" : GS.boost ? "BOOST" : GS.tier ? "TRAIL" : "ECO";
  if (tier.dataset.t !== tn) { tier.dataset.t = tn; tier.textContent = tn === "FLAT" ? "NO BATTERY" : tn; }
  const bf = $("battFill"); bf.style.width = (GS.batt * 100) + "%"; bf.classList.toggle("regen", GS.regen > 0.2); bf.classList.toggle("low", GS.batt < 0.15);
  $("battV").textContent = Math.round(GS.batt * 100) + "%";
  const hf = $("heatFill"); hf.style.width = (GS.heat * 100) + "%"; hf.classList.toggle("hot", GS.heat > 0.8);
  $("heatV").textContent = GS.cut > 0 ? "cut" : GS.heat > 0.8 ? "hot" : GS.heat > 0.4 ? "warm" : "cool";
  $("gripFill").style.width = (clamp(P.grip / 1.3, 0, 1) * 100) + "%"; $("gripV").textContent = P.slide > 0.3 ? "SLIDE" : P.rut > 0.3 ? "rut +" : GS.wet > 0.4 ? "wet" : "—";
  $("bonus").textContent = P.wh > 0.7 && P.whRun > 3 ? "Wheelie " + P.whRun.toFixed(0) + " m" : P.launched ? "AIR" : "";
  const h = Math.floor(GS.hour), m = Math.floor((GS.hour % 1) * 60);
  $("clock").textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} · ${GS.rain > 0.3 ? "Rain" : GS.wet > 0.4 ? "Wet" : dayFactor() < 0.3 ? "Dark" : "Clear"} · $${GS.cash}`;
  $("elev").textContent = `Elev ${Math.round(P.y)} m · ${Math.round(Math.abs(P.grade) * 100)}% ${P.grade > 0.02 ? "climb" : P.grade < -0.02 ? "descent" : "flat"}`;
  const zone = P.y > 150 ? "THE RIDGE" : P.x < -120 ? "WEST SLOPE" : P.x > 110 ? "EAST BLUFFS" : "CANYON FLOOR";
  const near = nearSite("drop") || nearSite("home") || nearSite("shed");
  $("zoneName").textContent = near ? near.n.toUpperCase() : zone;
  $("flip").hidden = !(P.stuckT > 2.5);
  $("dist").textContent = (P.dist / 1000).toFixed(1) + " km";
  updJobHud(); drawMap();
}

/* ---------------- minimap ---------------- */
let mapBg = null; const MAPW = 600;
function buildMapBg() {
  mapBg = document.createElement("canvas"); mapBg.width = mapBg.height = 300; const g = mapBg.getContext("2d"), img = g.createImageData(300, 300);
  for (let j = 0; j < 300; j++) for (let i = 0; i < 300; i++) {
    const x = i / 300 * WORLD - HALF, z = j / 300 * WORLD - HALF, gi = clamp(Math.round((x + HALF) / GRES), 0, GN - 1), gj = clamp(Math.round((z + HALF) / GRES), 0, GN - 1), k = gj * GN + gi;
    const c = SURF[surfG[k]].col, sh = 0.7 + clamp((ground[gj * GN + Math.min(GN - 1, gi + 2)] - ground[k]) * 0.08, -0.3, 0.3), o = (j * 300 + i) * 4;
    img.data[o] = c[0] * 255 * sh; img.data[o + 1] = c[1] * 255 * sh; img.data[o + 2] = c[2] * 255 * sh; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = "rgba(255,200,120,.9)"; g.lineWidth = 1.2;
  for (const T of TRAILS) { const d = densify(T, 4); g.beginPath(); d.forEach((p, i) => { const mx = (p[0] + HALF) / WORLD * 300, mz = (p[1] + HALF) / WORLD * 300; i ? g.lineTo(mx, mz) : g.moveTo(mx, mz); }); g.stroke(); }
}
function drawMap() {
  const c = $("map"), g = c.getContext("2d"), W = c.width, sc = W / MAPW;
  g.clearRect(0, 0, W, W); g.save(); g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, TAU); g.clip();
  g.fillStyle = "#0f1712"; g.fillRect(0, 0, W, W);
  const ox = W / 2 - (P.x + HALF) * sc, oz = W / 2 - (P.z + HALF) * sc;
  g.drawImage(mapBg, ox, oz, WORLD * sc, WORLD * sc);
  for (const s of SITES) {
    const mx = ox + (s.x + HALF) * sc, mz = oz + (s.z + HALF) * sc, tgt = GS.job && GS.job.to === s.id;
    g.fillStyle = tgt ? "#c6ff3d" : s.type === "home" ? "#7fd0e6" : s.type === "shed" ? "#7fd0e6" : "#eef3e6";
    g.beginPath(); g.arc(mx, mz, tgt ? 7 : 4.5, 0, TAU); g.fill();
    if (tgt) { g.strokeStyle = "#c6ff3d"; g.lineWidth = 2; g.beginPath(); g.arc(mx, mz, 11 + Math.sin(performance.now() / 200) * 2, 0, TAU); g.stroke(); }
  }
  g.translate(W / 2, W / 2); g.rotate(-P.yaw + Math.PI);
  g.fillStyle = "#ff7a2f"; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 8); g.lineTo(0, 4); g.lineTo(-6, 8); g.closePath(); g.fill();
  g.restore();
  g.strokeStyle = "rgba(238,243,230,.25)"; g.lineWidth = 2; g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 1, 0, TAU); g.stroke();
}

/* ---------------- courier loop ---------------- */
const CARGO = [
  { k: "parcel", n: "Parcel", d: "Boxes, mail, someone's new boots.", mult: 1 },
  { k: "fragile", n: "Fragile", d: "Glass, a radio, eggs. Crashes cost you.", mult: 1.35, fragile: true },
  { k: "perish", n: "Perishable", d: "Ice cream, blood samples, hot food. Every minute costs.", mult: 1.5, perish: true },
  { k: "parts", n: "Parts run", d: "Brake pads and a chain for the shed.", mult: 1.15, parts: true },
];
const jobGeom = (a, b) => { const dist = Math.hypot(a.x - b.x, a.z - b.z), climb = Math.max(0, b.y - a.y); return { dist, climb, est: dist / 6 + climb * 1.6 + 30 }; };
function makeJobs() {
  const home = site("garage"), rnd = Math.random, out = [], drops = SITES.filter(s => s.type === "drop");
  const deck = CARGO.slice().sort(() => rnd() - 0.5), used = new Set();
  for (let i = 0; i < 3; i++) {
    const c = deck[i];
    let to = c.parts ? site("shed") : drops[Math.floor(rnd() * drops.length)];
    if (!c.parts) { let g = 0; while (used.has(to.id) && g++ < 6) to = drops[Math.floor(rnd() * drops.length)]; }
    used.add(to.id);
    const gm = jobGeom(home, to), pay = Math.round((25 + gm.dist * 0.12 + gm.climb * 0.9) * c.mult);
    out.push({ id: i, cargo: c, to: to.id, from: "garage", pay, est: gm.est, cond: 1, t: 0 });
  }
  GS.jobs = out;
}
function acceptJob(j) {
  if (GS.job) { toast("Rack's full.", "warn"); return; }
  GS.job = Object.assign({}, j, { t: 0, cond: 1, startBatt: GS.batt, crashes: GS.runCrash }); GS.jobs = [];
  closeBoard(); toast(`${j.cargo.n} for ${site(j.to).n}. ${j.pay}$ on delivery.`, "good"); chime(true);
}
function cargoHit(v) { if (!GS.job) return; const j = GS.job; const loss = v / 100 * (j.cargo.fragile ? 1.6 : 0.5); j.cond = Math.max(0, j.cond - loss); if (loss > 0.08) toast(`Cargo took a hit (${Math.round(j.cond * 100)}%).`, "warn"); }
function updJob(dt) {
  const j = GS.job; if (!j) return;
  j.t += dt;
  if (j.cargo.perish) j.cond = Math.max(0.2, j.cond - dt / (j.est * 2.2));
  const to = site(j.to);
  if (Math.hypot(P.x - to.x, P.z - to.z) < to.r && P.spd < 2.5) deliver(to, j);
}
function deliver(to, j) {
  let pay = Math.round(j.pay * j.cond), bonus = [];
  if (GS.runCrash === j.crashes) { pay += Math.round(j.pay * 0.2); bonus.push("no crash"); }
  if (j.t < j.est) { pay += Math.round(j.pay * 0.15); bonus.push("fast"); }
  if (j.startBatt - GS.batt < 0.25) { pay += Math.round(j.pay * 0.1); bonus.push("efficient"); }
  GS.cash += pay; GS.delivered++; GS.job = null;
  chime(true); toast(`Delivered to ${to.n}: $${pay}${bonus.length ? " · " + bonus.join(", ") : ""}.`, "good");
  if (to.type === "shed") { GS.dmg = 0; toast("Shed fixed the bike while you were in.", "good"); }
  // a return load, more often than not
  if (Math.random() < 0.65 && to.type === "drop") {
    const home = site("garage"), gm = jobGeom(to, home), c = CARGO[Math.random() < 0.5 ? 0 : 1], rp = Math.round((20 + gm.dist * 0.1) * c.mult);
    GS.job = { cargo: c, to: "garage", from: to.id, pay: rp, est: gm.est, cond: 1, t: 0, startBatt: GS.batt, crashes: GS.runCrash, ret: true };
    toast(`${to.n} has a ${c.n.toLowerCase()} going back to the garage: $${rp}.`);
  }
  save();
}
function updJobHud() {
  const j = GS.job, t = $("jobTitle"), s = $("jobSub");
  if (!j) { t.textContent = GS.jobs.length || !nearSite("home") ? "No cargo" : "No cargo"; s.textContent = nearSite("home") ? "Press E for the job board" : "Head back to the garage"; }
  else { const to = site(j.to); t.textContent = `${j.cargo.n} → ${to.n}`; const d = Math.hypot(P.x - to.x, P.z - to.z); s.textContent = `${(d / 1000).toFixed(2)} km · ${Math.round(j.cond * 100)}% · ${j.t < j.est ? "on time" : "late"} · $${Math.round(j.pay * j.cond)}`; }
  const to = j ? site(j.to) : site("garage");
  const ang = Math.atan2(to.x - P.x, to.z - P.z) - P.yaw;
  $("arrow").style.transform = `rotate(${-ang}rad)`; $("arrow").style.color = j ? (j.cond < 0.5 ? "#ff8a6a" : "var(--volt)") : "var(--slate)";
}
// charging at the garage and the shed
function updCharge(dt) {
  const s = nearSite("home") || nearSite("shed");
  if (s && P.spd < 1.5) {
    const rate = ST.charge * (s.type === "shed" ? 0.6 : 1);
    if (GS.batt < 1) { GS.batt = Math.min(1, GS.batt + rate * dt); if (GS.batt >= 1) toast("Battery full.", "good"); }
    GS.heat = Math.max(0, GS.heat - 0.2 * dt);
  }
}

/* ---------------- job board ---------------- */
function renderBoard() {
  $("boardCash").textContent = "$" + GS.cash; $("boardSlots").textContent = GS.job ? "Rack full" : "Rack empty";
  const L = $("jobList"); L.innerHTML = "";
  if (GS.job) L.innerHTML = `<div class="empty">You've got ${GS.job.cargo.n.toLowerCase()} for ${site(GS.job.to).n} on the rack. Deliver it first.</div>`;
  else GS.jobs.forEach((j, i) => {
    const b = document.createElement("button"); b.className = "row " + j.cargo.k; const to = site(j.to);
    b.innerHTML = `<kbd>${i + 1}</kbd><div class="main"><b>${j.cargo.n} → ${to.n}<span class="ctag">${j.cargo.k}</span></b><em>${j.cargo.d} ${(jobGeom(site("garage"), to).dist / 1000).toFixed(1)} km, ${Math.round(jobGeom(site("garage"), to).climb)} m up. About ${Math.round(j.est / 60)} min.</em></div><div class="pay">$${j.pay}</div>`;
    b.onclick = () => acceptJob(j); L.appendChild(b);
  });
  const sh = $("boardShop"); sh.innerHTML = "";
  const fix = document.createElement("button"); fix.className = "row two" + (GS.dmg < 0.05 ? " owned" : "");
  fix.innerHTML = `<div class="main"><b>Fix the bike</b><em>Damage ${Math.round(GS.dmg * 100)}%. Bent things steer worse and pedal worse.</em></div><div class="pay">$${Math.round(GS.dmg * 120)}</div>`;
  fix.onclick = () => { const c = Math.round(GS.dmg * 120); if (GS.dmg < 0.05) return; if (GS.cash < c) { toast("Not enough cash.", "warn"); return; } GS.cash -= c; GS.dmg = 0; renderBoard(); toast("Straightened out.", "good"); save(); };
  sh.appendChild(fix);
  const wb = document.createElement("button"); wb.className = "row two"; wb.innerHTML = `<div class="main"><b>Workbench</b><em>Batteries, motor tunes, tyres, suspension. Press G any time you're here.</em></div><div class="pay">→</div>`;
  wb.onclick = () => { closeBoard(); openGarage(); }; sh.appendChild(wb);
}
function openBoard() { if (!GS.jobs.length) makeJobs(); GS.boardOpen = true; renderBoard(); $("board").hidden = false; }
function closeBoard() { GS.boardOpen = false; $("board").hidden = true; }
function gameKey(e) {
  if (e.code === "Escape") { if (GS.boardOpen) closeBoard(); else if (GS.garageOpen) closeGarage(); else toggleSettings(); return; }
  if (e.code === "KeyE") { if (GS.boardOpen) closeBoard(); else if (nearSite("home")) openBoard(); else toast("The job board is at the garage."); return; }
  if (e.code === "KeyG") { toggleGarage(); return; }
  if (GS.boardOpen && /^Digit[1-3]$/.test(e.code)) { const j = GS.jobs[+e.code[5] - 1]; if (j) acceptJob(j); }
}

/* ---------------- workbench / garage ---------------- */
let gTab = "Battery";
function toggleGarage() { if (GS.garageOpen) closeGarage(); else if (nearSite("home")) openGarage(); else toast("The workbench is at the garage."); }
function openGarage() { GS.garageOpen = true; $("garage").hidden = false; $("srHint").hidden = false; document.body.classList.add("showroom"); renderGarage(); }
function closeGarage() { GS.garageOpen = false; $("garage").hidden = true; $("srHint").hidden = true; document.body.classList.remove("showroom"); preview(null); }
let previewing = null;
function preview(p) { previewing = p; if (p) { const keep = GS.own[p.k]; GS.own[p.k] = p.v; ST = stats(); applyLoadout(); GS.own[p.k] = keep; ST = stats(); } else applyLoadout(); }
function renderGarage() {
  $("garageCash").textContent = "$" + GS.cash;
  const tabs = $("garageTabs"); tabs.innerHTML = "";
  for (const t of ["Battery", "Motor", "Tyres", "Suspension", "Paint"]) { const b = document.createElement("button"); b.className = "sbtn" + (t === gTab ? " on" : ""); b.textContent = t; b.onclick = () => { gTab = t; renderGarage(); }; tabs.appendChild(b); }
  const body = $("garageBody"); body.innerHTML = "";
  if (gTab === "Paint") { closeGarage(); toggleSettings(true); return; }
  if (gTab === "Tyres") {
    for (const id in TIRES) {
      const t = TIRES[id], owned = GS.own.tires.includes(id), fitted = GS.own.tire === id;
      const b = document.createElement("button"); b.className = "row two" + (fitted ? " fitted" : "");
      b.innerHTML = `<div class="main"><b>${t.n}</b><em>${t.d}</em></div><div class="pay">${fitted ? "fitted" : owned ? "fit" : "$" + t.cost}</div>`;
      b.onmouseenter = () => preview({ k: "tire", v: id }); b.onmouseleave = () => preview(null);
      b.onclick = () => { if (!owned) { if (GS.cash < t.cost) { toast("Not enough cash.", "warn"); return; } GS.cash -= t.cost; GS.own.tires.push(id); } GS.own.tire = id; restat(); save(); renderGarage(); toast(t.n + " fitted.", "good"); };
      body.appendChild(b);
    }
    return;
  }
  for (const k in UPG) {
    const u = UPG[k]; if (u.cat !== gTab) continue;
    const lv = GS.own[k], next = lv + 1, maxed = next >= u.lv.length;
    const b = document.createElement("button"); b.className = "row two" + (maxed ? " owned" : "");
    b.innerHTML = `<div class="main"><b>${u.n} <span class="lvl">${u.lv.map((_, i) => `<i class="${i <= lv ? "on" : ""}"></i>`).join("")}</span></b><em>${u.d}\nNow: ${u.lv[lv]}${maxed ? "" : " → " + u.lv[next]}</em></div><div class="pay">${maxed ? "maxed" : "$" + u.cost[next]}</div>`;
    if (!maxed) { b.onmouseenter = () => preview({ k, v: next }); b.onmouseleave = () => preview(null); }
    b.onclick = () => { if (maxed) return; const c = u.cost[next]; if (GS.cash < c) { toast("Not enough cash.", "warn"); return; } GS.cash -= c; GS.own[k] = next; restat(); if (k === "batt") GS.batt = 1; save(); renderGarage(); toast(u.n + ": " + u.lv[next] + ".", "good"); };
    body.appendChild(b);
  }
}
// drag to spin the showroom
canvas.addEventListener("pointerdown", e => { if (!showroomOn()) return; SR.drag = true; SR.lx = e.clientX; });
addEventListener("pointermove", e => { if (SR.drag) { SR.a += (e.clientX - SR.lx) * 0.01; SR.lx = e.clientX; } });
addEventListener("pointerup", () => SR.drag = false);

/* ---------------- settings ---------------- */
function loadSettings() { try { const d = JSON.parse(localStorage.getItem("switchback.set.v1") || "null"); if (d) Object.assign(SET, d); } catch (e) { } }
function saveSettings() { try { localStorage.setItem("switchback.set.v1", JSON.stringify(SET)); } catch (e) { } }
function applySettings() { applyPaint(); if (audio) audio.master.gain.value = SET.mute ? 0 : SET.vol; $("muteBtn").textContent = SET.mute ? "Sound: off" : "Sound: on"; $("hue").value = SET.hue; $("vol").value = Math.round(SET.vol * 100); document.querySelectorAll("#finishBtns .sbtn").forEach(b => b.classList.toggle("on", b.dataset.f === SET.finish)); document.querySelectorAll("#swatches .sw").forEach(b => b.classList.toggle("on", +b.dataset.h === SET.hue)); }
function buildSettings() {
  const sw = $("swatches");
  [[84, "volt"], [24, "clay"], [200, "sky"], [0, "red"], [300, "magenta"], [140, "green"], [48, "gold"], [260, "violet"]].forEach(([h, n]) => { const b = document.createElement("button"); b.className = "sw"; b.dataset.h = h; b.title = n; b.style.background = `hsl(${h} 90% 55%)`; b.onclick = () => { SET.hue = h; applySettings(); saveSettings(); }; sw.appendChild(b); });
  $("hue").addEventListener("input", e => { SET.hue = +e.target.value; applySettings(); saveSettings(); });
  ["gloss", "matte", "chrome"].forEach(f => { const b = document.createElement("button"); b.className = "sbtn"; b.dataset.f = f; b.textContent = f; b.onclick = () => { SET.finish = f; applySettings(); saveSettings(); }; $("finishBtns").appendChild(b); });
  $("vol").addEventListener("input", e => { SET.vol = +e.target.value / 100; applySettings(); saveSettings(); });
  $("muteBtn").addEventListener("click", () => { SET.mute = !SET.mute; applySettings(); saveSettings(); });
  $("viewBtn").addEventListener("click", () => { cycleView(); $("viewBtn").textContent = "View: " + VIEWS[camMode].n; });
  $("closeSet").addEventListener("click", () => toggleSettings(false));
  $("closeGarage").addEventListener("click", closeGarage);
  $("wipeBtn").addEventListener("click", () => { if (!confirm("Wipe cash, parts and paint?")) return; try { localStorage.removeItem("switchback.save.v1"); localStorage.removeItem("switchback.set.v1"); } catch (e) { } location.reload(); });
}
function toggleSettings(force) {
  const s = $("settings"), open = force === undefined ? s.hidden : force; s.hidden = !open;
  document.body.classList.toggle("showroom", open || GS.garageOpen); $("srHint").hidden = !(open || GS.garageOpen);
  if (open) { $("viewBtn").textContent = "View: " + VIEWS[camMode].n; applySettings(); }
}

/* ---------------- save ---------------- */
function save() { try { localStorage.setItem("switchback.save.v1", JSON.stringify({ cash: GS.cash, delivered: GS.delivered, own: GS.own, best: P.whBest })); } catch (e) { } }
function load() { try { const d = JSON.parse(localStorage.getItem("switchback.save.v1") || "null"); if (d) { GS.cash = d.cash || 0; GS.delivered = d.delivered || 0; if (d.own) Object.assign(GS.own, d.own); } } catch (e) { } }
function toast(msg, kind) {
  const t = document.createElement("div"); t.className = "toast" + (kind ? " " + kind : ""); t.textContent = msg; const box = $("toasts"); box.appendChild(t);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  setTimeout(() => t.classList.add("out"), 3200); setTimeout(() => t.remove(), 3700);
}

/* ---------------- main loop ---------------- */
let last = performance.now(), acc = 0;
const STEP = 1 / 120;
let ready = false;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!ready) return;
  if (started) {
    readInput(dt);
    acc += dt; let n = 0;
    while (acc >= STEP && n < 12) { physStep(STEP); acc -= STEP; n++; }
    updJob(dt); updCharge(dt); updSky(dt);
  } else updSky(0);
  updNear(P.x, P.z);
  updVisuals(dt); updParts(dt); updRain(dt); updAudio(dt);
  if (started) updHud(dt);
  renderer.render(scene, camera);
}
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

function init() {
  loadSettings(); load();
  $("load").textContent = "Cutting the switchbacks";
  setTimeout(() => {
    genWorld(); buildFar(); buildProps(); buildBike(); buildMapBg(); buildSettings();
    restat(); resetBike(); P.safe = null;
    updNear(P.x, P.z, true); ready = true;
    for (const s of SITES) s.y = groundAt(s.x, s.z);
    $("start").disabled = false; $("start").textContent = "RIDE"; $("load").textContent = GS.delivered ? `Welcome back. ${GS.delivered} deliveries, $${GS.cash} in the tin.` : "Battery full. The board has three jobs on it.";
    $("start").addEventListener("click", () => {
      initAudio(); applySettings();
      $("overlay").hidden = true; ["zone", "speedo", "job", "mapWrap", "help"].forEach(id => $(id).hidden = false);
      started = true; last = performance.now();
      toast("Press E at the garage for the job board.");
    });
  }, 30);
  requestAnimationFrame(frame);
}
init(); window.__switchback = true;
if (location.search.includes("debug")) window.__sb = { SR, KICK, TRAILS, trailPts, densify, P, GS, SET, input, physStep, surf, groundAt, surfAt, SITES, site, resetBike, stats: () => ST, TIRES, UPG, restat, acceptJob, makeJobs, deliver, updJob, updCharge, cargoHit, crash };
})();
