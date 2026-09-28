import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { HERE } from "../config.ts";
import {
  decodeWorld,
  fitView,
  homeOf,
  project,
  type World,
} from "../features/thursday/here-map.ts";
import {
  moonLight,
  skyAt,
  weatherLook,
  windOf,
} from "../features/thursday/here-sky.ts";

// The globe the day's first call opens with (features/thursday/components/here-globe): its
// map, where it lands, and the sky and weather it draws. The drawing itself is looked at, not
// tested (screen.md).

const world: World = decodeWorld(
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, "..", "public", "here", "world.json"),
      "utf8",
    ),
  ),
);
const nameAt = (lat: number, lon: number) => {
  const found = homeOf(world, lat, lon);
  return found ? world.countries[found.country].name : null;
};
/** Her canvas and a field twice as wide, in reference units; the smallest globe a dive ends on. */
const frame = { width: 1360, height: 680, least: 293.8 };

test("the map knows which country a place is in, across 180° and just off a coast", () => {
  assert.equal(world.countries.length, 241);
  assert.equal(nameAt(37.5665, 126.978), "South Korea");
  assert.equal(nameAt(33.4996, 126.5312), "South Korea");
  assert.equal(nameAt(40.7128, -74.006), "United States of America");
  assert.equal(nameAt(51.5074, -0.1278), "United Kingdom");
  assert.equal(nameAt(55.7558, 37.6173), "Russia");
  assert.equal(nameAt(-18.1416, 178.4419), "Fiji");
  assert.equal(nameAt(-33.8688, 151.2093), "Australia");
  // out in the Pacific there is none, and none is guessed
  assert.equal(nameAt(0, -150), null);
});

test("the view fits the country they are in, the part of it they are on, whole and low in the frame", () => {
  const inFrame = (
    view: ReturnType<typeof fitView>,
    lat: number,
    lon: number,
  ) => {
    const at = project(lat, lon, view.latc, view.lonc, view.radius);
    return (
      at.seen &&
      Math.abs(at.x) <= frame.width / 2 &&
      Math.abs(at.y) <= frame.height / 2
    );
  };
  const seoul = fitView(world, 37.5665, 126.978, frame);
  assert.equal(world.countries[seoul.home].name, "South Korea");
  // every point of the peninsula's outline is on the frame, and so is Seoul
  const korea = world.countries[seoul.home].polys;
  const main = korea.reduce((a, b) =>
    a.rings[0].length > b.rings[0].length ? a : b,
  );
  for (let i = 0; i < main.rings[0].length; i += 2)
    assert.equal(
      inFrame(seoul, main.rings[0][i + 1], main.rings[0][i]),
      true,
      `${main.rings[0][i + 1]}, ${main.rings[0][i]}`,
    );
  assert.equal(inFrame(seoul, 37.5665, 126.978), true);
  // low in the frame: the country's middle sits below the frame's
  assert.ok(project(35.9, 127.8, seoul.latc, seoul.lonc, seoul.radius).y > 0);

  // New York is on Long Island's doorstep: the mainland is what fits, not the island
  const york = fitView(world, 40.7128, -74.006, frame);
  assert.equal(world.countries[york.home].name, "United States of America");
  assert.ok(york.lonc < -85 && york.lonc > -110, `${york.lonc}`);
  assert.equal(inFrame(york, 34.0522, -118.2437), true);

  // Russia runs past 180°: its middle is found on the unwrapped outline, not at the seam
  const moscow = fitView(world, 55.7558, 37.6173, frame);
  assert.equal(world.countries[moscow.home].name, "Russia");
  assert.ok(moscow.lonc > 60 && moscow.lonc < 140, `${moscow.lonc}`);
  assert.equal(inFrame(moscow, 55.7558, 37.6173), true);

  // out at sea, a fixed stretch round them
  const sea = fitView(world, 0, -150, frame);
  assert.equal(sea.home, -1);
  assert.equal(sea.latc, 0);
  assert.equal(sea.lonc, -150);
});

test("the sun rises and sets where and when it does, and stays up through a polar summer", () => {
  const minutes = (ms: number | null, offset: number) => {
    assert.notEqual(ms, null);
    const at = new Date((ms as number) + offset * 60_000);
    return at.getUTCHours() * 60 + at.getUTCMinutes();
  };
  // Seoul, 28 September 2026, at noon there (UTC+9): sunrise 06:24, sunset 18:21
  const noon = Date.UTC(2026, 8, 28, 3, 0);
  const seoul = skyAt(37.5665, 126.978, noon, 540);
  assert.ok(Math.abs(minutes(seoul.rise, 540) - (6 * 60 + 24)) <= 4);
  assert.ok(Math.abs(minutes(seoul.set, 540) - (18 * 60 + 21)) <= 4);
  assert.equal(seoul.up, true);
  // as high as it gets today, near the equinox: about 90° less the latitude
  assert.ok(Math.abs((seoul.top * 180) / Math.PI - 50.8) < 1.5);
  // at midnight it is down, and the moon two days past full is up
  const midnight = skyAt(37.5665, 126.978, Date.UTC(2026, 8, 28, 15, 0), 540);
  assert.equal(midnight.up, false);
  assert.notEqual(midnight.moon, null);
  assert.ok((midnight.moon?.lit ?? 0) > 0.9);

  // Tromsø in June: the sun never sets
  const tromso = skyAt(69.6492, 18.9553, Date.UTC(2026, 5, 21, 10, 0), 120);
  assert.equal(tromso.polarDay, true);
  assert.equal(tromso.set, null);
});

test("the moon is lit as it is: full, then new", () => {
  const full = moonLight(Date.UTC(2026, 8, 26, 16, 49));
  assert.ok(full.lit > 0.98, `${full.lit}`);
  assert.ok(Math.abs(full.phase - 0.5) < 0.03, `${full.phase}`);
  const fresh = moonLight(Date.UTC(2026, 9, 10, 15, 50));
  assert.ok(fresh.lit < 0.02, `${fresh.lit}`);
});

test("the weather is drawn from Open-Meteo's code, and the wind from the gusts", () => {
  assert.equal(weatherLook(0), "clear");
  assert.equal(weatherLook(2), "partly");
  assert.equal(weatherLook(3), "overcast");
  assert.equal(weatherLook(48), "fog");
  assert.equal(weatherLook(53), "drizzle");
  assert.equal(weatherLook(63), "rain");
  assert.equal(weatherLook(82), "heavy");
  assert.equal(weatherLook(75), "snow");
  assert.equal(weatherLook(99), "storm");
  // a code the table does not know draws no weather rather than a guess
  assert.equal(weatherLook(42), null);
  assert.equal(windOf(null), 0);
  assert.equal(windOf(HERE.windyKmh - 1), 0);
  assert.equal(windOf(HERE.windyKmh), 1);
  assert.equal(windOf(HERE.stormKmh), 2);
});

test("the globe plays once a day on a browser, and once a visit where nothing is kept", async (context) => {
  const kept = new Map<string, string>();
  let blocked = false;
  const storage = {
    getItem: (key: string) => {
      if (blocked) throw new Error("blocked");
      return kept.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (blocked) throw new Error("blocked");
      kept.set(key, value);
    },
  };
  const was = Object.getOwnPropertyDescriptor(globalThis, "window");
  context.after(() => {
    if (was) Object.defineProperty(globalThis, "window", was);
    else Reflect.deleteProperty(globalThis, "window");
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });
  const { hereDue, hereShown } = await import(
    "../features/thursday/here-day.ts"
  );
  const morning = new Date(2026, 8, 28, 8, 0);
  const evening = new Date(2026, 8, 28, 22, 30);
  const tomorrow = new Date(2026, 8, 29, 0, 5);
  assert.equal(hereDue(morning), true);
  hereShown(morning);
  assert.equal(hereDue(evening), false);
  // the day turns at the device's own midnight
  assert.equal(hereDue(tomorrow), true);
  // a browser that keeps nothing: once, and then not again that visit
  blocked = true;
  assert.equal(hereDue(tomorrow), true);
  hereShown(tomorrow);
  assert.equal(hereDue(tomorrow), false);
});
