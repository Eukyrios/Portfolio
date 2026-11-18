import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js";
import { ATLAS, DRIFT, NR, PALETTE } from "./constants.js";
import { LIGHT } from "./shaders/common.js";
import { SOLID_FRAG, SOLID_VERT } from "./shaders/surface.js";
import { CELL_FRAG, QUAD_VERT } from "./shaders/cell.js";
import { PAGE_FRAG, SCREEN_FRAG } from "./shaders/screen.js";
import { padGeometry, petalGeometry } from "./geometry.js";

/* ---------------- setup ---------------- */
export const canvas = document.getElementById("pond");
export let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
} catch (e) {
  document.body.insertAdjacentHTML("beforeend", '<div class="nogl">This pond needs WebGL 2. Try a recent Chrome, Edge, Firefox or Safari.</div>');
  throw e;
}
renderer.setClearColor(0x000000, 0);
renderer.debug.onShaderError = (gl, program, vs, fs) => {
  const log = (gl.getShaderInfoLog(vs) || "") + (gl.getShaderInfoLog(fs) || "") + (gl.getProgramInfoLog(program) || "");
  console.error("Shader error:", log);
  window.pondFail?.("A shader failed to compile on this graphics card: " + log.trim().split("\n")[0]);
};
renderer.autoClear = false;

export const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const camera = new THREE.PerspectiveCamera(32, 1, 10, 10000);
export const surfaceScene = new THREE.Scene();   // pads, flowers, food, splashes: always drawn over the fish
export const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const nearest = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false };
export const shadeT = new THREE.WebGLRenderTarget(2, 2, { ...nearest, depthBuffer: true });
export const cellT = new THREE.WebGLRenderTarget(1, 1, { ...nearest, depthBuffer: false });
export const pageT = new THREE.WebGLRenderTarget(1, 1, { ...nearest, depthBuffer: false });

export const ripples = Array.from({ length: NR }, () => new THREE.Vector4(0, 0, -99, 0));   // world x, y, start, strength
export const ripplesU = Array.from({ length: NR }, () => new THREE.Vector4(0, 0, -99, 0));  // the same, on screen, for the shader

export const cellMat = new THREE.ShaderMaterial({
  vertexShader: QUAD_VERT, fragmentShader: CELL_FRAG, blending: THREE.NoBlending, depthTest: false, depthWrite: false,
  uniforms: {
    uShade: { value: shadeT.texture }, uGrid: { value: new THREE.Vector2() }, uCellCss: { value: new THREE.Vector2() },
    uTime: { value: 0 }, uRip: { value: ripplesU }, uMono: { value: 0 }, uIntro: { value: reduce ? 1e9 : 0 },
    uPal: { value: PALETTE.map((c) => new THREE.Vector3(...c)) }, uShadow: { value: new THREE.Vector2() },
    uDrift: { value: new THREE.Vector2(DRIFT.x, -DRIFT.y) },
    uText: { value: null }, uScroll: { value: new THREE.Vector2() }, uHoverTag: { value: -1 },
    uFlames: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 1, 0)) },
    uHeightMap: { value: null }, uGarden: { value: new THREE.Vector4(1e6, 0, 1, 1) }, uHalf: { value: new THREE.Vector2() },
    uZoom: { value: 1 }, uCam: { value: new THREE.Vector2() }, uAxis: { value: new THREE.Vector2() },
    uSpacing: { value: 39 }, uShadowRock: { value: new THREE.Vector2() }, uShadowBird: { value: new THREE.Vector2() }, uGlow: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 1, 0)) },
    uWx: { value: new THREE.Vector4() }, uWy: { value: new THREE.Vector4() }, uWz: { value: new THREE.Vector4() }, uCloudOff: { value: new THREE.Vector2() },
    uWm: { value: new THREE.Vector4(0, 1000, -99, 0) }, uBolt: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) },
    uWo: { value: new THREE.Vector4() }, uWo2: { value: new THREE.Vector2() }, uSky: { value: new THREE.Vector4(1, 1, 1, 0) },
    uSun: { value: new THREE.Vector4(1, 0, 0, 0) }, uMoon: { value: new THREE.Vector4() }, uLantern: { value: new THREE.Vector4(1e6, 0, 1e6, 0) }, uSeason: { value: new THREE.Vector4(0, 0, 1, 0) },
  },
});
export const screenMat = new THREE.ShaderMaterial({
  vertexShader: QUAD_VERT, fragmentShader: SCREEN_FRAG, blending: THREE.NoBlending, depthTest: false, depthWrite: false,
  uniforms: {
    uCells: { value: cellT.texture }, uPageT: { value: pageT.texture }, uText: cellMat.uniforms.uText, uAtlas: { value: null }, uCellDev: { value: new THREE.Vector2() },
    uGrid: { value: new THREE.Vector2() }, uHeight: { value: 0 }, uGlyphs: { value: ATLAS.length + 95 + 8 },
    uPage: { value: new THREE.Vector3(0.027, 0.078, 0.09) }, uPageShadow: { value: new THREE.Vector3(0.016, 0.05, 0.058) },
    uSand: { value: new THREE.Vector3(0.906, 0.867, 0.80) }, uSandShadow: { value: new THREE.Vector3(0.80, 0.75, 0.67) },
    uZoom: cellMat.uniforms.uZoom, uCam: { value: cellMat.uniforms.uCam.value }, uAxis: { value: cellMat.uniforms.uAxis.value },
    uCellCss: { value: cellMat.uniforms.uCellCss.value }, uGarden: { value: new THREE.Vector4(1e6, 0, 1, 1) },
    uTime: cellMat.uniforms.uTime, uWx: cellMat.uniforms.uWx, uWy: cellMat.uniforms.uWy, uWz: cellMat.uniforms.uWz, uCloudOff: cellMat.uniforms.uCloudOff,
    uWm: cellMat.uniforms.uWm, uBolt: cellMat.uniforms.uBolt, uWo: cellMat.uniforms.uWo, uWo2: cellMat.uniforms.uWo2,
    uSky: cellMat.uniforms.uSky, uSun: cellMat.uniforms.uSun, uMoon: cellMat.uniforms.uMoon, uLantern: cellMat.uniforms.uLantern, uSeason: cellMat.uniforms.uSeason,
  },
});
const quad = (mat) => { const s = new THREE.Scene(); const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); m.frustumCulled = false; s.add(m); return s; };
const pageMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: PAGE_FRAG, blending: THREE.NoBlending, depthTest: false, depthWrite: false, uniforms: screenMat.uniforms });
export const cellScene = quad(cellMat), pageScene = quad(pageMat), screenScene = quad(screenMat);

export const PAD_GEO = padGeometry();
export const PETAL_OUT = petalGeometry(8, 1, 0.5, 0), PETAL_IN = petalGeometry(7, 0.75, 0.95, 0.4);
export const STAMEN = new THREE.IcosahedronGeometry(0.22, 1);
export const BALL = new THREE.IcosahedronGeometry(1, 1);
export const solid = (cls, pad = 0, emit = 0) => new THREE.ShaderMaterial({
  vertexShader: SOLID_VERT, fragmentShader: SOLID_FRAG, side: THREE.DoubleSide,
  uniforms: { uLight: { value: LIGHT }, uClass: { value: cls }, uPad: { value: pad }, uEmit: { value: emit }, uTag: { value: 1 } },
});
export const PAD_MAT = solid(6, 1), PETAL_MAT = solid(8), STAMEN_MAT = solid(9), FOOD_MAT = solid(10), SPLASH_MAT = solid(16);
