import { HERE } from "@/config";

// The sky over a place now (components/here-globe): where the sun and the moon are, and what
// the weather draws. The positions are the low-precision formulas of Astronomy Answers
// (aa.quae.nl, "How to compute planetary positions"), as suncalc uses them: good to a fraction
// of a degree and a minute or two of sunrise, which is all a sky of glyphs can show. No DOM.

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
/** The sun's altitude at rise and set: its radius, and the air bending its light. */
const RISE_ALT = -0.833 * RAD;

/** Days since J2000 (noon, 1 January 2000, UTC). */
const daysOf = (ms: number) => ms / DAY_MS - 0.5 + 2440588 - 2451545;

/** Sidereal time at longitude `lon` (degrees east), radians. */
const sidereal = (d: number, lon: number) =>
  RAD * (280.16 + 360.9856235 * d) + lon * RAD;

/** Where the sun is on the sky's sphere: declination and right ascension, radians. */
function sunCoords(d: number) {
  const tilt = RAD * 23.4397;
  const mean = RAD * (357.5291 + 0.98560028 * d);
  const centre =
    RAD *
    (1.9148 * Math.sin(mean) +
      0.02 * Math.sin(2 * mean) +
      0.0003 * Math.sin(3 * mean));
  const ecliptic = mean + centre + RAD * 102.9372 + Math.PI;
  return {
    dec: Math.asin(Math.sin(tilt) * Math.sin(ecliptic)),
    ra: Math.atan2(Math.sin(ecliptic) * Math.cos(tilt), Math.cos(ecliptic)),
  };
}

/** The same for the moon, with how far it is (km). */
function moonCoords(d: number) {
  const tilt = RAD * 23.4397;
  const longitude = RAD * (218.316 + 13.176396 * d);
  const anomaly = RAD * (134.963 + 13.064993 * d);
  const distance = RAD * (93.272 + 13.22935 * d);
  const l = longitude + RAD * 6.289 * Math.sin(anomaly);
  const b = RAD * 5.128 * Math.sin(distance);
  return {
    ra: Math.atan2(
      Math.sin(l) * Math.cos(tilt) - Math.tan(b) * Math.sin(tilt),
      Math.cos(l),
    ),
    dec: Math.asin(
      Math.sin(b) * Math.cos(tilt) + Math.cos(b) * Math.sin(tilt) * Math.sin(l),
    ),
    km: 385001 - 20905 * Math.cos(anomaly),
  };
}

const altitude = (hour: number, lat: number, dec: number) =>
  Math.asin(
    Math.sin(lat) * Math.sin(dec) +
      Math.cos(lat) * Math.cos(dec) * Math.cos(hour),
  );

/** The sun's altitude over `(lat, lon)` at `ms`, radians. */
export function sunAltitude(ms: number, lat: number, lon: number) {
  const d = daysOf(ms);
  const sun = sunCoords(d);
  return altitude(sidereal(d, lon) - sun.ra, lat * RAD, sun.dec);
}

/** The moon's, the same way. */
export function moonAltitude(ms: number, lat: number, lon: number) {
  const d = daysOf(ms);
  const moon = moonCoords(d);
  return altitude(sidereal(d, lon) - moon.ra, lat * RAD, moon.dec);
}

/**
 * How much of the moon is lit, 0 to 1, and where it is in its month: 0 new, below 0.5
 * waxing, 0.5 full, above it waning.
 */
export function moonLight(ms: number): { lit: number; phase: number } {
  const d = daysOf(ms);
  const sun = sunCoords(d);
  const moon = moonCoords(d);
  const sunKm = 149598000;
  const apart = Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        Math.sin(sun.dec) * Math.sin(moon.dec) +
          Math.cos(sun.dec) * Math.cos(moon.dec) * Math.cos(sun.ra - moon.ra),
      ),
    ),
  );
  const incidence = Math.atan2(
    sunKm * Math.sin(apart),
    moon.km - sunKm * Math.cos(apart),
  );
  const angle = Math.atan2(
    Math.cos(sun.dec) * Math.sin(sun.ra - moon.ra),
    Math.sin(sun.dec) * Math.cos(moon.dec) -
      Math.cos(sun.dec) * Math.sin(moon.dec) * Math.cos(sun.ra - moon.ra),
  );
  return {
    lit: (1 + Math.cos(incidence)) / 2,
    phase: 0.5 + (0.5 * incidence * (angle < 0 ? -1 : 1)) / Math.PI,
  };
}

/** The sky at a place and a moment: what the globe puts over their country. */
export type Sky = {
  /** The sun's altitude now, radians. */
  alt: number;
  /** Today's sunrise and sunset (ms); null where the sun does not cross the horizon today. */
  rise: number | null;
  set: number | null;
  /** The highest the sun gets today, radians. */
  top: number;
  /** Local midnight that began today (ms). */
  midnight: number;
  /** The sun stays up, or down, all day. */
  polarDay: boolean;
  polarNight: boolean;
  up: boolean;
  /** The moon, on the pass it is on now: null while it is down. */
  moon: {
    alt: number;
    rise: number;
    set: number;
    top: number;
    lit: number;
    phase: number;
  } | null;
};

/**
 * The sky over `(lat, lon)` at `ms`, the place `offset` minutes ahead of UTC. Rise and set
 * are found by walking the day in five-minute steps: the day's own shape, polar days
 * included, rather than a formula that has none.
 */
export function skyAt(
  lat: number,
  lon: number,
  ms: number,
  offset: number,
): Sky {
  const midnight =
    Math.floor((ms + offset * 60_000) / DAY_MS) * DAY_MS - offset * 60_000;
  let rise: number | null = null;
  let set: number | null = null;
  let top = -Math.PI;
  let before = sunAltitude(midnight, lat, lon);
  let always = before >= RISE_ALT;
  let never = !always;
  for (let minute = 5; minute <= 1440; minute += 5) {
    const at = midnight + minute * 60_000;
    const now = sunAltitude(at, lat, lon);
    const was = at - 5 * 60_000;
    if (before < RISE_ALT && now >= RISE_ALT && rise === null)
      rise = was + ((RISE_ALT - before) / (now - before)) * 5 * 60_000;
    if (before >= RISE_ALT && now < RISE_ALT)
      set = was + ((before - RISE_ALT) / (before - now)) * 5 * 60_000;
    if (now >= RISE_ALT) never = false;
    else always = false;
    top = Math.max(top, now);
    before = now;
  }
  const alt = sunAltitude(ms, lat, lon);

  // the moon's pass: back to where it rose and on to where it sets, while it is up now
  let moon: Sky["moon"] = null;
  const moonNow = moonAltitude(ms, lat, lon);
  if (moonNow > 0) {
    let moonRise: number | null = null;
    let moonSet: number | null = null;
    let moonTop = moonNow;
    for (let minute = 10; minute <= 1080 && moonRise === null; minute += 10) {
      const a = moonAltitude(ms - minute * 60_000, lat, lon);
      if (a <= 0) moonRise = ms - minute * 60_000;
      else moonTop = Math.max(moonTop, a);
    }
    for (let minute = 10; minute <= 1080 && moonSet === null; minute += 10) {
      const a = moonAltitude(ms + minute * 60_000, lat, lon);
      if (a <= 0) moonSet = ms + minute * 60_000;
      else moonTop = Math.max(moonTop, a);
    }
    // a moon that has not set within the walk is circling a polar sky: no pass to place it on
    if (moonRise !== null && moonSet !== null)
      moon = {
        alt: moonNow,
        rise: moonRise,
        set: moonSet,
        top: moonTop,
        ...moonLight(ms),
      };
  }
  return {
    alt,
    rise,
    set,
    top,
    midnight,
    polarDay: always,
    polarNight: never,
    up: alt >= RISE_ALT,
    moon,
  };
}

/** What the globe draws of the weather: Open-Meteo's WMO code, grouped the way it looks. */
export type WeatherLook =
  | "clear"
  | "partly"
  | "overcast"
  | "fog"
  | "drizzle"
  | "rain"
  | "heavy"
  | "snow"
  | "storm";

const LOOKS: Record<number, WeatherLook> = {
  0: "clear",
  1: "clear",
  2: "partly",
  3: "overcast",
  45: "fog",
  48: "fog",
  51: "drizzle",
  53: "drizzle",
  55: "drizzle",
  56: "drizzle",
  57: "drizzle",
  61: "rain",
  63: "rain",
  66: "rain",
  80: "rain",
  81: "rain",
  65: "heavy",
  67: "heavy",
  82: "heavy",
  71: "snow",
  73: "snow",
  75: "snow",
  77: "snow",
  85: "snow",
  86: "snow",
  95: "storm",
  96: "storm",
  99: "storm",
};

/** How a code looks; null for one the table does not know, which is drawn as no weather. */
export const weatherLook = (code: number): WeatherLook | null =>
  LOOKS[code] ?? null;

/**
 * How hard it blows, from the gusts: 0 calm enough to draw nothing, 1 wind across the globe,
 * 2 a storm turning over it as well (config HERE `windyKmh`, `stormKmh`).
 */
export function windOf(gusts: number | null | undefined): 0 | 1 | 2 {
  if (gusts == null) return 0;
  return gusts >= HERE.stormKmh ? 2 : gusts >= HERE.windyKmh ? 1 : 0;
}
