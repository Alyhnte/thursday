// The motion engine: every value on screen is a pure function of time, so any frame can be
// drawn alone, in any order, as often as the camera asks. No CSS transition, no timer and
// nothing carried from one frame to the next — only `seek(t)`.
//
// A value that changes target many times is the sum of one closed-form spring per change;
// a swap of what is shown blurs the old out fast and the new in after it. Both follow the
// engine of Barty-Bart/motion-graphics (MIT, LICENSE.txt beside this file).
const M = {};

M.clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
M.lerp = (a, b, u) => a + (b - a) * u;
/** Ease out, cubic. */
M.eo = (x) => 1 - (1 - M.clamp(x)) ** 3;
/** Ease in and out, quintic. */
M.eio = (x) => {
  const u = M.clamp(x);
  return u * u * u * (u * (6 * u - 15) + 10);
};

/**
 * A spring's step from 0 to 1, `tau` seconds after it was let go, at rest before that. Once
 * what is left of its swing is under 1/2000 it is at rest: nothing on screen moves after
 * that, so the frames it holds are the same picture and the camera takes it once.
 */
M.S = (tau, w, z) => {
  if (tau <= 0) return 0;
  if (!Number.isFinite(w) || Math.min(z, 1) * w * tau > (z < 1 ? 7.6 : 9.5))
    return 1;
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    return (
      1 -
      Math.exp(-z * w * tau) *
        (Math.cos(wd * tau) + ((z * w) / wd) * Math.sin(wd * tau))
    );
  }
  return 1 - Math.exp(-w * tau) * (1 + w * tau);
};

// Springs as [stiffness ω, damping ζ]: a morph lands with the smallest overshoot, a leading
// edge (FAST) outruns its trailing one (SLOW) so an indicator stretches as it travels
M.MORPH = [15, 0.84];
M.FAST = [27, 0.86];
M.SLOW = [12.5, 0.9];
M.SOFT = [10, 0.95];
M.CAM = [7.5, 1];
M.POP = [16, 0.7];
M.INSTANT = [Number.POSITIVE_INFINITY, 1];

/** `v0`, then each `[t, value, spring?]` in turn: returns t => value. */
M.track = (v0, keys, spring = M.MORPH) => {
  let prev = v0;
  const steps = [];
  for (const [t, value, sp] of keys) {
    const d = value - prev;
    prev = value;
    const [w, z] = sp || spring;
    if (d !== 0) steps.push([t, d, w, z]);
  }
  return (t) => {
    let v = v0;
    for (const [at, d, w, z] of steps) v += d * M.S(t - at, w, z);
    return v;
  };
};

/** A colour as [r, g, b] from "#rrggbb". */
M.rgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

/** `M.track` for colours: "#rrggbb" in, "rgb(…)" out; a key may carry its own spring. */
M.ctrack = (c0, keys, spring = [20, 1]) => {
  const parts = [0, 1, 2].map((i) =>
    M.track(
      M.rgb(c0)[i],
      keys.map(([t, c, sp]) => [t, M.rgb(c)[i], sp ?? spring]),
      spring,
    ),
  );
  return (t) =>
    `rgb(${parts.map((f) => Math.round(M.clamp(f(t), 0, 255))).join(",")})`;
};

/**
 * A swap of what is shown: shown from `tin` (null: from the start) until `tout` (null: to
 * the end). The way out is quick; the way in waits `din` so the two never overlap.
 */
M.vis = (t, tin, tout, o = {}) => {
  const din = o.din ?? 0.08;
  const lin = o.lin ?? 0.28;
  const lout = o.lout ?? 0.13;
  const blur = o.blur ?? 12;
  const a = tin == null ? 1 : M.eo((t - tin - din) / lin);
  const b = tout == null ? 0 : M.eo((t - tout) / lout);
  return {
    o: a * (1 - b),
    blur: (1 - a) * blur + b * blur * 0.8,
    s: (0.94 + 0.06 * a) * (1 - 0.03 * b),
    a,
    b,
  };
};

// Every write to the page goes through `set`, which rounds what it writes and keeps the last
// value: a frame that writes nothing new is the frame before it, and the camera reuses that
// picture instead of taking another. Numbers are rounded to what the eye can tell apart.
let writes = 0;
M.writes = () => writes;
M.set = (el, prop, value) => {
  const key = `_${prop}`;
  if (el[key] === value) return;
  el[key] = value;
  el.style[prop] = value;
  writes++;
};
M.text = (el, value) => {
  if (el._text === value) return;
  el._text = value;
  el.textContent = value;
  writes++;
};
/** `el` moved into `parent`, when it is not there already. */
M.move = (el, parent) => {
  if (el.parentNode === parent) return;
  parent.append(el);
  writes++;
};
M.px = (v) => `${Math.round(v * 10) / 10}px`;
M.n = (v, d = 3) => String(Math.round(v * 10 ** d) / 10 ** d);

/**
 * A `vis` result onto an element: its opacity, blur and scale, and taken out when gone —
 * `display`, not `visibility`, which a child set visible would show through.
 */
M.show = (el, v, extra = "") => {
  if (v.o < 0.004) {
    M.set(el, "display", "none");
    return false;
  }
  M.set(el, "display", "");
  M.set(el, "opacity", M.n(v.o));
  M.set(el, "filter", v.blur > 0.15 ? `blur(${M.n(v.blur, 1)}px)` : "none");
  M.set(el, "transform", `scale(${M.n(v.s, 4)})${extra}`);
  return true;
};

/** A point path [[t, x, y], …], eased between keys along a slight human arc. */
M.path = (keys) => (t) => {
  if (!keys.length) return { x: 0, y: 0 };
  if (t <= keys[0][0]) return { x: keys[0][1], y: keys[0][2] };
  const last = keys[keys.length - 1];
  if (t >= last[0]) return { x: last[1], y: last[2] };
  let i = 0;
  while (t >= keys[i + 1][0]) i++;
  const [t0, x0, y0] = keys[i];
  const [t1, x1, y1] = keys[i + 1];
  const u = M.eio((t - t0) / (t1 - t0));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const arc = Math.sin(Math.PI * u) * 0.06;
  return { x: x0 + dx * u - dy * arc, y: y0 + dy * u + dx * arc };
};

/** 0 → 1 → 0 around each press: a click at `t`, or a hold over [a, b]. */
M.presses = (clicks = [], holds = []) => {
  const keys = [];
  for (const c of clicks)
    keys.push([c - 0.07, 1, [45, 1]], [c + 0.035, 0, [22, 0.72]]);
  for (const [a, b] of holds)
    keys.push([a - 0.04, 1, [45, 1]], [b, 0, [22, 0.72]]);
  keys.sort((a, b) => a[0] - b[0]);
  return M.track(0, keys);
};

/** Characters of `s` shown `cps` a second from `t0`: typing. */
M.typed = (s, t, t0, cps = 28) => {
  const chars = [...s];
  return chars.slice(0, Math.max(0, Math.floor((t - t0) * cps))).join("");
};

/** An element from HTML, or with a class and text. */
M.el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

// One icon set: 24-grid strokes, each drawn at the same stroke on screen whatever its size.
// A name not in it is drawn as it was written — an emoji or a letter.
M.IC = {
  arrow: ["M5 12h14", "M13 5l7 7-7 7"],
  check: ["M20 6 9 17l-5-5"],
  x: ["M18 6 6 18", "M6 6l12 12"],
  plus: ["M5 12h14", "M12 5v14"],
  minus: ["M5 12h14"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "m21 21-4.3-4.3"],
  file: [
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z",
    "M14 2v6h6",
    "M8 13h8",
    "M8 17h5",
  ],
  folder: [
    "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z",
  ],
  terminal: ["m4 17 6-6-6-6", "M12 19h8"],
  code: ["m8 6-6 6 6 6", "m16 6 6 6-6 6"],
  chat: ["M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12Z"],
  mail: ["M3 6h18v12H3Z", "m3 7 9 6 9-6"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7v5l3 2"],
  calendar: ["M4 6h16v14H4Z", "M4 10h16", "M8 3v4", "M16 3v4"],
  coin: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
    "M15 9h-4.5a1.5 1.5 0 0 0 0 3h3a1.5 1.5 0 0 1 0 3H9",
    "M12 7v10",
  ],
  chart: ["M4 20V4", "M4 20h16", "M8 16v-4", "M12 16V8", "M16 16v-6"],
  bolt: ["M13 2 4 14h7l-1 8 9-12h-7Z"],
  sparkle: [
    "M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z",
  ],
  star: [
    "m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z",
  ],
  heart: [
    "M12 20s-7-4.4-9-9a4.5 4.5 0 0 1 9-3 4.5 4.5 0 0 1 9 3c-2 4.6-9 9-9 9Z",
  ],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4 21a8 8 0 0 1 16 0"],
  users: [
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
    "M2 20a7 7 0 0 1 14 0",
    "M16 4.5a3.5 3.5 0 0 1 0 6.5",
    "M18 13.5a7 7 0 0 1 4 6.5",
  ],
  lock: ["M6 11h12v10H6Z", "M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11"],
  globe: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
    "M3 12h18",
    "M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z",
  ],
  link: [
    "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1",
    "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  ],
  bell: ["M6 16V11a6 6 0 0 1 12 0v5l2 2H4Z", "M10 20a2 2 0 0 0 4 0"],
  gear: [
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
  ],
  image: [
    "M4 5h16v14H4Z",
    "m4 16 5-5 4 4 2-2 5 5",
    "M15.5 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  ],
  play: ["M7 4v16l13-8Z"],
  pause: ["M8 5v14", "M16 5v14"],
  mic: [
    "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z",
    "M5 11a7 7 0 0 0 14 0",
    "M12 18v3",
  ],
  phone: ["M7 2h10v20H7Z", "M11 18h2"],
  home: ["M3 11 12 4l9 7", "M5 10v10h14V10"],
  cart: [
    "M3 4h2l2.4 11h11l2-8H6.2",
    "M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
    "M17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  ],
  rocket: [
    "M12 15 9 12c1.5-4.5 4.5-8 11-9-1 6.5-4.5 9.5-9 11Z",
    "M9 12H5l2-4h4",
    "M12 15v4l4-2v-4",
    "M6 16c-1.5 1-2 3-2 4 1 0 3-.5 4-2",
  ],
  flag: ["M5 21V4", "M5 4h12l-2 4 2 4H5"],
  target: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
    "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    "M12 12h.01",
  ],
  trend: ["M3 17 9 11l4 4 8-8", "M15 7h6v6"],
  shield: ["M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6Z"],
  download: ["M12 4v11", "m7 10 5 5 5-5", "M5 20h14"],
  upload: ["M12 20V9", "m7 14 5-5 5 5", "M5 4h14"],
  cloud: ["M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 9.5 4 4 0 0 1 17.5 18Z"],
  bot: [
    "M5 9h14v10H5Z",
    "M12 5v4",
    "M12 4.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z",
    "M9 14h.01",
    "M15 14h.01",
  ],
};

/** An icon at `size` px in `color`: from the set, or the name itself drawn as a glyph. */
M.icon = (name, size, color, stroke = 2.2) => {
  const box = M.el("span", "mo-icon");
  box.style.width = `${size}px`;
  box.style.height = `${size}px`;
  const paths = M.IC[name];
  if (!paths) {
    box.textContent = name;
    box.style.fontSize = `${Math.round(size * 0.86)}px`;
    return box;
  }
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", color);
  svg.setAttribute("stroke-width", ((stroke * 24) / size).toFixed(3));
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const d of paths) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  box.append(svg);
  return box;
};
