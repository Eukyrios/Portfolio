import { cellMat } from "./setup.js";
import { $, clamp, view } from "./world.js";
import { garden } from "./garden/scene.js";
import { SEASON_INNER, dayDial, seasonDial } from "./ui/dials.js";

/* ---------------- time of day and seasons ---------------- */
// Two dials whose hands turn on their own (a day passes in 90 seconds, a year in 8 minutes)
// and can be set by hand: point at the hour or season you want. They start at the visitor's own time and date.
// sky.year: 0 = start of spring, 0.25 summer, 0.5 autumn, 0.75 winter.
const DAY_SECONDS = 90, YEAR_SECONDS = 480;     // a day in a minute and a half, a year in 8 minutes
const now0 = new Date(), doy = (now0 - new Date(now0.getFullYear(), 0, 0)) / 864e5;
export const sky = { hour: now0.getHours() + now0.getMinutes() / 60, year: (((doy - 79) / 365) % 1 + 1) % 1, night: 0, shadow: [-0.76, 0.65], season: [0, 0, 1, 0], held: 0 };
const SEASONS = ["spring", "summer", "autumn", "winter"];
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export function updateSky(dt = 0) {
  // Both dials turn on their own unless a hand is on one.
  if (sky.held <= 0) { sky.hour = (sky.hour + dt * 24 / DAY_SECONDS) % 24; sky.year = (sky.year + dt / YEAR_SECONDS) % 1; }
  else sky.held -= dt;
  const h = sky.hour, y = sky.year;
  // How much of each season: smooth cosine weights round the year, so the change is gradual.
  const sw = [0, 1, 2, 3].map((i) => Math.max(0, Math.cos((y - (i * 0.25 + 0.125)) * 2 * Math.PI)) ** 2);
  const sum = sw.reduce((a, b) => a + b, 0);
  sky.season = sw.map((v) => v / sum);
  // The sun: higher and up longer in summer, low and brief in winter.
  const el = 0.72 * Math.sin(((h - 6) / 12) * Math.PI) + 0.28 * Math.sin(y * 2 * Math.PI);
  // Light: one continuous blend from night through dusk and golden light to full day.
  const NIGHT = [0.38, 0.44, 0.66], DUSK = [0.66, 0.55, 0.8], GOLD = [1.0, 0.8, 0.6], DAY = [1, 1, 1];
  let tint = mix3(NIGHT, DUSK, sstep(-0.4, -0.08, el));
  tint = mix3(tint, GOLD, sstep(-0.12, 0.06, el));
  tint = mix3(tint, DAY, sstep(0.05, 0.38, el));
  sky.night = sstep(-0.05, -0.35, el);
  // Shadows point away from the sun and stretch when it is low; faint ones by moonlight.
  // Their strength passes through nothing at twilight, so the swap from sun to moon is unseen.
  const day = el > 0, th = ((day ? h : h - 12) - 12) / 6 * (Math.PI / 2), e = Math.max(Math.abs(el), 0.12);
  const len = clamp(0.55 / e, 0.6, 3.2);
  sky.shadow = [-Math.sin(th) * len, -Math.cos(th) * len];   // the shadow-sampling offset (grid, y up)
  const u = cellMat.uniforms;
  u.uSky.value.set(tint[0], tint[1], tint[2], sky.night);
  u.uSun.value.x = day ? sstep(0, 0.3, el) * 0.9 + 0.1 * sstep(0, 0.05, el) : 0.32 * sstep(0, -0.35, el);
  u.uMoon.value.set(view.W * 0.62, view.H * 0.66, sky.night, 0);   // the moon's glint sits where the viewer would see it
  u.uSeason.value.set(...sky.season);
  const lan = garden.built.filter((g) => !g.rock);
  u.uLantern.value.set(lan[0]?.cx ?? 1e6, lan[0]?.cy ?? 0, lan[1]?.cx ?? 1e6, lan[1]?.cy ?? 0);
  // The dials.
  dayDial.hand.rotation.z = -((h - 12) * 15) * Math.PI / 180;           // noon straight up, midnight straight down
  const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60), hm = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  $("sky-time").textContent = hm;
  $("sky").setAttribute("aria-valuenow", h.toFixed(2)); $("sky").setAttribute("aria-valuetext", hm);
  seasonDial.hand.rotation.z = -y * Math.PI * 2;                       // spring top right, then summer, autumn, winter
  // Near the turn of a season (b), the old season (A) hands over to the new one (B).
  const bnd = Math.round(y * 4), A = (bnd + 3) % 4, B = bnd % 4, k = sstep(-0.12, 0.12, y * 4 - bnd);
  seasonDial.emblems.forEach((e, i) => {
    const s1 = i === A ? 1 - k : i === B ? k : 0;
    e.scale.setScalar(Math.max(0.001, sstep(0.35, 1, s1) * 0.98));   // one goes before the other comes
    e.rotation.z = (i === 2 ? 0.2 : 0) + (i === B ? (1 - k) * -0.8 : k * 0.8);   // the old one turns away as it shrinks; the new turns in
  });
  const fu = seasonDial.faceMat.uniforms;
  fu.uA.value.set(...SEASON_INNER[A]); fu.uB.value.set(...SEASON_INNER[B]); fu.uK.value = k;
  dayDial.draw(); seasonDial.draw();
  const si = Math.floor(y * 4) % 4, early = (y * 4) % 1 < 0.33 ? "early " : (y * 4) % 1 > 0.66 ? "late " : "";
  $("season-name").textContent = early + SEASONS[si];
  $("season").setAttribute("aria-valuenow", y.toFixed(3)); $("season").setAttribute("aria-valuetext", early + SEASONS[si]);
}
