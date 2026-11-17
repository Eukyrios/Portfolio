import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js";
import { MAX_DEPTH, PATTERN_NAMES } from "../constants.js";
import { LIGHT } from "../shaders/common.js";
import { FISH_FRAG, FISH_VERT } from "../shaders/fish.js";
import { GEO } from "../geometry.js";
import { $, fish, halfH, halfW, pick, rand, view } from "../world.js";
import { initChain } from "./swimming.js";

/* ---------------- fish ---------------- */
const MAX_FISH = 64;
export function addFish(sp, near, forceType) {
  const geo = GEO[sp.geo];
  const type = forceType ?? (sp.types ? pick(sp.types) : sp.type);
  const L = view.base * sp.size * rand(0.78, 1.1);
  const mat = new THREE.ShaderMaterial({
    vertexShader: FISH_VERT, fragmentShader: FISH_FRAG, side: THREE.DoubleSide,
    uniforms: {
      uLight: { value: LIGHT }, uType: { value: type }, uSeed: { value: Math.random() * 10 }, uMaxDepth: { value: MAX_DEPTH },
      uPhase: { value: 0 }, uAmp: { value: 0.03 }, uFlap: { value: 0 }, uTurn: { value: 0 }, uFold: { value: 0 },
      uFlare: { value: 0 }, uLong: { value: sp.long }, uRoll: { value: 0 },
      uSpine: { value: [] }, uSeg: { value: 1 }, uL: { value: L },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const z = near ? near.z : -rand(40, MAX_DEPTH);
  const name = sp.types ? `${sp.name} (${PATTERN_NAMES[type]})` : sp.name;
  const f = {
    sp, mesh, mat, scene, L, z, id: fish.length + Math.random(), zTarget: z, name, cm: Math.round(sp.cm * L / (view.base * sp.size)),
    x: near ? near.x + rand(-1, 1) * L : rand(-0.8, 0.8) * halfW(z),
    y: near ? near.y + rand(-1, 1) * L : rand(-0.8, 0.8) * halfH(z),
    heading: near ? near.heading + rand(-0.3, 0.3) : rand(0, Math.PI * 2),
    cruise: L * sp.cruise * rand(0.8, 1.2), speed: L * sp.cruise,
    turn: 0, turnS: 0, phase: rand(0, 6), flap: rand(0, 6), amp: 0.03, roll: 0, elev: 0, flare: 0,
    wf: [rand(0.13, 0.3), rand(0.05, 0.12)], wp: [rand(0, 6), rand(0, 6)],
    zs: z, thrust: 0.5, thrustTarget: 0.6, fullT: 0, react: rand(0.5, 2.2), startleT: 0, fleeDir: 0, wallSide: 0, duck: 0,
    beatT: rand(0, 1.5), hoverT: 0, wakeT: 0, mode: "cruise", bd: Infinity, target: null,
  };
  initChain(f);
  fish.push(f);
  $("count").textContent = fish.length;
  return f;
}

export function addSpecies(sp) {
  if (fish.length >= MAX_FISH) return;
  if (sp.school) {
    const lead = addFish(sp);
    for (let i = 1; i < sp.school && fish.length < MAX_FISH; i++) addFish(sp, lead);
  } else addFish(sp);
}
