import { state } from "../state.js";
import { NR } from "../constants.js";
import { camera, cellMat, ripples, ripplesU } from "../setup.js";
import { $, clamp, fish, pads, project, toWorld, view } from "../world.js";
import { hovered, projects } from "../projects.js";
import { gardenTop, shoreY } from "../garden/terrain.js";
import { garden } from "../garden/scene.js";
import { updateTheme } from "../theme.js";
import { sky } from "../sky.js";
import { WEATHER_KEYS, setWeather } from "../weather.js";

/* ---------------- camera: WASD / arrows, joystick, minimap ---------------- */
const keys = { w: false, a: false, s: false, d: false, shift: false };
const stick = { x: 0, y: 0, id: null };
export const cam = { vx: 0, vy: 0, target: null, hold: 0, dragging: false };
// Movement keys go by their position on the keyboard (e.code), so W A S D on
// QWERTY is Z Q S D on AZERTY, and so on. The caps show the visitor's letters.
const KEYMAP = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", ArrowUp: "w", ArrowLeft: "a", ArrowDown: "s", ArrowRight: "d" };
const CAP_CODES = { w: "KeyW", a: "KeyA", s: "KeyS", d: "KeyD" };
const capEls = Object.fromEntries([...document.querySelectorAll("#keys kbd")].map((k) => [k.dataset.k, k]));

function setKey(k, on) {
  if (keys[k] === on) return;
  keys[k] = on;
  capEls[k]?.classList.toggle("on", on);
}
addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "Shift") { keys.shift = true; return; }
  if (e.code.startsWith("Arrow") && state.openProj) return;     // arrows step through projects while one is open
  if (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "_") {
    e.preventDefault();
    zoomAt(view.W / 2, view.H / 2, view.zoom * (e.key === "-" || e.key === "_" ? 1 / 1.2 : 1.2));
    return;
  }
  if (/^Digit[1-6]$/.test(e.code)) { setWeather(WEATHER_KEYS[+e.code.slice(5) - 1]); return; }   // 1-6: pick the weather
  const k = KEYMAP[e.code];
  if (!k) return;
  e.preventDefault();
  if (e.code.startsWith("Key") && e.key.length === 1) labelCap(k, e.key);   // learn the layout from a real key press
  setKey(k, true);
});
addEventListener("keyup", (e) => { if (e.key === "Shift") keys.shift = false; const k = KEYMAP[e.code]; if (k) setKey(k, false); });
addEventListener("blur", () => { Object.keys(capEls).forEach((k) => setKey(k, false)); keys.shift = false; });

function labelCap(k, ch) { if (capEls[k] && /\p{L}/u.test(ch)) capEls[k].textContent = ch.toUpperCase(); }
// Ask the browser for the keyboard layout where it can tell us (Chrome, Edge);
// otherwise guess AZERTY for French and Belgian visitors until a key is pressed.
(async () => {
  try {
    const map = await navigator.keyboard?.getLayoutMap?.();
    if (map) { for (const [k, code] of Object.entries(CAP_CODES)) { const ch = map.get(code); if (ch) labelCap(k, ch); } return; }
  } catch {}
  if (/^fr|^(nl|de)-BE/i.test(navigator.language || "")) { labelCap("w", "z"); labelCap("a", "q"); }
})();

// The key caps also work held down with a mouse or pen.
for (const [k, el] of Object.entries(capEls)) {
  el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); setKey(k, true); e.preventDefault(); });
  const up = () => setKey(k, false);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
}

// Joystick, shown on touch screens instead of the keys.
const stickEl = $("stick"), knob = stickEl.querySelector(".knob");
function moveStick(e) {
  const r = stickEl.getBoundingClientRect(), R = r.width / 2, max = R * 0.62;
  let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
  const d = Math.hypot(dx, dy);
  if (d > max) { dx *= max / d; dy *= max / d; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  const m = Math.min(d, max) / max;
  const k = m < 0.12 ? 0 : (m - 0.12) / 0.88 / (m || 1);
  stick.x = (dx / max) * k; stick.y = (dy / max) * k;
}
function endStick(e) {
  if (e.pointerId !== stick.id) return;
  stick.id = null; stick.x = stick.y = 0;
  knob.style.transform = "";
  stickEl.classList.remove("on");
}
stickEl.addEventListener("pointerdown", (e) => {
  stick.id = e.pointerId;
  stickEl.setPointerCapture(e.pointerId);
  stickEl.classList.add("on");
  moveStick(e);
  e.preventDefault();
});
stickEl.addEventListener("pointermove", (e) => { if (e.pointerId === stick.id) moveStick(e); });
stickEl.addEventListener("pointerup", endStick);
stickEl.addEventListener("pointercancel", endStick);

export function panBounds() {
  const hw = view.W / 2 / view.zoom, hh = view.H / 2 / view.zoom;
  let x0 = -view.WX / 2 + hw, x1 = view.WX / 2 - hw;
  let y0 = -view.WY / 2 + hh, y1 = gardenTop() - hh;
  if (x0 > x1) x0 = x1 = (x0 + x1) / 2;
  if (y0 > y1) y0 = y1 = 0;
  return { x0, x1, y0, y1 };
}
export const zoomMin = () => Math.max(view.W / view.WX, view.H / (view.WY + view.GH), 0.8), ZOOM_MAX = 2.6;   // never pulled far out
/** Put the camera where view says, at the current zoom, and tell the shaders. */
function applyCamera() {
  const d = view.camZ / view.zoom;
  camera.position.set(view.cx + view.panX, view.cy + view.panY, d);
  camera.near = d * 0.25; camera.far = d * 3 + 400;
  camera.updateProjectionMatrix();
  const u = cellMat.uniforms, z = view.zoom;
  u.uZoom.value = z;
  u.uCam.value.set(view.cx + view.panX, view.cy + view.panY);
  u.uAxis.value.set(view.W / 2 + view.cx, view.H / 2 - view.cy);
  u.uShadow.value.set((sky.shadow[0] * 34 * z) / view.cw, (sky.shadow[1] * 34 * z) / view.ch);
  u.uShadowRock.value.set((sky.shadow[0] * 9 * z) / view.cw, (sky.shadow[1] * 9 * z) / view.ch);
}
/** Zoom so the world point under screen point (sx, sy) stays put. */
export function zoomAt(sx, sy, z, world = toWorld(sx, sy)) {
  view.zoom = clamp(z, zoomMin(), ZOOM_MAX);
  view.panX = world[0] - view.cx - (sx - view.W / 2 - view.cx) / view.zoom;
  view.panY = world[1] - view.cy + (sy - view.H / 2 + view.cy) / view.zoom;
  const b = panBounds();
  view.panX = clamp(view.panX, b.x0, b.x1); view.panY = clamp(view.panY, b.y0, b.y1);
  cam.target = null; cam.vx = cam.vy = 0;
  applyCamera();
}
/** Glide the camera so a world point sits at screen point (fx, fy) as fractions of the screen. */
export function flyTo(x, y, fx = 0.5, fy = 0.5) {
  const b = panBounds();
  cam.target = { x: clamp(x + ((0.5 - fx) * view.W) / view.zoom, b.x0, b.x1), y: clamp(y - ((0.5 - fy) * view.H) / view.zoom, b.y0, b.y1) };
}

export function updateCamera(dt) {
  let ix = (keys.d ? 1 : 0) - (keys.a ? 1 : 0) + stick.x;
  let iy = (keys.w ? 1 : 0) - (keys.s ? 1 : 0) - stick.y;
  const il = Math.hypot(ix, iy);
  if (il > 1) { ix /= il; iy /= il; }
  // Holding a direction speeds up over a second (to about twice as fast); Shift doubles it.
  cam.hold = il > 0.05 ? Math.min(cam.hold + dt, 1.2) : 0;
  const boost = (1 + cam.hold / 1.2) * (keys.shift ? 2 : 1);
  const speed = (Math.max(view.W, view.H) * 0.85 * boost) / view.zoom;
  if (il > 0.05) cam.target = null;
  if (cam.dragging) { cam.vx = cam.vy = 0; }
  if (cam.target) {
    const tx = cam.target.x - view.panX, ty = cam.target.y - view.panY;
    cam.vx += (tx * 3.5 - cam.vx) * Math.min(1, dt * 6);
    cam.vy += (ty * 3.5 - cam.vy) * Math.min(1, dt * 6);
    if (Math.hypot(tx, ty) < 0.5) cam.target = null;
  } else if (!cam.dragging) {
    // Quick to respond, then a short glide when you let go.
    const rate = il > 0.05 ? 9 : 3;
    cam.vx += (ix * speed - cam.vx) * Math.min(1, dt * rate);
    cam.vy += (iy * speed - cam.vy) * Math.min(1, dt * rate);
  }
  const bb = panBounds();
  const nx = clamp(view.panX + cam.vx * dt, bb.x0, bb.x1), ny = clamp(view.panY + cam.vy * dt, bb.y0, bb.y1);
  if (nx !== view.panX + cam.vx * dt) cam.vx = 0;
  if (ny !== view.panY + cam.vy * dt) cam.vy = 0;
  view.panX = nx; view.panY = ny;
  updateTheme();
  applyCamera();
  for (let i = 0; i < NR; i++) {
    const r = ripples[i];
    const [sx, sy] = project(r.x, r.y, 0);
    ripplesU[i].set(sx, sy, r.z, r.w);
  }
}

// Minimap: the whole pond, the view, pads, fish and projects.
const mini = $("minimap"), mctx = mini.getContext("2d");
export function sizeMinimap() {
  const w = 120, h = Math.round(clamp((w * (view.WY + view.GH)) / view.WX, 60, 150)), dpr = Math.min(devicePixelRatio || 1, 2);
  mini.style.width = `${w}px`; mini.style.height = `${h}px`;
  mini.width = w * dpr; mini.height = h * dpr;
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const miniScale = () => { const w = parseFloat(mini.style.width), h = parseFloat(mini.style.height); return { w, h, sx: w / view.WX, sy: h / (view.WY + view.GH) }; };
export function drawMinimap() {
  const { w, h, sx, sy } = miniScale();
  const mx = (x) => (x + view.WX / 2) * sx, my = (y) => (gardenTop() - y) * sy;
  mctx.clearRect(0, 0, w, h);
  mctx.fillStyle = "rgba(7,20,23,0.85)"; mctx.fillRect(0, 0, w, h);
  mctx.fillStyle = "rgba(231,221,204,0.9)";                      // the sand north of the shore
  mctx.beginPath(); mctx.moveTo(0, 0);
  for (let i = 0; i <= 24; i++) { const x = -view.WX / 2 + (i / 24) * view.WX; mctx.lineTo(mx(x), my(shoreY(x))); }
  mctx.lineTo(w, 0); mctx.closePath(); mctx.fill();
  mctx.fillStyle = "rgba(69,143,79,0.6)";
  for (const p of pads) { mctx.beginPath(); mctx.arc(mx(p.x), my(p.y), Math.max(1.5, p.R * sx), 0, Math.PI * 2); mctx.fill(); }
  for (const g of garden.built) { mctx.beginPath(); mctx.arc(mx(g.cx), my(g.cy), Math.max(1.5, g.R * sx), 0, Math.PI * 2); mctx.fill(); }
  mctx.fillStyle = "rgba(159,199,201,0.6)";
  for (const f of fish) mctx.fillRect(mx(f.x) - 0.75, my(f.y) - 0.75, 1.5, 1.5);
  if (garden.birds) {
    mctx.fillStyle = "rgba(30,26,28,0.5)";
    for (let i = 0; i < garden.N; i += 6) mctx.fillRect(mx(garden.birds.x[i]) - 0.5, my(garden.birds.y[i]) - 0.5, 1, 1);
  }
  for (const p of projects) {
    mctx.fillStyle = p === state.openProj || p === hovered ? "#ff6a2b" : "#e6f1f1";
    mctx.fillRect(mx(p.x) - 2, my(p.y) - 2, 4, 4);
  }
  mctx.strokeStyle = state.currentView === "garden" ? "#4a4036" : "#9fc7c9"; mctx.lineWidth = 1;
  const vw = view.W / view.zoom, vh = view.H / view.zoom;
  mctx.strokeRect(mx(view.panX - vw / 2) + 0.5, my(view.panY + vh / 2) + 0.5, vw * sx - 1, vh * sy - 1);
  mctx.strokeStyle = "rgba(120,140,140,0.5)"; mctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}
function miniJump(e) {
  const r = mini.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width - 0.5) * view.WX, y = gardenTop() - ((e.clientY - r.top) / r.height) * (view.WY + view.GH);
  flyTo(x, y);
}
mini.addEventListener("pointerdown", (e) => { mini.setPointerCapture(e.pointerId); miniJump(e); });
mini.addEventListener("pointermove", (e) => { if (e.buttons) miniJump(e); });
