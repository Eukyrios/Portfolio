export const BIRD_VERT = /* glsl */`
// A starling, posed like a skeleton (see bird-model.js for the parts).
//  - Wings: three bones (body, arm, hand) blended smoothly across the shoulder and wrist.
//    Each bone lifts, sweeps and twists. On the downstroke the wing reaches forward with
//    its leading edge down; on the upstroke the hand sweeps back and in, and the tip lags
//    behind the arm, so a beat ripples out to it. Folded, a wing lies along the back.
//  - Body: pitches about the hips, fluffs up, bends into turns, rolls, and rises and falls with the beat.
//  - Head: nods and turns about the neck, and stretches up and out.
//  - Tail: fans and lifts. Legs: tucked in flight, reaching down to land, stepping on the ground.
attribute vec4 aInfo;    // part, span or leg segment, tone, head weight
attribute vec2 aUV;
attribute vec3 aFold;
attribute vec3 aFoldN;
attribute vec4 aAnim;    // beat phase, beat amplitude, bank, bend
attribute vec4 aPose;    // tuck, nod, look, body pitch (nose down > 0)
attribute vec4 aPose2;   // stance, step phase, step amount, leg reach
attribute vec4 aPose3;   // tail fan, tail lift, fluff, neck stretch
varying float vLight;
varying float vPart;
varying vec2 vUV;
varying vec3 vPos;
const vec3 LIGHT = vec3(-0.45, -0.55, 0.70);
const float YS = 0.12, ZS = 0.10, SP = 1.75, SW = 0.63;     // shoulder line, span, wrist (WING in bird-model.js)
const vec3 PS = vec3(0.14, 0.0, 0.0);                        // shoulder pivot, wing-local (x, out, up)
const vec3 PW = vec3(0.30, 0.63, 0.0);                       // wrist pivot
const vec3 NECK = vec3(0.44, 0.0, 0.08);
const vec3 HIP = vec3(-0.03, 0.075, -0.16);
const float H0 = 0.40;                                       // body centre above the ground when standing
const vec3 TAIL = vec3(-0.36, 0.0, 0.03);
mat3 rx(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 ry(float a){ float c = cos(a), s = sin(a); return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c); }
mat3 rz(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
vec2 rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(v.x*c - v.y*s, v.x*s + v.y*c); }

float uPitch, uBank, uBend, uLift, uStance;
// The body's pose, applied to everything after the parts have moved on their own.
vec3 poseBody(vec3 p){
  vec3 h = vec3(HIP.x, 0.0, HIP.z);
  p.xz = h.xz + rot(p.xz - h.xz, -uPitch);
  p.y += uBend * (p.x * p.x) * (p.x > 0.0 ? 0.16 : 0.4);   // the spine bends into a turn; the tail swings more
  p.x -= abs(uBend) * p.x * p.x * p.x * 0.08;
  p.yz = rot(p.yz, uBank);
  p.z += uLift + H0 * uStance;
  return p;
}
vec3 poseBodyN(vec3 n){
  n.xz = rot(n.xz, -uPitch);
  n.yz = rot(n.yz, uBank);
  return n;
}

void main(){
  int part = int(aInfo.x + 0.5);
  vec3 p = position, n = normal;
  vPart = aInfo.x; vUV = aUV; vPos = position;
  float ph = aAnim.x, A = aAnim.y;
  float tuck = aPose.x, nod = aPose.y, look = aPose.z;
  float fan = aPose3.x, tailLift = aPose3.y, fluff = aPose3.z, stretch = aPose3.w;
  uPitch = aPose.w; uBank = aAnim.z; uBend = aAnim.w; uStance = aPose2.x;
  // Beat: the downstroke is quicker than the upstroke. c = +1 wings up, -1 down.
  float g = ph + 0.28 * (1.0 - cos(ph));
  float c = cos(g), dn = max(sin(g), 0.0), up = max(-sin(g), 0.0);
  uLift = -0.05 * A * c;                                     // the body rises on each downstroke

  if (part == 5) {
    /* ---- legs ---- */
    float side = aUV.x, seg = aInfo.y;
    vec3 hip = poseBody(HIP * vec3(1.0, side, 1.0));
    vec3 heel = hip + vec3(-0.05, 0.0, -0.05);
    // Feet: on the ground they step (stance part of the cycle, then a swing forward);
    // in the air they are tucked under the belly, or reach down to land.
    float st = aPose2.z, f = fract(aPose2.y + (side > 0.0 ? 0.0 : 0.5)), S = 0.3 * st;
    float fx = f < 0.6 ? S * 0.5 - S * f / 0.6 : -S * 0.5 + S * smoothstep(0.0, 1.0, (f - 0.6) / 0.4);
    float fz = f < 0.6 ? 0.0 : 0.07 * st * sin(3.14159 * (f - 0.6) / 0.4);
    vec3 ground = vec3(HIP.x + 0.02 + fx, side * 0.085, fz);
    vec3 tucked = poseBody(HIP * vec3(1.0, side, 1.0) + vec3(-0.2, 0.0, -0.04));
    vec3 reach = poseBody(HIP * vec3(1.0, side, 1.0) + vec3(0.12, side * 0.02, -0.3));
    vec3 foot = mix(mix(tucked, reach, aPose2.w), ground, uStance);
    vec3 a = heel, b = foot;
    if (seg > 0.5) {
      float k = seg - 2.0, toe = seg > 3.5 ? 3.14159 : k * 0.45;
      float len = seg > 3.5 ? 0.08 : 0.12;
      vec3 dir = mix(vec3(-0.55, 0.0, 0.1), vec3(cos(toe), sin(toe), 0.0), uStance);   // curled up in flight
      a = foot; b = foot + dir * len * mix(0.6, 1.0, uStance);
    }
    vec3 d = normalize(b - a + vec3(1e-4, 0.0, 0.0));
    vec3 e1 = normalize(cross(d, abs(d.z) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0)));
    vec3 e2 = cross(d, e1);
    p = mix(a, b, position.z) + e1 * position.x + e2 * position.y;
    n = normalize(e1 * position.x + e2 * position.y);
  } else {
    if (part == 3) {
      /* ---- wings ---- */
      float side = sign(p.y);
      vec3 q = vec3(p.x, abs(p.y) - YS, p.z - ZS), m = vec3(n.x, n.y * side, n.z);
      float s = q.y;
      // Shoulder (arm) angles.
      float elA = A * (0.68 * c - 0.1) + (1.0 - A) * 0.06;
      float swA = A * (-0.14 * dn + 0.16 * up) + (1.0 - A) * 0.1;
      float twH = A * (-0.3 * dn + 0.35 * up);
      // Hand, relative to the arm: lags the arm, sweeps back on the upstroke (and in a glide), twists more.
      float elH = A * 0.38 * cos(g - 1.1);
      float swH = A * 0.62 * pow(up, 0.8) + (1.0 - A) * 0.32;
      float curl = A * 0.2 * cos(g - 1.8);
      mat3 RA = rx(elA) * rz(swA) * ry(twH * 0.45);
      mat3 RH = rx(elH) * rz(swH) * ry(twH * 0.55);
      vec3 pa = RA * (q - PS) + PS;
      vec3 qh = q - PW;
      qh.yz = rot(qh.yz, curl * max(qh.y, 0.0) / (SP - SW));   // the hand bends along its length
      vec3 ph3 = RA * (RH * qh + PW - PS) + PS;
      float wb = 1.0 - smoothstep(0.0, 0.2, s), wh = smoothstep(SW - 0.1, SW + 0.12, s), wa = max(0.0, 1.0 - wb - wh);
      vec3 qf = wb * q + wa * pa + wh * ph3;
      vec3 nf = normalize(wb * m + wa * (RA * m) + wh * (RA * (RH * m)));
      vec3 fly = vec3(qf.x, side * (YS + qf.y), ZS + qf.z);
      vec3 flyN = vec3(nf.x, side * nf.y, nf.z);
      // Folded on the back; on the way there the wing lifts clear of the body.
      vec3 fold = aFold; fold.yz *= 1.0 + fluff;
      float mid = sin(3.14159 * tuck);
      p = mix(fly, fold, tuck) + vec3(0.0, side * 0.1, 0.16) * mid * aInfo.y;
      n = normalize(mix(flyN, aFoldN, tuck));
    } else if (part == 4) {
      /* ---- tail: fans about its base and lifts ---- */
      vec2 d = p.xy - TAIL.xy;
      float r = length(d), th = atan(d.y, -d.x) * (1.0 + 1.6 * fan);
      p.xy = TAIL.xy + r * vec2(-cos(th), sin(th));
      p.xz = TAIL.xz + rot(p.xz - TAIL.xz, -tailLift);
      n.xz = rot(n.xz, -tailLift);
    } else if (part == 0) {
      // Fluffed up (or breathing): the body swells about its axis; the head stays sleek.
      p.yz *= 1.0 + fluff * (1.0 - aInfo.w);
    }
    // Head: nods and turns about the neck, and stretches up and out.
    float hw = aInfo.w;
    if (hw > 0.0) {
      vec3 v = p - NECK, vn = n;
      v.xz = rot(v.xz, -nod); vn.xz = rot(vn.xz, -nod);
      v.xy = rot(v.xy, look); vn.xy = rot(vn.xy, look);
      v += NECK + vec3(0.06 * stretch, 0.0, 0.05 * stretch);
      p = mix(p, v, hw); n = normalize(mix(n, vn, hw));
    }
    p = poseBody(p); n = poseBodyN(n);
  }
  vec4 wp = modelMatrix * (instanceMatrix * vec4(p, 1.0));
  vec3 wn = normalize(mat3(instanceMatrix) * n);
  float ndl = dot(wn, normalize(LIGHT));
  vLight = (0.22 + 0.78 * (part == 3 ? abs(ndl) : max(ndl, 0.0))) * aInfo.z;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
export const BIRD_FRAG = /* glsl */`
// Starlings, tagged (alpha 0.55). Red: light. Green: colour code for the cell pass:
// 0.1 bill, 0.2 eye, 0.265 legs, 0.3 pale spot, 0.32 buff feather edge, 0.35..0.95 glossy
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
  else if (part == 5) c = 0.265;
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
