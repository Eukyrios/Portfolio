// Every module, in the order the page used to run them (event listeners register in this order).
import "./content.js";
import "./constants.js";
import "./shaders/common.js";
import "./shaders/fish.js";
import "./shaders/surface.js";
import "./shaders/cell.js";
import "./shaders/screen.js";
import "./geometry.js";
import "./setup.js";
import "./world.js";
import "./pond/fish.js";
import "./pond/pads.js";
import "./pond/food.js";
import "./pond/swimming.js";
import "./ui/tag.js";
import "./resize.js";
import "./projects.js";
import "./ui/panel.js";
import "./ui/camera.js";
import "./input.js";
import "./garden/terrain.js";
import "./shaders/bird.js";
import "./garden/scene.js";
import "./garden/sand.js";
import "./garden/birds.js";
import "./garden/garden.js";
import "./theme.js";
import { state } from "./state.js";
import { KOI_IDS, SPECIES } from "./constants.js";
import { camera, cellMat, cellScene, cellT, quadCam, reduce, renderer, screenScene, shadeT, surfaceScene } from "./setup.js";
import { clamp, fish, pick, view } from "./world.js";
import { addFish, addSpecies } from "./pond/fish.js";
import { step } from "./pond/swimming.js";
import { tag, updateTag } from "./ui/tag.js";
import { resize } from "./resize.js";
import { drawLabels, hovered, projects, updateGlows, updateHover } from "./projects.js";
import { openProject } from "./ui/panel.js";
import { cam, drawMinimap, flyTo, updateCamera } from "./ui/camera.js";
import { gardenCY } from "./garden/terrain.js";
import { gScene } from "./garden/scene.js";
import { stepGarden } from "./garden/garden.js";
import { updateTheme } from "./theme.js";

/* ---------------- loop ---------------- */
function populate() {
  const byId = (id) => SPECIES.find((s) => s.id === id);
  // One of every kind (the orfe come as a school), in a random order.
  for (const sp of SPECIES.slice().sort(() => Math.random() - 0.5)) addSpecies(sp);
  // A butterfly koi in each of its patterns.
  const bf = byId("butterfly");
  const seen = new Set(fish.filter((f) => f.sp === bf).map((f) => f.mat.uniforms.uType.value));
  for (const t of bf.types) if (!seen.has(t)) addFish(bf, null, t);
  // Then plenty more koi, a few more goldfish and a second school of orfe.
  const more = clamp(Math.round((view.WX * view.WY) / 220000), 10, 20);
  for (let i = 0; i < more; i++) addSpecies(byId(pick(KOI_IDS)));
  for (const id of ["comet", "shubunkin", "comet", "orfe"]) addSpecies(byId(id));
}

async function start() {
  try { await Promise.race([document.fonts.load(`600 16px "JetBrains Mono"`), new Promise((r) => setTimeout(r, 1500))]); } catch {}
  resize();
  populate();
  state.introT0 = performance.now();
  if (location.hash === "#garden") { flyTo(0, gardenCY()); view.panX = cam.target.x; view.panY = cam.target.y; cam.target = null; updateTheme(); }
  const fromHash = projects.find((q) => q.id === location.hash.slice(1));
  if (fromHash) { openProject(fromHash); if (cam.target) { view.panX = cam.target.x; view.panY = cam.target.y; cam.target = null; } }
  let last = performance.now(), frameN = 0;
  const t0 = last;
  window.pondStarted = true;
  let failed = 0;
  const frame = (now) => {
    requestAnimationFrame(frame);
    try { render(now); } catch (e) { console.error(e); if (++failed === 1) window.pondFail?.("The pond hit an error: " + e.message); }
  };
  const render = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000) * (reduce ? 0.5 : 1);
    last = now; state.clock += dt;
    step(dt);
    stepGarden(dt);
    updateCamera(dt);
    updateHover();
    if (hovered) tag.hidden = true; else updateTag();
    drawLabels();
    updateGlows();
    if ((frameN = (frameN + 1) % 2) === 0) drawMinimap();
    cellMat.uniforms.uTime.value = state.clock;
    if (!reduce) cellMat.uniforms.uIntro.value = now - state.introT0;
    renderer.setRenderTarget(shadeT);
    renderer.clear();
    // Fish one at a time, deepest first, clearing depth in between: a fish
    // higher in the water always covers a lower one completely, even when
    // their bodies would cut into each other.
    for (const f of fish.slice().sort((a, b) => a.zs - b.zs || a.id - b.id)) {
      renderer.render(f.scene, camera);
      renderer.clearDepth();
    }
    // The surface (pads, food, splashes) always covers the fish.
    renderer.render(surfaceScene, camera);
    renderer.clearDepth();                         // the garden, and the birds over everything
    renderer.render(gScene, camera);
    renderer.setRenderTarget(cellT); renderer.render(cellScene, quadCam);
    renderer.setRenderTarget(null); renderer.render(screenScene, quadCam);
  };
  requestAnimationFrame(frame);
}
start();
