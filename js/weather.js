import { state } from "./state.js";
import { DRIFT } from "./constants.js";
import { cellMat } from "./setup.js";
import { clamp, fish, rand, ripple, toWorld, view } from "./world.js";
import { startle } from "./pond/swimming.js";
import { gardenTop, shoreY, vnoise3 } from "./garden/terrain.js";
import { garden } from "./garden/scene.js";
import { flowByte } from "./garden/sand.js";
import { sky } from "./sky.js";

/* ---------------- weather ---------------- */
// Six kinds of weather, each a set of targets the live values ease toward.
// Slower things follow from them: sand stays wet a while after rain, snow
// settles and melts, ice creeps out from the shore while it snows.
export const WEATHERS = {
  clear:  { name: "clear",        wind: 0.1,  rain: 0,    snow: 0,   fog: 0,    storm: 0,    cloud: 0.15 },
  breeze: { name: "windy",        wind: 0.8,  rain: 0,    snow: 0,   fog: 0,    storm: 0,    cloud: 0.55 },
  rain:   { name: "rain",         wind: 0.3,  rain: 0.65, snow: 0,   fog: 0.12, storm: 0.15, cloud: 0.85 },
  storm:  { name: "thunderstorm", wind: 1.0,  rain: 1.0,  snow: 0,   fog: 0.05, storm: 1,    cloud: 1 },
  snow:   { name: "snow",         wind: 0.25, rain: 0,    snow: 0.8, fog: 0.15, storm: 0.1,  cloud: 0.7 },
  fog:    { name: "fog",          wind: 0.05, rain: 0,    snow: 0,   fog: 0.85, storm: 0,    cloud: 0.3 },
};
export const WEATHER_KEYS = ["clear", "breeze", "rain", "storm", "snow", "fog"];
const NEXT_WEATHER = { clear: ["breeze", "fog", "rain", "snow"], breeze: ["clear", "rain", "storm"], rain: ["storm", "clear", "breeze"],
  storm: ["rain", "breeze"], snow: ["clear", "fog"], fog: ["clear", "breeze"] };
export const weather = { kind: "clear", t: 0, dur: 40, wind: 0.1, windNow: 0.1, windA: 0.3, rain: 0, snow: 0, fog: 0, storm: 0, cloud: 0.15,
  wet: 0, cover: 0, ice: 0, flash: 0, flashQ: 0, nextBolt: 4, cloudX: 0, cloudY: 0, announceT: -9 };
export const windVec = () => [Math.cos(weather.windA), Math.sin(weather.windA)];
// Buttons to call up each kind of weather (keys 1-6 do the same).
const wxButtons = [];   // (the weather has no buttons now: keys 1-6, or let it come and go)
// How likely each kind of weather is in each season (spring, summer, autumn, winter).
// Every kind happens somewhere in the year; snow only when it is cold, thunderstorms only when it is warm.
const SEASON_ODDS = {
  clear:  [1.0, 1.6, 0.8, 0.8],
  breeze: [0.9, 0.5, 1.4, 0.9],
  rain:   [1.5, 0.6, 1.2, 0.0],
  storm:  [0.5, 1.3, 0.3, 0.0],
  snow:   [0.0, 0.0, 0.12, 2.0],
  fog:    [0.6, 0.1, 1.1, 1.0],
};
function nextWeather() {
  const cur = weather.kind, sw = sky.season;
  const odds = (k) => SEASON_ODDS[k].reduce((a, v, i) => a + v * sw[i], 0)
    * (k === "storm" && (cur === "clear" || cur === "fog" || cur === "snow") ? 0.35 : 1);   // storms mostly build out of wind and rain
  const opts = WEATHER_KEYS.filter((k) => k !== cur && odds(k) > 0.02);
  let r = Math.random() * opts.reduce((a, k) => a + odds(k), 0);
  for (const k of opts) { r -= odds(k); if (r <= 0) return k; }
  return opts[0] || "clear";
}
export function setWeather(kind) {
  weather.kind = kind; weather.t = 0;
  wxButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === kind)));
  weather.dur = kind === "storm" ? rand(30, 45) : rand(45, 80);
  weather.announceT = state.clock;
}
function lightning() {
  weather.flash = 1;
  weather.flashQ = state.clock + rand(0.12, 0.2);               // and a second flicker
  // It strikes somewhere in view.
  const [x, y] = toWorld(rand(view.W * 0.15, view.W * 0.85), rand(view.H * 0.2, view.H * 0.85));
  // The bolt: from out of the sky (drawn coming in from above the impact) down to it,
  // in jagged steps, with a couple of forks.
  const segs = cellMat.uniforms.uBolt.value, len = 420 / view.zoom;
  segs.forEach((v) => v.set(0, 0, 0, 0));
  let n = 0;
  const path = (x0, y0, x1, y1, steps, jag) => {
    let px = x0, py = y0;
    for (let i = 1; i <= steps && n < 16; i++) {
      const t = i / steps, nx = x0 + (x1 - x0) * t, ny = y0 + (y1 - y0) * t;
      const ox = i === steps ? 0 : rand(-jag, jag), oy = i === steps ? 0 : rand(-jag, jag) * 0.4;
      segs[n++].set(px, py, nx + ox, ny + oy);
      px = nx + ox; py = ny + oy;
    }
  };
  const sx = x + rand(-0.35, 0.35) * len, sy = y + len;
  path(sx, sy, x, y, 9, 26 / view.zoom);
  for (let f = 0; f < 2 && n < 16; f++) {                 // forks off the main channel
    const s0 = segs[2 + f * 3], fx = s0.z, fy = s0.w;
    path(fx, fy, fx + rand(-1, 1) * len * 0.3, fy - len * rand(0.15, 0.3), 3, 18 / view.zoom);
  }
  cellMat.uniforms.uWm.value.z = state.clock;
  const side = y - shoreY(x);
  const inPond = Math.abs(x) < view.WX / 2 && y > -view.WY / 2 && side < -30;
  if (inPond) { ripple(x, y, 1.6, true); ripple(x, y, 0.8, true); }
  else if (side > 30 && y < gardenTop() - 20) churnSand(x, y, 46);
  for (const f of fish) {
    const d = Math.hypot(f.x - x, f.y - y);
    if (d < 500 || Math.random() < 0.4) startle(f, Math.atan2(f.y - y, f.x - x));
  }
}
/** A strike throws the sand about: a churned crater and a spray of clods. It stays until re-raked. */
function churnSand(x, y, R) {
  if (!garden.h) return;
  const t = garden.texel, hw = garden.hw, hh = garden.hh, H = garden.h, M = garden.mask;
  const cx = (x - garden.HX0) / t, cy = (garden.HY0 - y) / t, r = (R * 2.2) / t;
  for (let iy = Math.max(0, Math.floor(cy - r)); iy < Math.min(hh, Math.ceil(cy + r)); iy++)
    for (let ix = Math.max(0, Math.floor(cx - r)); ix < Math.min(hw, Math.ceil(cx + r)); ix++) {
      const i = iy * hw + ix, d = (Math.hypot(ix - cx, iy - cy) * t) / R;
      if (M[i]) continue;
      if (d < 1) { H[i * 2] = Math.round(clamp(110 + 120 * Math.random() * (1 - d * 0.5) - 60 * (1 - d), 0, 255)); H[i * 2 + 1] = 1 + ((Math.random() * 254) | 0); }
      else if (d < 2.2 && Math.random() < 0.18 * (2.2 - d)) { H[i * 2] = 255; H[i * 2 + 1] = 1 + ((Math.random() * 254) | 0); }   // thrown clods
    }
  garden.blown = Math.max(garden.blown || 0, 0.06);       // the gardener will re-rake it
  garden.dirty = true;
}
export function stepWeather(dt) {
  const w = weather, T = WEATHERS[w.kind];
  w.t += dt;
  if (w.t > w.dur) setWeather(nextWeather());
  const ease = (k, rate) => { w[k] += (T[k] - w[k]) * Math.min(1, dt * rate); };
  ease("wind", 0.8); ease("rain", 0.9); ease("snow", 0.9); ease("fog", 0.7); ease("storm", 0.9); ease("cloud", 0.6);
  // The wind wanders in direction and comes in gusts.
  w.windA += (Math.sin(state.clock * 0.03) * 0.7 + 0.25 - w.windA) * dt * 0.1;
  w.windNow = w.wind * (0.72 + 0.28 * Math.sin(state.clock * 0.9) * Math.sin(state.clock * 0.37 + 1));
  // Slow consequences.
  // They build up only while the current weather brings them, then clear visibly over half a
  // minute or so: puddles shrink and the sand dries in patches, snow melts back into drifts
  // (and its meltwater wets the sand), the shore ice breaks into floes before it goes.
  const cover0 = w.cover;
  w.cover = clamp(w.cover + (T.snow > 0 ? w.snow * 0.07 : -0.03) * dt, 0, 1);
  const melt = Math.max(0, cover0 - w.cover);
  w.wet = clamp(w.wet + (T.rain > 0 ? w.rain * 0.12 : -0.032) * dt + melt * 0.9, 0, 1);
  w.ice = clamp(w.ice + (T.snow > 0 ? w.snow * 0.028 : w.iceBreak > 0.6 ? -0.035 : 0) * dt, 0, 1);   // ~45 s of snow to freeze the whole pond
  w.iceBreak = clamp((w.iceBreak || 0) + (T.snow > 0 ? -0.2 : 0.06) * dt, 0, 1);
  if (w.ice <= 0) w.iceBreak = 0;
  if (T.storm < 0.5) w.flashQ = 0;
  // Lightning in a storm.
  w.flash *= Math.exp(-dt * 7);
  if (w.flashQ && state.clock > w.flashQ) { w.flash = Math.max(w.flash, 0.75); w.flashQ = 0; }
  if (w.storm > 0.6 && (w.nextBolt -= dt) <= 0) { lightning(); w.nextBolt = rand(3, 9); }
  // Clouds and the surface current go with the wind.
  const [wx, wy] = windVec(), cs = 40 + 160 * w.windNow;
  w.cloudX += wx * cs * dt; w.cloudY += wy * cs * dt;
  DRIFT.x = 3 + wx * w.windNow * 28; DRIFT.y = 1.2 + wy * w.windNow * 28;
  cellMat.uniforms.uDrift.value.set(DRIFT.x, -DRIFT.y);
  // Patterns move by accumulated distance, never speed x time, so they glide on smoothly as the wind changes.
  const wo = cellMat.uniforms.uWo.value, wo2 = cellMat.uniforms.uWo2.value;
  wo.x += DRIFT.x * dt; wo.y -= DRIFT.y * dt;
  wo.z += wx * (60 + 120 * w.windNow) * dt; wo.w -= wy * (60 + 120 * w.windNow) * dt;
  wo2.x += (60 + 200 * w.windNow) * dt; wo2.y += (20 + 50 * w.windNow) * dt;
  // Raindrops on the pond: the bigger ones make real ripples.
  let n = w.rain * 14 * dt; n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const [x, y] = toWorld(rand(0, view.W), rand(0, view.H));
    if (Math.abs(x) < view.WX / 2 && y > -view.WY / 2 && y - shoreY(x) < -40 - Math.pow(w.ice, 1.3) * (view.WY + 200)) ripple(x, y, rand(0.1, 0.3) * (0.6 + 0.7 * w.rain));
  }
  const u = cellMat.uniforms;
  u.uWx.value.set(wx, wy, w.windNow, w.rain);
  u.uWy.value.set(w.snow, w.fog, w.wet, w.cover);
  u.uWz.value.set(w.flash, w.ice, w.storm, w.cloud);
  u.uCloudOff.value.set(w.cloudX, w.cloudY);
  u.uWm.value.x = w.iceBreak || 0; u.uWm.value.y = view.WY + 200;
  windOnSand(dt);
}

/* Wind moves the sand itself: the raked lines are slowly blown into wind ripples that
 * run across the wind and creep downwind. Once it has been calm for a while, the
 * gardener rakes the pattern back in (the sweep from west to east). */
let sandRow = 0;
function windOnSand(dt) {
  if (!garden.h) return;
  const w = weather, k = Math.max(0, w.windNow - 0.3);
  garden.blown = garden.blown || 0;
  if (k <= 0) {
    w.calmT = (w.calmT || 0) + dt;
    if (garden.blown > 0.05 && w.calmT > 12 && garden.restoreX < 0 && w.cover < 0.05) { garden.restoreX = 0; garden.blown = 0; }
    return;
  }
  w.calmT = 0;
  const [dx, dy] = windVec(), hw = garden.hw, hh = garden.hh, t = garden.texel, H = garden.h, M = garden.mask;
  if (!garden.expo || garden.expo.length !== hw * hh) {     // where the wind gets at the sand first
    garden.expo = new Float32Array(hw * hh);
    for (let iy = 0; iy < hh; iy++) for (let ix = 0; ix < hw; ix++) garden.expo[iy * hw + ix] = vnoise3((garden.HX0 + ix * t) * 0.004, (garden.HY0 - iy * t) * 0.004, 0.5);
  }
  const lam = 22, ph0 = state.clock * 1.6, fb = flowByte(Math.atan2(dx, dy));
  // A slice of rows per frame, so the work stays small.
  const rows = Math.max(1, Math.ceil(hh / 6));
  // Exposure spreads in patches: where it has reached, the sand turns quickly and cleanly into wind ripples.
  const e = garden.blown, a = clamp(0.25 + k * 0.5, 0, 0.6);
  for (let r = 0; r < rows; r++, sandRow = (sandRow + 1) % hh) {
    const iy = sandRow, wy = garden.HY0 - (iy + 0.5) * t;
    for (let ix = 0; ix < hw; ix++) {
      const i = iy * hw + ix;
      if (M[i]) continue;
      const wx = garden.HX0 + (ix + 0.5) * t;
      if (garden.expo[i] > e * 1.15) continue;
      const target = 127.5 + 127.5 * Math.cos(((wx * dx + wy * dy) / lam) * 6.2832 - ph0 + Math.sin(wx * 0.01 + wy * 0.02) * 1.5);
      H[i * 2] += (target - H[i * 2]) * a;
      H[i * 2 + 1] = fb;
    }
  }
  garden.blown = Math.min(1, garden.blown + k * dt * 0.035);   // ~40 s of strong wind to cover it all
  garden.dirty = true;
}
