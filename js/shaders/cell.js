import { ATLAS, G_BACK, G_BAR, G_DASH, G_SLASH, G_TICK, G_TILDE, L_DD, L_DU, L_HB, L_HM, L_HT, L_VL, L_VM, L_VR, NR, RAMP_TOP, WAVE_SPEED } from "../constants.js";
import { NOISE } from "./common.js";
import { WEATHER_FN, WEATHER_GLSL } from "./weather.js";

/* ---------------- cell pass ---------------- */
export const QUAD_VERT = /* glsl */`void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;
export const CELL_FRAG = /* glsl */`
uniform sampler2D uShade; uniform vec2 uGrid; uniform vec2 uCellCss; uniform float uTime;
uniform vec4 uRip[${NR}]; uniform vec3 uPal[32]; uniform float uMono; uniform float uIntro;
uniform vec2 uShadow; uniform vec2 uDrift;
uniform sampler2D uText; uniform vec4 uGlow[8]; uniform vec2 uScroll; uniform float uHoverTag;
uniform vec4 uFlames[8];   // screen x, y, radius, brightness of each candle flame
uniform sampler2D uHeightMap; uniform vec4 uGarden; uniform vec2 uHalf; uniform float uSpacing;
uniform float uZoom; uniform vec2 uCam; uniform vec2 uAxis;   // screen px per world px, camera centre (world), its screen point
uniform vec2 uShadowRock; uniform vec2 uShadowBird;
${WEATHER_GLSL}
${NOISE}
float hash2(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
${WEATHER_FN}
float shoreY(float wx){ return uGarden.x + 40.0*sin(wx*0.003) + 22.0*sin(wx*0.011 + 1.0); }
// The height map runs from the garden's north edge down to 80 px south of the shore line.
vec2 hUV(vec2 w){ return vec2((w.x - uGarden.y) / uGarden.z, (uGarden.x - 80.0 + uGarden.w - w.y) / uGarden.w); }
float hAt(vec2 w){ return texture2D(uHeightMap, hUV(w)).r; }
// The raking direction stored with the height: 0 = none, else 1..255 over 0..pi (screen orientation).
float flowAt(vec2 w){ ivec2 n = textureSize(uHeightMap, 0); return texelFetch(uHeightMap, ivec2(clamp(hUV(w), 0.0, 0.999) * vec2(n)), 0).g * 255.0; }
// Where along three samples (-1, 0, +1) a parabola through them turns; k > 0 is a furrow, k < 0 a crest.
float vertexAt(float a, float b, float c, out float k){ k = a - 2.0*b + c; return abs(k) > 0.003 ? (a - c) / (2.0*k) : 9.0; }
// Four samples per cell. Starlings (alpha ~0.55) are counted apart from solid things.
vec4 shadeAt(vec2 c, bool dryOnly, out float cover, out float bird, out float birdR, out float birdC){
  vec4 acc = vec4(0.0); vec4 best = vec4(0.0, 0.0, 2.0, 0.0); cover = 0.0; bird = 0.0; birdR = 0.5; birdC = 0.5;
  for (int k = 0; k < 4; k++) {
    vec2 o = vec2((k == 1 || k == 3) ? 0.75 : 0.25, k >= 2 ? 0.75 : 0.25);
    vec4 s = texture2D(uShade, (c + o) / uGrid);
    if (s.a > 0.5 && !(dryOnly && s.b > 0.004)) {          // dryOnly: skip anything below the surface
      if (s.a < 0.58) { bird += 0.25; birdR = s.r; birdC = s.g; }
      else { cover += 0.25; acc += s; if (s.b <= best.b) best = s; }
    }
  }
  if (cover > 0.0) { acc /= cover * 4.0; acc.g = best.g; }
  return acc;
}
// A starling's colour from its code (see BIRD_FRAG) and light.
vec3 birdColor(float c, float l){
  if (c < 0.15) return vec3(0.98, 0.78, 0.18) * (0.75 + 0.35*l);                 // bill
  if (c < 0.25) return vec3(0.05);                                              // eye
  if (c < 0.31) return vec3(0.95, 0.89, 0.72) * (0.8 + 0.25*l);                  // pale spots
  if (c < 0.34) return vec3(0.62, 0.5, 0.33) * (0.7 + 0.4*l);                     // buff feather edges
  if (c > 0.96) return mix(vec3(0.07, 0.065, 0.06), vec3(0.32, 0.28, 0.22), pow(l, 2.0) * 0.7);   // flight feathers: dull, buff-edged
  float t = (c - 0.35) / 0.65;
  vec3 sheen = mix(vec3(0.58, 0.3, 0.78), vec3(0.22, 0.66, 0.44), smoothstep(0.15, 0.6, t));
  return mix(vec3(0.07, 0.07, 0.09), sheen, pow(l, 1.4) * 0.9);                // glossy black, oil-slick where lit
}
float birdGlyph(float r){ return r > 0.66 ? ${ATLAS.length + 118 - 32}.0 : (r > 0.33 ? ${ATLAS.length + 45 - 32}.0 : ${ATLAS.length + 94 - 32}.0); }
float lineGlyph(vec2 g){
  vec2 t = vec2(-g.y, g.x);
  float a = atan(t.y, t.x); if (a < 0.0) a += 3.14159265;
  float o = floor(a / 0.785398 + 0.5);
  return (o == 0.0 || o == 4.0) ? ${G_DASH}.0 : (o == 1.0 ? ${G_BACK}.0 : (o == 2.0 ? ${G_BAR}.0 : ${G_SLASH}.0));
}
void main(){
  vec2 cBL = floor(gl_FragCoord.xy);
  vec2 cTL = vec2(cBL.x, uGrid.y - 1.0 - cBL.y);
  vec2 pos = (cTL + 0.5) * uCellCss;
  float wx = uCam.x + (pos.x - uAxis.x) / uZoom;        // world, y up
  float wy = uCam.y - (pos.y - uAxis.y) / uZoom;
  vec2 wp = vec2(wx, -wy);                              // world, in screen orientation
  vec2 wc = floor(wp * uZoom / uCellCss);               // a character cell, pinned to the world
  float side = wy - shoreY(wx);                          // < 0 water, > 0 land (the garden is north)
  bool land = side > -18.0;
  vec3 col = vec3(0.0); float glyph = 0.0; float shadow = 0.0; bool overBird = false;
  float hs = hash2(wc);
  bool boxed = texelFetch(uText, ivec2(cBL), 0).b > 0.5;   // inside the about box: no weather

  if (!land) {
    /* ---------- the pond ---------- */
    float H = 0.0; vec2 grad = vec2(0.0);
    for (int i = 0; i < ${NR}; i++) {
      vec4 r = uRip[i];
      float age = uTime - r.z;
      if (r.w <= 0.0 || age < 0.0 || age > 5.0) continue;
      vec2 d = (pos - r.xy) / uZoom; float dist = max(length(d), 0.001);
      float x = dist - ${WAVE_SPEED}.0*age;
      float w = 10.0 + age*16.0;
      float env = x > 0.0 ? exp(-(x*x)/(w*w)) : exp(x/(w*2.2));
      env *= r.w * exp(-age*0.9) / (1.0 + dist*0.004);
      float k = 0.12 / (1.0 + age*0.5);
      H += env * cos(k*x);
      grad += (d/dist) * (-env * k * sin(k*x));
    }
    float slope = length(grad) * 9.0;
    float lit = -dot(grad, vec2(-0.6, -0.8)) * 9.0;
    vec2 dc = grad * 70.0 * uZoom / uCellCss; dc.y = -dc.y;
    float glow = 0.0;
    for (int i = 0; i < 8; i++) {
      vec4 g = uGlow[i];
      if (g.w <= 0.0) continue;
      vec2 d = pos - g.xy;
      glow += g.w * exp(-dot(d, d) / (g.z*g.z));
    }
    vec3 warm = vec3(1.0, 0.72, 0.42);
    float cover, bird, bR, bC; vec4 s = shadeAt(cBL + dc, false, cover, bird, bR, bC);
    if (bird > 0.0 && cover < 0.75) {
      glyph = clamp(floor(bird * ${RAMP_TOP}.0 * (0.6 + 0.4 * bR) + 0.5), 2.0, ${RAMP_TOP}.0); overBird = true; col = birdColor(bC, bR);
    } else if (cover > 0.0) {
      float cls = floor(s.g*31.0 + 0.5);
      float light = s.r * mix(0.55, 1.0, cover);
      glyph = clamp(floor(pow(light, 0.85)*${RAMP_TOP}.0 + 0.5), 1.0, ${RAMP_TOP}.0);
      col = uPal[int(cls)] * (0.45 + 0.75*light);
      col = mix(col, vec3(0.05, 0.17, 0.19), s.b * 0.42);
      col += vec3(0.22) * max(lit - 0.45, 0.0);
      col = mix(col, col * vec3(1.3, 1.02, 0.75), clamp(glow, 0.0, 1.0) * 0.7);
      if (cls == 6.0) {
        col = mix(col, vec3(0.7, 0.58, 0.2) * (0.5 + 0.6 * light), uSeason.z * 0.5);   // pads yellow in autumn
        col = mix(col, vec3(0.92, 0.95, 1.0), uWy.w * smoothstep(0.35, 0.75, light) * 0.85);   // snow settles on the pads
      }
    } else {
      float sc, sb, sr, sbc; shadeAt(cBL + dc + uShadow, false, sc, sb, sr, sbc);
      shadow = sc;                                       // solid things only; the starlings cast none
      float v = fbm3(vec3((wp - uWo.xy)*0.0032, uTime*0.05));
      float f = fract(v*7.0);
      float line = 1.0 - smoothstep(0.0, 0.07, min(f, 1.0 - f));
      line *= 1.0 - uWx.w * 0.7;                          // rain breaks up the surface lines
      if (hs > 0.955) { glyph = hs > 0.985 ? 3.0 : 1.0; col = vec3(0.10, 0.22, 0.24); }
      if (line > 0.5 && slope < 0.2) { glyph = hash2(wc + 7.0) > 0.5 ? ${G_TILDE}.0 : ${G_DASH}.0; col = vec3(0.12, 0.34, 0.38) * (0.7 + 0.3*line); }
      float gl = noise3(vec3(wp*0.012, uTime*0.45));
      if (gl > 0.86 && hs > 0.7) { glyph = ${G_TICK}.0; col = vec3(0.6, 0.9, 0.92) * (gl - 0.6) * 2.5; }
      // The sand slopes on under the water: ripple marks on the bed, fading with depth.
      float shallow = smoothstep(-190.0, -18.0, side);
      if (shallow > 0.08) {
        float rp = fract((side + 6.0*sin(wx*0.021) + 4.0*sin(wx*0.057 + 1.0)) / 16.0);
        vec3 bedInk = mix(vec3(0.16, 0.30, 0.31), vec3(0.58, 0.55, 0.46), shallow);
        if (glyph == 0.0 || line > 0.5) {
          if (rp < 0.16 && hs > 0.12) { glyph = ${L_HM}.0; col = bedInk * (0.75 + 0.25*shallow); }
          else if (hs > 0.86) { glyph = ${ATLAS.length + 46 - 32}.0; col = bedInk; }
          else if (line > 0.5) glyph = 0.0;                // the surface lines thin out over the shallows
        }
      }
      // Foam lapping at the shore.
      if (side > -60.0) {
        float fo = sin(uTime*1.3 + side*0.16 + sin(wy*0.02)*2.0);
        if (fo > 0.55 && hs > 0.25) { glyph = ${G_TILDE}.0; col = vec3(0.72, 0.9, 0.92) * (0.35 + 0.65*clamp((side + 60.0)/42.0, 0.0, 1.0)); }
      }
      if (glow > 0.12 && glyph == 0.0 && hs > 0.4) glyph = (glow > 0.45 && hs > 0.8) ? 3.0 : 1.0;
      // Night: stars reflected in the still water, and the moon's glint.
      if (uSky.w > 0.05) {
        float tw = 0.6 + 0.4 * sin(uTime * (1.5 + hs * 3.0) + hs * 40.0);
        if (glyph == 0.0 && hash2(wc + 21.0) > 0.994 - uSky.w * 0.004) { glyph = hash2(wc + 22.0) > 0.85 ? 6.0 : 1.0; col = vec3(0.85, 0.9, 1.0) * tw * uSky.w / max(uSky.rgb, vec3(0.25)); }
        vec2 mo = (pos - uMoon.xy) / vec2(70.0, 26.0);
        float md = dot(mo, mo);
        if (uMoon.z > 0.0 && md < 1.0 && hash2(wc + floor(uTime * 3.0 + hs * 5.0)) > 0.35 + md * 0.5) {
          glyph = md < 0.25 ? ${G_DASH}.0 + 1.0 : ${G_DASH}.0; col = vec3(1.0, 0.97, 0.85) * uMoon.z * (1.1 - md) / max(uSky.rgb, vec3(0.25));
        }
      }
      // Twinkles of light around each flame, so a candle reads as a light from far off.
      for (int i = 0; i < 8; i++) {
        vec4 fl = uFlames[i];
        if (fl.w <= 0.0) continue;
        float d = length(pos - fl.xy) / fl.z;
        if (d < 1.0 && d > 0.18) {
          float tw = hash2(wc + floor(uTime * 5.0 + hs * 7.0));
          if (tw > 0.55 + d * 0.35) { glyph = tw > 0.9 ? 7.0 : (tw > 0.75 ? 6.0 : ${ATLAS.length + 39 - 32}.0); col = vec3(1.0, 0.86, 0.45) * (1.1 - d) * fl.w; }
        }
      }
      // Wind: gusts darken the water in patches (cat's paws) racing downwind.
      if (uWx.z > 0.12) {
        vec2 wv = vec2(uWx.x, -uWx.y);
        float paw = noise3(vec3((wp - uWo.zw) * 0.006, uTime * 0.25));
        if (paw > 0.74 - uWx.z * 0.26 && hash2(wc + floor(uTime * 4.0 + hs * 3.0)) > 0.35) {
          glyph = hs > 0.55 ? ${G_TILDE}.0 : ${ATLAS.length + 44 - 32}.0; col = vec3(0.36, 0.6, 0.66) * (0.75 + paw * 0.45);
        }
      }
      // Petals in spring, leaves in autumn, floating and carried on the drift.
      if (leafAmt() > 0.02) {
        vec2 q = (wp - uWo.xy * 1.6) / 46.0, id = floor(q), lc = fract(q) - 0.5;
        float hh = hash2(id + 71.0);
        if (hh < leafAmt() * 0.32 && length(lc - (vec2(hash2(id + 72.0), hash2(id + 73.0)) - 0.5) * 0.6) * 46.0 * uZoom < uCellCss.x * 0.75) {
          glyph = hash2(id + 74.0) > 0.5 ? 7.0 : ${ATLAS.length + 44 - 32}.0; col = leafColor(hash2(id + 75.0)) * 0.85;
        }
      }
      // Rain: every drop leaves a dimple that opens into a ring.
      if (uWx.w > 0.02) {
        float ti = uTime * 2.3 + hs * 17.0, ph = fract(ti);
        if (hash2(wc + floor(ti) * 1.37) < uWx.w * 0.04) {
          glyph = ph < 0.3 ? 1.0 : (ph < 0.65 ? ${ATLAS.indexOf("o")}.0 : ${ATLAS.indexOf("O")}.0);
          col = vec3(0.62, 0.84, 0.88) * (1.05 - ph * 0.6);
        }
      }
      if (slope > 0.18) {
        glyph = lineGlyph(grad);
        if (lit > 0.0) col = mix(vec3(0.22, 0.5, 0.55), vec3(0.85, 1.0, 1.0), clamp(lit, 0.0, 1.0));
        else { col = vec3(0.10, 0.27, 0.31) * clamp(1.0 + lit*0.4, 0.4, 1.0); if (slope < 0.4) glyph = 1.0; }
      }
      if (glyph > 0.0) col = mix(col, warm * (0.3 + 0.55*glow), clamp(glow*1.1, 0.0, 0.85));
      col *= 1.0 - shadow*0.5;
      // Outline round the floating projects.
      float tagN = 0.0, sideN = 0.0, vert = 0.0;
      for (int k = 0; k < 8; k++) {
        vec2 o = k == 0 ? vec2(1, 0) : k == 1 ? vec2(-1, 0) : k == 2 ? vec2(0, 1) : k == 3 ? vec2(0, -1)
               : k == 4 ? vec2(1, 1) : k == 5 ? vec2(-1, 1) : k == 6 ? vec2(1, -1) : vec2(-1, -1);
        float a = texture2D(uShade, (cBL + dc + o + 0.5) / uGrid).a;
        if (a > 0.58 && a < 0.95) { tagN = a; if (k < 2) sideN = 1.0; else if (k < 4) vert = 1.0; }
      }
      if (tagN > 0.0) {
        bool hot = abs(tagN - uHoverTag) < 0.01;
        glyph = (sideN > 0.5 && vert > 0.5) || (sideN < 0.5 && vert < 0.5) ? 6.0 : (sideN > 0.5 ? ${G_BAR}.0 : ${G_DASH}.0);
        col = hot ? vec3(1.0, 0.47, 0.2) * (0.8 + 0.2*sin(uTime*6.0 + (cTL.x + cTL.y)*0.6)) : vec3(0.55, 0.78, 0.8) * 0.7;
        shadow = 0.0;
      }
    }
    // Ice creeps out from the shore while it snows; fish still show through it.
    float iw = iceWidth(wx);
    if (iceAt(vec2(wx, wy), side) && cover < 0.25 && bird < 0.25) {
      float edge = smoothstep(-18.0 - iw, -18.0 - iw + 14.0, side);
      // Mostly smooth ice: faint streaks, a few long cracks.
      float crack = noise3(vec3(vec2(wx, wy) * 0.012, 1.0)), cr = abs(fract(crack * 6.0) - 0.5);
      glyph = cr < 0.035 ? (hash2(wc + 3.0) > 0.5 ? ${G_SLASH}.0 : ${G_BACK}.0) : (hs > 0.9 ? ${G_DASH}.0 : (hs > 0.84 ? 1.0 : 0.0));
      col = mix(vec3(0.62, 0.8, 0.86), vec3(0.85, 0.94, 0.97), edge * hash2(wc + 1.3));
      if (edge < 1.0 && hs > 0.35) { glyph = ${G_TILDE}.0; col = vec3(0.75, 0.9, 0.95); }   // the thin new edge
      // Breaking up: dark lines of open water open between the floes.
      float fl = noise3(vec3(vec2(wx, wy) * 0.022, 0.0)) * 0.85 + 0.15;
      if (uWm.x > 0.02 && fl - uWm.x < 0.06) { glyph = ${G_TILDE}.0; col = vec3(0.35, 0.55, 0.6); }
    }
  } else {
    /* ---------- the garden ---------- */
    float cover, bird, bR, bC; vec4 s = shadeAt(cBL, true, cover, bird, bR, bC);
    vec3 lo = vec3(0.50, 0.43, 0.34), mid = vec3(0.70, 0.64, 0.55);
    if (bird > 0.0 && cover < 0.75) {
      glyph = clamp(floor(bird * ${RAMP_TOP}.0 * (0.6 + 0.4 * bR) + 0.5), 2.0, ${RAMP_TOP}.0); overBird = true; col = birdColor(bC, bR);
    } else if (cover > 0.0) {
      float cls = floor(s.g*31.0 + 0.5);
      float light = s.r * mix(0.6, 1.0, cover);
      bool stone = cls == 24.0 || cls == 29.0 || cls == 31.0;
      float dens = stone ? 0.68 + (1.0 - light)*0.32 : 1.0 - light*0.55;
      glyph = clamp(floor(dens*10.0 + 0.5), 2.0, 10.0);        // darker = denser on light sand
      col = uPal[int(cls)] * (0.6 + 0.5*light);
      if (cls == 30.0) { glyph = 10.0; col = uPal[30] * (1.0 + uSky.w * 1.6) / max(uSky.rgb, vec3(0.3)); }   // the lantern's light
      if (cls == 25.0 || cls == 26.0) {                                            // moss through the year
        col = mix(col, vec3(0.62, 0.55, 0.22) * (0.6 + 0.5 * light), uSeason.z * 0.65);
        col = mix(col, vec3(0.45, 0.45, 0.36) * (0.6 + 0.5 * light), uSeason.w * 0.55);
        col *= 1.0 + uSeason.x * 0.15;
      }
      col *= 1.0 - 0.22 * uWy.z;                                                   // wet stone is darker
      float cap = uWy.w * smoothstep(0.4, 0.8, light);                             // snow on the tops of stones and moss
      if (cap > 0.0 && cls != 30.0) { col = mix(col, vec3(0.95, 0.97, 1.0), cap); glyph = max(2.0, floor(mix(glyph, 2.0, cap) + 0.5)); }
    } else {
      if (side > 24.0) {
        // Sand. Each furrow and crest is found inside the cell (a parabola through
        // three height samples across it) and drawn as a thin line at that spot,
        // so ridges stay continuous and smooth; the slopes between get grain.
        vec2 W0 = vec2(wx, wy);
        float n2 = hash2(wc * 1.7 + 3.1);
        // Zoomed out, the ridges get finer than a row of characters and would turn
        // to moire. Then the sand shows the flow of the raking as a light hatch.
        float rows = uSpacing * uZoom / uCellCss.y;
        if (rows < 1.25 + 0.45 * hash2(wc + 5.0)) {
          float oc = flowAt(W0);
          if (oc > 0.5) {
            float q = floor(((oc - 1.0) / 254.0 * 3.14159265) / 0.785398 + 0.5);
            float lg = (q == 0.0 || q == 4.0) ? ${L_HM}.0 : (q == 1.0 ? ${L_DD}.0 : (q == 2.0 ? ${L_VM}.0 : ${L_DU}.0));
            if (n2 < 0.42) { glyph = lg; col = mix(mid, lo, 0.3 + 0.3 * hash2(wc + 2.0)); }
            else if (n2 > 0.93) { glyph = ${ATLAS.length + 46 - 32}.0; col = mid; }
          }
        } else {
        float cw = uCellCss.x / uZoom, chh = uCellCss.y / uZoom;   // a cell, in world px
        float hx = (hAt(W0 + vec2(cw*0.5, 0.0)) - hAt(W0 - vec2(cw*0.5, 0.0))) / cw;
        float hy = (hAt(W0 - vec2(0.0, chh*0.5)) - hAt(W0 + vec2(0.0, chh*0.5))) / chh;     // screen y, down
        vec2 g = vec2(hx, hy) * uSpacing / 3.14159;
        float lit = -dot(g, normalize(vec2(-0.6, -0.8))), dark = -lit;
        float h0 = hAt(W0), k, t, lineG = 0.0;
        if (abs(g.y) > abs(g.x) * 1.6) {                     // ridges run across: sample down the cell
          t = vertexAt(hAt(W0 + vec2(0.0, chh/3.0)), h0, hAt(W0 - vec2(0.0, chh/3.0)), k);
          if (abs(t) <= 1.5) lineG = t < -0.5 ? ${L_HT}.0 : (t > 0.5 ? ${L_HB}.0 : ${L_HM}.0);
        } else if (abs(g.x) > abs(g.y) * 1.6) {              // ridges run up and down: sample across
          t = vertexAt(hAt(W0 - vec2(cw/3.0, 0.0)), h0, hAt(W0 + vec2(cw/3.0, 0.0)), k);
          if (abs(t) <= 1.5) lineG = t < -0.5 ? ${L_VL}.0 : (t > 0.5 ? ${L_VR}.0 : ${L_VM}.0);
        } else {                                             // diagonal ridges
          vec2 gd = normalize(g + 1e-6);
          vec2 off = vec2(gd.x * cw, -gd.y * chh) / 3.0;
          t = vertexAt(hAt(W0 - off), h0, hAt(W0 + off), k);
          if (abs(t) <= 0.9) lineG = g.x * g.y > 0.0 ? ${L_DU}.0 : ${L_DD}.0;
        }
        if (lineG > 0.0 && k > 0.0) { glyph = lineG; col = mix(mix(mid, lo, 0.65), vec3(0.36, 0.5, 0.6), clamp((uWy.z - 0.45) * 1.8, 0.0, 1.0) * 0.85); }   // furrow (fills with rain)
        else if (lineG > 0.0) { glyph = lineG; col = vec3(1.0, 0.985, 0.95); }                  // crest in the light
        else if (dark > 0.15 && n2 < 0.12 + dark*0.35) { glyph = n2 < 0.08 ? ${ATLAS.length + 58 - 32}.0 : ${ATLAS.length + 46 - 32}.0; col = mix(mid, lo, dark*0.6); }
        else if (n2 > 0.94) { glyph = ${ATLAS.length + 46 - 32}.0; col = mid; }
        }
        // Contact shading where the sand meets a stone.
        float ao = 0.0;
        for (int q = 0; q < 4; q++) {
          vec2 o = q == 0 ? vec2(1, 0) : q == 1 ? vec2(-1, 0) : q == 2 ? vec2(0, 1) : vec2(0, -1);
          vec4 sq = texture2D(uShade, (cBL + o + 0.5) / uGrid);
          float c = floor(sq.g*31.0 + 0.5);
          if (sq.a > 0.95 && (c == 24.0 || c == 29.0)) ao = 1.0;
        }
        if (ao > 0.0) { glyph = n2 > 0.5 ? ${ATLAS.length + 58 - 32}.0 : ${ATLAS.length + 59 - 32}.0; col = lo * 0.8; }
        // Weather on the sand.
        float wt = wetAt(W0), pd = puddleAt(W0), snw = snowAt(W0);
        col *= 1.0 - 0.32 * wt;                                                    // rain darkens it, in patches
        if (pd > 0.5 && snw < 0.5) {
          // A puddle: still water, sky in it, rings when it rains, a dark wet rim.
          float rim = 1.0 - smoothstep(0.5, 0.9, pd);
          glyph = rim > 0.5 ? ${ATLAS.length + 44 - 32}.0 : (hash2(wc + floor(uTime * 0.6)) > 0.93 ? ${G_TILDE}.0 : 0.0);
          col = rim > 0.5 ? lo * 0.55 : vec3(0.62, 0.7, 0.76);
          if (uWx.w > 0.02) {
            float ti = uTime * 2.6 + hs * 13.0, ph = fract(ti);
            if (hash2(wc + floor(ti) * 1.9) < uWx.w * 0.12) { glyph = ph < 0.3 ? 1.0 : (ph < 0.65 ? ${ATLAS.indexOf("o")}.0 : ${ATLAS.indexOf("O")}.0); col = vec3(0.8, 0.88, 0.92) * (1.05 - ph * 0.5); }
          }
        }
        if (uWy.w > 0.01) {
          // Snow settles evenly: first a dusting of flakes all over the sand, then a white
          // cover in which the raked lines show as soft blue shadows. Melting runs backwards.
          float lay = smoothstep(0.35, 0.8, snw);
          bool isLine = glyph >= ${ATLAS.length + 95}.0;
          if (!isLine && hash2(wc + 9.1) < lay) glyph = 0.0;
          col = mix(col, vec3(0.6, 0.68, 0.8), lay * 0.85);
          if (hash2(wc + 12.7) < min(uWy.w * 1.8, 0.75) * (1.0 - lay)) { glyph = hash2(wc + 3.3) > 0.85 ? 7.0 : 1.0; col = vec3(0.98, 0.99, 1.0); }
          if (lay > 0.5 && glyph == 0.0 && hash2(wc + floor(uTime * 0.7 + hs * 5.0)) > 0.988) { glyph = 1.0; col = vec3(0.7, 0.82, 1.0); }   // sparkle
        }
        if (uWx.z > 0.35) {
          // Wind lifts streams of sand (or snow) and drives them downwind.
          vec2 wv = vec2(uWx.x, -uWx.y);
          vec2 wn = normalize(wv + 1e-5), wq = vec2(dot(wp, wn), dot(wp, vec2(-wn.y, wn.x)));
          float st = noise3(vec3((wq.x - uWo2.x) * 0.004, wq.y * 0.035, uTime * 0.5));
          if (st > 0.72 - (uWx.z - 0.35) * 0.4 && hash2(wc + floor(uTime * 7.0)) > 0.35) {
            glyph = hash2(wc + 2.2) > 0.5 ? ${G_DASH}.0 : ${G_TILDE}.0; col = snw > 0.4 ? vec3(0.75, 0.82, 0.92) : mix(mid, lo, 0.35);
          }
        }
        if (leafAmt() > 0.02 && snw < 0.5) {
          // Fallen leaves and petals lie about the sand, nudged along by the wind.
          vec2 wn2 = normalize(vec2(uWx.x, -uWx.y) + 1e-5);
          vec2 q = (wp - wn2 * uWo2.x * 0.12 * uWx.z) / 38.0, id = floor(q), lc = fract(q) - 0.5;
          if (hash2(id + 81.0) < leafAmt() * 0.28 && length(lc - (vec2(hash2(id + 82.0), hash2(id + 83.0)) - 0.5) * 0.6) * 38.0 * uZoom < uCellCss.x * 0.7) {
            glyph = hash2(id + 84.0) > 0.4 ? 7.0 : ${ATLAS.length + 44 - 32}.0; col = leafColor(hash2(id + 85.0)) * 0.8;
          }
        }
        if (uWx.w > 0.02 && snw < 0.5 && pd < 0.5) {
          float ti = uTime * 1.6 + hs * 11.0;                                      // raindrops pit the sand
          if (hash2(wc + floor(ti) * 2.1) < uWx.w * 0.05 && fract(ti) < 0.7) { glyph = fract(ti) < 0.25 ? ${ATLAS.length + 44 - 32}.0 : 1.0; col = lo * 0.7; }
        }
      } else {                                                // the wet, packed sand at the water's edge
        float n2 = hash2(wc * 1.7 + 3.1);
        if (n2 > 0.55) { glyph = n2 > 0.85 ? ${ATLAS.length + 44 - 32}.0 : ${ATLAS.length + 46 - 32}.0; col = mix(mid, lo, 0.5); }
      }
      float sc, sb, sr, sbc; shadeAt(cBL + uShadowRock, true, sc, sb, sr, sbc);
      shadow = sc;
      col *= 1.0 - shadow*0.3;
    }
  }
  if (uIntro < 1700.0 && glyph > 0.0) {
    float at = (cTL.x / uGrid.x) * 1000.0 + hash2(vec2(cTL.x, 3.0)) * 250.0 + hash2(cTL + 9.0) * 350.0;
    if (uIntro < at) glyph = 1.0 + floor(hash2(cTL + floor(uIntro/60.0)) * 10.0);
  }
  /* ---------- weather over everything ---------- */
  if (boxed && !overBird) glyph = 0.0;
  if (!boxed) {
    vec2 cc = cTL;                                         // cells, y down
    // Rain: streaks on a moving lattice, slanted by the wind; two depths.
    if (uWx.w > 0.01) {
      float slant = clamp(uWx.x * uWx.z * 0.9, -0.9, 0.9);
      for (int L = 0; L < 2; L++) {
        float fl = float(L);
        vec2 sz = vec2(3.0 + fl, 11.0 + fl * 5.0);
        float sp = 30.0 + fl * 12.0;
        vec2 q = vec2(cc.x - slant * cc.y, cc.y - uTime * sp);
        vec2 id = floor(q / sz), lc = q - id * sz;
        if (hash2(id + 9.1 + fl * 17.0) < uWx.w * 0.55) {
          float dx = lc.x - floor(hash2(id + fl * 17.0) * sz.x), dy = lc.y - floor(hash2(id + 3.7 + fl * 17.0) * (sz.y - 3.0));
          if (abs(dx) < 0.5 && dy >= 0.0 && dy < 2.0 + fl) {
            glyph = abs(slant) < 0.25 ? ${G_BAR}.0 : (slant > 0.0 ? ${G_BACK}.0 : ${G_SLASH}.0);
            col = (land ? vec3(0.4, 0.45, 0.55) : vec3(0.6, 0.78, 0.86)) * (0.65 + 0.25 * fl);
          }
        }
      }
    }
    // Wind: thin streaks racing across, the way wind is drawn.
    if (uWx.z > 0.3) {
      vec2 wd = normalize(vec2(uWx.x, -uWx.y) + 1e-5);
      vec2 q = vec2(dot(cc, wd), dot(cc, vec2(-wd.y, wd.x)) * 1.6) - vec2(uWo2.y, 0.0);
      vec2 sz = vec2(26.0, 5.0), id = floor(q / sz), lc = q - id * sz;
      if (hash2(id + 31.0) < (uWx.z - 0.25) * 0.85) {
        float x0 = floor(hash2(id + 32.0) * 14.0), y0 = floor(hash2(id + 33.0) * 4.0), len = 4.0 + floor(hash2(id + 34.0) * 6.0);
        if (abs(lc.y - y0 - 0.5) < 0.5 && lc.x > x0 && lc.x < x0 + len) {
          glyph = abs(wd.y) < 0.38 ? (hash2(vec2(floor(lc.x), id.x)) > 0.7 ? ${G_TILDE}.0 : ${G_DASH}.0) : (wd.x * wd.y > 0.0 ? ${G_BACK}.0 : ${G_SLASH}.0);
          col = land ? vec3(0.5, 0.47, 0.43) : vec3(0.62, 0.8, 0.85);
        }
      }
    }
    // Snow: flakes drifting down and sideways, wobbling.
    if (uWy.x > 0.01) {
      for (int L = 0; L < 2; L++) {
        float fl = float(L);
        vec2 sz = vec2(6.0 + fl * 3.0, 4.0 + fl * 2.0);
        vec2 vel = vec2(uWx.x * uWx.z * (5.0 + fl * 3.0), 2.6 + fl * 1.8);
        vec2 q = cc - vel * uTime;
        vec2 id = floor(q / sz), lc = q - id * sz;
        if (hash2(id + 5.3 + fl * 9.0) < uWy.x * 0.75) {
          vec2 p0 = vec2(hash2(id + fl * 9.0), hash2(id + 2.9 + fl * 9.0)) * (sz - 1.0);
          p0.x += sin(uTime * (1.1 + fl * 0.5) + hash2(id + 7.7) * 6.28) * 1.2;
          if (length(lc - p0 - 0.5) < 0.62) {
            glyph = fl > 0.5 ? 7.0 : 1.0;
            col = land ? vec3(0.5, 0.58, 0.72) : vec3(0.92, 0.96, 1.0) * (0.8 + 0.2 * fl);
          }
        }
      }
    }
    // The lightning bolt: a jagged, forking line of light, there for a moment and flickering.
    float bt = uTime - uWm.z;
    if (bt >= 0.0 && bt < 0.4 && (bt < 0.09 || (bt > 0.15 && bt < 0.32))) {
      vec2 bd; float d = boltAt(vec2(wx, wy), bd) * uZoom;   // screen px
      if (d < uCellCss.x * 0.55) { glyph = lineGlyph(vec2(-bd.y, bd.x)); col = vec3(0.95, 0.97, 1.0) * 1.2; }
      else if (d < uCellCss.x * 2.4 && hash2(wc + floor(uTime * 30.0)) > 0.55) { glyph = 1.0; col = vec3(0.7, 0.8, 1.0); }
    }
    // Falling petals (spring) and leaves (autumn), tumbling down and blown by the wind.
    if (leafAmt() > 0.02) {
      vec2 sz = vec2(9.0, 7.0), vel = vec2(uWx.x * uWx.z * 7.0 + 0.6, 1.6);
      vec2 q = cc - vel * uTime, id = floor(q / sz), lc = q - id * sz;
      if (hash2(id + 91.0) < leafAmt() * 0.45) {
        vec2 p0 = vec2(hash2(id + 92.0), hash2(id + 93.0)) * (sz - 1.0);
        p0.x += sin(uTime * 1.7 + hash2(id + 94.0) * 6.28) * 1.6;
        if (length(lc - p0 - 0.5) < 0.62) {
          float tumble = fract(uTime * 1.5 + hash2(id + 95.0));
          glyph = tumble < 0.33 ? 7.0 : (tumble < 0.66 ? ${ATLAS.length + 44 - 32}.0 : ${ATLAS.length + 39 - 32}.0);
          col = leafColor(hash2(id + 96.0));
        }
      }
    }
    // Cloud shadows, storm gloom, fog and lightning.
    vec2 W1 = vec2(wx, wy);
    col *= (1.0 - 0.3 * cloudShade(W1)) * (1.0 - 0.38 * uWz.z);
    float fo = fogAt(W1);
    if (fo > 0.0) {
      col = mix(col, land ? vec3(0.86, 0.85, 0.82) : vec3(0.4, 0.48, 0.51), fo * 0.72);
      if (hash2(wc + 4.2) < fo * 0.6) glyph = 0.0;
    }
    col = mix(col, vec3(1.0), uWz.x * 0.5);
  }
  /* ---------- time of day ---------- */
  if (!boxed || overBird) {
    vec2 W2 = vec2(wx, wy);
    // The lanterns' warm light at night.
    float lg = lanternGlow(W2);
    if (lg > 0.01) col = mix(col, col * vec3(1.6, 1.2, 0.7) + vec3(0.25, 0.15, 0.02), clamp(lg, 0.0, 1.0) * 0.8);
    col = seasonGrade(col) * uSky.rgb;
    // Fireflies over the garden and the shore, drifting and blinking.
    if (uSky.w > 0.25 && side > -160.0 && !boxed && uSeason.w < 0.6) {
      vec2 sz = vec2(90.0), q = W2 + vec2(sin(uTime * 0.13) * 40.0, cos(uTime * 0.11) * 30.0);
      vec2 id = floor(q / sz), lc = q - id * sz;
      if (hash2(id + 61.0) < 0.35 * uSky.w * (0.3 + uSeason.y * 1.3 + uSeason.x * 0.4) * (1.0 - uSeason.w)) {
        vec2 fp = (vec2(hash2(id + 62.0), hash2(id + 63.0)) * 0.6 + 0.2) * sz + vec2(sin(uTime * 0.7 + hash2(id) * 9.0), cos(uTime * 0.9 + hash2(id + 1.0) * 9.0)) * 14.0;
        float blink = pow(max(0.0, sin(uTime * 1.3 + hash2(id + 64.0) * 30.0)), 6.0);
        if (blink > 0.05 && length(lc - fp) * uZoom < uCellCss.x * 0.7) { glyph = blink > 0.6 ? 7.0 : 1.0; col = vec3(0.85, 1.0, 0.45) * (0.4 + blink); }
      }
    }
  }
  vec4 tx = texelFetch(uText, ivec2(cBL), 0);           // project titles written into the grid
  float tgl = floor(tx.r*255.0 + 0.5);
  if (tgl > 0.5 && !overBird) {            // birds fly over the writing
    float st = floor(tx.g*255.0 + 0.5);
    glyph = tgl; shadow = 0.0;
    col = land ? (st > 2.5 ? vec3(0.75, 0.28, 0.1) : (st > 1.5 ? vec3(0.48, 0.42, 0.35) : vec3(0.22, 0.19, 0.15)))
               : (st > 2.5 ? vec3(1.0, 0.46, 0.2) : (st > 1.5 ? vec3(0.45, 0.64, 0.66) : vec3(0.84, 0.93, 0.93)));
  }
  if (uMono > 0.5) { float l = dot(col, vec3(0.3, 0.55, 0.15)); col = vec3(min(l*1.3, 1.0)); }
  gl_FragColor = vec4(col, (glyph + (shadow >= 0.5 ? 128.0 : 0.0)) / 255.0);
}`;
