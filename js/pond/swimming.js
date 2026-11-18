import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js";
import { state } from "../state.js";
import { MAX_DEPTH, NJ } from "../constants.js";
import { $, clamp, fish, food, halfH, halfW, project, rand, ripple, splash, wrap } from "../world.js";
import { removeFood, updateDrops, updateFood, updatePads } from "./food.js";
import { updateProjects } from "../projects.js";
import { shoreY } from "../garden/terrain.js";
import { weather } from "../weather.js";

/* ---------------- swimming ---------------- */
export const pointer = { x: 0, y: 0, vx: 0, vy: 0, t: 0, lastRipple: 0, inside: false };

/* ---------------- the backbone ----------------
 * Each fish has a chain of NJ joints from snout to tail tip. The head is
 * rigid and turns around a pivot a third of the way back; every joint
 * behind it follows the one in front (so the body traces the path the head
 * swam), straightens a little each frame (body stiffness), and can bend
 * only so far per joint. The vertex shader lays the mesh along this chain
 * and adds the tail-beat wave on top. */
const HEAD_ARC = 0.3, HEAD_RIGID = 0.36;

function layHead(f) {
  const ce = Math.cos(f.elev), hx = Math.cos(f.heading) * ce, hy = Math.sin(f.heading) * ce, hz = Math.sin(f.elev);
  for (let i = 0; i < f.headN; i++) {
    const k = f.L * HEAD_ARC - i * f.seg;
    f.J[i].set(f.x + hx * k, f.y + hy * k, f.z + hz * k);
  }
}

export function initChain(f) {
  f.seg = (f.L * 1.5) / (NJ - 1);
  f.headN = Math.floor((f.L * HEAD_RIGID) / f.seg) + 1;
  f.J = Array.from({ length: NJ }, () => new THREE.Vector3());
  layHead(f);
  const hx = Math.cos(f.heading), hy = Math.sin(f.heading);
  for (let i = f.headN; i < NJ; i++) f.J[i].set(f.J[i - 1].x - hx * f.seg, f.J[i - 1].y - hy * f.seg, f.J[i - 1].z);
  const u = f.mat.uniforms;
  u.uSpine.value = f.J; u.uSeg.value = f.seg; u.uL.value = f.L;
}

function followChain(f, dt) {
  layHead(f);
  const J = f.J, seg = f.seg;
  const k = 1 - Math.exp(-dt * f.sp.stiff), cb = Math.cos(f.sp.bend), sb = Math.sin(f.sp.bend);
  for (let i = f.headN; i < NJ; i++) {
    const a = J[i - 1], b = J[i - 2];
    let px = a.x - b.x, py = a.y - b.y, pz = a.z - b.z, l = Math.hypot(px, py, pz) || 1;
    px /= l; py /= l; pz /= l;
    let dx = J[i].x - a.x, dy = J[i].y - a.y, dz = J[i].z - a.z;
    l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    dx += (px - dx) * k; dy += (py - dy) * k; dz += (pz - dz) * k;
    l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const dot = dx * px + dy * py + dz * pz;
    if (dot < cb) {
      let ox = dx - px * dot, oy = dy - py * dot, oz = dz - pz * dot;
      l = Math.hypot(ox, oy, oz) || 1; ox /= l; oy /= l; oz /= l;
      dx = px * cb + ox * sb; dy = py * cb + oy * sb; dz = pz * cb + oz * sb;
    }
    J[i].set(a.x + dx * seg, a.y + dy * seg, a.z + dz * seg);
  }
}

/** A fast-start escape: the head whips round, the body snaps into a C, then the tail drives it away. */
export function startle(f, away) {
  if (f.startleT > 0) return;
  f.startleT = rand(0.5, 0.9);
  f.fleeDir = away + rand(-0.4, 0.4);
  f.amp = Math.max(f.amp, 0.1);
  f.zTarget = Math.min(f.zTarget, -120);
  f.hoverT = 0;
}

/* ---------------- steering ---------------- */
function steer(f, dt) {
  const sp = f.sp, L = f.L, h = f.heading, ch = Math.cos(h), sh = Math.sin(h);
  const bx = halfW(f.z), by = halfH(f.z);
  // Wandering from slow overlapping sine waves: smooth, never jittery.
  const wander = 0.65 * Math.sin(state.clock * f.wf[0] + f.wp[0]) + 0.35 * Math.sin(state.clock * f.wf[1] + f.wp[1]);
  let ax = Math.cos(h + wander * 0.8), ay = Math.sin(h + wander * 0.8);
  let want = f.cruise * (1 - 0.35 * weather.ice), mode = "cruise";   // sluggish in the cold

  // Edges: look ahead along the heading and turn for open water, always on
  // the same side until clear (no dithering when meeting a wall head-on).
  const look = Math.max(L * 1.2, f.speed * 1.6), m = Math.max(L * 0.5, 50);
  const lx = f.x + ch * look, ly = f.y + sh * look;
  let ox = 0, oy = 0;
  const north = Math.min(by, shoreY(lx) - 40 - L * 0.15);   // the shore, with room for the whole body
  if (lx > bx - m) ox -= lx - bx + m;
  if (lx < -bx + m) ox += -bx + m - lx;
  if (ly > north - m) oy -= ly - north + m;
  if (ly < -by + m) oy += -by + m - ly;
  if (ox || oy) {
    const ol = Math.hypot(ox, oy), w = Math.min(3, ol / (L * 0.6));
    ax += (ox / ol) * w; ay += (oy / ol) * w;
    if (!f.wallSide) f.wallSide = Math.sign(wrap(Math.atan2(oy, ox) - h)) || 1;
  } else f.wallSide = 0;

  // Other fish: keep apart, duck under, veer from anyone dead ahead, school with your own kind.
  f.duck = 0;
  const mid = f.J[9];
  let alx = 0, aly = 0, scx = 0, scy = 0, mates = 0;
  for (const g of fish) {
    if (g === f) continue;
    const gm = g.J[9], dx = mid.x - gm.x, dy = mid.y - gm.y, d = Math.hypot(dx, dy), dz = Math.abs(f.z - g.z);
    const min = (f.L + g.L) * 0.42;
    if (d > 0 && d < min && dz < 90) {
      ax += (dx / d) * (min - d) / min * 2; ay += (dy / d) * (min - d) / min * 2;
      const gap = (f.L + g.L) * 0.14;
      if (f.z <= g.z && g.z - f.z < gap && (f.z < g.z || f.id < g.id)) f.duck = Math.max(f.duck, gap - (g.z - f.z));
    }
    const fwd = -dx * ch - dy * sh, lat = dx * sh - dy * ch;
    if (fwd > 0 && fwd < L * 1.3 && Math.abs(lat) < (f.L + g.L) * 0.25 && dz < 60) {
      const s = lat > 0 ? -1 : 1, wv = (1 - fwd / (L * 1.3)) * 1.4;
      ax += -sh * s * wv; ay += ch * s * wv;
    }
    if (sp.school && g.sp === sp && d < L * 4) { alx += Math.cos(g.heading); aly += Math.sin(g.heading); scx += gm.x; scy += gm.y; mates++; }
  }
  if (mates) {
    ax += (alx / mates) * 0.9; ay += (aly / mates) * 0.9;
    const dx = scx / mates - mid.x, dy = scy / mates - mid.y, d = Math.hypot(dx, dy) || 1;
    ax += (dx / d) * 0.5; ay += (dy / d) * 0.5;
    const lead = fish.find((g) => g.sp === sp);
    if (lead && lead !== f) f.zTarget += (lead.zTarget - f.zTarget) * dt;
  }

  // Escapes override everything else.
  const [psx, psy] = project(f.x, f.y, f.z);
  const pd = Math.hypot(psx - pointer.x, psy - pointer.y) || 1;
  if (pointer.inside && Math.hypot(pointer.vx, pointer.vy) > 1100 && pd < 190) startle(f, Math.atan2(-(psy - pointer.y), psx - pointer.x));
  if (f.startleT > 0) {
    f.startleT -= dt;
    f.mode = "flee"; f.target = null; f.bd = Infinity;
    return { desired: f.fleeDir, want: L * 1.9, mode: "flee" };
  }

  // Food: notice it after a moment, aim where it's drifting, slow down to
  // line up, then lunge for the last stretch and tilt up to take it.
  let best = null, bd = 420 * Math.sqrt(sp.chase);
  if (f.fullT > 0) f.fullT -= dt;
  const snout = f.J[0];
  for (const p of food) {
    if (p.z < -40 || f.fullT > 0 || state.clock - p.born < f.react) continue;
    const d = Math.hypot(p.x - snout.x, p.y - snout.y);
    if (d < bd) { bd = d; best = p; }
  }
  f.target = best;
  if (best) {
    const tx = best.x + best.vx * 0.4, ty = best.y + best.vy * 0.4;
    const d = Math.hypot(tx - snout.x, ty - snout.y) || 1;
    ax += ((tx - f.x) / d) * 3; ay += ((ty - f.y) / d) * 3;
    mode = "chase";
    want = d < L * 0.45 ? L * sp.chase * 0.75 : L * sp.chase * clamp(d / (L * 1.4), 0.35, 1);
    f.zTarget = bd < L * 2.5 ? -4 : -30;
  } else if (Math.random() < dt * 0.07) {
    // Rain brings them up to the surface; a storm sends them down.
    f.zTarget = -rand(30 + 90 * weather.storm, MAX_DEPTH) * (1 - 0.5 * weather.rain * (1 - weather.storm));
  }

  if (!best && state.openProj && sp.geo !== "orfe") {          // curious koi gather under the open project
    const dx = state.openProj.x - f.x, dy = state.openProj.y - f.y, d = Math.hypot(dx, dy) || 1;
    if (d < 700 && d > state.openProj.r * 2.5) { ax += (dx / d) * 0.9; ay += (dy / d) * 0.9; }
    else if (d <= state.openProj.r * 2.5) want *= 0.5;
  }
  if (mode === "cruise") {
    if (f.hoverT > 0) { f.hoverT -= dt; want = L * 0.03; mode = "hover"; }
    else if (Math.random() < dt * sp.hover) f.hoverT = rand(2, 5);
  }
  f.mode = mode;
  f.bd = bd;
  return { desired: Math.atan2(ay, ax), want, mode };
}

/* ---------------- swimming ---------------- */
function swim(f, dt) {
  const sp = f.sp, L = f.L;
  const { desired, want, mode } = steer(f, dt);
  const urgent = mode === "chase" || mode === "flee";

  // Burst and glide: a few tail beats, then coast with the body nearly straight.
  if (urgent) f.thrustTarget = 1;
  else if (mode === "hover") f.thrustTarget = 0;
  else {
    f.beatT -= dt;
    if (f.beatT <= 0) {
      if (f.thrustTarget > 0.05) { f.thrustTarget = 0; f.beatT = rand(0.8, 2.6) * sp.glide; }
      else { f.thrustTarget = rand(0.45, 0.85); f.beatT = rand(0.7, 1.6); }
    }
  }
  f.thrust += (f.thrustTarget - f.thrust) * Math.min(1, dt * (mode === "flee" ? 12 : 3));

  // Speed: thrust accelerates, water drag slows a coasting fish gradually,
  // pectorals flare to brake when it needs to stop.
  const goal = mode === "hover" ? want : want * (0.5 + 0.8 * f.thrust);
  const braking = f.speed > goal * 1.2 && mode !== "cruise";
  const rate = mode === "flee" ? 5 : f.thrust > 0.1 ? 1.5 : 0.4;
  f.speed += (goal - f.speed) * Math.min(1, dt * rate * (braking ? 2.5 : 1));
  f.flare += ((braking || mode === "hover" ? 1 : 0) - f.flare) * Math.min(1, dt * 4);

  // Turning: the head turns around its pivot and the body follows its path.
  let diff = wrap(desired - f.heading);
  if (f.wallSide && Math.abs(diff) > 2.3) diff = f.wallSide * Math.abs(diff);
  const maxTurn = mode === "flee" ? 7 : sp.turn * (mode === "chase" ? 2 : mode === "hover" ? 0.5 : 1);
  f.turn += (clamp(diff * 2, -maxTurn, maxTurn) - f.turn) * Math.min(1, dt * (mode === "flee" ? 12 : 3));
  f.turnS += (f.turn - f.turnS) * Math.min(1, dt * 2);
  f.heading = wrap(f.heading + f.turn * dt);
  f.x += Math.cos(f.heading) * f.speed * dt;
  f.y += Math.sin(f.heading) * f.speed * dt;

  // Depth: stay under the surface; the head tilts the way the fish is going.
  const zMax = -L * 0.16;
  f.zTarget = Math.min(f.zTarget, zMax);
  const vz = clamp((f.zTarget - f.z) * 0.6, -50, 50) - f.duck * 3;
  f.z = clamp(f.z + vz * dt, -MAX_DEPTH - 60, zMax);
  let elevT = Math.atan2(vz, Math.max(f.speed, L * 0.25)) * 0.9;
  if (mode === "chase" && f.bd < L * 0.9) elevT = 0.22;
  f.elev += (clamp(elevT, -0.45, 0.45) - f.elev) * Math.min(1, dt * 2.5);
  f.roll += (clamp(-f.turn * 0.22, -0.4, 0.4) - f.roll) * Math.min(1, dt * 3);

  // Tail: beat rate and size follow thrust and speed; a turn adds a sweep.
  const rel = f.speed / L;
  const beatHz = 0.2 + 1.5 * f.thrust * sp.freq + 0.35 * rel + 0.25 * Math.min(Math.abs(f.turn), 3);
  f.phase += dt * Math.PI * 2 * beatHz;
  const ampT = 0.012 + 0.065 * f.thrust + 0.03 * Math.min(Math.abs(f.turn), 2) + (mode === "flee" ? 0.03 : 0);
  f.amp += (ampT - f.amp) * Math.min(1, dt * 3);
  const fold = clamp(rel / 0.7, 0, 1) * (1 - f.flare);
  f.flap += dt * (mode === "hover" ? 5 : 1.4 + 2.2 * (1 - fold));

  followChain(f, dt);
  let over = 0;
  for (let i = 0; i < NJ; i += 2) over = Math.max(over, f.J[i].y - (shoreY(f.J[i].x) - 26 - L * 0.1));
  if (over > 0) {
    f.y -= over;
    for (const j of f.J) j.y -= over;
    if (Math.sin(f.heading) > 0) f.heading = wrap(f.heading + wrap(-Math.PI / 2 - f.heading) * Math.min(1, dt * 3));
  }

  // Eat: a gulp at the surface throws a ring and a few drops.
  const hx = f.J[0].x, hy = f.J[0].y;
  for (let i = food.length - 1; i >= 0; i--) {
    const p = food[i];
    if (Math.hypot(p.x - hx, p.y - hy) < L * 0.11 + 7 && f.z > -L * 0.5 - 40) {
      ripple(p.x, p.y, 0.75, true);
      splash(p.x, p.y, 4, 0.6);
      removeFood(i); state.fedCount++; $("fed").textContent = state.fedCount;
      f.fullT = rand(6, 14);
    }
  }
  // Wake: fish near the surface leave small rings off their heads.
  f.wakeT -= dt;
  if (f.z > -L * 0.16 - 45 && f.wakeT <= 0 && rel > 0.12) {
    ripple(hx, hy, 0.1 + 0.18 * Math.min(1, rel));
    f.wakeT = 0.28 / Math.min(1.5, rel + 0.3);
  }

  const u = f.mat.uniforms;
  u.uPhase.value = f.phase; u.uFlap.value = f.flap; u.uAmp.value = f.amp;
  u.uTurn.value = clamp(f.turnS, -1.5, 1.5); u.uFold.value = fold; u.uFlare.value = f.flare;
  u.uRoll.value = f.roll + Math.sin(f.phase) * 0.04 * f.thrust;
  f.zs += (f.z - f.zs) * Math.min(1, dt * 4);
}

export function step(dt) {
  updateFood(dt);
  updateDrops(dt);
  updatePads(dt);
  updateProjects(dt);
  for (const f of fish) swim(f, dt);
  pointer.vx *= 0.85; pointer.vy *= 0.85;
}
