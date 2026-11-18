import { canvas, cellMat } from "../setup.js";
import { toWorld, view } from "../world.js";
import { touches } from "../input.js";
import { overSandAt } from "./terrain.js";
import { buildGardenScene, garden } from "./scene.js";
import { buildSand, rakeSegment } from "./sand.js";
import { initBirds, stepBirds } from "./birds.js";

function layoutGarden() {
  const u = cellMat.uniforms;
  u.uSpacing.value = garden.spacing;
  u.uShadowBird.value.set(-60 / view.cw, 46 / view.ch);
}

export function initGarden() {
  garden.spacing = Math.max(16, Math.round(view.ch * 1.4));
  if (!garden.ready) { initBirds(); garden.ready = true; }
  buildGardenScene();
  buildSand();
  layoutGarden();
}

export function stepGarden(dt) {
  stepBirds(dt);
  // Smoothing sweeps the fresh pattern back across from west to east.
  if (garden.restoreX >= 0) {
    const to = Math.min(garden.hw, garden.restoreX + Math.ceil((garden.hw * dt) / 1.4));
    for (let iy = 0; iy < garden.hh; iy++) for (let ix = garden.restoreX; ix < to; ix++) { const i = (iy * garden.hw + ix) * 2; garden.h[i] = garden.base[i]; garden.h[i + 1] = garden.base[i + 1]; }
    garden.restoreX = to >= garden.hw ? -1 : to;
    garden.dirty = true;
  }
  if (garden.dirty) { garden.tex.needsUpdate = true; garden.dirty = false; }
}

canvas.addEventListener("pointerdown", (e) => {
  if (!overSandAt(e.clientX, e.clientY)) return;
  garden.last = toWorld(e.clientX, e.clientY);
  garden.rakeId = e.pointerId;
  if (e.pointerType === "touch") { garden.touchStart = { x: e.clientX, y: e.clientY, id: e.pointerId }; return; }
  garden.raking = true;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (garden.rakeId !== undefined && e.pointerId !== garden.rakeId && e.pointerType === "touch") return;
  const ts = garden.touchStart;
  if (ts && ts.id === e.pointerId && touches.size === 1 && Math.hypot(e.clientX - ts.x, e.clientY - ts.y) > 10) { garden.raking = true; garden.touchStart = null; }
  const cur = toWorld(e.clientX, e.clientY);
  if (!garden.last) { garden.last = cur; return; }
  const dx = cur[0] - garden.last[0], dy = garden.last[1] - cur[1], d = Math.hypot(dx, dy);   // dy in screen orientation
  if (d > 2) {
    garden.rakeDir = [garden.rakeDir[0] * 0.7 + (dx / d) * 0.3, garden.rakeDir[1] * 0.7 + (dy / d) * 0.3];
    const l = Math.hypot(...garden.rakeDir) || 1; garden.rakeDir = [garden.rakeDir[0] / l, garden.rakeDir[1] / l];
    if (garden.raking && overSandAt(e.clientX, e.clientY)) rakeSegment(garden.last[0], garden.last[1], cur[0], cur[1]);
    garden.last = cur;
  }
});
const endRake = () => { garden.raking = false; garden.touchStart = null; };
canvas.addEventListener("pointerup", endRake);
canvas.addEventListener("pointercancel", endRake);
