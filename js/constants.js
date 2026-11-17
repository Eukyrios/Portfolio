/* ------------------------------------------------------------------ *
 *  1. Every fish is a real 3D mesh (lofted body + fins), bent by a
 *     travelling wave in the vertex shader so it swims.
 *  2. Fish render into a tiny target (2x2 samples per character cell),
 *     then the surface (pads, food, splashes) renders on top of them.
 *     Red = light, green = colour class, blue = depth, alpha = hit.
 *  3. A cell pass turns each cell into a glyph + colour, adding water,
 *     ripple wave packets, refraction and shadows.
 *  4. A screen pass stamps the glyph from a font atlas into every cell.
 * ------------------------------------------------------------------ */

export const ATLAS = " .,:-=+*#%@~oO'|/\\";   // 0..10 light ramp, then water glyphs
export const G_DASH = 4, G_TILDE = 11, G_TICK = 14, G_BAR = 15, G_SLASH = 16, G_BACK = 17;
// Drawn (not typed) glyphs after printable ASCII: thin lines that join across cells, at a third, half and two thirds.
export const L_BASE = ATLAS.length + 95, L_HT = L_BASE, L_HM = L_BASE + 1, L_HB = L_BASE + 2, L_VL = L_BASE + 3, L_VM = L_BASE + 4, L_VR = L_BASE + 5, L_DU = L_BASE + 6, L_DD = L_BASE + 7;
export const RAMP_TOP = 10;
export const MAX_DEPTH = 200;
export const NJ = 24;                                // backbone joints per fish
export const BIG_RIPPLES = 16, SMALL_RIPPLES = 32, NR = BIG_RIPPLES + SMALL_RIPPLES;
export const WAVE_SPEED = 150;                       // px/s, shared by shader and food physics
export const DRIFT = { x: 3, y: 1.2 };                // surface current, world px/s (y up)
export const FONT = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';

export const PALETTE = [
  [0, 0, 0],          // 0 none
  [0.96, 0.94, 0.89], // 1 white
  [1.00, 0.36, 0.17], // 2 hi (red-orange)
  [0.40, 0.45, 0.50], // 3 sumi (black, lifted so it reads on dark water)
  [1.00, 0.78, 0.32], // 4 gold
  [0.76, 0.86, 0.88], // 5 fin
  [0.27, 0.56, 0.31], // 6 lily pad
  [0.17, 0.38, 0.22], // 7 pad vein
  [1.00, 0.60, 0.80], // 8 petal
  [1.00, 0.86, 0.34], // 9 stamen
  [0.82, 0.60, 0.36], // 10 food
  [0.52, 0.66, 0.80], // 11 blue
  [1.00, 0.88, 0.42], // 12 yellow
  [1.00, 0.60, 0.28], // 13 orange
  [0.74, 0.53, 0.33], // 14 brown (chagoi)
  [0.62, 0.67, 0.72], // 15 grey (soragoi)
  [0.78, 0.96, 1.00], // 16 splash
  [0.92, 0.95, 0.97], // 17 platinum
  [1.00, 0.80, 0.52], // 18 lantern paper
  [0.68, 0.48, 0.30], // 19 wood
  [0.62, 0.24, 0.18], // 20 lantern roof
  [0.97, 0.95, 0.88], // 21 boat paper
  [0.86, 0.74, 0.55], // 22 pale ema wood
  [0.95, 0.12, 0.10], // 23 ema red
  [0.36, 0.34, 0.32], // 24 garden rock
  [0.30, 0.45, 0.20], // 25 moss
  [0.20, 0.32, 0.14], // 26 moss, darker
  [0.52, 0.37, 0.24], // 27 deck wood
  [0.30, 0.21, 0.14], // 28 deck seam
  [0.52, 0.50, 0.47], // 29 stone lantern
  [0.95, 0.62, 0.25], // 30 lantern light
  [0.33, 0.32, 0.31], // 31 pebbles
];
while (PALETTE.length < 32) PALETTE.push([0, 0, 0]);

/* Species: geometry, pattern type, size, and how they swim. */
const DEF = { size: 1, cruise: 0.28, chase: 0.9, turn: 1.2, glide: 1, freq: 1, long: 0, hover: 0.025, school: 0, cm: 60, stiff: 2.5, bend: 0.2, shy: 0 };
export const SPECIES = [
  { id: "kohaku", name: "kohaku", geo: "koi", type: 0 },
  { id: "sanke", name: "taishō sanke", geo: "koi", type: 1 },
  { id: "showa", name: "shōwa", geo: "koi", type: 2 },
  { id: "ogon", name: "yamabuki ogon", geo: "koi", type: 3 },
  { id: "tancho", name: "tanchō", geo: "koi", type: 4 },
  { id: "asagi", name: "asagi", geo: "koi", type: 5 },
  { id: "kigoi", name: "kigoi", geo: "koi", type: 6 },
  { id: "hariwake", name: "hariwake", geo: "koi", type: 7 },
  { id: "shiro-utsuri", name: "shiro utsuri", geo: "koi", type: 8 },
  { id: "hi-utsuri", name: "hi utsuri", geo: "koi", type: 9 },
  { id: "bekko", name: "shiro bekko", geo: "koi", type: 10 },
  { id: "chagoi", name: "chagoi", geo: "koi", type: 11, size: 1.18, chase: 1.1, cm: 78 },
  { id: "soragoi", name: "soragoi", geo: "koi", type: 12, size: 1.1, cm: 70 },
  { id: "goshiki", name: "goshiki", geo: "koi", type: 13 },
  { id: "kujaku", name: "kujaku", geo: "koi", type: 14 },
  { id: "butterfly", name: "butterfly koi", geo: "butterfly", type: 15, types: [15, 3, 0, 6, 14], size: 0.82, long: 1, glide: 1.4, cm: 55, stiff: 2 },
  { id: "comet", name: "comet goldfish", geo: "comet", type: 16, size: 0.42, cruise: 0.5, chase: 1.3, turn: 2.2, glide: 0.6, freq: 1.3, long: 0.6, hover: 0.01, cm: 22, stiff: 3, shy: 0.6 },
  { id: "shubunkin", name: "shubunkin", geo: "comet", type: 17, size: 0.42, cruise: 0.5, chase: 1.3, turn: 2.2, glide: 0.6, freq: 1.3, long: 0.6, hover: 0.01, cm: 20, stiff: 3, shy: 0.6 },
  { id: "orfe", name: "golden orfe", geo: "orfe", type: 18, size: 0.36, cruise: 0.7, chase: 1.6, turn: 2.8, glide: 0.4, freq: 1.5, hover: 0, school: 5, cm: 28, stiff: 4, bend: 0.24, shy: 1 },
].map((s) => ({ ...DEF, ...s }));
export const KOI_IDS = SPECIES.filter((s) => s.geo === "koi").map((s) => s.id);
export const PATTERN_NAMES = { 15: "platinum", 3: "ogon", 0: "kohaku", 6: "kigoi", 14: "kujaku" };
