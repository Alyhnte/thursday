// Thursday promo: the office rebuilt in 3D from features/bot/office.scene.ts (same plan units,
// greys and hatching), flown through by a scripted drone camera, with her words on top.
import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";

THREE.ColorManagement.enabled = false;

const TL = await (await fetch("../timeline.json")).json();
const MARKS = (await (await fetch("../marks.json")).json()).marks;
const params = new URLSearchParams(location.search);
const LANG = params.get("lang") || "en";
// The office runs on its own clock, two seconds behind the film's: the call before it was cut
// shorter than the office's timings were written for. CUT is where the film leaves the call.
const CUT = 5.0;
const SHIFT = 2.0;
const later = (x) => (x >= CUT ? x + SHIFT : x);
const TLo = {
  ...TL,
  duration: TL.duration + SHIFT,
  lines: TL.lines.map((l) => ({ ...l, at: later(l.at), end: l.at >= CUT ? l.end + SHIFT : l.end })),
  shots: TL.shots.map((x) => ({ ...x, at: later(x.at) })),
  card: { ...TL.card, at: later(TL.card.at) },
};
const W = TL.size.w;
const H = TL.size.h;

// ---------------------------------------------------------------- small maths
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const mix3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const span = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (u) => 1 - (1 - u) ** 3;
const easeIn = (u) => u ** 3;
const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
const easeOutBack = (u, s = 1.7) => 1 + (s + 1) * (u - 1) ** 3 + s * (u - 1) ** 2;
const easeOutQuint = (u) => 1 - (1 - u) ** 5;
const smooth = (u) => u * u * (3 - 2 * u);
// a drone's sway: sums of slow sines, the same for the same seed
const sway = (t, seed) =>
  Math.sin(t * 0.9 + seed * 1.7) * 0.5 + Math.sin(t * 1.63 + seed * 3.1) * 0.3 + Math.sin(t * 2.71 + seed * 5.3) * 0.2;
// plan (x across, y back to front, z up) to three (X, Y up, Z front)
const V = (x, y, z) => new THREE.Vector3(x, z, y);

// ---------------------------------------------------------------- the plan (office.scene planOf)
const LW = 48;
const DC = 48;
const DEPTH = 100;
const WALL = 16;
const ROWS = 3;
const LANES = [26, 55, 84];
const LAP = { w: 3.4, d: 4.4, h: 10.2 };
const COORD = TL.coord;
const HELPERS = TL.helpers;
const columns = Math.ceil(HELPERS.length / ROWS);
const PW = LW + 10 + columns * 30;
const desks = HELPERS.map((bot, i) => {
  const column = Math.floor(i / ROWS);
  const row = i % ROWS;
  const x0 = LW + 10 + column * 30;
  const y0 = 10 + row * 29;
  return {
    bot, x0, y0, x1: x0 + 20, y1: y0 + 8,
    seat: [x0 + 6.5, y0 - 1.6], lane: LANES[row],
    tray: [x0 + 1.2, y0 + 1.4, x0 + 6.8, y0 + 6.6],
    laptop: [x0 + 16.8, y0 + 1.2], own: false,
  };
});
const own = { bot: COORD, x0: 16, y0: 15, x1: 40, y1: 23, seat: [23.5, 13.4], laptop: [36.6, 16.2], own: true };
const allDesks = [own, ...desks];
const deskOf = Object.fromEntries(allDesks.map((d) => [d.bot, d]));
const CENTER = [PW / 2, DEPTH / 2];

// ---------------------------------------------------------------- the look
const G = {
  0: "#ffffff", 25: "#fcfcfc", 50: "#f9f9f9", 75: "#f3f3f3", 100: "#ededed", 150: "#dfdfdf",
  200: "#cdcdcd", 250: "#b9b9b9", 300: "#afafaf", 450: "#767676", 650: "#393939", 700: "#303030", 750: "#282828",
};
const INK = "#0d0d0d";
const BRAND = "#0169cc";
// the sketch's three inks at their opacities over paper, and the lid's
const LINE = {
  shell: { color: "#545454", width: 2.9 },
  line: { color: "#7b7b7b", width: 2.2 },
  faint: { color: "#bcbcbc", width: 1.6 },
  lid: { color: "#343434", width: 2.2 },
};
const OVER = 1 / 6.5; // the sketch's overshoot is in screen px at the fit; this many plan units a px

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("gl"), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(0xffffff, 1);
renderer.sortObjects = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
scene.fog = new THREE.Fog(0xffffff, 320, 900);
const camera = new THREE.PerspectiveCamera(40, W / H, 0.5, 3000);

// Faces: a grey per vertex, hatched in world space where asked, fading to paper far away.
const faceMaterial = new THREE.ShaderMaterial({
  uniforms: { uGap: { value: 0.62 }, uFogNear: { value: 320 }, uFogFar: { value: 900 }, uOpacity: { value: 1 } },
  vertexShader: `
    attribute vec3 color; attribute float hatch;
    varying vec3 vColor; varying float vHatch; varying vec3 vWorld; varying vec3 vNormal;
    void main() {
      vColor = color; vHatch = hatch;
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz; vNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: `
    uniform float uGap; uniform float uFogNear; uniform float uFogFar; uniform float uOpacity;
    varying vec3 vColor; varying float vHatch; varying vec3 vWorld; varying vec3 vNormal;
    void main() {
      vec3 n = abs(vNormal);
      vec2 p = n.y > 0.5 ? vWorld.xz : (n.x > 0.5 ? vec2(vWorld.z, vWorld.y) : vWorld.xy);
      float s = (p.x * 0.79 - p.y * 0.61) / uGap;
      float d = abs(fract(s) - 0.5);
      float fw = max(fwidth(s), 1e-4);
      float half_ = 0.13;
      float cover = clamp((d - (0.5 - half_)) / fw + 0.5, 0.0, 1.0);
      cover = mix(cover, 2.0 * half_, smoothstep(0.25, 0.7, fw));
      vec3 c = mix(vColor, vec3(0.051), vHatch * cover);
      float dist = length(vWorld - cameraPosition);
      c = mix(c, vec3(1.0), smoothstep(uFogNear, uFogFar, dist));
      gl_FragColor = vec4(c, uOpacity);
    }`,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: 1.5,
  polygonOffsetUnits: 2,
});

// Hatched shade lying on the floor: under desks, along the walls' feet.
function decalMaterial(strength, gap = 0.5, soft = 0.12) {
  return new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: strength }, uGap: { value: gap }, uSoft: { value: soft }, uFade: { value: 1 } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vWorld;
      void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uStrength; uniform float uGap; uniform float uSoft; uniform float uFade;
      varying vec2 vUv; varying vec3 vWorld;
      void main() {
        float s = (vWorld.x * 0.88 + vWorld.z * 0.47) / uGap;
        float d = abs(fract(s) - 0.5);
        float fw = max(fwidth(s), 1e-4);
        float cover = clamp((d - 0.36) / fw + 0.5, 0.0, 1.0);
        cover = mix(cover, 0.28, smoothstep(0.25, 0.7, fw));
        float m = smoothstep(0.0, uSoft, vUv.x) * smoothstep(0.0, uSoft, 1.0 - vUv.x) * smoothstep(0.0, uSoft, vUv.y) * smoothstep(0.0, uSoft, 1.0 - vUv.y);
        float dist = length(vWorld - cameraPosition);
        float fog = 1.0 - smoothstep(320.0, 900.0, dist);
        gl_FragColor = vec4(vec3(0.051), uStrength * cover * m * uFade * fog);
      }`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
}

const lineMaterials = {};
for (const [key, { color, width }] of Object.entries(LINE)) {
  lineMaterials[key] = new LineMaterial({ color: new THREE.Color(color), linewidth: width, worldUnits: false, fog: true });
  lineMaterials[key].resolution.set(W, H);
}
const fadeLineMaterial = new LineMaterial({ vertexColors: true, linewidth: LINE.faint.width, worldUnits: false, fog: true });
fadeLineMaterial.resolution.set(W, H);

// ---------------------------------------------------------------- a piece: faces and lines
const hex = (h) => new THREE.Color(h);
class Part {
  constructor() {
    this.pos = []; this.nor = []; this.col = []; this.hat = [];
    this.segs = { shell: [], line: [], faint: [], lid: [] };
  }
  quad(a, b, c, d, fill, hatch = 0) {
    const [A, B, C, D] = [a, b, c, d].map((p) => V(...p));
    const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A)).normalize();
    const color = hex(fill);
    for (const P of [A, B, C, A, C, D]) {
      this.pos.push(P.x, P.y, P.z);
      this.nor.push(n.x, n.y, n.z);
      this.col.push(color.r, color.g, color.b);
      this.hat.push(hatch);
    }
    return this;
  }
  poly(list, fill, hatch = 0) {
    for (let i = 1; i < list.length - 1; i++) this.tri(list[0], list[i], list[i + 1], fill, hatch);
    return this;
  }
  tri(a, b, c, fill, hatch = 0) {
    const [A, B, C] = [a, b, c].map((p) => V(...p));
    const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A)).normalize();
    const color = hex(fill);
    for (const P of [A, B, C]) {
      this.pos.push(P.x, P.y, P.z);
      this.nor.push(n.x, n.y, n.z);
      this.col.push(color.r, color.g, color.b);
      this.hat.push(hatch);
    }
  }
  seg(a, b, over = 4.5, kind = "line") {
    const A = V(...a);
    const B = V(...b);
    const dir = new THREE.Vector3().subVectors(B, A);
    const len = dir.length() || 1;
    dir.divideScalar(len).multiplyScalar(over * OVER);
    this.segs[kind].push(A.x - dir.x, A.y - dir.y, A.z - dir.z, B.x + dir.x, B.y + dir.y, B.z + dir.z);
    return this;
  }
  // top, front (+y), side (+x, hatched: the side the light misses), then the three unseen at rest
  box([x0, y0, x1, y1, z0, z1], { fills = [G[0], G[75], G[100]], hatch = true, over = 4.5, kind = "line", back = G[25], edges = true } = {}) {
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], fills[0]);
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], fills[1]);
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], fills[2], hatch ? 0.2 : 0);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], back);
    this.quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], back);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], G[150]);
    if (edges) {
      const c = [
        [[x0, y0, z1], [x1, y0, z1]], [[x0, y0, z1], [x0, y1, z1]], [[x0, y1, z1], [x1, y1, z1]], [[x1, y0, z1], [x1, y1, z1]],
        [[x0, y1, z0], [x0, y1, z1]], [[x1, y1, z0], [x1, y1, z1]], [[x1, y0, z0], [x1, y0, z1]], [[x0, y0, z0], [x0, y0, z1]],
        [[x0, y1, z0], [x1, y1, z0]], [[x1, y0, z0], [x1, y1, z0]], [[x0, y0, z0], [x1, y0, z0]], [[x0, y0, z0], [x0, y1, z0]],
      ];
      for (const [a, b] of c) this.seg(a, b, over, kind);
    }
    return this;
  }
  build() {
    const group = new THREE.Group();
    if (this.pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
      g.setAttribute("hatch", new THREE.Float32BufferAttribute(this.hat, 1));
      group.add(new THREE.Mesh(g, faceMaterial));
    }
    for (const [kind, list] of Object.entries(this.segs)) {
      if (!list.length) continue;
      const g = new LineSegmentsGeometry();
      g.setPositions(list);
      const line = new LineSegments2(g, lineMaterials[kind]);
      line.computeLineDistances();
      group.add(line);
    }
    return group;
  }
}

// A piece that lands as the office builds itself: dropped from above, scaled about its foot.
const pieces = [];
function place(part, { land = 8.3, from = [0, 0], drop = 26, kind = "drop" } = {}) {
  const inner = part.build();
  const pivot = new THREE.Group();
  const foot = V(from[0], from[1], 0);
  pivot.position.copy(foot);
  inner.position.sub(foot);
  pivot.add(inner);
  scene.add(pivot);
  pieces.push({ pivot, foot, land, drop, kind });
  return pivot;
}
function decal(x0, y0, x1, y1, z, material, { land = 8.3 } = {}) {
  const g = new THREE.PlaneGeometry(1, 1);
  const m = new THREE.Mesh(g, material);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(x1 - x0, y1 - y0, 1);
  m.position.copy(V((x0 + x1) / 2, (y0 + y1) / 2, z));
  m.renderOrder = 1;
  scene.add(m);
  decals.push({ mesh: m, land });
  return m;
}
const decals = [];

// ---------------------------------------------------------------- the building (stageOf)
const Z0 = -5;
{
  // the slab and the lines it stands on
  const slab = new Part();
  slab.box([0, 0, PW, DEPTH, Z0, 0], { fills: [G[25], G[100], G[150]], over: 22, kind: "shell" });
  place(slab, { land: 8.0, from: CENTER, kind: "rise" });

  // floors, lit from the back left: a gradient across each
  const floor = (x0, y0, x1, y1, from, to, land) => {
    const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0, 12, 12);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, 0.001, (y0 + y1) / 2);
    const pos = g.attributes.position;
    const colors = [];
    const hatch = [];
    const a = hex(from);
    const b = hex(to);
    for (let i = 0; i < pos.count; i++) {
      const u = ((pos.getX(i) - x0) / (x1 - x0)) * 0.5 + ((pos.getZ(i) - y0) / (y1 - y0)) * 0.5;
      const c = a.clone().lerp(b, clamp(u * 1.1 - 0.05));
      colors.push(c.r, c.g, c.b);
      hatch.push(0);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute("hatch", new THREE.Float32BufferAttribute(hatch, 1));
    const m = new THREE.Mesh(g, faceMaterial);
    const pivot = new THREE.Group();
    pivot.add(m);
    scene.add(pivot);
    pieces.push({ pivot, foot: V(CENTER[0], CENTER[1], 0), land, drop: 0, kind: "floor" });
  };
  floor(0, DC, LW, DEPTH, G[50], G[150], 8.05);
  floor(0, 0, LW, DC, G[25], G[100], 8.08);
  floor(LW, 0, PW, DEPTH, G[0], G[75], 8.02);
  decal(0, 0, PW, 2.6, 0.02, decalMaterial(0.14, 0.5, 0.02), { land: 8.15 });
  decal(0, 0, 2.6, DEPTH, 0.02, decalMaterial(0.14, 0.5, 0.02), { land: 8.15 });

  // the back walls
  const walls = new Part();
  walls.box([-2, -2, PW, 0, 0, WALL], { fills: [G[100], G[25], G[150]], back: G[75], over: 10, kind: "shell" });
  walls.box([-2, 0, 0, DEPTH, 0, WALL], { fills: [G[100], G[100], G[75]], back: G[75], over: 10, kind: "shell" });
  walls.seg([0, 0.05, 1.1], [PW, 0.05, 1.1], 0, "faint");
  walls.seg([0.05, 0, 1.1], [0.05, DEPTH, 1.1], 0, "faint");
  // the coordinator's pinboard
  walls.quad([2.5, 0.12, 4], [21.5, 0.12, 4], [21.5, 0.12, 13], [2.5, 0.12, 13], G[0]);
  walls.seg([2.5, 0.12, 4], [21.5, 0.12, 4], 3);
  walls.seg([2.5, 0.12, 13], [21.5, 0.12, 13], 3);
  walls.seg([2.5, 0.12, 4], [2.5, 0.12, 13], 3);
  walls.seg([21.5, 0.12, 4], [21.5, 0.12, 13], 3);
  place(walls, { land: 8.12, from: [PW / 2, 0], kind: "rise" });

  // low inner walls, door gaps open
  const PARTITION = [G[75], G[50], G[150]];
  const partition = (box, land, from) => {
    const p = new Part();
    p.box(box, { fills: PARTITION, over: 4.5 });
    place(p, { land, from, kind: "rise" });
  };
  partition([LW - 0.9, 0, LW + 0.9, 18, 0, 7], 8.2, [LW, 9]);
  partition([LW - 0.9, 30, LW + 0.9, DEPTH, 0, 7], 8.24, [LW, 65]);
  partition([0, DC - 0.9, 18, DC + 0.9, 0, 7], 8.22, [9, DC]);
  partition([30, DC - 0.9, LW, DC + 0.9, 0, 7], 8.26, [39, DC]);

  // your window: a counter
  const counter = new Part();
  counter.box([12, 74, 36, 80, 0, 7.2], { over: 4.5 });
  counter.box([11.4, 73.4, 36.6, 80.6, 7.2, 8.1], { over: 4.5 });
  place(counter, { land: 8.42, from: [24, 77] });
  decal(12.3, 74.5, 39, 84.2, 0.03, decalMaterial(0.3), { land: 8.42 });

  // the ground's long lines, fading toward their ends
  const guides = [];
  const colors = [];
  const run = (a, b) => {
    const n = 24;
    for (let i = 0; i < n; i++) {
      const u0 = i / n;
      const u1 = (i + 1) / n;
      const p0 = mix3(a, b, u0);
      const p1 = mix3(a, b, u1);
      const P0 = V(...p0);
      const P1 = V(...p1);
      guides.push(P0.x, P0.y, P0.z, P1.x, P1.y, P1.z);
      const k = (u) => {
        const e = u < 0.3 ? u / 0.3 : u > 0.7 ? (1 - u) / 0.3 : 1;
        return 1 - 0.34 * smooth(clamp(e));
      };
      for (const u of [u0, u1]) {
        const g = k(u);
        colors.push(g, g, g);
      }
    }
  };
  for (const x of [0, PW]) run([x, -2 - 52, Z0], [x, DEPTH + 2 + 52, Z0]);
  for (const y of [0, DEPTH]) run([-2 - 52, y, Z0], [PW + 2 + 52, y, Z0]);
  const g = new LineSegmentsGeometry();
  g.setPositions(guides);
  g.setColors(colors);
  const guideLines = new LineSegments2(g, fadeLineMaterial);
  scene.add(guideLines);
  decals.push({ mesh: guideLines, land: 7.3, line: true });
}

// ---------------------------------------------------------------- desks, laptops, mugs, trays
const laptops = {};
const mugs = [];
const ticks = {};
function mugAt(x, y, z, land) {
  const p = new Part();
  const n = 28;
  const r = 1.05;
  const h = 2.1;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const c0 = [x + Math.cos(a0) * r, y + Math.sin(a0) * r];
    const c1 = [x + Math.cos(a1) * r, y + Math.sin(a1) * r];
    p.quad([c0[0], c0[1], z], [c1[0], c1[1], z], [c1[0], c1[1], z + h], [c0[0], c0[1], z + h], i < n / 2 ? G[75] : G[25]);
    p.tri([x, y, z + h], [c0[0], c0[1], z + h], [c1[0], c1[1], z + h], G[0]);
    p.seg([c0[0], c0[1], z + h], [c1[0], c1[1], z + h], 0);
    p.seg([c0[0], c0[1], z], [c1[0], c1[1], z], 0);
  }
  const pivot = place(p, { land, from: [x, y] });
  // its two sides, turned to the camera each frame
  const g = new LineSegmentsGeometry();
  g.setPositions(new Array(12).fill(0));
  const sides = new LineSegments2(g, lineMaterials.line);
  pivot.children[0].add(sides);
  mugs.push({ x, y, z, r, h, sides, g });
}

function deskAt(desk, land) {
  const { x0, y0, x1, y1 } = desk;
  const leg = 0.9;
  const z = 5.2;
  const p = new Part();
  p.box([x0 - 0.4, y0 - 0.4, x1 + 0.4, y1 + 0.4, z, z + 0.9]);
  for (const [x, y] of [[x0, y1 - leg], [x1 - leg, y1 - leg], [x1 - leg, y0], [x0, y0]])
    p.box([x, y, x + leg, y + leg, 0, z], { fills: [G[50], G[100], G[150]], over: 2.5 });
  const [lx, ly] = desk.laptop;
  // the laptop's base
  p.box([lx - LAP.w, ly + 0.4, lx + LAP.w, ly + LAP.d, 6.1, 6.45], { fills: [G[100], G[150], G[200]], over: 2 });
  if (desk.own) {
    for (const i of [0, 1, 2])
      p.box([17.2 + i * 0.3, 16.2 - i * 0.2, 22.2 + i * 0.3, 19.6 - i * 0.2, 6.1 + i * 0.7, 6.1 + (i + 1) * 0.7], { over: 1.5 });
  } else {
    const [a, b, c, e] = desk.tray;
    p.box([a, b, c, e, 6.1, 7.4], { fills: [G[50], G[150], G[200]], over: 2 });
    p.quad([a + 0.5, b + 0.5, 7.42], [c - 0.5, b + 0.5, 7.42], [c - 0.5, e - 0.5, 7.42], [a + 0.5, e - 0.5, 7.42], G[100]);
  }
  const pivot = place(p, { land, from: [(x0 + x1) / 2, (y0 + y1) / 2] });
  decal(x0 + 0.3, y0 + 0.5, x1 + 2.6, y1 + 2.6 * 0.7, 0.03, decalMaterial(0.3, 0.5, 0.1), { land });

  // the lid, open with its screen toward the viewer, or shut on the base
  const open = new Part();
  open.box([lx - LAP.w, ly, lx + LAP.w, ly + 0.45, 6.1, LAP.h], { fills: [G[650], G[750], G[700]], hatch: false, over: 2, kind: "lid" });
  const openGroup = open.build();
  const shut = new Part();
  shut.box([lx - LAP.w, ly + 0.4, lx + LAP.w, ly + LAP.d, 6.45, 6.85], { fills: [G[200], G[300], G[250]], hatch: false, over: 2, kind: "lid" });
  const shutGroup = shut.build();
  shutGroup.visible = false;
  pivot.children[0].add(openGroup, shutGroup);
  // the screen: a canvas on the lid's face toward the viewer
  const canvas = document.createElement("canvas");
  canvas.width = 236;
  canvas.height = 134;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  const sw = 2 * LAP.w - 0.9;
  const sh = LAP.h - 6.1 - 0.75;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: texture, fog: true }));
  screen.position.copy(V(lx - LAP.w + 0.45 + sw / 2, ly + 0.46, LAP.h - 0.4 - sh / 2));
  openGroup.add(screen);
  laptops[desk.bot] = { canvas, ctx: canvas.getContext("2d"), texture, openGroup, shutGroup, seed: desk.bot.length };

  mugAt(desk.own ? 31 : x0 + 11, desk.own ? 20.5 : y1 - 1.5, 6.1, land + 0.06);

  if (!desk.own) {
    const [a, b, c, e] = desk.tray;
    const t = new Part();
    const cx = (a + c) / 2;
    const cy = (b + e) / 2;
    t.seg([cx - 1.6, cy - 0.2, 7.47], [cx - 0.4, cy + 1.1, 7.47], 0, "lid");
    t.seg([cx - 0.4, cy + 1.1, 7.47], [cx + 1.9, cy - 1.6, 7.47], 0, "lid");
    const tick = t.build();
    tick.visible = false;
    pivot.children[0].add(tick);
    ticks[desk.bot] = tick;
  }
}
{
  // one sweep from the back to the front, as the app builds it
  const order = [...allDesks].sort((a, b) => a.x0 + a.y0 - (b.x0 + b.y0));
  order.forEach((desk, i) => deskAt(desk, 8.3 + i * 0.07));
}

// ---------------------------------------------------------------- the bots
const markInfo = {};
function eyeBox(path) {
  const nums = path.match(/-?\d+(\.\d+)?/g).map(Number);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < nums.length; i += 2) {
    x0 = Math.min(x0, nums[i]); x1 = Math.max(x1, nums[i]);
    y0 = Math.min(y0, nums[i + 1]); y1 = Math.max(y1, nums[i + 1]);
  }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
function drawMark(ctx, name, size, { open = 1, look = 0 } = {}) {
  const m = MARKS[name];
  const k = size / 240;
  ctx.save();
  ctx.scale(k, k);
  const head = new Path2D(m.head);
  if (m.paint) {
    const g = ctx.createLinearGradient(0, 0, 0, 240);
    m.paint.forEach((c, i) => g.addColorStop(i / (m.paint.length - 1), c));
    ctx.fillStyle = g;
  } else ctx.fillStyle = m.ink === "currentColor" ? INK : m.ink;
  ctx.fill(head);
  ctx.fillStyle = "#ffffff";
  for (const eye of m.eyes) {
    const { cx, cy } = eyeBox(eye);
    ctx.save();
    ctx.translate(cx + look, cy);
    ctx.scale(1, open);
    ctx.translate(-cx, -cy);
    ctx.fill(new Path2D(eye));
    ctx.restore();
  }
  ctx.restore();
}
function markTextures(name) {
  const list = [];
  for (const [open, look] of [[1, 0], [0.5, 0], [0.1, 0], [1, 7], [1, -7]]) {
    const c = document.createElement("canvas");
    c.width = c.height = 640;
    drawMark(c.getContext("2d"), name, 640, { open, look });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 4;
    list.push(t);
  }
  return list;
}
const BOT = 13.5;
const bots = {};
const botNames = [COORD, ...HELPERS];
const shadowTexture = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(13,13,13,0.2)");
  g.addColorStop(0.6, "rgba(13,13,13,0.09)");
  g.addColorStop(1, "rgba(13,13,13,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
})();
// A bot is a standee: it stands on its seat, turns toward the camera only so far, and leans back
// a little when seen from above, so its foot stays on the floor from any angle.
const standeeGeometry = new THREE.PlaneGeometry(1, 1);
botNames.forEach((name, i) => {
  const textures = markTextures(name);
  const material = new THREE.MeshBasicMaterial({ map: textures[0], transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const turn = new THREE.Group();
  const lean = new THREE.Group();
  const lift = new THREE.Group();
  const face = new THREE.Mesh(standeeGeometry, material);
  face.renderOrder = 3;
  turn.add(lean);
  lean.add(lift);
  lift.add(face);
  scene.add(turn);
  const sprite = { turn, lean, lift, face };
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 2;
  scene.add(shadow);
  const desk = deskOf[name];
  bots[name] = { name, sprite, material, textures, shadow, seat: desk.seat, index: i, pop: 9.0 + i * 0.1 };
});

// hops: [time, kind] per bot (kind: hop | flip | cheer)
const HOPS = {
  Jarvis: [[10.5, "hop"], [22.5, "hop"], [24.55, "cheer"], [25.55, "cheer"]],
  Analyst: [[12.5, "hop"], [22.0, "hop"], [24.6, "cheer"], [25.6, "cheer"]],
  Curator: [[14.5, "hop"], [22.0, "hop"], [23.0, "hop"], [24.65, "cheer"], [25.65, "cheer"]],
  Writer: [[16.5, "hop"], [22.5, "hop"], [24.7, "cheer"], [25.7, "cheer"]],
  Designer: [[18.95, "flip"], [22.25, "hop"], [24.75, "cheer"], [25.75, "cheer"]],
  Concierge: [[22.25, "hop"], [23.0, "hop"], [24.8, "cheer"], [25.8, "cheer"]],
};
const LEAP = { hop: 0.5, flip: 0.8, cheer: 0.55 };
const RISE = { hop: 3.2, flip: 7.5, cheer: 4.6 };
function botState(bot, t) {
  let z = 0;
  let sx = 1;
  let sy = 1;
  let spin = 0;
  const pop = span(t, bot.pop, bot.pop + 0.45);
  let scale = pop <= 0 ? 0 : easeOutBack(pop, 2.6);
  // pop in: a squash as it lands
  if (pop > 0 && pop < 1) {
    const q = Math.sin(pop * Math.PI);
    sx *= 1 + 0.18 * q;
    sy *= 1 - 0.14 * q;
  }
  for (const [at, kind] of HOPS[bot.name] ?? []) {
    const dur = LEAP[kind];
    const crouch = 0.09;
    if (t >= at - crouch && t < at) {
      const q = Math.sin(span(t, at - crouch, at) * Math.PI);
      sx *= 1 + 0.16 * q;
      sy *= 1 - 0.16 * q;
    } else if (t >= at && t < at + dur) {
      const u = span(t, at, at + dur);
      z += 4 * RISE[kind] * u * (1 - u);
      const stretch = Math.sin(u * Math.PI) * 0.1;
      sx *= 1 - stretch * 0.6;
      sy *= 1 + stretch;
      if (kind === "flip") spin += Math.PI * 2 * easeInOut(u);
    } else if (t >= at + dur && t < at + dur + 0.12) {
      const q = Math.sin(span(t, at + dur, at + dur + 0.12) * Math.PI);
      sx *= 1 + 0.14 * q;
      sy *= 1 - 0.12 * q;
    }
  }
  // at work: a small rock, typing
  const working = t > 10 && t < 24;
  const rock = working ? Math.sin(t * 9 + bot.index * 1.3) * 0.035 : Math.sin(t * 1.4 + bot.index) * 0.015;
  // blinks
  const period = 2.6 + bot.index * 0.37;
  const phase = (t + bot.index * 0.83) % period;
  const blink = phase < 0.05 ? 1 : phase < 0.1 ? 2 : phase < 0.15 ? 1 : 0;
  return { z, sx: sx * scale, sy: sy * scale, spin: spin + rock, blink };
}

// ---------------------------------------------------------------- sheets in flight, cards pinned
function sheetTexture(dark) {
  const c = document.createElement("canvas");
  c.width = 160;
  c.height = 200;
  const x = c.getContext("2d");
  x.translate(8, 8);
  const r = 14;
  x.beginPath();
  x.roundRect(0, 0, 144, 184, r);
  x.fillStyle = dark ? INK : "#ffffff";
  x.fill();
  x.lineWidth = 6;
  x.strokeStyle = dark ? INK : "#8a8a8a";
  x.stroke();
  x.fillStyle = dark ? "rgba(255,255,255,0.55)" : "rgba(13,13,13,0.32)";
  for (const [top, w] of [[40, 96], [72, 96], [104, 52]]) x.fillRect(24, top, w, 14);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
const SHEET = [sheetTexture(false), sheetTexture(true)];
const flights = [];
function flight(from, to, at, dur, dark, lift = 14) {
  const material = new THREE.SpriteMaterial({ map: SHEET[dark ? 1 : 0], transparent: true, depthWrite: false, fog: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4.2, 5.2, 1);
  sprite.renderOrder = 4;
  sprite.visible = false;
  scene.add(sprite);
  flights.push({ from, to, at, dur, sprite, material, lift, spin: (flights.length % 2 ? 1 : -1) * (1.5 + (flights.length % 3)) });
}
const trayTop = (bot) => {
  const d = deskOf[bot];
  if (d.own) return [19.7, 17.9, 8.3];
  return [(d.tray[0] + d.tray[2]) / 2, (d.tray[1] + d.tray[3]) / 2, 7.6];
};
// handing out the work: Jarvis to each helper
HELPERS.forEach((bot, i) => flight(trayTop(COORD), trayTop(bot), 9.55 + i * 0.09, 0.62, i % 2 === 1, 16));
// answers coming back to Jarvis, as a flock
HELPERS.forEach((bot, i) => flight(trayTop(bot), trayTop(COORD), 19.98 + i * 0.07, 1.0, i % 2 === 0, 18));
HELPERS.forEach((bot, i) => flight(trayTop(bot), trayTop(COORD), 22.4 + i * 0.11, 0.85, i % 2 === 1, 12));
function flightAt(f, t) {
  const u = span(t, f.at, f.at + f.dur);
  const e = easeInOut(u);
  const p = mix3(f.from, f.to, e);
  p[2] += f.lift * Math.sin(Math.PI * e);
  return { p, u, live: t >= f.at && t <= f.at + f.dur + 0.05 };
}
// cards on the pinboard, one per answer that came back
const pinned = [];
{
  const spots = [[4.2, 11.8], [7.4, 11.8], [10.6, 11.8], [13.8, 11.8], [17.0, 11.8], [4.2, 8.2], [7.4, 8.2], [10.6, 8.2], [13.8, 8.2], [17.0, 8.2]];
  spots.forEach(([x, z], i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.0), new THREE.MeshBasicMaterial({ map: SHEET[i % 3 === 0 ? 0 : 1], transparent: true, fog: true }));
    m.position.copy(V(x + 1.2, 0.2, z - 1.5));
    m.visible = false;
    scene.add(m);
    pinned.push({ mesh: m, at: i < 5 ? 21.0 + i * 0.07 : 23.3 + (i - 5) * 0.11 });
  });
  // two there from before the call
  pinned[0].at = 8.6;
  pinned[1].at = 8.6;
}

// ---------------------------------------------------------------- the scoreboard and the sign
const BOARD = { x: -18, y: 99, z: 50, w: 100, h: 50 };
const boardCanvas = document.createElement("canvas");
boardCanvas.width = 2000;
boardCanvas.height = 1000;
const boardCtx = boardCanvas.getContext("2d");
const boardTexture = new THREE.CanvasTexture(boardCanvas);
boardTexture.colorSpace = THREE.NoColorSpace;
boardTexture.anisotropy = 8;
{
  const m = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), new THREE.MeshBasicMaterial({ map: boardTexture, fog: true, side: THREE.DoubleSide }));
  m.rotation.y = Math.PI / 2; // faces +X, reads toward the back
  m.position.copy(V(BOARD.x, BOARD.y - BOARD.w / 2, BOARD.z - BOARD.h / 2));
  const pivot = new THREE.Group();
  pivot.add(m);
  const posts = new Part();
  posts.seg([BOARD.x, BOARD.y - 12, 0], [BOARD.x, BOARD.y - 12, 0.5], 0, "faint");
  posts.seg([BOARD.x, 66, Z0], [BOARD.x, 66, 0], 0, "faint");
  posts.seg([BOARD.x, 40, Z0], [BOARD.x, 40, 0], 0, "faint");
  const edge = new Part();
  edge.seg([BOARD.x + 0.05, BOARD.y, BOARD.z], [BOARD.x + 0.05, BOARD.y - BOARD.w, BOARD.z], 0, "faint");
  edge.seg([BOARD.x + 0.05, BOARD.y, 0], [BOARD.x + 0.05, BOARD.y - BOARD.w, 0], 0, "faint");
  edge.seg([BOARD.x + 0.05, BOARD.y, 0], [BOARD.x + 0.05, BOARD.y, BOARD.z], 0, "faint");
  edge.seg([BOARD.x + 0.05, BOARD.y - BOARD.w, 0], [BOARD.x + 0.05, BOARD.y - BOARD.w, BOARD.z], 0, "faint");
  pivot.add(edge.build());
  scene.add(pivot);
  pieces.push({ pivot, foot: new THREE.Vector3(0, 0, 0), land: 8.5, drop: 0, kind: "fade", until: 24.0 });
}
const SEG = {
  0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg",
};
function digit(ctx, x, y, w, h, n, ink) {
  const t = w * 0.2;
  const g = t * 0.18;
  const skew = 0.12;
  const P = (px, py) => [x + px + (h - py) * skew, y + py];
  const bar = (a, b, horiz) => {
    ctx.beginPath();
    if (horiz) {
      const [x0, y0] = a;
      const x1 = b[0];
      const pts = [[x0 + g, y0], [x0 + g + t / 2, y0 - t / 2], [x1 - g - t / 2, y0 - t / 2], [x1 - g, y0], [x1 - g - t / 2, y0 + t / 2], [x0 + g + t / 2, y0 + t / 2]];
      pts.forEach(([px, py], i) => {
        const [qx, qy] = P(px, py);
        i ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy);
      });
    } else {
      const [x0, y0] = a;
      const y1 = b[1];
      const pts = [[x0, y0 + g], [x0 + t / 2, y0 + g + t / 2], [x0 + t / 2, y1 - g - t / 2], [x0, y1 - g], [x0 - t / 2, y1 - g - t / 2], [x0 - t / 2, y0 + g + t / 2]];
      pts.forEach(([px, py], i) => {
        const [qx, qy] = P(px, py);
        i ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy);
      });
    }
    ctx.closePath();
    ctx.fill();
  };
  const m = h / 2;
  const segs = {
    a: [[0, 0], [w, 0], true], g: [[0, m], [w, m], true], d: [[0, h], [w, h], true],
    f: [[0, 0], [0, m], false], b: [[w, 0], [w, m], false], e: [[0, m], [0, h], false], c: [[w, m], [w, h], false],
  };
  for (const [k, [a, b, horiz]] of Object.entries(segs)) {
    ctx.fillStyle = SEG[n].includes(k) ? ink : "rgba(13,13,13,0.06)";
    bar(a, b, horiz);
  }
}
const CREW = [COORD, ...HELPERS];
function drawBoard(t) {
  const c = boardCtx;
  c.clearRect(0, 0, 2000, 1000);
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, 2000, 1000);
  c.strokeStyle = "rgba(13,13,13,0.3)";
  c.lineWidth = 3;
  c.strokeRect(2, 2, 1996, 996);
  c.beginPath();
  c.moveTo(1180, 60);
  c.lineTo(1180, 940);
  c.stroke();
  const done = t >= 24.0;
  c.fillStyle = "rgba(13,13,13,0.62)";
  c.font = "600 44px Geist";
  c.letterSpacing = "7px";
  c.fillText(LANG === "ko" ? "PLAN THE LAUNCH OF…" : "PLAN THE LAUNCH OF…", 70, 130);
  c.textAlign = "right";
  c.fillText(done ? "DONE" : "AT WORK", 1120, 130);
  c.textAlign = "left";
  c.letterSpacing = "0px";
  // the clock: scene time to job time, racing through the montage
  const u = clamp((t - 9.0) / 15.0);
  const eased = u < 0.7 ? u * 0.55 : 0.385 + (u - 0.7) * (0.615 / 0.3);
  const secs = Math.round(eased * 268);
  const mm = Math.floor(secs / 60);
  const ss = secs % 60;
  const ink = "#1a1a1a";
  const dw = 190;
  const dh = 420;
  digit(c, 110, 300, dw, dh, mm, ink);
  c.fillStyle = ink;
  c.beginPath();
  c.arc(400 + 40, 430, 20, 0, Math.PI * 2);
  c.arc(400 + 18, 610, 20, 0, Math.PI * 2);
  c.fill();
  digit(c, 520, 300, dw, dh, Math.floor(ss / 10), ink);
  digit(c, 800, 300, dw, dh, ss % 10, ink);
  // the crew and their steps
  c.font = "500 38px Geist Mono";
  c.letterSpacing = "8px";
  c.fillStyle = "rgba(13,13,13,0.45)";
  c.fillText("CREW", 1240, 170);
  c.textAlign = "right";
  c.fillText("STEPS", 1930, 170);
  c.textAlign = "left";
  c.letterSpacing = "0px";
  CREW.forEach((name, i) => {
    const y = 270 + i * 112;
    c.font = "500 38px Geist Mono";
    c.fillStyle = "rgba(13,13,13,0.45)";
    c.fillText(String(i + 1), 1240, y);
    // the face
    c.save();
    c.translate(1300, y - 44);
    drawMark(c, name, 56);
    c.restore();
    c.font = "550 52px Geist";
    c.fillStyle = "rgba(13,13,13,0.7)";
    c.fillText(name, 1380, y);
    const start = i === 0 ? 9.2 : 10.1 + i * 0.1;
    const steps = Math.max(0, Math.floor(clamp((t - start) / (23.8 - start)) * (i === 0 ? 7 : 3 + ((i * 5) % 4))));
    const finished = t >= 23.7 + i * 0.05;
    c.textAlign = "right";
    c.font = "500 44px Geist Mono";
    c.fillStyle = "rgba(13,13,13,0.62)";
    c.fillText(String(steps), 1930, y);
    if (finished) {
      c.strokeStyle = "rgba(13,13,13,0.55)";
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(1822, y - 18);
      c.lineTo(1836, y - 4);
      c.lineTo(1862, y - 34);
      c.stroke();
    }
    c.textAlign = "left";
  });
  boardTexture.needsUpdate = true;
}

// the job's sign on the ground beside the building
const SIGN = { w: 70, h: 28 };
const signCanvas = document.createElement("canvas");
signCanvas.width = 1400;
signCanvas.height = 560;
const signCtx = signCanvas.getContext("2d");
const signTexture = new THREE.CanvasTexture(signCanvas);
signTexture.colorSpace = THREE.NoColorSpace;
signTexture.anisotropy = 8;
const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(SIGN.w, SIGN.h), new THREE.MeshBasicMaterial({ map: signTexture, transparent: true, depthWrite: false, fog: true }));
{
  const signAt = DEPTH * 0.45 + SIGN.w / 2;
  // lying on the ground; its across runs toward the back, its down away from the building
  signMesh.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  signMesh.position.copy(V(PW + 9 + SIGN.h / 2, signAt - SIGN.w / 2, Z0 + 0.05));
  signMesh.renderOrder = 1;
  scene.add(signMesh);
}
function drawSign(t) {
  const c = signCtx;
  c.clearRect(0, 0, 1400, 560);
  const work = span(t, 8.7, 9.1);
  const out = span(t, 23.75, 24.0);
  if (t < 24.0 && work > 0) {
    // AT WORK on a band of tape that runs
    c.save();
    c.globalAlpha = work * (1 - out);
    c.beginPath();
    c.rect(0, 40, 1400 * (1 - out), 216);
    c.clip();
    c.save();
    c.translate(-((t * 120) % 102), 0);
    c.fillStyle = "rgba(13,13,13,0.14)";
    for (let x = -300; x < 1700; x += 102) {
      c.beginPath();
      c.moveTo(x, 256);
      c.lineTo(x + 51, 256);
      c.lineTo(x + 51 + 216, 40);
      c.lineTo(x + 216, 40);
      c.closePath();
      c.fill();
    }
    c.restore();
    c.fillStyle = "rgba(13,13,13,0.45)";
    c.font = "700 128px Geist";
    c.letterSpacing = "26px";
    c.fillText("AT WORK", 56, 196);
    c.restore();
  }
  if (t >= 24.0) {
    // DONE, painted on left to right
    const u = easeOut(span(t, 24.05, 24.6));
    c.save();
    c.beginPath();
    c.rect(0, 0, 60 + 1300 * u, 560);
    c.clip();
    c.fillStyle = "rgba(13,13,13,0.82)";
    c.font = "800 300px Geist";
    c.letterSpacing = "6px";
    c.fillText("DONE", 44, 300);
    c.restore();
  }
  signTexture.needsUpdate = true;
}

// ---------------------------------------------------------------- her: the blue dot
const DOT = { r: 2.1 };
const dot = new THREE.Mesh(new THREE.SphereGeometry(DOT.r, 48, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(BRAND) }));
dot.renderOrder = 5;
scene.add(dot);
const glowTexture = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(1,105,204,0.28)");
  g.addColorStop(0.35, "rgba(1,105,204,0.1)");
  g.addColorStop(1, "rgba(1,105,204,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
})();
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false }));
glow.renderOrder = 4;
scene.add(glow);
// the ripple where she lands
const ripples = [0, 0.14, 0.3].map((delay) => {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(BRAND), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  scene.add(m);
  return { mesh: m, delay };
});
const HOVER = [27, 76.5, 8.1 + DOT.r];
const LINE_OF_ID = Object.fromEntries(TLo.lines.map((l) => [l.id, l]));
const speaking = (t) => TLo.lines.some((l) => l.who === "thursday" && t >= l.at && t <= l.end);
function voiceLevel(t) {
  for (const l of TLo.lines)
    if (l.who === "thursday" && t >= l.at && t <= l.end) {
      const u = (t - l.at) / (l.end - l.at);
      const env = Math.sin(Math.PI * clamp(u * 1.08));
      return env * (0.55 + 0.45 * Math.abs(Math.sin(t * 17.3) * Math.sin(t * 7.1 + 1)));
    }
  return 0;
}

// ---------------------------------------------------------------- the camera's shots
const SHOTS = TLo.shots;
function shotAt(t) {
  let s = SHOTS[0];
  for (const x of SHOTS) if (t >= x.at) s = x;
  const next = SHOTS[SHOTS.indexOf(s) + 1];
  return { id: s.id, t0: s.at, t1: next ? next.at : TLo.duration };
}
const orbit = (c, r, az, h) => [c[0] + r * Math.sin(az), c[1] + r * Math.cos(az), h];
const deg = Math.PI / 180;
function cameraAt(t) {
  const { id, t0, t1 } = shotAt(t);
  const u = (t - t0) / (t1 - t0);
  let p;
  let look;
  let fov = 40;
  let roll = 0;
  let jitter = 0.25;
  switch (id) {
    case "chat":
    case "drop": {
      // straight down from high, then swooping to a three-quarter view as the office stands
      const c = [CENTER[0] + 2, CENTER[1] - 4, 0];
      const k = span(t, 7.0, 8.0);
      const s = easeInOut(span(t, 8.0, 10.0));
      const r = lerp(lerp(560, 470, easeOut(k)), 150, s);
      const polar = lerp(0.5 * deg, 58 * deg, s);
      const az = lerp(-35 * deg, 48 * deg, s) + (1 - s) * k * 6 * deg;
      look = [lerp(c[0], 62, s), lerp(c[1], 44, s), lerp(0, 3, s)];
      p = [look[0] + r * Math.sin(polar) * Math.sin(az), look[1] + r * Math.sin(polar) * Math.cos(az), look[2] + r * Math.cos(polar)];
      fov = lerp(40, 44, s);
      jitter = 0.1 + 0.3 * s;
      break;
    }
    case "jarvis": {
      // craning down over the low wall into the coordinator's room
      const e = easeInOut(u);
      p = mix3([52, 92, 46], [42, 70, 20], e);
      look = mix3([25, 16, 5], [25, 14, 8], e);
      fov = lerp(42, 38, e);
      roll = lerp(-4, 1, e);
      break;
    }
    case "analyst": {
      // down the front-left diagonal, the one line to the back row nobody stands in
      const e = easeInOut(u);
      const s = desks[0];
      p = orbit(s.seat, lerp(96, 78, e), lerp(-56, -40, e) * deg, lerp(52, 36, e));
      look = [s.seat[0] + 2, s.seat[1] + 3, 7.5];
      fov = lerp(32, 30, e);
      roll = lerp(-5, 2, e);
      break;
    }
    case "curator": {
      // from across the low wall, sliding along it
      const e = easeInOut(u);
      const s = desks[1];
      p = mix3([6, 86, 30], [14, 50, 22], e);
      look = mix3([s.x0 + 2, s.y0 + 4, 8], [s.x0 + 10, s.y0 - 1, 8], e);
      fov = 40;
      roll = lerp(-3, 3, e);
      break;
    }
    case "writer": {
      // a dutch push from the front corner, punched in on the beat
      const e = easeOut(u);
      const s = desks[2];
      p = mix3([s.x0 + 64, s.y0 + 62, 16], [s.x0 + 38, s.y0 + 40, 11], e);
      look = mix3([s.x0 + 8, s.y0 + 2, 8], [s.x0 + 8, s.y0 + 1, 8.5], e);
      const punch = span(t, 17.0, 17.07) - span(t, 17.07, 17.7) * 0.7;
      fov = lerp(40, 38, e) - 8 * easeOut(clamp(punch));
      roll = lerp(10, 7, e);
      break;
    }
    case "designer": {
      // the back corner from high on the right, turning toward the front
      const e = easeInOut(u);
      const s = desks[3];
      p = orbit([s.seat[0], s.seat[1]], lerp(84, 72, e), lerp(58, 40, e) * deg, lerp(64, 50, e));
      look = [s.seat[0] + 2, s.seat[1] + 4, 8];
      fov = lerp(30, 28, e);
      roll = lerp(-5, 2, e);
      jitter = 0.18;
      break;
    }
    case "sheets": {
      // the answers flying back to Jarvis over the whole floor, a whip from the right
      const e = easeOut(u);
      p = mix3([150, 118, 76], [96, 110, 70], e);
      look = mix3([88, 24, 10], [40, 26, 10], e);
      fov = 42;
      roll = lerp(8, -2, e);
      jitter = 0.3;
      break;
    }
    case "board": {
      // the clock racing, seen over the office's back wall
      const e = easeOut(u);
      p = mix3([132, 86, 42], [124, 82, 40], e);
      look = mix3([-18, 73, 27], [-18, 71, 27], e);
      fov = lerp(36, 34, e);
      roll = -2;
      break;
    }
    case "her": {
      // her at her window, the team at work behind her
      const e = easeInOut(u);
      p = mix3([-4, 142, 46], [6, 128, 38], e);
      look = mix3([40, 48, 3], [37, 53, 4], e);
      fov = lerp(40, 36, e);
      roll = lerp(-3, 2, e);
      jitter = 0.2;
      break;
    }
    case "rise": {
      const e = easeIn(u);
      p = mix3([60, 118, 16], [220, 190, 190], e);
      look = mix3([30, 70, 8], [70, 46, 0], smooth(u));
      fov = lerp(44, 40, e);
      roll = lerp(-4, 0, u);
      jitter = 0.2;
      break;
    }
    case "done":
    case "card": {
      // high over the building's right side: DONE on the ground in front, the office, the clock behind
      const e = easeInOut(span(t, 24.0, 27.0));
      const c = [98, 52];
      const az = lerp(70, 80, e) * deg;
      const up = easeIn(span(t, 26.4, 27.0));
      p = orbit(c, lerp(178, 166, e) + up * 60, az, lerp(214, 204, e) + up * 160);
      look = [c[0] - 4, c[1] - 2, lerp(-2, -3, e)];
      fov = lerp(42, 40, e);
      jitter = 0.2;
      break;
    }
  }
  // the drone's sway
  const j = jitter;
  p = [p[0] + sway(t, 1) * j, p[1] + sway(t, 2) * j, p[2] + sway(t, 3) * j * 0.7];
  look = [look[0] + sway(t, 4) * j * 0.6, look[1] + sway(t, 5) * j * 0.6, look[2] + sway(t, 6) * j * 0.5];
  roll += sway(t, 7) * j * 0.8;
  return { p, look, fov, roll };
}
function setCamera(t) {
  const { p, look, fov, roll } = cameraAt(t);
  camera.position.copy(V(...p));
  camera.up.set(0, 1, 0);
  camera.lookAt(V(...look));
  camera.rotateZ(roll * deg);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

// ---------------------------------------------------------------- the world at time t
function drawScreen(bot, t) {
  const l = laptops[bot];
  const x = l.ctx;
  const w = l.canvas.width;
  const h = l.canvas.height;
  const lit = t >= (bot === COORD ? 9.4 : 10.1 + HELPERS.indexOf(bot) * 0.09);
  x.fillStyle = lit ? "#ffffff" : "#767676";
  x.fillRect(0, 0, w, h);
  x.lineCap = "round";
  if (lit) {
    x.strokeStyle = "rgba(13,13,13,0.55)";
    x.lineWidth = 7;
    const off = ((t * 42 + l.seed * 13) % 26);
    for (let i = -1; i < 7; i++) {
      const y = 18 + i * 26 - off;
      const k = (i + Math.floor((t * 42 + l.seed * 13) / 26)) % 3;
      x.beginPath();
      x.moveTo(14, y);
      x.lineTo(w * (k === 2 ? 0.45 : k === 1 ? 0.7 : 0.85), y);
      x.stroke();
    }
  } else {
    x.strokeStyle = "rgba(255,255,255,0.35)";
    x.lineWidth = 6;
    for (const [y, k] of [[26, 0.65], [46, 0.4]]) {
      x.beginPath();
      x.moveTo(14, y);
      x.lineTo(w * k, y);
      x.stroke();
    }
  }
  l.texture.needsUpdate = true;
  screenLid(bot, t);
}
function screenLid(bot, t) {
  const l = laptops[bot];
  const shut = t >= 24.1 + (bot === COORD ? 0 : (HELPERS.indexOf(bot) + 1) * 0.08);
  l.openGroup.visible = !shut;
  l.shutGroup.visible = shut;
}

function world(t, paint = true) {
  // the office builds itself where she lands
  for (const one of pieces) {
    const u = span(t, one.land, one.land + 0.42);
    const on = u > 0 && (one.until === undefined || t < one.until);
    one.pivot.visible = on;
    if (!on) continue;
    if (one.kind === "floor") {
      const s = easeOutQuint(u);
      one.pivot.scale.set(lerp(0.6, 1, s), 1, lerp(0.6, 1, s));
      one.pivot.position.copy(one.foot).multiplyScalar(1 - lerp(0.6, 1, s));
    } else if (one.kind === "rise") {
      const s = easeOutBack(u, 1.4);
      one.pivot.scale.set(1, Math.max(0.001, s), 1);
      one.pivot.position.copy(one.foot);
    } else if (one.kind === "fade") {
      const s = easeOut(u);
      one.pivot.scale.set(1, Math.max(0.001, s), 1);
      one.pivot.position.copy(one.foot);
    } else {
      const s = easeOutBack(u, 1.8);
      one.pivot.position.copy(one.foot);
      one.pivot.position.y += (1 - clamp(s)) * one.drop;
      const k = lerp(0.7, 1, clamp(s * 1.1));
      one.pivot.scale.set(k, k, k);
    }
  }
  for (const one of decals) {
    const u = easeOut(span(t, one.land, one.land + 0.5));
    one.mesh.visible = u > 0;
    if (one.line) fadeLineMaterial.opacity = u;
    else if (one.mesh.material.uniforms) one.mesh.material.uniforms.uFade.value = u;
  }
  fadeLineMaterial.transparent = true;

  // mugs: their sides where the camera sees them
  for (const m of mugs) {
    const cam = camera.position;
    const dx = cam.x - m.x;
    const dz = cam.z - m.y;
    const len = Math.hypot(dx, dz) || 1;
    const px = -dz / len;
    const pz = dx / len;
    const pts = [];
    for (const s of [1, -1]) {
      const x = m.x + px * m.r * s;
      const z = m.y + pz * m.r * s;
      pts.push(x, m.z, z, x, m.z + m.h, z);
    }
    m.g.setPositions(pts);
  }

  // the bots
  for (const bot of Object.values(bots)) {
    const s = botState(bot, t);
    const [x, y] = bot.seat;
    const w = BOT * s.sx;
    const h = BOT * s.sy;
    const { turn, lean, lift, face } = bot.sprite;
    turn.visible = s.sx > 0.001;
    turn.position.copy(V(x, y - 1.3, 0));
    const dx = camera.position.x - x;
    const dz = camera.position.z - (y - 1.3);
    const dy = camera.position.y - BOT / 2;
    turn.rotation.y = clamp(Math.atan2(dx, dz), -0.36, 0.36);
    lean.rotation.x = -clamp(Math.atan2(dy, Math.hypot(dx, dz)), 0, 1.4) * 0.62;
    lift.position.y = s.z + h / 2;
    lift.rotation.z = -s.spin;
    face.scale.set(Math.max(0.001, w), Math.max(0.001, h), 1);
    // eyes: blink, and glance toward the flock as it lands
    let look = 0;
    if (t > 20.6 && t < 21.4 && bot.name !== COORD) look = 3;
    bot.material.map = bot.textures[s.blink || look];
    const sh = BOT * 0.62 * Math.max(0, s.sx) * (1 - clamp(s.z / 12) * 0.5);
    bot.shadow.visible = sh > 0.01;
    bot.shadow.scale.set(Math.max(0.001, sh), Math.max(0.001, sh * 0.62), 1);
    bot.shadow.position.copy(V(x, y - 1.0, 0.06));
  }

  // sheets
  for (const f of flights) {
    const { p, u, live } = flightAt(f, t);
    f.sprite.visible = live && u > 0;
    if (!f.sprite.visible) continue;
    f.sprite.position.copy(V(...p));
    f.material.rotation = f.spin * u * Math.PI;
    const k = 1 - 0.25 * Math.sin(Math.PI * u);
    f.sprite.scale.set(4.2 * k * Math.cos(u * Math.PI) ** 2 + 0.8, 5.2 * k, 1);
  }
  for (const card of pinned) {
    const u = span(t, card.at, card.at + 0.25);
    card.mesh.visible = u > 0;
    const k = easeOutBack(u, 2.2);
    card.mesh.scale.set(k, k, 1);
  }
  for (const [bot, tick] of Object.entries(ticks)) tick.visible = t >= 24.25 + HELPERS.indexOf(bot) * 0.08;
  // what is painted on canvases changes slower than a shutter: painted once a frame
  if (paint) {
    for (const bot of Object.keys(laptops)) drawScreen(bot, t);
    drawBoard(t);
    drawSign(t);
  } else for (const bot of Object.keys(laptops)) screenLid(bot, t);

  // her: she falls from under the camera, lands where the office rises, and hops to her window
  const landT = 8.0;
  const LAND = [CENTER[0] + 2, CENTER[1] - 4, DOT.r];
  let dp;
  let scale = 1;
  let squash = 0;
  if (t < landT) {
    const u = span(t, 7.0, landT);
    dp = mix3([LAND[0], LAND[1], 120], LAND, u * u);
  } else {
    // two hops to the counter, then resting there, bobbing; giggling on her laugh
    const mid = mix3(LAND, HOVER, 0.55);
    mid[2] = DOT.r;
    const hops = [[landT + 0.35, 0.55, mid, 9], [landT + 0.95, 0.5, HOVER, 7]];
    dp = [...LAND];
    for (const [at, dur, to, high] of hops) {
      const u = span(t, at, at + dur);
      if (t >= at) {
        const from = [...dp];
        const e = easeInOut(u);
        dp = mix3(from, to, e);
        dp[2] = lerp(from[2], to[2], e) + 4 * high * u * (1 - u);
      }
    }
    for (const [at, dur] of [[landT, 0.14], [landT + 0.9, 0.12], [landT + 1.45, 0.14]]) {
      if (t >= at && t < at + dur) squash = Math.sin(span(t, at, at + dur) * Math.PI);
    }
    const rest = span(t, landT + 1.5, landT + 2.0);
    dp[2] += Math.abs(Math.sin(t * Math.PI)) * 0.8 * rest;
    // the laugh at the end of her line about herself
    const me = LINE_OF_ID.me;
    const laugh = span(t, me.end - 0.55, me.end);
    if (laugh > 0 && laugh < 1) {
      const b = Math.abs(Math.sin(laugh * Math.PI * 4)) * (1 - laugh * 0.5);
      dp[2] += b * 2.2;
      squash -= b * 0.25;
    }
  }
  const lvl = voiceLevel(t);
  scale *= 1 + 0.22 * lvl;
  dot.visible = t >= 7.0;
  dot.position.copy(V(...dp));
  dot.position.y -= DOT.r * 0.3 * squash;
  dot.scale.set(scale * (1 + 0.3 * squash), scale * (1 - 0.3 * squash), scale * (1 + 0.3 * squash));
  glow.visible = dot.visible;
  glow.position.copy(dot.position);
  const gs = DOT.r * (7 + 5 * lvl);
  glow.scale.set(gs, gs, 1);
  for (const r of ripples) {
    const u = span(t, landT + r.delay, landT + r.delay + 1.2);
    r.mesh.visible = u > 0 && u < 1;
    const k = 4 + easeOut(u) * 70;
    r.mesh.scale.set(k, k, k);
    r.mesh.position.copy(V(CENTER[0] + 2, CENTER[1] - 4, 0.3));
    r.mesh.material.opacity = 0.5 * (1 - u);
  }
}

// ---------------------------------------------------------------- the words on top
const $ = (s) => document.querySelector(s);
const text = (line) => line[LANG] ?? line.en;
function wordsOf(s) {
  // Korean and English both break at spaces
  return s.split(/(\s+)/).filter((w) => w.length);
}
function wordSpans(el, s) {
  el.innerHTML = "";
  const list = [];
  for (const w of wordsOf(s)) {
    // spaces stay plain text, so a wrapped line never starts with one
    if (!w.trim()) {
      el.appendChild(document.createTextNode(" "));
      continue;
    }
    const span_ = document.createElement("span");
    span_.className = "word";
    span_.textContent = w;
    el.appendChild(span_);
    list.push(span_);
  }
  return list;
}
function showWord(el, u, rise = 22) {
  const e = easeOutQuint(clamp(u));
  el.style.opacity = String(clamp(u * 1.6));
  el.style.transform = `translateY(${(1 - e) * rise}px)`;
  el.style.filter = u < 1 ? `blur(${(1 - e) * 8}px)` : "none";
}

// the call, before the office
const chat = $("#chat");
const LINE_OF = Object.fromEntries(TL.lines.map((l) => [l.id, l]));
const CHAT_SIZE = 76;
const ask = LINE_OF.ask;
const sure = LINE_OF.sure;
chat.innerHTML = `
  <div class="line" id="ask"><i class="bullet"></i><span class="text"></span></div>
  <div class="line" id="sure"><span class="text"></span></div>
  <div class="tool" id="tool"><span class="mark"></span><span class="label"></span><i class="spin"></i></div>
  <div class="dot" id="her" style="background: var(--brand)"></div>`;
const askWords = wordSpans($("#ask .text"), text(ask));
const sureWords = wordSpans($("#sure .text"), text(sure));
$("#tool .label").textContent = LANG === "ko" ? "Jarvis에게 넘기는 중" : "Handing this to Jarvis";
{
  const m = MARKS[COORD];
  $("#tool .mark").innerHTML = `<svg viewBox="0 0 240 240"><path d="${m.head}" fill="#767676"/>${m.eyes.map((e) => `<path d="${e}" fill="#fff"/>`).join("")}</svg>`;
}
const askEl = $("#ask");
const sureEl = $("#sure");
const toolEl = $("#tool");
const her = $("#her");
function layoutChat() {
  askEl.style.top = "0px";
  const askH = askEl.getBoundingClientRect().height;
  const sureH = sureEl.getBoundingClientRect().height;
  const gap = 70;
  const total = askH + gap + sureH + 40 + 50;
  const top = 920 - total / 2;
  askEl.style.top = `${top}px`;
  sureEl.style.top = `${top + askH + gap}px`;
  toolEl.style.top = `${top + askH + gap + sureH + 40}px`;
  return { sureTop: top + askH + gap };
}
let chatLayout;

function overlayChat(t) {
  chat.style.display = t < CUT ? "block" : "none";
  if (t >= CUT) return;
  // her dot: in the middle listening, then beside her own line, then back to the middle to fall
  const dotEnd = { x: 150 - 66 + 14, y: chatLayout.sureTop + CHAT_SIZE * 0.36 + 14 };
  const toLine = easeInOut(span(t, 0.45, 1.05));
  const toMiddle = easeInOut(span(t, 4.5, CUT));
  let x = lerp(540, dotEnd.x, toLine);
  let y = lerp(930, dotEnd.y, toLine);
  x = lerp(x, 540, toMiddle);
  y = lerp(y, 960, toMiddle);
  let size = lerp(46, 28, toLine);
  size = lerp(size, 30, toMiddle);
  const appear = easeOutBack(span(t, 0.05, 0.45), 2.2);
  const breathe = 1 + 0.07 * Math.sin(t * Math.PI * 1.5) * (1 - toLine * 0.6);
  const talk = 1 + 0.32 * voiceLevel(t);
  const s = size * appear * breathe * talk;
  her.style.width = her.style.height = `${s}px`;
  her.style.left = `${x - s / 2}px`;
  her.style.top = `${y - s / 2}px`;
  // a ring while she listens
  const ring = t > 0.1 && t < 0.9 ? ((t - 0.1) * 1.25) % 1 : -1;
  her.style.boxShadow = ring >= 0 ? `0 0 0 ${ring * 40}px rgba(1,105,204,${0.2 * (1 - ring)})` : "none";

  const leave = (i) => span(t, 4.35 + i * 0.06, 4.75 + i * 0.06);
  // the user's words, as they are heard
  const askStep = (ask.end - 0.5 - ask.at) / Math.max(1, askWords.length);
  askWords.forEach((w, i) => showWord(w, span(t, ask.at + i * askStep, ask.at + i * askStep + 0.38)));
  askEl.querySelector(".bullet").style.opacity = String(clamp(span(t, ask.at - 0.1, ask.at + 0.15)));
  askEl.style.opacity = String(1 - leave(0));
  askEl.style.transform = `translateY(${-44 * easeIn(leave(0))}px)`;
  // hers
  const sureStep = (sure.end - 0.8 - sure.at) / Math.max(1, sureWords.length);
  sureWords.forEach((w, i) => showWord(w, span(t, sure.at + i * sureStep, sure.at + i * sureStep + 0.38)));
  sureEl.style.opacity = String(1 - leave(1));
  sureEl.style.transform = `translateY(${-44 * easeIn(leave(1))}px)`;
  // handing it over
  const tool = span(t, 3.85, 4.2);
  toolEl.style.opacity = String(easeOut(tool) * (1 - leave(2)));
  toolEl.style.transform = `translateY(${(1 - easeOut(tool)) * 16 - 44 * easeIn(leave(2))}px)`;
  toolEl.querySelector(".spin").style.transform = `rotate(${t * 400}deg)`;
}

// her line over the office
const caption = $("#caption");
const capLine = $("#caption .line");
const capText = $("#caption .text");
const capBullet = $("#caption .bullet");
const OFFICE_LINES = TLo.lines.filter((l) => l.who === "thursday" && l.at > 7);
let capShown = null;
let capWords = [];
function overlayCaption(t) {
  let line = null;
  for (let i = 0; i < OFFICE_LINES.length; i++) {
    const l = OFFICE_LINES[i];
    const next = OFFICE_LINES[i + 1];
    const until = next ? Math.min(next.at - 0.05, l.end + 1.2) : l.end + 0.5;
    if (t >= l.at - 0.05 && t < until) line = { ...l, until };
  }
  const washIn = span(t, 8.2, 8.6) * (1 - span(t, 26.8, 27.0));
  caption.style.opacity = String(washIn);
  if (!line) {
    capLine.style.opacity = "0";
    return;
  }
  if (capShown !== line.id) {
    capWords = wordSpans(capText, text(line));
    capShown = line.id;
  }
  const n = capWords.length;
  const step = Math.min(0.16, (line.end - line.at - 0.4) / Math.max(1, n));
  capWords.forEach((w, i) => showWord(w, span(t, line.at + i * step, line.at + i * step + 0.4), 18));
  const out = span(t, line.until - 0.22, line.until);
  capLine.style.opacity = String(1 - out);
  capLine.style.transform = `translateY(${-18 * easeIn(out)}px)`;
  const lvl = voiceLevel(t);
  capBullet.style.transform = `scale(${(1 + 0.35 * lvl) * easeOutBack(span(t, line.at - 0.05, line.at + 0.25), 2)})`;
}

// the bots' names, as she says them
const pills = $("#pills");
const PILL_LINES = TLo.lines.filter((l) => l.bot);
const pillEls = {};
for (const l of PILL_LINES) {
  const el = document.createElement("div");
  el.className = "pill";
  el.innerHTML = `<i></i><b>${l.bot}</b><span>${LANG === "ko" ? "작업 중" : "working"}</span>`;
  pills.appendChild(el);
  pillEls[l.bot] = el;
}
function overlayPills(t) {
  for (const l of PILL_LINES) {
    const el = pillEls[l.bot];
    const shot = SHOTS.find((s) => s.id === l.bot.toLowerCase());
    const t0 = shot.at + 0.2;
    const t1 = shot.at + 2.0;
    const u = span(t, t0, t0 + 0.35);
    const on = t >= t0 && t < t1;
    el.style.display = on ? "flex" : "none";
    if (!on) continue;
    const [x, y] = bots[l.bot].seat;
    const s = botState(bots[l.bot], t);
    const head = V(x, y - 1.3, BOT * 1.08 + s.z).project(camera);
    const pw = el.offsetWidth;
    let px = (head.x * 0.5 + 0.5) * W - pw / 2;
    let py = (-head.y * 0.5 + 0.5) * H - 44 - 26;
    px = clamp(px, 70, W - 70 - pw);
    py = clamp(py, 600, 1200);
    const k = easeOutBack(u, 2.4);
    const out = span(t, t1 - 0.15, t1);
    el.style.transform = `translate(${px}px, ${py - 44}px) scale(${k * (1 - out * 0.2)})`;
    el.style.opacity = String(clamp(u * 2) * (1 - out));
  }
}

// the end card
const card = $("#card");
card.innerHTML = `
  <div class="title"></div>
  <div class="tag"><div class="l1"></div><div class="l2"></div></div>
  <div class="cmd"><em>&gt;</em>${TL.card.cmd}</div>
  <div class="dot" id="enddot" style="background: var(--brand)"></div>`;
const titleEl = card.querySelector(".title");
const titleLetters = [...TL.card.title].map((ch) => {
  const s = document.createElement("span");
  s.className = "word";
  s.textContent = ch;
  titleEl.appendChild(s);
  return s;
});
const tagLines = TL.card[LANG] ?? TL.card.en;
const l1 = wordSpans(card.querySelector(".l1"), tagLines[0]);
const l2 = wordSpans(card.querySelector(".l2"), tagLines[1]);
const cmdEl = card.querySelector(".cmd");
const endDot = card.querySelector("#enddot");
// the lockup: her name, her dot as its full stop, measured once the font is in
const TITLE = { size: 190, top: 672, period: 38, gap: 12 };
let lockup;
function measureLockup() {
  const c = document.createElement("canvas").getContext("2d");
  c.font = `900 ${TITLE.size}px Geist`;
  c.letterSpacing = `${-0.055 * TITLE.size}px`;
  const m = c.measureText(TL.card.title);
  const width = m.width;
  const full = width + TITLE.gap + TITLE.period;
  const left = (W - full) / 2;
  // line-height 1: the baseline sits half the leftover below the font's ascent
  const asc = m.fontBoundingBoxAscent;
  const desc = m.fontBoundingBoxDescent;
  const baseline = TITLE.top + (TITLE.size - (asc + desc)) / 2 + asc;
  titleEl.style.fontSize = `${TITLE.size}px`;
  titleEl.style.top = `${TITLE.top}px`;
  titleEl.style.left = `${left}px`;
  titleEl.style.right = "auto";
  titleEl.style.textAlign = "left";
  return { dot: { x: left + width + TITLE.gap + TITLE.period / 2, y: baseline - TITLE.period / 2 - 2 } };
}
function overlayCard(t) {
  const t0 = TLo.card.at;
  const flash = $("#flash");
  flash.style.opacity = String(easeIn(span(t, t0 - 0.45, t0)));
  flash.style.display = t >= t0 - 0.45 ? "block" : "none";
  card.style.display = t >= t0 ? "block" : "none";
  if (t < t0) return;
  // her dot alone first, then her name rising up to it, the dot landing as its full stop
  const pop = easeOutBack(span(t, t0 + 0.05, t0 + 0.45), 2.4);
  const move = easeInOut(span(t, t0 + 0.55, t0 + 1.05));
  const big = 64;
  const size = lerp(big, TITLE.period, move) * pop * (1 + 0.06 * Math.sin((t - t0) * Math.PI * 2) * (1 - move));
  const x = lerp(540, lockup.dot.x, move);
  const y = lerp(lockup.dot.y - 40, lockup.dot.y, move) - Math.sin(move * Math.PI) * 60;
  endDot.style.width = endDot.style.height = `${size}px`;
  endDot.style.left = `${x - size / 2}px`;
  endDot.style.top = `${y - size / 2}px`;
  titleLetters.forEach((s, i) => showWord(s, span(t, t0 + 0.55 + i * 0.04, t0 + 0.55 + i * 0.04 + 0.5), 70));
  l1.forEach((s, i) => showWord(s, span(t, t0 + 1.35 + i * 0.08, t0 + 1.35 + i * 0.08 + 0.45)));
  l2.forEach((s, i) => showWord(s, span(t, t0 + 1.8 + i * 0.08, t0 + 1.8 + i * 0.08 + 0.45)));
  const c = span(t, t0 + 2.6, t0 + 3.1);
  cmdEl.style.opacity = String(clamp(c * 1.5));
  cmdEl.style.transform = `translateX(-50%) translateY(${(1 - easeOutQuint(c)) * 30}px) scale(${lerp(0.94, 1, easeOutBack(c, 2))})`;
}

// ---------------------------------------------------------------- render: motion blur by accumulation
const rtOpts = { type: THREE.HalfFloatType, samples: 4 };
const rtSample = new THREE.WebGLRenderTarget(W, H, rtOpts);
const rtAccum = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadScene = new THREE.Scene();
const addMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: null }, weight: { value: 1 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: "uniform sampler2D map; uniform float weight; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(map, vUv).rgb * weight, 1.0); }",
  blending: THREE.AdditiveBlending,
  depthTest: false,
  depthWrite: false,
  transparent: true,
});
const copyMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: null } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: "uniform sampler2D map; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0); }",
  depthTest: false,
  depthWrite: false,
});
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), addMat);
quadScene.add(quad);

function render3D(t, samples, shutter) {
  if (samples <= 1) {
    setCamera(t);
    world(t);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    return;
  }
  renderer.setRenderTarget(rtAccum);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.setClearColor(0xffffff, 1);
  for (let i = 0; i < samples; i++) {
    const ti = t + shutter * (i / (samples - 1) - 0.5);
    setCamera(ti);
    world(ti, i === 0);
    renderer.setRenderTarget(rtSample);
    renderer.clear();
    renderer.render(scene, camera);
    quad.material = addMat;
    addMat.uniforms.map.value = rtSample.texture;
    addMat.uniforms.weight.value = 1 / samples;
    renderer.setRenderTarget(rtAccum);
    renderer.autoClear = false;
    renderer.render(quadScene, quadCam);
    renderer.autoClear = true;
  }
  quad.material = copyMat;
  copyMat.uniforms.map.value = rtAccum.texture;
  renderer.setRenderTarget(null);
  renderer.render(quadScene, quadCam);
  // leave the world at t itself for the overlays that follow it
  setCamera(t);
  world(t);
}

// how fast the camera moves at t: more samples where it moves more
function speedAt(t) {
  const dt = 1 / 60;
  const a = cameraAt(t - dt);
  const b = cameraAt(t + dt);
  if (shotAt(t - dt).id !== shotAt(t + dt).id) return 0;
  const move = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]);
  const la = new THREE.Vector3(...a.look).sub(new THREE.Vector3(...a.p)).normalize();
  const lb = new THREE.Vector3(...b.look).sub(new THREE.Vector3(...b.p)).normalize();
  const turn = la.angleTo(lb);
  return move / (2 * dt) / 60 + (turn / (2 * dt)) * 1.2 + Math.abs(b.fov - a.fov) * 2;
}

window.renderAt = async (t, opts = {}) => {
  const quality = opts.quality ?? 1;
  const fps = TL.fps;
  const t3 = t < CUT ? 7.0 : t + SHIFT;
  const show3D = t >= CUT && t3 < TLo.card.at;
  let samples = 1;
  if (quality > 0 && show3D) {
    const s = speedAt(t3);
    samples = s > 3 ? 16 : s > 1.2 ? 8 : s > 0.5 ? 5 : 3;
    if (opts.maxSamples) samples = Math.min(samples, opts.maxSamples);
  }
  const shutter = 0.5 / fps;
  document.getElementById("gl").style.visibility = show3D ? "visible" : "hidden";
  if (show3D) render3D(t3, samples, shutter);
  else {
    setCamera(t3);
    world(t3);
  }
  overlayChat(t);
  overlayCaption(t3);
  overlayPills(t3);
  overlayCard(t3);
  await new Promise((r) => requestAnimationFrame(() => r()));
  return samples;
};

await document.fonts.ready;
await Promise.all([
  document.fonts.load("500 66px Geist"),
  document.fonts.load("900 212px Geist"),
  document.fonts.load("500 46px 'Geist Mono'"),
  document.fonts.load("500 66px Pretendard", "한글"),
]);
chatLayout = layoutChat();
lockup = measureLockup();
window.ready = true;
