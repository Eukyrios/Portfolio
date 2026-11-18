// Weather uniforms, shared by the cell and screen passes:
// uWx = (wind dir x, wind dir y [y up], wind strength now, rain)
// uWy = (snow falling, fog, wet ground, snow cover)
// uWz = (lightning flash, shore ice, storm gloom, cloud cover); uCloudOff = how far the clouds have drifted.
// uWm = (ice break-up 0..1, how far the ice can reach from the shore, bolt start time, -);
// uBolt[i] = one segment of the lightning bolt, world (x0, y0, x1, y1).
// uWo = surface drift offset (x, y), cat's-paw offset (x, y); uWo2 = (sand streak offset, air streak offset), all accumulated over
// time so a change in the wind never makes the patterns jump. uSky = (light tint rgb, night 0..1);
// uSun = (shadow strength, -, -, -); uMoon = (screen x, y, strength, -) of the moon's glint on the water;
// uLantern = world x, y of up to two stone lanterns.
export const WEATHER_GLSL = /* glsl */`uniform vec4 uWx; uniform vec4 uWy; uniform vec4 uWz; uniform vec2 uCloudOff; uniform vec4 uWm; uniform vec4 uBolt[16];
uniform vec4 uWo; uniform vec2 uWo2; uniform vec4 uSky; uniform vec4 uSun; uniform vec4 uMoon; uniform vec4 uLantern; uniform vec4 uSeason;
// Season colour grading: spring fresh, summer rich, autumn golden, winter pale and cool.
vec3 seasonGrade(vec3 c){
  float l = dot(c, vec3(0.3, 0.55, 0.15));
  c = mix(c, vec3(l) * vec3(0.93, 0.98, 1.08), uSeason.w * 0.32);
  c *= mix(vec3(1.0), vec3(1.07, 0.99, 0.86), uSeason.z * 0.55);
  c *= mix(vec3(1.0), vec3(1.02, 1.04, 0.98), uSeason.x * 0.5);
  return c;
}
// A leaf or petal colour: pink blossom in spring, reds and golds in autumn.
vec3 leafColor(float h){ return mix(vec3(1.0, 0.72, 0.82), h > 0.66 ? vec3(0.85, 0.22, 0.12) : (h > 0.33 ? vec3(0.95, 0.55, 0.15) : vec3(0.92, 0.78, 0.25)), uSeason.z / max(uSeason.x + uSeason.z, 0.001)); }
float leafAmt(){ return uSeason.x * 0.55 + uSeason.z * 0.75; }
float lanternGlow(vec2 w){ float g = 0.0; for (int i = 0; i < 2; i++) { vec2 L = i == 0 ? uLantern.xy : uLantern.zw; if (L.x > 1e5) continue; float d = length(w - L); g += exp(-d * d / 9000.0); } return g * uSky.w; }`;
export const WEATHER_FN = /* glsl */`
float cloudShade(vec2 w){ return uWz.w < 0.01 ? 0.0 : smoothstep(0.45, 0.75, noise3(vec3((w - uCloudOff) * 0.0013, uTime * 0.015))) * uWz.w; }
float fogAt(vec2 w){ return uWy.y < 0.01 ? 0.0 : clamp(uWy.y * (0.45 + 0.75 * noise3(vec3((w - uCloudOff * 0.5) * 0.0035, uTime * 0.04))), 0.0, 0.95); }
// The ice grows out from the shore until, given long enough, the whole pond is frozen.
float iceWidth(float wx){ return uWz.y < 0.001 ? 0.0 : pow(uWz.y, 1.3) * uWm.y + uWz.y * (45.0 * sin(wx * 0.013) + 30.0 * sin(wx * 0.031 + 2.0)); }
// Is there ice at this point? As it melts it breaks into floes, then they shrink.
bool iceAt(vec2 w, float side){
  float iw = iceWidth(w.x);
  if (iw < 1.0 || side < -18.0 - iw) return false;
  return noise3(vec3(w * 0.022, 0.0)) * 0.85 + 0.15 > uWm.x;
}
// Wet sand dries in patches; puddles gather in the low places, grow while it rains and shrink as it dries.
float wetAt(vec2 w){ return uWy.z < 0.001 ? 0.0 : clamp(uWy.z * 1.7 - noise3(vec3(w * 0.006, 2.0)) * 0.75, 0.0, 1.0); }
// Puddles: small round pools scattered over the sand.
float puddleAt(vec2 w){ if (uWy.z < 0.3) return 0.0; float n = noise3(vec3(w * 0.028, 5.0)) * 0.85 + noise3(vec3(w * 0.07, 9.0)) * 0.15; return smoothstep(0.0, 0.03, n - 0.86 + (uWy.z - 0.3) * 0.25); }
// Snow lies in drifts first, then everywhere; it melts back the same way.
// Snow settles evenly (just a gentle, very wide variation), and melts back the same way.
float snowAt(vec2 w){ return uWy.w < 0.001 ? 0.0 : smoothstep(0.12, 0.85, uWy.w + (noise3(vec3(w * 0.0012, 7.0)) - 0.5) * 0.12); }
// The lightning bolt: distance to its nearest segment, and that segment's direction (screen).
float boltAt(vec2 w, out vec2 dir){
  float best = 1e9; dir = vec2(1.0, 0.0);
  for (int i = 0; i < 16; i++) {
    vec4 B = uBolt[i]; vec2 a = B.xy, b = B.zw, ab = b - a; float l2 = dot(ab, ab);
    if (l2 < 1.0) continue;
    float t = clamp(dot(w - a, ab) / l2, 0.0, 1.0); float d = length(w - a - ab * t);
    if (d < best) { best = d; dir = normalize(vec2(ab.x, -ab.y)); }
  }
  return best;
}
`;
