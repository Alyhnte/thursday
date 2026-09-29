/**
 * The office drawn as an isometric sketch: rooms and desks for however many bots a thread holds,
 * the lines of each piece run past its corners, and who walks where carrying what at any moment.
 * No React: office-stage draws what this returns. Every fill is a token from app/globals.css, so
 * the drawing turns with the theme.
 */

import {
  type OfficeEvent,
  type OfficeScene,
  reportAt,
  seatAt,
  signOf,
  YOU,
} from "./office";

// ---- the plan: rooms, desks, routes (office units; x across, y back to front, z up)

/** The coordinator's room and the lobby share this width; the workroom starts past it. */
const LW = 48;
/** Where the coordinator's room ends and the lobby begins. */
const DC = 48;
const DEPTH = 100;
const WALL = 16;
/** Desks a column: a thread holds eight bots (config BOT_RUN.participants), so three columns. */
const ROWS = 3;
const LANES = [26, 55, 84];
const AISLE = LW + 5;

type Point = [number, number];

export type Desk = {
  bot: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  seat: Point;
  spot: Point;
  lane: number;
  tray: [number, number, number, number];
  laptop: Point;
};

export type Plan = {
  width: number;
  desks: Desk[];
  byBot: Map<string, Desk>;
  own: Desk;
  lobby: Point;
  door: Point;
  routes: Record<string, Point[]>;
};

function planOf(coord: string, helpers: string[]): Plan {
  const columns = Math.ceil(helpers.length / ROWS);
  const width = helpers.length ? LW + 10 + columns * 30 : LW;
  const desks = helpers.map((bot, index): Desk => {
    const column = Math.floor(index / ROWS);
    const row = index % ROWS;
    const x0 = LW + 10 + column * 30;
    const y0 = 10 + row * 29;
    return {
      bot,
      x0,
      y0,
      x1: x0 + 20,
      y1: y0 + 8,
      seat: [x0 + 6.5, y0 - 1.6],
      lane: LANES[row],
      spot: [x0 + 7, LANES[row]],
      tray: [x0 + 1.2, y0 + 1.4, x0 + 6.8, y0 + 6.6],
      laptop: [x0 + 16.8, y0 + 1.2],
    };
  });
  const own: Desk = {
    bot: coord,
    x0: 16,
    y0: 15,
    x1: 40,
    y1: 23,
    seat: [23.5, 13.4],
    spot: [27, 30],
    lane: 30,
    tray: [0, 0, 0, 0],
    laptop: [36.6, 16.2],
  };
  const lobby: Point = [42, 78];
  const door: Point = [24, 45];
  const leave: Point[] = [own.seat, [44, 13.4]];
  const routes: Record<string, Point[]> = {
    lobby: [...leave, [44, 34], [24, 40], [24, 54], [42, 62], lobby],
    door: [...leave, [44, 34], [24, 40], door],
  };
  for (const desk of desks) {
    routes[`to:${desk.bot}`] = [
      ...leave,
      [44, 26],
      [AISLE, 26],
      [AISLE, desk.lane],
      desk.spot,
    ];
    routes[`from:${desk.bot}`] = [
      desk.seat,
      [desk.x0 - 2.5, desk.seat[1]],
      [desk.x0 - 2.5, desk.lane],
      [AISLE, desk.lane],
      [AISLE, 26],
      [44, 26],
      [44, 30],
      own.spot,
    ];
  }
  return {
    width,
    desks,
    byBot: new Map(desks.map((desk) => [desk.bot, desk])),
    own,
    lobby,
    door,
    routes,
  };
}

// ---- the projection

const UX = 0.894;
const UY = 0.447;
const UZ = 0.94;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));
const easeOut = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - (1 - x) ** 3);
const easeInOut = (x: number) =>
  x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;

type Fit = {
  s: number;
  at: (x: number, y: number, z?: number) => Point;
  points: (list: [number, number, number][]) => string;
};

/** Room the fitted building leaves on screen: the office's head above it (office-stage OfficeHead), the zoom buttons below. */
const MARGIN = { top: 96, side: 20, bottom: 16 };

/** A ground unit is this many of the sign's own pixels, as it lies on the ground (office-stage GroundSign). */
const SIGN_PX = 10;
/** The plot of ground the job's sign is stamped on, in its own pixels: room for its widest stamp and the time under it. */
export const SIGN_BOX = { w: 640, h: 260 };

/** The building, and the plot of ground its sign lies on, fitted into a box on screen. */
function fitOf(
  width: number,
  box: { w: number; h: number },
  sign: { x0: number; x1: number; y0: number; y1: number },
): Fit {
  let a0 = Number.POSITIVE_INFINITY;
  let a1 = Number.NEGATIVE_INFINITY;
  let b0 = Number.POSITIVE_INFINITY;
  let b1 = Number.NEGATIVE_INFINITY;
  const reach = (x: number, y: number, z: number) => {
    const a = (x - y) * UX;
    const b = (x + y) * UY - z * UZ;
    a0 = Math.min(a0, a);
    a1 = Math.max(a1, a);
    b0 = Math.min(b0, b);
    b1 = Math.max(b1, b);
  };
  for (const x of [-4, width + 3])
    for (const y of [-4, DEPTH + 3])
      for (const z of [-6, WALL + 2]) reach(x, y, z);
  for (const x of [sign.x0, sign.x1])
    for (const y of [sign.y0, sign.y1]) reach(x, y, -5);
  const w = Math.max(1, box.w - 2 * MARGIN.side);
  const h = Math.max(1, box.h - MARGIN.top - MARGIN.bottom);
  const s = Math.min(w / (a1 - a0), h / (b1 - b0), 7.4);
  const ox = MARGIN.side + (w - (a1 - a0) * s) / 2 - a0 * s;
  const oy = MARGIN.top + (h - (b1 - b0) * s) / 2 - b0 * s;
  const at = (x: number, y: number, z = 0): Point => [
    r1(ox + (x - y) * UX * s),
    r1(oy + ((x + y) * UY - z * UZ) * s),
  ];
  return {
    s,
    at,
    points: (list) => list.map(([x, y, z]) => at(x, y, z).join(",")).join(" "),
  };
}

// ---- the sketch

/** Ink for a piece's edges, and the faint ink of the lines it is built on. */
export const INK_LINE = "color-mix(in oklab, var(--ink) 62%, transparent)";
const INK_FAINT = "color-mix(in oklab, var(--ink) 20%, transparent)";

export type Stroke = {
  /** Stable, for the drawing's keys. */
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Length, for drawing it in. */
  length: number;
  color: string;
  delay: number;
};

export type Face = {
  id: string;
  points: string;
  fill: string;
  hatch: boolean;
  delay: number;
};

/** A line between two points, run past both ends. */
function stroke(
  fit: Fit,
  a: [number, number, number],
  b: [number, number, number],
  over = 4.5,
  color = INK_LINE,
  delay = 0,
): Stroke {
  const [x1, y1] = fit.at(a[0], a[1], a[2]);
  const [x2, y2] = fit.at(b[0], b[1], b[2]);
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const dx = ((x2 - x1) / length) * over;
  const dy = ((y2 - y1) / length) * over;
  return {
    id: "",
    x1: r1(x1 - dx),
    y1: r1(y1 - dy),
    x2: r1(x2 + dx),
    y2: r1(y2 + dy),
    length: r1(length + 2 * over),
    color,
    delay,
  };
}

type Part = { faces: Omit<Face, "delay" | "id">[]; edges: Stroke[] };

/** Top, front and side of a box; the side hatched, as the side the light misses. */
const FILLS = ["var(--gray-0)", "var(--gray-75)", "var(--gray-100)"];

function box(
  fit: Fit,
  [x0, y0, x1, y1, z0, z1]: [number, number, number, number, number, number],
  options: {
    fills?: string[];
    hatch?: boolean;
    over?: number;
    color?: string;
  } = {},
): Part {
  const fills = options.fills ?? FILLS;
  const over = options.over;
  const color = options.color;
  const line = (a: [number, number, number], b: [number, number, number]) =>
    stroke(fit, a, b, over, color);
  return {
    faces: [
      {
        points: fit.points([
          [x0, y1, z0],
          [x1, y1, z0],
          [x1, y1, z1],
          [x0, y1, z1],
        ]),
        fill: fills[1],
        hatch: false,
      },
      {
        points: fit.points([
          [x1, y0, z0],
          [x1, y1, z0],
          [x1, y1, z1],
          [x1, y0, z1],
        ]),
        fill: fills[2],
        hatch: options.hatch !== false,
      },
      {
        points: fit.points([
          [x0, y0, z1],
          [x1, y0, z1],
          [x1, y1, z1],
          [x0, y1, z1],
        ]),
        fill: fills[0],
        hatch: false,
      },
    ],
    edges: [
      line([x0, y0, z1], [x1, y0, z1]),
      line([x0, y0, z1], [x0, y1, z1]),
      line([x0, y1, z1], [x1, y1, z1]),
      line([x1, y0, z1], [x1, y1, z1]),
      line([x0, y1, z0], [x0, y1, z1]),
      line([x1, y1, z0], [x1, y1, z1]),
      line([x1, y0, z0], [x1, y0, z1]),
      line([x0, y1, z0], [x1, y1, z0]),
      line([x1, y0, z0], [x1, y1, z0]),
    ],
  };
}

const merge = (...parts: Part[]): Part => ({
  faces: parts.flatMap((part) => part.faces),
  edges: parts.flatMap((part) => part.edges),
});

export type Mug = {
  cx: number;
  cy: number;
  bx: number;
  by: number;
  rx: number;
  ry: number;
};

/** Something standing on the floor, drawn in depth order with the bots walking past it. */
export type Piece = {
  id: string;
  /** Depth: larger is nearer the viewer. */
  depth: number;
  faces: Omit<Face, "delay">[];
  edges: Stroke[];
  mugs: Mug[];
  /** When it lands as the office builds itself on opening, in ms. */
  delay: number;
  /** A helper's desk: drawn in when its bot is first handed work, at this scene time. */
  appear: number | null;
};

export type Stage = {
  plan: Plan;
  fit: Fit;
  /** The lines the building stands on, run far along the ground. */
  guides: Stroke[];
  faces: Face[];
  lines: Stroke[];
  /** Shadows under the furniture; `of` names the piece that casts one. */
  shades: { points: string; delay: number; of: string | null }[];
  pieces: Piece[];
  /** The clock on the coordinator's wall, and the plot the job's sign is stamped on at four o'clock (SIGN_BOX). */
  clock: { matrix: string; w: number; h: number };
  sign: { matrix: string };
  /** The ground under the building, `w` by `d` in the plan's own units, laid on screen by `matrix`. */
  ground: { matrix: string; w: number; d: number };
  /** Size a bot is drawn at. */
  botSize: number;
  /** When the bots pop in, and when the whole opening build is over, in ms. */
  popAt: number;
  built: number;
};

/** Helpers in the order they joined, and when each was first handed work (scene seconds). */
export function joinsOf(scene: OfficeScene) {
  // A Map, not an object: a bot may be named after what every object already has (constructor)
  const at = new Map<string, number>();
  for (const event of scene.events)
    if (
      (event.kind === "give" || event.kind === "release") &&
      !at.has(event.to)
    )
      at.set(event.to, event.at);
  const helpers = scene.office.bots.filter((bot) => bot !== scene.office.coord);
  helpers.sort(
    (a, b) =>
      (at.get(a) ?? Number.POSITIVE_INFINITY) -
      (at.get(b) ?? Number.POSITIVE_INFINITY),
  );
  return { helpers, at };
}

/** Everything that stands still, for one thread in one box on screen. */
export function stageOf(
  scene: OfficeScene,
  size: { w: number; h: number },
): Stage {
  const { helpers, at: joinAt } = joinsOf(scene);
  const plan = planOf(scene.office.coord, helpers);
  const W = plan.width;
  const D = DEPTH;
  const Z0 = -5;
  // The sign's plot runs along the building's right side, centred a little behind its middle,
  // where the view has room, and is fitted in view with the building
  const span = SIGN_BOX.w / SIGN_PX;
  const signAt = D * 0.45 + span / 2;
  const fit = fitOf(plan.width, size, {
    x0: W + 9,
    x1: W + 9 + SIGN_BOX.h / SIGN_PX,
    y0: signAt,
    y1: signAt - span,
  });
  const faces: Face[] = [];
  const lines: Stroke[] = [];
  const shades: Stage["shades"] = [];
  const pieces: Piece[] = [];
  // When each piece lands as the office builds itself: the ground up, then one thing at a time
  let cue = 0;
  const face = (
    list: [number, number, number][],
    fill: string,
    hatch = false,
  ) =>
    faces.push({
      id: `f${faces.length}`,
      points: fit.points(list),
      fill,
      hatch,
      delay: cue,
    });
  const line = (
    a: [number, number, number],
    b: [number, number, number],
    over?: number,
    color?: string,
  ) =>
    lines.push({
      ...stroke(fit, a, b, over, color),
      id: `l${lines.length}`,
      delay: cue,
    });

  // the footprint, run far out along the ground: the longest lines of the sketch
  const guides = [
    ...[0, W].map((x) => ({
      ...stroke(fit, [x, -2, Z0], [x, D + 2, Z0], 340, "url(#office-fade-y)"),
      id: `gx${x}`,
    })),
    ...[0, D].map((y) => ({
      ...stroke(fit, [-2, y, Z0], [W + 2, y, Z0], 340, "url(#office-fade-x)"),
      id: `gy${y}`,
    })),
  ];

  // the slab
  face(
    [
      [0, D, 0],
      [W, D, 0],
      [W, D, Z0],
      [0, D, Z0],
    ],
    "var(--gray-100)",
  );
  face(
    [
      [W, 0, 0],
      [W, D, 0],
      [W, D, Z0],
      [W, 0, Z0],
    ],
    "var(--gray-150)",
    true,
  );
  line([0, D, Z0], [W, D, Z0], 64);
  line([W, 0, Z0], [W, D, Z0], 64);
  line([0, D, 0], [0, D, Z0], 8);
  line([W, D, 0], [W, D, Z0], 8);
  line([W, 0, 0], [W, 0, Z0], 8);
  // floors, lit from the back left
  cue = 70;
  face(
    [
      [0, DC, 0],
      [LW, DC, 0],
      [LW, D, 0],
      [0, D, 0],
    ],
    "url(#office-floor-lobby)",
  );
  cue = 110;
  face(
    [
      [0, 0, 0],
      [LW, 0, 0],
      [LW, DC, 0],
      [0, DC, 0],
    ],
    "url(#office-floor-own)",
  );
  cue = 150;
  if (helpers.length)
    face(
      [
        [LW, 0, 0],
        [W, 0, 0],
        [W, D, 0],
        [LW, D, 0],
      ],
      "url(#office-floor-work)",
    );
  // the shade the walls cast along their feet
  face(
    [
      [0, 0, 0],
      [W, 0, 0],
      [W, 2.6, 0],
      [2.6, 2.6, 0],
      [2.6, D, 0],
      [0, D, 0],
    ],
    "url(#office-hatch-soft)",
  );
  line([0, D, 0], [W, D, 0], 22);
  line([W, 0, 0], [W, D, 0], 22);
  // the back walls: faces into the rooms, their tops, the open ends
  cue = 210;
  face(
    [
      [0, 0, 0],
      [W, 0, 0],
      [W, 0, WALL],
      [0, 0, WALL],
    ],
    "var(--gray-25)",
  );
  face(
    [
      [0, 0, 0],
      [0, D, 0],
      [0, D, WALL],
      [0, 0, WALL],
    ],
    "var(--gray-75)",
    true,
  );
  face(
    [
      [-2, -2, WALL],
      [W, -2, WALL],
      [W, 0, WALL],
      [0, 0, WALL],
      [0, D, WALL],
      [-2, D, WALL],
    ],
    "var(--gray-100)",
  );
  face(
    [
      [W, -2, 0],
      [W, 0, 0],
      [W, 0, WALL],
      [W, -2, WALL],
    ],
    "var(--gray-150)",
    true,
  );
  face(
    [
      [-2, D, 0],
      [0, D, 0],
      [0, D, WALL],
      [-2, D, WALL],
    ],
    "var(--gray-100)",
  );
  for (const [a, b, over] of [
    [[-2, -2, WALL], [W, -2, WALL], 10],
    [[0, 0, WALL], [W, 0, WALL], 10],
    [[-2, -2, WALL], [-2, D, WALL], 10],
    [[0, 0, WALL], [0, D, WALL], 10],
    [[W, -2, 0], [W, -2, WALL], 10],
    [[W, 0, 0], [W, 0, WALL], 10],
    [[W, -2, WALL], [W, 0, WALL], 5],
    [[-2, D, 0], [-2, D, WALL], 10],
    [[0, D, 0], [0, D, WALL], 10],
    [[-2, D, WALL], [0, D, WALL], 5],
    [[0, 0, 0], [W, 0, 0], 0],
    [[0, 0, 0], [0, D, 0], 0],
    [[0, 0, 0], [0, 0, WALL], 10],
  ] as [[number, number, number], [number, number, number], number][])
    line(a, b, over);
  line([0, 0.05, 1.1], [W, 0.05, 1.1], 0, INK_FAINT);
  line([0.05, 0, 1.1], [0.05, D, 1.1], 0, INK_FAINT);
  // the coordinator's pinboard
  cue = 260;
  face(
    [
      [2.5, 0.12, 4],
      [21.5, 0.12, 4],
      [21.5, 0.12, 13],
      [2.5, 0.12, 13],
    ],
    "var(--gray-0)",
  );
  line([2.5, 0.12, 4], [21.5, 0.12, 4], 3);
  line([2.5, 0.12, 13], [21.5, 0.12, 13], 3);
  line([2.5, 0.12, 4], [2.5, 0.12, 13], 3);
  line([21.5, 0.12, 4], [21.5, 0.12, 13], 3);

  let count = 0;
  const add = (depth: number, part: Part, extra: Partial<Piece> = {}) => {
    const id = `p${count++}`;
    pieces.push({
      id,
      depth,
      faces: part.faces.map((one, index) => ({ ...one, id: `${id}f${index}` })),
      edges: part.edges.map((one, index) => ({ ...one, id: `${id}e${index}` })),
      mugs: [],
      delay: cue,
      appear: null,
      ...extra,
    });
  };
  const shade = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    k: number,
    of: string | null,
  ) =>
    shades.push({
      points: fit.points([
        [x0 + 0.3, y0 + 0.5, 0],
        [x1 + k, y0 + 0.5, 0],
        [x1 + k, y1 + k * 0.7, 0],
        [x0 + 0.3, y1 + k * 0.7, 0],
      ]),
      delay: cue,
      of,
    });

  // low inner walls in short lengths, so a bot walking past sorts against them, door gaps open
  const PARTITION = ["var(--gray-75)", "var(--gray-50)", "var(--gray-150)"];
  const alongY = (x: number, from: number, to: number) => {
    for (let y = from; y < to; y += 4) {
      const end = Math.min(to, y + 4);
      const part = box(fit, [x - 0.9, y, x + 0.9, end, 0, 7], {
        fills: PARTITION,
      });
      const e = part.edges;
      const keep = [e[1], e[3], e[8]]
        .concat(y === from ? [e[0], e[6]] : [])
        .concat(end === to ? [e[2], e[4], e[5], e[7]] : []);
      cue += 16;
      add(x + (y + end) / 2 + 0.9, { faces: part.faces, edges: keep });
    }
  };
  const alongX = (y: number, from: number, to: number) => {
    for (let x = from; x < to; x += 4) {
      const end = Math.min(to, x + 4);
      const part = box(fit, [x, y - 0.9, end, y + 0.9, 0, 7], {
        fills: PARTITION,
        hatch: false,
      });
      const e = part.edges;
      const keep = [e[0], e[2], e[7]]
        .concat(x === from ? [e[1], e[4]] : [])
        .concat(end === to ? [e[3], e[5], e[6], e[8]] : []);
      cue += 16;
      add((x + end) / 2 + y + 0.9, { faces: part.faces, edges: keep });
    }
  };
  if (helpers.length) {
    alongY(LW, 0, 18);
    alongY(LW, 30, D);
  }
  alongX(DC, 0, 18);
  alongX(DC, 30, LW);

  // a desk: a top on legs, a laptop turned to its bot, a mug; a helper's is drawn when it joins
  const deskParts = (desk: Desk) => {
    const leg = 0.9;
    const z = 5.2;
    const top = box(fit, [
      desk.x0 - 0.4,
      desk.y0 - 0.4,
      desk.x1 + 0.4,
      desk.y1 + 0.4,
      z,
      z + 0.9,
    ]);
    const legs = [
      [desk.x0, desk.y1 - leg],
      [desk.x1 - leg, desk.y1 - leg],
      [desk.x1 - leg, desk.y0],
    ].map(([x, y]) =>
      box(fit, [x, y, x + leg, y + leg, 0, z], {
        fills: ["var(--gray-50)", "var(--gray-100)", "var(--gray-150)"],
        over: 2.5,
      }),
    );
    const back: Part = {
      faces: [],
      edges: [
        stroke(
          fit,
          [desk.x0 + 0.45, desk.y0 + 0.45, 0],
          [desk.x0 + 0.45, desk.y0 + 0.45, z],
          2.5,
        ),
      ],
    };
    return merge(back, ...legs, top);
  };
  const laptop = ([x, y]: Point) =>
    merge(
      box(fit, [x - 3.2, y + 0.4, x + 3.2, y + 4.2, 6.1, 6.45], {
        fills: ["var(--gray-100)", "var(--gray-150)", "var(--gray-200)"],
        over: 2,
      }),
      box(fit, [x - 3.2, y, x + 3.2, y + 0.45, 6.1, 9.5], {
        fills: ["var(--gray-650)", "var(--gray-750)", "var(--gray-700)"],
        hatch: false,
        over: 2,
        color: "color-mix(in oklab, var(--ink) 80%, transparent)",
      }),
    );
  const mug = (x: number, y: number, z: number): Mug => {
    const rim = fit.s * 1.05;
    const [cx, cy] = fit.at(x, y, z + 2.1);
    const [bx, by] = fit.at(x, y, z);
    return { cx, cy, bx, by, rx: r1(rim), ry: r1(rim * 0.5) };
  };
  const deskAt = (desk: Desk, appear: number | null, own: boolean) => {
    cue += 60;
    const depth = (desk.x0 + desk.x1) / 2 + (desk.y0 + desk.y1) / 2;
    const id = `p${count}`;
    shade(desk.x0, desk.y0, desk.x1, desk.y1, 2.6, appear === null ? null : id);
    add(depth, deskParts(desk), { appear });
    cue += 40;
    add(desk.laptop[0] + desk.laptop[1] + 3.3, laptop(desk.laptop), { appear });
    cue += 40;
    add(
      depth + 5.2,
      { faces: [], edges: [] },
      {
        mugs: [mug(own ? 31 : desk.x0 + 12, own ? 20.5 : desk.y1 - 2, 6.1)],
        appear,
      },
    );
    cue += 40;
    if (own)
      add(
        depth + 0.6,
        merge(
          ...[0, 1, 2].map((i) =>
            box(
              fit,
              [
                17.2 + i * 0.3,
                16.2 - i * 0.2,
                22.2 + i * 0.3,
                19.6 - i * 0.2,
                6.1 + i * 0.7,
                6.1 + (i + 1) * 0.7,
              ],
              { over: 1.5 },
            ),
          ),
        ),
      );
    else {
      const [a, b, c, e] = desk.tray;
      add(
        (a + c) / 2 + (b + e) / 2 + 0.3,
        merge(
          box(fit, [a, b, c, e, 6.1, 7.4], {
            fills: ["var(--gray-50)", "var(--gray-150)", "var(--gray-200)"],
            over: 2,
          }),
          {
            faces: [
              {
                points: fit.points([
                  [a + 0.5, b + 0.5, 7.4],
                  [c - 0.5, b + 0.5, 7.4],
                  [c - 0.5, e - 0.5, 7.4],
                  [a + 0.5, e - 0.5, 7.4],
                ]),
                fill: "var(--gray-100)",
                hatch: false,
              },
            ],
            edges: [],
          },
        ),
        { appear },
      );
    }
  };
  // your window: a counter, where questions and the final report come
  cue += 60;
  shade(12, 74, 36, 80, 3, null);
  add(
    24 + 77,
    merge(
      box(fit, [12, 74, 36, 80, 0, 7.2]),
      box(fit, [11.4, 73.4, 36.6, 80.6, 7.2, 8.1]),
    ),
  );
  deskAt(plan.own, null, true);
  const built = cue;
  for (const desk of plan.desks) deskAt(desk, joinAt.get(desk.bot) ?? 0, false);

  // a box on the back wall (x along it, z down it), and one lying on the ground reading rightward
  const onWall = (x: number, y: number, z: number, px: number) => {
    const [tx, ty] = fit.at(x, y, z);
    const k = fit.s / px;
    return `matrix(${[UX * k, UY * k, 0, UZ * k, tx, ty].map(r2).join(",")})`;
  };
  const onGround = (x: number, y: number, z: number, px: number) => {
    const [tx, ty] = fit.at(x, y, z);
    const k = fit.s / px;
    return `matrix(${[UX * k, -UY * k, UX * k, UY * k, tx, ty].map(r2).join(",")})`;
  };
  const [gx, gy] = fit.at(0, 0, Z0);
  const popAt = built + 90;
  return {
    plan,
    fit,
    guides,
    faces,
    lines,
    shades,
    pieces,
    clock: { matrix: onWall(23.8, 0.2, 14.6, 6.4), w: 150, h: 64 },
    sign: { matrix: onGround(W + 9, signAt, Z0, SIGN_PX) },
    ground: {
      matrix: `matrix(${[UX * fit.s, UY * fit.s, -UX * fit.s, UY * fit.s, gx, gy].map(r2).join(",")})`,
      w: W,
      d: D,
    },
    botSize: Math.round(clamp(fit.s * 10.8, 36, 64)),
    popAt,
    built: popAt + 420,
  };
}

// ---- who walks where

const routeLength = (route: Point[]) => {
  let sum = 0;
  for (let index = 1; index < route.length; index++)
    sum += Math.hypot(
      route[index][0] - route[index - 1][0],
      route[index][1] - route[index - 1][1],
    );
  return sum;
};

function along(route: Point[], u: number) {
  const total = routeLength(route);
  let left = clamp(u, 0, 1) * total;
  for (let index = 1; index < route.length; index++) {
    const [x0, y0] = route[index - 1];
    const [x1, y1] = route[index];
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (left <= length || index === route.length - 1) {
      const k = length ? Math.min(1, left / length) : 0;
      return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, total };
    }
    left -= length;
  }
  return { x: route[0][0], y: route[0][1], total };
}

/** What a walker carries: the kind of paper, and on the way back what it brings. */
type Carry =
  | "order"
  | "held"
  | "extra"
  | "copy"
  | "result"
  | "question"
  | "answer"
  | "report"
  | "note"
  | "noted"
  | "start";

type Trip = {
  who: string;
  route: Point[];
  leave: number;
  arrive: number;
  stay: number;
  back: number;
  out: Carry | null;
  home: Carry | null;
  event: OfficeEvent;
  answer?: OfficeEvent;
};

/** Every walk: a message carried across the floor. One walker at a time, so a busy one sets off late. */
export function tripsOf(scene: OfficeScene, plan: Plan): Trip[] {
  const trips: Trip[] = [];
  const free = new Map<string, number>();
  const coord = scene.office.coord;
  const travel = (route: Point[]) => clamp(routeLength(route) / 80, 0.5, 1.1);
  const plot = (
    who: string,
    key: string,
    at: number,
    event: OfficeEvent,
    out: Carry | null,
    options: {
      home?: Carry | null;
      hold?: number;
      until?: number;
      forever?: boolean;
      answer?: OfficeEvent;
    } = {},
  ) => {
    const route = plan.routes[key];
    if (!route) return;
    // One standing at your counter for good (an open question, the report) walks back for this
    const standing = trips.findLast((trip) => trip.who === who);
    if (standing && standing.back === Number.POSITIVE_INFINITY) {
      standing.stay = Math.max(standing.arrive + 0.35, at);
      standing.back = standing.stay + travel(standing.route) * 0.9;
      free.set(who, standing.back);
    }
    const leave = Math.max(at, free.get(who) ?? Number.NEGATIVE_INFINITY);
    const time = travel(route);
    const arrive = leave + time;
    const stay =
      options.until !== undefined
        ? Math.max(arrive + 0.35, options.until)
        : arrive + (options.hold ?? 0.35);
    const back = options.forever ? Number.POSITIVE_INFINITY : stay + time * 0.9;
    trips.push({
      who,
      route,
      leave,
      arrive,
      stay,
      back,
      out,
      home: options.home ?? null,
      event,
      answer: options.answer,
    });
    free.set(who, back);
  };
  for (const event of scene.events) {
    switch (event.kind) {
      case "job": {
        // The coordinator comes back from your counter with the job as the office opens
        const route = plan.routes.lobby;
        const time = travel(route);
        trips.push({
          who: coord,
          route,
          leave: -2,
          arrive: -1,
          stay: 0.8,
          back: 0.8 + time,
          out: null,
          home: "start",
          event,
        });
        free.set(coord, 0.8 + time);
        break;
      }
      case "give":
        if (event.from === coord)
          plot(
            coord,
            `to:${event.to}`,
            event.at,
            event,
            event.extra ? "extra" : event.after.length ? "held" : "order",
          );
        break;
      case "release":
        if (event.from === coord)
          plot(coord, `to:${event.to}`, event.at, event, "copy");
        break;
      case "refused":
        // Only an update for you is carried to the door; any other send reached nobody
        if (event.from === coord && event.to === YOU)
          plot(coord, "door", event.at, event, "note", {
            home: "noted",
            hold: 0.65,
          });
        break;
      case "question": {
        if (event.from !== coord) break;
        // The first answer after it: a question asked in the second an earlier one was answered
        // is not answered by that
        const answer = scene.events
          .slice(scene.events.indexOf(event) + 1)
          .find((other) => other.kind === "answer" && other.to === event.from);
        // Back from the counter once it is answered or withdrawn, whichever is seen first: the
        // answer is read a moment after it closed the question (room.query tellRoom)
        const until = Math.min(
          answer?.at ?? Number.POSITIVE_INFINITY,
          event.closed ?? Number.POSITIVE_INFINITY,
        );
        plot(
          coord,
          "lobby",
          event.at,
          event,
          "question",
          answer
            ? { home: "answer", until: until + 0.35, answer }
            : Number.isFinite(until)
              ? { until }
              : { forever: true },
        );
        break;
      }
      case "report":
        // At your counter while it stands; once the thread goes on, carried back to the desk
        plot(
          coord,
          "lobby",
          event.at,
          event,
          "report",
          event.closed === null
            ? { forever: true }
            : { until: event.closed, home: "report" },
        );
        break;
      case "return":
        if (event.to === coord)
          plot(event.from, `from:${event.from}`, event.at, event, "result");
        break;
    }
  }
  return trips;
}

function walkOf(trips: Trip[], who: string, t: number) {
  for (const trip of trips) {
    if (trip.who !== who || t < trip.leave || t >= trip.back) continue;
    if (t < trip.arrive) {
      const p = (t - trip.leave) / (trip.arrive - trip.leave);
      return {
        trip,
        phase: "out" as const,
        u: easeInOut(p),
        p,
        carry: trip.out,
      };
    }
    if (t < trip.stay)
      return { trip, phase: "at" as const, u: 1, p: 0, carry: null };
    const p = (t - trip.stay) / (trip.back - trip.stay);
    return {
      trip,
      phase: "back" as const,
      u: 1 - easeInOut(p),
      p,
      carry: trip.home,
    };
  }
  return null;
}

// ---- a bot's own leaps

/**
 * A leap a bot takes by itself: a hop when work lands on its desk or it is back with the job or
 * your answer, a flip as it joins, now and then one while it stands about, and everyone's leap,
 * sheets thrown up, once the report reaches your counter. Only what the office sees happen: what
 * it opened on has happened already, except a finish you had not seen yet (OfficeScene `fresh`),
 * cheered once the office stands.
 */
export type Trick = { bot: string; kind: "hop" | "flip" | "cheer"; at: number };

/** How long each leap takes, crouch to landing (s), and how high it goes in the bot's heights. */
const LEAP = { hop: 0.58, flip: 0.92, cheer: 0.76 };
const RISE = { hop: 0.3, flip: 0.8, cheer: 0.58 };
/** The crouch before a leap and the give on landing (s). */
const CROUCH = 0.1;
const LAND = 0.13;
/** A bot standing about leaps by itself about once in this many seconds, give or take. */
const IDLE = 30;
/** How long after the office opens its bots still leap by themselves (s): one left open goes still. */
const IDLE_FOR = 3600;
/** How long a sheet thrown at the report lies where it landed, and then takes to fade (s). */
const LIE = 5;
const FADE = 0.8;
/** The sheets each bot throws up at the report. */
const SHEETS = [0, 1, 2, 3];

/** A number in [0, 1) from a name and a count: the same for the same pair, scattered between them. */
const scatter = (name: string, k: number) => {
  let h = Math.imul(2166136261 ^ k, 16777619);
  for (let i = 0; i < name.length; i++)
    h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * Every leap from when the office opened: the ones the work sets off, then the odd one on its own.
 * `stood` is when the office stood built (scene seconds), null while it builds.
 */
export function tricksOf(
  scene: OfficeScene,
  trips: Trip[],
  stood: number | null,
): Trick[] {
  const coord = scene.office.coord;
  const from = scene.opened;
  const tricks: Trick[] = [];
  const add = (bot: string, kind: Trick["kind"], at: number) => {
    if (at >= from) tricks.push({ bot, kind, at });
  };
  // Work landing on a desk: its bot flips at the first paper, as it appears there, and hops at
  // work that comes after; the coordinator hops back at its desk with the job or your answer
  const come = new Map<string, number>();
  for (const trip of trips) {
    if (trip.who !== coord) continue;
    if (trip.home === "start" || trip.home === "answer")
      add(coord, "hop", trip.back);
    const to = trip.event.to;
    if (to === YOU || trip.event.kind === "job") continue;
    if (!come.has(to)) {
      come.set(to, trip.arrive);
      add(to, "flip", trip.arrive + 0.35);
    } else if (
      trip.out === "order" ||
      trip.out === "extra" ||
      trip.out === "copy"
    )
      add(to, "hop", trip.arrive + 0.05);
  }
  // The report reaching your counter, seen as it happens or first seen as the office stands:
  // everyone leaps, throwing sheets up, then hops once more
  const report = trips.findLast((trip) => trip.out === "report");
  const cheer =
    !report || scene.office.status !== "done" || report.event.closed !== null
      ? null
      : report.arrive >= from
        ? report.arrive
        : scene.fresh && stood !== null
          ? stood
          : null;
  if (report && cheer !== null)
    scene.office.bots.forEach((bot, index) => {
      if (
        bot !== coord &&
        (come.get(bot) ?? Number.POSITIVE_INFINITY) > report.arrive
      )
        return;
      let at = cheer + 0.15 + index * 0.07;
      // One on its way joins in once home, or once there when it stays where it went; one
      // that stays (a trip with no way back, as the report's to your counter) leaps there
      const walk = walkOf(trips, bot, at);
      const home = Number.isFinite(walk?.trip.back);
      if (walk && (walk.phase === "out" || (walk.phase === "back" && home)))
        at = (home ? walk.trip.back : walk.trip.arrive) + 0.1;
      add(bot, "cheer", at);
      add(bot, "hop", at + LEAP.cheer + 0.06);
    });
  // Now and then one standing about leaps by itself: not while the job is paused or stopped,
  // not one never called, and never over a leap the work set off or a walk
  const sign = signOf(scene);
  if (sign === "paused" || sign === "stopped") return tricks;
  const byWork = [...tricks];
  // standing still: at its desk, where it went, or staying there with no way back
  const standing = (bot: string, at: number) => {
    const walk = walkOf(trips, bot, at);
    return (
      !walk ||
      walk.phase === "at" ||
      (walk.phase === "back" && !Number.isFinite(walk.trip.back))
    );
  };
  for (const bot of scene.office.bots) {
    if (seatAt(scene, bot).key === "none") continue;
    for (let k = 0; ; k++) {
      const at = from + 4 + IDLE * (k + scatter(bot, k));
      if (at > from + IDLE_FOR) break;
      if (scatter(bot, -1 - k) < 0.35) continue;
      const kind = scatter(bot, 1000 + k) < 0.25 ? "flip" : "hop";
      const end = at + LEAP[kind];
      if (
        (bot !== coord && (come.get(bot) ?? Number.POSITIVE_INFINITY) > at) ||
        !standing(bot, at) ||
        !standing(bot, end) ||
        byWork.some(
          (other) =>
            other.bot === bot && other.at < end + 1.5 && at < other.at + 2.5,
        )
      )
        continue;
      tricks.push({ bot, kind, at });
    }
  }
  return tricks;
}

/** Where a leap has its bot `u` seconds in: how high, how far turned over, how squashed (+) or stretched (-). */
function leapAt(kind: Trick["kind"], u: number, size: number) {
  const air = LEAP[kind] - CROUCH - LAND;
  if (u < CROUCH)
    return {
      lift: 0,
      spin: 0,
      squash: 0.16 * Math.sin((u / CROUCH) * Math.PI),
    };
  if (u < CROUCH + air) {
    const p = (u - CROUCH) / air;
    return {
      lift: RISE[kind] * size * 4 * p * (1 - p),
      spin: kind === "flip" ? 360 * easeInOut(p) : 0,
      squash: -0.1 * Math.max(0, 1 - 3 * p),
    };
  }
  const p = Math.min(1, (u - CROUCH - air) / LAND);
  return { lift: 0, spin: 0, squash: 0.14 * Math.sin(p * Math.PI) };
}

/** Where a thrown sheet leaves the hands, in the bot's heights; how long a falling one takes to reach its speed (s). */
const HANDS = 0.95;
const RAMP = 0.3;

/**
 * How a sheet thrown at the report flies: how long it rises and then falls to the floor (s),
 * how high it goes and how fast it sinks (the bot's heights, and those a second).
 */
function flightOf(bot: string, index: number) {
  const r = (k: number) => scatter(bot, 7919 * (index + 1) + k);
  const top = HANDS + 1.5 + 0.7 * r(3);
  const sink = 1.15 * (0.85 + 0.3 * r(4));
  const rise = 0.4 + 0.1 * r(6);
  return { rise, fall: top / sink + RAMP / 2, top, sink };
}

/** A sheet thrown at the report, as drawn: lying in the ground's plane at its height, laid on screen by `plane`. */
export type Sheet = {
  id: string;
  /** Its place and size on screen, lying in the ground's plane (an SVG matrix). */
  plane: string;
  /** How far it has turned about the ground's up (degrees). */
  turn: number;
  /** Rocked about its length: 1 face up, -1 its blank back up. */
  face: number;
  /** On the floor: drawn under the furniture rather than over everything. */
  landed: boolean;
  dark: boolean;
  opacity: number;
};

/**
 * A sheet `u` seconds after it left the hands of `bot`, standing at `spot` on the plan: thrown
 * up turning over, then falling as paper falls, swinging side to side and rocking less as it
 * sinks, to lie flat where it lands a while before it fades. Kept inside the walls.
 */
function sheetAt(
  bot: string,
  index: number,
  spot: { x: number; y: number },
  u: number,
  size: number,
  fit: Fit,
  width: number,
): Sheet {
  const r = (k: number) => scatter(bot, 7919 * (index + 1) + k);
  const { rise, fall, top, sink } = flightOf(bot, index);
  const unit = size / fit.s;
  const way = r(1) * Math.PI * 2;
  const far = unit * (0.5 + 1.1 * r(2));
  const swing = 4.2 + 1.4 * r(5);
  const phase = r(7) * Math.PI * 2;
  const turns = 1 + Math.round(r(9));
  const spin = (r(11) < 0.5 ? -1 : 1) * (40 + 60 * r(10));
  const f = clamp(u - rise, 0, fall);
  const q = f / fall;
  // how far out along its way, and the swing across it
  const out = u < rise ? 0.3 * (u / rise) : 0.3 + 0.7 * q;
  const sway = u < rise ? 0 : Math.sin(f * swing + phase) * unit * 0.35;
  const x = clamp(
    spot.x + Math.cos(way) * far * out - Math.sin(way) * sway,
    1.5,
    width - 1.5,
  );
  const y = clamp(
    spot.y + Math.sin(way) * far * out + Math.cos(way) * sway,
    1.5,
    DEPTH - 1.5,
  );
  // its height, in the bot's heights
  const high =
    u < rise
      ? HANDS + (top - HANDS) * (1 - (1 - u / rise) ** 2)
      : top - sink * (f < RAMP ? (f * f) / (2 * RAMP) : f - RAMP / 2);
  const [sx, sy] = fit.at(x, y, (Math.max(0, high) * unit) / UZ);
  // over and over on the way up; on the way down rocking about the side it will land on
  const rock =
    u < rise
      ? (u / rise) * turns * Math.PI
      : turns * Math.PI + Math.cos(f * swing + phase) * 0.9 * (1 - q);
  // about two thirds of the bot's height long (18 of SheetShape's units)
  const k = (size * 0.62) / 18;
  const opacity = clamp((rise + fall + LIE + FADE - u) / FADE, 0, 1);
  return {
    id: `${bot}-sheet${index}`,
    plane: `matrix(${[UX * k, UY * k, -UX * k, UY * k, sx, sy].map(r2).join(",")})`,
    turn: r1(r(8) * 360 + (u < rise ? 160 * (u / rise) : 160 + spin * f)),
    face: r2(Math.cos(rock)),
    landed: u >= rise + fall,
    dark: index % 4 === 1,
    opacity: r2(opacity),
  };
}

// ---- the office at a moment

export type Paper = {
  id: string;
  depth: number;
  points: string;
  lines: string[];
  dark: boolean;
  ember: boolean;
  opacity: number;
};

export type Walker = {
  bot: string;
  depth: number;
  /** Feet on the floor, in screen units. */
  x: number;
  y: number;
  hop: number;
  tilt: number;
  /** Turned over in a flip, about the middle of its body (degrees). */
  spin: number;
  /** Squashed on the ground before and after a leap (+), stretched as it leaves it (-). */
  squash: number;
  scale: number;
  opacity: number;
  size: number;
  carry: { dark: boolean; ember: boolean; stamp: boolean } | null;
  working: boolean;
  /** Stopped, or paused on Continue: its eyes crossed out. */
  crossed: boolean;
  selected: boolean;
};

export type Moment = {
  /** Pieces, bots and papers in the order they are drawn, far to near. */
  sprites: (
    | { kind: "piece"; piece: Piece; draw: number }
    | { kind: "bot"; walker: Walker }
    | { kind: "paper"; paper: Paper }
  )[];
  pins: Paper[];
  /** Sheets thrown up as the report reaches your counter: over everything, and on the floor once landed. */
  tossed: Sheet[];
  /** Sheets are in the air: the plates step back so they are seen. */
  hush: boolean;
  trail: { id: string; x: number; y: number; opacity: number }[];
  shades: Stage["shades"];
  /** Hourglasses over trays holding a hand-off until others answer. */
  glasses: { x: number; y: number; opacity: number }[];
  /** From each bot a held hand-off waits on to the bot it is for, over the floor. */
  links: {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    opacity: number;
  }[];
  /** The final report, once it lies at your counter. */
  report: OfficeEvent | null;
  /** A send turned down, and the room's words for why. */
  stamp: { x: number; y: number; scale: number; text: string } | null;
  /** Where each bot's tag goes: above its head. */
  tags: {
    bot: string;
    x: number;
    head: number;
    foot: number;
    carrying: boolean;
  }[];
};

/** How long a helper's desk takes to be drawn in when its bot joins. */
const DRAW = 0.8;

/** How long a send turned down away from the door keeps its stamp. */
const STAMPED = 2.4;

/** Pins the coordinator's board holds side by side: the job and seven answers. */
const PINS = 8;

/** Loose sheets of more words a desk shows at most. */
const MORE = 3;

export function momentOf(
  scene: OfficeScene,
  stage: Stage,
  trips: Trip[],
  tricks: Trick[],
  t: number,
  selected: string | null,
): Moment {
  const { plan, fit } = stage;
  const coord = scene.office.coord;
  const fade = (from: number, time = 0.35) =>
    r2(easeOut(clamp((t - from) / time, 0, 1)));
  const size = stage.botSize;
  // A helper appears at its desk when the first paper for it lands there
  const lands = new Map<string, number>();
  for (const trip of trips)
    if (
      trip.who === coord &&
      trip.event.to !== YOU &&
      !lands.has(trip.event.to) &&
      trip.event.kind !== "job"
    )
      lands.set(trip.event.to, trip.arrive);
  const walkers: Walker[] = [];
  const trail: Moment["trail"] = [];
  const tags: Moment["tags"] = [];
  const seatOf = (bot: string) =>
    bot === coord ? plan.own.seat : plan.byBot.get(bot)?.seat;
  for (const bot of scene.office.bots) {
    const own = bot === coord;
    const come = own ? Number.NEGATIVE_INFINITY : lands.get(bot);
    if (!own && (come === undefined || t < come)) continue;
    const seat = seatOf(bot);
    if (!seat) continue;
    const walk = walkOf(trips, bot, t);
    const state = seatAt(scene, bot);
    let x = seat[0];
    let y = seat[1];
    let hop = 0;
    let tilt = 0;
    const walking = !!walk && walk.phase !== "at";
    if (walk) {
      const spot = along(walk.trip.route, walk.u);
      x = spot.x;
      y = spot.y;
      if (walking) {
        const steps = Math.max(3, Math.round(spot.total / 8));
        const swing = Math.sin(walk.p * Math.PI * steps);
        hop = Math.abs(swing) * 6;
        tilt = swing * 6;
        for (let i = 1; i <= 6; i++) {
          const u =
            walk.phase === "back" ? walk.u + i * 0.045 : walk.u - i * 0.045;
          if (u < 0 || u > 1) continue;
          const behind = along(walk.trip.route, u);
          const side = i % 2 ? 0.7 : -0.7;
          const [tx, ty] = fit.at(behind.x + side, behind.y - side, 0);
          trail.push({
            id: `${bot}${i}`,
            x: tx,
            y: ty,
            opacity: r2(0.22 - i * 0.03),
          });
        }
      }
    }
    // a leap of its own, over whatever else it is doing
    const trick = tricks.find(
      (one) => one.bot === bot && t >= one.at && t < one.at + LEAP[one.kind],
    );
    const leap = trick
      ? leapAt(trick.kind, t - trick.at, size)
      : { lift: 0, spin: 0, squash: 0 };
    hop += leap.lift;
    const [fx, fy] = fit.at(x, y, 0);
    const carry = walking ? (walk?.carry ?? null) : null;
    const pop = own ? 1 : clamp((t - (come ?? 0)) / 0.35, 0, 1);
    walkers.push({
      bot,
      depth: x + y + 0.25,
      x: fx,
      y: fy,
      hop: r1(hop),
      tilt: r1(tilt),
      spin: r1(leap.spin),
      squash: r2(leap.squash),
      scale: r2(0.6 + 0.4 * easeOut(pop)),
      opacity: r2(
        (state.key === "none" ? 0.4 : state.key === "held" ? 0.75 : 1) * pop,
      ),
      size,
      carry: carry
        ? {
            dark: carry === "result" || carry === "report" || carry === "copy",
            ember: carry === "question" || carry === "answer",
            stamp: carry === "noted",
          }
        : null,
      working: state.key === "run" && !walking,
      crossed: state.key === "stopped" || state.key === "paused",
      selected: selected === bot,
    });
    tags.push({
      bot,
      x: fx,
      head: r1(fy - hop - size),
      foot: fy,
      carrying: !!carry,
    });
  }

  // papers where they lie: the job and each answer pinned on the coordinator's board, orders on desks
  const papers: Paper[] = [];
  const pins: Paper[] = [];
  const flat = (
    id: string,
    cx: number,
    cy: number,
    z: number,
    w: number,
    h: number,
    dark: boolean,
    turn: number,
    opacity = 1,
    ember = false,
  ) => {
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const q = (u: number, v: number): [number, number, number] => [
      cx + u * c - v * s,
      cy + u * s + v * c,
      z,
    ];
    papers.push({
      id,
      depth: cx + cy + 0.6,
      points: fit.points([
        q(-w / 2, -h / 2),
        q(w / 2, -h / 2),
        q(w / 2, h / 2),
        q(-w / 2, h / 2),
      ]),
      lines: [0.3, 0.5, 0.7].map((k) =>
        fit.points([
          q(-w / 2 + w * 0.2, -h / 2 + h * k),
          q(w / 2 - w * (k > 0.6 ? 0.45 : 0.2), -h / 2 + h * k),
        ]),
      ),
      dark,
      ember,
      opacity,
    });
  };
  const pin = (slot: number, dark: boolean, opacity: number) => {
    // Two rows of four; from the ninth, each lands over an earlier one, a little lower
    const place = slot < PINS ? slot : 1 + ((slot - 1) % (PINS - 1));
    const layer = slot < PINS ? 0 : Math.floor((slot - 1) / (PINS - 1));
    const column = place % 4;
    const row = Math.floor(place / 4);
    const x0 = 3.6 + column * 4.5 + layer * 0.5;
    const x1 = x0 + 3.7;
    const z1 = 12.2 - row * 3.9 - layer * 0.5;
    const z0 = z1 - 3.2;
    pins.push({
      id: `pin${slot}`,
      depth: -1,
      points: fit.points([
        [x0, 0.3, z0],
        [x1, 0.3, z0],
        [x1, 0.3, z1],
        [x0, 0.3, z1],
      ]),
      lines: [0.72, 0.52, 0.32].map((k) =>
        fit.points([
          [x0 + 0.7, 0.3, z0 + (z1 - z0) * k],
          [x1 - (k < 0.4 ? 1.8 : 0.7), 0.3, z0 + (z1 - z0) * k],
        ]),
      ),
      dark,
      ember: false,
      opacity,
    });
  };
  const start = trips.find((trip) => trip.home === "start");
  if (start && t >= start.back) pin(0, false, fade(start.back));
  let slot = 1;
  for (const trip of trips)
    if (trip.out === "result") {
      if (t >= trip.arrive) pin(slot, true, fade(trip.arrive));
      slot += 1;
    }
  for (const desk of plan.desks) {
    const mine = trips.filter(
      (trip) =>
        trip.who === coord && trip.event.to === desk.bot && trip.leave <= t,
    );
    // The latest hand-off by now, and the release of that one
    const hold = mine.findLast((trip) => trip.out === "held");
    const release = hold
      ? mine.find(
          (trip) =>
            trip.out === "copy" && trip.event.exchange === hold.event.exchange,
        )
      : mine.findLast((trip) => trip.out === "copy");
    const order = mine.findLast((trip) => trip.out === "order");
    const more = mine.filter((trip) => trip.out === "extra").slice(-MORE);
    const cx = (desk.tray[0] + desk.tray[2]) / 2;
    const cy = (desk.tray[1] + desk.tray[3]) / 2;
    if (hold && t >= hold.arrive && (!release || t < release.arrive + 0.4))
      flat(`hold-${desk.bot}`, cx, cy, 7.5, 3.6, 4.2, false, -0.12);
    if (release && t >= release.arrive && t < release.arrive + 0.4)
      flat(`copy-${desk.bot}`, cx + 0.5, cy - 0.5, 7.8, 2.8, 2.8, true, 0.2);
    const onDesk =
      release && (!order || release.leave > order.leave)
        ? release.arrive + 0.4
        : order
          ? order.arrive
          : null;
    if (onDesk !== null && t >= onDesk)
      flat(
        `order-${desk.bot}`,
        desk.x0 + 9.5,
        desk.y0 + 4.2,
        6.15,
        4.6,
        3.6,
        false,
        0.08,
        fade(onDesk),
      );
    if (release && t >= release.arrive + 0.4)
      flat(
        `answers-${desk.bot}`,
        desk.x0 + 11.2,
        desk.y0 + 3.4,
        6.2,
        2.8,
        2.6,
        true,
        0.25,
        fade(release.arrive + 0.4),
      );
    more.forEach((trip, index) => {
      if (t >= trip.arrive)
        flat(
          `more-${desk.bot}-${trip.event.id}`,
          desk.x0 + 6.8 + index * 1.2,
          desk.y0 + 5.4,
          6.25,
          2.6,
          2.2,
          false,
          -0.2,
          fade(trip.arrive),
        );
    });
  }
  const asked = trips.find(
    (trip) =>
      trip.out === "question" &&
      t >= trip.arrive &&
      t <
        Math.min(
          trip.answer ? trip.answer.at + 0.3 : Number.POSITIVE_INFINITY,
          trip.event.closed ?? Number.POSITIVE_INFINITY,
        ),
  );
  if (asked) flat("question", 29, 77, 8.2, 4.4, 3.4, false, -0.2, 1, true);
  // The report on your counter while it stands there; taken back, it leaves in its bot's hands
  const reported = trips.findLast(
    (trip) =>
      trip.out === "report" &&
      t >= trip.arrive &&
      (!Number.isFinite(trip.back) || t < trip.stay),
  );
  if (reported)
    flat("report", 29, 77, 8.2, 4.4, 3.4, true, -0.2, fade(reported.arrive));
  const answered = trips.find(
    (trip) => trip.home === "answer" && t >= trip.back,
  );
  if (answered)
    flat(
      "answer",
      23.5,
      19.8,
      6.15,
      3.4,
      2.6,
      false,
      -0.15,
      fade(answered.back),
    );
  const noting = trips.find(
    (trip) => trip.out === "note" && t >= trip.arrive && t < trip.stay,
  );

  // a helper's desk is drawn in as its bot joins: the pen runs along each line, then the faces settle
  const shown: Moment["sprites"] = [];
  const drawn = new Map<string, number>();
  for (const piece of stage.pieces) {
    if (piece.appear === null) {
      shown.push({ kind: "piece", piece, draw: 1 });
      continue;
    }
    if (t < piece.appear) continue;
    const draw = r2(clamp((t - piece.appear) / DRAW, 0, 1));
    drawn.set(piece.id, draw);
    shown.push({ kind: "piece", piece, draw });
  }
  const sprites: Moment["sprites"] = [
    ...shown,
    ...walkers.map((walker) => ({ kind: "bot" as const, walker })),
    ...papers.map((paper) => ({ kind: "paper" as const, paper })),
  ];
  const depthOf = (sprite: Moment["sprites"][number]) =>
    sprite.kind === "piece"
      ? sprite.piece.depth
      : sprite.kind === "bot"
        ? sprite.walker.depth
        : sprite.paper.depth;
  sprites.sort((a, b) => depthOf(a) - depthOf(b));
  const shades = stage.shades.filter((shade) => {
    if (!shade.of) return true;
    const draw = drawn.get(shade.of);
    return draw !== undefined && draw >= 0.6;
  });

  // hourglasses over trays still holding a hand-off
  const glasses: Moment["glasses"] = [];
  for (const desk of plan.desks) {
    const hold = trips.findLast(
      (trip) =>
        trip.event.to === desk.bot && trip.out === "held" && trip.leave <= t,
    );
    const release = hold
      ? trips.find(
          (trip) =>
            trip.out === "copy" && trip.event.exchange === hold.event.exchange,
        )
      : undefined;
    if (!hold || t < hold.arrive || (release && t >= release.arrive + 0.4))
      continue;
    const [gx, gy] = fit.at(
      (desk.tray[0] + desk.tray[2]) / 2,
      (desk.tray[1] + desk.tray[3]) / 2,
      8,
    );
    glasses.push({
      x: gx,
      y: gy,
      opacity:
        release && t >= release.arrive
          ? r2(clamp((release.arrive + 0.4 - t) / 0.4, 0, 1))
          : 1,
    });
  }
  // who a held hand-off waits on: a line over the floor from each of them to the bot it is for
  const links: Moment["links"] = [];
  const standing = new Map(walkers.map((walker) => [walker.bot, walker]));
  for (const bot of scene.office.bots) {
    const state = seatAt(scene, bot);
    const to = standing.get(bot);
    if (state.key !== "held" || !to) continue;
    for (const one of state.waits) {
      const from = standing.get(one);
      if (from)
        links.push({
          id: `${one}>${bot}`,
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
          opacity: Math.min(from.opacity, to.opacity),
        });
    }
  }
  // the final report, once it lies at your counter; a question stays with its bot's plate and
  // the room's box, where it is answered
  const final = reportAt(scene, t);
  const report = final && reported?.event.id === final.id ? final : null;
  const refused = scene.events.findLast(
    (event) =>
      event.kind === "refused" &&
      event.to !== YOU &&
      t >= event.at &&
      t < event.at + STAMPED,
  );
  const stampedAt = (
    x: number,
    y: number,
    from: number,
    event: OfficeEvent,
  ) => {
    const [sx, sy] = fit.at(x, y, 0);
    return {
      x: sx,
      y: sy - size,
      scale: r2(clamp((t - from) / 0.18, 0, 1)),
      text: event.text,
    };
  };
  const sender = refused ? seatOf(refused.from) : undefined;
  const stamp = noting
    ? stampedAt(plan.door[0], plan.door[1], noting.arrive, noting.event)
    : refused && sender
      ? stampedAt(sender[0], sender[1], refused.at, refused)
      : null;
  // sheets thrown up at the report, from where each bot stood as it left the ground
  const tossed: Sheet[] = [];
  let hush = false;
  for (const trick of tricks) {
    if (trick.kind !== "cheer") continue;
    const u = t - trick.at - CROUCH;
    const seat = seatOf(trick.bot);
    if (u < 0 || !standing.has(trick.bot) || !seat) continue;
    const walk = walkOf(trips, trick.bot, trick.at + CROUCH);
    const spot = walk
      ? along(walk.trip.route, walk.u)
      : { x: seat[0], y: seat[1] };
    for (const index of SHEETS) {
      const { rise, fall } = flightOf(trick.bot, index);
      if (u >= rise + fall + LIE + FADE) continue;
      if (u < rise + fall) hush = true;
      tossed.push(sheetAt(trick.bot, index, spot, u, size, fit, plan.width));
    }
  }
  return {
    sprites,
    pins,
    tossed,
    hush,
    trail,
    shades,
    glasses,
    links,
    report,
    stamp,
    tags,
  };
}

/** How long after a walk ends a paper it left still settles: a copy's 0.4 and a fade's 0.35. */
const SETTLE = 0.8;

/**
 * When the drawing moves by itself, in scene seconds: a walk and the papers it leaves settling, a
 * desk drawn in as its bot joins, a send stamped, a bot's leap and the sheets it throws. Outside
 * these it stands still, so what drives it rests until the next one begins (office-stage
 * useSceneClock).
 */
export function motionOf(
  scene: OfficeScene,
  stage: Stage,
  trips: Trip[],
  tricks: Trick[],
): [number, number][] {
  const spans: [number, number][] = [];
  for (const trick of tricks) {
    spans.push([trick.at, trick.at + LEAP[trick.kind]]);
    // a cheer's sheets move while they fly and while they fade, and lie still between
    if (trick.kind === "cheer")
      for (const index of SHEETS) {
        const { rise, fall } = flightOf(trick.bot, index);
        const thrown = trick.at + CROUCH;
        spans.push([thrown, thrown + rise + fall]);
        spans.push([
          thrown + rise + fall + LIE,
          thrown + rise + fall + LIE + FADE,
        ]);
      }
  }
  for (const trip of trips) {
    spans.push([trip.leave, trip.arrive + SETTLE]);
    if (Number.isFinite(trip.back)) spans.push([trip.stay, trip.back + SETTLE]);
  }
  for (const piece of stage.pieces)
    if (piece.appear !== null) spans.push([piece.appear, piece.appear + DRAW]);
  for (const event of scene.events)
    if (event.kind === "refused")
      spans.push([event.at, event.at + STAMPED + 0.1]);
  return spans;
}

/** Seconds until the drawing next moves: 0 while it moves at `t`, and infinite once nothing is to come. */
export function restAt(spans: [number, number][], t: number) {
  let next = Number.POSITIVE_INFINITY;
  for (const [from, to] of spans) {
    if (t >= from && t < to) return 0;
    if (from > t) next = Math.min(next, from - t);
  }
  return next;
}
