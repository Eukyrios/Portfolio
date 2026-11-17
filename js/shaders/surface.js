/* ---------------- shade pass: surface things ---------------- */
export const SOLID_VERT = /* glsl */`
varying vec3 vN; varying vec3 vLocal;
void main(){
  vLocal = position;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
export const SOLID_FRAG = /* glsl */`
uniform vec3 uLight; uniform float uClass; uniform float uPad; uniform float uEmit; uniform float uTag;
varying vec3 vN; varying vec3 vLocal;
void main(){
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  float lam = max(dot(n, uLight), 0.0);
  float spec = pow(max(dot(n, normalize(uLight + vec3(0.0,0.0,1.0))), 0.0), 20.0);
  float cls = uClass;
  if (uPad > 0.5) {
    float r = length(vLocal.xy), a = atan(vLocal.y, vLocal.x);
    float vein = abs(fract(a/6.28318*13.0) - 0.5);
    if ((vein < 0.08 && r > 0.12) || r > 0.94) cls = 7.0;
  }
  float light = max(0.2 + 0.7*lam + 0.3*spec, uEmit);
  gl_FragColor = vec4(clamp(light, 0.0, 1.0), cls/31.0, 0.0, uTag);
}`;
