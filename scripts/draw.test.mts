import assert from "node:assert/strict";
import { test } from "node:test";
import { DRAW_COLORS, EMOJI_POOL } from "../features/thursday/ascii.const.ts";
import { parsePath, pathLength } from "../features/thursday/svg-path.ts";

const near = (a: number, b: number, by = 0.01) =>
  assert.ok(Math.abs(a - b) <= by, `${a} is not ${b}`);

test("a path is read as the lines her pen draws, absolute and relative", () => {
  assert.deepEqual(parsePath("M20 52 L40 72 L82 28"), [
    [
      [20, 52],
      [40, 72],
      [82, 28],
    ],
  ]);
  // numbers after a move are lines, and lower case is relative
  assert.deepEqual(parsePath("m20 52 20 20 h10 v-5"), [
    [
      [20, 52],
      [40, 72],
      [50, 72],
      [50, 67],
    ],
  ]);
  // a move lifts the pen: two pieces
  assert.equal(parsePath("M0 0 L10 0 M20 0 L30 0").length, 2);
  // Z closes the piece where it began
  const heart = parsePath(
    "M50 84 C22 64 8 46 16 30 C24 14 44 16 50 32 C56 16 76 14 84 30 C92 46 78 64 50 84 Z",
  )[0];
  assert.deepEqual(heart.at(-1), [50, 84]);
  // an arc is walked round its centre: from the left of a circle to its right, over the top
  const arc = parsePath("M10 50 A40 40 0 0 1 90 50")[0];
  near(arc.at(-1)?.[0] ?? 0, 90);
  near(Math.min(...arc.map(([, y]) => y)), 10, 0.5);
  near(pathLength([arc]), Math.PI * 40, 1);
  // a smooth curve reflects the last control point
  const s = parsePath("M0 0 C0 10 10 10 10 0 S20 -10 20 0")[0];
  near(s.at(-1)?.[0] ?? 0, 20);
});

test("what draws no line is said to draw nothing", () => {
  assert.equal(pathLength(parsePath("hello")), 0);
  assert.equal(pathLength(parsePath("M10 10")), 0);
  assert.equal(pathLength(parsePath("")), 0);
});

test("she draws in her own emoji, one colour band a word", () => {
  for (const [name, set] of Object.entries(DRAW_COLORS)) {
    assert.ok(set.length > 0, `${name} has emoji`);
    for (const one of set) assert.ok(EMOJI_POOL.includes(one), one);
  }
  // white and black are the grey band, split
  assert.deepEqual(
    [...DRAW_COLORS.white, ...DRAW_COLORS.black].sort(),
    ["🤍", "☁️", "🖤", "⚪", "⚫", "🦢"].sort(),
  );
});
