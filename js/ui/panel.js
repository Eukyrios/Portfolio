import { state } from "../state.js";
import { FONT } from "../constants.js";
import { reduce } from "../setup.js";
import { $, clamp, ripple, splash, view } from "../world.js";
import { SCRAMBLE, projects, toAscii, visCenter } from "../projects.js";
import { flyTo } from "./camera.js";

/* ---------------- project panel ---------------- */
const panel = $("panel");
let returnFocus = null;
export function openProject(p) {
  if (!p) return;
  if (state.openProj !== p) {
    state.openProj = p;
    p.decodeT = state.clock;
    ripple(p.x, p.y, 0.8, true);
    splash(p.x, p.y, 6, 0.7);
  }
  if (panel.hidden) returnFocus = document.activeElement;
  panel.hidden = false;
  renderPanel(p);
  panel.querySelector('[data-act="close"]').focus({ preventScroll: true });
  document.querySelectorAll("#nav button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.id === p.id)));
  // Bring it into view, to the left of the panel (or above it on a phone).
  if (view.W > 640) flyTo(visCenter(p)[0], visCenter(p)[1], 0.5 - Math.min(190, view.W * 0.2) / view.W, 0.5); else flyTo(visCenter(p)[0], visCenter(p)[1], 0.5, 0.28);
  if (location.hash.slice(1) !== p.id) location.hash = p.id;
}
function closeProject(keepHash = false) {
  if (!state.openProj) return;
  state.openProj = null;
  panel.hidden = true;
  document.querySelectorAll("#nav button").forEach((b) => b.setAttribute("aria-current", "false"));
  if (!keepHash) { try { history.replaceState(null, "", location.pathname + location.search); } catch { location.hash = ""; } }
  returnFocus?.focus?.({ preventScroll: true });
}
const stepProject = (d) => openProject(projects[(projects.indexOf(state.openProj) + d + projects.length) % projects.length]);
panel.addEventListener("click", (e) => {
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (act === "close") closeProject();
  else if (act === "prev") stepProject(-1);
  else if (act === "next") stepProject(1);
});
addEventListener("resize", () => { if (state.openProj) renderPanel(state.openProj); });

/* The panel, drawn in characters: a +-| frame, the title underlined with =,
 * text wrapped to the frame, [buttons] in the text. It scrambles in like the
 * titles on the water. */
let panelCharW = 0;
function panelColumns() {
  if (!panelCharW) {
    const c = document.createElement("canvas").getContext("2d");
    c.font = `600 13px ${FONT}`;
    panelCharW = c.measureText("M").width || 7.8;
  }
  const avail = view.W <= 640 ? view.W - 24 : Math.min(470, view.W * 0.42);
  return clamp(Math.floor(avail / panelCharW), 30, 54);
}
function wrapWords(text, w) {
  const out = []; let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= w) cur += " " + word;
    else { out.push(cur); cur = word; }
    while (cur.length > w) { out.push(cur.slice(0, w)); cur = cur.slice(w); }
  }
  if (cur) out.push(cur);
  return out;
}
let panelAnim = 0;
function renderPanel(p) {
  const C = panelColumns(), inner = C - 4, n = projects.length;
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const two = (k) => String(k).padStart(2, "0");
  const B = (t) => `<span class="b">${esc(t)}</span>`;
  const T = (t, cls = "") => `<span class="sc ${cls}">${esc(t)}</span>`;
  const rows = [];
  const row = (html, len) => rows.push(B("| ") + html + " ".repeat(Math.max(0, inner - len)) + B(" |"));
  const blank = () => row("", 0);
  const text = (str, cls) => wrapWords(str, inner).forEach((l) => row(T(l, cls), l.length));
  // Top edge: index on the left, close on the right.
  const idx = `[ ${two(p.i + 1)} / ${two(n)} ]`, close = "[ x ]";
  rows.push(B("+-") + `<span class="dm">${idx}</span>` + B("-".repeat(Math.max(1, C - 4 - idx.length - close.length))) +
    `<button class="tx" type="button" data-act="close" aria-label="Close project">${close}</button>` + B("-+"));
  blank();
  const title = toAscii(p.title).toUpperCase();
  wrapWords(title, inner).forEach((l) => row(T(l, "ti"), l.length));
  const ul = "=".repeat(Math.min(title.length, inner));
  row(T(ul, "ac"), ul.length);
  text(toAscii([p.year, p.role].filter(Boolean).join(" / ")), "ac");
  blank();
  text(toAscii(p.summary), "");
  if (p.tags && p.tags.length) { blank(); text(p.tags.map((t) => `[${toAscii(t)}]`).join(" "), "dm"); }
  if (p.example) { blank(); text("! Example entry. Replace it in the PROJECTS list at the top of the script.", "dm"); }
  blank();
  // Buttons, as bracketed text.
  const prev = "[ < prev ]", next = "[ next > ]", open = "[ open project -> ]";
  const pb = `<button class="tx" type="button" data-act="prev" aria-label="Previous project">${esc(prev)}</button>`;
  const nb = `<button class="tx" type="button" data-act="next" aria-label="Next project">${esc(next)}</button>`;
  const ob = p.url ? `<a class="tx" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(open)}</a>` : "";
  const navLen = prev.length + 2 + next.length;
  if (p.url && navLen + 2 + open.length <= inner) row(pb + "  " + nb + " ".repeat(inner - navLen - open.length) + ob, inner);
  else { row(pb + "  " + nb, navLen); if (p.url) row(ob, open.length); }
  rows.push(B("+" + "-".repeat(C - 2) + "+"));
  panel.setAttribute("aria-label", p.title);
  $("panel-text").innerHTML = rows.join("\n");
  // Scramble in.
  cancelAnimationFrame(panelAnim);
  if (reduce) return;
  const spans = [...panel.querySelectorAll(".sc")].map((el, k) => ({ el, final: el.textContent, k }));
  const t0 = performance.now();
  const tick = (now) => {
    const t = now - t0;
    let busy = false;
    for (const s of spans) {
      let out = "";
      for (let i = 0; i < s.final.length; i++) {
        const ch = s.final[i];
        if (ch === " " || t > 80 + s.k * 25 + i * 6) out += ch;
        else { out += SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)]; busy = true; }
      }
      s.el.textContent = out;
    }
    if (busy) panelAnim = requestAnimationFrame(tick);
  };
  panelAnim = requestAnimationFrame(tick);
}
addEventListener("keydown", (e) => {
  if (!state.openProj) return;
  if (e.key === "Escape") closeProject();
  else if (e.key === "ArrowRight") stepProject(1);
  else if (e.key === "ArrowLeft") stepProject(-1);
});
addEventListener("hashchange", () => {
  const p = projects.find((q) => q.id === location.hash.slice(1));
  if (p) openProject(p); else closeProject(location.hash === "#garden" || location.hash === "#pond");
});

const nav = $("nav");
nav.innerHTML = projects.map((p) =>
  `<button type="button" data-id="${p.id}" aria-current="false" aria-label="${String(p.i + 1).padStart(2, "0")} ${p.title.replace(/"/g, "")}" title="${p.title.replace(/"/g, "")}">${String(p.i + 1).padStart(2, "0")}</button>`).join("");
nav.querySelectorAll("button").forEach((b) => {
  const p = projects.find((q) => q.id === b.dataset.id);
  b.addEventListener("click", () => openProject(p));
  b.addEventListener("pointerenter", () => { state.navHover = p; p.decodeT = state.clock; });
  b.addEventListener("pointerleave", () => { if (state.navHover === p) state.navHover = null; });
  b.addEventListener("focus", () => { state.navHover = p; });
  b.addEventListener("blur", () => { if (state.navHover === p) state.navHover = null; });
});
