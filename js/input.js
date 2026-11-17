import { canvas } from "./setup.js";
import { clamp, ripple, toWorld, view } from "./world.js";
import { dropFood } from "./pond/food.js";
import { pointer } from "./pond/swimming.js";
import { resize } from "./resize.js";
import { findHover } from "./projects.js";
import { openProject } from "./ui/panel.js";
import { cam, panBounds, zoomAt } from "./ui/camera.js";
import { onLandAt } from "./garden/terrain.js";
import { garden } from "./garden/scene.js";

/* ---------------- input ---------------- */
// On the water: press and drag to move around (with a fling when you let go);
// a press that doesn't move is a click, which feeds the fish or opens a project.
let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  if (onLandAt(e.clientX, e.clientY) || drag) return;      // the garden handles the land
  Object.assign(pointer, { x: e.clientX, y: e.clientY, inside: true });
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, world: toWorld(e.clientX, e.clientY), moved: false, t: performance.now(), vx: 0, vy: 0, last: performance.now(), px: view.panX, py: view.panY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id || pinch) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 7) { drag.moved = true; cam.dragging = true; cam.target = null; canvas.style.cursor = "grabbing"; }
  if (!drag.moved) return;
  // Keep the spot you grabbed under the pointer.
  const b = panBounds();
  view.panX = clamp(drag.world[0] - view.cx - (e.clientX - view.W / 2 - view.cx) / view.zoom, b.x0, b.x1);
  view.panY = clamp(drag.world[1] - view.cy + (e.clientY - view.H / 2 + view.cy) / view.zoom, b.y0, b.y1);
  const now = performance.now(), dt = Math.max(8, now - drag.last) / 1000;
  drag.vx += ((view.panX - drag.px) / dt - drag.vx) * 0.5; drag.vy += ((view.panY - drag.py) / dt - drag.vy) * 0.5;
  drag.px = view.panX; drag.py = view.panY; drag.last = now;
});
const endDrag = (e, cancelled) => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null; cam.dragging = false; canvas.style.cursor = "";
  if (d.moved) { if (performance.now() - d.last < 80) { cam.vx = d.vx; cam.vy = d.vy; } return; }   // fling
  if (cancelled || pinch || performance.now() - d.t > 600) return;
  Object.assign(pointer, { x: e.clientX, y: e.clientY, inside: true });
  const p = findHover();
  if (p) openProject(p); else dropFood(e.clientX, e.clientY);
};
canvas.addEventListener("pointerup", (e) => endDrag(e, false));
canvas.addEventListener("pointercancel", (e) => endDrag(e, true));

// Two fingers: pinch to zoom, and move together to pan.
export const touches = new Map();
let pinch = null;
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "touch") return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: view.zoom, world: toWorld(...mid) };
    drag = null; cam.dragging = false; garden.raking = false; garden.touchStart = null;
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!pinch || touches.size < 2) return;
  const [a, b] = [...touches.values()];
  const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.z0 * (d / pinch.d0), pinch.world);
});
const liftTouch = (e) => {
  if (!touches.delete(e.pointerId)) return;
  if (touches.size < 2) pinch = null;
  if (touches.size === 0) pointer.inside = false;          // no hovering on a touch screen
};
canvas.addEventListener("pointerup", liftTouch);
canvas.addEventListener("pointercancel", liftTouch);
// Mouse wheel and trackpad pinch.
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const k = e.ctrlKey ? 0.012 : 0.0016;
  zoomAt(e.clientX, e.clientY, view.zoom * Math.exp(-e.deltaY * k));
}, { passive: false });
// Keep Safari from zooming the whole page.
for (const ev of ["gesturestart", "gesturechange"]) document.addEventListener(ev, (e) => e.preventDefault());
canvas.addEventListener("pointermove", (e) => {
  const now = performance.now(), dt = Math.max(8, now - pointer.t) / 1000;
  if (pointer.inside) { pointer.vx = (e.clientX - pointer.x) / dt; pointer.vy = (e.clientY - pointer.y) / dt; }
  Object.assign(pointer, { x: e.clientX, y: e.clientY, t: now, inside: true });
  if (Math.hypot(pointer.vx, pointer.vy) > 260 && now - pointer.lastRipple > 110 && !onLandAt(e.clientX, e.clientY)) { ripple(...toWorld(e.clientX, e.clientY), 0.35); pointer.lastRipple = now; }
});
canvas.addEventListener("pointerleave", () => { pointer.inside = false; });

addEventListener("resize", resize);
