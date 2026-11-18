import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js";
import { state } from "./state.js";
import { ABOUT, ABOUT_TITLE, PROJECTS } from "./content.js";
import { ATLAS, DRIFT } from "./constants.js";
import { PAD_GEO, canvas, cellMat, ripples, solid, surfaceScene } from "./setup.js";
import { clamp, fish, pads, project, rand, ripple, rippleFront, view } from "./world.js";
import { pointer } from "./pond/swimming.js";
import { cam } from "./ui/camera.js";
import { gardenCY, overSandAt } from "./garden/terrain.js";
import { WEATHERS, weather } from "./weather.js";

/* ---------------- floating projects ---------------- */
const TEXT_BASE = ATLAS.length;                       // printable ASCII follows the pond glyphs in the atlas
export const SCRAMBLE = "#%&*+=-:/\\";
const TEXT_INK = 1, TEXT_DIM = 2, TEXT_ACCENT = 3;
export const toAscii = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[·•]/g, "/").replace(/[—–]/g, "-").replace(/[^\x20-\x7e]/g, "?");

export function boxAt(w, d, h, x, y, z) { const g = new THREE.BoxGeometry(w, d, h); g.translate(x, y, z); return g; }
function trisGeometry(tris) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(2), 3));
  g.computeVertexNormals();
  return g;
}
/* Each object is built standing up (up = +z, front = -y), then tipped toward
 * the camera so it is seen from the side, the way people know these things:
 * a lantern's posts and roof, a paper boat's hull and sail, an ema's face. */
export const TILT = 0;                                      // upright, seen from straight above like the fish, pads and rocks
const TILT_S = Math.sin(-TILT), TILT_C = Math.cos(TILT);

const BOAT_GEO = (() => {
  const A = [-0.75, 0, 0], B = [0.75, 0, 0], C = [-1.3, 0.45, 0.6], D = [1.3, 0.45, 0.6], E = [-1.3, -0.45, 0.6], F = [1.3, -0.45, 0.6];
  const S = [-1.75, 0, 1.0], Bw = [1.75, 0, 1.0], I = [0, 0, 1.75];
  const L1 = [-0.65, 0.45, 0.6], R1 = [0.65, 0.45, 0.6], L2 = [-0.65, -0.45, 0.6], R2 = [0.65, -0.45, 0.6], T1 = [0, 0.08, 1.55], T2 = [0, -0.08, 1.55];
  return trisGeometry([
    [A, B, D], [A, D, C], [A, F, B], [A, E, F],     // hull sides
    [A, C, S], [A, S, E], [B, Bw, D], [B, F, Bw],   // raised bow and stern
    [L1, R1, T1], [L2, T2, R2], [L1, T1, I], [R1, I, T1], [L2, I, T2], [R2, T2, I], // folded sail
  ]);
})();
const EMA_GEO = (() => {
  const s = new THREE.Shape();
  s.moveTo(-1, -0.7); s.lineTo(1, -0.7); s.lineTo(1, 0.4); s.lineTo(0, 0.95); s.lineTo(-1, 0.4); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.04, bevelSegments: 2 });
  g.rotateX(Math.PI / 2);                            // stand it up, face to the front
  g.translate(0, 0.1, 0.95);
  return g;
})();
const ROOF_GEO = (() => { const g = new THREE.ConeGeometry(1.22, 0.5, 4, 1); g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 4); return g; })();

function buildObject(p) {
  const group = new THREE.Group(), mats = [];
  const tag = 0.6 + (p.i % 12) * 0.025;   // a distinct mark per project, for its outline                // marks the object's pixels for the outline pass
  const add = (geo, cls, emit = 0, pos) => {
    const m = solid(cls, 0, emit); m.uniforms.uTag.value = tag; mats.push(m);
    const mesh = new THREE.Mesh(geo, m); if (pos) mesh.position.set(...pos); group.add(mesh); return m;
  };
  if (p.kind === "pad") {
    // A lily pad, like the others on the pond; the outline and its title mark it as a project.
    p.glowMat = add(PAD_GEO, 6, 0.35, [0, 0, 0.05]);
    p.glowMat.uniforms.uPad.value = 1;
    group.children[0].scale.set(1.15, 1.15, 1);   // about the size of the plain pads
    p.unitR = 1.15; p.unitH = 0.3;
  } else if (p.kind === "candle") {
    // A candle on a lily pad: a bright white pillar, a dark wick and a big flame.
    add(PAD_GEO, 6, 0.2, [0, 0.15, 0.05]).uniforms.uPad.value = 1;
    group.children[group.children.length - 1].scale.set(1.55, 1.55, 1);
    const wax = new THREE.CylinderGeometry(0.55, 0.6, 1.6, 20); wax.rotateX(Math.PI / 2);
    p.glowMat = add(wax, 1, 0.9, [0, 0, 0.9]);
    const wick = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 6); wick.rotateX(Math.PI / 2);
    add(wick, 28, 0, [0, 0, 1.85]);
    // A teardrop flame: round at the base, drawn up to a point.
    const prof = Array.from({ length: 14 }, (_, i) => {
      const t = i / 13;
      return new THREE.Vector2(0.46 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.3)), 0.6) * Math.pow(1 - t, 0.55) + 0.001, t * 1.25);
    });
    const flame = new THREE.LatheGeometry(prof, 14); flame.rotateX(Math.PI / 2);
    add(flame, 12, 1, [0, 0, 1.95]);
    p.flame = group.children[group.children.length - 1];
    p.unitR = 1.55; p.unitH = 3.1;
  } else if (p.kind === "lantern") {
    add(boxAt(2.3, 2.3, 0.25, 0, 0, 0.12), 19);                        // raft
    p.glowMat = add(boxAt(1.6, 1.6, 1.5, 0, 0, 1.0), 18, 1);           // paper
    for (const s of [-1, 1]) for (const t of [-1, 1]) add(boxAt(0.17, 0.17, 1.62, s * 0.8, t * 0.8, 1.05), 19); // posts
    for (const z of [0.62, 1.36]) {                                      // rails
      add(boxAt(1.7, 0.1, 0.1, 0, -0.82, z), 19); add(boxAt(1.7, 0.1, 0.1, 0, 0.82, z), 19);
      add(boxAt(0.1, 1.7, 0.1, -0.82, 0, z), 19); add(boxAt(0.1, 1.7, 0.1, 0.82, 0, z), 19);
    }
    add(boxAt(0.08, 0.1, 1.5, 0, -0.82, 1.0), 19);                       // centre bar on the front
    add(ROOF_GEO, 20, 0.25, [0, 0, 2.1]);                                  // roof
    p.unitR = 1.35; p.unitH = 2.5;
  } else if (p.kind === "boat") {
    p.glowMat = add(BOAT_GEO, 21, 0.6);
    p.unitR = 1.7; p.unitH = 1.75;
  } else {
    add(boxAt(2.3, 0.7, 0.2, 0, 0.1, 0.1), 19);                          // small float under it
    p.glowMat = add(EMA_GEO, 22, 0.35);
    add(new THREE.CircleGeometry(0.45, 24).rotateX(Math.PI / 2), 23, 0.75, [0, -0.2, 0.9]);     // red sun
    add(new THREE.TorusGeometry(0.16, 0.045, 6, 16).rotateX(Math.PI / 2), 23, 0.5, [0, -0.05, 2.02]); // cord
    p.unitR = 1.3; p.unitH = 2.1;
  }
  p.group = group; p.mats = mats; p.tag = tag;
  surfaceScene.add(group);
}

export const projects = PROJECTS.map((d, i) => ({
  ...d, i, x: 0, y: 0, vx: 0, vy: 0, hx: 0, hy: 0, r: 1, unitR: 1, unitH: 1, s: 20,
  yaw: (d.kind === "boat" ? (i % 2 ? Math.PI : 0) : 0) + rand(-0.25, 0.25), seed: rand(0, 9), wob: 0, lift: 0,
  beaconT: 1 + i * 0.7, decodeT: 0.5 + i * 0.18, placed: false, label: null,
}));
projects.forEach(buildObject);
export let hovered = null;

/** The middle of the object as seen on screen (world coords), lifted off its waterline. */
export function visCenter(p) {
  const h = p.unitH * p.s * 0.5 * (1 + 0.08 * p.lift);
  return [p.x, p.y + h * TILT_S, 3 + p.lift * 8 + h * TILT_C];
}
/** Screen radius that covers the object, for clicks. */
const hitR = (p) => Math.max(p.unitR, p.unitH * 0.5) * p.s * 1.15;

/** Homes on a loose spiral: the first projects sit in the opening view, the rest out across the pond. */
export function layoutProjects() {
  const n = projects.length, s = clamp(Math.min(view.W, view.H) * 0.055, 22, 46);
  projects.forEach((p, i) => {
    const a = -2.1 + i * 2.39996, rf = n === 1 ? 0.3 : 0.28 + 0.62 * (i / (n - 1));
    p.hx = Math.cos(a) * rf * view.WX * 0.42;
    p.hy = Math.sin(a) * rf * view.WY * 0.4;
    p.s = p.kind === "candle" ? s * 1.25 : s; p.r = p.unitR * p.s;
    p.group.scale.setScalar(s);
    if (!p.placed) { p.x = p.hx; p.y = p.hy; p.placed = true; }
  });
}

export function updateProjects(dt) {
  for (const p of projects) {
    // A slow current, a soft mooring line back to its spot, ripples and passing fish.
    const fx = DRIFT.x * 0.5 + Math.sin(p.y * 0.004 + state.clock * 0.13 + p.seed) * 2;
    const fy = DRIFT.y * 0.5 + Math.cos(p.x * 0.0035 - state.clock * 0.11 + p.seed) * 2;
    p.vx += ((fx - p.vx) * 0.3 + (p.hx - p.x) * 0.12) * dt;
    p.vy += ((fy - p.vy) * 0.3 + (p.hy - p.y) * 0.12) * dt;
    let kick = 0;
    for (const r of ripples) {
      const fr = rippleFront(r, p.x, p.y);
      if (fr) { p.vx += fr.nx * fr.e * 45 * dt; p.vy += fr.ny * fr.e * 45 * dt; kick = Math.max(kick, fr.e); }
    }
    p.wob = Math.max(p.wob * Math.exp(-dt * 1.3), kick);
    for (const f of fish) {
      if (f.z < -f.L * 0.16 - 60) continue;
      const hx = f.J[0].x, hy = f.J[0].y, dx = p.x - hx, dy = p.y - hy, d = Math.hypot(dx, dy) || 1;
      if (d < p.r + f.L * 0.2) {
        const push = (f.speed * 0.2 + 10) * dt * 1.5;
        p.vx += (Math.cos(f.heading) * 0.5 + dx / d * 0.5) * push;
        p.vy += (Math.sin(f.heading) * 0.5 + dy / d * 0.5) * push;
        if (Math.random() < dt * 0.6) ripple(hx, hy, 0.2);   // a nibble
      }
    }
    p.vx *= Math.exp(-dt * 0.9); p.vy *= Math.exp(-dt * 0.9);
    p.x += p.vx * dt; p.y += p.vy * dt;
    // Bump off lily pads and each other; stay in the pond.
    for (const o of [...pads, ...projects]) {
      if (o === p) continue;
      const R = (o.r ?? o.R) + p.r, dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy) || 1;
      if (d < R) {
        const k = (R - d) / d * (o.R ? 1 : 0.5);
        p.x += dx * k; p.y += dy * k;
        p.vx += dx / d * 6; p.vy += dy / d * 6;
      }
    }
    p.x = clamp(p.x, -view.WX / 2 + p.r * 1.5, view.WX / 2 - p.r * 1.5);
    p.y = clamp(p.y, -view.WY / 2 + p.r * 1.5, view.WY / 2 - 90 - p.r * 1.5);
    // A beacon: every few seconds a small ring says "something's here".
    p.beaconT -= dt;
    if (p.beaconT <= 0) { ripple(p.x, p.y, p === hovered || p === state.openProj ? 0.5 : 0.3); p.beaconT = rand(3, 4.5); }
    const active = p === hovered || p === state.openProj || p === state.navHover;
    p.lift += ((active ? 1 : 0) - p.lift) * Math.min(1, dt * 6);
    p.group.position.set(p.x, p.y, 3 + p.lift * 8 + Math.sin(state.clock * 1.3 + p.seed) * 1.2);
    p.group.rotation.set(
      TILT + 0.05 * Math.sin(state.clock * 0.8 + p.seed) + p.wob * 0.2 * Math.sin(state.clock * 7 + p.seed),
      0.06 * Math.sin(state.clock * 0.6 + p.seed * 2) + p.wob * 0.2 * Math.cos(state.clock * 6 + p.seed),
      p.yaw + 0.12 * Math.sin(state.clock * 0.35 + p.seed));
    p.group.scale.setScalar(p.s * (1 + 0.08 * p.lift));
    if (p.kind === "candle") {
      p.flick = 0.85 + 0.1 * Math.sin(state.clock * 11 + p.seed) + 0.06 * Math.sin(state.clock * 23.7 + p.seed * 3);
      p.flame.scale.set(1, 1, 0.85 + 0.3 * (p.flick - 0.85) / 0.16);
      p.flame.position.x = 0.04 * Math.sin(state.clock * 7.3 + p.seed);
      p.glowMat.uniforms.uEmit.value = 0.9 + 0.1 * p.lift;
    } else if (p.kind !== "lantern") p.glowMat.uniforms.uEmit.value = (p.kind === "boat" ? 0.6 : 0.35) + 0.35 * p.lift;
  }
  let tag = -1;
  const focus = hovered || state.navHover || state.openProj;
  if (focus) tag = focus.tag;
  cellMat.uniforms.uHoverTag.value = tag;
}

/* Titles go straight into the character grid, as part of the pond. */
let textData = new Uint8Array(4), textTex = null;
export function allocText() {
  textData = new Uint8Array(view.cols * view.rows * 4);
  textTex?.dispose();
  textTex = new THREE.DataTexture(textData, view.cols, view.rows, THREE.RGBAFormat);
  textTex.minFilter = textTex.magFilter = THREE.NearestFilter;
  textTex.needsUpdate = true;
  cellMat.uniforms.uText.value = textTex;
}
function putText(col, row, str, style, decodeT) {
  if (row < 0 || row >= view.rows) return;
  str = toAscii(str);
  for (let i = 0; i < str.length; i++) {
    const c = col + i;
    if (c < 0 || c >= view.cols) continue;
    let code = str.charCodeAt(i);
    if (code !== 32 && state.clock < decodeT + 0.25 + i * 0.025) code = SCRAMBLE.charCodeAt(Math.floor(Math.random() * SCRAMBLE.length));
    const k = ((view.rows - 1 - row) * view.cols + c) * 4;
    textData[k] = TEXT_BASE + code - 32; textData[k + 1] = style;
  }
}

/** The about text, framed like the project panel, centred in the garden. */
function drawAbout() {
  const lines = ABOUT.map(toAscii), inner = Math.max(ABOUT_TITLE.length + 6, ...lines.map((l) => l.length)) + 2;
  const [sx, sy] = project(0, gardenCY(), 0);
  const rows = lines.length + 4;
  const c0 = Math.round(sx / view.cw) - Math.floor((inner + 2) / 2), r0 = Math.round(sy / view.ch) - Math.floor(rows / 2);
  if (r0 > view.rows || r0 + rows < 0 || c0 > view.cols || c0 + inner + 2 < 0) return;
  for (let r = Math.max(0, r0); r < Math.min(view.rows, r0 + rows); r++) for (let c = Math.max(0, c0); c < Math.min(view.cols, c0 + inner + 2); c++) textData[((view.rows - 1 - r) * view.cols + c) * 4 + 2] = 255;
  const head = `[ ${ABOUT_TITLE} ]`;
  putText(c0, r0, "+-", TEXT_DIM, -9); putText(c0 + 2, r0, head, TEXT_ACCENT, state.aboutDecodeT);
  putText(c0 + 2 + head.length, r0, "-".repeat(inner - head.length - 1) + "+", TEXT_DIM, -9);
  putText(c0, r0 + 1, "|" + " ".repeat(inner) + "|", TEXT_DIM, -9);
  lines.forEach((l, i) => {
    putText(c0, r0 + 2 + i, "| ", TEXT_DIM, -9);
    putText(c0 + 2, r0 + 2 + i, l.padEnd(inner - 1), TEXT_INK, state.aboutDecodeT + i * 0.05);
    putText(c0 + inner + 1, r0 + 2 + i, "|", TEXT_DIM, -9);
  });
  putText(c0, r0 + 2 + lines.length, "|" + " ".repeat(inner) + "|", TEXT_DIM, -9);
  putText(c0, r0 + 3 + lines.length, "+" + "-".repeat(inner) + "+", TEXT_DIM, -9);
}
export function drawLabels() {
  textData.fill(0);
  for (const p of projects) {
    const [sx, sy] = project(...visCenter(p));
    const active = p === hovered || p === state.openProj || p === state.navHover;
    const idx = String(p.i + 1).padStart(2, "0");
    const meta = [p.year, p.role].filter(Boolean).join(" / ");
    const hint = p === state.openProj ? "open" : "click to open";
    if (sx < 0 || sx > view.W || sy < 0 || sy > view.H) {
      // Off screen: a marker on the screen's edge pointing the way.
      const dx = sx - view.W / 2, dy = sy - view.H / 2;
      const ex = view.W / 2 - view.cw * 6, ey = view.H / 2 - view.ch * 3;
      const t = Math.min(ex / Math.max(Math.abs(dx), 1e-6), ey / Math.max(Math.abs(dy), 1e-6));
      const horiz = Math.abs(dx) * t >= ex - 1;
      const text = horiz ? (dx > 0 ? `${idx} >` : `< ${idx}`) : (dy > 0 ? `v ${idx}` : `^ ${idx}`);
      const c0 = Math.round((view.W / 2 + dx * t) / view.cw) - (horiz ? (dx > 0 ? text.length - 1 : 0) : 2);
      const r0 = Math.round((view.H / 2 + dy * t) / view.ch);
      putText(c0, r0, text, active ? TEXT_ACCENT : TEXT_DIM, p.decodeT);
      p.label = { c0, c1: c0 + text.length, r0, r1: r0 + 1 };
      continue;
    }
    const len = 4 + Math.max(p.title.length, active ? Math.max(meta.length, hint.length) : 0);
    const gap = hitR(p) * 0.85 * view.zoom + 10;
    let c0 = Math.round((sx + gap) / view.cw);
    if (c0 + len > view.cols - 1) c0 = Math.round((sx - gap) / view.cw) - len;
    const r0 = Math.round(sy / view.ch) - (active ? 1 : 0);
    putText(c0, r0, idx, active ? TEXT_ACCENT : TEXT_DIM, p.decodeT);
    putText(c0 + 4, r0, p.title, active ? TEXT_ACCENT : TEXT_INK, p.decodeT);
    if (active) {
      putText(c0 + 4, r0 + 1, meta, TEXT_INK, p.decodeT);
      putText(c0 + 4, r0 + 2, hint, TEXT_DIM, p.decodeT);
    }
    p.label = { c0, c1: c0 + len, r0, r1: r0 + (active ? 3 : 1) };
  }
  if (state.clock - weather.announceT < 6) {
    const msg = `~ ${WEATHERS[weather.kind].name} ~`;
    putText(Math.round(view.cols / 2 - msg.length / 2), 2, msg, TEXT_DIM, weather.announceT);
  }
  drawAbout();
  textTex.needsUpdate = true;
}

const glows = cellMat.uniforms.uGlow.value;
const flames = cellMat.uniforms.uFlames.value;
function updateFlames() {
  flames.forEach((f) => f.set(0, 0, 1, 0));
  let n = 0;
  for (const p of projects) {
    if (p.kind !== "candle" || n >= flames.length) continue;
    const h = 2.45 * p.s * (1 + 0.08 * p.lift);          // the flame's height on the tilted candle
    const [sx, sy] = project(p.x, p.y + h * TILT_S, 3 + p.lift * 8 + h * TILT_C);
    flames[n++].set(sx, sy, p.s * 3.2 * view.zoom, (0.8 + 0.4 * p.lift) * (p.flick ?? 1));
  }
}
export function updateGlows() {
  updateFlames();
  glows.forEach((g) => g.set(0, 0, 1, 0));
  let n = 0;
  for (const p of projects) {
    if (n >= glows.length) break;
    const base = p.kind === "candle" ? 0.6 * (p.flick ?? 1) : p.kind === "lantern" ? 0.55 : 0;
    const w = base + 0.45 * p.lift;
    if (w <= 0.01) continue;
    const [sx, sy] = project(...visCenter(p));
    glows[n++].set(sx, sy, p.r * (p.kind === "candle" ? 3.2 : p.kind === "lantern" ? 3.0 : 2.2) * view.zoom, w);
  }
}

export function findHover() {
  if (!pointer.inside) return null;
  const col = Math.floor(pointer.x / view.cw), row = Math.floor(pointer.y / view.ch);
  for (const p of projects) {
    const [sx, sy] = project(...visCenter(p));
    if (Math.hypot(pointer.x - sx, pointer.y - sy) < hitR(p) * view.zoom) return p;
    const l = p.label;
    if (l && col >= l.c0 && col < l.c1 && row >= l.r0 && row < l.r1) return p;
  }
  return null;
}

export function updateHover() {
  const sand = pointer.inside && overSandAt(pointer.x, pointer.y);
  const h = sand ? null : findHover();
  if (h !== hovered) {
    if (h && h !== state.openProj) h.decodeT = state.clock;
    hovered = h;
  }
  if (!cam.dragging) canvas.style.cursor = sand ? "crosshair" : h ? "pointer" : "grab";
}
