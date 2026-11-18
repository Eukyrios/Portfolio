import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js";
import { state } from "../state.js";
import { $, clamp, rand, toWorld, view } from "../world.js";
import { pointer } from "../pond/swimming.js";
import { gardenCY, shoreY } from "./terrain.js";
import { BIRD_FRAG, BIRD_VERT } from "../shaders/bird.js";
import { BIRD_GEO, garden } from "./scene.js";
import { sky } from "../sky.js";
import { weather, windVec } from "../weather.js";

/* ---------------- starlings ---------------- */
// Each starling is in one of four modes: flying with the flock, coming down to
// land, on the ground (walking, pecking, looking about, the odd wing flick),
// or taking off. Birds on the ground leave when the cursor comes near, when a
// neighbour bolts, or when they have had enough.
const FLY = 0, LAND = 1, GROUND = 2, TAKEOFF = 3;
export function initBirds() {
  const N = (garden.N = clamp(Math.round((view.W * view.H) / 45000), 16, 34)), GCY = gardenCY();
  // Starlings sized against the koi: a body about a third of a koi, wings nearly half.
  garden.bs = view.base * 0.15;
  const F = () => new Float32Array(N);
  const b = (garden.birds = { x: F(), y: F(), z: F(), vx: F(), vy: F(), next: new Int32Array(N), head: null,
    ph: F(), amp: F(), bank: F(), bend: F(), face: F(), tm: F(), gl: new Uint8Array(N), rate: F(), gust: F(),
    mode: new Uint8Array(N), lx: F(), ly: F(), gt: F(), act: F(), aT: F(), aK: new Uint8Array(N), aDir: F(),
    tuck: F(), peck: F(), look: F(), lookT: F(), hop: F(), startle: F() });
  for (let i = 0; i < N; i++) {
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 320;
    b.x[i] = Math.cos(a) * r; b.y[i] = GCY + Math.sin(a) * r * 0.7; b.z[i] = rand(150, 320);
    b.vx[i] = 320 + rand(-40, 40); b.vy[i] = rand(-60, 60);
    b.ph[i] = rand(0, 6.283); b.amp[i] = 0.8; b.tm[i] = rand(0, 1.2); b.rate[i] = rand(0.88, 1.12); b.face[i] = Math.atan2(b.vy[i], b.vx[i]);
  }
  const mat = new THREE.ShaderMaterial({ vertexShader: BIRD_VERT, fragmentShader: BIRD_FRAG, side: THREE.DoubleSide });
  const geo = BIRD_GEO.clone();
  garden.anim = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
  garden.pose = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  garden.anim.setUsage(THREE.DynamicDrawUsage); garden.pose.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aAnim", garden.anim); geo.setAttribute("aPose", garden.pose);
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  garden.mesh = mesh; garden.birdMat = mat;
  $("bird-count").textContent = N;
}

/** A clear patch of sand to land on, or null. */
function landingSpot(b, i, pw, PR) {
  const GCY = gardenCY(), GW = view.GWc, GH = view.GH, BS = garden.bs, N = garden.N;
  for (let k = 0; k < 8; k++) {
    let x, y;
    // Starlings like company: often come down next to a bird already feeding.
    const j = (Math.random() * N) | 0;
    if (Math.random() < 0.6 && b.mode[j] === GROUND) { const a = rand(0, 6.283), r = BS * rand(2.2, 5); x = b.x[j] + Math.cos(a) * r; y = b.y[j] + Math.sin(a) * r; }
    else { const sp = Math.hypot(b.vx[i], b.vy[i]) || 1, d = rand(260, 520), l = rand(-200, 200); x = b.x[i] + b.vx[i] / sp * d - b.vy[i] / sp * l; y = b.y[i] + b.vy[i] / sp * d + b.vx[i] / sp * l; }
    if (Math.abs(x) > GW * 0.42 || Math.abs(y - GCY) > GH * 0.32 || y - shoreY(x) < 70) continue;
    if (garden.built.some((g) => Math.hypot(x - g.cx, y - g.cy) < g.R + BS * 1.4)) continue;
    if (pw && Math.hypot(x - pw[0], y - pw[1]) < PR * 1.3) continue;
    let crowded = false;
    for (let q = 0; q < N && !crowded; q++) if (q !== i && b.mode[q] !== FLY && b.mode[q] !== TAKEOFF && Math.hypot(x - b.lx[q], y - b.ly[q]) < BS * 1.8) crowded = true;
    if (crowded) continue;
    return [x, y];
  }
  return null;
}

export function stepBirds(dt) {
  const b = garden.birds, N = garden.N, t = state.clock, GCY = gardenCY(), GW = view.GWc, GH = view.GH;
  const BS = garden.bs, K = BS / 3.8, CELL = Math.max(42, BS * 9), gx0 = -GW, gy0 = GCY - GH, GWc = Math.ceil((GW * 2) / CELL) + 1, GHc = Math.ceil((GH * 2) / CELL) + 1;
  if (!b.head || b.head.length !== GWc * GHc) b.head = new Int32Array(GWc * GHc);
  b.head.fill(-1);
  const gxOf = (x) => clamp(Math.floor((x - gx0) / CELL), 0, GWc - 1), gyOf = (y) => clamp(Math.floor((y - gy0) / CELL), 0, GHc - 1);
  // Only birds in the air flock together.
  for (let i = 0; i < N; i++) if (b.mode[i] === FLY || b.mode[i] === TAKEOFF) { const c = gxOf(b.x[i]) + gyOf(b.y[i]) * GWc; b.next[i] = b.head[c]; b.head[c] = i; }
  // A wandering point the flock swirls around, mostly over the garden.
  let axp = Math.sin(t * 0.11) * GW * 0.3 + Math.sin(t * 0.27 + 1) * GW * 0.08, ayp = GCY + Math.sin(t * 0.17 + 2) * GH * 0.25;
  // In a storm the flock leaves for shelter, far to the north; it comes back after.
  const leave = weather.storm > 0.55 || sky.night > 0.6;   // gone for shelter in a storm, to roost at night
  if (leave) { axp = 0; ayp = GCY + GH * 3; }
  const wv = windVec();
  const pw = pointer.inside ? toWorld(pointer.x, pointer.y) : null;
  const RN = BS * 9, R2 = RN * RN, S = BS * 4.2, PR = 130 + BS * 4;
  let grounded = 0;
  for (let i = 0; i < N; i++) if (b.mode[i] !== FLY) grounded++;
  const near = (i) => pw && Math.hypot(b.x[i] - pw[0], b.y[i] - pw[1]) < PR;
  const takeOff = (i, awayX, awayY) => {
    b.mode[i] = TAKEOFF; b.gl[i] = 0; b.tm[i] = rand(0.8, 1.4);
    const a = awayX !== undefined ? Math.atan2(awayY, awayX) + rand(-0.5, 0.5) : b.face[i] + rand(-0.6, 0.6);
    b.vx[i] = Math.cos(a) * 170; b.vy[i] = Math.sin(a) * 170;
    // The alarm spreads: neighbours on the ground go too, a beat later.
    for (let j = 0; j < N; j++) if (b.mode[j] === GROUND && j !== i && Math.hypot(b.x[j] - b.x[i], b.y[j] - b.y[i]) < BS * 6 && b.startle[j] <= 0) b.startle[j] = rand(0.08, 0.35);
  };

  for (let i = 0; i < N; i++) {
    const x = b.x[i], y = b.y[i], mode = b.mode[i];
    if (mode === GROUND) {
      /* ---- on the ground ---- */
      b.gt[i] -= dt;
      if (b.startle[i] > 0 && (b.startle[i] -= dt) <= 0) { takeOff(i, x - (pw ? pw[0] : x - Math.cos(b.face[i])), y - (pw ? pw[1] : y - Math.sin(b.face[i]))); continue; }
      if (near(i)) { takeOff(i, x - pw[0], y - pw[1]); continue; }
      if (b.gt[i] <= 0 || (leave && Math.random() < dt * 1.5)) { takeOff(i); continue; }
      // Small actions, one at a time: walk a few steps, turn, peck, look about, flick the wings.
      b.aT[i] -= dt;
      if (b.aT[i] <= 0) {
        const r = Math.random();
        b.aK[i] = r < 0.34 ? 1 : r < 0.52 ? 2 : r < 0.8 ? 3 : r < 0.93 ? 4 : 5;
        b.aT[i] = b.aK[i] === 1 ? rand(0.4, 1.1) : b.aK[i] === 3 ? rand(0.5, 1.0) : b.aK[i] === 5 ? 0.35 : rand(0.25, 0.6);
        b.aDir[i] = rand(-1, 1);
        b.act[i] = 0;
      }
      b.act[i] += dt;
      let tPeck = 0, tLook = b.look[i] * 0.9, wingFlick = 0;
      if (b.aK[i] === 1) {            // walk: quick little steps with a bob
        const sp = BS * 1.4, cyc = (b.act[i] * 7) % 1;
        b.face[i] += b.aDir[i] * dt * 0.8;
        const v = sp * (0.4 + 0.6 * Math.sin(cyc * Math.PI));
        b.x[i] += Math.cos(b.face[i]) * v * dt; b.y[i] += Math.sin(b.face[i]) * v * dt;
        b.hop[i] = Math.sin(cyc * Math.PI) * BS * 0.04;
      } else if (b.aK[i] === 2) {     // turn on the spot
        b.face[i] += b.aDir[i] * dt * 3.2; b.hop[i] = 0;
      } else if (b.aK[i] === 3) {     // peck, peck
        tPeck = Math.max(0, Math.sin(b.act[i] * 11)) ; b.hop[i] = 0;
      } else if (b.aK[i] === 4) {     // look about
        tLook = b.aDir[i] * 0.9; b.hop[i] = 0;
      } else {                        // shake the wings out
        wingFlick = Math.sin(Math.min(1, b.act[i] / 0.35) * Math.PI);
      }
      // Stay off rocks, in the garden, and apart.
      for (const g of garden.built) { const dx = b.x[i] - g.cx, dy = b.y[i] - g.cy, d = Math.hypot(dx, dy) || 1, m = g.R + BS * 0.9; if (d < m) { b.x[i] = g.cx + dx / d * m; b.y[i] = g.cy + dy / d * m; } }
      if (b.y[i] - shoreY(b.x[i]) < 60 || Math.abs(b.x[i]) > GW * 0.45) b.face[i] += dt * 4;
      b.lx[i] = b.x[i]; b.ly[i] = b.y[i];
      b.peck[i] += (tPeck - b.peck[i]) * Math.min(1, dt * 18);
      b.look[i] += (tLook - b.look[i]) * Math.min(1, dt * 9);
      b.tuck[i] += (1 - wingFlick * 0.7 - b.tuck[i]) * Math.min(1, dt * 10);
      b.amp[i] += (wingFlick * 0.55 - b.amp[i]) * Math.min(1, dt * 14);
      b.ph[i] += dt * 30 * wingFlick;
      b.z[i] = b.hop[i];
      b.bank[i] *= Math.exp(-dt * 8); b.bend[i] *= Math.exp(-dt * 8);
      continue;
    }

    /* ---- in the air: flying, landing or taking off ---- */
    let fx = 0, fy = 0;
    if (mode === LAND) {
      // Glide in, then flare: slow right down with big beats just before touching down.
      const dx = b.lx[i] - x, dy = b.ly[i] - y, d = Math.hypot(dx, dy) || 1;
      const want = Math.min(330, 30 + d * 1.1);
      fx += (dx / d * want - b.vx[i]) * 3.2; fy += (dy / d * want - b.vy[i]) * 3.2;
      b.z[i] += (Math.min(230, d * 0.55) - b.z[i]) * Math.min(1, dt * 3);
      if (near(i) || (pw && Math.hypot(b.lx[i] - pw[0], b.ly[i] - pw[1]) < PR)) { b.mode[i] = TAKEOFF; b.tm[i] = 0.8; }
      if (d < 6 && b.z[i] < 8) {
        b.mode[i] = GROUND; b.x[i] = b.lx[i]; b.y[i] = b.ly[i]; b.vx[i] = b.vy[i] = 0; b.z[i] = 0;
        b.gt[i] = rand(5, 14); b.aT[i] = rand(0.2, 0.6); b.aK[i] = 0; b.startle[i] = 0;
        continue;
      }
    } else {
      let ax = 0, ay = 0, cx = 0, cy = 0, n = 0, sx = 0, sy = 0;
      const gx = gxOf(x), gy = gyOf(y);
      for (let yy = Math.max(0, gy - 1); yy <= Math.min(GHc - 1, gy + 1); yy++) for (let xx = Math.max(0, gx - 1); xx <= Math.min(GWc - 1, gx + 1); xx++) {
        for (let j = b.head[xx + yy * GWc]; j !== -1; j = b.next[j]) {
          if (j === i) continue;
          const dx = b.x[j] - x, dy = b.y[j] - y, d2 = dx * dx + dy * dy;
          if (d2 > R2) continue;
          ax += b.vx[j]; ay += b.vy[j]; cx += dx; cy += dy; n++;
          if (d2 < S * S) { const d = Math.sqrt(d2) || 1; sx -= (dx / d) * (S - d); sy -= (dy / d) * (S - d); }
        }
      }
      if (n) { fx += (ax / n - b.vx[i]) * 1.4 + (cx / n) * 1.1; fy += (ay / n - b.vy[i]) * 1.4 + (cy / n) * 1.1; }
      fx += sx * 60 / K; fy += sy * 60 / K;
      const dxa = axp - x, dya = ayp - y, da = Math.hypot(dxa, dya) || 1;
      fx += ((dxa / da) * 70 - (dya / da) * 40) * 2; fy += ((dya / da) * 70 + (dxa / da) * 40) * 2;
      if (Math.abs(x) > GW * 0.5) fx -= Math.sign(x) * 520;
      if (!leave && Math.abs(y - GCY) > GH * 0.3) fy -= Math.sign(y - GCY) * 700;
      fx += wv[0] * weather.windNow * 240; fy += wv[1] * weather.windNow * 240;   // blown by the wind
      if (mode === TAKEOFF) {
        b.z[i] += (240 - b.z[i]) * Math.min(1, dt * 1.6);
        b.tm[i] -= dt;
        if (b.tm[i] <= 0 && b.z[i] > 150) b.mode[i] = FLY;
      } else {
        b.z[i] += ((210 + 90 * Math.sin(t * 0.3 + x * 0.004)) - b.z[i]) * dt * 0.5;
        // Now and then a bird peels off to feed on the sand.
        if (!near(i) && !leave && grounded < N * 0.4 && Math.random() < dt * 0.08 * (1 - 0.8 * weather.rain) * (1 + weather.cover)) {
          const spot = landingSpot(b, i, pw, PR);
          if (spot) { b.mode[i] = LAND; b.lx[i] = spot[0]; b.ly[i] = spot[1]; grounded++; }
        }
      }
    }
    if (pw) {
      const dx = x - pw[0], dy = y - pw[1], d = Math.hypot(dx, dy);
      if (d < PR && d > 0) { const k = (1 - d / PR) * 2800; fx += (dx / d) * k; fy += (dy / d) * k; }
    }
    let vx = b.vx[i] + fx * dt, vy = b.vy[i] + fy * dt;
    // Effort: how hard the bird is pushing decides flap or glide.
    const along = (fx * b.vx[i] + fy * b.vy[i]) / (Math.hypot(b.vx[i], b.vy[i]) || 1);
    b.tm[i] -= mode === FLY ? dt : 0;
    if (mode === FLY && (b.tm[i] <= 0 || (b.gl[i] && along > 260))) {
      if (b.gl[i] || along > 120) { b.gl[i] = 0; b.tm[i] = rand(0.5, 1.3); }      // a burst of beats
      else { b.gl[i] = 1; b.tm[i] = rand(0.35, 0.9); }                           // then a glide
    }
    const v = Math.hypot(vx, vy) || 1;
    const lo = mode === LAND ? 20 : mode === TAKEOFF ? 150 : 220;
    const vc = clamp(v, lo, 480);
    vx *= vc / v; vy *= vc / v;
    b.vx[i] = vx; b.vy[i] = vy;
    b.x[i] = x + vx * dt; b.y[i] = y + vy * dt;
  }

  // Pose and wingbeat, then the instance matrices.
  const arr = garden.mesh.instanceMatrix.array, sc = BS, an = garden.anim.array, po = garden.pose.array;
  for (let i = 0; i < N; i++) {
    const mode = b.mode[i];
    if (mode !== GROUND) {
      // Face along the flight path, but turn with some weight, not instantly.
      const want = Math.atan2(b.vy[i], b.vx[i]);
      let dh = want - b.face[i]; dh -= Math.round(dh / 6.2832) * 6.2832;
      const step = clamp(dh, -dt * 7, dt * 7);
      b.face[i] += step;
      const turn = step / Math.max(dt, 1e-3);
      b.gust[i] += (rand(-1, 1) * 0.5 - b.gust[i]) * Math.min(1, dt * 2.5);
      b.bank[i] += (clamp(-turn * 0.35, -0.8, 0.8) + b.gust[i] * 0.12 - b.bank[i]) * Math.min(1, dt * 5);
      b.bend[i] += (clamp(turn * 0.2, -0.55, 0.55) - b.bend[i]) * Math.min(1, dt * 8);
      // The head leads the turn and holds steady against the roll.
      b.look[i] += (clamp(turn * 0.08, -0.15, 0.15) - b.look[i]) * Math.min(1, dt * 10);
      b.peck[i] *= Math.exp(-dt * 10);
      b.tuck[i] += (0 - b.tuck[i]) * Math.min(1, dt * (mode === TAKEOFF ? 14 : 6));
      const flee = !!near(i);
      let tAmp, rate;
      if (mode === TAKEOFF) { tAmp = 1.15; rate = 24; }
      else if (mode === LAND) {
        const d = Math.hypot(b.lx[i] - b.x[i], b.ly[i] - b.y[i]);
        const flare = d < BS * 3.5;
        tAmp = flare ? 1.0 : 0.05; rate = flare ? 21 : 6;
      } else {
        const flap = !b.gl[i] || flee;
        tAmp = flee ? 1.05 : flap ? 0.85 : 0.06; rate = flee ? 23 : flap ? 16 : 16 * b.amp[i];
      }
      b.amp[i] += (tAmp - b.amp[i]) * Math.min(1, dt * (tAmp > b.amp[i] ? 7 : 3));
      b.ph[i] += dt * b.rate[i] * rate;
    }
    const a = b.face[i], c = Math.cos(a) * sc, sn = Math.sin(a) * sc, o = i * 16;
    an[i * 4] = b.ph[i]; an[i * 4 + 1] = b.amp[i]; an[i * 4 + 2] = b.bank[i]; an[i * 4 + 3] = b.bend[i];
    po[i * 3] = b.tuck[i]; po[i * 3 + 1] = b.peck[i]; po[i * 3 + 2] = b.look[i];
    arr[o] = c; arr[o + 1] = sn; arr[o + 2] = 0; arr[o + 3] = 0;
    arr[o + 4] = -sn; arr[o + 5] = c; arr[o + 6] = 0; arr[o + 7] = 0;
    arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = sc; arr[o + 11] = 0;
    arr[o + 12] = b.x[i]; arr[o + 13] = b.y[i]; arr[o + 14] = b.z[i]; arr[o + 15] = 1;
  }
  garden.mesh.instanceMatrix.needsUpdate = true;
  garden.anim.needsUpdate = true;
  garden.pose.needsUpdate = true;
}
