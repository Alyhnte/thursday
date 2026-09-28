"use client";

import { useEffect, useRef, useState } from "react";
import { ASCII_FACE, SEE } from "@/config";
import { useIsDark } from "@/hooks/use-theme";
import { cn, errorToString } from "@/lib/utils";
import {
  ALPHA_TOP,
  LEVELS,
  ORB_INK,
  RAMP,
  smoothstep as ss,
} from "../ascii.const";
import { faceGlyphs } from "../face-glyphs";
import { buildGrid, type Grid, MOMENT_FIELD } from "../face-grid";
import type { MomentPhase } from "../face-moment";
import { ihash, vnoise } from "../field";
import { CAP_SLACK_MS, CELL_H, CELL_W, GLYPH_FONT } from "./ascii-orb";

/**
 * A picture handed to her on a call, drawn in her own glyphs over her face. Each cell of it takes
 * the emoji whose colour, measured as this system draws it, is nearest the picture's there — or,
 * where she is drawn in letters, her letters by how much ink the picture has there. It keeps its
 * own shape, as large as the field lets it be, and where it is clear nothing is drawn. The emoji
 * go down one at a time in a random order, hold (config SEE `holdMs`) and leave in another; a tap
 * sends it back sooner. What she makes of it is the model's (`look_at`): this only draws it.
 */

const GLYPH_PX = ASCII_FACE.fontSize;
const TOP = LEVELS - 1;

/**
 * What a picture is drawn in: her colours and more of each, the wheel round, then browns, greys,
 * white and black. The more there are, the nearer each cell's colour is met.
 */
const PALETTE = [
  ...["🍎", "🌹", "🍓", "❤️", "🔴", "🍅", "🍒", "🌶️", "🍉"],
  ...["🍊", "🔥", "🦊", "🧡", "🍑", "🥕", "🎃", "🟠", "🦀"],
  ...["⭐", "🍋", "🌻", "💛", "🐥", "🌟", "🍌", "🌽", "🧀", "🟡", "🍯", "🥭"],
  ...["🍀", "🌿", "🐸", "🥝", "💚", "🌵", "🥑", "🥦", "🥒", "🍏", "🌲", "🌳"],
  ...["🟢", "🐢", "🦚"],
  ...["💧", "🌊", "🫐", "🐳", "💙", "🔵", "🧊", "🩵", "🐬", "🌀"],
  ...["🍇", "💜", "🔮", "🟣", "🪻", "🍆"],
  ...["🌸", "🌷", "💗", "🦩", "🩷", "🐷"],
  ...["🍫", "🐻", "🌰", "🥐", "🍞", "🥔", "🟤", "🪵"],
  ...["🪨", "🐘", "🐺", "🤍", "☁️", "⚪", "🦢", "🐧", "🍙", "🥛"],
  ...["🖤", "⚫", "🌑", "🌚", "🌕", "🌝", "🌙"],
];

/** The choreography, in seconds from its start. How long it holds is the tuning (config SEE). */
const AT = {
  /** her face goes, cell by cell */
  cover: [0.1, 0.9],
  /** her face may still be on screen a frame after it is told to go: it is wiped this long more */
  grace: 0.3,
  /** the picture goes down, slowly, then fast, then slowly */
  show: [0.8, 4.5],
  /** how long one emoji takes to land, as a share of all of them */
  pop: 0.035,
  /** how much larger one lands from */
  popFrom: 1.55,
  /** from going to gone */
  leave: 1.6,
  /** she comes back, cell by cell, as the last of it goes: seconds from its going */
  back: [1.0, 2.4],
} as const;

/** How much of the field a picture may fill, across and down. */
const FILL = { wide: 0.9, high: 0.88 } as const;

/** A cell less covered than this is where the picture is clear, and stays empty. */
const CLEAR = 0.45;

type RGB = [number, number, number];

/** One glyph of the palette, by the colour a cell of it is from a step back; null is the page. */
type Swatch = { glyph: string | null; r: number; g: number; b: number };

/** The page's own colour, however it is written: what an empty cell is, and wiped cells are painted. */
function pageColour(): { css: string; rgb: RGB } {
  const css = getComputedStyle(document.body).backgroundColor;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("the browser gave no canvas to read the page on");
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return { css, rgb: [r, g, b] };
}

const palettes = new Map<string, Swatch[]>();

/**
 * The palette as this system draws it over this page: each emoji's mean colour, mixed with the
 * page as much as a cell of it is page when looked at from a step back. One drawn in the ink it is
 * given is not a colour emoji on this system (a box, or a letter) and is left out. The page itself
 * is the first swatch: a cell nearest it stays empty.
 */
function paletteFor(page: RGB): Swatch[] {
  const key = page.join(",");
  const kept = palettes.get(key);
  if (kept) return kept;
  const S = 40;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx)
    throw new Error("the browser gave no canvas to measure her emoji on");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = GLYPH_FONT(32);
  const mean = (glyph: string, ink: string) => {
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = ink;
    ctx.fillText(glyph, S / 2, S / 2 + 1);
    const data = ctx.getImageData(0, 0, S, S).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let i = 0; i < data.length; i += 4) {
      const al = data[i + 3] / 255;
      r += data[i] * al;
      g += data[i + 1] * al;
      b += data[i + 2] * al;
      a += al;
    }
    return { r, g, b, a };
  };
  const out: Swatch[] = [{ glyph: null, r: page[0], g: page[1], b: page[2] }];
  for (const glyph of PALETTE) {
    const dark = mean(glyph, "#000");
    if (dark.a < 40) continue;
    const light = mean(glyph, "#fff");
    const moved =
      Math.abs(dark.r - light.r) +
      Math.abs(dark.g - light.g) +
      Math.abs(dark.b - light.b);
    if (moved > dark.a * 3) continue;
    const m = 0.8 * Math.min(1, (dark.a / (S * S)) * 1.4);
    out.push({
      glyph,
      r: (dark.r / dark.a) * m + page[0] * (1 - m),
      g: (dark.g / dark.a) * m + page[1] * (1 - m),
      b: (dark.b / dark.a) * m + page[2] * (1 - m),
    });
  }
  palettes.set(key, out);
  return out;
}

/** The picture as she draws it: a glyph per cell, and the orders they come and go in. */
type Mosaic = {
  /** Per cell: its glyph, or null where the picture draws nothing. */
  glyph: (string | null)[];
  /** Per cell: how strongly it is drawn (her letters; an emoji is drawn whole). */
  alpha: Float32Array;
  /** The cells it draws, in the order they go down. */
  order: Int32Array;
  /** Per cell: its share of that order, or -1; and of the order they leave in. */
  rank: Float32Array;
  rank2: Float32Array;
  n: number;
  /** Every glyph it draws, for warming. */
  glyphs: Set<string>;
};

function mosaicOf(
  image: HTMLImageElement,
  grid: Grid,
  letters: boolean,
  page: RGB,
  dark: boolean,
): Mosaic {
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  // as it is: its own shape, as large as the field lets it be
  const scale = Math.min(
    (grid.width * FILL.wide) / iw,
    (grid.height * FILL.high) / ih,
  );
  const fw = iw * scale;
  const fh = ih * scale;
  const x0 = (grid.width - fw) / 2;
  const y0 = (grid.height - fh) / 2;
  // two samples a cell each way, read three by three round the cell's own
  const sw = Math.max(1, Math.round((fw / CELL_W) * 2));
  const sh = Math.max(1, Math.round((fh / CELL_H) * 2));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx)
    throw new Error("the browser gave no canvas to read the picture on");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh).data;
  const swatches = letters ? null : paletteFor(page);

  const glyph: (string | null)[] = new Array(grid.n).fill(null);
  const alpha = new Float32Array(grid.n);
  const list: number[] = [];
  const glyphs = new Set<string>();
  for (let i = 0; i < grid.n; i++) {
    const u = (grid.x[i] - x0) / fw;
    const v = (grid.y[i] - y0) / fh;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
    const px = Math.floor(u * sw);
    const py = Math.floor(v * sh);
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let count = 0;
    for (let yy = Math.max(0, py - 1); yy <= Math.min(sh - 1, py + 1); yy++)
      for (let xx = Math.max(0, px - 1); xx <= Math.min(sw - 1, px + 1); xx++) {
        const q = (yy * sw + xx) * 4;
        const al = data[q + 3] / 255;
        r += data[q] * al;
        g += data[q + 1] * al;
        b += data[q + 2] * al;
        a += al;
        count++;
      }
    const cover = a / count;
    // a cut-out stays a cut-out: where the picture is clear, nothing is drawn
    if (cover < CLEAR) continue;
    r = (r / a) * cover + page[0] * (1 - cover);
    g = (g / a) * cover + page[1] * (1 - cover);
    b = (b / a) * cover + page[2] * (1 - cover);
    if (swatches) {
      // nearest by the "redmean" distance, which weighs the channels as an eye does
      let best = swatches[0];
      let bestD = Number.POSITIVE_INFINITY;
      for (const one of swatches) {
        const rm = (r + one.r) / 2;
        const dr = r - one.r;
        const dg = g - one.g;
        const db = b - one.b;
        const d =
          (2 + rm / 256) * dr * dr +
          4 * dg * dg +
          (2 + (255 - rm) / 256) * db * db;
        if (d < bestD) {
          bestD = d;
          best = one;
        }
      }
      if (!best.glyph) continue;
      glyph[i] = best.glyph;
      alpha[i] = 1;
      glyphs.add(best.glyph);
    } else {
      // her ink: dark where the picture is dark on a light page, bright where it is bright on a dark one
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const ink = ss(0.05, 0.92, dark ? lum : 1 - lum);
      if (ink < 0.06) continue;
      const level = Math.max(1, Math.min(TOP, Math.round(ink * TOP)));
      const row = RAMP[level];
      const letter =
        row[
          Math.floor(ihash(grid.gx[i], grid.gy[i], 3) * row.length) % row.length
        ];
      if (letter === " ") continue;
      glyph[i] = letter;
      alpha[i] = ALPHA_TOP * ink;
    }
    list.push(i);
  }

  // the order she puts them down in, and takes them away in: at random, a little clumped
  const come = new Float32Array(grid.n);
  const go = new Float32Array(grid.n);
  for (const i of list) {
    const gx = grid.gx[i];
    const gy = grid.gy[i];
    come[i] =
      0.8 * ihash(gx, gy + 5000, 1) + 0.2 * vnoise(gx * 0.1, gy * 0.13, 0);
    go[i] =
      0.8 * ihash(gy + 77, gx + 9000, 2) +
      0.2 * vnoise(gx * 0.1 + 40, gy * 0.13, 0);
  }
  const rank = new Float32Array(grid.n).fill(-1);
  const rank2 = new Float32Array(grid.n).fill(-1);
  const order = Int32Array.from(list).sort((a, b) => come[a] - come[b]);
  order.forEach((i, j) => {
    rank[i] = j / list.length;
  });
  Int32Array.from(list)
    .sort((a, b) => go[a] - go[b])
    .forEach((i, j) => {
      rank2[i] = j / list.length;
    });
  return { glyph, alpha, order, rank, rank2, n: list.length, glyphs };
}

/** Glyphs of one size for one frame: a font is set once per size, not once per glyph. */
type Bucket = { x: number[]; y: number[]; alpha: number[]; glyph: string[] };

/** The picture, ready to draw frames: its grid, its cells, and the landed ones kept on a layer. */
class Picture {
  grid: Grid;
  mosaic: Mosaic;
  letters: boolean;
  ink: string;
  page: string;
  /** Every emoji that has landed, drawn once as it lands. */
  layer: HTMLCanvasElement;
  layerUpTo = 0;
  buckets: Bucket[];

  constructor(
    grid: Grid,
    mosaic: Mosaic,
    letters: boolean,
    dark: boolean,
    page: string,
    dpr: number,
  ) {
    this.grid = grid;
    this.mosaic = mosaic;
    this.letters = letters;
    const [r, g, b] = dark ? ORB_INK.dark : ORB_INK.light;
    this.ink = `rgb(${r},${g},${b})`;
    this.page = page;
    this.layer = document.createElement("canvas");
    this.layer.width = Math.round(grid.width * dpr);
    this.layer.height = Math.round(grid.height * dpr);
    const lctx = this.layer.getContext("2d");
    if (!lctx) throw new Error("the browser gave no canvas to keep it on");
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.textAlign = "center";
    lctx.textBaseline = "middle";
    this.buckets = Array.from(
      { length: Math.ceil(GLYPH_PX * AT.popFrom * 2) + 1 },
      () => ({ x: [], y: [], alpha: [], glyph: [] }),
    );
  }

  /**
   * Every glyph it draws, at every size it draws them, once and wiped, before its first frame: a
   * colour emoji met for the first time at a size costs most of a frame (ascii-orb warmEmoji).
   */
  warm(ctx: CanvasRenderingContext2D) {
    if (this.letters) return;
    const g = this.grid;
    for (let half = GLYPH_PX * 2; half <= GLYPH_PX * AT.popFrom * 2; half++) {
      ctx.font = GLYPH_FONT(half / 2);
      for (const glyph of this.mosaic.glyphs)
        ctx.fillText(glyph, g.width / 2, g.height / 2);
    }
    ctx.clearRect(0, 0, g.width, g.height);
  }

  /** Puts a cell's glyph in this frame's list, at `big` times its size. */
  put(i: number, big: number) {
    const size = GLYPH_PX * big;
    const bucket =
      this.buckets[Math.min(this.buckets.length - 1, Math.round(size * 2))];
    bucket.x.push(this.grid.x[i]);
    bucket.y.push(this.grid.y[i]);
    bucket.alpha.push(this.mosaic.alpha[i]);
    bucket.glyph.push(this.mosaic.glyph[i] ?? " ");
  }

  flush(ctx: CanvasRenderingContext2D) {
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

  /** One frame, `tt` seconds in, going from `backAt`. */
  draw(ctx: CanvasRenderingContext2D, tt: number, backAt: number, dpr: number) {
    const g = this.grid;
    const m = this.mosaic;
    const u = ss(AT.show[0], AT.show[1], Math.min(tt, backAt));
    const shown = 0.5 - 0.5 * Math.cos(Math.PI * u);
    const settled = shown >= 1 ? 1 : Math.max(0, shown - AT.pop);
    const gone = ss(backAt, backAt + AT.leave, tt);
    const leaving = tt >= backAt;
    // Her face is mounted until a frame after she is told to go, and again as she comes back:
    // she fades out under it as it comes and back in as it goes. Wiped cell by cell, her
    // glyphs, which reach past their cells, came out cut
    const hide =
      tt >= backAt + AT.back[0]
        ? 1 - ss(backAt + AT.back[0], backAt + AT.back[1], tt)
        : tt < AT.cover[1] + AT.grace
          ? ss(AT.cover[0], AT.cover[1], tt)
          : 0;

    // landed emoji go onto the layer once, as they land
    const upTo = Math.floor(settled * m.n);
    if (!leaving && upTo > this.layerUpTo) {
      const lctx = this.layer.getContext("2d");
      if (lctx) {
        for (let j = this.layerUpTo; j < upTo; j++) this.put(m.order[j], 1);
        this.flush(lctx);
      }
      this.layerUpTo = upTo;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, g.width, g.height);
    if (hide > 0) {
      // her canvas is the field's height, square, in its middle
      ctx.globalAlpha = hide;
      ctx.fillStyle = this.page;
      ctx.fillRect((g.width - g.height) / 2, 0, g.height, g.height);
      ctx.globalAlpha = 1;
    }
    if (!leaving) {
      ctx.drawImage(this.layer, 0, 0, g.width, g.height);
      // the ones still landing, large first
      const end = Math.min(m.n, Math.ceil(shown * m.n));
      for (let j = upTo; j < end; j++) {
        const i = m.order[j];
        const age = (shown - m.rank[i]) / AT.pop;
        if (age <= 0) continue;
        this.put(i, age < 1 ? AT.popFrom - (AT.popFrom - 1) * age : 1);
      }
    } else {
      // going: each at once, in the other order
      const end = Math.min(m.n, Math.ceil(shown * m.n));
      for (let j = 0; j < end; j++) {
        const i = m.order[j];
        if (m.rank2[i] >= gone) this.put(i, 1);
      }
    }
    this.flush(ctx);
  }
}

/**
 * The picture over her face, in the field the globe is drawn in (face-grid). It is drawn at the
 * size it opened at: a window resized under it stretches it for the few seconds left rather than
 * building it again.
 */
export function Seeing({
  src,
  onPhase,
}: {
  /** Where the page reads the picture (the file route). */
  src: string;
  onPhase: (phase: MomentPhase) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  /** Its clock has started: until then a tap is her face's, which ends the call. */
  const [started, setStarted] = useState(false);
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
      if (width > 0 && height > 0) setSize((was) => was ?? { width, height });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size) return;
    let raf = 0;
    let gone = false;
    let sent: MomentPhase | null = null;
    const tell = (phase: MomentPhase) => {
      if (sent === phase || sent === "done") return;
      sent = phase;
      if (phase === "done") {
        gone = true;
        cancelAnimationFrame(raf);
      }
      phaseRef.current(phase);
    };
    const letters = faceGlyphs() === "letters";
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx || still || document.visibilityState === "hidden") {
      if (!ctx)
        console.warn("No picture on her face: the browser gave no canvas.");
      tell("done");
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let picture: Picture | null = null;
    let pictureDark = darkRef.current;
    const image = new Image();

    /** Builds it for the page as it is now: a change of theme mid-way builds it again. */
    const build = (grid: Grid) => {
      const page = pageColour();
      pictureDark = darkRef.current;
      const one = new Picture(
        grid,
        mosaicOf(image, grid, letters, page.rgb, pictureDark),
        letters,
        pictureDark,
        page.css,
        dpr,
      );
      one.warm(ctx);
      return one;
    };

    let drawnAt = Number.NEGATIVE_INFINITY;
    let heldAt: number | null = null;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - drawnAt < 1000 / SEE.fps - CAP_SLACK_MS) return;
      drawnAt = now;
      if (!picture || clockRef.current === null) return;
      const tt = (now - clockRef.current) / 1000;
      // the whole picture holds once its last emoji is down; a tap sends it back sooner
      const backAt = Math.min(
        AT.show[1] + SEE.holdMs / 1000,
        leaveRef.current ?? Number.POSITIVE_INFINITY,
      );
      if (tt >= backAt + AT.back[1]) {
        ctx.clearRect(0, 0, size.width, size.height);
        tell("done");
        return;
      }
      if (pictureDark !== darkRef.current) {
        try {
          picture = build(picture.grid);
        } catch (cause) {
          console.warn(`No picture on her face: ${errorToString(cause)}`);
          tell("done");
          return;
        }
        heldAt = null;
      }
      // while it holds nothing moves: one frame of it is enough
      const holding = tt > AT.show[1] + 0.1 && tt < backAt;
      if (!holding || heldAt === null) {
        picture.draw(ctx, tt, backAt, dpr);
        heldAt = holding ? tt : null;
      }
      tell(
        tt >= backAt + AT.back[0]
          ? "back"
          : tt >= AT.cover[1]
            ? "world"
            : "covering",
      );
    };

    image.src = src;
    image.decode().then(
      () => {
        if (gone) return;
        // A picture that cannot be drawn is said, and goes: nothing of it may stay over her face
        try {
          if (!image.naturalWidth || !image.naturalHeight)
            throw new Error("the picture has no size of its own");
          picture = build(buildGrid(size.width, size.height));
        } catch (cause) {
          console.warn(`No picture on her face: ${errorToString(cause)}`);
          tell("done");
          return;
        }
        clockRef.current = performance.now();
        setStarted(true);
        raf = requestAnimationFrame(draw);
      },
      (cause) => {
        if (gone) return;
        console.warn(
          `No picture on her face: it did not load (${errorToString(cause)}).`,
        );
        tell("done");
      },
    );

    return () => {
      gone = true;
      cancelAnimationFrame(raf);
    };
  }, [size, src]);

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
