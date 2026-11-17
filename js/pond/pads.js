import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js";
import { PAD_GEO, PAD_MAT, PETAL_IN, PETAL_MAT, PETAL_OUT, STAMEN, STAMEN_MAT, surfaceScene } from "../setup.js";
import { clamp, pads, rand, view } from "../world.js";
import { projects } from "../projects.js";

/* ---------------- pads ---------------- */
export function placePads() {
  for (const p of pads) surfaceScene.remove(p.group);
  pads.length = 0;
  const n = clamp(Math.round((view.WX * view.WY) / 330000), 3, 14);
  const m = Math.min(view.W, view.H);
  for (let tries = 0; pads.length < n && tries < 400; tries++) {
    const R = m * rand(0.055, 0.085);
    const x = rand(-0.5, 0.5) * view.WX * 0.94 - 40, y = rand(-0.5, 0.5) * view.WY * 0.94;
    if (y > view.WY / 2 - R - 90) continue;
    if (Math.hypot(x / view.W, y / view.H) < 0.22) continue;
    if (projects.some((p) => Math.hypot(p.hx - x, p.hy - y) < p.r * 2.4 + R * 1.2)) continue;
    if (pads.some((p) => Math.hypot(p.x - x, p.y - y) < (p.R + R) * 1.15)) continue;
    const group = new THREE.Group();
    const pad = new THREE.Mesh(PAD_GEO, PAD_MAT); pad.scale.setScalar(R); group.add(pad);
    if (Math.random() < 0.55) {
      const fl = new THREE.Group();
      fl.add(new THREE.Mesh(PETAL_OUT, PETAL_MAT), new THREE.Mesh(PETAL_IN, PETAL_MAT), new THREE.Mesh(STAMEN, STAMEN_MAT));
      fl.children[2].position.z = 0.15;
      fl.scale.setScalar(R * 0.42); fl.position.set(R * 0.25, -R * 0.2, R * 0.06);
      group.add(fl);
    }
    group.position.set(x, y, 4);
    group.rotation.z = rand(0, Math.PI * 2);
    surfaceScene.add(group);
    pads.push({ group, x, y, R, seed: rand(0, 9), wob: 0, spin: rand(-1, 1) * 0.02 });
  }
}
