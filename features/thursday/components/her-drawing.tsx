"use client";

import { useEffect, useRef, useState } from "react";
import { ASCII_FACE, DRAW } from "@/config";
import { cn } from "@/lib/utils";
import {
  ALPHA_TOP,
  DRAW_COLORS,
  type DrawColor,
  EMOJI_POOL,
  emojiAlpha,
  emojiPx,
  LEVELS,
  ORB_INK,
  RAMP,
  smoothstep as ss,
} from "../ascii.const";
import { faceGlyphs } from "../face-glyphs";
import { bodyAt, buildGrid, type Grid, MOMENT_FIELD } from "../face-grid";
import type { MomentPhase } from "../face-moment";
import { ihash } from "../field";
import { parsePath } from "../svg-path";
import { CAP_SLACK_MS, GLYPH_FONT, REST_R } from "./ascii-orb";

/**
 * A drawing she makes on her face (`draw`): she shrinks into a pen, draws the path along its
 * length in her emoji of one colour, rests, and comes back as the line fades. Drawn on her own
 * grid (face-grid) over her face, which fades out under it as she becomes the pen and back in as
 * she is herself again; a tap sends it back sooner. The design canvas's Drawing (Orb planDraw).
 */

const GLYPH_PX = ASCII_FACE.fontSize;
const TOP = LEVELS - 1;

/** The choreography, in seconds from its start. How long it rests is the tuning (config DRAW). */
const AT = {
  /** her face gives way to her body drawn here */
  cover: [0.1, 0.9],
  /** she shrinks into the pen and goes to where the line starts */
  shrink: [0.9, 1.8],
  /** along the line */
  draw: [1.8, 5.6],
  /** from going: back to the middle and her size */
  home: 1.8,
  /** the line fading, from going */
  fade: [0.1, 2.0],
  /** her face back under it, from going */
  back: [1.6, 2.4],
} as const;

/** The pen's size, reference units: a small cluster of her. */
const PEN_R = 38;
/** The 100 × 100 box a drawing is made in, as reference units across her canvas. */
const BOX = 4.6;
/** How near the line a cell is drawn, reference units: the line's core and its edge. */
const LINE = { core: 7, edge: 15 };
/** Cells farther than this from her middle are never in a drawing, reference units. */
const REACH = 300;

const inOut = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;

type Line = {
  /** The points in order, reference units from her middle, and where the pen was lifted. */
  pts: [number, number][];
  lifted: Uint8Array;
  /** How far along the line each point is. */
  cum: Float32Array;
  total: number;
  /** The cells near her middle, and for each how far from the line and how far along it. */
  near: Int32Array;
  dist: Float32Array;
  along: Float32Array;
};

function lineFor(path: string, grid: Grid): Line {
  const pts: [number, number][] = [];
  const lifts: number[] = [];
  for (const piece of parsePath(path))
    piece.forEach(([x, y], j) => {
      lifts.push(j === 0 && pts.length > 0 ? 1 : 0);
      pts.push([(x - 50) * BOX, (y - 50) * BOX]);
    });
  const lifted = Uint8Array.from(lifts);
  const cum = new Float32Array(pts.length);
  for (let j = 1; j < pts.length; j++)
    cum[j] =
      cum[j - 1] +
      Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
  const near: number[] = [];
  for (let i = 0; i < grid.n; i++)
    if (Math.hypot(grid.dx[i], grid.dy[i]) <= REACH) near.push(i);
  const dist = new Float32Array(grid.n).fill(1e9);
  const along = new Float32Array(grid.n).fill(1e9);
  for (const i of near)
    for (let j = 1; j < pts.length; j++) {
      if (lifted[j]) continue;
      const [ax, ay] = pts[j - 1];
      const vx = pts[j][0] - ax;
      const vy = pts[j][1] - ay;
      const l2 = vx * vx + vy * vy || 1;
      const u = Math.max(
        0,
        Math.min(1, ((grid.dx[i] - ax) * vx + (grid.dy[i] - ay) * vy) / l2),
      );
      const d = Math.hypot(grid.dx[i] - ax - u * vx, grid.dy[i] - ay - u * vy);
      if (d < dist[i]) {
        dist[i] = d;
        along[i] = cum[j - 1] + u * Math.sqrt(l2);
      }
    }
  return {
    pts,
    lifted,
    cum,
    total: cum[cum.length - 1] ?? 0,
    near: Int32Array.from(near),
    dist,
    along,
  };
}

/** Where the pen is `s` along the line. */
function pointAt(line: Line, s: number): [number, number] {
  for (let j = 1; j < line.pts.length; j++)
    if (line.cum[j] >= s) {
      const u =
        (s - line.cum[j - 1]) / Math.max(1e-6, line.cum[j] - line.cum[j - 1]);
      return [
        line.pts[j - 1][0] + (line.pts[j][0] - line.pts[j - 1][0]) * u,
        line.pts[j - 1][1] + (line.pts[j][1] - line.pts[j - 1][1]) * u,
      ];
    }
  return line.pts[line.pts.length - 1] ?? [0, 0];
}

type Bucket = { x: number[]; y: number[]; alpha: number[]; glyph: string[] };

class Drawing {
  grid: Grid;
  line: Line;
  set: readonly string[];
  letters: boolean;
  ink: string;
  page: string;
  buckets: Bucket[];

  constructor(
    grid: Grid,
    line: Line,
    color: DrawColor,
    letters: boolean,
    dark: boolean,
    page: string,
  ) {
    this.grid = grid;
    this.line = line;
    this.set = DRAW_COLORS[color];
    this.letters = letters;
    const [r, g, b] = dark ? ORB_INK.dark : ORB_INK.light;
    this.ink = `rgb(${r},${g},${b})`;
    this.page = page;
    this.buckets = Array.from({ length: GLYPH_PX * 2 + 1 }, () => ({
      x: [],
      y: [],
      alpha: [],
      glyph: [],
    }));
  }

  /** Every glyph at every size it draws them, once and wiped, before its first frame (ascii-orb warmEmoji). */
  warm(ctx: CanvasRenderingContext2D) {
    if (this.letters) return;
    const g = this.grid;
    const sizes = new Set<number>();
    for (let level = 1; level <= TOP; level++)
      sizes.add(Math.round(emojiPx(GLYPH_PX, level, TOP) * 2) / 2);
    for (const size of sizes) {
      ctx.font = GLYPH_FONT(size);
      for (const glyph of [...this.set, ...EMOJI_POOL])
        ctx.fillText(glyph, g.width / 2, g.height / 2);
    }
    ctx.clearRect(0, 0, g.width, g.height);
  }

  /** One frame, `tt` seconds in, going from `backAt`. */
  draw(
    ctx: CanvasRenderingContext2D,
    tt: number,
    t: number,
    backAt: number,
    dpr: number,
  ) {
    const g = this.grid;
    const line = this.line;
    const start = line.pts[0] ?? [0, 0];
    const drawn =
      line.total * inOut(ss(AT.draw[0], AT.draw[1], Math.min(tt, backAt)));
    // where the pen is and how large, until she is sent back; from there she goes home, so a tap
    // mid-line takes her back from where she is
    const at = Math.min(tt, backAt);
    const shrink = ss(AT.shrink[0], AT.shrink[1], at);
    const [px, py] =
      at < AT.shrink[1]
        ? [start[0] * shrink, start[1] * shrink]
        : pointAt(line, drawn);
    const pr =
      at < AT.shrink[1]
        ? REST_R + (PEN_R - REST_R) * shrink
        : PEN_R * (1 + 0.12 * Math.sin(t * 6));
    const home = ss(backAt, backAt + AT.home, tt);
    const cx = px * (1 - home);
    const cy = py * (1 - home);
    const R = pr + (REST_R - pr) * home;
    const fade = 1 - ss(backAt + AT.fade[0], backAt + AT.fade[1], tt);
    // her face gives way to the body drawn here as she becomes the pen, and takes it back
    const hide =
      tt >= backAt + AT.back[0]
        ? 1 - ss(backAt + AT.back[0], backAt + AT.back[1], tt)
        : ss(AT.cover[0], AT.cover[1], tt);
    const bodyA = hide;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, g.width, g.height);
    if (hide > 0 && hide < 1) {
      ctx.globalAlpha = hide;
      ctx.fillStyle = this.page;
      ctx.fillRect((g.width - g.height) / 2, 0, g.height, g.height);
      ctx.globalAlpha = 1;
    }
    for (const i of line.near) {
      let v = 0;
      let glyph: string | null = null;
      let alpha = 1;
      const d = line.dist[i];
      if (d < LINE.edge && line.along[i] <= drawn && g.seed[i] <= fade) {
        v = (d < LINE.core ? 0.95 : 0.62) * (0.85 + 0.15 * g.grain[i]);
        // held to the stretch of line it is on, so a glyph stays as the pen goes on
        const hv = ihash(
          Math.floor(line.along[i] / 16),
          d < LINE.core ? 0 : 5,
          7,
        );
        glyph = this.letters
          ? null
          : this.set[Math.floor(hv * this.set.length) % this.set.length];
      }
      const b = bodyAt(g, i, R, cx, cy, t);
      if (b > v) {
        v = b;
        alpha = bodyA;
        const epoch = Math.floor(t * 0.264 + g.seed[i] * 7);
        const hv = ihash(
          g.gx[i] * 7 + epoch * 131,
          g.gy[i] * 13 + epoch * 71,
          4,
        );
        glyph = this.letters
          ? null
          : EMOJI_POOL[Math.floor(hv * EMOJI_POOL.length) % EMOJI_POOL.length];
      }
      if (v < 0.05 + g.seed[i] * 0.05 || alpha <= 0) continue;
      const level = Math.max(1, Math.min(TOP, (Math.min(1, v) * TOP) | 0));
      if (this.letters) {
        const row = RAMP[level];
        glyph = row[Math.floor(g.grain[i] * row.length) % row.length];
        if (glyph === " ") continue;
      }
      const size = this.letters ? GLYPH_PX : emojiPx(GLYPH_PX, level, TOP);
      const bucket =
        this.buckets[Math.min(this.buckets.length - 1, Math.round(size * 2))];
      bucket.x.push(g.x[i]);
      bucket.y.push(g.y[i]);
      bucket.alpha.push(
        (this.letters ? ALPHA_TOP * (level / TOP) : emojiAlpha(level, TOP)) *
          alpha,
      );
      bucket.glyph.push(glyph ?? " ");
    }
    ctx.fillStyle = this.ink;
    for (let half = 0; half < this.buckets.length; half++) {
      const b = this.buckets[half];
      if (!b.glyph.length) continue;
      ctx.font = GLYPH_FONT(half / 2);
      for (let k = 0; k < b.glyph.length; k++) {
        ctx.globalAlpha = b.alpha[k];
        ctx.fillText(b.glyph[k], b.x[k], b.y[k]);
      }
      b.x.length = 0;
      b.y.length = 0;
      b.alpha.length = 0;
      b.glyph.length = 0;
    }
    ctx.globalAlpha = 1;
  }
}

/** Her drawing over her face, in the field the globe is drawn in (face-grid). */
export function HerDrawing({
  path,
  color,
  onPhase,
}: {
  path: string;
  color: DrawColor;
  onPhase: (phase: MomentPhase) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [started, setStarted] = useState(false);
  const phaseRef = useRef(onPhase);
  phaseRef.current = onPhase;
  const leaveRef = useRef<number | null>(null);
  const clockRef = useRef<number | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width > 0 && height > 0) setSize((was) => was ?? { width, height });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size) return;
    let raf = 0;
    let sent: MomentPhase | null = null;
    const tell = (phase: MomentPhase) => {
      if (sent === phase || sent === "done") return;
      sent = phase;
      if (phase === "done") cancelAnimationFrame(raf);
      phaseRef.current(phase);
    };
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.warn("No drawing on her face: the browser gave no canvas.");
      tell("done");
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const grid = buildGrid(size.width, size.height);
    const drawing = new Drawing(
      grid,
      lineFor(path, grid),
      color,
      faceGlyphs() === "letters",
      document.documentElement.classList.contains("dark"),
      getComputedStyle(document.body).backgroundColor,
    );
    drawing.warm(ctx);
    clockRef.current = performance.now();
    setStarted(true);

    let drawnAt = Number.NEGATIVE_INFINITY;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - drawnAt < 1000 / DRAW.fps - CAP_SLACK_MS) return;
      drawnAt = now;
      const tt = (now - (clockRef.current ?? now)) / 1000;
      const backAt = Math.min(
        AT.draw[1] + DRAW.holdMs / 1000,
        leaveRef.current ?? Number.POSITIVE_INFINITY,
      );
      if (tt >= backAt + AT.back[1]) {
        ctx.clearRect(0, 0, size.width, size.height);
        tell("done");
        return;
      }
      drawing.draw(ctx, tt, now / 1000, backAt, dpr);
      tell(
        tt >= backAt + AT.back[0]
          ? "back"
          : tt >= AT.cover[1]
            ? "world"
            : "covering",
      );
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size, path, color]);

  return (
    // once it draws, a tap sends it back to her and places nothing
    <div
      ref={hostRef}
      className={cn(
        MOMENT_FIELD,
        started ? "cursor-pointer" : "pointer-events-none",
      )}
      onClick={() => {
        if (clockRef.current === null) return;
        leaveRef.current ??= (performance.now() - clockRef.current) / 1000;
      }}
      aria-hidden
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </div>
  );
}
