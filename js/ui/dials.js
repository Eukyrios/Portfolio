import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js";
import { FONT } from "../constants.js";
import { $ } from "../world.js";
import { sky, updateSky } from "../sky.js";

/* ---------- the two dials, modelled in 3D and drawn through a fine ASCII filter ---------- */
const DIAL_TILT = 0;                                        // face on, so the dials are perfectly round
const DIAL_ASCII = /* glsl */`
uniform sampler2D uScene; uniform sampler2D uGlyphs; uniform vec2 uRes; uniform vec2 uCell; uniform float uN;
varying vec2 vUv;
void main(){
  vec2 p = vUv * uRes, cell = floor(p / uCell), inCell = fract(p / uCell);
  vec4 c = vec4(0.0);
  for (int k = 0; k < 4; k++) {                             // four samples per character
    vec2 o = vec2((k == 1 || k == 3) ? 0.75 : 0.25, k >= 2 ? 0.75 : 0.25);
    c += texture2D(uScene, (cell + o) * uCell / uRes);
  }
  c /= 4.0;
  // The picture keeps its own detail; each character cell picks a glyph from its brightness,
  // and the glyph is etched into the picture: a fine ASCII grain over the model.
  vec4 px = texture2D(uScene, vUv);
  if (px.a < 0.04) { gl_FragColor = vec4(0.0); return; }
  vec3 cellCol = c.rgb / max(c.a, 0.001), col = px.rgb / max(px.a, 0.001);
  float lum = dot(cellCol, vec3(0.3, 0.55, 0.15));
  float g = floor(clamp(pow(lum, 0.8), 0.0, 0.999) * uN);  // brighter = denser glyph
  float ink = texture2D(uGlyphs, vec2((g + inCell.x) / uN, inCell.y)).r;
  col *= mix(0.9, 1.06, ink);
  gl_FragColor = vec4(col * px.a, px.a);
}`;
function dialGlyphs(w, h) {
  const ramp = " .:-=+*#%@", cnv = document.createElement("canvas");
  cnv.width = w * ramp.length; cnv.height = h;
  const ctx = cnv.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `700 ${Math.round(h * 0.95)}px ${FONT}`;
  [...ramp].forEach((g, i) => ctx.fillText(g, i * w + w / 2, h / 2 + h * 0.04));
  const t = new THREE.CanvasTexture(cnv); t.flipY = false; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return [t, ramp.length];
}
/** One dial: its own little renderer; the model renders to a texture, then the ASCII pass draws it. */
function makeDial3D(canvas, build) {
  const dpr = Math.min(devicePixelRatio || 1, 2), S = 100;
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true });
  r.setPixelRatio(dpr); r.setSize(S, S, false); r.setClearColor(0x000000, 0);
  const W = Math.round(S * dpr), rt = new THREE.WebGLRenderTarget(W, W, { samples: 4 });
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(11.42, 1, 1, 50);          // the face (radius 1) fills the canvas exactly
  cam.position.set(0, -Math.sin(DIAL_TILT) * 10, Math.cos(DIAL_TILT) * 10); cam.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-3, 4, 6); scene.add(sun);
  // No raised rim: the edge is a flat hairline drawn by the page (see .dial3d), like the rest of the UI.
  const extra = build(scene) || {};
  // The marker: a small triangle that slides round on the rim, pointing in.
  const hand = new THREE.Group(), red = new THREE.MeshBasicMaterial({ color: 0xff6a2a });   // flat, like the UI's accent
  const tri = new THREE.Shape(); tri.moveTo(0, -0.15); tri.lineTo(0.12, 0.05); tri.lineTo(-0.12, 0.05); tri.lineTo(0, -0.15);
  const mark = new THREE.Mesh(new THREE.ShapeGeometry(tri), red); mark.position.set(0, 0.95, 0.3);
  hand.add(mark); scene.add(hand);
  // The ASCII pass.
  const cw = Math.max(3, Math.round(2.4 * dpr)), chh = Math.max(4, Math.round(3.9 * dpr));   // very fine characters
  const [gt, n] = dialGlyphs(cw, chh);
  const mat = new THREE.ShaderMaterial({ vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }", fragmentShader: DIAL_ASCII, transparent: true,
    uniforms: { uScene: { value: rt.texture }, uGlyphs: { value: gt }, uRes: { value: new THREE.Vector2(W, W) }, uCell: { value: new THREE.Vector2(cw, chh) }, uN: { value: n } } });
  const post = new THREE.Scene(); post.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const flat = new THREE.Camera();
  return { hand, ...extra, draw() { r.setRenderTarget(rt); r.clear(); r.render(scene, cam); r.setRenderTarget(null); r.clear(); r.render(post, flat); } };
}
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
/** A dial face: a gently domed disc whose colour comes from a little shader (so it can blend softly), lit like the rest. */
function dialFace(colorGlsl) {
  const g = new THREE.CircleGeometry(1, 96), pos = g.attributes.position;
  return new THREE.Mesh(g, new THREE.ShaderMaterial({
    vertexShader: "varying vec2 vP; varying vec3 vN; void main(){ vP = position.xy; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `varying vec2 vP; varying vec3 vN;
      void main(){
        vec2 p = vP;
        ${colorGlsl}
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
}
const extrudeShape = (shape, depth, bevel = 0.015) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 24 });
const sector = (a0, a1, r = 1) => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.absarc(0, 0, r, a0, a1, false); sh.lineTo(0, 0); return sh; };
const metal0 = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });   // hairline marks
// The day dial: daytime sky over the horizon, night below; sun, cloud, moon, stars.
export const dayDial = makeDial3D($("sky").querySelector("canvas"), (scene) => {
  scene.add(dialFace(`
    // Day sky above, night below, with a warm, blurred horizon between them.
    float t = smoothstep(-0.45, 0.45, p.y);
    vec3 night = mix(vec3(0.07, 0.09, 0.2), vec3(0.15, 0.19, 0.38), smoothstep(-1.0, 0.0, p.y));
    vec3 day = mix(vec3(0.62, 0.8, 0.92), vec3(0.36, 0.64, 0.88), smoothstep(0.0, 1.0, p.y));
    vec3 c = mix(night, day, t);
    c = mix(c, vec3(0.98, 0.66, 0.42), exp(-p.y * p.y * 30.0) * 0.55);`));
  const sunM = std(0xffc94d, { emissive: 0xffa21a, emissiveIntensity: 0.6 });
  const sunB = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 16), sunM); sunB.position.set(0, 0.47, 0.24); scene.add(sunB);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, ray = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 8), sunM);
    ray.position.set(Math.sin(a) * 0.29, 0.47 + Math.cos(a) * 0.29, 0.2); ray.rotation.z = -a; scene.add(ray);
  }
  const cloud = new THREE.Group(), white = std(0xffffff, { roughness: 0.9 });
  [[-0.06, 0, 0.1], [0.06, 0.03, 0.08], [0.15, -0.01, 0.065], [-0.15, -0.01, 0.065]].forEach(([x, y, rr]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(rr, 14, 10), white); b.position.set(x, y, 0); b.scale.z = 0.6; cloud.add(b); });
  cloud.position.set(-0.55, 0.24, 0.16); scene.add(cloud);
  // The moon, lit from the side so it shows as a crescent.
  const moonMat = new THREE.ShaderMaterial({ vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "varying vec3 vN; void main(){ float l = smoothstep(0.0, 0.22, dot(vN, normalize(vec3(-0.85, 0.25, -0.75)))); gl_FragColor = vec4(mix(vec3(0.16, 0.2, 0.34), vec3(0.95, 0.96, 1.0), l), 1.0); }" });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 16), moonMat); moon.position.set(0, -0.47, 0.24); scene.add(moon);
  const starM = std(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.8 });
  [[-0.55, -0.3], [0.5, -0.66], [-0.25, -0.75], [0.62, -0.25], [-0.72, -0.55], [0.32, -0.22]].forEach(([x, y], i) => { const st = new THREE.Mesh(new THREE.OctahedronGeometry(i % 2 ? 0.035 : 0.05), starM); st.position.set(x, y, 0.16); scene.add(st); });
  // Hour marks on the rim.
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, mk = new THREE.Mesh(new THREE.PlaneGeometry(i % 6 ? 0.018 : 0.03, i % 6 ? 0.06 : 0.11), metal0);
    mk.position.set(Math.sin(a) * 0.93, Math.cos(a) * 0.93, 0.12); mk.rotation.z = -a; scene.add(mk);
  }
});
// The season dial: four quarters, each with its emblem.
// The season dial: a ring of the year round the rim (each season's colour flowing into the next)
// and, in the middle, the emblem of the season now. As one season turns into the next, its
// emblem shrinks away while the next one grows in.
export const SEASON_INNER = [[0.74, 0.87, 0.96], [0.2, 0.46, 0.5], [0.99, 0.88, 0.68], [0.24, 0.34, 0.55]];   // spring sky, summer pond, autumn light, winter dusk
export const seasonDial = makeDial3D($("season").querySelector("canvas"), (scene) => {
  const g = new THREE.CircleGeometry(1, 128), pos = g.attributes.position;
  const faceMat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: new THREE.Vector3(...SEASON_INNER[2]) }, uB: { value: new THREE.Vector3(...SEASON_INNER[3]) }, uK: { value: 0 } },
    vertexShader: "varying vec2 vP; varying vec3 vN; void main(){ vP = position.xy; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 uA; uniform vec3 uB; uniform float uK; varying vec2 vP; varying vec3 vN;
      vec3 ring(float a){
        vec3 C[4]; C[0] = vec3(0.97, 0.62, 0.76); C[1] = vec3(0.42, 0.78, 0.4); C[2] = vec3(0.95, 0.52, 0.18); C[3] = vec3(0.86, 0.93, 1.0);
        vec3 c = vec3(0.0); float ws = 0.0;
        for (int i = 0; i < 4; i++) { float d = a - (float(i) * 0.25 + 0.125); d -= floor(d + 0.5); float w = exp(-d * d * 110.0); c += C[i] * w; ws += w; }
        return c / ws;
      }
      void main(){
        vec2 p = vP; float r = length(p), a = atan(p.x, p.y) / 6.2831853;
        // At the turn of a season the next season's colour opens out from the middle.
        float R0 = uK * 0.76;
        vec3 cur = mix(uB, uA, smoothstep(R0 - 0.05, R0 + 0.05, r));
        vec3 inner = mix(cur * 1.12, cur * 0.78, smoothstep(0.0, 0.7, r));
        vec3 c = mix(inner, ring(a), smoothstep(0.69, 0.72, r));
        c *= 1.0 - 0.25 * exp(-pow((r - 0.705) / 0.01, 2.0));           // a hairline between the ring and the middle
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(g, faceMat));
  const Z = 0.16, emblems = [];
  // spring: a cherry blossom, white petals blushing pink, with a crown of stamens
  {
    const e = new THREE.Group(), petal = std(0xffe3ec, { roughness: 0.45 }), blush = std(0xf06f9c, { roughness: 0.5 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2, pt = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 14), petal); body.scale.set(0.78, 1.0, 0.28); body.position.y = 0.17; pt.add(body);
      for (const sg of [-1, 1]) { const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 10), petal); lobe.scale.set(1, 1, 0.3); lobe.position.set(sg * 0.055, 0.29, 0); pt.add(lobe); }
      const base = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10), blush); base.scale.set(1, 1.3, 0.3); base.position.set(0, 0.07, 0.02); pt.add(base);
      pt.rotation.z = -a; e.add(pt);
    }
    const ctr = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 10), std(0xd9407a)); ctr.position.z = 0.04; e.add(ctr);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, st = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), std(0xf7c948, { emissive: 0x7a5200, emissiveIntensity: 0.3 })); st.position.set(Math.sin(a) * 0.09, Math.cos(a) * 0.09, 0.07); e.add(st); }
    emblems.push(e);
  }
  // summer: a lily pad with a pink-tipped water lily
  {
    const e = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 48, 1, false, 0.3, Math.PI * 2 - 0.6).rotateX(Math.PI / 2), std(0x3f9a3a, { roughness: 0.5 }));
    pad.rotation.z = -0.6; e.add(pad);
    for (let i = 0; i < 7; i++) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.36, 0.01), std(0x2c7a2a)); const a = 0.9 + i * 0.75; v.position.set(Math.sin(a) * 0.18, Math.cos(a) * 0.18, 0.026); v.rotation.z = -a; e.add(v); }
    const lily = new THREE.Group(), w = std(0xfff6f8, { roughness: 0.45 }), tipM = std(0xf59ab8);
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 8; i++) {
      const a = ((i + ring * 0.5) / 8) * Math.PI * 2, pt = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 10), ring ? w : tipM);
      pt.scale.set(0.45, 1.0, 0.4); pt.position.set(Math.sin(a) * (0.11 - ring * 0.04), Math.cos(a) * (0.11 - ring * 0.04), 0.05 + ring * 0.05); pt.rotation.set(0.5 * Math.cos(a), -0.5 * Math.sin(a), -a); lily.add(pt);
    }
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), std(0xf6c94a)); c.position.z = 0.12; lily.add(c);
    lily.position.set(0.05, 0.03, 0.03); e.add(lily);
    emblems.push(e);
  }
  // autumn: a red maple leaf with veins and a stem
  {
    const e = new THREE.Group();
    const P = [[0, -10.5], [1.6, -6.6], [3.6, -7.6], [3.2, -3.4], [6.4, -5.4], [5.8, -3], [9.4, -3.4], [7.2, -0.6], [8.6, 0.6], [4, 2.4], [4.8, 4.8], [1, 3.8], [0.7, 8], [-0.7, 8], [-1, 3.8], [-4.8, 4.8], [-4, 2.4], [-8.6, 0.6], [-7.2, -0.6], [-9.4, -3.4], [-5.8, -3], [-6.4, -5.4], [-3.2, -3.4], [-3.6, -7.6], [-1.6, -6.6]];
    const k = 0.042, ms = new THREE.Shape(); P.forEach(([x, y], i) => (i ? ms.lineTo(x * k, -y * k) : ms.moveTo(x * k, -y * k)));
    e.add(new THREE.Mesh(extrudeShape(ms, 0.035, 0.012), std(0xd23a1c, { roughness: 0.5, emissive: 0x4a0800, emissiveIntensity: 0.4 })));
    const vein = std(0x8a1d0c);
    for (const [ang, len] of [[0, 0.4], [1.0, 0.33], [-1.0, 0.33], [2.1, 0.2], [-2.1, 0.2]]) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.018, len, 0.012), vein); v.position.set(Math.sin(ang) * len / 2, Math.cos(ang) * len / 2 - 0.02, 0.06); v.rotation.z = -ang; e.add(v); }
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.16, 0.02), std(0x7a3b12)); stem.position.set(0, -0.4, 0.04); e.add(stem);
    e.rotation.z = 0.2;
    emblems.push(e);
  }
  // winter: a six-armed snowflake, glinting
  {
    const e = new THREE.Group(), ice = std(0xf4f9ff, { roughness: 0.25, metalness: 0.15, emissive: 0x3a5a80, emissiveIntensity: 0.25 });
    for (let i = 0; i < 6; i++) {
      const arm = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.44, 0.04), ice); m.position.y = 0.22; arm.add(m);
      for (const [yy, ll] of [[0.3, 0.14], [0.17, 0.11]]) for (const sg of [1, -1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.038, ll, 0.035), ice); b.position.set(sg * ll * 0.36, yy + ll * 0.36, 0); b.rotation.z = -sg * 0.8; arm.add(b); }
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.04), ice); tip.position.y = 0.45; arm.add(tip);
      arm.rotation.z = (i / 6) * Math.PI * 2; e.add(arm);
    }
    e.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 6).rotateX(Math.PI / 2), ice));
    emblems.push(e);
  }
  emblems.forEach((e) => { e.position.z = Z; e.scale.setScalar(0.001); scene.add(e); });
  // Like a calendar clock: a tick at the start of every month on the ring, and longer ones at
  // the equinoxes and solstices, where the seasons turn.
  const tickM = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
  [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335].forEach((d) => {
    const a = (((d - 79) / 365) % 1 + 1) % 1 * Math.PI * 2, t = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.08), tickM);
    t.position.set(Math.sin(a) * 0.94, Math.cos(a) * 0.94, 0.03); t.rotation.z = -a; scene.add(t);
  });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2, t = new THREE.Mesh(new THREE.PlaneGeometry(0.026, 0.27), metal0);
    t.position.set(Math.sin(a) * 0.86, Math.cos(a) * 0.86, 0.04); t.rotation.z = -a; scene.add(t);
  }
  return { emblems, faceMat };
});

/** A dial: press or drag anywhere on it and the hand goes to that point (angle from the top,
 *  clockwise). Scrolling over it or the arrow keys (when it has focus) nudge it. While a hand is
 *  on it, and for a few seconds after, it stops turning on its own. */
function makeDial(el, fromAngle, nudge) {
  let dragging = false;
  const angleAt = (e) => {
    const r = el.querySelector("canvas").getBoundingClientRect();
    // The dial leans back, so its face is an ellipse on screen: undo that to read the angle.
    const a = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2)) / Math.cos(DIAL_TILT)) * 180 / Math.PI;
    return a;                                             // -180..180, 0 at the top, clockwise
  };
  const at = (e) => { fromAngle(angleAt(e)); sky.held = 1e9; updateSky(); };
  el.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("canvas")) return;
    dragging = true; el.setPointerCapture(e.pointerId); e.preventDefault(); at(e);
  });
  el.addEventListener("pointermove", (e) => { if (dragging) at(e); });
  const end = () => { if (dragging) { dragging = false; sky.held = 8; } };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end); el.addEventListener("lostpointercapture", end);
  el.addEventListener("wheel", (e) => { e.preventDefault(); nudge(Math.sign(e.deltaY)); sky.held = 8; updateSky(); }, { passive: false });
  el.addEventListener("keydown", (e) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (d) { nudge(d * 2); sky.held = 8; updateSky(); e.preventDefault(); e.stopPropagation(); }
  });
}
const wrapTo = (v, m) => ((v % m) + m) % m;
makeDial($("sky"), (a) => { sky.hour = wrapTo(12 + a / 15, 24); }, (d) => { sky.hour = wrapTo(sky.hour + d * 0.25, 24); });
makeDial($("season"), (a) => { sky.year = wrapTo(a / 360, 1); }, (d) => { sky.year = wrapTo(sky.year + d / 96, 1); });
