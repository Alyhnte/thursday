/**
 * An SVG path (its `d`) as the lines she draws it along (`draw`, her-drawing): each piece it lifts
 * the pen between, as points, curves and arcs walked in short straight steps. Every command the
 * format has, absolute and relative; what cannot be read is skipped, as a browser skips it.
 */

type Point = [number, number];

/** Straight steps a curve is walked in: enough that her pen, a few cells wide, never shows a corner. */
const CUBIC_STEPS = 16;
const QUADRATIC_STEPS = 12;
/** Degrees an arc turns in one step. */
const ARC_STEP = 15;

export function parsePath(d: string): Point[][] {
  const tokens =
    String(d).match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ??
    [];
  const pieces: Point[][] = [];
  let i = 0;
  let command: string | null = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  // the last control point, which a smooth curve reflects
  let cubic: Point | null = null;
  let quadratic: Point | null = null;
  let piece: Point[] | null = null;
  const isCommand = (token: string) => /^[a-zA-Z]$/.test(token);
  const number = () => Number.parseFloat(tokens[i++]);
  const to = (nx: number, ny: number) => {
    if (!piece) {
      piece = [[x, y]];
      pieces.push(piece);
    }
    piece.push([nx, ny]);
    x = nx;
    y = ny;
  };

  while (i < tokens.length) {
    if (isCommand(tokens[i])) command = tokens[i++];
    else if (!command) {
      i++;
      continue;
    }
    const relative: boolean = command === command.toLowerCase();
    const kind = command.toUpperCase();
    if (kind === "Z") {
      if (piece) piece.push([startX, startY]);
      x = startX;
      y = startY;
      piece = null;
      command = null;
      cubic = null;
      quadratic = null;
      continue;
    }
    if (i >= tokens.length || isCommand(tokens[i])) continue;
    const bx = relative ? x : 0;
    const by = relative ? y : 0;
    if (kind !== "C" && kind !== "S") cubic = null;
    if (kind !== "Q" && kind !== "T") quadratic = null;
    if (kind === "M") {
      x = number() + bx;
      y = number() + by;
      startX = x;
      startY = y;
      piece = [[x, y]];
      pieces.push(piece);
      // numbers after a move are lines
      command = relative ? "l" : "L";
    } else if (kind === "L") to(number() + bx, number() + by);
    else if (kind === "H") to(number() + bx, y);
    else if (kind === "V") to(x, number() + by);
    else if (kind === "C" || kind === "S") {
      const x0 = x;
      const y0 = y;
      let x1: number;
      let y1: number;
      if (kind === "C") {
        x1 = number() + bx;
        y1 = number() + by;
      } else {
        x1 = cubic ? 2 * x0 - cubic[0] : x0;
        y1 = cubic ? 2 * y0 - cubic[1] : y0;
      }
      const x2 = number() + bx;
      const y2 = number() + by;
      const x3 = number() + bx;
      const y3 = number() + by;
      for (let s = 1; s <= CUBIC_STEPS; s++) {
        const u = s / CUBIC_STEPS;
        const v = 1 - u;
        to(
          v * v * v * x0 +
            3 * v * v * u * x1 +
            3 * v * u * u * x2 +
            u ** 3 * x3,
          v * v * v * y0 +
            3 * v * v * u * y1 +
            3 * v * u * u * y2 +
            u ** 3 * y3,
        );
      }
      cubic = [x2, y2];
    } else if (kind === "Q" || kind === "T") {
      const x0 = x;
      const y0 = y;
      let x1: number;
      let y1: number;
      if (kind === "Q") {
        x1 = number() + bx;
        y1 = number() + by;
      } else {
        x1 = quadratic ? 2 * x0 - quadratic[0] : x0;
        y1 = quadratic ? 2 * y0 - quadratic[1] : y0;
      }
      const x2 = number() + bx;
      const y2 = number() + by;
      for (let s = 1; s <= QUADRATIC_STEPS; s++) {
        const u = s / QUADRATIC_STEPS;
        const v = 1 - u;
        to(
          v * v * x0 + 2 * v * u * x1 + u * u * x2,
          v * v * y0 + 2 * v * u * y1 + u * u * y2,
        );
      }
      quadratic = [x1, y1];
    } else if (kind === "A") {
      let rx = Math.abs(number());
      let ry = Math.abs(number());
      const turn = (number() * Math.PI) / 180;
      const large = number() ? 1 : 0;
      const sweep = number() ? 1 : 0;
      const ex = number() + bx;
      const ey = number() + by;
      if (!rx || !ry) {
        to(ex, ey);
        continue;
      }
      // the endpoint form to the centre form (SVG 1.1, appendix F.6.5)
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      const hx = (x - ex) / 2;
      const hy = (y - ey) / 2;
      const xp = cos * hx + sin * hy;
      const yp = -sin * hx + cos * hy;
      const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
      if (lambda > 1) {
        rx *= Math.sqrt(lambda);
        ry *= Math.sqrt(lambda);
      }
      let k = Math.sqrt(
        Math.max(
          0,
          (rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp) /
            (rx * rx * yp * yp + ry * ry * xp * xp),
        ),
      );
      if (large === sweep) k = -k;
      const cxp = (k * rx * yp) / ry;
      const cyp = (-k * ry * xp) / rx;
      const cx = cos * cxp - sin * cyp + (x + ex) / 2;
      const cy = sin * cxp + cos * cyp + (y + ey) / 2;
      const angle = (ux: number, uy: number, vx: number, vy: number) =>
        Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      const from = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
      let delta = angle(
        (xp - cxp) / rx,
        (yp - cyp) / ry,
        (-xp - cxp) / rx,
        (-yp - cyp) / ry,
      );
      if (!sweep && delta > 0) delta -= 2 * Math.PI;
      else if (sweep && delta < 0) delta += 2 * Math.PI;
      const steps = Math.max(
        6,
        Math.ceil(Math.abs(delta) / ((ARC_STEP * Math.PI) / 180)),
      );
      for (let s = 1; s <= steps; s++) {
        const th = from + (delta * s) / steps;
        to(
          cx + rx * Math.cos(th) * cos - ry * Math.sin(th) * sin,
          cy + rx * Math.cos(th) * sin + ry * Math.sin(th) * cos,
        );
      }
    } else i++;
  }
  return pieces.filter((one) => one.length > 1);
}

/** How long the pen travels along the pieces, in the path's own units. */
export function pathLength(pieces: Point[][]): number {
  let total = 0;
  for (const piece of pieces)
    for (let j = 1; j < piece.length; j++)
      total += Math.hypot(
        piece[j][0] - piece[j - 1][0],
        piece[j][1] - piece[j - 1][1],
      );
  return total;
}
