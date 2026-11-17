import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js";
import { smooth } from "../geometry.js";
import { cellMat, screenMat } from "../setup.js";
import { clamp, view } from "../world.js";
import { gardenTop, shoreY } from "./terrain.js";
import { garden } from "./scene.js";

/** The untouched pattern: straight lines, rings around each island. */
const flowByte = (a) => 1 + Math.round(((((a % Math.PI) + Math.PI) % Math.PI) / Math.PI) * 254) % 255;
export function buildSand() {
  const t = garden.texel, GT = gardenTop();
  const hw = (garden.hw = Math.ceil((view.WX + 80) / t)), hh = (garden.hh = Math.ceil((view.GH + 80) / t));
  const HX0 = (garden.HX0 = -view.WX / 2 - 40), HY0 = (garden.HY0 = view.GY0 - 80 + hh * t);
  // Two bytes per texel: the sand's height, and which way its ridges run.
  garden.h = new Uint8Array(hw * hh * 2); garden.base = new Uint8Array(hw * hh * 2); garden.mask = new Uint8Array(hw * hh);
  const sp = garden.spacing;
  // Each stone gets rings in proportion to its size: one for a pebble-sized stone, up to five for the biggest.
  for (const g of garden.built) g.zone = clamp(Math.round((g.R * 2) / sp), 1, 5) * sp;
  for (let iy = 0; iy < hh; iy++) {
    const py = (iy + 0.5) * t, wy = HY0 - py;
    for (let ix = 0; ix < hw; ix++) {
      const wx = HX0 + (ix + 0.5) * t, i = iy * hw + ix;
      let d = Infinity, near = null;
      for (const g of garden.built) { const dd = Math.hypot(wx - g.cx, wy - g.cy) - g.R; if (dd < d) { d = dd; near = g; } }
      let v, flow = 0;
      if (wy - shoreY(wx) < 24 || wy > GT - 10 || d < 0) { v = 0.5; garden.mask[i] = 1; }
      else if (d < near.zone) {
        v = 0.5 + 0.5 * Math.cos((2 * Math.PI * d) / sp);
        flow = flowByte(Math.atan2(wx - near.cx, wy - near.cy));          // round the stone
      } else {
        const A = wx * 0.0045 + 1.3, B = wx * 0.013 + wy * 0.002;
        v = 0.5 + 0.5 * Math.cos((2 * Math.PI * (py + 16 * Math.sin(A) + 7 * Math.sin(B))) / sp);   // gently undulating lines
        const dPx = 16 * 0.0045 * Math.cos(A) + 7 * 0.013 * Math.cos(B), dPy = 1 - 7 * 0.002 * Math.cos(B);
        flow = flowByte(Math.atan2(-dPx, dPy));
      }
      garden.base[i * 2] = garden.h[i * 2] = Math.round(v * 255);
      garden.base[i * 2 + 1] = garden.h[i * 2 + 1] = flow;
    }
  }
  garden.tex?.dispose();
  garden.tex = new THREE.DataTexture(garden.h, hw, hh, THREE.RGFormat, THREE.UnsignedByteType);
  garden.tex.minFilter = garden.tex.magFilter = THREE.LinearFilter;
  garden.tex.needsUpdate = true;
  const u = cellMat.uniforms;
  u.uHeightMap.value = garden.tex;
  u.uGarden.value.set(view.GY0, HX0, hw * t, hh * t);
  screenMat.uniforms.uGarden.value.copy(u.uGarden.value);
}

/** Drag between two world points. The brush follows the zoom: one furrow at the
 *  closest zoom, three at normal size, up to seven zoomed out. */
const brushTines = () => clamp(Math.round(3 / view.zoom), 1, 7);
export function rakeSegment(ax, ay, bx, by) {
  const t = garden.texel, HY0 = garden.HY0;
  const x0 = ax - garden.HX0, y0 = HY0 - ay, x1 = bx - garden.HX0, y1 = HY0 - by;   // height-map px, y down
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const n = brushTines(), sp = garden.spacing;
  const tx = dx / len, ty = dy / len, nx = -ty, ny = tx, half = (n * sp) / 2;
  const u0 = n % 2 ? 0 : sp / 2;                         // a furrow under every tine
  const flow = flowByte(Math.atan2(ty, tx));
  const ix0 = Math.max(0, Math.floor((Math.min(x0, x1) - half) / t)), ix1 = Math.min(garden.hw - 1, Math.ceil((Math.max(x0, x1) + half) / t));
  const iy0 = Math.max(0, Math.floor((Math.min(y0, y1) - half) / t)), iy1 = Math.min(garden.hh - 1, Math.ceil((Math.max(y0, y1) + half) / t));
  const h = garden.h, mask = garden.mask, hw = garden.hw;
  for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++) {
    const i = iy * hw + ix;
    if (mask[i]) continue;
    const rx = (ix + 0.5) * t - x0, ry = (iy + 0.5) * t - y0;
    const along = rx * tx + ry * ty;
    if (along < -3 || along > len + 3) continue;
    const u = rx * nx + ry * ny;
    if (Math.abs(u) > half) continue;
    const target = 0.5 - 0.5 * Math.cos((2 * Math.PI * (u - u0)) / sp);
    const edge = 1 - smooth(half * (n === 1 ? 0.55 : 0.75), half, Math.abs(u));
    h[i * 2] = Math.round(h[i * 2] + (target * 255 - h[i * 2]) * 0.85 * edge);
    if (edge > 0.5) h[i * 2 + 1] = flow;
  }
  garden.dirty = true;
}
