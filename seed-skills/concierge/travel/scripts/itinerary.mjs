#!/usr/bin/env node
/**
 * The trip as one page: cover, flights, the stay, weather, day by day with real photos,
 * what to know at each stop and a map link, more places beside the plan, the costs, and what
 * to know and book before going. Written from a small JSON file
 * (references/itinerary.md shows every field) into the bot's artifacts folder as one
 * HTML file with its pictures inside, so it opens offline and prints. It wears the artifact
 * skill's shell, as every page a bot makes does: the maker's face and name in its head and at
 * its end, the app's type, the maker's colour as its one accent.
 *
 *   node itinerary.mjs <trip.json> [--name <file name>]
 *
 * A photo is `"wiki": "<Wikipedia title>"` (another language as "pt:Mosteiro dos Jerónimos"),
 * `"photo": "<web page url>"` (its own picture, through the browser skill's webimage.mjs),
 * or `"photo": "<local image path>"` (relative to the JSON file).
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fail, money, parseArgs } from "./lib.mjs";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NAME = /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,79}$/u;
// Wikimedia turns away a user agent that does not say what the tool is and where it lives
const AGENT = "thursday-agent travel (https://github.com/cgoinglove/thursday)";

const opts = parseArgs();
const source = opts._[0] && resolve(opts._[0]);
if (!source) fail("usage: node itinerary.mjs <trip.json> [--name <file name>]");
if (!existsSync(source)) fail(`No such file: ${source}`);
let trip;
try {
  trip = JSON.parse(readFileSync(source, "utf8"));
} catch (error) {
  fail(`${source} is not valid JSON: ${error.message}`);
}
const name = String(
  opts.name ?? source.replace(/^.*\//, "").replace(/\.json$/, ""),
);
if (!NAME.test(name))
  fail(`"${name}" is not a file name: letters, numbers, - and _ only.`);
if (!trip.title) fail('The JSON needs a "title".');
if (!Array.isArray(trip.days) || !trip.days.length)
  fail('The JSON needs "days": [{ "date", "title", "stops": [...] }].');
// A section given in the wrong shape would be left off the page without a word
for (const field of ["more", "before"])
  if (trip[field] != null && !Array.isArray(trip[field]))
    fail(`"${field}" is a list: [{ ... }, { ... }].`);
trip.days.forEach((d, i) => {
  if (!Array.isArray(d.stops) || !d.stops.length)
    fail(`Day ${i + 1} has no "stops".`);
  if (d.cover != null && !d.cover?.wiki && !d.cover?.photo)
    fail(`Day ${i + 1} "cover" needs a "wiki" or a "photo".`);
  d.stops.forEach((s, j) => {
    const at = `Day ${i + 1}, stop ${j + 1}`;
    if (!s.name) fail(`${at} has no "name".`);
    // Each picture is fetched one at a time and carried inside the page: a stop that asked
    // for many made a slow build and a heavy file
    if (s.photos != null) {
      if (!Array.isArray(s.photos) || s.photos.length > 2)
        fail(
          `${at} ("${s.name}") "photos" is a list of at most two, beside the stop's own photo.`,
        );
      s.photos.forEach((p, k) => {
        if (!p?.wiki && !p?.photo)
          fail(`${at} ("${s.name}") photos[${k}] needs a "wiki" or a "photo".`);
      });
    }
    if (s.book != null && s.book !== true && typeof s.book !== "string")
      fail(
        `${at} ("${s.name}") "book" is true or a few words on what to book.`,
      );
  });
});
const more = Array.isArray(trip.more) ? trip.more : [];
more.forEach((m, i) => {
  if (!m?.name) fail(`more[${i}] has no "name".`);
});
// The properties "before" may carry, each drawn with its own icon
const ICONS = [
  "entry",
  "money",
  "tipping",
  "power",
  "transit",
  "emergency",
  "health",
  "internet",
];
const before = Array.isArray(trip.before) ? trip.before : [];
before.forEach((b, i) => {
  if (!b?.label || !b?.text) fail(`before[${i}] needs a "label" and a "text".`);
  if (b.icon != null && !ICONS.includes(b.icon))
    fail(
      `before[${i}] "icon" is "${b.icon}": one of ${ICONS.join(", ")}, or leave it out.`,
    );
});
// Every address the page links to, checked here so a typo costs no photo fetch
const ABSOLUTE = /^https?:\/\/[^/\s]+/;
for (const [url, where] of [
  ...(trip.flights?.link ? [[trip.flights.link, '"flights.link"']] : []),
  ...(trip.stay?.link ? [[trip.stay.link, '"stay.link"']] : []),
  ...trip.days.flatMap((d, i) =>
    d.stops.flatMap((s, j) =>
      s.link
        ? [[s.link, `Day ${i + 1}, stop ${j + 1} ("${s.name}") "link"`]]
        : [],
    ),
  ),
  ...more.flatMap((m, i) =>
    m.link ? [[m.link, `more[${i}] ("${m.name}") "link"`]] : [],
  ),
  ...(Array.isArray(trip.sources) ? trip.sources : []).flatMap((s, i) =>
    typeof s === "string" ? [] : [[s?.url, `"sources"[${i}] "url"`]],
  ),
])
  if (!ABSOLUTE.test(String(url ?? "")))
    fail(
      `${where} is "${url ?? ""}", not a full address: write it with https:// or leave it out.`,
    );

/** The app's workspace: the nearest folder above holding its fence and a `projects` folder. */
function findWorkspace() {
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    if (
      existsSync(join(dir, "pnpm-workspace.yaml")) &&
      existsSync(join(dir, "projects"))
    )
      return dir;
    if (dir === dirname(dir)) return process.cwd();
  }
}
const WORKSPACE = findWorkspace();
// From the workspace or whole: joined, a whole path landed nested inside the workspace
const out = join(
  resolve(WORKSPACE, process.env.THURSDAY_ARTIFACTS || "artifacts"),
  `${name}.html`,
);

const cur = trip.currency ? String(trip.currency).toUpperCase() : null;
const lang = String(trip.lang ?? "en");
// Built without them, a page in another language came out with "Day by day" and "Before you go" on it,
// and the warning printed after the build was passed over
if (!lang.startsWith("en") && !trip.labels)
  fail(
    `The page is in "${lang}" but its own headings would be English: add "labels" in that language (references/itinerary.md) and build again.`,
  );
const place = String(trip.place ?? "");
const L = {
  flights: "Getting there",
  stay: "Where you stay",
  weather: "Weather",
  days: "Day by day",
  costs: "What it costs",
  notes: "Before you go",
  more: "More places",
  bookAhead: "Book ahead",
  tip: "Tip",
  total: "Total",
  perPerson: "per person",
  map: "Map",
  route: "The day's route in Google Maps",
  book: "Booking page",
  night: "night",
  nights: "nights",
  day: "Day",
  sources: "Sources",
  ...trip.labels,
};

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmtDay = (iso, withWeekday = true) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso ?? ""))) return esc(iso);
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang, {
    ...(withWeekday ? { weekday: "short" } : {}),
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};
/** An amount in the trip's currency. The JSON names it: a price with none would be read as whatever the reader thinks in. */
const inCurrency = (amount) => {
  if (!cur)
    fail(
      'The trip has prices but no "currency": add the one they are in (an ISO code such as "EUR") and build again.',
    );
  return money(amount, cur, lang);
};
const cost = (v) => (typeof v === "number" ? inCurrency(v) : esc(v));
const mapsSearch = (q) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const mapQuery = (s) => s.map ?? [s.name, place].filter(Boolean).join(", ");

// ---- Photos, fetched once each and put inside the page

const photoJobs = new Map();
const missing = [];

/** A fetch that waits and tries again when told it asked too fast (Wikimedia's 429). */
async function polite(url, headers = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { "user-agent": AGENT, ...headers },
      signal: AbortSignal.timeout(30000),
    });
    if (res.status !== 429 || attempt === 3) return res;
    const wait = Number(res.headers.get("retry-after")) || 2 ** attempt;
    await new Promise((done) => setTimeout(done, Math.min(wait, 10) * 1000));
  }
}
async function getJson(url) {
  const res = await polite(url);
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).hostname}`);
  return res.json();
}
async function dataUri(url) {
  const res = await polite(url);
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).hostname}`);
  const type = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];
  if (!type.startsWith("image/")) throw new Error(`${type} is not a picture`);
  return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
}
const plain = (html) =>
  String(html ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * A Wikipedia article's own lead picture, with who made it and, where its file says, its licence.
 * `pilicense=any`: the lead picture the article shows, not only a freely licensed one — the
 * default (`free`) returns none for an article led by a non-free image, and the stop then shows
 * without its photo.
 */
async function fromWiki(title, width) {
  const [wiki, name] = /^[a-z]{2,3}:/.test(title)
    ? [title.slice(0, title.indexOf(":")), title.slice(title.indexOf(":") + 1)]
    : ["en", title];
  const api = `https://${wiki}.wikipedia.org/w/api.php?format=json&action=query&redirects=1`;
  const q = await getJson(
    `${api}&prop=pageimages|info&inprop=url&piprop=thumbnail|name&pithumbsize=${width}&pilicense=any&titles=${encodeURIComponent(name)}`,
  );
  const page = Object.values(q.query?.pages ?? {})[0];
  if (!page || "missing" in page)
    throw new Error(`no ${wiki} Wikipedia article "${name}"`);
  if (!page.thumbnail) throw new Error(`"${name}" has no lead picture`);
  let credit = "Wikipedia";
  for (const host of ["commons.wikimedia.org", `${wiki}.wikipedia.org`]) {
    try {
      const m = await getJson(
        `https://${host}/w/api.php?format=json&action=query&prop=imageinfo&iiprop=extmetadata&titles=${encodeURIComponent(`File:${page.pageimage}`)}`,
      );
      const meta = Object.values(m.query?.pages ?? {})[0]?.imageinfo?.[0]
        ?.extmetadata;
      if (!meta) continue;
      credit = [
        plain(meta.Artist?.value).slice(0, 40),
        meta.LicenseShortName?.value,
      ]
        .filter(Boolean)
        .join(", ");
      break;
    } catch {}
  }
  return {
    src: await dataUri(page.thumbnail.source),
    credit,
    href: page.fullurl,
  };
}

/** A web page's own picture, through the shipped webimage script and this shell's browser. */
function fromPage(url) {
  const script = join(
    process.env.THURSDAY_SKILLS ?? "",
    "browser/scripts/webimage.mjs",
  );
  if (!process.env.THURSDAY_SKILLS || !existsSync(script))
    throw new Error("THURSDAY_SKILLS is not set: run this from a bot's shell");
  const dir = mkdtempSync(join(tmpdir(), "trip-photo-"));
  try {
    const said = execFileSync(
      process.execPath,
      [script, url, "--out", dir, "--json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const { files, credit } = JSON.parse(said.trim().split("\n").at(-1));
    if (!files?.length) throw new Error("no picture came back");
    return { src: fromFile(files[0].path).src, credit, href: url };
  } catch (error) {
    throw new Error(
      String(error.stderr || error.message)
        .trim()
        .split("\n")[0],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function fromFile(path) {
  const file = resolve(dirname(source), path);
  if (!existsSync(file)) throw new Error(`no file ${file}`);
  const type =
    {
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".avif": "image/avif",
    }[extname(file).toLowerCase()] ?? "image/jpeg";
  return {
    src: `data:${type};base64,${readFileSync(file).toString("base64")}`,
    credit: "",
    href: "",
  };
}

/**
 * Queue a picture for `thing` ({ wiki } or { photo }); the page reads it back after. A
 * Wikipedia picture comes `width` wide: one shown across the page at 960, one a card or half
 * a row takes at 500, a quarter of the bytes. Wikimedia serves its own steps of width and
 * rounds any other up (640 came back 960).
 */
function want(thing, label, width = 960) {
  if (!thing) return null;
  const key = thing.wiki
    ? `wiki:${width}:${thing.wiki}`
    : thing.photo
      ? `photo:${thing.photo}`
      : null;
  if (!key) return null;
  if (!photoJobs.has(key))
    photoJobs.set(key, {
      label,
      run: () =>
        thing.wiki
          ? fromWiki(thing.wiki, width)
          : /^https?:\/\//.test(thing.photo)
            ? fromPage(thing.photo)
            : fromFile(thing.photo),
    });
  return key;
}

const coverKey = trip.cover ? want(trip.cover, "cover") : null;
const stayKey = trip.stay ? want(trip.stay, trip.stay.name) : null;
const stopKeys = trip.days.map((d) => d.stops.map((s) => want(s, s.name)));
const dayKeys = trip.days.map((d, i) =>
  d.cover ? want(d.cover, `Day ${i + 1} cover`) : null,
);
const extraKeys = trip.days.map((d) =>
  d.stops.map((s) =>
    (s.photos ?? []).map((p) => ({
      key: want(p, p.caption ?? s.name, 500),
      caption: p.caption,
    })),
  ),
);
const moreKeys = more.map((m) => want(m, m.name, 500));

const photos = new Map();
// One at a time: Wikimedia answers a burst with 429
for (const [key, job] of photoJobs) {
  try {
    photos.set(key, await job.run());
  } catch (error) {
    missing.push(`${job.label}: ${error.message}`);
  }
}

/** Who made a picture, linked to where it came from. */
const creditOf = (p) =>
  p.credit
    ? p.href
      ? `<a href="${esc(p.href)}">${esc(p.credit)}</a>`
      : esc(p.credit)
    : "";
const figure = (key, cls = "", caption = "") => {
  const p = key && photos.get(key);
  if (!p) return "";
  const said = [caption && esc(caption), creditOf(p)].filter(Boolean);
  return `<figure class="${cls}"><img src="${p.src}" alt="">${said.length ? `<figcaption>${said.join(" · ")}</figcaption>` : ""}</figure>`;
};

// ---- The page

const parts = [];
const cover = coverKey && photos.get(coverKey);
parts.push(
  `<header class="cover${cover ? "" : " plain"}">${cover ? `<img src="${cover.src}" alt="">` : ""}${
    cover?.credit
      ? `<div class="credit">${cover.href ? `<a href="${esc(cover.href)}">${esc(cover.credit)}</a>` : esc(cover.credit)}</div>`
      : ""
  }<div class="over"><h1>${esc(trip.title)}</h1>${trip.lede ? `<p class="lede">${esc(trip.lede)}</p>` : ""}</div></header>`,
);

const costs = Array.isArray(trip.costs) ? trip.costs : [];
// The costs are added up, so each is a number: a range or a word would leave the total
// counting it as nothing, and the page would state a total that is wrong
costs.forEach((c, i) => {
  if (typeof c.amount !== "number" || !Number.isFinite(c.amount))
    fail(
      `costs[${i}].amount is ${JSON.stringify(c.amount)}: the costs are added up, so each is a number in the trip's currency, the price you read. Leave out a cost you could not read, say so in "notes", and build again.`,
    );
});
const total = costs.reduce((s, c) => s + c.amount, 0);
const people = Number(trip.travelers ?? 0);
const facts = [
  ...(trip.facts ?? []).map((f) => [f.value, f.label]),
  ...(costs.length
    ? [
        [
          inCurrency(total),
          people > 1
            ? `${L.total} · ${inCurrency(total / people)} ${L.perPerson}`
            : L.total,
          "total",
        ],
      ]
    : []),
];
if (facts.length)
  parts.push(
    `<section class="facts">${facts
      .map(
        ([v, l, cls]) =>
          `<div class="fact ${cls ?? ""}"><b class="num">${esc(v)}</b><span>${esc(l)}</span></div>`,
      )
      .join("")}</section>`,
  );

if (trip.flights?.legs?.length) {
  const f = trip.flights;
  const legs = f.legs
    .map(
      (
        g,
      ) => `<div class="leg"><div class="when"><b>${esc(g.label ?? "")}</b>${fmtDay(g.date)}</div>
<div class="hop"><div class="end"><b>${esc(g.dep)}</b><span>${esc(g.from)}</span></div><div class="line">${esc([g.duration, g.stops].filter(Boolean).join(" · "))}</div><div class="end"><b>${esc(g.arr)}</b><span>${esc(g.to)}</span></div></div>
<div class="who">${esc(g.airline ?? "")}${g.price != null ? `<br><span class="price">${cost(g.price)}</span>` : ""}</div></div>`,
    )
    .join("");
  const foot = [
    f.price != null
      ? `<span><span class="price">${cost(f.price)}</span>${f.priceNote ? ` <small>${esc(f.priceNote)}</small>` : ""}</span>`
      : "",
    f.link ? `<a href="${esc(f.link)}">${esc(L.book)}</a>` : "",
  ].filter(Boolean);
  parts.push(
    `<h2>${esc(L.flights)}</h2><section class="panel">${legs}${foot.length ? `<div class="panel-foot">${foot.join("")}</div>` : ""}</section>`,
  );
  if (f.note) parts.push(`<p class="muted">${esc(f.note)}</p>`);
}

if (trip.stay) {
  const s = trip.stay;
  const nights = Number(s.nights ?? 0);
  const line = [
    s.price != null
      ? `<span class="price">${cost(s.price)}</span> / ${esc(L.night)}`
      : "",
    nights && typeof s.price === "number"
      ? `${inCurrency(s.price * nights)} · ${nights} ${esc(nights > 1 ? L.nights : L.night)}`
      : "",
    s.rating ? `★ ${esc(s.rating)}` : "",
  ].filter(Boolean);
  parts.push(
    `<h2>${esc(L.stay)}</h2><section class="panel stay${figure(stayKey) ? "" : " bare"}">${figure(stayKey)}<div class="body"><h3>${esc(s.name)}</h3>${
      s.area ? `<div class="muted">${esc(s.area)}</div>` : ""
    }<p>${line.join(" &nbsp;·&nbsp; ")}</p>${s.why ? `<p>${esc(s.why)}</p>` : ""}<p><a href="${esc(mapsSearch(mapQuery(s)))}">${esc(L.map)}</a>${
      s.link ? ` &nbsp; <a href="${esc(s.link)}">${esc(L.book)}</a>` : ""
    }</p></div></section>`,
  );
}

const withWeather = trip.days.filter((d) => d.weather);
if (withWeather.length || trip.climate) {
  parts.push(`<h2>${esc(L.weather)}</h2>`);
  if (trip.climate) parts.push(`<p>${esc(trip.climate)}</p>`);
  if (withWeather.length)
    parts.push(
      `<section class="weather">${withWeather.map((d) => `<div><b>${fmtDay(d.date)}</b>${esc(d.weather)}</div>`).join("")}</section>`,
    );
}

parts.push(`<h2>${esc(L.days)}</h2>`);
trip.days.forEach((d, i) => {
  // The day's picture: its own cover, else the first stop's photo, which that stop then
  // does not show again
  const own = photos.has(dayKeys[i]);
  const lead = own
    ? -1
    : d.stops.findIndex((_, j) => photos.has(stopKeys[i][j]));
  const dayPic = own
    ? figure(dayKeys[i], "day-pic")
    : lead >= 0
      ? figure(stopKeys[i][lead], "day-pic", d.stops[lead].name)
      : "";
  const stops = d.stops
    .map((s, j) => {
      const pics = [
        ...(j === lead ? [] : [{ key: stopKeys[i][j] }]),
        ...extraKeys[i][j],
      ]
        .map((p) => figure(p.key, "", p.caption))
        .filter(Boolean);
      const tags = [
        s.hours ? `<span class="tag hours">${esc(s.hours)}</span>` : "",
        s.duration ? `<span class="tag long">${esc(s.duration)}</span>` : "",
        s.book
          ? `<span class="tag book">${esc(s.book === true ? L.bookAhead : s.book)}</span>`
          : "",
        s.cost != null ? `<span class="tag cost">${cost(s.cost)}</span>` : "",
      ].filter(Boolean);
      const links = [
        s.map !== false
          ? `<a href="${esc(mapsSearch(mapQuery(s)))}">${esc(L.map)}</a>`
          : "",
        s.link
          ? `<a href="${esc(s.link)}">${esc(s.linkText ?? new URL(s.link).hostname.replace(/^www\./, ""))}</a>`
          : "",
      ].filter(Boolean);
      return `<li class="stop"><time>${esc(s.time ?? "")}</time><div><h4>${esc(s.name)}</h4>${
        s.what ? `<p>${esc(s.what)}</p>` : ""
      }${tags.length ? `<div class="tags">${tags.join("")}</div>` : ""}${
        pics.length
          ? `<div class="pics n${pics.length}">${pics.join("")}</div>`
          : ""
      }${s.tip ? `<p class="tip"><b>${esc(L.tip)}</b> ${esc(s.tip)}</p>` : ""}${links.length ? `<div class="links">${links.join("")}</div>` : ""}</div></li>`;
    })
    .join("");
  // One link opens every stop of the day in order, with transit between them
  const stopsOnMap = d.stops.filter((s) => s.map !== false).map(mapQuery);
  const route =
    stopsOnMap.length > 1
      ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(stopsOnMap[0])}&destination=${encodeURIComponent(stopsOnMap.at(-1))}${
          stopsOnMap.length > 2
            ? `&waypoints=${encodeURIComponent(stopsOnMap.slice(1, -1).slice(0, 8).join("|"))}`
            : ""
        }&travelmode=${d.travel ?? trip.travel ?? "transit"}`
      : null;
  parts.push(
    `<article class="panel day"><header><span class="n">${esc(L.day)} ${i + 1}</span><h3>${esc(d.title ?? "")}</h3><span class="meta">${fmtDay(d.date)}${
      d.weather ? ` · <span class="sky">${esc(d.weather)}</span>` : ""
    }</span></header>${dayPic}<ol class="stops">${stops}</ol>${route ? `<footer><a href="${esc(route)}">${esc(L.route)}</a></footer>` : ""}</article>`,
  );
});

// Places beside the plan, for a day that runs short: a card each, its picture over its words
if (more.length)
  parts.push(
    `<h2>${esc(L.more)}</h2><section class="places">${more
      .map((m, i) => {
        const links = [
          m.map !== false
            ? `<a href="${esc(mapsSearch(mapQuery(m)))}">${esc(L.map)}</a>`
            : "",
          m.link
            ? `<a href="${esc(m.link)}">${esc(m.linkText ?? new URL(m.link).hostname.replace(/^www\./, ""))}</a>`
            : "",
        ].filter(Boolean);
        return `<article class="panel place">${figure(moreKeys[i])}<div class="body">${
          m.tag ? `<span class="kind">${esc(m.tag)}</span>` : ""
        }<h3>${esc(m.name)}</h3>${m.what ? `<p>${esc(m.what)}</p>` : ""}${
          m.near ? `<p class="near">${esc(m.near)}</p>` : ""
        }${links.length ? `<div class="links">${links.join("")}</div>` : ""}</div></article>`;
      })
      .join("")}</section>`,
  );

if (costs.length) {
  const rows = costs
    .map(
      (c) =>
        `<tr><td>${esc(c.item)}${c.note ? `<small>${esc(c.note)}</small>` : ""}</td><td class="num">${cost(c.amount)}</td></tr>`,
    )
    .join("");
  parts.push(
    `<h2>${esc(L.costs)}</h2><section class="panel"><table><tbody>${rows}<tr class="total"><td>${esc(L.total)}${
      people > 1
        ? `<small>${inCurrency(total / people)} ${esc(L.perPerson)}</small>`
        : ""
    }</td><td class="num">${inCurrency(total)}</td></tr></tbody></table>${trip.fx ? `<div class="fx">${esc(trip.fx)}</div>` : ""}</section>`,
  );
}

// Before going: what to know as properties, the notes, and what to book as a list to tick
const toBook = trip.days.flatMap((d) =>
  d.stops
    .filter((s) => s.book)
    .map(
      (s) =>
        `<li><label><input type="checkbox"><span>${esc(s.name)}</span><small>${[
          fmtDay(d.date),
          typeof s.book === "string" ? esc(s.book) : "",
        ]
          .filter(Boolean)
          .join(" · ")}</small></label></li>`,
    ),
);
if (before.length || trip.notes?.length || toBook.length)
  parts.push(
    `<h2>${esc(L.notes)}</h2>${
      before.length
        ? `<dl class="props">${before
            .map(
              (b) =>
                `<div><dt class="${b.icon ? `i-${b.icon}` : ""}">${esc(b.label)}</dt><dd>${esc(b.text)}</dd></div>`,
            )
            .join("")}</dl>`
        : ""
    }${trip.notes?.length ? `<ul class="notes">${trip.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}${
      toBook.length
        ? `<h3 class="sub">${esc(L.bookAhead)}</h3><ul class="to-book">${toBook.join("")}</ul>`
        : ""
    }`,
  );

if (trip.sources?.length)
  parts.push(
    `<p class="sources">${esc(L.sources)}: ${trip.sources
      .map((s) =>
        typeof s === "string"
          ? esc(s)
          : `<a href="${esc(s.url)}">${esc(s.label ?? new URL(s.url).hostname)}</a>`,
      )
      .join(" · ")}</p>`,
  );

const css = readFileSync(join(SKILL, "page", "itinerary.css"), "utf8").trim();
// The shell every page a bot makes wears: its head, type, theme and the maker's name
const wearAt = join(
  process.env.THURSDAY_SKILLS ?? "",
  "artifact/runtime/shell/wear.mjs",
);
if (!process.env.THURSDAY_SKILLS || !existsSync(wearAt))
  fail("THURSDAY_SKILLS is not set: run this from a bot's shell in the app.");
const { wear, pageHead } = await import(pathToFileURL(wearAt).href);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  wear(`<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
{{shell.meta}}
<meta name="print" content="pdf">
<title>${esc(trip.title)}</title>
<script>
// shell.theme
</script>
<style>
/* shell.css */
${css}
</style>
</head>
<body>
${pageHead(trip.title)}
<main>
${parts.join("\n")}
</main>
{{shell.sign}}
<script>
// shell.js
</script>
</body>
</html>
`),
);
const kb = Math.round(statSync(out).size / 1024);
console.log(
  `${relative(WORKSPACE, out)} (${kb} KB, ${photos.size} photo${photos.size === 1 ? "" : "s"} inside). One file that opens offline; hand back this path.`,
);
if (missing.length)
  console.log(
    `No photo for: ${missing.join("; ")}. Give those a "wiki" title that exists — a place abroad often has one only in its own language's Wikipedia ("pt:Mosteiro dos Jerónimos", "de:Kölner Dom") — or a "photo" page url, or leave them without one.`,
  );
