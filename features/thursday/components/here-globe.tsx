"use client";

import { useEffect, useRef, useState } from "react";
import { ASCII_FACE, HERE } from "@/config";
import { useIsDark } from "@/hooks/use-theme";
import {
  ALPHA_TOP,
  emojiAlpha,
  emojiWeight,
  hash,
  LEVELS,
  RAMP,
  smoothstep as ss,
} from "../ascii.const";
import { faceGlyphs } from "../face-glyphs";
import {
  type Box,
  type Country,
  cityIn,
  decodeWorld,
  fitView,
  project,
  type View,
  type World,
  wrap,
} from "../here-map";
import {
  type Sky,
  skyAt,
  type WeatherLook,
  weatherLook,
  windOf,
} from "../here-sky";
import type { Where } from "../thursday.schema";
import { DESIGN, GLYPH_FONT, REST_R } from "./ascii-orb";

/**
 * Her, turned into the world for the start of the day's first call: the globe spins to where
 * they are, dives until their country fills a field wider than her, and puts the sky over it
 * as it is there now — the sun or the moon where they really are, and the weather, lightly.
 * By night the country is dark land with its largest cities lit. Drawn on her own grid in her
 * own glyphs (ascii-orb), over her face, which it hides while it is up (Face `covered`); a tap
 * sends it back. The position never leaves the page (where.ts).
 */

/** What the globe shows: where they are, from this page alone, and the weather there. */
export type HereScene = {
  lat: number;
  lon: number;
  weather: NonNullable<Where["weather"]>;
};

/**
 * Where it has got to, for the page around it: `covering` as the world spreads through her,
 * `world` once she is wholly covered (her face stops drawing), `back` as she comes back (her
 * face returns under it), `done` when it is gone.
 */
export type HerePhase = "covering" | "world" | "back" | "done";

// ---------- what it is drawn from ----------

/** A city as public/here/cities.json packs it: name, latitude, longitude, people in thousands. */
type City = [string, number, number, number];

const loads: {
  world: Promise<World> | null;
  cities: Promise<City[]> | null;
} = { world: null, cities: null };

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return response.json();
}

/**
 * The map, fetched the first time a globe is wanted and kept for the page. A failure goes to
 * whoever waits and is not kept, so the next call asks again.
 */
export function loadWorld(): Promise<World> {
  loads.world ??= fetchJson("/here/world.json")
    .then(decodeWorld)
    .catch((cause) => {
      loads.world = null;
      throw cause;
    });
  return loads.world;
}

/** The cities that light up at night, largest first; fetched only for a night. */
function loadCities(): Promise<City[]> {
  loads.cities ??= fetchJson("/here/cities.json")
    .then((json) => {
      const cities = (json as { c?: unknown })?.c;
      if (!Array.isArray(cities))
        throw new Error("cities.json holds no cities");
      return cities as City[];
    })
    .catch((cause) => {
      loads.cities = null;
      throw cause;
    });
  return loads.cities;
}

// ---------- her grid and glyphs ----------

const { fontSize: GLYPH_PX, density: DENSITY } = ASCII_FACE;
/** Her cell pitch (ascii-orb), px. */
const CELL_W = (GLYPH_PX * 0.95) / DENSITY;
const CELL_H = (GLYPH_PX * 1.25) / DENSITY;
const TOP = LEVELS - 1;
const RAD = Math.PI / 180;
/** Slack on the frame cap (ascii-orb CAP_SLACK_MS). */
const CAP_SLACK_MS = 1000 / 240;
/** How many of their country's cities light up at night: the largest, one light each. */
const LIT_CITIES = 10;

type GlyphSet = {
  emoji: readonly string[];
  /** Her letters where she is drawn in letters: her ramp at the cell's brightness, or these. */
  letters: readonly string[] | "ramp";
  /** Changes a second, for glyphs not held to the ground under them. */
  churn: number;
};

/** What each part is drawn in: emoji of one colour family, like her washes. */
const SETS = {
  trees: {
    emoji: ["🌳", "🌲", "🌳", "🥦", "🌲", "🟢", "🌳"],
    letters: "ramp",
    churn: 0,
  },
  sea: {
    emoji: ["🌊", "🔵", "💙", "🌊", "🐳", "🔵", "💧", "🐬"],
    letters: [".", "·", "~", "-"],
    churn: 0,
  },
  nightLand: {
    emoji: ["🌑", "🖤", "⚫", "🌑", "🖤", "🎱", "⚫", "🫐"],
    letters: "ramp",
    churn: 0,
  },
  cityLight: {
    emoji: ["✨", "🌟", "⭐", "💛", "🟡"],
    letters: ["+", "*", "*"],
    churn: 0.6,
  },
  sunBody: {
    emoji: ["☀️", "🌻", "🍋", "⭐", "💛", "🧡", "🍊", "🌟", "🌼", "🐥"],
    letters: "ramp",
    churn: 0.45,
  },
  moonBody: {
    emoji: ["🌕", "💛", "⭐", "🌟", "🤍", "🍋", "🌙", "🌼"],
    letters: "ramp",
    churn: 0.3,
  },
  snowGround: { emoji: ["❄️", "🤍", "⚪"], letters: ["*", "+", "x"], churn: 0 },
  spark: { emoji: ["✨"], letters: ["·", "+"], churn: 0.8 },
  star: { emoji: ["✨", "⭐"], letters: ["·", "+", "*"], churn: 0.4 },
  cloud: {
    emoji: ["☁️", "🤍", "⚪", "☁️", "🤍", "☁️"],
    letters: [".", ":", "-", "~", "=", "c", "o"],
    churn: 0.25,
  },
  cGrey: {
    emoji: ["☁️", "🌫️", "☁️", "🌥️", "⚪"],
    letters: [".", ":", "-", "~", "=", "c", "o"],
    churn: 0.25,
  },
  cRain: {
    emoji: ["🌧️", "☁️", "🌫️", "☁️", "💧"],
    letters: [".", ":", "-", "~", "=", "c", "o"],
    churn: 0.3,
  },
  cStorm: {
    emoji: ["⛈️", "🌩️", "☁️", "🌧️", "🖤"],
    letters: [".", ":", ";", "=", "x", "X"],
    churn: 0.4,
  },
  cSnow: {
    emoji: ["🌨️", "☁️", "🤍", "❄️", "⚪"],
    letters: [".", ":", "-", "~", "=", "c", "o"],
    churn: 0.25,
  },
  cyclone: {
    emoji: ["☁️", "🌫️", "☁️", "🌧️", "🌀"],
    letters: [".", ":", "-", "~", "=", "c", "o"],
    churn: 0.3,
  },
  fog: { emoji: ["🌫️"], letters: ["~", "-", "="], churn: 0.2 },
  drop: { emoji: ["💧"], letters: ["'", "|", "|"], churn: 0 },
  flake: { emoji: ["❄️"], letters: ["*", "+"], churn: 0 },
  wind: { emoji: ["💨"], letters: ["~", "-", "="], churn: 0 },
  bolt: { emoji: ["⚡"], letters: ["/", "\\"], churn: 0 },
} satisfies Record<string, GlyphSet>;

type SetName = keyof typeof SETS;

/** How each look of the weather is drawn: small clouds, their set, rain, snow and fog, 0 to 1. */
const WEATHER: Record<
  WeatherLook,
  { clouds: number; set: SetName; rain: number; snow: number; fog: number }
> = {
  clear: { clouds: 0, set: "cloud", rain: 0, snow: 0, fog: 0 },
  partly: { clouds: 2, set: "cloud", rain: 0, snow: 0, fog: 0 },
  overcast: { clouds: 5, set: "cGrey", rain: 0, snow: 0, fog: 0 },
  fog: { clouds: 0, set: "cloud", rain: 0, snow: 0, fog: 1 },
  drizzle: { clouds: 0, set: "cGrey", rain: 0.3, snow: 0, fog: 0 },
  rain: { clouds: 0, set: "cRain", rain: 0.6, snow: 0, fog: 0 },
  heavy: { clouds: 0, set: "cRain", rain: 1, snow: 0, fog: 0 },
  snow: { clouds: 0, set: "cSnow", rain: 0, snow: 0.8, fog: 0 },
  storm: { clouds: 2, set: "cStorm", rain: 0.7, snow: 0, fog: 0 },
};

/**
 * The choreography, in seconds from its start. Drawing, not tuning: how long it stays is the
 * one number that is (config HERE `globeMs`).
 */
const AT = {
  /** the world spreads through her from the middle out */
  cover: [0.1, 1.0],
  /** and she grows a little, as a globe */
  grow: [0.2, 1.8],
  /** turning fast, then gliding to a stop over them */
  spin: [0.2, 3.4],
  /** down until their country fills the frame */
  dive: [3.0, 5.2],
  /** past her circle into a field */
  open: [3.0, 3.8],
  /** everything but their country falls away */
  only: [3.3, 4.8],
  /** by night their land goes dark, cell by cell */
  dark: [4.4, 5.4],
  /** and its cities light up, the largest first */
  lights: [5.4, 7.2],
  pin: [5.1, 5.5],
  ripple: [5.1, 7.3],
  /** the sun or the moon comes out */
  orb: [5.8, 6.6],
  weather: [6.4, 7.6],
  /** from its end to gone */
  leave: 1.4,
} as const;

// ---------- noise, on the design's own hashes ----------

/** Integer hash to [0, 1): the same (x, y) always gives the same. */
function ih(x: number, y: number) {
  let h =
    Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul((y | 0) + 0x165667b1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const ih3 = (x: number, y: number, z: number) =>
  ih(x + Math.imul(z, 7919), y - Math.imul(z, 104729));

function valueNoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = ih(xi, yi);
  const b = ih(xi + 1, yi);
  const c = ih(xi, yi + 1);
  const d = ih(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm2(x: number, y: number, octaves: number) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq + i * 17.3, y * freq - i * 9.1);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const plane = (z0: number) =>
    lerp(
      lerp(ih3(xi, yi, z0), ih3(xi + 1, yi, z0), u),
      lerp(ih3(xi, yi + 1, z0), ih3(xi + 1, yi + 1, z0), u),
      v,
    );
  return lerp(plane(zi), plane(zi + 1), w);
}

function fbm3(x: number, y: number, z: number, octaves: number) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * freq + i * 5.7, y * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const bump = (x: number, c: number, w: number) =>
  Math.max(0, 1 - Math.abs(x - c) / w);
/** Past the end and back: how she grows. */
const backOut = (x: number) => 1 + 2.35 * (x - 1) ** 3 + 1.35 * (x - 1) ** 2;
const inOut = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;

// ---------- the map, drawn to rasters it is sampled from ----------

type Raster = {
  west: number;
  east: number;
  south: number;
  north: number;
  dlon: number;
  dlat: number;
  w: number;
  h: number;
  /** Per pixel: 1 land, 2 their country. */
  data: Uint8Array;
};

/** Land (1) and their country (2) over a window, `step` degrees a pixel, from the outlines. */
function rasterize(
  world: World,
  win: { west: number; east: number; south: number; north: number },
  step: number,
  home: number,
  all: boolean,
): Raster {
  const w = Math.max(
    8,
    Math.min(2048, Math.round((win.east - win.west) / step)),
  );
  const h = Math.max(
    8,
    Math.min(2048, Math.round((win.north - win.south) / step)),
  );
  const dlon = (win.east - win.west) / w;
  const dlat = (win.north - win.south) / h;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("The browser gave no canvas to draw the map on.");
  // every ring again 360° to either side, for a window across 180° and a ring unwrapped past it
  const shifts = [-360, 0, 360];
  const hit = (box: Box) =>
    box[3] >= win.south &&
    box[2] <= win.north &&
    shifts.some((s) => box[1] + s >= win.west && box[0] + s <= win.east);
  const trace = (path: Path2D, ring: Float32Array, shift: number) => {
    for (let i = 0; i < ring.length; i += 2) {
      const px = (ring[i] + shift - win.west) / dlon;
      const py = (win.north - ring[i + 1]) / dlat;
      if (i === 0) path.moveTo(px, py);
      else path.lineTo(px, py);
    }
    path.closePath();
  };
  const country = (path: Path2D, c: Country) => {
    for (const poly of c.polys)
      if (hit(poly.bbox))
        for (const shift of shifts)
          for (const ring of poly.rings) trace(path, ring, shift);
  };
  if (all) {
    const land = new Path2D();
    world.countries.forEach((c, k) => {
      if (k !== home && hit(c.bbox)) country(land, c);
    });
    ctx.fillStyle = "#ff0000";
    ctx.fill(land, "evenodd");
  }
  if (home >= 0) {
    const theirs = new Path2D();
    country(theirs, world.countries[home]);
    ctx.fillStyle = "#ffff00";
    ctx.fill(theirs, "evenodd");
  }
  const pixels = ctx.getImageData(0, 0, w, h).data;
  const data = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < data.length; i += 4, j++)
    data[j] = (pixels[i] > 127 ? 1 : 0) | (pixels[i + 1] > 127 ? 2 : 0);
  return { ...win, dlon, dlat, w, h, data };
}

/** The raster at a point; -1 outside it. */
function sample(r: Raster | null, lat: number, lon: number) {
  if (!r || lat > r.north || lat < r.south) return -1;
  let x = lon;
  if (x < r.west) x += 360;
  else if (x >= r.east) x -= 360;
  if (x < r.west || x >= r.east) return -1;
  const px = Math.min(r.w - 1, ((x - r.west) / r.dlon) | 0);
  const py = Math.min(r.h - 1, ((r.north - lat) / r.dlat) | 0);
  return r.data[py * r.w + px];
}

/** The whole world once a page, for the globe while it turns. */
let wholeWorld: { world: World; raster: Raster } | null = null;
function worldRaster(world: World): Raster {
  if (wholeWorld?.world !== world)
    wholeWorld = {
      world,
      raster: rasterize(
        world,
        { west: -180, east: 180, south: -90, north: 90 },
        360 / 2048,
        -1,
        true,
      ),
    };
  return wholeWorld.raster;
}

// ---------- the grid ----------

type Grid = {
  width: number;
  height: number;
  /** Her canvas, px: the globe starts at her size, on her cells. */
  face: number;
  /** px per reference unit (ascii-orb DESIGN). */
  k: number;
  /** The unit the weather, the lights and the marks are sized in, px. */
  p: number;
  cols: number;
  rows: number;
  /** Her column and row of the first cell: her grid carried out to the frame's edges. */
  col0: number;
  row0: number;
  left: number;
  top: number;
  n: number;
  x: Float32Array;
  y: Float32Array;
  /** From the centre, reference units. */
  dx: Float32Array;
  dy: Float32Array;
  gx: Int32Array;
  gy: Int32Array;
  seed: Float32Array;
  grain: Float32Array;
  /** How near the frame's edge, 0 at the centre to 1 at it (a rounded rectangle). */
  edge: Float32Array;
  /** Noise the frame's edge is broken with. */
  fray: Float32Array;
  /** Over her canvas: where her face is under the globe. */
  onFace: Uint8Array;
};

function buildGrid(width: number, height: number): Grid {
  const face = height;
  const k = face / DESIGN;
  // her cells sit at c·w + w/2 from her canvas's left; the frame is centred on her
  const left = (width - face) / 2;
  const top = (height - face) / 2;
  const col0 = Math.ceil(-left / CELL_W);
  const col1 = Math.floor((width - left) / CELL_W) - 1;
  const row0 = Math.ceil(-top / CELL_H);
  const row1 = Math.floor((height - top) / CELL_H) - 1;
  const cols = col1 - col0 + 1;
  const rows = row1 - row0 + 1;
  const n = cols * rows;
  const grid: Grid = {
    width,
    height,
    face,
    k,
    p: Math.max(6.5, Math.min(10, face / 44)),
    cols,
    rows,
    col0,
    row0,
    left,
    top,
    n,
    x: new Float32Array(n),
    y: new Float32Array(n),
    dx: new Float32Array(n),
    dy: new Float32Array(n),
    gx: new Int32Array(n),
    gy: new Int32Array(n),
    seed: new Float32Array(n),
    grain: new Float32Array(n),
    edge: new Float32Array(n),
    fray: new Float32Array(n),
    onFace: new Uint8Array(n),
  };
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const gx = col0 + c;
      const gy = row0 + r;
      const x = left + gx * CELL_W + CELL_W / 2;
      const y = top + gy * CELL_H + CELL_H / 2;
      const fx = (x - width / 2) / (width / 2);
      const fy = (y - height / 2) / (height / 2);
      grid.x[i] = x;
      grid.y[i] = y;
      grid.dx[i] = (x - width / 2) / k;
      grid.dy[i] = (y - height / 2) / k;
      grid.gx[i] = gx;
      grid.gy[i] = gy;
      grid.seed[i] = hash(gx * 1.7, gy * 2.3);
      grid.grain[i] = hash(gx + 31.3, gy + 17.9);
      grid.edge[i] = (fx ** 4 + fy ** 4) ** 0.25;
      grid.fray[i] = valueNoise(gx * 0.2, gy * 0.26);
      grid.onFace[i] =
        Math.abs(x - width / 2) <= face / 2 &&
        Math.abs(y - height / 2) <= face / 2
          ? 1
          : 0;
    }
  return grid;
}

// ---------- where it lands, and the sky there ----------

type Lights = {
  /** Per cell, how brightly a city lights it. */
  glow: Float32Array;
  /** Per cell, which city it belongs to, largest first: they come on in that order. */
  order: Float32Array;
  count: number;
};

type Stage = {
  world: World;
  view: View;
  /** Sharp where it lands; the rest of the world comes from the coarse one. */
  region: Raster;
  global: Raster;
  /** Their country alone, for knowing it while the globe still turns. */
  home: Raster | null;
  sky: Sky;
  ms: number;
  look: WeatherLook | null;
  wind: 0 | 1 | 2;
  /** Their cities by night; null until they have been placed, or with none to place. */
  lights: Lights | null;
};

function stageFor(world: World, scene: HereScene, grid: Grid): Stage {
  const { k } = grid;
  const frame = {
    width: grid.width / k,
    height: grid.height / k,
    least: REST_R * 1.6,
  };
  const view = fitView(world, scene.lat, scene.lon, frame);
  const aH = Math.asin(Math.min(1, frame.height / 2 / view.radius)) / RAD;
  const aW = Math.asin(Math.min(1, frame.width / 2 / view.radius)) / RAD;
  const south = Math.max(-89.9, view.latc - aH * 1.3 - 1);
  const north = Math.min(89.9, view.latc + aH * 1.3 + 1);
  const lonHalf = Math.min(
    180,
    (aW * 1.3 + 1) /
      Math.max(
        0.15,
        Math.cos(
          Math.min(85, Math.max(Math.abs(south), Math.abs(north))) * RAD,
        ),
      ),
  );
  const cellDeg = CELL_W / k / view.radius / RAD;
  const region = rasterize(
    world,
    {
      west: view.lonc - lonHalf,
      east: view.lonc + lonHalf,
      south,
      north,
    },
    Math.max(0.008, cellDeg / 2.5),
    view.home,
    true,
  );
  let home: Raster | null = null;
  if (view.home >= 0) {
    const [west, east, s, n] = world.countries[view.home].bbox;
    home = rasterize(
      world,
      { west: west - 1, east: east + 1, south: s - 1, north: n + 1 },
      Math.max(0.05, (east - west + 2) / 1024, (n - s + 2) / 1024),
      view.home,
      false,
    );
  }
  const ms = Date.now();
  return {
    world,
    view,
    region,
    global: worldRaster(world),
    home,
    sky: skyAt(scene.lat, scene.lon, ms, -new Date(ms).getTimezoneOffset()),
    ms,
    look: weatherLook(scene.weather.code),
    wind: windOf(scene.weather.gusts),
    lights: null,
  };
}

/** Their largest cities where they fall on the frame, each a glow as wide as the city is big. */
function lightsOf(stage: Stage, grid: Grid, cities: City[]): Lights {
  const { view, world } = stage;
  const lit: [number, number, number][] = [];
  for (const [, lat, lon, people] of cities) {
    if (lit.length >= LIT_CITIES) break;
    const at = project(lat, lon, view.latc, view.lonc, view.radius);
    if (!at.seen) continue;
    const x = grid.width / 2 + at.x * grid.k;
    const y = grid.height / 2 + at.y * grid.k;
    if (x < 0 || y < 0 || x > grid.width || y > grid.height) continue;
    // a borough beside its city, or a suburb, is part of the same light
    if (lit.some(([cx, cy]) => Math.hypot(cx - x, cy - y) < grid.p * 2.6))
      continue;
    if (cityIn(world, view.home, lat, lon)) lit.push([x, y, people]);
  }
  const glow = new Float32Array(grid.n);
  const order = new Float32Array(grid.n).fill(99);
  lit.forEach(([x, y, people], which) => {
    const r = grid.p * (0.7 + 0.9 * Math.log10(people / 250 + 1));
    const c0 = Math.max(
      0,
      Math.floor((x - r - grid.left) / CELL_W) - grid.col0,
    );
    const c1 = Math.min(
      grid.cols - 1,
      Math.ceil((x + r - grid.left) / CELL_W) - grid.col0,
    );
    const r0 = Math.max(0, Math.floor((y - r - grid.top) / CELL_H) - grid.row0);
    const r1 = Math.min(
      grid.rows - 1,
      Math.ceil((y + r - grid.top) / CELL_H) - grid.row0,
    );
    for (let row = r0; row <= r1; row++)
      for (let col = c0; col <= c1; col++) {
        const i = row * grid.cols + col;
        const b = ss(r, r * 0.35, Math.hypot(grid.x[i] - x, grid.y[i] - y));
        if (b > glow[i]) {
          glow[i] = b;
          order[i] = Math.min(order[i], which);
        }
      }
  });
  return { glow, order, count: lit.length };
}

// ---------- a frame ----------

type Cloud = {
  x: number;
  y: number;
  r: number;
  puffs: [number, number, number][];
  bottom: number;
  width: number;
};

/** What one frame shows, worked out once and read by every cell. */
type Plan = {
  /** Seconds since it started, and the clock the glyphs churn on. */
  tt: number;
  t: number;
  cover: number;
  back: number;
  stay: number;
  latc: number;
  lonc: number;
  /** The globe's radius, reference units. */
  R: number;
  /** Glyphs stay with the ground: one bin of this many degrees per cell at this zoom. */
  bin: number;
  lvl: number;
  /** How far in it has dived: the sea thins as it does, so the land reads. */
  zoomed: number;
  open: number;
  only: number;
  night: number;
  dark: number;
  lightsOn: number;
  pinA: number;
  ripple: number;
  pinX: number;
  pinY: number;
  pinSeen: boolean;
  orbA: number;
  orbGrow: number;
  orb: {
    x: number;
    y: number;
    R: number;
    set: SetName;
    shadow: number | null;
  } | null;
  wAmt: number;
  clouds: Cloud[];
  cloudSet: SetName;
  fog: number;
  flash: number;
  flashCloud: number;
  storm: { x: number; y: number; R: number; dir: number; rot: number } | null;
  /** The still part, drawn once and kept (the country between the dive and the leaving). */
  layered: boolean;
  key: string | null;
};

/** One cell as it is worked out. */
type Out = {
  v: number;
  set: SetName;
  /** A key held to the ground under the cell, so its glyph stays with it; null churns. */
  hk: number | null;
  big: number;
  land: boolean;
  a: number;
};

type Pass = "all" | "base" | "overlay";

/** The globe, ready to draw frames: its grid, where it lands, and what the frames share. */
class Globe {
  grid: Grid;
  stage: Stage;
  letters: boolean;
  /** Effects placed at points for this frame: rain, snow, stars, bolts, wind. */
  over: Float32Array;
  overSet: (SetName | null)[];
  overBig: Float32Array;
  /** The still country as it was last drawn, and what each cell of it is. */
  base: HTMLCanvasElement | null = null;
  baseKey: string | null = null;
  baseV: Float32Array;
  baseLand: Uint8Array;
  baseHK: Int32Array;
  baseSet: (SetName | null)[];
  plan: Plan;
  out: Out = { v: 0, set: "trees", hk: null, big: 1, land: false, a: 1 };
  /** Asked for cities once: the night's lights come when they arrive. */
  askedCities = false;

  constructor(grid: Grid, stage: Stage, letters: boolean) {
    this.grid = grid;
    this.stage = stage;
    this.letters = letters;
    this.over = new Float32Array(grid.n);
    this.overSet = new Array(grid.n).fill(null);
    this.overBig = new Float32Array(grid.n);
    this.baseV = new Float32Array(grid.n);
    this.baseLand = new Uint8Array(grid.n);
    this.baseHK = new Int32Array(grid.n);
    this.baseSet = new Array(grid.n).fill(null);
    this.plan = {} as Plan;
  }

  /** A glyph put at a point for this frame, over whatever the cell holds. */
  put(x: number, y: number, v: number, set: SetName, big = 1) {
    const g = this.grid;
    const col = Math.round((x - g.left - CELL_W / 2) / CELL_W) - g.col0;
    const row = Math.round((y - g.top - CELL_H / 2) / CELL_H) - g.row0;
    if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) return;
    const i = row * g.cols + col;
    if (v > this.over[i]) {
      this.over[i] = v;
      this.overSet[i] = set;
      this.overBig[i] = big;
    }
  }

  /** Land (1) and their country (2) at a point. */
  land(lat: number, lon: number) {
    const s = this.stage;
    const near = sample(s.region, lat, lon);
    if (near >= 0) return near;
    const code = sample(s.global, lat, lon) & 1;
    if (!code) return 0;
    const theirs = sample(s.home, lat, lon);
    return theirs > 0 && theirs & 2 ? 3 : 1;
  }

  /** The frame at `tt` seconds in, gone from `backAt`. */
  planAt(tt: number, t: number, backAt: number): Plan {
    const f = this.plan;
    const g = this.grid;
    const s = this.stage;
    const V = s.view;
    const S = s.sky;
    f.tt = tt;
    f.t = t;
    f.cover = ss(AT.cover[0], AT.cover[1], tt);
    f.back = ss(backAt, backAt + AT.leave, tt);
    f.stay = 1 - ss(backAt - 0.2, backAt + 0.4, tt);
    // she turns into the globe and spins to them
    const grown =
      REST_R + REST_R * 0.32 * backOut(ss(AT.grow[0], AT.grow[1], tt));
    const u = clamp01((tt - AT.spin[0]) / (AT.spin[1] - AT.spin[0]));
    const e = 1 - (1 - u) ** 4;
    const lat1 = 14 + (V.lat - 14) * e;
    const lon1 = V.lon - 320 * (1 - e);
    // then dives until their country fills the frame; everything else falls away on the way in
    const z = inOut(ss(AT.dive[0], AT.dive[1], tt));
    f.R =
      z > 0
        ? Math.exp(Math.log(grown) + (Math.log(V.radius) - Math.log(grown)) * z)
        : grown;
    f.latc = lat1 + (V.latc - V.lat) * z;
    f.lonc = lon1 + wrap(V.lonc - V.lon) * z;
    const cellDeg = CELL_W / g.k / f.R / RAD;
    f.lvl = Math.max(0, Math.ceil(Math.log2(cellDeg / 0.02)));
    f.bin = 0.02 * 2 ** f.lvl;
    f.zoomed = clamp01((f.R / (REST_R * 1.32) - 1) / 3);
    f.open = ss(AT.open[0], AT.open[1], tt);
    f.only = ss(AT.only[0], AT.only[1], tt);
    f.pinA = ss(AT.pin[0], AT.pin[1], tt) * f.stay;
    f.ripple =
      tt > AT.ripple[0] && tt < AT.ripple[1]
        ? ((tt - AT.ripple[0]) % 1.1) / 1.1
        : -1;
    f.orbA = ss(AT.orb[0], AT.orb[1], tt) * f.stay;
    f.orbGrow = backOut(ss(AT.orb[0], AT.orb[0] + 1.2, tt)) * f.stay;
    f.wAmt = ss(AT.weather[0], AT.weather[1], tt) * f.stay;
    // how dark it is there now: day, dusk, night
    f.night = ss(0.06, -0.1, Math.sin(S.alt));
    f.dark = f.night * ss(AT.dark[0], AT.dark[1], tt);
    f.lightsOn = ss(AT.lights[0], AT.lights[1], tt);
    if (f.dark > 0 && !this.askedCities) {
      this.askedCities = true;
      loadCities().then(
        (cities) => {
          s.lights = lightsOf(s, g, cities);
          this.baseKey = null;
        },
        (cause) =>
          console.warn(
            `No city lights on the globe: ${cause instanceof Error ? cause.message : String(cause)}`,
          ),
      );
    }
    this.planSky(f, S, s.ms, t);
    this.planWeather(f, t);
    // still between the dive and the leaving: their country is drawn once and kept
    const still = tt >= AT.dive[1] + 0.05 && f.back <= 0;
    f.layered = still;
    f.key = still
      ? [
          Math.round(f.dark * 12),
          Math.round(f.lightsOn * 12),
          s.lights ? 1 : 0,
        ].join("|")
      : null;
    const pin = project(V.lat, V.lon, f.latc, f.lonc, f.R);
    f.pinX = g.width / 2 + pin.x * g.k;
    f.pinY = g.height / 2 + pin.y * g.k;
    f.pinSeen = pin.seen;
    return f;
  }

  /** Up in the sky over their country: morning to the left, evening to the right, higher when it is. */
  planSky(f: Plan, S: Sky, ms: number, t: number) {
    const g = this.grid;
    f.orb = null;
    if (f.orbA <= 0) return;
    const at = (from: number, to: number, alt: number, top: number) => [
      g.width * (0.12 + (0.76 * (ms - from)) / (to - from)),
      g.height * (0.3 - (0.2 * Math.max(0, alt)) / Math.max(0.05, top)),
    ];
    const R = Math.max(3.2 * g.p, g.height * 0.06) / g.k;
    const lift = (1 - Math.min(1, f.orbGrow)) * g.height * 0.05;
    const orb = (
      x: number,
      y: number,
      r: number,
      set: SetName,
      shadow: number | null,
    ) => ({
      x: (x - g.width / 2) / g.k,
      y: (y + lift - g.height / 2) / g.k,
      R: r * Math.max(0, f.orbGrow),
      set,
      shadow,
    });
    if (S.up || S.polarDay) {
      const from = S.rise !== null && !S.polarDay ? S.rise : S.midnight;
      const to =
        S.set !== null && !S.polarDay ? S.set : S.midnight + 86_400_000;
      const [x, y] = at(from, to, S.alt, S.top);
      f.orb = orb(x, y, R, "sunBody", null);
      return;
    }
    if (S.moon) {
      // lit as it is tonight: the shadow slides off one side as it waxes and back over the other as it wanes
      const [x, y] = at(S.moon.rise, S.moon.set, S.moon.alt, S.moon.top);
      f.orb = orb(
        x,
        y,
        R * 0.9,
        "moonBody",
        (S.moon.phase < 0.5 ? -1 : 1) * 2 * S.moon.lit,
      );
    }
    for (let i = 0; i < 18; i++) {
      const twinkle = 0.5 + 0.5 * Math.sin(t * (1 + ih(i, 73) * 1.5) + i * 2.1);
      this.put(
        g.width * (0.04 + 0.92 * ih(i, 71)),
        g.height * (0.03 + 0.26 * ih(i, 72)),
        (0.2 + 0.5 * twinkle * twinkle) * f.orbA,
        "star",
        0.85 + 0.3 * ih(i, 74),
      );
    }
  }

  /** Light: a few small clouds up in the sky, rain and snow falling thinly, never a sheet over the map. */
  planWeather(f: Plan, t: number) {
    const g = this.grid;
    const p = g.p;
    const look = this.stage.look;
    const w = look ? WEATHER[look] : WEATHER.clear;
    const wind = this.stage.wind;
    f.cloudSet = w.set;
    f.fog = w.fog * f.wAmt;
    f.flash = 0;
    f.flashCloud = -1;
    f.clouds = [];
    f.storm = null;
    if (f.wAmt <= 0 || !look) return;
    const n = w.clouds;
    for (let i = 0; i < n; i++) {
      const r = p * (2 + 0.8 * ih(i, 11)) * (look === "overcast" ? 1.3 : 1);
      const span = g.width + 8 * r;
      const base =
        4 * r + ((i + 0.5) / n + (ih(i, 13) - 0.5) * (0.5 / n)) * g.width;
      const x = ((base + p * (0.3 + 0.35 * ih(i, 12)) * t) % span) - 4 * r;
      const y = g.height * (0.07 + 0.2 * ih(i, 14));
      f.clouds.push({
        x,
        y,
        r,
        puffs: [
          [-r * 0.9, r * 0.1, r * 0.75],
          [0, -r * 0.2, r],
          [r * 0.9, r * 0.12, r * 0.7],
        ],
        bottom: y + r * 0.6,
        width: r * 3,
      });
    }
    const slant =
      wind === 2 || look === "storm"
        ? 0.3
        : look === "heavy" || wind
          ? 0.15
          : 0.08;
    // rain, thinly, across the frame: short drops, no clouds in the way
    if (w.rain > 0) {
      const lanes = Math.max(3, Math.round((g.width / p) * 0.16 * w.rain));
      const len =
        look === "drizzle" ? 1 : look === "heavy" || look === "storm" ? 3 : 2;
      const drops = w.rain > 0.8 ? 2 : 1;
      const span = g.height + (len + 4) * p;
      for (let lane = 0; lane < lanes; lane++) {
        const lx =
          g.width * ((lane + 0.5) / lanes) +
          (ih(lane, 21) - 0.5) * (g.width / lanes);
        const speed =
          p * (14 + 8 * ih(lane, 22)) * (look === "drizzle" ? 0.6 : 1);
        for (let j = 0; j < drops; j++) {
          const d =
            (t * speed + ih(lane, 23) * span + (j * span) / drops) % span;
          for (let q = 0; q < len * 1.4; q++) {
            const y = d - q * CELL_H;
            if (y < 0) break;
            this.put(
              lx + y * slant,
              y,
              (0.62 - (q / len) * 0.13) * f.wAmt,
              "drop",
              0.8,
            );
          }
        }
      }
    }
    // snow drifts down slowly, swaying
    if (w.snow > 0) {
      const flakes = Math.max(4, Math.round((g.width / p) * 0.22 * w.snow));
      const span = g.height + p * 4;
      for (let k = 0; k < flakes; k++) {
        const y = (t * p * (1.4 + 1.2 * ih(k, 31)) + ih(k, 32) * span) % span;
        this.put(
          g.width * ih(k, 33) + Math.sin(t * 1.1 + k) * p * 0.9,
          y,
          (0.55 + 0.25 * ih(k, 34)) * f.wAmt,
          "flake",
          0.8,
        );
      }
    }
    // now and then a bolt from one of the storm's clouds, and that cloud lights up
    if (look === "storm" && f.clouds.length) {
      const phase = t % 4.3;
      const slot = Math.floor(t / 4.3);
      const which = slot % f.clouds.length;
      const cloud = f.clouds[which];
      f.flash = Math.exp(-((phase - 0.3) ** 2) / 0.008) * f.wAmt;
      f.flashCloud = which;
      if (phase > 0.22 && phase < 0.7) {
        let x = cloud.x + (ih(slot, 41) - 0.5) * cloud.r;
        let y = cloud.bottom;
        for (let q = 0; q < 11; q++) {
          this.put(x, y, (1 - ss(0.5, 0.7, phase)) * f.wAmt, "bolt", 1);
          x += (ih(slot * 9 + q, 42) - 0.5) * p * 1.3;
          y += CELL_H;
        }
      }
    }
    // wind: streaks blowing across; past a storm's gusts, a storm turning off to the side, the
    // way storms turn in their hemisphere
    if (wind > 0) {
      for (let i = 0; i < (wind === 2 ? 10 : 6); i++) {
        const x =
          ((ih(i, 52) * g.width + t * p * (9 + 5 * ih(i, 53))) %
            (g.width + p * 6)) -
          p * 3;
        this.put(
          x,
          g.height * (0.1 + 0.75 * ih(i, 51)) + Math.sin(t * 2 + i) * p * 0.4,
          0.5 * f.wAmt,
          "wind",
          0.8,
        );
      }
    }
    if (wind === 2) {
      const dir = this.stage.view.lat < 0 ? -1 : 1;
      f.storm = {
        x: g.width * 0.15,
        y: g.height * 0.3,
        R: g.height * 0.17,
        dir,
        rot: -dir * t * 1.6,
      };
    }
  }

  cloudAt(x: number, y: number, t: number, f: Plan) {
    let d = 0;
    for (let i = 0; i < f.clouds.length; i++) {
      const cloud = f.clouds[i];
      if (
        Math.abs(x - cloud.x) > cloud.width ||
        Math.abs(y - cloud.y) > cloud.r * 1.7
      )
        continue;
      const lit = i === f.flashCloud ? 1 + f.flash : 1;
      for (const [px, py, pr] of cloud.puffs)
        d = Math.max(
          d,
          ss(pr, pr * 0.45, Math.hypot(x - cloud.x - px, y - cloud.y - py)) *
            lit,
        );
    }
    const T = f.storm;
    if (T) {
      const dx = x - T.x;
      const dy = y - T.y;
      const r = Math.hypot(dx, dy) / T.R;
      if (r < 1) {
        // bands spiral in to the eye, and turn
        const arms =
          0.5 +
          0.5 *
            Math.cos(
              2 * (Math.atan2(dy, dx) + T.dir * t * 0.6) -
                T.dir * 5 * Math.log(r * 5 + 0.2),
            );
        let q =
          arms ** 1.8 * ss(1, 0.45, r) +
          ss(0.1, 0.16, r) * ss(0.32, 0.2, r) * 0.8;
        q *= ss(0.12, 0.2, r);
        d = Math.max(d, q);
      }
    }
    return clamp01(d);
  }

  /** A small living cluster of glyphs, the way her body is: the sun and the moon are drawn so. */
  body(i: number, R: number, cx: number, cy: number, t: number) {
    const g = this.grid;
    if (R <= 0) return 0;
    const dx = g.dx[i] - cx;
    const dy = g.dy[i] - cy;
    const d = Math.hypot(dx, dy);
    if (d > R * 1.6) return 0;
    const nz = fbm3(dx * 0.0085 + 3.1, dy * 0.0085, t * 0.32, 3);
    const edge = R * (0.86 + 0.34 * nz);
    let v = ss(edge, edge * 0.45, d);
    if (v < 0.25 && g.seed[i] < 0.3) {
      const halo = ss(edge * 1.4, edge, d);
      if (halo > 0)
        v = Math.max(
          v,
          halo * 0.35 * (0.5 + 0.5 * Math.sin(t * 1.7 + g.seed[i] * 40)),
        );
    }
    return v * (0.78 + 0.22 * g.grain[i]);
  }

  /** Whether a front from the middle out has reached a cell: how she turns into the world, and back. */
  reached(i: number, progress: number, slot: number) {
    if (progress <= 0) return false;
    if (progress >= 1) return true;
    const g = this.grid;
    const d = Math.hypot(g.dx[i], g.dy[i]);
    const nz = fbm2(
      g.dx[i] * 0.011 + slot * 7.3,
      g.dy[i] * 0.011 + slot * 1.9,
      2,
    );
    return d + (nz - 0.5) * 220 < progress * 640 - 60;
  }

  /** The ground under a cell: land as trees, sea as water; by night their land dark and their cities lit. */
  mapCell(i: number, f: Plan, o: Out) {
    const g = this.grid;
    const R = f.R;
    const x = g.dx[i] / R;
    const y = g.dy[i] / R;
    const r2 = x * x + y * y;
    if (r2 > 1) {
      // a spray of sea round the rim while she is still a globe
      if (r2 < 1.14 && g.seed[i] < 0.4 && f.open < 0.5) {
        o.v = 0.14;
        o.set = "sea";
      } else o.v = 0;
      return;
    }
    const z = Math.sqrt(1 - r2);
    const la0 = f.latc * RAD;
    const cl = Math.cos(la0);
    const sl = Math.sin(la0);
    const y1 = -y * cl + z * sl;
    const z1 = y * sl + z * cl;
    const la = Math.asin(Math.max(-1, Math.min(1, y1))) / RAD;
    const lo = wrap(f.lonc + Math.atan2(x, z1) / RAD);
    const code = this.land(la, lo);
    const home = (code & 3) === 3;
    // on the way in, everything but their country falls away, cell by cell
    if (!home && f.only > 0 && ih(g.gx[i] + 9001, g.gy[i]) < f.only) {
      o.v = 0;
      return;
    }
    const limb = 0.55 + 0.45 * z;
    o.hk =
      Math.imul(Math.floor((la + 90) / f.bin), 73856093) ^
      Math.imul(Math.floor((lo + 180) / f.bin), 19349663) ^
      f.lvl;
    if (code & 1) {
      o.land = home;
      o.v = 0.95 * limb;
      o.set = "trees";
      if (home && f.dark > 0 && ih(g.gx[i] + 77, g.gy[i] + 5) < f.dark) {
        o.set = "nightLand";
        // in letters, dark is less ink, as her own dim cells are
        if (this.letters) o.v = 0.42 * limb;
        const lights = this.stage.lights;
        if (
          lights &&
          lights.glow[i] > 0.12 &&
          f.lightsOn * lights.count > lights.order[i]
        ) {
          o.set = "cityLight";
          o.v = 0.45 + 0.55 * lights.glow[i];
          o.hk = null;
        }
      }
    } else {
      // closer in, the sea thins, so the land reads
      if (ih(o.hk, 11) > 1 - 0.76 * f.zoomed) {
        o.v = 0;
        return;
      }
      o.v = 0.36 * limb;
      o.set = "sea";
    }
  }

  /** The frame's own edge: a rounded field, frayed, once it has opened past her circle. */
  pastEdge(i: number, f: Plan) {
    const g = this.grid;
    return f.open > 0 && g.edge[i] > 0.9 + 0.08 * g.fray[i];
  }

  /** What lies over the ground: the ripple from the pin, the sun or the moon, the weather. */
  overlay(i: number, t: number, f: Plan, o: Out) {
    const g = this.grid;
    if (f.open < 0.99 || this.pastEdge(i, f)) return false;
    let has = false;
    if (f.ripple >= 0 && f.pinA > 0 && o.v > 0) {
      const d = Math.hypot(g.x[i] - f.pinX, g.y[i] - f.pinY);
      const rr = f.ripple * g.height * 0.22;
      if (Math.abs(d - rr) < g.p * 0.7) {
        o.v = 0.9 * (1 - f.ripple) * f.pinA;
        o.set = "spark";
        o.hk = null;
        has = true;
      }
    }
    const O = f.orb;
    if (O && O.R > 0) {
      const dx = g.dx[i] - O.x;
      const dy = g.dy[i] - O.y;
      if (dx * dx + dy * dy < O.R * O.R * 2.6) {
        let b = this.body(i, O.R, O.x, O.y, t);
        if (O.shadow !== null && b > 0)
          b *=
            1 - ss(O.R * 0.98, O.R * 0.8, Math.hypot(dx - O.shadow * O.R, dy));
        if (b > 0.06) {
          o.v = b * f.orbA;
          o.set = O.set;
          o.hk = null;
          has = true;
        }
      }
    }
    if (f.wAmt <= 0) return has;
    const look = this.stage.look;
    if (
      look === "snow" &&
      o.land &&
      !has &&
      o.hk !== null &&
      ih(o.hk, 29) < 0.22 * f.wAmt
    ) {
      o.set = "snowGround";
      has = true;
    }
    if (f.clouds.length || f.storm) {
      const cloud = this.cloudAt(g.x[i], g.y[i], t, f) * f.wAmt;
      if (cloud > 0.12) {
        o.v = Math.min(1, 0.3 + 0.6 * cloud);
        o.a = 1 - 0.3 * f.night;
        o.set = f.storm && !f.clouds.length ? "cyclone" : f.cloudSet;
        if (
          f.storm &&
          Math.hypot(g.x[i] - f.storm.x, g.y[i] - f.storm.y) < f.storm.R
        )
          o.set = "cyclone";
        o.hk = null;
        has = true;
      }
    }
    if (f.fog > 0) {
      for (let band = 0; band < 2; band++) {
        const dy =
          Math.abs(
            g.y[i] -
              (g.height * (0.62 + 0.16 * band) +
                Math.sin(t * 0.15 + band * 2) * g.p),
          ) /
          (g.p * 1.4);
        if (dy >= 1) continue;
        const fv =
          (1 - dy) *
          ss(
            0.45,
            0.75,
            fbm2(
              g.gx[i] * 0.07 + (band ? t : -t) * 0.2 + band * 13,
              band * 3.1,
              2,
            ),
          ) *
          f.fog;
        if (fv > 0.12) {
          o.v = 0.2 + 0.35 * fv;
          o.set = "fog";
          o.hk = null;
          has = true;
        }
      }
    }
    return has;
  }

  /** The glyph a cell shows: held to the ground, or churning at its set's pace. */
  pick(i: number, o: Out, t: number): string {
    const g = this.grid;
    const set: GlyphSet = SETS[o.set];
    let hv: number;
    if (o.hk !== null) hv = ih(o.hk, 3);
    else {
      const epoch = Math.floor(t * set.churn + g.seed[i] * 7);
      hv = ih(g.gx[i] * 7 + epoch * 131, g.gy[i] * 13 + epoch * 71);
    }
    if (!this.letters)
      return set.emoji[Math.floor(hv * set.emoji.length) % set.emoji.length];
    const lv = Math.max(
      1,
      Math.min(
        TOP,
        Math.round(Math.min(1, o.v) * TOP * (0.82 + 0.36 * g.grain[i])),
      ),
    );
    if (set.letters === "ramp") {
      const row = RAMP[lv];
      return row[Math.floor(hv * row.length) % row.length];
    }
    const list = set.letters;
    const at = Math.floor((lv / TOP) * list.length * 0.999 + (hv - 0.5) * 1.2);
    return list[Math.max(0, Math.min(list.length - 1, at))];
  }

  /**
   * One pass over the cells: `all` draws everything, `base` the still country alone (kept),
   * `overlay` what goes over it. `face` is where her face still is under the globe: those cells
   * are wiped before they are drawn, so she and it are never both in one place.
   */
  pass(ctx: CanvasRenderingContext2D, mode: Pass, look: Look) {
    const g = this.grid;
    const f = this.plan;
    const t = f.t;
    const o = this.out;
    const buckets = look.buckets;
    for (const b of buckets) {
      b.x.length = 0;
      b.y.length = 0;
      b.alpha.length = 0;
      b.glyph.length = 0;
    }
    const wipe = look.wipe;
    wipe.length = 0;
    for (let i = 0; i < g.n; i++) {
      o.v = 0;
      o.set = "trees";
      o.hk = null;
      o.big = 1;
      o.land = false;
      o.a = 1;
      // going: her face opens from the middle and the field frays in from its edges
      if (
        f.back > 0 &&
        (this.reached(i, f.back, 3) ||
          g.edge[i] > (1 - f.back) * (0.95 + 0.1 * g.fray[i]))
      )
        continue;
      // coming: the world spreads through her from the middle; beyond it she is still there
      const covering = f.cover < 1;
      if (covering && !this.reached(i, f.cover, 1)) continue;
      const underFace = g.onFace[i] === 1 && (covering || f.back > 0);
      let over = false;
      if (mode === "overlay") {
        o.v = this.baseV[i];
        o.land = this.baseLand[i] === 1;
        o.hk = o.land ? this.baseHK[i] : null;
        o.set = this.baseSet[i] ?? "trees";
        over = this.overlay(i, t, f, o);
      } else {
        if (this.pastEdge(i, f)) o.v = 0;
        else this.mapCell(i, f, o);
        if (mode === "base") {
          this.baseV[i] = o.v;
          this.baseLand[i] = o.land ? 1 : 0;
          this.baseHK[i] = o.hk ?? 0;
          this.baseSet[i] = o.set;
        } else this.overlay(i, t, f, o);
      }
      if (mode !== "base" && !(f.open > 0 && this.pastEdge(i, f))) {
        const ov = this.over[i];
        if (ov > 0 && ov >= o.v) {
          o.v = ov;
          o.set = this.overSet[i] ?? o.set;
          o.big = this.overBig[i] || 1;
          o.a = 1;
          o.hk = null;
          over = true;
        }
      }
      if (underFace) wipe.push(i);
      if (mode === "overlay" && !over) continue;
      if (o.v < 0.05 + g.seed[i] * 0.05) continue;
      const v = Math.min(1, o.v);
      const level = Math.max(1, (v * TOP) | 0);
      // what goes over the kept country wipes the glyph under it first
      if (mode === "overlay" && v > 0.32 && !underFace) wipe.push(i);
      const glyph = this.pick(i, o, t);
      if (glyph === " ") continue;
      const size = this.letters
        ? GLYPH_PX * o.big
        : GLYPH_PX * (0.5 + 0.5 * emojiWeight(level, TOP)) * o.big;
      const alpha = this.letters
        ? ALPHA_TOP * (level / TOP) * o.a
        : emojiAlpha(level, TOP) * o.a;
      const bucket =
        buckets[Math.min(buckets.length - 1, Math.round(size * 2))];
      bucket.x.push(g.x[i]);
      bucket.y.push(g.y[i]);
      bucket.alpha.push(alpha);
      bucket.glyph.push(glyph);
    }
    // wiped cells are the page again, whatever was under them
    if (wipe.length) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = look.page;
      for (const i of wipe)
        ctx.fillRect(g.x[i] - CELL_W / 2, g.y[i] - CELL_H / 2, CELL_W, CELL_H);
    }
    ctx.fillStyle = look.ink;
    for (let size = 0; size < buckets.length; size++) {
      const b = buckets[size];
      if (!b.glyph.length) continue;
      ctx.font = GLYPH_FONT(size / 2);
      for (let k = 0; k < b.glyph.length; k++) {
        ctx.globalAlpha = b.alpha[k];
        ctx.fillText(b.glyph[k], b.x[k], b.y[k]);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The pin, and the storm's own glyph turning over it. */
  marks(ctx: CanvasRenderingContext2D, look: Look) {
    const g = this.grid;
    const f = this.plan;
    ctx.fillStyle = look.ink;
    if (f.pinA > 0 && f.pinSeen) {
      const size = g.p * 3 * (1 + 0.3 * bump(f.tt, AT.pin[0] + 0.2, 0.2));
      ctx.globalAlpha = this.letters ? f.pinA * ALPHA_TOP : f.pinA;
      ctx.font = GLYPH_FONT(Math.round(this.letters ? size * 0.8 : size));
      ctx.fillText(
        this.letters ? "◉" : "📍",
        f.pinX,
        this.letters ? f.pinY : f.pinY - size * 0.42,
      );
    }
    if (f.storm && f.wAmt > 0) {
      const size = g.p * 3.6;
      ctx.globalAlpha = this.letters ? f.wAmt * ALPHA_TOP : f.wAmt;
      ctx.save();
      ctx.translate(f.storm.x, f.storm.y);
      if (!this.letters) ctx.rotate(f.storm.rot);
      ctx.font = GLYPH_FONT(Math.round(this.letters ? size * 0.8 : size));
      ctx.fillText(this.letters ? "@" : "🌀", 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** One frame: the kept country and what goes over it, or everything while it moves. */
  draw(ctx: CanvasRenderingContext2D, look: Look, dpr: number) {
    const g = this.grid;
    const f = this.plan;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, g.width, g.height);
    if (f.layered && f.key) {
      if (!this.base || this.baseKey !== f.key) {
        this.base ??= document.createElement("canvas");
        this.base.width = Math.round(g.width * dpr);
        this.base.height = Math.round(g.height * dpr);
        const bctx = this.base.getContext("2d");
        if (bctx) {
          bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          bctx.textAlign = "center";
          bctx.textBaseline = "middle";
          this.pass(bctx, "base", look);
          this.baseKey = f.key;
        }
      }
      ctx.drawImage(this.base, 0, 0, g.width, g.height);
      this.pass(ctx, "overlay", look);
    } else this.pass(ctx, "all", look);
    this.marks(ctx, look);
  }
}

/** How a frame is inked, and the scratch it is drawn from. */
type Look = {
  ink: string;
  /** The page's own colour: what a wiped cell is filled with. */
  page: string;
  /** One per half pixel of glyph size, up to twice hers: a font is set once per size a frame. */
  buckets: { x: number[]; y: number[]; alpha: number[]; glyph: string[] }[];
  wipe: number[];
};

function lookFor(dark: boolean, page: string): Look {
  return {
    ink: dark ? "rgb(247,247,247)" : "rgb(10,10,10)",
    page,
    buckets: Array.from({ length: GLYPH_PX * 4 + 1 }, () => ({
      x: [],
      y: [],
      alpha: [],
      glyph: [],
    })),
    wipe: [],
  };
}

// ---------- the component ----------

/**
 * The globe over her face, in a field twice as wide as her canvas where the window has room.
 * Placed inside the box her face is laid out in (thursday.tsx), which it reads its size from.
 */
export function HereGlobe({
  scene,
  onPhase,
}: {
  scene: HereScene;
  onPhase: (phase: HerePhase) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const dark = useIsDark();
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const phaseRef = useRef(onPhase);
  phaseRef.current = onPhase;
  /** Asked to go (a tap), as seconds in; it goes the way it would at its end, from then. */
  const leaveRef = useRef<number | null>(null);
  const clockRef = useRef<number | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size) return;
    let raf = 0;
    let gone = false;
    let globe: Globe | null = null;
    let sent: HerePhase | null = null;
    const tell = (phase: HerePhase) => {
      if (sent === phase) return;
      sent = phase;
      phaseRef.current(phase);
    };
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.warn("No globe: the browser gave no canvas to draw it on.");
      tell("done");
      return;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const grid = buildGrid(size.width, size.height);
    let look = lookFor(darkRef.current, pageColour());
    let lookDark = darkRef.current;

    loadWorld().then(
      (world) => {
        if (gone) return;
        globe = new Globe(
          grid,
          stageFor(world, scene, grid),
          faceGlyphs() === "letters",
        );
        // a globe resized part way keeps its clock
        clockRef.current ??= performance.now();
        raf = requestAnimationFrame(draw);
      },
      (cause) => {
        if (gone) return;
        console.warn(
          `No globe: the map did not load (${cause instanceof Error ? cause.message : String(cause)}).`,
        );
        tell("done");
      },
    );

    let drawnAt = Number.NEGATIVE_INFINITY;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - drawnAt < 1000 / HERE.globeFps - CAP_SLACK_MS) return;
      drawnAt = now;
      if (!globe || clockRef.current === null) return;
      if (lookDark !== darkRef.current) {
        lookDark = darkRef.current;
        look = lookFor(lookDark, pageColour());
        globe.baseKey = null;
      }
      const tt = (now - clockRef.current) / 1000;
      const backAt = Math.min(
        HERE.globeMs / 1000,
        leaveRef.current ?? Number.POSITIVE_INFINITY,
      );
      if (tt >= backAt + AT.leave) {
        cancelAnimationFrame(raf);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        tell("done");
        return;
      }
      globe.over.fill(0);
      const f = globe.planAt(tt, now / 1000, backAt);
      globe.draw(ctx, look, dpr);
      tell(tt >= backAt ? "back" : f.cover >= 1 ? "world" : "covering");
    };

    return () => {
      gone = true;
      cancelAnimationFrame(raf);
    };
  }, [size, scene]);

  return (
    // The field her face is laid out in, carried out to either side (thursday.tsx sizes it);
    // a tap sends it back to her and places nothing
    <div
      ref={hostRef}
      className="absolute top-[calc(-1*var(--face-bleed))] bottom-[calc(-1*var(--face-bleed))] left-1/2 w-[min(calc(2*(100%+2*var(--face-bleed))),calc(100vw-2rem))] -translate-x-1/2 cursor-pointer"
      onClick={() => {
        if (clockRef.current === null) return;
        leaveRef.current ??= (performance.now() - clockRef.current) / 1000;
      }}
      aria-hidden
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: size?.width ?? 0,
          height: size?.height ?? 0,
        }}
      />
    </div>
  );
}

/** The page's own colour, as the wiped cells must match it exactly. */
function pageColour() {
  return getComputedStyle(document.body).backgroundColor || "transparent";
}
