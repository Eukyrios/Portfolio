import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js";

/* A starling. Bird units: x forward (bill tip at +1.1), y left, z up; about 2 long.
 * Body and head are one lofted surface; the bill, eyes, wings, tail and legs are
 * their own parts. The vertex shader (BIRD_VERT) poses all of it.
 *
 * Attributes:
 *   aInfo  = (part, span or leg segment, tone, head weight)
 *            part: 0 body, 1 bill, 2 eye, 3 wing, 4 tail, 5 leg
 *            span: 0..1 from shoulder to wing tip; for legs the segment (0 shank, 1-3 front toes, 4 hind toe)
 *            head weight: how much a vertex follows the head (0 body .. 1 head)
 *   aUV    = the part's own grid coordinates, for feather patterns (wing: span, chord)
 *   aFold  / aFoldN = where a wing vertex lies, and which way it faces, with the wing folded on the back
 * Legs store their cross-section in position.xy and how far along the segment in position.z. */

// The shoulder and wing layout; the shader uses the same numbers.
export const WING = { YS: 0.12, ZS: 0.1, SP: 1.75, ARM: 0.36 };

/** Smooth (Catmull-Rom) interpolation through rows [x, ...values], x ascending. */
function curve(tab, x) {
  const n = tab.length;
  if (x <= tab[0][0]) return tab[0].slice(1);
  if (x >= tab[n - 1][0]) return tab[n - 1].slice(1);
  let k = 1;
  while (tab[k][0] < x) k++;
  const p1 = tab[k - 1], p2 = tab[k], p0 = tab[Math.max(0, k - 2)], p3 = tab[Math.min(n - 1, k + 1)];
  const t = (x - p1[0]) / (p2[0] - p1[0]), t2 = t * t, t3 = t2 * t;
  return p1.slice(1).map((_, i) => {
    const a = p0[i + 1], b = p1[i + 1], c = p2[i + 1], d = p3[i + 1];
    return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  });
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Body and head: [x, half width, half height above, half height below, centre z, tone].
// Plump and deep-chested, a short neck, a round head carried a little high.
const BODY = [
  [-0.44, 0.05, 0.035, 0.03, 0.04, 0.85],
  [-0.36, 0.11, 0.09, 0.08, 0.03, 0.85],
  [-0.22, 0.18, 0.15, 0.17, 0.01, 0.88],
  [-0.02, 0.235, 0.19, 0.24, 0.0, 0.9],
  [0.16, 0.24, 0.2, 0.25, 0.01, 0.9],
  [0.32, 0.2, 0.18, 0.21, 0.04, 0.86],
  [0.44, 0.16, 0.15, 0.155, 0.09, 0.8],
  [0.52, 0.145, 0.145, 0.13, 0.12, 0.72],
  [0.62, 0.145, 0.15, 0.12, 0.14, 0.66],
  [0.72, 0.135, 0.13, 0.11, 0.14, 0.62],
  [0.8, 0.095, 0.09, 0.075, 0.13, 0.6],
  [0.86, 0.045, 0.045, 0.04, 0.125, 0.55],
  [0.88, 0.02, 0.02, 0.02, 0.125, 0.55],
];
// What a folded wing lies on: the back, then over the base of the tail. [x, half width, half height, centre z]
const BACK = [
  [0.36, 0.21, 0.19, 0.04], [0.16, 0.245, 0.205, 0.01], [-0.02, 0.24, 0.195, 0.0], [-0.22, 0.19, 0.16, 0.01],
  [-0.4, 0.11, 0.1, 0.025], [-0.56, 0.07, 0.06, 0.015], [-0.76, 0.05, 0.035, 0.005],
];

export const BIRD_GEO = (() => {
  const P = [], INFO = [], UV = [], FOLD = [], FOLDN = [], I = [];
  const grid = (nu, nv, fn) => {
    const base = P.length / 3;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const v = fn(i / nu, j / nv);
      P.push(v.p[0], v.p[1], v.p[2]); INFO.push(...v.info); UV.push(...(v.uv || [i / nu, j / nv]));
      if (v.fold) { FOLD.push(...v.fold); FOLDN.push(...v.foldN); } else { FOLD.push(v.p[0], v.p[1], v.p[2]); FOLDN.push(NaN, 0, 0); }
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = base + i * (nv + 1) + j, b = a + nv + 1;
      I.push(a, b, a + 1, b, b + 1, a + 1);
    }
  };

  // Body and head: a ring at each x. The head weight fades in over the neck.
  grid(40, 20, (u, v) => {
    const x = -0.44 + u * 1.32, [w0, ht, hb, zc, tone] = curve(BODY, x), a = v * Math.PI * 2, s = Math.sin(a);
    const hw = w0 * (1.08 - 0.08 * smooth(0.4, 0.6, x));        // a little broader in the body than the head
    return { p: [x, hw * Math.cos(a), zc + (s > 0 ? ht : hb) * s], info: [0, 0, tone, smooth(0.4, 0.58, x)] };
  });
  // Bill: long, straight and sharp, a touch flattened, drooping slightly to the tip.
  grid(8, 10, (u, v) => {
    const x = 0.83 + u * 0.28, r = 0.046 * Math.pow(1 - u, 0.85) + 0.003, a = v * Math.PI * 2;
    return { p: [x, r * Math.cos(a), 0.118 - u * 0.02 + r * 0.82 * Math.sin(a)], info: [1, 0, 0.5, 1] };
  });
  // Eyes, set high on the sides of the head.
  for (const sd of [1, -1]) grid(5, 8, (u, v) => {
    const la = -Math.PI / 2 + u * Math.PI, lo = v * Math.PI * 2, r = 0.028;
    return { p: [0.71 + r * Math.cos(la) * Math.cos(lo), sd * 0.118 + r * Math.cos(la) * Math.sin(lo), 0.165 + r * Math.sin(la)], info: [2, 0, 0.15, 1] };
  });

  // Wings: pointed and triangular, as a starling's are in flight. The arm (inner 36%)
  // carries the secondaries, the hand the primaries; the trailing edge is cut into feathers.
  const { YS, ZS, SP, ARM } = WING;
  const le = (u) => (u <= ARM ? 0.3 + (u / ARM) * 0.06 : 0.36 - 0.7 * Math.pow((u - ARM) / (1 - ARM), 1.6));
  const te = (u) => (u <= ARM ? -0.24 + (u / ARM) * 0.04 : -0.2 - 0.14 * ((u - ARM) / (1 - ARM)));
  const feathers = (u) => {
    const n = u < ARM ? 8 : 10, f = (u < ARM ? u / ARM : (u - ARM) / (1 - ARM)) * n;
    return Math.pow(Math.abs(Math.sin(f * Math.PI)), 0.6) * (u < ARM ? 0.02 : 0.045) * (1 - Math.pow(u, 6));
  };
  for (const sd of [1, -1]) grid(44, 7, (u, v) => {
    const l = le(u), t = te(u) - feathers(u), x = l + (t - l) * v;
    const camber = 0.04 * Math.sin(Math.PI * Math.min(1, v * 1.15)) * (1 - 0.7 * u);
    const feat = Math.floor(u < ARM ? (u / ARM) * 8 : 8 + ((u - ARM) / (1 - ARM)) * 10);
    let tone = v < 0.38 ? 0.8 : feat % 2 ? 0.95 : 1.02;          // coverts darker; feathers alternate slightly
    if (u > 0.85) tone *= 0.85;
    // Folded: the wing lies along the back, the coverts at the front by the shoulder,
    // the flight feathers down the flank, the tips crossing over the base of the tail.
    const xf = 0.3 - u * 0.92 - v * 0.16 * (1 - u);
    const [hb, ht, zc] = curve(BACK, xf), hw = hb * 1.08, off = 0.022 + 0.014 * u;
    // Across the folded wing, from the spine (where the two meet) down the flank; as narrow as the wing is
    // there, so the folded wings taper to their tips over the tail.
    const cf = Math.pow(Math.min(1, Math.max(0, (le(u) - te(u)) / 0.56)), 0.8);
    const th = 0.05 + v * 1.3 * cf;
    const fy = sd * (hw + off) * Math.sin(th), fz = zc + (ht + off) * Math.cos(th);
    const ny = (sd * Math.sin(th)) / hw, nz = Math.cos(th) / ht, nl = Math.hypot(ny, nz);
    return { p: [x, sd * (YS + u * SP), ZS + camber], info: [3, Math.max(u, 0.002), tone, 0], uv: [u, v], fold: [xf, fy, fz], foldN: [0, ny / nl, nz / nl] };
  });

  // Tail: short and square, of overlapping feathers with notched tips. The shader fans it about its base.
  grid(8, 16, (u, v) => {
    const w = (v - 0.5) * 2, th = w * 0.21;
    const tip = 0.02 * Math.pow(Math.abs(Math.sin(v * 6 * Math.PI)), 0.7);
    const L = (0.6 - tip) / Math.cos(th), r = u * L;
    const f = Math.floor(v * 6);
    return { p: [-0.36 - r * Math.cos(th), r * Math.sin(th), 0.03 + 0.018 * (1 - Math.abs(w)) * (1 - u)], info: [4, 0, f % 2 ? 0.8 : 0.86, 0], uv: [u, v] };
  });

  // Legs: a shank and four toes on each side, as thin tubes. The shader places them
  // between the hip and the foot, so here they are only cross-sections.
  for (const sd of [1, -1]) for (let seg = 0; seg < 5; seg++) {
    const r = seg === 0 ? 0.03 : 0.02, sides = 4;
    grid(1, sides, (u, v) => {
      const a = v * Math.PI * 2;
      return { p: [r * Math.cos(a), r * Math.sin(a), u], info: [5, seg, 0.7, 0], uv: [sd, u] };
    });
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("aInfo", new THREE.Float32BufferAttribute(INFO, 4));
  g.setAttribute("aUV", new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  // Anything that does not fold keeps its own place and normal in the folded pose.
  const n = g.attributes.normal.array;
  for (let i = 0; i < FOLDN.length; i += 3) if (Number.isNaN(FOLDN[i])) { FOLDN[i] = n[i]; FOLDN[i + 1] = n[i + 1]; FOLDN[i + 2] = n[i + 2]; }
  g.setAttribute("aFold", new THREE.Float32BufferAttribute(FOLD, 3));
  g.setAttribute("aFoldN", new THREE.Float32BufferAttribute(FOLDN, 3));
  return g;
})();
