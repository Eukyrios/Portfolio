import { $, clamp, fish, project, scaleAt, view } from "../world.js";
import { pointer } from "../pond/swimming.js";

/* ---------------- hover label ---------------- */
export const tag = $("tag");
export function updateTag() {
  if (!pointer.inside) { tag.hidden = true; return; }
  let hit = null, hz = -Infinity;
  for (const f of fish) {
    const k = scaleAt(f.z);
    let prev = project(f.J[0].x, f.J[0].y, f.J[0].z);
    for (let i = 1; i < 16; i++) {
      const cur = project(f.J[i].x, f.J[i].y, f.J[i].z);
      const vx = cur[0] - prev[0], vy = cur[1] - prev[1], l2 = vx * vx + vy * vy || 1;
      const t = clamp(((pointer.x - prev[0]) * vx + (pointer.y - prev[1]) * vy) / l2, 0, 1);
      const d = Math.hypot(pointer.x - (prev[0] + vx * t), pointer.y - (prev[1] + vy * t));
      if (d < f.L * 0.13 * k + 6 && f.z > hz) { hit = f; hz = f.z; break; }
      prev = cur;
    }
  }
  if (!hit) { tag.hidden = true; return; }
  tag.hidden = false;
  tag.innerHTML = `${hit.name} <span>· ${hit.cm} cm</span>`;
  const w = tag.offsetWidth;
  tag.style.transform = `translate(${Math.min(pointer.x + 14, view.W - w - 8)}px, ${pointer.y + 16}px)`;
}
