// What a motion video's JSON may hold, checked before anything is written: every mistake is
// named with the scene it is in, so the bot fixes the file rather than guessing. The page
// (stage.js, parts.js) trusts what passes here.

export const THEMES = ["paper", "ink", "mist"];
export const COLOURS = [
  "canvas",
  "card",
  "ink",
  "muted",
  "line",
  "soft",
  "accent",
  "onAccent",
  "dark",
  "onDark",
  "term",
  "termInk",
];
const HEX = /^#[0-9a-fA-F]{6}$/;

// A field is [type, required, most]: "text" up to `most` characters, "texts" a list of up to
// `most` of them, "items" a list of text or { text, icon }, "number", "bool", "icon", "any".
// `beats` is how many changes a part makes inside its scene (parts.js draws them): a scene's
// `times` gives exactly that many.
export const KINDS = {
  title: {
    fields: {
      title: ["text", true, 80],
      kicker: ["text", false, 40],
      sub: ["text", false, 140],
    },
    beats: () => 0,
  },
  end: {
    fields: {
      title: ["text", true, 60],
      sub: ["text", false, 80],
      icon: ["icon", false],
    },
    beats: () => 0,
  },
  chapter: {
    fields: { title: ["text", true, 60], number: ["text", false, 8] },
    beats: () => 0,
  },
  pill: {
    fields: {
      label: ["text", true, 32],
      icon: ["icon", false],
      badge: ["text", false, 12],
    },
    beats: () => 1,
  },
  options: {
    fields: {
      options: ["labels", true, 5],
      pick: ["picks", true, 6],
      start: ["number", false],
      label: ["text", false, 60],
    },
    beats: (s) => s.pick.length,
  },
  list: {
    fields: {
      items: ["items", true, 7],
      title: ["text", false, 60],
      check: ["bool", false],
    },
    beats: (s) => s.items.length,
  },
  bars: {
    fields: {
      bars: ["bars", true, 6],
      title: ["text", false, 60],
      unit: ["text", false, 8],
      prefix: ["text", false, 4],
      highlight: ["number", false],
    },
    beats: (s) => s.bars.length,
  },
  number: {
    fields: {
      value: ["number", true],
      from: ["number", false],
      prefix: ["text", false, 4],
      suffix: ["text", false, 8],
      label: ["text", false, 80],
      decimals: ["number", false],
      locale: ["text", false, 16],
    },
    beats: () => 1,
  },
  terminal: {
    fields: { lines: ["texts", true, 10], title: ["text", false, 40] },
    beats: (s) => s.lines.filter((l) => l.startsWith("$")).length,
  },
  chat: {
    fields: { messages: ["messages", true, 6] },
    beats: (s) => s.messages.length,
  },
  search: {
    fields: {
      query: ["text", true, 32],
      items: ["items", true, 6],
      placeholder: ["text", false, 40],
    },
    beats: () => 1,
  },
  toggles: {
    fields: {
      items: ["switches", true, 5],
      flip: ["picks", true, 6],
      title: ["text", false, 60],
    },
    beats: (s) => s.flip.length,
  },
  progress: {
    fields: { items: ["items", true, 5], title: ["text", false, 60] },
    beats: (s) => s.items.length,
  },
  compare: {
    fields: {
      left: ["side", true],
      right: ["side", true],
      pick: ["side-pick", false],
      vs: ["text", false, 4],
    },
    beats: (s) => (s.pick ? 3 : 2),
  },
  steps: {
    fields: { items: ["texts", true, 6] },
    beats: (s) => s.items.length,
  },
  quote: {
    fields: { text: ["text", true, 220], by: ["text", false, 60] },
    beats: () => 0,
  },
  image: {
    fields: {
      src: ["file", true],
      caption: ["text", false, 100],
      fit: ["fit", false],
      ratio: ["ratio", false],
    },
    beats: () => 0,
  },
  code: {
    fields: {
      code: ["code", true],
      title: ["text", false, 40],
      highlight: ["lines", false, 6],
    },
    beats: (s) => (s.highlight ?? []).length,
  },
  toast: {
    fields: {
      title: ["text", true, 48],
      text: ["text", false, 80],
      icon: ["icon", false],
    },
    beats: () => 1,
  },
  slider: {
    fields: {
      from: ["number", true],
      to: ["number", true],
      min: ["number", false],
      max: ["number", false],
      unit: ["text", false, 6],
      label: ["text", false, 40],
      minLabel: ["text", false, 16],
      maxLabel: ["text", false, 16],
    },
    beats: () => 1,
  },
};

// What every scene may carry beside its part's own fields
const COMMON = ["kind", "say", "dur", "at", "until", "times", "area", "voice"];

const isText = (v) => typeof v === "string" && v.trim().length > 0;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * The video's JSON checked, with `exists(relativePath)` telling whether a file beside the
 * video is there. Returns the problems, each a line naming where it is; none means it passes.
 */
export function check(spec, { exists = () => true } = {}) {
  const errors = [];
  const say = (where, what) => errors.push(`${where}: ${what}`);
  if (!spec || typeof spec !== "object" || Array.isArray(spec))
    return ["The file is not a JSON object with a `scenes` list."];

  const size = spec.size ?? "1920x1080";
  const [w, h] = String(size).split("x").map(Number);
  if (
    !/^\d+x\d+$/.test(String(size)) ||
    w < 320 ||
    h < 320 ||
    w > 3840 ||
    h > 3840 ||
    w % 2 ||
    h % 2
  )
    say(
      "size",
      `"${size}" is not a frame size: width x height, even, 320 to 3840, like 1920x1080 or 1080x1920.`,
    );
  if (
    spec.fps !== undefined &&
    !(isNum(spec.fps)
      ? spec.fps >= 12 && spec.fps <= 60
      : /^\d+\/\d+$/.test(String(spec.fps)))
  )
    say(
      "fps",
      "frames a second: a number from 12 to 60, or a rate like 30000/1001.",
    );
  if (spec.theme !== undefined && !THEMES.includes(spec.theme))
    say("theme", `one of ${THEMES.join(", ")}.`);
  if (spec.accent !== undefined && !HEX.test(spec.accent))
    say("accent", 'a colour as "#rrggbb".');
  for (const [k, v] of Object.entries(spec.colors ?? {}))
    if (!COLOURS.includes(k) || !HEX.test(v))
      say(`colors.${k}`, `colours are ${COLOURS.join(", ")}, each "#rrggbb".`);
  if (spec.font !== undefined) {
    if (!isText(spec.font))
      say("font", "a font's name, or a font file beside the video.");
    else if (/\.(woff2?|ttf|otf)$/i.test(spec.font) && !exists(spec.font))
      say(
        "font",
        `no file ${spec.font} beside the video: put it in the video's folder.`,
      );
  }
  if (
    spec.lang !== undefined &&
    !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(String(spec.lang))
  )
    say(
      "lang",
      'the language the words are in, as a tag like "en", "ko" or "pt-BR".',
    );
  if (spec.captions !== undefined && typeof spec.captions !== "boolean")
    say("captions", "true or false.");

  const scenes = spec.scenes;
  if (!Array.isArray(scenes) || !scenes.length || scenes.length > 60) {
    say("scenes", "a list of 1 to 60 scenes.");
    return errors;
  }
  const track = spec.track;
  // Written by `motion.mjs track`, never by hand: what it names must still be there
  if (
    track !== undefined &&
    !(
      track &&
      isText(track.file) &&
      exists(track.file) &&
      ["video", "audio"].includes(track.kind) &&
      isNum(track.length) &&
      track.length > 0
    )
  ) {
    say(
      "track",
      "is attached by motion.mjs track <name> <recording>; leave it as that wrote it.",
    );
    return errors;
  }
  const overVideo = track?.kind === "video";
  scenes.forEach((s, i) => {
    const where = `scene ${i + 1}${s?.kind ? ` (${s.kind})` : ""}`;
    if (!s || typeof s !== "object")
      return say(`scene ${i + 1}`, "not an object.");
    const kind = KINDS[s.kind];
    if (!kind)
      return say(
        where,
        `no such kind "${s.kind}". Kinds: ${Object.keys(KINDS).join(", ")}.`,
      );
    for (const key of Object.keys(s))
      if (!COMMON.includes(key) && !(key in kind.fields))
        say(
          where,
          `"${key}" is not a field of ${s.kind}. Its fields: ${Object.keys(kind.fields).join(", ")}.`,
        );
    for (const [key, [type, required, most]] of Object.entries(kind.fields)) {
      if (s[key] === undefined) {
        if (required) say(where, `needs "${key}".`);
        continue;
      }
      const why = field(type, s[key], most, s, exists, h > w);
      if (why) say(where, `"${key}" ${why}`);
    }
    if (s.say !== undefined && !(isText(s.say) && s.say.length <= 400))
      say(
        where,
        '"say" is the words said or shown over it: text, up to 400 characters.',
      );
    if (
      s.voice !== undefined &&
      !(
        s.voice &&
        isText(s.voice.file) &&
        exists(s.voice.file) &&
        isNum(s.voice.length) &&
        s.voice.length > 0
      )
    )
      say(
        where,
        '"voice" is attached by motion.mjs voices; leave it as that wrote it.',
      );

    // How long it runs: a track's times, a voice's length, or its own `dur`
    if (track) {
      if (!isNum(s.at) || s.at < 0 || s.at >= track.length)
        say(
          where,
          `needs "at": the second on the recording it comes in, from 0 to ${track.length.toFixed(2)}.`,
        );
      const next = scenes[i + 1];
      if (isNum(s.at) && isNum(next?.at) && next.at <= s.at)
        say(
          where,
          `scene ${i + 2} comes in at ${next.at}, not after this one's ${s.at}: scenes go in the order they play.`,
        );
      if (s.until !== undefined) {
        if (!overVideo)
          say(
            where,
            '"until" leaves a gap, which only a video recording fills.',
          );
        else if (
          !isNum(s.until) ||
          s.until <= s.at ||
          (isNum(next?.at) && s.until > next.at) ||
          s.until > track.length
        )
          say(
            where,
            '"until" is when it leaves, after its "at" and no later than the next scene\'s.',
          );
      }
    } else {
      if (s.at !== undefined || s.until !== undefined)
        say(
          where,
          '"at" and "until" are times on a recording, and this video has none (motion.mjs track).',
        );
      if (!s.voice && !(isNum(s.dur) && s.dur >= 0.5 && s.dur <= 60))
        say(
          where,
          'needs "dur": how many seconds it holds, 0.5 to 60 (a voice\'s own length replaces it).',
        );
    }
    if (s.area !== undefined) {
      const [x, y, aw, ah] = Array.isArray(s.area) ? s.area : [];
      const frame = [w, h];
      if (!overVideo)
        say(
          where,
          '"area" places it over a video recording, and this video has none.',
        );
      else if (
        ![x, y, aw, ah].every(isNum) ||
        x < 0 ||
        y < 0 ||
        aw < 120 ||
        ah < 120 ||
        x + aw > frame[0] ||
        y + ah > frame[1]
      )
        say(
          where,
          `"area" is [x, y, width, height] in the frame's pixels, inside ${w}x${h}.`,
        );
    }
    if (s.times !== undefined) {
      const n = beatsOf(s);
      const len = track ? null : (s.voice?.length ?? s.dur);
      const ok =
        Array.isArray(s.times) &&
        s.times.length === n &&
        s.times.every(
          (t, k) =>
            isNum(t) &&
            t >= 0 &&
            (k === 0 || t > s.times[k - 1]) &&
            (len == null || t < len),
        );
      if (!ok)
        say(
          where,
          `"times" is ${n} second(s) from the scene's start, rising${len ? `, each under its ${len}s` : ""}: one for each change it makes.`,
        );
    }
  });
  return errors;
}

/** How many changes a scene's part makes: the length its `times` must have. */
export function beatsOf(scene) {
  const kind = KINDS[scene.kind];
  try {
    return kind ? kind.beats(scene) : 0;
  } catch {
    return 0;
  }
}

function field(type, v, most, s, exists, tall) {
  const list = (ok, what) =>
    Array.isArray(v) && v.length > 0 && v.length <= most && v.every(ok)
      ? null
      : `is a list of 1 to ${most} ${what}.`;
  const text = (x, n = 80) => isText(x) && x.length <= n;
  switch (type) {
    case "text":
      return isText(v) && v.length <= most
        ? null
        : `is text, up to ${most} characters.`;
    case "texts":
      return list(
        (x) => text(x, 90),
        "pieces of text, each up to 90 characters",
      );
    case "labels":
      return list((x) => text(x, 18), "labels, each up to 18 characters");
    case "items":
      return list(
        (x) =>
          text(x) ||
          (x && text(x.text) && (x.icon === undefined || text(x.icon, 24))),
        'items, each text or { "text", "icon" }, text up to 80 characters',
      );
    case "number":
      return isNum(v) ? null : "is a number.";
    case "bool":
      return typeof v === "boolean" ? null : "is true or false.";
    case "icon":
      return text(v, 24) ? null : "is an icon's name, or one emoji.";
    case "picks": {
      const n = (s.options ?? s.items ?? []).length;
      return list(
        (x) => Number.isInteger(x) && x >= 0 && x < n,
        `indexes into its ${s.options ? "options" : "items"}, from 0`,
      );
    }
    case "bars":
      return list(
        (x) =>
          x &&
          text(x.label, 24) &&
          isNum(x.value) &&
          x.value >= 0 &&
          (x.text === undefined || text(x.text, 12)),
        'bars, each { "label", "value" } with a value of 0 or more and, if it is shown otherwise, "text"',
      );
    case "messages":
      return list(
        (x) =>
          x &&
          text(x.text, 160) &&
          (x.from === undefined || ["me", "them"].includes(x.from)),
        'messages, each { "from": "me" or "them", "text" }',
      );
    case "switches":
      return list(
        (x) =>
          x &&
          text(x.label, 60) &&
          (x.on === undefined || typeof x.on === "boolean"),
        'switches, each { "label", "on" }',
      );
    case "side":
      return v &&
        text(v.title, 40) &&
        (v.points === undefined ||
          (Array.isArray(v.points) &&
            v.points.length <= 5 &&
            v.points.every((p) => text(p, 80))))
        ? null
        : 'is { "title", "points": [up to 5 lines] }.';
    case "side-pick":
      return ["left", "right"].includes(v) ? null : 'is "left" or "right".';
    case "file":
      if (
        !isText(v) ||
        /^([a-z]+:|\/)/i.test(v) ||
        v.split(/[\\/]/).includes("..")
      )
        return "is a picture's path inside the video's folder, like pictures/shot.png.";
      return exists(v)
        ? null
        : `names ${v}, which is not in the video's folder: put the picture there.`;
    case "fit":
      return ["cover", "contain"].includes(v)
        ? null
        : 'is "cover" or "contain".';
    case "ratio":
      return /^\d{1,2}:\d{1,2}$/.test(v)
        ? null
        : 'is a shape like "16:9", "4:5" or "1:1".';
    case "code": {
      // A line of code is never wrapped: a tall frame fits fewer characters across
      const wide = tall ? 40 : 64;
      return typeof v === "string" &&
        v.length &&
        v.split("\n").length <= 14 &&
        v.split("\n").every((l) => l.length <= wide)
        ? null
        : `is up to 14 lines of up to ${wide} characters${tall ? " in a tall frame" : ""}.`;
    }
    case "lines": {
      const n = typeof s.code === "string" ? s.code.split("\n").length : 0;
      return list(
        (x) => Number.isInteger(x) && x >= 1 && x <= n,
        `line numbers in its code, from 1 to ${n}`,
      );
    }
    default:
      return null;
  }
}
