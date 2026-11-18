import { NOISE } from "./common.js";
import { WEATHER_FN, WEATHER_GLSL } from "./weather.js";

/* ---------------- screen pass ---------------- */
/* The paper under each character cell (water, sand, weather), worked out once per cell. */
export const PAGE_FRAG = /* glsl */`
uniform sampler2D uCells; uniform sampler2D uAtlas; uniform vec2 uCellDev; uniform vec2 uGrid;
uniform float uHeight; uniform float uGlyphs; uniform vec3 uPage; uniform vec3 uPageShadow; uniform sampler2D uText;
uniform vec3 uSand; uniform vec3 uSandShadow; uniform vec2 uCellCss; uniform vec4 uGarden; uniform float uZoom; uniform vec2 uCam; uniform vec2 uAxis;
uniform float uTime;
${WEATHER_GLSL}
${NOISE}
float shoreY(float wx){ return uGarden.x + 40.0*sin(wx*0.003) + 22.0*sin(wx*0.011 + 1.0); }
${WEATHER_FN}
void main(){
  vec2 cBL = floor(gl_FragCoord.xy);
  vec4 c = texelFetch(uCells, ivec2(cBL), 0);
  float v = floor(c.a*255.0 + 0.5);
  float sh = v >= 128.0 ? 0.85 * uSun.x : 0.0;          // shadows fade at night and lengthen at dusk
  vec2 cell = vec2(cBL.x, uGrid.y - 1.0 - cBL.y);
  vec2 cp = (cell + 0.5) * uCellCss;                    // same cell centre the cell pass used
  float wx = uCam.x + (cp.x - uAxis.x) / uZoom, wy = uCam.y - (cp.y - uAxis.y) / uZoom;
  float side = wy - shoreY(wx);
  bool land = side > -18.0;
  float shallow = smoothstep(-190.0, -18.0, side);     // sand seen through the water, fading into the deep
  vec3 deep = mix(uPage, uPageShadow, sh), bed = mix(vec3(0.40, 0.42, 0.36), vec3(0.27, 0.29, 0.25), sh);
  vec3 page = land ? mix(uSand, uSandShadow, sh) : mix(deep, bed, shallow * shallow * 0.9);
  // Weather: wet or snowy sand, shore ice, cloud shadow, gloom, fog, lightning. Not inside the about box.
  if (texelFetch(uText, ivec2(cBL), 0).b > 0.5) { gl_FragColor = vec4((land ? mix(uSand, vec3(1.0), 0.18) : page) * mix(vec3(1.0), uSky.rgb, 0.55), 1.0); return; }
  vec2 W0 = vec2(wx, wy);
  if (land) {
    page = mix(page, page * vec3(0.72, 0.7, 0.7), wetAt(W0));
    if (side > 24.0) page = mix(page, vec3(0.5, 0.58, 0.64), puddleAt(W0) * 0.85);   // puddles hold the sky
    page = mix(page, mix(vec3(0.93, 0.95, 0.98), vec3(0.8, 0.84, 0.9), sh), snowAt(W0));
  } else if (iceAt(W0, side)) page = mix(page, vec3(0.42, 0.56, 0.62), 0.75);
  vec2 W1 = vec2(wx, wy);
  page *= (1.0 - 0.3 * cloudShade(W1)) * (1.0 - 0.4 * uWz.z);
  page = mix(page, land ? vec3(0.86, 0.85, 0.82) : vec3(0.36, 0.43, 0.46), fogAt(W1) * 0.62);
  float lg = lanternGlow(W0);
  page = mix(page, page * vec3(1.5, 1.15, 0.7) + vec3(0.2, 0.12, 0.0), clamp(lg, 0.0, 1.0) * 0.7);
  page = seasonGrade(page) * uSky.rgb;
  page = mix(page, vec3(0.9, 0.93, 1.0), uWz.x * 0.6);
  gl_FragColor = vec4(page, 1.0);
}`;

/* Each screen pixel: the cell's glyph from the atlas, inked over that cell's paper. */
export const SCREEN_FRAG = /* glsl */`
uniform sampler2D uCells; uniform sampler2D uPageT; uniform sampler2D uAtlas; uniform vec2 uCellDev; uniform vec2 uGrid;
uniform float uHeight; uniform float uGlyphs;
void main(){
  vec2 p = vec2(gl_FragCoord.x, uHeight - gl_FragCoord.y);
  vec2 cell = min(floor(p / uCellDev), uGrid - 1.0);
  ivec2 ci = ivec2(int(cell.x), int(uGrid.y - 1.0 - cell.y));
  vec4 c = texelFetch(uCells, ci, 0);
  vec3 page = texelFetch(uPageT, ci, 0).rgb;
  float v = floor(c.a*255.0 + 0.5);
  float glyph = v >= 128.0 ? v - 128.0 : v;
  vec2 inCell = fract(p / uCellDev);
  float ink = glyph > 0.5 ? texture2D(uAtlas, vec2((glyph + inCell.x)/uGlyphs, inCell.y)).r : 0.0;
  gl_FragColor = vec4(mix(page, c.rgb, ink), 1.0);
}`;
