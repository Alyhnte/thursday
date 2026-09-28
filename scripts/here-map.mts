// Builds public/here/world.json, the map the globe is drawn from (features/thursday/here-map.ts):
// Natural Earth's 1:50m countries, which are in the public domain, as world-atlas 2.0.2
// redistributes them (ISC; public/here/NOTICE), simplified and packed small. The file is
// committed; run this again only to change the map:
//
//   node scripts/here-map.mts
//
// Plain node on purpose: nothing it needs is installed, the release comes from the registry
// and is checked against the integrity the registry published for it.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const TARBALL =
  "https://registry.npmjs.org/world-atlas/-/world-atlas-2.0.2.tgz";
const INTEGRITY =
  "sha512-IXfV0qwlKXpckz1FhwXVwKRjiIhOnWttOskm5CtxMsjgE/MXAYRHWJqgXOpM8IkcPBoXnyTU5lFHcYa5ChG0LQ==";
const FILE = "package/countries-50m.json";
/**
 * How far a simplified coast may stray, in degrees (Douglas–Peucker, east–west shrunk by the
 * latitude): 0.03 is about 3 km, under one of her cells at the closest the globe zooms to a
 * country the size of Korea, and it takes the map from 740 KB to 240 KB.
 */
const TOLERANCE = 0.03;
/** Points are stored to a hundredth of a degree, about a kilometre. */
const Q = 100;

type Topology = {
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: [number, number][][];
  objects: {
    countries: {
      geometries: {
        type: string;
        arcs: number[][] | number[][][];
        properties: { name: string };
      }[];
    };
  };
};

const response = await fetch(TARBALL);
if (!response.ok) throw new Error(`${TARBALL} answered ${response.status}`);
const packed = Buffer.from(await response.arrayBuffer());
const digest = `sha512-${createHash("sha512").update(packed).digest("base64")}`;
if (digest !== INTEGRITY)
  throw new Error(`${TARBALL} is not the release it was: ${digest}`);

/** One file out of a tar: 512-byte headers, each followed by its file in 512-byte blocks. */
function untar(tar: Buffer, name: string): Buffer {
  const text = (at: number, length: number) =>
    tar
      .subarray(at, at + length)
      .toString("utf8")
      .replace(/\0[\s\S]*$/, "");
  for (let at = 0; at + 512 <= tar.length; ) {
    const path = [text(at + 345, 155), text(at, 100)].filter(Boolean).join("/");
    if (!path) break;
    const size = Number.parseInt(text(at + 124, 12).trim() || "0", 8);
    if (path === name) return tar.subarray(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${name} is not in ${TARBALL}`);
}

const topology = JSON.parse(
  untar(gunzipSync(packed), FILE).toString("utf8"),
) as Topology;
const [sx, sy] = topology.transform.scale;
const [tx, ty] = topology.transform.translate;
const arcs = topology.arcs.map((arc) => {
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]): [number, number] => {
    x += dx;
    y += dy;
    return [x * sx + tx, y * sy + ty];
  });
});

/** Douglas–Peucker, with east–west distances shrunk by the latitude they are at. */
function simplify(points: [number, number][]): [number, number][] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const shrink = Math.cos((((ay + by) / 2) * Math.PI) / 180);
    let far = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const px = (points[i][0] - ax) * shrink;
      const py = points[i][1] - ay;
      const vx = (bx - ax) * shrink;
      const vy = by - ay;
      const length = vx * vx + vy * vy;
      const u =
        length === 0
          ? 0
          : Math.max(0, Math.min(1, (px * vx + py * vy) / length));
      const d = Math.hypot(px - u * vx, py - u * vy);
      if (d > far) {
        far = d;
        at = i;
      }
    }
    if (far > TOLERANCE) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  const kept = points.filter((_, i) => keep[i]);
  // An island that is one closed arc keeps a shape: four points, never a line
  const [first] = points;
  const last = points[points.length - 1];
  if (
    kept.length < 4 &&
    points.length >= 4 &&
    first[0] === last[0] &&
    first[1] === last[1]
  ) {
    const third = Math.floor(points.length / 3);
    return [first, points[third], points[2 * third], last];
  }
  return kept;
}

const geometries = topology.objects.countries.geometries;
/** The arcs two countries share are the borders between them. */
const uses = new Uint16Array(arcs.length);
const polygonsOf = (geometry: (typeof geometries)[number]): number[][][] =>
  geometry.type === "Polygon"
    ? [geometry.arcs as number[][]]
    : geometry.type === "MultiPolygon"
      ? (geometry.arcs as number[][][])
      : [];
for (const geometry of geometries)
  for (const polygon of polygonsOf(geometry))
    for (const ring of polygon)
      for (const arc of ring) uses[arc < 0 ? ~arc : arc]++;

const world = {
  v: 1,
  q: Q,
  // each arc as whole hundredths of a degree from (-180, -90), every point after the first a step from the one before
  a: arcs.map((arc) => {
    let px = 0;
    let py = 0;
    return simplify(arc).flatMap(([x, y]) => {
      const qx = Math.round((x + 180) * Q);
      const qy = Math.round((y + 90) * Q);
      const step = [qx - px, qy - py];
      px = qx;
      py = qy;
      return step;
    });
  }),
  b: [...uses.keys()].filter((arc) => uses[arc] > 1),
  c: geometries.map((geometry) => ({
    n: geometry.properties.name,
    p: polygonsOf(geometry),
  })),
};

const out = join(import.meta.dirname, "..", "public", "here");
mkdirSync(out, { recursive: true });
const json = JSON.stringify(world);
writeFileSync(join(out, "world.json"), json);
console.log(
  `public/here/world.json: ${world.c.length} countries, ${world.b.length} border arcs, ${Math.round(json.length / 1024)} KB`,
);
