import { toWorld, view } from "../world.js";

/* =====================================================================
 *  GARDEN: a karesansui (dry rock garden) on the pond's east shore, in the
 *  same world as the pond. The sand is a height map you rake; the cell
 *  pass reads its slope and draws each ridge with a line glyph that
 *  follows it. Rocks, moss, a stone lantern, the deck and the shore
 *  pebbles are 3D. Starlings are an instanced flock (boids on a spatial
 *  grid) whose shadows sweep the sand; the cursor scatters them.
 * ===================================================================== */

export const shoreY = (x) => view.GY0 + 40 * Math.sin(x * 0.003) + 22 * Math.sin(x * 0.011 + 1);
export const gardenCY = () => view.GY0 + view.GH / 2;          // the garden's middle (x = 0)
export const gardenTop = () => view.GY0 + view.GH;
export const deckH = () => 0;                                   // no deck: the sand runs to the edge
/** Is this screen point on the sand you can rake? */
export function overSandAt(sx, sy) {
  const [x, y] = toWorld(sx, sy);
  return y - shoreY(x) > 24 && y < gardenTop() - 16;
}
/** Is this screen point on land at all (shore, sand or deck)? */
export const onLandAt = (sx, sy) => { const [x, y] = toWorld(sx, sy); return y - shoreY(x) > -18; };

export const hash3i = (a, b, c) => {
  let n = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1440662683);
  n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
};
export function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let xf = x - xi, yf = y - yi, zf = z - zi;
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3i(xi + i, yi + j, zi + k);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), xf), L(c(0, 1, 0), c(1, 1, 0), xf), yf),
           L(L(c(0, 0, 1), c(1, 0, 1), xf), L(c(0, 1, 1), c(1, 1, 1), xf), yf), zf);
}

// Colour classes for the garden, in the shared palette.
export const C_ROCK = 24, C_MOSS = 25, C_MOSS2 = 26, C_DECK = 27, C_SEAM = 28, C_STONE = 29, C_LIGHT = 30, C_PEBBLE = 31, C_RAKE = 19;
