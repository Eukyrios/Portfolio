import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js";
import { ATLAS, FONT } from "./constants.js";
import { camera, cellMat, cellT, renderer, screenMat, shadeT } from "./setup.js";
import { clamp, fish, halfH, halfW, view } from "./world.js";
import { placePads } from "./pond/pads.js";
import { allocText, layoutProjects } from "./projects.js";
import { ZOOM_MAX, sizeMinimap, zoomMin } from "./ui/camera.js";
import { initGarden } from "./garden/garden.js";

/* ---------------- sizing and glyph atlas ---------------- */
function buildAtlas(w, h) {
  const c = document.createElement("canvas");
  const glyphs = [...ATLAS, ...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i))];
  c.width = w * (glyphs.length + 8); c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(h * 0.76)}px ${FONT}`;
  glyphs.forEach((g, i) => ctx.fillText(g, i * w + w / 2, h / 2 + h * 0.03));
  const th = Math.max(1, Math.round(h * 0.075)), x0 = glyphs.length * w;
  [0.22, 0.5, 0.78].forEach((f, k) => ctx.fillRect(x0 + k * w, Math.round(h * f - th / 2), w, th));                  // horizontal
  [0.22, 0.5, 0.78].forEach((f, k) => ctx.fillRect(x0 + (3 + k) * w + Math.round(w * f - th / 2), 0, th, h));        // vertical
  ctx.strokeStyle = "#fff"; ctx.lineWidth = th;
  ctx.beginPath(); ctx.moveTo(x0 + 6 * w, h); ctx.lineTo(x0 + 7 * w, 0); ctx.stroke();                                 // /
  ctx.beginPath(); ctx.moveTo(x0 + 7 * w, 0); ctx.lineTo(x0 + 8 * w, h); ctx.stroke();                                 // \
  const t = new THREE.CanvasTexture(c);
  t.flipY = false; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter;
  return t;
}

export function resize() {
  const W = innerWidth, H = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  const cw = clamp(Math.round(W / 170), 6, 11), ch = Math.round(cw * 1.6);
  Object.assign(view, { W, H, cw, ch, cols: Math.ceil(W / cw), rows: Math.ceil(H / ch) });
  view.WX = Math.round(Math.max(W * 2, 1600)); view.WY = Math.round(Math.max(H * 2, 1300));
  view.GH = Math.round(Math.max(H * 0.55, 440)); view.GY0 = view.WY / 2;      // the garden (the about section): a strip north of the pond, about half a screen
  view.GWc = Math.round(Math.min(view.WX, W * 1.6));                          // its rocks and birds keep to the middle
  cellMat.uniforms.uHalf.value.set(W / 2, H / 2);
  view.base = clamp(Math.min(W, H) * 0.3, 110, 300);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  shadeT.setSize(view.cols * 2, view.rows * 2);
  cellT.setSize(view.cols, view.rows);
  const gridW = view.cols * cw, gridH = view.rows * ch;
  view.camZ = gridH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  view.cx = gridW / 2 - W / 2; view.cy = H / 2 - gridH / 2;
  camera.aspect = gridW / gridH;
  view.zoom = clamp(view.zoom, zoomMin(), ZOOM_MAX);
  camera.updateProjectionMatrix();
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  const cdx = cw * buf.x / W, cdy = ch * buf.y / H;
  cellMat.uniforms.uGrid.value.set(view.cols, view.rows);
  cellMat.uniforms.uCellCss.value.set(cw, ch);
  cellMat.uniforms.uShadow.value.set(-26 / cw, 22 / ch);
  const su = screenMat.uniforms;
  su.uCellDev.value.set(cdx, cdy); su.uGrid.value.set(view.cols, view.rows); su.uHeight.value = buf.y;
  su.uAtlas.value?.dispose();
  su.uAtlas.value = buildAtlas(Math.round(cdx), Math.round(cdy));
  allocText();
  layoutProjects();
  placePads();
  sizeMinimap();
  initGarden();
  for (const f of fish) { f.x = clamp(f.x, -halfW(f.z) * 0.9, halfW(f.z) * 0.9); f.y = clamp(f.y, -halfH(f.z) * 0.9, halfH(f.z) * 0.9); }
}
