import { state } from "./state.js";
import { clamp, view } from "./world.js";
import { tag } from "./ui/tag.js";
import { flyTo } from "./ui/camera.js";
import { gardenCY, shoreY } from "./garden/terrain.js";

/** The page's colours and controls follow where the view is: water or sand. */
function applyTheme(v) {
  if (v === state.currentView) return;
  state.currentView = v;
  document.documentElement.dataset.view = v;
  document.querySelectorAll("#views button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.view === v)));
  if (v === "garden") state.aboutDecodeT = state.clock;
  tag.hidden = true;
}
export function updateTheme() {
  const hh = view.H / 2 / view.zoom;
  const sand = clamp((view.panY + hh - shoreY(view.panX)) / (2 * hh), 0, 1);     // share of the screen that is garden
  if (sand > 0.45) applyTheme("garden"); else if (sand < 0.35) applyTheme("pond");
}
const goTo = (v) => (v === "garden" ? flyTo(0, gardenCY()) : flyTo(0, 0));
document.querySelectorAll("#views button").forEach((b) => b.addEventListener("click", () => {
  if (location.hash === "#" + b.dataset.view) goTo(b.dataset.view); else location.hash = b.dataset.view;
}));
addEventListener("hashchange", () => { if (location.hash === "#garden" || location.hash === "#pond") goTo(location.hash.slice(1)); });
