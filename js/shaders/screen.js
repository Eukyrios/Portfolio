/* ---------------- screen pass ---------------- */
export const SCREEN_FRAG = /* glsl */`
uniform sampler2D uCells; uniform sampler2D uAtlas; uniform vec2 uCellDev; uniform vec2 uGrid;
uniform float uHeight; uniform float uGlyphs; uniform vec3 uPage; uniform vec3 uPageShadow;
uniform vec3 uSand; uniform vec3 uSandShadow; uniform vec2 uCellCss; uniform vec4 uGarden; uniform float uZoom; uniform vec2 uCam; uniform vec2 uAxis;
float shoreY(float wx){ return uGarden.x + 40.0*sin(wx*0.003) + 22.0*sin(wx*0.011 + 1.0); }
void main(){
  vec2 p = vec2(gl_FragCoord.x, uHeight - gl_FragCoord.y);
  vec2 cell = min(floor(p / uCellDev), uGrid - 1.0);
  vec4 c = texelFetch(uCells, ivec2(int(cell.x), int(uGrid.y - 1.0 - cell.y)), 0);
  float v = floor(c.a*255.0 + 0.5);
  float sh = v >= 128.0 ? 0.85 : 0.0;
  float glyph = v >= 128.0 ? v - 128.0 : v;
  vec2 cp = (cell + 0.5) * uCellCss;                    // same cell centre the cell pass used
  float wx = uCam.x + (cp.x - uAxis.x) / uZoom, wy = uCam.y - (cp.y - uAxis.y) / uZoom;
  float side = wy - shoreY(wx);
  bool land = side > -18.0;
  float shallow = smoothstep(-190.0, -18.0, side);     // sand seen through the water, fading into the deep
  vec3 deep = mix(uPage, uPageShadow, sh), bed = mix(vec3(0.40, 0.42, 0.36), vec3(0.27, 0.29, 0.25), sh);
  vec3 page = land ? mix(uSand, uSandShadow, sh) : mix(deep, bed, shallow * shallow * 0.9);
  vec2 inCell = fract(p / uCellDev);
  float ink = glyph > 0.5 ? texture2D(uAtlas, vec2((glyph + inCell.x)/uGlyphs, inCell.y)).r : 0.0;
  gl_FragColor = vec4(mix(page, c.rgb, ink), 1.0);
}`;
