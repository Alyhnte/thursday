/**
 * The office drawn as an isometric sketch: rooms and desks for however many bots a thread holds,
 * the lines of each piece run past its corners, and who walks where carrying what at any moment.
 * No React: office-view draws what this returns. Every fill is a token from app/globals.css, so
 * the drawing turns with the theme.
 */

import {
  type OfficeEvent,
  type OfficeScene,
  questionAt,
  reportAt,
  seatAt,
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
  byBot: Record<string, Desk>;
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
    byBot: Object.fromEntries(desks.map((desk) => [desk.bot, desk])),
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

/** Room the fitted building leaves on screen: the caption above it, the zoom buttons below. */
const MARGIN = { top: 48, side: 20, bottom: 16 };

/** The building fitted into a box on screen. */
function fitOf(width: number, box: { w: number; h: number }): Fit {
  let a0 = Number.POSITIVE_INFINITY;
  let a1 = Number.NEGATIVE_INFINITY;
  let b0 = Number.POSITIVE_INFINITY;
  let b1 = Number.NEGATIVE_INFINITY;
  for (const x of [-4, width + 3])
    for (const y of [-4, DEPTH + 3])
      for (const z of [-6, WALL + 2]) {
        const a = (x - y) * UX;
        const b = (x + y) * UY - z * UZ;
        a0 = Math.min(a0, a);
        a1 = Math.max(a1, a);
        b0 = Math.min(b0, b);
        b1 = Math.max(b1, b);
      }
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
  /** The clock on the coordinator's wall, and the job's name on the ground at four o'clock. */
  clock: { matrix: string; w: number; h: number };
  mission: { matrix: string; w: number; h: number };
  /** Size a bot is drawn at. */
  botSize: number;
  /** When the bots pop in, and when the whole opening build is over, in ms. */
  popAt: number;
  built: number;
};

/** Helpers in the order they joined, and when each was first handed work (scene seconds). */
export function joinsOf(scene: OfficeScene) {
  const at: Record<string, number> = {};
  for (const event of scene.events)
    if (
      (event.kind === "give" || event.kind === "release") &&
      at[event.to] === undefined
    )
      at[event.to] = event.at;
  const helpers = scene.office.bots.filter((bot) => bot !== scene.office.coord);
  helpers.sort(
    (a, b) =>
      (at[a] ?? Number.POSITIVE_INFINITY) - (at[b] ?? Number.POSITIVE_INFINITY),
  );
  return { helpers, at };
}

/** Everything that stands still, for one thread in one box on screen. */
export function stageOf(
  scene: OfficeScene,
  size: { w: number; h: number },
  label: string,
): Stage {
  const { helpers, at: joinAt } = joinsOf(scene);
  const plan = planOf(scene.office.coord, helpers);
  const fit = fitOf(plan.width, size);
  const W = plan.width;
  const D = DEPTH;
  const Z0 = -5;
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
  for (const desk of plan.desks) deskAt(desk, joinAt[desk.bot] ?? 0, false);

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
  // The job's name runs along the building's right side, centred a little behind its middle,
  // where the view has room; its length is read off the letters, as the text is not laid out yet
  const LETTERS = 84;
  const ems = [...label].reduce(
    (sum, ch) =>
      sum +
      // wide scripts (CJK and after) take about an em, Latin about half
      ((ch.codePointAt(0) ?? 0) >= 0x2e80
        ? 0.92
        : /[A-Z]/.test(ch)
          ? 0.66
          : /[a-z0-9]/.test(ch)
            ? 0.56
            : ch === " "
              ? 0.28
              : 0.5),
    0,
  );
  const span = (ems * LETTERS) / 10;
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
    mission: {
      matrix: onGround(W + 9, clamp(D * 0.45 + span / 2, span, D + 12), Z0, 10),
      w: Math.round(ems * LETTERS + 160),
      h: 150,
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
  const free: Record<string, number> = {};
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
      free[who] = standing.back;
    }
    const leave = Math.max(at, free[who] ?? Number.NEGATIVE_INFINITY);
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
    free[who] = back;
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
        free[coord] = 0.8 + time;
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
        const answer = scene.events.find(
          (other) =>
            other.kind === "answer" &&
            other.to === event.from &&
            other.at >= event.at,
        );
        plot(
          coord,
          "lobby",
          event.at,
          event,
          "question",
          answer
            ? { home: "answer", until: answer.at + 0.35, answer }
            : { forever: true },
        );
        break;
      }
      case "report":
        plot(coord, "lobby", event.at, event, "report", { forever: true });
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
  scale: number;
  opacity: number;
  size: number;
  carry: { dark: boolean; ember: boolean; stamp: boolean } | null;
  working: boolean;
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
  trail: { id: string; x: number; y: number; opacity: number }[];
  shades: Stage["shades"];
  /** Hourglasses over trays holding a hand-off until others answer. */
  glasses: { x: number; y: number; opacity: number; waits: string[] }[];
  counter: {
    kind: "question" | "answered" | "report";
    event: OfficeEvent;
    x: number;
    y: number;
  } | null;
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
  t: number,
  selected: string | null,
): Moment {
  const { plan, fit } = stage;
  const coord = scene.office.coord;
  const fade = (from: number, time = 0.35) =>
    r2(easeOut(clamp((t - from) / time, 0, 1)));
  const size = stage.botSize;
  // A helper appears at its desk when the first paper for it lands there
  const lands: Record<string, number> = {};
  for (const trip of trips)
    if (
      trip.who === coord &&
      trip.event.to !== YOU &&
      lands[trip.event.to] === undefined &&
      trip.event.kind !== "job"
    )
      lands[trip.event.to] = trip.arrive;
  const walkers: Walker[] = [];
  const trail: Moment["trail"] = [];
  const tags: Moment["tags"] = [];
  const seatOf = (bot: string) =>
    bot === coord ? plan.own.seat : plan.byBot[bot]?.seat;
  for (const bot of scene.office.bots) {
    const own = bot === coord;
    const come = own ? Number.NEGATIVE_INFINITY : lands[bot];
    if (!own && (come === undefined || t < come)) continue;
    const seat = seatOf(bot);
    if (!seat) continue;
    const walk = walkOf(trips, bot, t);
    const state = seatAt(scene, bot, t);
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
      t < (trip.answer ? trip.answer.at + 0.3 : Number.POSITIVE_INFINITY),
  );
  if (asked) flat("question", 29, 77, 8.2, 4.4, 3.4, false, -0.2, 1, true);
  const reported = trips.find(
    (trip) => trip.out === "report" && t >= trip.arrive,
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
      waits: hold.event.after,
    });
  }
  // what floats over your counter: the question being asked, the answer given, or the report
  const [kx, ky] = fit.at(26, 77, 8.2);
  const { open, answered: lastAnswer } = questionAt(scene, t);
  let counter: Moment["counter"] = null;
  if (open) counter = { kind: "question", event: open, x: kx, y: ky };
  else if (lastAnswer && t < lastAnswer.answer.at + 1.6)
    counter = { kind: "answered", event: lastAnswer.answer, x: kx, y: ky };
  const report = reportAt(scene, t);
  if (report && reported && t >= reported.arrive)
    counter = { kind: "report", event: report, x: kx, y: ky };
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
  return { sprites, pins, trail, shades, glasses, counter, stamp, tags };
}
