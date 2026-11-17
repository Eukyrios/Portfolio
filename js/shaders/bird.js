export const BIRD_VERT = /* glsl */`
// A starling built from a flexible body and two jointed wings.
//  - Wings: shoulder, wrist and hand joints, each lagging the one before, so a
//    beat travels out to the tips. On the upstroke the hand folds back and in,
//    as real birds do; on the downstroke the wing spreads and reaches forward.
//    On the ground the wings fold back along the body (tuck).
//  - Body: bends into turns, the tail fans when turning hard, the head turns on
//    its own (looking about, or leading a turn) and dips forward to peck.
// aAnim = (beat phase, beat amplitude, bank, bend); aPose = (tuck, peck, head turn).
// aWing = 0 on the body, otherwise how far out along the wing (0..1).
attribute float aWing;
attribute float aTone;
attribute float aPart;
attribute vec2 aUV;
attribute vec4 aAnim;
attribute vec3 aPose;
varying float vLight;
varying float vPart;
varying vec2 vUV;
varying vec3 vPos;
const vec3 LIGHT = vec3(-0.45, -0.55, 0.70);
vec2 rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(v.x*c - v.y*s, v.x*s + v.y*c); }
void main(){
  vec3 p = position;
  vPart = aPart; vUV = aUV; vPos = position;
  float side = p.y >= 0.0 ? 1.0 : -1.0;
  float ph = aAnim.x, amp = aAnim.y, bank = aAnim.z, bend = aAnim.w;
  float tuck = aPose.x, peck = aPose.y, look = aPose.z;
  // Measured starlings beat from about 55 deg below the body to 19 deg above, and the
  // downstroke is quicker than the upstroke: warp the phase so it is.
  ph = ph - 0.35 * sin(ph);
  float up = max(cos(ph), 0.0);                                   // > 0 while the wing rises
  vec3 n = normal;
  if (aWing > 0.0) {
    float S = 0.15 - 0.1 * tuck;
    const float W = 0.62, H = 1.12;                              // wrist and hand, out from the body
    float a1 = amp * 0.75 * sin(ph) + 0.1 - 0.4 * amp + 0.25 * tuck;   // shoulder: mostly below the body; tucked wings sit on the back
    float a2 = a1 + amp * 0.45 * sin(ph - 0.7) - 0.2 * tuck;     // wrist lags
    float a3 = a2 + amp * 0.35 * sin(ph - 1.4);                  // hand lags more: the tips whip
    float fold = amp * up * 0.85;                                // upstroke: fold the hand back and in
    float sweep = 0.18 * amp * max(-cos(ph), 0.0);               // downstroke: reach forward
    float ay = abs(p.y);
    vec2 xd = vec2(0.05 + (p.x - 0.05) * (1.0 - 0.7 * tuck), ay - 0.15);   // a folded wing is narrow
    if (ay > W) {
      vec2 o = vec2(p.x - 0.05, ay - W);
      o = vec2(o.x - o.y * (fold * 0.9 - sweep), o.y * (1.0 - fold * 0.35));
      xd = vec2(0.05 + o.x, W - 0.15 + o.y);
    }
    // Tucked: swing the whole wing back about the shoulder to lie along the body.
    vec2 r = rot(vec2(xd.x - 0.05, xd.y), tuck * 1.42);
    xd = vec2(0.05 + r.x, r.y * (1.0 - 0.45 * tuck));
    float d = max(xd.y, 0.0);
    vec2 q; float ang;
    if (d < W - 0.15) { q = d * vec2(cos(a1), sin(a1)); ang = a1; }
    else {
      vec2 w = (W - 0.15) * vec2(cos(a1), sin(a1));
      float e = d - (W - 0.15), lh = H - W;
      if (e < lh) { q = w + e * vec2(cos(a2), sin(a2)); ang = a2; }
      else { q = w + lh * vec2(cos(a2), sin(a2)) + (e - lh) * vec2(cos(a3), sin(a3)); ang = a3; }
    }
    p.x = xd.x; p.y = side * (S + q.x); p.z = q.y + p.z * cos(ang) + 0.17 * tuck;   // folded wings lie on the back
    n.yz = rot(n.yz, side * ang);
  } else if (p.x < -0.5) {
    // Tail: fans out in a hard turn.
    float t = (-0.5 - p.x) / 0.4;
    p.y *= 1.0 + t * clamp(abs(bend) * 2.2, 0.0, 1.1);
  } else if (p.x > 0.42) {
    // Head: turns about the neck, and reaches forward and down to peck.
    float h = smoothstep(0.42, 0.58, p.x);
    vec2 hv = rot(vec2(p.x - 0.42, p.y), look * h);
    p.xy = vec2(0.42 + hv.x, hv.y);
    p.x += peck * 0.22 * h;
    p.z -= peck * 0.2 * h;
  }
  // The spine bends into the turn: head and tail both swing toward the inside.
  p.y += bend * (p.x * p.x) * (p.x > 0.0 ? 0.16 : 0.4);   // the tail swings more than the head
  p.x -= abs(bend) * p.x * p.x * p.x * 0.08;
  // Bank: roll about the length.
  p.yz = rot(p.yz, bank); n.yz = rot(n.yz, bank);
  vec4 wp = modelMatrix * (instanceMatrix * vec4(p, 1.0));
  vec3 wn = normalize(mat3(instanceMatrix) * n);
  float ndl = dot(wn, normalize(LIGHT));
  vLight = (0.22 + 0.78 * (aWing > 0.0 ? abs(ndl) : max(ndl, 0.0))) * aTone;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
export const BIRD_FRAG = /* glsl */`
// Starlings, tagged (alpha 0.55). Red: light. Green: colour code for the cell pass:
// 0.1 bill, 0.2 eye, 0.3 pale spot, 0.32 buff feather edge, 0.35..0.95 glossy
// plumage (sheen from purple on the head to green behind), 0.97 dull flight feathers.
// The feathers are drawn here: overlapping body feathers with pale V-shaped tips
// (the starling's winter spots), rows of wing coverts with buff tips, separate
// flight feathers with dark gaps, shafts and buff edges, and the tail's six feathers.
varying float vLight;
varying float vPart;
varying vec2 vUV;
varying vec3 vPos;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  float l = vLight, c = 0.5;
  int part = int(vPart + 0.5);
  if (part == 1) c = 0.1;
  else if (part == 2) c = 0.2;
  else if (part == 0) {
    c = 0.35 + 0.6 * clamp((0.7 - vPos.x) / 0.9, 0.0, 1.0);
    vec2 g = vec2(vPos.x * 15.0, vUV.y * 26.0);
    float row = floor(g.x); g.y += mod(row, 2.0) * 0.5;
    vec2 f = fract(g) - vec2(0.5);
    l *= 1.0 - 0.28 * smoothstep(0.3, 0.5, length(f * vec2(1.0, 1.15)));     // feather outlines
    float rate = vPos.x > 0.45 ? 0.12 : mix(0.25, 0.6, clamp((0.45 - vPos.x) / 0.8, 0.0, 1.0));
    vec2 tf = fract(g) - vec2(0.2, 0.5);                                     // tip: toward the tail
    if (hash(floor(g)) < rate && tf.x < 0.1 && tf.x > -0.16 && abs(tf.y) < 0.2 + tf.x * 0.9) c = 0.3;
  } else if (part == 3) {
    float u = vUV.x, v = vUV.y;                                              // span, chord (0 leading edge)
    if (v < 0.38) {                                                          // coverts, in overlapping rows
      c = 0.85;
      vec2 g = vec2(u * 22.0, v * 7.5); g.x += mod(floor(g.y), 2.0) * 0.5;
      vec2 f = fract(g) - 0.5;
      l *= 1.0 - 0.22 * smoothstep(0.3, 0.5, length(f));
      if (f.y > 0.22 && abs(f.x) < 0.28 && hash(floor(g)) > 0.4) c = 0.32;  // buff tips
    } else {                                                                 // flight feathers
      c = 0.97;
      float n = u < 0.42 ? 7.0 : 10.0, fu = (u < 0.42 ? u / 0.42 : (u - 0.42) / 0.58) * n, fx = fract(fu);
      l *= 0.8 + 0.2 * smoothstep(0.0, 0.12, fx) * smoothstep(1.0, 0.88, fx);   // dark gaps between feathers
      l *= 1.0 - 0.2 * smoothstep(0.05, 0.0, abs(fx - 0.45));                 // shaft
      if (v > 0.92 || (fx > 0.95 && v > 0.5)) c = 0.32;                                     // buff edges
    }
  } else {                                                                   // tail
    c = 0.9;
    float fv = fract(vUV.y * 6.0);
    l *= 0.8 + 0.2 * smoothstep(0.0, 0.12, fv) * smoothstep(1.0, 0.88, fv);
    l *= 1.0 - 0.15 * smoothstep(0.05, 0.0, abs(fv - 0.5));
    if (vUV.x > 0.9) c = 0.32;
  }
  gl_FragColor = vec4(clamp(l, 0.01, 0.99), c, 0.0, 0.55);
}`;
