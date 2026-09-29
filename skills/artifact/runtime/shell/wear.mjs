// Puts the shell on a page a skill's script writes (deck.mjs, canvas.mjs, page.mjs): its
// stylesheet with the app's type inside it, the line that sets the theme before the first
// paint, its script, and the parts of the head every kind has (head.html). Whatever it puts
// in is copied into the page, so the page stays one file that opens alone.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { revision } from "./put.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (file) => readFileSync(join(HERE, file), "utf8").trim();

/** Words as page text: a bot's name is whatever the user typed when they named the bot. */
const escape = (text) =>
  String(text).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

/** Path data as the app draws a mark: commands and numbers, nothing that could close the tag. */
const PATH = /^[MLCZ0-9 .-]{1,40000}$/;
/** A colour the app gives a mark: the page's text, a hex, or a paint's oklch. */
const INK = /^(currentColor|#[0-9a-fA-F]{6}|oklch\([0-9. ]+\))$/;

let marks = 0;

/**
 * Geist and Geist Mono, the app's own type (fonts/, OFL), as @font-face rules that carry the
 * files: each subset only for the letters it draws, so a page in another script falls to
 * the reader's system as before. Read once a run.
 */
const FACES = [
  ["Geist", "Geist-latin", "latin"],
  ["Geist", "Geist-latin-ext", "latin-ext"],
  ["Geist Mono", "GeistMono-latin", "latin"],
  ["Geist Mono", "GeistMono-latin-ext", "latin-ext"],
];
const RANGES = {
  latin:
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  "latin-ext":
    "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
};
let faces = "";
const fontFaces = () =>
  (faces ||= FACES.map(
    ([family, file, range]) =>
      `@font-face{font-family:"${family}";font-style:normal;font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64,${readFileSync(join(HERE, "fonts", `${file}.woff2`)).toString("base64")}) format("woff2");unicode-range:${RANGES[range]}}`,
  ).join("\n"));

/** The bot's face as its shell gives it, or null (`THURSDAY_BOT_MARK`, the app's markStill). */
const markOf = (raw = process.env.THURSDAY_BOT_MARK) => {
  try {
    return JSON.parse(raw ?? "") ?? null;
  } catch {
    return null;
  }
};

/**
 * The maker's colour as the page's one accent (shell.css --sh-maker): the colour its face
 * is drawn in, when that is one colour. Nothing for a face in a paint or the page's text.
 */
function makerRule(raw) {
  const { ink, paint } = markOf(raw) ?? {};
  if (!/^(#[0-9a-fA-F]{6}|oklch\([0-9. ]+\))$/.test(String(ink))) return "";
  if (Array.isArray(paint) && paint.length > 1) return "";
  return `:root{--sh-maker:${ink}}`;
}

/**
 * The bot's face as its shell gives it (`THURSDAY_BOT_MARK`, the app's markStill): a still
 * SVG at `size` px, or "" when there is none. The app writes that variable; anything in it
 * that is not a mark's path data or colours draws no face rather than reaching the page.
 * The eyes are holes in the body, so they show whatever the page is.
 */
export function markSvg(size = 16, raw = process.env.THURSDAY_BOT_MARK) {
  const { head, eyes, ink, paint, outline } = markOf(raw) ?? {};
  const shapes = [head, ...(Array.isArray(eyes) ? eyes : [])];
  if (shapes.length !== 3 || !shapes.every((d) => PATH.test(String(d))))
    return "";
  const colors = Array.isArray(paint) ? paint : [];
  if (!INK.test(String(ink)) || !colors.every((c) => INK.test(String(c))))
    return "";
  const id = `sh-mark-${++marks}`;
  const fill = colors.length > 1 ? `url(#${id})` : ink;
  const stops = colors
    .map(
      (c, i) => `<stop offset="${i / (colors.length - 1)}" stop-color="${c}"/>`,
    )
    .join("");
  const defs =
    colors.length > 1
      ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs>`
      : "";
  const body = outline
    ? `<path d="${head}" fill="none" stroke="${fill}" stroke-width="14" stroke-linejoin="round"/><path d="${eyes[0]}${eyes[1]}" fill="${fill}"/>`
    : `<path d="${head}${eyes[0]}${eyes[1]}" fill="${fill}" fill-rule="evenodd"/>`;
  return `<svg class="sh-mark" width="${size}" height="${size}" viewBox="-18 -18 276 276" aria-hidden="true">${defs}${body}</svg>`;
}

/** A page's own name for itself, in its tab and in its head (each kind's `.sh-title`). */
export const retitle = (html, title) =>
  html
    .replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`)
    .replace(
      /<span class="sh-title">[^<]*<\/span>/,
      `<span class="sh-title">${escape(title)}</span>`,
    );

/** head.html's `<!-- part: name -->` sections, by name. */
const parts = () => {
  const found = {};
  const pieces = read("head.html").split(/<!-- part: ([\w-]+) -->/);
  for (let i = 1; i < pieces.length; i += 2)
    found[pieces[i]] = pieces[i + 1].trim();
  return found;
};

/**
 * `html` with the shell put in where its markers stand. Who made the page comes from the
 * bot's shell (`THURSDAY_BOT`); a page written outside a bot's job names nobody.
 */
export function wear(html) {
  const part = parts();
  const bot = escape(process.env.THURSDAY_BOT?.trim() ?? "");
  return html
    .replace(
      "/* shell.css */",
      () => `${fontFaces()}\n${read("shell.css")}\n${makerRule()}`,
    )
    .replace("// shell.theme", () => read("theme.js"))
    .replace("// shell.js", () => read("shell.js"))
    .replaceAll("{{shell.meta}}", () =>
      part.meta.replace("{{revision}}", revision()),
    )
    .replaceAll("{{shell.who}}", () =>
      part.who.replaceAll("{{bot}}", bot).replace("{{mark}}", () => markSvg()),
    )
    .replaceAll("{{shell.sign}}", () =>
      part.sign
        .replaceAll("{{bot}}", bot)
        .replace("{{mark}}", () => markSvg(18)),
    )
    .replaceAll("{{shell.theme}}", () => part.theme)
    .replaceAll("{{shell.export}}", () => part.export)
    .replaceAll("{{shell.download}}", () => part.download);
}
