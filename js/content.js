/* ===================================================================
 *  EDIT ME. Your name, and the projects that float on the pond.
 *    id       short name; also the page link, e.g. …#rooftop-arena
 *    kind     "pad" (a lily pad), or "candle", "lantern", "boat", "ema"
 *    url      where "open project" goes; "" hides the button
 *    example  true shows a reminder in the panel; delete it on real entries
 *  Ten or so entries fit comfortably.
 * =================================================================== */
const SITE = { name: "AL", role: "" };
/* The garden north of the pond is the about section. These lines are written
 * into the sand inside a frame; keep them under about 46 characters. */
export const ABOUT_TITLE = "about this portfolio";
export const ABOUT = [
  "This portfolio is a place, not a page.",
  "",
  "Everything you see is a real 3D scene, drawn",
  "live in text characters on your graphics card.",
  "Nothing is a picture: fish, rocks and ripples",
  "are meshes turned into glyphs every frame.",
  "",
  "The pond holds the work. Each titled lily pad",
  "is a project; click one to read about it.",
  "The koi are just koi. Feed them.",
  "",
  "This garden is the quiet part. Draw in the sand.",
  "",
  "WASD or joystick to move. Scroll or pinch to zoom.",
  "Weather comes and goes; keys 1-6 call it up.",
  "The dials turn the hours and seasons; drag them.",
];
export const PROJECTS = [
  {
    id: "koi-pond", title: "ASCII Koi Pond", year: "2026", role: "Design · code", kind: "pad", url: "",
    summary: "This page. Each fish is a real 3D mesh laid along a 24-joint backbone, rendered at two samples per character cell and turned into coloured text on the GPU. Ripples refract what is under them, food floats on a current, and 19 varieties swim, glide, school and startle.",
    tags: ["three.js", "GLSL", "simulation", "procedural animation"],
  },
  { id: "voxel-path-tracer", title: "Real-Time Voxel Path Tracer", year: "2025", role: "Code", kind: "pad", url: "https://github.com/Eukyrios/Real-Time-Voxel-Path-Tracer",
    summary: "A Monte Carlo path tracer written from scratch in C++. It loads voxel scenes exported as glTF, fires jittered rays through every pixel with a configurable bounce depth, gathers light from emissive surfaces, and writes the image while a console bar shows progress and time remaining.",
    tags: ["C++", "CMake", "path tracing", "glTF"] },
  { id: "my-torch", title: "my_torch", year: "2026", role: "Code", kind: "pad", url: "https://github.com/Eukyrios/my_torch",
    summary: "A neural-network library written from scratch in C++20, with no PyTorch or NumPy. Its companion analyzer reads chess positions in FEN and tells check, checkmate or neither: the chosen network (769-128-64-5, with dropout, L2 and early stopping, trained on Lichess games) scores 83.9% on 20,000 positions it never saw. Networks save to resumable files, and CI keeps test coverage above 85%.",
    tags: ["C++20", "neural networks", "chess", "Criterion"] },
  { id: "sensai", title: "SensAI", year: "2026", role: "Code", kind: "pad", url: "https://github.com/Eukyrios/SensAI",
    summary: "A Japanese tutor that runs entirely on your own machine through Ollama, so nothing leaves it. Each turn passes through guardrails, a three-step router, a ReAct agent loop with tools and retrieval, and a memory of your mistakes with spaced-repetition cards, all kept in SQLite. Hardening the guardrails took adversarial tests from 8 of 27 attacks blocked to 19.",
    tags: ["Python", "Ollama", "multi-agent", "RAG", "SQLite"] },
  { id: "skillkit", title: "SkillKit", year: "2026", role: "Code", kind: "pad", url: "https://github.com/Eukyrios/SkillKit",
    summary: "A Roblox toolkit for building combat abilities as data instead of code. A skill is a graph of nodes (hitboxes, projectiles, grabs, branches, loops, counters, VFX and keyframe animation) that a server runtime executes. A Studio plugin edits them with timeline and flow views, live preview on dummies, and shareable SK1 codes.",
    tags: ["Luau", "Roblox", "Rojo", "Studio plugin"] },
  { id: "nfl-analyzer", title: "NFL Analyzer", year: "2026", role: "Code", kind: "pad", url: "https://github.com/Eukyrios/NFL-analyzer",
    summary: "A local app for exploring NFL Big Data Bowl tracking data: 122 games and 8,557 dropback plays at 10 frames a second, imported into an 8.3-million-row SQLite table. Pick a play from a game timeline and watch all 22 players move on an animated field, coloured by role, with trails, speed on hover, and the formation and coverage.",
    tags: ["Rust", "SQLite", "egui", "data visualisation"] },
  { id: "loadout-roulette", title: "Loadout Roulette", year: "2026", role: "Code", kind: "pad", url: "https://github.com/Eukyrios/loadout-roulette",
    summary: "A three-stage loadout randomiser for Delta Force: Hawk Ops, built like a small casino. A 3D roulette wheel picks the difficulty, a seven-reel slot machine rolls the map, operator, weapon and kit, and a pair of dice sets the spending caps. Rolls are seeded so a link reproduces them, and every sound is synthesised live with Web Audio.",
    tags: ["TypeScript", "React", "three.js", "Web Audio"] },
  { id: "cartepro", title: "CartePro", year: "2026", role: "Code", kind: "pad", url: "https://github.com/Eukyrios/CartePro",
    summary: "A working demo of an employer-funded payment card. Employers credit salaries, employees pay partner merchants with a QR code that expires after five minutes, and admins approve partners, issue credits in bulk and reverse transactions. Every action lands in an append-only audit log that exports as a signed, verifiable hash chain.",
    tags: ["Next.js", "Flask", "PostgreSQL", "JWT"] },
  { id: "epitech-filter", title: "Epitech 4th-Year Filter", year: "2026", role: "Code", kind: "pad", url: "https://github.com/Eukyrios/Epitech-4th-year-filter",
    summary: "A one-page tool for choosing an Epitech 4th-year exchange. It lists all 138 partner universities and filters them by extra fees, minimum GPA, country safety (Global Peace Index) and cost of living (Numbeo), with want / don't-want toggles, grouping by country or specialisation, and filters you can save as JSON.",
    tags: ["HTML", "JavaScript", "data"] },
  { id: "voxelcube", title: "VoxelCube", year: "", role: "Code", kind: "pad", url: "https://github.com/Eukyrios/VoxelCube",
    summary: "A multiplayer voxel world on the Voxelize framework, reworked to render far. Stock Voxelize draws one mesh per chunk slice and material, thousands of draw calls at 24 chunks; here each material is one batched multi-draw, and greedy quads re-merge across 2x2-chunk regions, so a flat 32x32 field becomes a single quad. Cave culling floods a visibility graph from the camera so hidden caves are never drawn, and Distant Horizons-style LOD keeps real terrain shapes past the view distance at 2, 4 then 8-block detail. The mesher, lighting and culling run in Rust compiled to WebAssembly, within a 3 ms frame budget.",
    tags: ["Rust","WebAssembly","three.js","greedy meshing","LOD","cave culling"] },
  { id: "concat", title: "Concat", year: "2026", role: "Contributor (fork)", kind: "pad", url: "https://github.com/Eukyrios/Concat",
    summary: "My fork of Concat, a free, local-first, cross-platform CapCut replacement written in Rust. What I added: audio grouping, splitting a clip's audio stream from its video, and importing media straight from a YouTube link. Also a Frames shelf that crops media to a shape; triangle, parallelogram and trapezoid masks that keep an even outline when stretched; one-sided sticker resizing; a shared eyedropper and colour-picker fixes; an editable Details panel with a colour, transparent or blurred background; and the Slint UI moved into its own crate so Rust-only edits rebuild without recompiling it.",
    tags: ["Rust", "Slint", "WGSL", "video editing"] },
  { id: "raytracer", title: "Raytracer", year: "2026", role: "Team of 4", kind: "pad", url: "https://github.com/Eukyrios/raytracer-mirror",
    summary: "A plugin-based ray tracer in C++, built as a team of four. Scenes are described in config files; lights, materials and shapes load as plugins behind shared interfaces, and a live window switches with Tab between a surface-normal view and the full render. My part: a BVH that speeds up scenes with many shapes, a multithreaded image scheduler, quaternion camera rotation with keyboard and mouse movement, and the hit-record structure behind every intersection.",
    tags: ["C++", "CMake", "BVH", "multithreading", "SFML"] },
];
