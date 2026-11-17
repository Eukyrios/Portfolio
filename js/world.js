import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js";
import { state } from "./state.js";
import { BIG_RIPPLES, SMALL_RIPPLES, WAVE_SPEED } from "./constants.js";
import { BALL, SPLASH_MAT, ripples, surfaceScene } from "./setup.js";

/* ---------------- world ---------------- */
const START_ZOOM = 1.6;                                   // start close enough to see the fish properly
export const view = { zoom: START_ZOOM, WX: 2, WY: 2, panX: 0, panY: 0, W: 1, H: 1, cw: 8, ch: 13, cols: 1, rows: 1, camZ: 1000, cx: 0, cy: 0, base: 200 };
export const fish = [], pads = [], food = [], drops = [];

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const halfW = () => view.WX / 2;                      // the pond is bigger than the screen; its south edge is the shore
export const halfH = () => view.WY / 2;
export const $ = (id) => document.getElementById(id);

/** World point (y up, origin at the pond's centre) to CSS px from the screen's top-left. */
/** Screen px per world px for something at height z. */
export const scaleAt = (z = 0) => view.camZ / (view.camZ / view.zoom - z);
export function project(x, y, z = 0) {
  const s = scaleAt(z), cx = view.cx + view.panX, cy = view.cy + view.panY;
  return [view.W / 2 + view.cx + (x - cx) * s, view.H / 2 - view.cy - (y - cy) * s];
}
export const toWorld = (sx, sy) => [view.cx + view.panX + (sx - view.W / 2 - view.cx) / view.zoom, view.cy + view.panY - (sy - view.H / 2 + view.cy) / view.zoom];

export function ripple(x, y, strength, big = false) {          // world coords
  const i = big ? state.bigIdx : BIG_RIPPLES + state.smallIdx;
  ripples[i].set(x, y, state.clock, strength);
  if (big) state.bigIdx = (state.bigIdx + 1) % BIG_RIPPLES; else state.smallIdx = (state.smallIdx + 1) % SMALL_RIPPLES;
}

/** The ripple's leading crest at a world point, as the shader draws it. */
export function rippleFront(r, sx, sy) {
  const age = state.clock - r.z;
  if (r.w <= 0 || age < 0 || age > 4) return null;
  const dx = sx - r.x, dy = sy - r.y, dist = Math.hypot(dx, dy) || 1;
  const x = dist - WAVE_SPEED * age, w = 10 + age * 16;
  if (Math.abs(x) > w * 1.6) return null;
  return { e: Math.exp(-(x * x) / (w * w)) * r.w * Math.exp(-age * 0.9), nx: dx / dist, ny: dy / dist };
}

export function splash(x, y, n, power) {      // world coords at the surface
  for (let i = 0; i < n && drops.length < 80; i++) {
    const mesh = new THREE.Mesh(BALL, SPLASH_MAT);
    mesh.scale.setScalar(Math.max(view.cw * rand(0.35, 0.6), 3));
    const a = rand(0, Math.PI * 2), sp = rand(40, 170) * power;
    drops.push({ mesh, x, y, z: 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rand(160, 320) * power, ripple: Math.random() < 0.35 });
    surfaceScene.add(mesh);
  }
}
