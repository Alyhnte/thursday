import { HERE } from "@/config";
import { errorToString } from "@/lib/utils";
import type { Where } from "./thursday.schema";

// In the browser: where the user is, asked of the device, named and forecast from here.
// Both services are free, take no key and answer a page directly; BigDataCloud's fair use
// asks for exactly this — calls from the browser, with the device's current position from
// the Geolocation API — so a server anywhere, local or not, never sees the position.

/** What was found last, and when: used again for `HERE.keptMs`. */
let kept: { where: Where; at: number } | null = null;

function position(): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve(coords),
      reject,
      { maximumAge: HERE.keptMs },
    ),
  );
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`${new URL(url).host} answered ${response.status}`);
  return response.json();
}

/** `Lisbon, Portugal`, in English like the rest of the prompt. */
async function placeOf(
  at: GeolocationCoordinates,
  signal: AbortSignal,
): Promise<string | null> {
  const body = (await getJson(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?${new URLSearchParams(
      {
        latitude: String(at.latitude),
        longitude: String(at.longitude),
        localityLanguage: "en",
      },
    )}`,
    signal,
  )) as { city?: string; locality?: string; countryName?: string };
  const place = [body.city || body.locality, body.countryName]
    .filter(Boolean)
    .join(", ");
  return place || null;
}

async function weatherAt(
  at: GeolocationCoordinates,
  signal: AbortSignal,
): Promise<Where["weather"]> {
  // To about a kilometre: a forecast needs no more
  const round = (degrees: number) =>
    (Math.round(degrees * 100) / 100).toString();
  const body = (await getJson(
    `https://api.open-meteo.com/v1/forecast?${new URLSearchParams({
      latitude: round(at.latitude),
      longitude: round(at.longitude),
      current: "temperature_2m,weather_code",
      daily: "temperature_2m_max,temperature_2m_min,sunrise,sunset",
      // Sunrise and sunset in the place's own time
      timezone: "auto",
      forecast_days: "1",
    })}`,
    signal,
  )) as {
    current: { temperature_2m: number; weather_code: number };
    daily: {
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      sunrise: string[];
      sunset: string[];
    };
  };
  // `2026-09-27T07:28` → `07:28`
  const clock = (iso: string) => iso.slice(11, 16);
  return {
    code: body.current.weather_code,
    temperature: body.current.temperature_2m,
    low: body.daily.temperature_2m_min[0],
    high: body.daily.temperature_2m_max[0],
    sunrise: clock(body.daily.sunrise[0]),
    sunset: clock(body.daily.sunset[0]),
  };
}

async function find(signal: AbortSignal): Promise<Where | null> {
  const at = await position();
  const [place, weather] = await Promise.allSettled([
    placeOf(at, signal),
    weatherAt(at, signal),
  ]);
  for (const [what, result] of [
    ["place", place],
    ["weather", weather],
  ] as const) {
    if (result.status === "rejected")
      console.warn(`No ${what} for the call: ${errorToString(result.reason)}`);
  }
  const where = {
    place: place.status === "fulfilled" ? place.value : null,
    weather: weather.status === "fulfilled" ? weather.value : null,
  };
  return where.place || where.weather ? where : null;
}

/**
 * Where the user is and the weather there, or null: no Geolocation, refused, no position, or
 * nothing within `HERE.waitMs`. Called as a call starts, from the press that starts it, so the
 * browser's permission prompt comes with something the user did; the browser remembers the
 * answer. A refusal is theirs to make and is not logged.
 */
export async function whereNow(): Promise<Where | null> {
  if (kept && Date.now() - kept.at < HERE.keptMs) return kept.where;
  if (!("geolocation" in navigator)) return null;
  const deadline = new AbortController();
  const late = setTimeout(() => deadline.abort(), HERE.waitMs);
  try {
    const where = await Promise.race([
      find(deadline.signal),
      new Promise<null>((resolve) =>
        deadline.signal.addEventListener("abort", () => resolve(null)),
      ),
    ]);
    if (where) kept = { where, at: Date.now() };
    return where;
  } catch (cause) {
    const refused =
      (cause as GeolocationPositionError).code ===
      GeolocationPositionError.PERMISSION_DENIED;
    if (!refused)
      console.warn(`No position for the call: ${errorToString(cause)}`);
    return null;
  } finally {
    clearTimeout(late);
  }
}
