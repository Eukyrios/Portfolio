import { NJ } from "../constants.js";
import { NOISE } from "./common.js";

/* ---------------- shade pass: fish ---------------- */
export const FISH_VERT = /* glsl */`
#define NJ ${NJ}
attribute float aPart;  // 0 body 1 pectoral 2 pelvic 3 dorsal 4 tail 5 eye
attribute float aFlap;  // 0 at the fin root, 1 at its edge
attribute float aSide;
uniform vec3 uSpine[NJ];   // the body's backbone in world px, snout first
uniform float uSeg, uL, uRoll;
uniform float uPhase, uAmp, uFlap, uTurn, uFold, uLong, uFlare;
varying vec3 vN; varying vec3 vLocal; varying float vPart; varying float vFlapW; varying float vZ;
float wave(float s){ return uAmp * (0.12 + 0.88*s*s) * sin(6.0*s - uPhase); }
void main(){
  vec3 p = position; vec3 n = normal;
  vLocal = p;
  if (aPart > 0.5 && aPart < 1.5) {          // pectorals: paddle slow, fold fast, flare to brake
    p.z += sin(uFlap + aSide*0.6) * 0.07 * aFlap * (1.0 - 0.6*uFold);
    p.x -= aFlap * uFold * 0.07;
    p.y += aSide * aFlap * (uFlare*0.05 - uFold*0.05);
    p.x += aFlap * uFlare * 0.04;
  } else if (aPart > 1.5 && aPart < 2.5) {
    p.z += sin(uFlap*0.8 + 1.3) * 0.03 * aFlap;
    p.x -= aFlap * uFold * 0.03;
  } else if (aPart > 2.5 && aPart < 3.5) {
    p.y += sin(uPhase*0.7) * 0.012 * aFlap;
  }
  if (aPart > 0.5 && aPart < 4.5) {          // long fins ripple; all fins trail out of a turn
    p.z += sin(uPhase*0.55 - aFlap*3.5) * 0.05 * aFlap * aFlap * uLong;
    p.y -= uTurn * 0.05 * aFlap * aFlap;
  }
  // Where along the backbone this vertex sits, and the backbone's frame there.
  float arc = max(0.5 - p.x, 0.0) * uL;
  float fi = arc / uSeg, last = float(NJ - 1);
  vec3 C, T;
  if (fi >= last) {
    T = normalize(uSpine[NJ-1] - uSpine[NJ-2]);
    C = uSpine[NJ-1] + T * (arc - last*uSeg);
  } else {
    int i = int(fi); float t = fi - float(i);
    vec3 P0 = uSpine[i], P1 = uSpine[i+1];
    vec3 Pm = i > 0 ? uSpine[max(i-1, 0)] : 2.0*P0 - P1;
    vec3 P2 = i + 2 < NJ ? uSpine[min(i+2, NJ-1)] : 2.0*P1 - P0;
    vec3 a = 2.0*P0, b = P1 - Pm, c = 2.0*Pm - 5.0*P0 + 4.0*P1 - P2, d = -Pm + 3.0*P0 - 3.0*P1 + P2;
    C = 0.5*(a + b*t + c*t*t + d*t*t*t);
    T = normalize(b + 2.0*c*t + 3.0*d*t*t);
  }
  vec3 F = -T;
  vec3 side = cross(vec3(0.0, 0.0, 1.0), F);
  float sl = length(side); side = sl > 1e-4 ? side/sl : vec3(0.0, 1.0, 0.0);
  vec3 up = cross(F, side);
  float cr = cos(uRoll), sr = sin(uRoll);
  vec3 sd = side*cr + up*sr, upv = up*cr - side*sr;
  // The tail-beat wave rides on top of the backbone.
  float s = arc / (0.8*uL);
  float w0 = wave(s), w1 = wave(s + 0.01);
  float ph = atan(-(w1 - w0) / 0.008);
  float cp = cos(ph), spp = sin(ph);
  vec3 pos = C + sd * (w0 * uL) + (F*(-spp) + sd*cp) * (p.y * uL) + upv * (p.z * uL);
  vec2 nr = vec2(n.x*cp - n.y*spp, n.x*spp + n.y*cp);
  vN = normalize(F*nr.x + sd*nr.y + upv*n.z);
  vZ = pos.z;
  vPart = aPart; vFlapW = aFlap;
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}`;

export const FISH_FRAG = /* glsl */`
uniform vec3 uLight; uniform float uType; uniform float uSeed; uniform float uMaxDepth;
varying vec3 vN; varying vec3 vLocal; varying float vPart; varying float vFlapW; varying float vZ;
${NOISE}
float net(vec3 L){  // scale reticulation, 1 on scale edges
  vec2 q = vec2(L.x*26.0, L.y*26.0 + mod(floor(L.x*26.0), 2.0)*0.5);
  vec2 f = abs(fract(q) - 0.5);
  return smoothstep(0.32, 0.46, max(f.x, f.y));
}
float bodyClass(vec3 L, out float tex){
  tex = 1.0;
  vec3 q = L*vec3(7.0, 11.0, 11.0) + uSeed*13.7;
  float n = fbm3(q), n2 = fbm3(q*2.3 + 31.0);
  float top = smoothstep(-0.03, 0.05, L.z);
  float nt = net(L);
  int t = int(uType + 0.5);
  if (t == 0) { float head = smoothstep(0.30, 0.44, L.x)*0.18; return (n + head > 0.5 && top > 0.2) ? 2.0 : 1.0; }
  if (t == 1) { if (n2 > 0.68 && top > 0.4) return 3.0; return (n > 0.52 && top > 0.2) ? 2.0 : 1.0; }
  if (t == 2) { if (n > 0.56 && top > 0.2) return 2.0; if (n2 > 0.56) return 1.0; return 3.0; }
  if (t == 3) { tex = 1.0 - 0.15*nt; return 4.0; }
  if (t == 4) { vec2 d = vec2(L.x - 0.36, L.y*1.2); return (length(d) < 0.056 && top > 0.3) ? 2.0 : 1.0; }
  if (t == 5) { tex = 1.0 - 0.2*nt; if (L.x > 0.34) return 1.0; return top > 0.45 ? 11.0 : 2.0; }
  if (t == 6) return 12.0;
  if (t == 7) return (n > 0.58 && top > 0.3) ? 1.0 : 13.0;
  if (t == 8) return n > 0.47 ? 1.0 : 3.0;
  if (t == 9) return n > 0.5 ? 2.0 : 3.0;
  if (t == 10) return (n2 > 0.7 && top > 0.4) ? 3.0 : 1.0;
  if (t == 11) { tex = 1.0 - 0.25*nt; return 14.0; }
  if (t == 12) { tex = 1.0 - 0.25*nt; return 15.0; }
  if (t == 13) { if (n > 0.56 && top > 0.2) return 2.0; return nt > 0.5 ? 3.0 : 15.0; }
  if (t == 14) { if (n > 0.5 && top > 0.2) return 13.0; return nt > 0.5 ? 15.0 : 1.0; }
  if (t == 15) { tex = 1.0 - 0.12*nt; return 17.0; }
  if (t == 16) return (n > 0.62 && top > 0.3) ? 1.0 : 2.0;
  if (t == 17) { if (n2 > 0.72) return 3.0; if (n > 0.55) return 2.0; return n2 > 0.45 ? 11.0 : 1.0; }
  if (t == 18) return (n2 > 0.66 && top > 0.55) ? 3.0 : 13.0;
  return 1.0;
}
float finClass(int t, float part, float w){
  if (t == 3) return 4.0; if (t == 6) return 12.0; if (t == 7 || t == 18) return 13.0;
  if (t == 11) return 14.0; if (t == 12) return 15.0; if (t == 15) return 17.0;
  if (t == 16) return w < 0.55 ? 2.0 : 5.0;
  if (t == 17) return w > 0.6 ? 2.0 : 5.0;
  if ((t == 2 || t == 8 || t == 9) && part < 1.5 && w < 0.4) return 3.0;
  return 5.0;
}
void main(){
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  float lam = max(dot(n, uLight), 0.0);
  float spec = pow(max(dot(n, normalize(uLight + vec3(0.0,0.0,1.0))), 0.0), 28.0);
  int t = int(uType + 0.5);
  float tex = 1.0, cls;
  if (vPart < 0.5) cls = bodyClass(vLocal, tex);
  else if (vPart > 4.5) cls = 3.0;
  else cls = finClass(t, vPart, vFlapW);
  bool metal = cls == 4.0 || cls == 17.0;
  float light = (0.3 + 0.7*lam) * tex + spec*(metal ? 0.85 : 0.35);
  if (vPart > 0.5 && vPart < 4.5) light *= 0.55;
  gl_FragColor = vec4(clamp(light, 0.0, 1.0), cls/31.0, clamp(-vZ/uMaxDepth, 0.0, 1.0), 1.0);
}`;
