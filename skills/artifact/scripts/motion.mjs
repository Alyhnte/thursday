#!/usr/bin/env node
// A motion video: scenes written as JSON, drawn by one engine as a card that morphs from
// scene to scene, played in the app and made into an mp4 frame by frame.
//
//   node motion.mjs put <name|path> <video.json>     the scenes into the video, checked first
//   node motion.mjs get <name|path> <file.json>      the video's JSON as it is now, into <file>
//   node motion.mjs voices <name|path> <audio>...    one voice per scene that has "say", in order
//   node motion.mjs track <name|path> <file>         a recording the scenes are timed to
//   node motion.mjs shots <name|path> [--at 1.2,3]   the scenes as pictures, all on one, in scratch/
//   node motion.mjs render <name|path> [--draft]     <name>.mp4 beside it
import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveFolder } from "../../browser/scripts/serve.mjs";
import { apart, parseArgs } from "../../browser/scripts/session.mjs";
import { check } from "../runtime/motion/schema.mjs";
import {
  ARTIFACTS,
  NAME,
  Stop,
  shown,
  WORKSPACE,
} from "../runtime/shell/workspace.mjs";
import { findFfmpeg, probe } from "./media.mjs";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(SKILL, "scripts", "motion.mjs");
const RUNTIME = join(SKILL, "runtime", "motion");

// Pictures taken for each frame of the finished video, spread across the shutter's half
// turn and blended: what makes a fast move blur the way a camera's does. A draft takes one.
const SUBFRAMES = 4;
// Tabs drawing at once: past this the browser's one compositor is the limit
const MOST_TABS = 4;
// Frames drawn and encoded at a time, so the pictures on disk never outgrow one piece
const PIECE_S = 2;

/** `<name>/<name>.html` in the bot's artifacts folder: the video, with what it plays beside it. */
function fileFor(name) {
  if (!name || !NAME.test(name))
    throw new Stop(
      `${name ? `"${name}" is not` : "Give"} a video name: letters, numbers, - and _ only.`,
    );
  return join(ARTIFACTS, name, `${name}.html`);
}

/** A video named, or pointed at by its folder or its file (one another bot handed over). */
function videoAt(arg, { made = true } = {}) {
  if (!arg) throw new Stop("Give a video name, or the path to one.");
  let file;
  if (!/[/\\]|\.html$/i.test(arg)) file = fileFor(arg);
  else {
    const path = resolve(arg);
    file =
      existsSync(path) && statSync(path).isDirectory()
        ? join(path, `${basename(path)}.html`)
        : path;
  }
  if (made && !existsSync(file))
    throw new Stop(
      `No video ${shown(file)}. Write its scenes as JSON and make it with: node ${SCRIPT} put <name> <video.json>`,
    );
  return file;
}

const SPEC =
  /<script type="application\/json" id="motion-spec">([\s\S]*?)<\/script>/;

/** The JSON a video was made from, as the page holds it. */
function specOf(file) {
  const got = SPEC.exec(readFileSync(file, "utf8"));
  if (!got)
    throw new Stop(
      `${shown(file)} is not a motion video, or it was written over whole. Make it again from its JSON: node ${SCRIPT} put <name> <video.json>`,
    );
  return JSON.parse(got[1]);
}

/** The page: the runtime around `spec`, one file that plays offline. */
function page(spec, title) {
  const read = (f) => readFileSync(join(RUNTIME, f), "utf8");
  const font = (f) =>
    readFileSync(join(RUNTIME, "fonts", f)).toString("base64");
  const css = read("motion.css")
    .replace("__GEIST__", () => font("Geist-Variable.woff2"))
    .replace("__GEISTMONO__", () => font("GeistMono-Medium.woff2"));
  const js = ["engine.js", "parts.js", "stage.js"].map(read).join("\n");
  // JSON inside a <script>: nothing in it may close the tag or open a comment
  const json = JSON.stringify(spec, null, 1)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
  const escape = (text) =>
    String(text).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );
  return read("motion.html")
    .replace("{{title}}", () => escape(title))
    .replace("/* motion.css */", () => css)
    .replace('"{{spec}}"', () => json)
    .replace("// motion.js", () => js);
}

/** The spec checked against the folder it plays from, and written as the page. */
function write(file, spec) {
  const dir = dirname(file);
  const errors = check(spec, { exists: (p) => existsSync(join(dir, p)) });
  if (errors.length)
    throw new Stop(
      `Nothing was written. Fix these in the JSON and put it again:\n- ${errors.join("\n- ")}`,
    );
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, page(spec, basename(file, ".html")));
}

/** Length in seconds of the video `spec` makes, the way stage.js lays it out. */
function lengthOf(spec) {
  if (spec.track) return spec.track.length;
  return spec.scenes.reduce(
    (a, s) => a + (s.voice ? s.voice.length + 0.45 : (s.dur ?? 0)),
    0,
  );
}

function put(name, from) {
  if (!from || !existsSync(from))
    throw new Stop(
      `Give the JSON file the scenes are written in: node ${SCRIPT} put ${name ?? "<name>"} <video.json>`,
    );
  const file = videoAt(name, { made: false });
  let spec;
  try {
    spec = JSON.parse(readFileSync(from, "utf8"));
  } catch (error) {
    throw new Stop(`${from} is not JSON: ${error.message}`);
  }
  // What the other commands attached stays: the recording, and each voice while its
  // scene still says the words it was made for
  const had = existsSync(file) ? specOf(file) : null;
  const notes = [];
  if (had?.track && !spec.track) {
    spec.track = had.track;
    spec.size = had.size;
    spec.fps = had.fps;
  }
  const voices = new Map(
    (had?.scenes ?? []).filter((s) => s.voice).map((s) => [s.say, s.voice]),
  );
  spec.scenes?.forEach((s, i) => {
    if (!s || typeof s !== "object") return;
    if (!s.voice && voices.has(s.say)) s.voice = voices.get(s.say);
    if (s.voice && s.voice.text !== s.say) delete s.voice;
    if (!s.voice && had?.scenes?.[i]?.voice)
      notes.push(
        `Scene ${i + 1}'s words changed, so its voice was let go: make it again and run voices.`,
      );
  });
  write(file, spec);
  const secs = lengthOf(spec);
  console.log(
    `${shown(file)}: ${spec.scenes.length} scene(s), ${secs.toFixed(1)}s. It plays when opened. Look at it: node ${SCRIPT} shots ${name}; make the mp4: node ${SCRIPT} render ${name}`,
  );
  for (const note of notes) console.log(note);
}

function get(name, to) {
  const file = videoAt(name);
  if (!to)
    throw new Stop(
      `Give the file to write the JSON into: node ${SCRIPT} get ${name} <file.json>`,
    );
  writeFileSync(to, `${JSON.stringify(specOf(file), null, 2)}\n`);
  console.log(
    `The JSON of ${shown(file)} as it is now is in ${to}. Change it there, then: node ${SCRIPT} put ${name} ${to}`,
  );
}

/** Each voice to the scene that says it, moved beside the video; its length read off it. */
function voices(name, ...files) {
  const file = videoAt(name);
  const spec = specOf(file);
  if (spec.track)
    throw new Stop(
      "This video is timed to a recording (track), which is its sound: voices are for a video with none.",
    );
  const speaking = spec.scenes.filter((s) => s.say);
  if (!speaking.length)
    throw new Stop(
      'No scene has "say": the words a voice reads are each scene\'s "say".',
    );
  const missing = files.filter((f) => !existsSync(f));
  if (files.length !== speaking.length || missing.length)
    throw new Stop(
      missing.length
        ? `No such audio: ${missing.join(", ")}`
        : `${speaking.length} scene(s) have "say" and ${files.length} audio file(s) came: one per scene that has "say", in order.`,
    );
  const dir = dirname(file);
  const ffmpeg = findFfmpeg(WORKSPACE, Stop);
  mkdirSync(join(dir, "voices"), { recursive: true });
  let n = 0;
  spec.scenes.forEach((s, i) => {
    if (!s.say) return;
    const from = resolve(files[n++]);
    const rel = `voices/scene-${String(i + 1).padStart(2, "0")}${extname(from)}`;
    const to = join(dir, rel);
    const { length } = probe(ffmpeg, from, Stop);
    if (resolve(to) !== from) {
      rmSync(to, { force: true });
      renameSync(from, to);
    }
    s.voice = { file: rel, length: Number(length.toFixed(3)), text: s.say };
  });
  write(file, spec);
  console.log(
    `${n} voice(s) in ${shown(join(dir, "voices"))}, each scene as long as its voice: ${lengthOf(spec).toFixed(1)}s. Next: node ${SCRIPT} shots ${name}`,
  );
}

/** A recording the scenes are timed to: their video, or audio. Copied beside the video. */
function track(name, from) {
  const file = videoAt(name);
  if (!from || !existsSync(from))
    throw new Stop(
      `Give the recording: node ${SCRIPT} track ${name} <video or audio file>`,
    );
  const spec = specOf(file);
  const ffmpeg = findFfmpeg(WORKSPACE, Stop);
  const got = probe(ffmpeg, from, Stop);
  const dir = dirname(file);
  const rel = `track/${basename(from)}`;
  const to = join(dir, rel);
  mkdirSync(dirname(to), { recursive: true });
  if (resolve(from) !== resolve(to)) {
    rmSync(to, { force: true });
    // Theirs stays where it was: a link where the disk allows it, a copy where not
    try {
      linkSync(from, to);
    } catch {
      copyFileSync(from, to);
    }
  }
  spec.track = {
    file: rel,
    kind: got.video ? "video" : "audio",
    length: Number(got.length.toFixed(3)),
  };
  if (got.video) {
    // Drawn over their picture, the frame is theirs
    spec.size = `${got.video.w - (got.video.w % 2)}x${got.video.h - (got.video.h % 2)}`;
    if (got.video.fps) spec.fps = Math.round(got.video.fps * 1000) / 1000;
  }
  for (const s of spec.scenes) {
    delete s.voice;
    delete s.dur;
  }
  const errors = check(spec, { exists: (p) => existsSync(join(dir, p)) });
  if (errors.length) {
    // Scenes written before there was a recording have no times on it yet: their JSON,
    // with the recording in it, waits in scratch for the times
    const json = join(
      WORKSPACE,
      "scratch",
      `${basename(file, ".html")}.track.json`,
    );
    mkdirSync(dirname(json), { recursive: true });
    writeFileSync(json, `${JSON.stringify(spec, null, 2)}\n`);
    throw new Stop(
      `The recording is in ${shown(to)} (${got.length.toFixed(1)}s${got.video ? `, ${spec.size}` : ""}), and the scenes are not timed to it yet:\n- ${errors.join("\n- ")}\nThe JSON with the recording in it is ${shown(json)}: give each scene "at", the second it comes in on the transcript, then: node ${SCRIPT} put ${name} ${shown(json)}`,
    );
  }
  write(file, spec);
  console.log(
    `${shown(file)} plays over ${shown(to)} (${got.length.toFixed(1)}s): ${got.video ? "the scenes cut in over their video, which shows between them" : "the scenes run to their recording"}.`,
  );
}

/** Every scene settled, and the moments it changes, as one picture to look at. */
async function shots(name, ...rest) {
  const file = videoAt(name);
  const spec = specOf(file);
  const opts = parseArgs(rest);
  const [w, h] = spec.size.split("x").map(Number);
  const out = join(WORKSPACE, "scratch", `${basename(file, ".html")}-shots`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const served = await serveFolder(dirname(file));
  const url = `${served.url(basename(file))}?render`;
  const asked =
    typeof opts.at === "string"
      ? opts.at.split(",").map(Number).filter(Number.isFinite)
      : null;
  try {
    const got = await apart((inPage) =>
      inPage(
        async (page, { url, w, h, out, asked }) => {
          const tab = await page.context().newPage();
          await tab.setViewportSize({ width: w, height: h });
          await tab.goto(url, { waitUntil: "load" });
          await tab.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(
              [...document.images].map((i) => i.decode().catch(() => {})),
            );
          });
          const info = await tab.evaluate(() => ({
            ...window.MOTION,
            cut: window.MOTION.cut(),
            broken: [...document.images]
              .filter((i) => !i.naturalWidth)
              .map((i) => i.getAttribute("src")),
          }));
          // Each scene once it has settled, and halfway into each change it makes
          const times =
            asked ??
            info.scenes.flatMap((s) => {
              const settle = Math.max(s.start, s.end - 0.2);
              const mid =
                s.beats.length > 1
                  ? [s.beats[Math.floor(s.beats.length / 2)] + 0.12]
                  : [];
              return [...mid, settle];
            });
          const pngs = [];
          for (const [i, t] of times.entries()) {
            await tab.evaluate((t) => window.seek(t), t);
            const path = `${out}/shot-${String(i + 1).padStart(2, "0")}.png`;
            pngs.push(
              (await tab.screenshot({ path, scale: "css" })).toString("base64"),
            );
          }
          const cols = w > h ? 3 : 5;
          const cell = w > h ? 560 : 300;
          const cells = pngs
            .map(
              (png, i) =>
                `<figure><figcaption>${i + 1} · ${times[i].toFixed(2)}s</figcaption><img src="data:image/png;base64,${png}"></figure>`,
            )
            .join("");
          await tab.setViewportSize({
            width: cols * (cell + 16) + 32,
            height: 800,
          });
          await tab.setContent(
            `<!doctype html><style>body{margin:0;background:#e8e8e8}#sheet{display:inline-grid;grid-template-columns:repeat(${cols},${cell}px);gap:20px 16px;padding:16px}figure{margin:0}figcaption{font:600 16px/1.4 system-ui,sans-serif;color:#1b1b1b;padding-bottom:6px}img{display:block;width:${cell}px;box-shadow:0 0 0 1px #0002}</style><div id="sheet">${cells}</div>`,
          );
          await tab.evaluate(() =>
            Promise.all([...document.images].map((i) => i.decode())),
          );
          await tab.locator("#sheet").screenshot({ path: `${out}/sheet.png` });
          await tab.close();
          return {
            times,
            cut: info.cut,
            broken: info.broken,
            scenes: info.scenes.length,
          };
        },
        { url, w, h, out, asked },
      ),
    );
    console.log(
      `${got.times.length} picture(s) of ${got.scenes} scene(s) in ${shown(out)}; all of them on one: ${shown(join(out, "sheet.png"))}. Look at that one.`,
    );
    if (got.cut.length)
      console.log(
        `Scene(s) ${got.cut.join(", ")} hold more than fits their card: shorten the words or split the scene.`,
      );
    if (got.broken.length)
      console.log(`Pictures that did not load: ${got.broken.join(", ")}`);
  } finally {
    served.close();
  }
}

/** A frame rate as ffmpeg takes it, and as a number. */
function rateOf(fps) {
  const text = String(fps ?? 30);
  const [a, b] = text.split("/").map(Number);
  return { text, value: b ? a / b : a };
}

async function render(name, ...rest) {
  const file = videoAt(name);
  const opts = parseArgs(rest);
  const draft = Boolean(opts.draft);
  const spec = specOf(file);
  const dir = dirname(file);
  const ffmpeg = findFfmpeg(WORKSPACE, Stop);
  const [w, h] = spec.size.split("x").map(Number);
  const fps = rateOf(spec.fps);
  const sub = draft ? 1 : SUBFRAMES;
  const tabs = Math.max(1, Math.min(MOST_TABS, availableParallelism() - 1));
  const work = mkdtempSync(join(dir, `.${basename(file, ".html")}-frames-`));
  const out = file.replace(/\.html$/, ".mp4");
  const served = await serveFolder(dir);
  const url = `${served.url(basename(file))}?render`;
  const began = Date.now();
  try {
    const made = await apart(async (inPage) => {
      const info = await inPage(
        async (page, { url, w, h, tabs }) => {
          const ctx = page.context();
          const broken = [];
          for (let k = 0; k < tabs; k++) {
            const tab = await ctx.newPage();
            await tab.setViewportSize({ width: w, height: h });
            await tab.goto(url, { waitUntil: "load" });
            broken.push(
              ...(await tab.evaluate(async () => {
                await document.fonts.ready;
                await Promise.all(
                  [...document.images].map((i) => i.decode().catch(() => {})),
                );
                return [...document.images]
                  .filter((i) => !i.naturalWidth)
                  .map((i) => i.getAttribute("src"));
              })),
            );
          }
          const m = await ctx
            .pages()
            .at(-1)
            .evaluate(() => window.MOTION);
          return { ...m, broken: [...new Set(broken)] };
        },
        { url, w, h, tabs },
      );
      if (info.broken.length)
        throw new Stop(
          `Pictures that did not load: ${info.broken.join(", ")}. Put them in the video's folder, then render again.`,
        );
      const frames = Math.round(info.duration * fps.value);
      const per = Math.max(1, Math.round(PIECE_S * fps.value));
      const pieces = [];
      let encoding = null;
      let reused = 0;
      for (let f0 = 0; f0 < frames; f0 += per) {
        const f1 = Math.min(frames, f0 + per);
        const got = await inPage(
          async (page, { from, to, sub, fps, work, alpha }) => {
            const tabs = page
              .context()
              .pages()
              .filter((p) => p.url().includes("?render"));
            const all = to - from;
            const share = Math.ceil(all / tabs.length);
            const reuse = [];
            await Promise.all(
              tabs.map(async (tab, k) => {
                const a = from + k * share;
                const b = Math.min(to, a + share);
                let last = -1;
                for (let i = a; i < b; i++) {
                  const f = Math.floor(i / sub);
                  const s = i % sub;
                  // Across half of the frame's time, centred on it: a 180° shutter
                  const t = Math.max(
                    0,
                    f / fps + (s - (sub - 1) / 2) / (fps * 2 * sub),
                  );
                  const changed = await tab.evaluate((t) => window.seek(t), t);
                  const name = `${work}/f${String(i).padStart(7, "0")}.${alpha ? "png" : "jpg"}`;
                  if (changed === 0 && last >= 0) reuse.push([last, i]);
                  else {
                    // A jpeg is taken faster, and the video it goes into keeps less than it
                    // does; only a picture over their video needs a png's transparency
                    await tab.screenshot(
                      alpha
                        ? { path: name, omitBackground: true }
                        : { path: name, type: "jpeg", quality: 95 },
                    );
                    last = i;
                  }
                }
              }),
            );
            return reuse;
          },
          {
            from: f0 * sub,
            to: f1 * sub,
            sub,
            fps: fps.value,
            work,
            alpha: info.alpha,
          },
        );
        // A frame that drew nothing new is the picture before it
        const ext = info.alpha ? "png" : "jpg";
        for (const [from, to] of got) {
          const src = join(work, `f${String(from).padStart(7, "0")}.${ext}`);
          const dst = join(work, `f${String(to).padStart(7, "0")}.${ext}`);
          try {
            linkSync(src, dst);
          } catch {
            copyFileSync(src, dst);
          }
        }
        reused += got.length;
        // Encoded while the next piece is drawn; one at a time, beside the browser
        await encoding;
        encoding = encodePiece(ffmpeg, {
          work,
          f0,
          f1,
          sub,
          fps,
          alpha: info.alpha,
          draft,
        });
        // Its failure is met where it is awaited, not as an unhandled rejection before that
        encoding.catch(() => {});
        pieces.push(encoding);
        process.stdout.write(
          `drawn ${(f1 / fps.value).toFixed(1)}s of ${info.duration.toFixed(1)}s\n`,
        );
      }
      return { info, pieces: await Promise.all(pieces), frames, reused };
    });
    finish(ffmpeg, { ...made, spec, dir, work, out, fps, draft });
    const secs = made.info.duration;
    const mb = (statSync(out).size / 1024 / 1024).toFixed(1);
    const drawn = made.frames * sub;
    console.log(
      `Made ${shown(out)}${draft ? " (a draft: no motion blur)" : ""}: ${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")} long, ${spec.size}, ${mb} MB, in ${Math.round((Date.now() - began) / 1000)}s (${Math.round((made.reused / drawn) * 100)}% of ${drawn} pictures were still and reused). Hand back this path.`,
    );
  } finally {
    served.close();
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * One piece of frames into a video of its own, and its pictures deleted: blended from its
 * subframes, lossless with its transparency when it goes over their video, else h264.
 */
function encodePiece(ffmpeg, { work, f0, f1, sub, fps, alpha, draft }) {
  const stem = join(work, `piece-${String(f0).padStart(7, "0")}`);
  const blend =
    sub > 1
      ? `tmix=frames=${sub}:weights='${Array(sub).fill(1).join(" ")}',select='eq(mod(n\\,${sub})\\,${sub - 1})',`
      : "";
  const file = `${stem}.${alpha ? "mkv" : "mp4"}`;
  const ext = alpha ? "png" : "jpg";
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-framerate",
    String(fps.value * sub),
    "-start_number",
    String(f0 * sub),
    "-i",
    join(work, `f%07d.${ext}`),
    "-vf",
    `format=${alpha ? "rgba" : "rgb24"},${blend}setpts=N/(${fps.value})/TB`,
    "-r",
    fps.text,
    "-frames:v",
    String(f1 - f0),
    ...(alpha
      ? ["-c:v", "ffv1", "-pix_fmt", "bgra"]
      : [
          "-c:v",
          "libx264",
          "-preset",
          draft ? "veryfast" : "medium",
          "-crf",
          draft ? "22" : "16",
          "-pix_fmt",
          "yuv420p",
        ]),
    file,
  ];
  return new Promise((done, failed) => {
    const run = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    let said = "";
    run.stderr.on("data", (d) => {
      said += d;
    });
    run.on("close", (code) => {
      if (code !== 0)
        return failed(new Stop(`ffmpeg could not encode the frames:\n${said}`));
      for (let i = f0 * sub; i < f1 * sub; i++)
        rmSync(join(work, `f${String(i).padStart(7, "0")}.${ext}`), {
          force: true,
        });
      done(file);
    });
  });
}

/** The pieces joined, with the sound: the voices where their scenes start, or the recording. */
function finish(ffmpeg, { info, pieces, spec, dir, work, out, fps, draft }) {
  const list = join(work, "pieces.txt");
  writeFileSync(
    list,
    pieces.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
  );
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  const video = spec.track?.kind === "video";
  const sounds = info.audio.filter((a) => !a.video);
  if (video) args.push("-i", join(dir, spec.track.file));
  args.push("-f", "concat", "-safe", "0", "-i", list);
  const first = video ? 2 : 1;
  for (const a of sounds) args.push("-i", join(dir, a.src));
  const filters = [];
  const map = video ? "[v]" : `${first - 1}:v`;
  if (video) {
    // Their picture under the scenes, at the frame's size
    const [w, h] = spec.size.split("x");
    filters.push(
      `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=${fps.text}[bg]`,
      `[bg][1:v]overlay=format=auto:shortest=1,format=yuv420p[v]`,
    );
  }
  let audio = [];
  if (video) audio = ["-map", "0:a?"];
  else if (sounds.length) {
    const lanes = sounds.map((a, i) => {
      const ms = Math.round(a.at * 1000);
      return `[${first + i}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${ms}|${ms}[a${i}]`;
    });
    filters.push(
      ...lanes,
      `${sounds.map((_, i) => `[a${i}]`).join("")}amix=inputs=${sounds.length}:normalize=0:duration=longest,apad,atrim=0:${info.duration.toFixed(3)}[a]`,
    );
    audio = ["-map", "[a]"];
  }
  if (filters.length) args.push("-filter_complex", filters.join(";"));
  args.push("-map", map);
  args.push(...audio);
  args.push(
    ...(video
      ? [
          "-c:v",
          "libx264",
          "-preset",
          draft ? "veryfast" : "medium",
          "-crf",
          draft ? "22" : "17",
        ]
      : ["-c:v", "copy"]),
    ...(audio.length ? ["-c:a", "aac", "-b:a", "192k"] : []),
    "-movflags",
    "+faststart",
    "-t",
    info.duration.toFixed(3),
    out,
  );
  const made = spawnSync(ffmpeg, args, { encoding: "utf8" });
  if (made.status !== 0)
    throw new Stop(`ffmpeg could not make the video:\n${made.stderr}`);
  // A render before this one left its pictures if it was stopped
  for (const f of readdirSync(dir))
    if (
      f.startsWith(`.${basename(out, ".mp4")}-frames-`) &&
      join(dir, f) !== work
    )
      rmSync(join(dir, f), { recursive: true, force: true });
}

const commands = { put, get, voices, track, shots, render };
const [command, ...rest] = process.argv.slice(2);
try {
  if (!commands[command])
    throw new Stop(
      "Usage: motion.mjs put <name|path> <video.json> | get <name|path> <file.json> | voices <name|path> <audio>... | track <name|path> <file> | shots <name|path> [--at 1.2,3] | render <name|path> [--draft]",
    );
  await commands[command](...rest);
} catch (error) {
  // A `Stop` is a line for the reader, not a stack
  if (!(error instanceof Stop)) throw error;
  console.error(error.message);
  process.exit(1);
}
