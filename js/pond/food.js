import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js";
import { state } from "../state.js";
import { DRIFT } from "../constants.js";
import { BALL, FOOD_MAT, ripples, surfaceScene } from "../setup.js";
import { $, drops, fish, food, pads, project, rand, ripple, rippleFront, splash, toWorld, view } from "../world.js";
import { startle } from "./swimming.js";
import { projects } from "../projects.js";
import { shoreY } from "../garden/terrain.js";

/* ---------------- food ---------------- */
export function dropFood(sx, sy) {
  const [wx, wy] = toWorld(sx, sy);
  const size = Math.max(view.cw * 0.75, 5);
  for (let i = 0; i < 9 && food.length < 60; i++) {
    const mesh = new THREE.Mesh(BALL, FOOD_MAT);
    mesh.scale.setScalar(size * rand(0.8, 1.15));
    const a = rand(0, Math.PI * 2), v = rand(15, 45);
    const p = { mesh, x: wx + rand(-10, 10), y: wy + rand(-10, 10), z: 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: state.clock, seed: rand(0, 9) };
    mesh.position.set(p.x, p.y, p.z);
    surfaceScene.add(mesh);
    food.push(p);
  }
  ripple(wx, wy, 1.0, true);
  splash(wx, wy, 14, 1);
  // Shy fish dart away from the splash; koi know it means food.
  for (const f of fish) if (f.sp.shy && Math.hypot(f.x - wx, f.y - wy) < f.L * 1.6 + 60 && Math.random() < f.sp.shy) startle(f, Math.atan2(f.y - wy, f.x - wx));
}

export function removeFood(i) { surfaceScene.remove(food[i].mesh); food.splice(i, 1); }

export function updateFood(dt) {
  for (let i = food.length - 1; i >= 0; i--) {
    const p = food[i], age = state.clock - p.born;
    // Surface current, a little different from place to place.
    const fx = DRIFT.x + Math.sin(p.y * 0.004 + state.clock * 0.13 + p.seed * 0.3) * 2.5;
    const fy = DRIFT.y + Math.cos(p.x * 0.0035 - state.clock * 0.11) * 2.5;
    p.vx += (fx - p.vx) * dt * 0.9;
    p.vy += (fy - p.vy) * dt * 0.9;
    // Passing ripples push pellets outward.
    const [sx, sy] = project(p.x, p.y, 0);
    for (const r of ripples) {
      const fr = rippleFront(r, p.x, p.y);
      if (fr) { p.vx += fr.nx * fr.e * 70 * dt; p.vy += fr.ny * fr.e * 70 * dt; }
    }
    // Fish near the surface: the one going for it sucks it in, others shove it aside.
    for (const f of fish) {
      if (f.z < -70) continue;
      const hx = f.J[0].x, hy = f.J[0].y;
      const dx = p.x - hx, dy = p.y - hy, d = Math.hypot(dx, dy) || 1;
      if (f.target === p && d < f.L * 0.3) { p.vx -= dx / d * 140 * dt; p.vy -= dy / d * 140 * dt; continue; }
      const R = f.L * 0.38;
      if (d < R) {
        const push = (1 - d / R) * (f.speed * 0.25 + 8) * dt * 1.5;
        p.vx += (Math.cos(f.heading) * 0.6 + dx / d * 0.6) * push;
        p.vy += (Math.sin(f.heading) * 0.6 + dy / d * 0.6) * push;
      }
    }
    p.vx *= Math.exp(-dt * 0.8); p.vy *= Math.exp(-dt * 0.8);
    p.x += p.vx * dt; p.y += p.vy * dt;
    // Pellets slide around lily pads instead of under them.
    for (const pd of [...pads, ...projects]) {
      const dx = p.x - pd.x, dy = p.y - pd.y, d = Math.hypot(dx, dy) || 1, R = (pd.R ?? pd.r) * 1.02;
      if (d < R) { p.x = pd.x + dx / d * R; p.y = pd.y + dy / d * R; const vn = (p.vx * dx + p.vy * dy) / d; if (vn < 0) { p.vx -= vn * dx / d; p.vy -= vn * dy / d; } }
    }
    p.z = 2 + Math.sin(state.clock * 2.2 + p.seed) * 1.5;
    if (age > 70) p.z -= (age - 70) * 30;
    p.mesh.position.set(p.x, p.y, p.z);
    p.mesh.rotation.set(state.clock * 0.7 + p.seed, state.clock * 0.5, 0);
    if (Math.abs(p.x) > view.WX / 2 + 30 || p.y > shoreY(p.x) - 14 || p.y < -view.WY / 2 - 30) {   // off the edge, or washed ashore
      removeFood(i); state.lostCount++; $("lost").textContent = state.lostCount;
    } else if (age > 76) removeFood(i);
  }
}

export function updateDrops(dt) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.vz -= 950 * dt;
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    if (d.z < 0) {
      if (d.ripple) ripple(d.x, d.y, 0.18);
      surfaceScene.remove(d.mesh); drops.splice(i, 1);
      continue;
    }
    d.mesh.position.set(d.x, d.y, d.z);
  }
}

export function updatePads(dt) {
  for (const p of pads) {
    const [sx, sy] = project(p.x, p.y, 0);
    let kick = 0;
    for (const r of ripples) { const fr = rippleFront(r, p.x, p.y); if (fr) kick = Math.max(kick, fr.e); }
    p.wob = Math.max(p.wob * Math.exp(-dt * 1.4), kick);
    p.group.rotation.x = 0.04 * Math.sin(state.clock * 0.6 + p.seed) + p.wob * 0.18 * Math.sin(state.clock * 7 + p.seed);
    p.group.rotation.y = 0.04 * Math.sin(state.clock * 0.5 + p.seed * 2) + p.wob * 0.18 * Math.cos(state.clock * 6 + p.seed);
    p.group.rotation.z += p.spin * dt;
  }
}
