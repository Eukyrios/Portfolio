import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js";

/* ---------------- geometry ---------------- */
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const sToX = (s) => 0.5 - 0.8 * s;
const bodyZc = (s) => 0.012 * Math.sin(Math.PI * s);

function makeBuilder() {
  const P = [], part = [], flap = [], side = [], idx = [];
  function grid(nu, nv, fn, partId, sideV = 0) {
    const start = P.length / 3;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const r = fn(i / nu, j / nv);
      P.push(r[0], r[1], r[2]); part.push(partId); flap.push(r[3] ?? 0); side.push(sideV);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = start + i * (nv + 1) + j, b = a + nv + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  function build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("aPart", new THREE.Float32BufferAttribute(part, 1));
    g.setAttribute("aFlap", new THREE.Float32BufferAttribute(flap, 1));
    g.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  return { grid, build };
}

function fishGeometry(o) {
  const W = o.w;
  const bw = (s) => s < 0.3 ? W * Math.pow(Math.sin(s / 0.3 * Math.PI / 2), 0.55) : W * (1 - smooth(0.3, 1.0, s) * 0.84);
  const b = makeBuilder();
  const finSegs = o.long ? 18 : 10;
  // Body: an ellipse lofted from snout to tail, seam on the belly.
  b.grid(60, 24, (s, v) => {
    const a = -Math.PI / 2 + v * Math.PI * 2, w = bw(s), sa = Math.sin(a);
    return [sToX(s), w * Math.cos(a), bodyZc(s) + w * sa * (sa < 0 ? 0.85 : 1.0)];
  }, 0);
  const ew = bw(0.0875), er = W * 0.13;
  for (const sd of [-1, 1]) b.grid(6, 8, (u, v) => {
    const la = -Math.PI / 2 + u * Math.PI, lo = v * Math.PI * 2;
    return [0.43 + er * Math.cos(la) * Math.cos(lo), sd * ew * 0.8 + er * Math.cos(la) * Math.sin(lo), ew * 0.45 + er * Math.sin(la)];
  }, 5);
  const fin = (root, d, L, C, partId, sd) => {
    const len = Math.hypot(...d), dn = d.map((x) => x / len);
    b.grid(finSegs, 6, (t, w) => {
      const chord = C * (0.55 + 0.45 * Math.sin(Math.PI * t * 0.8)) * Math.sqrt(Math.max(1 - t * t * t, 0)) + 0.004;
      return [root[0] + dn[0] * t * L - (w - 0.15) * chord, root[1] + dn[1] * t * L, root[2] + dn[2] * t * L - 0.02 * t * t, t];
    }, partId, sd);
  };
  for (const sd of [-1, 1]) {
    const w1 = bw(0.29), w2 = bw(0.625);
    fin([0.27, sd * w1 * 0.72, -w1 * 0.38], [-0.5, sd, -0.2], o.pecL, o.pecC, 1, sd);
    fin([0.0, sd * w2 * 0.6, -w2 * 0.6], [-0.6, sd, -0.3], o.pelL, o.pelL * 0.6, 2, sd);
  }
  const dFrom = o.dFrom ?? 0.3, dTo = o.dTo ?? 0.75;
  b.grid(14, 3, (t, v) => {
    const s = dFrom + (dTo - dFrom) * t, h = o.dH * Math.pow(Math.sin(Math.PI * t), 0.6) * (1 - 0.4 * t);
    return [sToX(s) - v * 0.03, 0, bodyZc(s) + bw(s) - 0.006 + v * h, v];
  }, 3);
  // Tail: a forked fan, tilted so it reads from above.
  const x0 = sToX(0.97), z0 = bodyZc(0.97);
  b.grid(finSegs, 18, (t, v) => {
    const w = v * 2 - 1, aw = Math.abs(w);
    const Lw = o.tailL * (1 - o.fork + o.fork * Math.pow(aw, 0.7));
    const hs = 0.022 + o.tailSpan * Math.pow(t, 0.85);
    return [x0 - t * Lw, w * hs * 0.85, z0 + w * hs * 0.4, t];
  }, 4);
  return b.build();
}

export const GEO = {
  koi: fishGeometry({ w: 0.132, tailL: 0.22, tailSpan: 0.12, fork: 0.38, pecL: 0.17, pecC: 0.095, pelL: 0.1, dH: 0.05 }),
  butterfly: fishGeometry({ w: 0.12, tailL: 0.46, tailSpan: 0.17, fork: 0.32, pecL: 0.32, pecC: 0.12, pelL: 0.2, dH: 0.08, dTo: 0.88, long: true }),
  comet: fishGeometry({ w: 0.165, tailL: 0.5, tailSpan: 0.15, fork: 0.55, pecL: 0.15, pecC: 0.08, pelL: 0.1, dH: 0.075, long: true }),
  orfe: fishGeometry({ w: 0.088, tailL: 0.2, tailSpan: 0.1, fork: 0.6, pecL: 0.12, pecC: 0.06, pelL: 0.07, dH: 0.045 }),
};

export function padGeometry() {
  const P = [], idx = [];
  const rings = 9, segs = 44, notch = 0.5;
  P.push(0, 0, 0);
  for (let i = 1; i <= rings; i++) for (let j = 0; j <= segs; j++) {
    const r = i / rings, a = notch / 2 + (j / segs) * (Math.PI * 2 - notch);
    P.push(r * Math.cos(a), r * Math.sin(a), 0.03 * r * r + 0.06 * Math.pow(r, 10) + 0.012 * Math.sin(a * 7) * Math.pow(r, 4));
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + j, 2 + j);
  for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = 1 + (i - 1) * (segs + 1) + j, b = a + segs + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function petalGeometry(count, len, elev, twist) {
  const b = makeBuilder();
  for (let k = 0; k < count; k++) {
    const phi = (k / count) * Math.PI * 2 + twist;
    b.grid(6, 4, (t, w) => {
      const width = 0.32 * len * Math.pow(Math.sin(Math.PI * Math.min(t, 0.999)), 0.8) * (w * 2 - 1);
      const r = t * len * Math.cos(elev), z = t * len * Math.sin(elev) + 0.1 * len * t * t;
      return [r * Math.cos(phi) - width * Math.sin(phi), r * Math.sin(phi) + width * Math.cos(phi), z];
    }, 0);
  }
  return b.build();
}
