import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js";
import { solid } from "../setup.js";
import { view } from "../world.js";
import { TILT, boxAt } from "../projects.js";
import { C_LIGHT, C_MOSS, C_MOSS2, C_PEBBLE, C_ROCK, C_STONE, deckH, gardenCY, hash3i, shoreY, vnoise3 } from "./terrain.js";

export const gScene = new THREE.Scene();
const gsolid = (cls, emit = 0) => solid(cls, 0, emit);

export const garden = {
  ready: false, texel: 3, hw: 0, hh: 0, spacing: 39, h: null, base: null, mask: null, tex: null, dirty: false,
  built: [], raking: false, last: null, rakeDir: [1, 0], restoreX: -1,
  birds: null, N: 0, mesh: null, hawk: null, rake: null, HX0: 0,
};

// Composition: x as a fraction of the garden's width from its centre, y of the world's height; R of the shorter screen side.
// Rocks keep to either side, leaving the middle clear for the inscription.
const GROUPS = [
  { x: -0.40, y: 0.18, rocks: [[0, 0, 1.0], [0.055, -0.03, 0.6], [-0.05, 0.022, 0.45]] },
  { x: -0.26, y: -0.16, rocks: [[0, 0, 0.8], [0.045, 0.02, 0.42]] },
  { x: 0.27, y: 0.22, rocks: [[0, 0, 0.9], [-0.05, -0.022, 0.5], [0.048, -0.028, 0.36]] },
  { x: 0.40, y: -0.14, rocks: [[0, 0, 0.7], [0.04, 0.03, 0.45]] },
  { x: 0.47, y: 0.16, rocks: [], lantern: true },
  { x: -0.48, y: -0.20, rocks: [[0, 0, 0.6]] },
  { x: 0.22, y: -0.24, rocks: [[0, 0, 0.75], [-0.04, 0.02, 0.4]] },
];

function rockGeometry(seed, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position, v = new THREE.Vector3();
  const sy = 0.7 + hash3i(seed, 1, 2) * 0.35, sz = 0.55 + hash3i(seed, 3, 4) * 0.35;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const r = 1 + 0.28 * (vnoise3(v.x * 1.7 + seed, v.y * 1.7, v.z * 1.7) - 0.5) * 2 + 0.08 * (vnoise3(v.x * 4 + seed, v.y * 4, v.z * 4) - 0.5);
    let z = v.z * r * sz;
    if (z < 0) z *= 0.15;
    p.setXYZ(i, v.x * r, v.y * r * sy, z);
  }
  g.computeVertexNormals();
  return g;
}
/** Many small non-indexed geometries, each placed by a matrix, as one. */
function mergePlaced(items) {
  let n = 0;
  for (const { geo } of items) n += geo.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  let o = 0;
  for (const { geo, matrix } of items) {
    const g = geo.clone().applyMatrix4(matrix);
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(P, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(N, 3));
  return out;
}
function mossGeometry(seed) {
  const P = [0, 0, 1.5], idx = [], rings = 6, segs = 44;
  for (let i = 1; i <= rings; i++) for (let j = 0; j < segs; j++) {
    const a = (j / segs) * Math.PI * 2, t = i / rings;
    const rr = t * (1 + 0.16 * (vnoise3(Math.cos(a) * 1.5 + seed, Math.sin(a) * 1.5, 0) - 0.5) * 2);
    P.push(rr * Math.cos(a), rr * Math.sin(a), (1 - t * t) * 3 + vnoise3(rr * Math.cos(a) * 6, rr * Math.sin(a) * 6, seed) * 2.5);
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + j, 1 + ((j + 1) % segs));
  for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = 1 + (i - 1) * segs + j, b = 1 + (i - 1) * segs + ((j + 1) % segs), c = a + segs, d = b + segs;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function stoneLantern() {
  const grp = new THREE.Group(), stone = gsolid(C_STONE), light = gsolid(C_LIGHT, 1);
  const cyl = (rt, rb, h, seg, z) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.rotateX(Math.PI / 2); g.translate(0, 0, z); grp.add(new THREE.Mesh(g, stone)); };
  cyl(0.9, 1.05, 0.35, 6, 0.18);
  cyl(0.3, 0.38, 1.6, 8, 1.15);
  cyl(0.85, 0.6, 0.3, 6, 2.1);
  grp.add(new THREE.Mesh(boxAt(1.05, 1.05, 0.85, 0, 0, 2.68), stone));
  grp.add(new THREE.Mesh(boxAt(0.62, 1.12, 0.48, 0, 0, 2.7), light));
  const roof = new THREE.ConeGeometry(1.4, 0.65, 6); roof.rotateX(Math.PI / 2); roof.translate(0, 0, 3.42);
  grp.add(new THREE.Mesh(roof, stone));
  const ball = new THREE.SphereGeometry(0.22, 10, 8); ball.translate(0, 0, 3.92);
  grp.add(new THREE.Mesh(ball, stone));
  return grp;
}
const PEBBLES = Array.from({ length: 8 }, (_, i) => rockGeometry(100 + i * 17, 1));

export function buildGardenScene() {
  while (gScene.children.length) { const c = gScene.children[0]; gScene.remove(c); }
  const m = Math.min(view.W, view.H), GCY = gardenCY(), dh = deckH();
  const x0 = -view.WX / 2 - 60, x1 = view.WX / 2 + 60;
  // Pebbles: a band along the shore, merged into one mesh.
  const items = [], M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), T = new THREE.Vector3(), Zaxis = new THREE.Vector3(0, 0, 1);
  const peb = (x, y, s, k) => {
    Q.setFromAxisAngle(Zaxis, hash3i(k, 5, 9) * 6.28); S.set(s, s * 0.9, s * 0.8); T.set(x, y, 2);
    items.push({ geo: PEBBLES[k % 8], matrix: M.clone().compose(T, Q, S) });
  };
  let k = 0;
  for (let x = x0; x < x1; x += 13) for (let row = 0; row < 2; row++, k++) {
    peb(x + row * 6, shoreY(x) + row * 13 - 2 + (hash3i(k, 1, 1) - 0.5) * 6, 6 + hash3i(k, 2, 2) * 4, k);
  }
  gScene.add(new THREE.Mesh(mergePlaced(items), gsolid(C_PEBBLE)));
  // Moss islands with their rocks, and the stone lantern.
  // Rocks sit in the sand: sunk a little, with a few moss tufts creeping round their bases.
  // garden.built keeps each rock's footprint, so the raked rings hug every stone.
  garden.built = [];
  GROUPS.forEach((gr, gi) => {
    const cx = gr.x * view.GWc, cy = GCY + gr.y * view.GH;
    gr.rocks.forEach(([dx, dy, sc], ri) => {
      const size = sc * m * 0.036, seed = gi * 31 + ri * 7 + Math.round(sc * 100);
      const rock = new THREE.Mesh(rockGeometry(seed), gsolid(C_ROCK));
      const x = cx + dx * m, y = cy + dy * m;
      rock.scale.setScalar(size);
      rock.position.set(x, y, -size * 0.22);
      rock.rotation.z = hash3i(gi, ri, 5) * 6.28;
      gScene.add(rock);
      garden.built.push({ cx: x, cy: y, R: size * 1.02, rock: true });
      if (sc >= 0.55) {
        const tufts = 1 + Math.floor(hash3i(gi, ri, 8) * 2);
        for (let t = 0; t < tufts; t++) {
          const a = hash3i(gi, ri, 11 + t) * 6.28, r = size * (0.75 + hash3i(gi, ri, 13 + t) * 0.25), ts = size * (0.32 + hash3i(gi, ri, 17 + t) * 0.18);
          const moss = new THREE.Mesh(mossGeometry(seed + t * 3), gsolid(t % 2 ? C_MOSS2 : C_MOSS));
          moss.scale.set(ts, ts * 0.8, 0.6);
          moss.position.set(x + Math.cos(a) * r, y + Math.sin(a) * r, 0);
          moss.rotation.z = a;
          gScene.add(moss);
        }
      }
    });
    if (gr.lantern) {
      const lan = stoneLantern();
      lan.scale.setScalar(m * 0.026);
      lan.position.set(cx, cy, 0);
      lan.rotation.x = TILT;
      gScene.add(lan);
      garden.built.push({ cx, cy, R: m * 0.026 * 1.05 });
    }
  });
  // Dragging on the sand draws grooves (see rakeSegment); nothing is shown in the scene for it.

  if (garden.mesh) gScene.add(garden.mesh);
}
