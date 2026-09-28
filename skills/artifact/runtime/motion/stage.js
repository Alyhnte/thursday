// The video: its scenes laid on one timeline, one card that morphs from scene to scene and
// never cuts, the camera that fills the frame with it, the cursor, the captions, and
// `seek(t)`, which draws any moment. Opened in a browser it is a player; with `?render` it
// is the camera's subject, and `window.MOTION` says what the camera needs.
// Laid out once its fonts are in: a card is as big as its words, measured in their own font.
// `window.motionReady` settles when the page can be drawn.
window.motionReady = (async () => {
  const $ = (id) => document.getElementById(id);
  const spec = JSON.parse($("motion-spec").textContent);
  const [W, H] = spec.size.split("x").map(Number);
  const portrait = H > W;
  const RENDER = new URLSearchParams(location.search).has("render");

  // Colours by role. `dark` is the one filled surface (a pill, a chapter), `term` a terminal,
  // `ember` what waits or warns, `edge` the hairline a card keeps on a canvas its own colour.
  // `thursday` and `night` are the app's own: its greys, its blue and its ember (app/globals.css).
  const THEMES = {
    thursday: {
      canvas: "#FFFFFF",
      card: "#FFFFFF",
      ink: "#0D0D0D",
      muted: "#767676",
      line: "#EDEDED",
      soft: "#F3F3F3",
      edge: "rgba(13,13,13,0.08)",
      accent: "#0169CC",
      ember: "#C43D18",
      onAccent: "#FFFFFF",
      dark: "#0D0D0D",
      onDark: "#FFFFFF",
      term: "#101010",
      termInk: "#EDEDED",
    },
    night: {
      canvas: "#0D0D0D",
      card: "#181818",
      ink: "#FFFFFF",
      muted: "#9F9F9F",
      line: "#282828",
      soft: "#212121",
      edge: "rgba(255,255,255,0.08)",
      accent: "#0A84FF",
      ember: "#FF7A55",
      onAccent: "#FFFFFF",
      dark: "#FFFFFF",
      onDark: "#0D0D0D",
      term: "#080808",
      termInk: "#EDEDED",
    },
    paper: {
      canvas: "#E9E7E2",
      card: "#FFFFFF",
      ink: "#0B0B0B",
      muted: "#7C7A75",
      line: "#E4E2DD",
      soft: "#F2F0EC",
      edge: "rgba(11,11,11,0)",
      accent: "#FF5A1F",
      ember: "#C43D18",
      onAccent: "#FFFFFF",
      dark: "#0B0B0B",
      onDark: "#FFFFFF",
      term: "#111113",
      termInk: "#ECEAE6",
    },
    ink: {
      canvas: "#0D0D0E",
      card: "#1A1A1C",
      ink: "#F4F2EE",
      muted: "#8E8C88",
      line: "#2E2E31",
      soft: "#242427",
      edge: "rgba(255,255,255,0.06)",
      accent: "#FF6A33",
      ember: "#FF7A55",
      onAccent: "#FFFFFF",
      dark: "#F4F2EE",
      onDark: "#0B0B0B",
      term: "#060607",
      termInk: "#ECEAE6",
    },
    mist: {
      canvas: "#E4E8EE",
      card: "#FFFFFF",
      ink: "#0F172A",
      muted: "#667085",
      line: "#E2E6EC",
      soft: "#F1F4F8",
      edge: "rgba(15,23,42,0)",
      accent: "#3F5BFF",
      ember: "#C43D18",
      onAccent: "#FFFFFF",
      dark: "#0F172A",
      onDark: "#FFFFFF",
      term: "#0B1020",
      termInk: "#E6EAF2",
    },
  };
  const c = {
    ...THEMES[spec.theme ?? "thursday"],
    ...(spec.accent ? { accent: spec.accent } : {}),
    ...(spec.colors ?? {}),
  };
  const root = document.documentElement;
  for (const [k, v] of Object.entries(c)) root.style.setProperty(`--${k}`, v);
  if (spec.font) {
    // A font file beside the video, or a font the machine has, before the shipped ones
    const file = /\.(woff2?|ttf|otf)$/i.test(spec.font);
    if (file) {
      const face = document.createElement("style");
      face.textContent = `@font-face{font-family:"Brand";src:url("${encodeURI(spec.font)}")}`;
      document.head.append(face);
    }
    root.style.setProperty(
      "--brand",
      file ? '"Brand", ' : `"${spec.font.replace(/"/g, "")}", `,
    );
  }
  root.classList.toggle("mo-portrait", portrait);
  // The words' language: how a line breaks and which glyphs a font picks follow it
  if (spec.lang) root.lang = spec.lang;

  await Promise.all(
    [
      '500 40px "Geist"',
      '500 20px "Geist Mono"',
      ...(spec.font
        ? [
            `500 40px ${spec.font.match(/\.(woff2?|ttf|otf)$/i) ? '"Brand"' : `"${spec.font.replace(/"/g, "")}"`}`,
          ]
        : []),
    ].map((f) => document.fonts.load(f)),
  ).catch(() => {});

  // --- The timeline ------------------------------------------------------------------------
  // Silence after a scene's voice before the next scene
  const PAUSE = 0.45;
  // How long a scene holds when nothing else says: no voice, no recording, no `dur`
  const DUR = 3;
  // How long a scene that leaves by moving (push, zoom, rise) takes to go before the next comes
  const OUT = 0.24;
  const track = spec.track ?? null;
  const overVideo = track?.kind === "video";
  const scenes = spec.scenes.map((s, i) => ({ s, i }));
  let clock = 0;
  scenes.forEach((x, i) => {
    if (track) {
      const next = scenes[i + 1];
      x.start = x.s.at;
      x.end = x.s.until ?? next?.s.at ?? track.length;
    } else {
      x.start = clock;
      x.end = clock + (x.s.voice ? x.s.voice.length + PAUSE : (x.s.dur ?? DUR));
      clock = x.end;
    }
    x.len = x.end - x.start;
  });
  const duration = track ? track.length : clock;
  // A run is scenes back to back; between runs the card is gone (their video shows)
  scenes.forEach((x, i) => {
    const prev = scenes[i - 1];
    x.first = !prev || Math.abs(prev.end - x.start) > 1e-3;
    const next = scenes[i + 1];
    x.last = !next || Math.abs(next.start - x.end) > 1e-3;
    // How it comes in: the card morphs into it, or the last one leaves and this one arrives
    x.enter = x.first ? "morph" : (x.s.enter ?? spec.enter ?? "morph");
    x.swap = x.enter === "morph" || x.enter === "cut" ? x.start : x.start + OUT;
  });

  // --- Where the card goes ---------------------------------------------------------------
  const captionsOn = spec.captions !== false && scenes.some(({ s }) => s.say);
  // The part of the frame the card fills: clear of the captions, and on a phone of what
  // the player lays over the top and the bottom of the picture
  const area = portrait
    ? [0, H * 0.1, W, H * (captionsOn ? 0.56 : 0.66)]
    : [0, 0, W, captionsOn ? H * 0.8 : H];
  const stage = $("stage");
  stage.style.width = `${W}px`;
  stage.style.height = `${H}px`;
  // What the frame's own type is sized by: 1 at 1080 on the short side
  stage.style.setProperty("--u", String(Math.min(W, H) / 1080));
  const card = $("card");
  const ctx = { c, portrait, W, H };

  for (const x of scenes) {
    const layer = M.el("div", "mo-layer");
    card.append(layer);
    x.layer = layer;
    x.built = PARTS[x.s.kind].build(x.s, ctx);
    // A part with no width of its own is as wide as it draws (a pill)
    if (x.built.w) x.built.node.style.width = `${x.built.w}px`;
    layer.append(x.built.node);
  }
  // Laid out together, then measured: the card's size is what its content takes
  for (const x of scenes) {
    const { built } = x;
    const w = built.w ?? Math.ceil(built.node.offsetWidth);
    const h = built.h ?? Math.ceil(built.node.offsetHeight);
    built.node.style.width = `${w}px`;
    built.node.style.height = `${h}px`;
    x.layer.style.width = `${w}px`;
    x.layer.style.height = `${h}px`;
    x.w = w;
    x.h = h;
    const n = PARTS[x.s.kind].beats(x.s);
    const beatLen = x.s.voice ? x.s.voice.length : x.len;
    // A part may know better when its beats fall (a prompt is sent once it is typed)
    x.at = x.s.times ?? built.beatsAt?.(beatLen) ?? spread(n, beatLen);
    const box = x.s.area ?? area;
    const fill = x.s.area ? 0.92 : 0.84;
    x.zoom = M.clamp(
      Math.min((box[2] * fill) / x.w, (box[3] * (x.s.area ? 0.92 : 0.8)) / x.h),
      0.35,
      2.6,
    );
    x.cx = box[0] + box[2] / 2;
    x.cy = box[1] + box[3] / 2;
    x.state = {
      w: x.w,
      h: x.h,
      r: built.r ?? 40,
      bg: built.plain ? c.canvas : (built.bg ?? c.card),
      shadow: built.plain ? 0 : 1,
      // A part with no card lets the canvas's own dots or letters show through
      fill: built.plain ? 0 : 1,
    };
  }

  /** `n` beats across a scene of `len` seconds: the first once it is in, the last before it goes. */
  function spread(n, len) {
    if (!n) return [];
    const first = Math.min(0.45, len * 0.2);
    const last = Math.max(first, len - 0.9);
    if (n === 1) return [first];
    return Array.from(
      { length: n },
      (_, i) => first + ((last - first) * i) / (n - 1),
    );
  }

  // One key per scene, and one per shape a scene changes to inside itself. A run starts
  // where it starts: its card jumps there, never morphs from the run before.
  const keys = {
    w: [],
    h: [],
    r: [],
    shadow: [],
    fill: [],
    zoom: [],
    cx: [],
    cy: [],
    bg: [],
  };
  const push = (t, state, x, jump) => {
    const sp = jump ? M.INSTANT : undefined;
    for (const k of ["w", "h", "r", "shadow", "fill"])
      keys[k].push([t, state[k], sp]);
    keys.bg.push([t, state.bg, jump ? M.INSTANT : undefined]);
    keys.zoom.push([t, x.zoom, jump ? M.INSTANT : M.CAM]);
    keys.cx.push([t, x.cx, jump ? M.INSTANT : M.CAM]);
    keys.cy.push([t, x.cy, jump ? M.INSTANT : M.CAM]);
  };
  for (const x of scenes) {
    const { built } = x;
    // Off screen, or in one cut, the card is already the new shape when it is seen
    push(
      x.swap,
      built.first ? { ...x.state, ...built.first } : x.state,
      x,
      x.first || x.enter !== "morph",
    );
    for (const sh of built.shapes ?? [])
      push(x.start + x.at[sh.beat], { ...x.state, ...sh }, x, false);
  }
  const s0 = scenes[0];
  const first0 = s0.built.first ? { ...s0.state, ...s0.built.first } : s0.state;
  const tr = (k, v0, sp) => M.track(v0, keys[k], sp);
  const cardW = tr("w", first0.w);
  const cardH = tr("h", first0.h);
  const cardR = tr("r", first0.r);
  const cardShadow = tr("shadow", first0.shadow);
  const cardFill = tr("fill", first0.fill);
  const cardBg = M.ctrack(first0.bg, keys.bg);
  const zoom = tr("zoom", s0.zoom, M.CAM);
  const camX = tr("cx", s0.cx, M.CAM);
  const camY = tr("cy", s0.cy, M.CAM);

  // A press dips the card, on the beats of a part that is pressed whole (a pill)
  const pressed = M.presses(
    scenes.flatMap((x) => (x.built.press ? x.at.map((a) => x.start + a) : [])),
  );

  // --- The cursor ----------------------------------------------------------------------------
  const cursor = $("cursor");
  const cursorSize = (42 * Math.min(W, H)) / 1080;
  cursor.style.width = `${cursorSize}px`;
  const clicks = [];
  const holds = [];
  const pathKeys = [];
  const shownKeys = [];
  let at = null;
  for (const x of scenes) {
    const marks = x.built.targets ? x.built.targets(x.at) : [];
    if (!marks.length) {
      if (at) shownKeys.push([x.start, 0, [22, 1]]);
      at = null;
      continue;
    }
    for (const m of marks) {
      const hold = m.hold?.map((v) => x.start + v);
      const path = m.path?.map(([t, px, py]) => [x.start + t, px, py]) ?? [
        [x.start + x.at[m.beat], m.x, m.y],
      ];
      const t0 = path[0][0];
      if (!at) {
        // In from below and to the right of the first thing it presses
        const t = Math.max(x.start + 0.05, t0 - 0.8);
        pathKeys.push([t, path[0][1] + 170, path[0][2] + 130]);
        shownKeys.push([t, 1, [22, 1]]);
      } else
        pathKeys.push([Math.max(at, t0 - 0.62), ...pathKeys.at(-1).slice(1)]);
      pathKeys.push([t0 - 0.1, path[0][1], path[0][2]]);
      for (const k of path.slice(1)) pathKeys.push(k);
      at = path.at(-1)[0] + 0.1;
      pathKeys.push([at, path.at(-1)[1], path.at(-1)[2]]);
      if (hold) holds.push(hold);
      else clicks.push(t0);
    }
    if (x.last) {
      shownKeys.push([x.end - 0.02, 0, M.INSTANT]);
      at = null;
    }
  }
  pathKeys.sort((a, b) => a[0] - b[0]);
  const cursorAt = M.path(pathKeys);
  const cursorShown = M.track(0, shownKeys);
  const cursorPress = M.presses(clicks, holds);

  // --- Captions ----------------------------------------------------------------------------
  const captions = [];
  if (captionsOn)
    for (const x of scenes) {
      if (!x.s.say) continue;
      const pieces = chunks(x.s.say, portrait ? 30 : 46);
      const speak = x.s.voice ? x.s.voice.length : x.len - 0.25;
      const total = pieces.reduce((a, p) => a + p.length, 0);
      let t = x.start;
      for (const p of pieces) {
        const d = (speak * p.length) / total;
        captions.push({ text: p, from: t, to: t + d, x });
        t += d;
      }
    }
  const caption = $("caption");
  $("captions").hidden = !captionsOn;

  /** What is said, in pieces short enough for a line or two: at sentences, then at spaces. */
  function chunks(text, most) {
    const out = [];
    for (const sentence of text.match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [
      text,
    ]) {
      let line = "";
      for (const word of sentence.trim().split(/(?<=\s)/)) {
        if (line && (line + word).trim().length > most) {
          out.push(line.trim());
          line = "";
        }
        // A language written without spaces is cut where the length says
        let rest = word;
        while (rest.length > most) {
          out.push(rest.slice(0, most));
          rest = rest.slice(most);
        }
        line += rest;
      }
      if (line.trim()) out.push(line.trim());
    }
    return out;
  }

  // --- Scenes that leave and arrive --------------------------------------------------------
  /**
   * Where the card is thrown while one scene leaves and the next arrives: an offset in the
   * world's pixels, a scale and an opacity. The way out eases in, fast; the way in lands on a
   * spring, so the four subframes of each frame smear the throw the way a camera would.
   */
  function passage(t) {
    const out = { dx: 0, dy: 0, k: 1, o: 1 };
    for (const x of scenes) {
      if (x.enter === "morph" || x.enter === "cut") continue;
      const u = t - x.start;
      if (u < 0 || u > 2) continue;
      const prev = scenes[x.i - 1];
      const far = (portrait ? H : W) * 1.1;
      if (u < OUT) {
        const e = (u / OUT) ** 2;
        const d = far / prev.zoom;
        if (x.enter === "push") out.dx = -e * d;
        if (x.enter === "rise") out.dy = -e * d * 0.45;
        if (x.enter === "zoom") out.k = 1 + 0.4 * e;
        if (x.enter !== "push") out.o = 1 - e;
      } else {
        const a = M.S(u - OUT, ...M.MORPH);
        const d = far / x.zoom;
        const shown = M.clamp((u - OUT) / 0.16);
        if (x.enter === "push") out.dx = (1 - a) * d;
        if (x.enter === "rise") out.dy = (1 - a) * d * 0.6;
        if (x.enter === "zoom") out.k = 0.78 + 0.22 * a;
        if (x.enter !== "push") out.o = shown;
      }
    }
    return out;
  }

  // --- What the canvas wears -----------------------------------------------------------------
  const world = $("world");
  const canvas = $("canvas");
  const backdrop = spec.backdrop ?? "plain";
  if (backdrop === "dots" || backdrop === "grid")
    canvas.classList.add(`mo-${backdrop}`);
  const field = backdrop === "glyphs" ? glyphField() : null;

  /**
   * The app's letter field behind everything: faint glyphs on a grid, a few taking another
   * glyph at each tick — nothing fades, a cell moves by changing its letter. Brightest in a
   * slow drift of soft patches, never over the middle of the frame, where the card is.
   */
  function glyphField() {
    const RAMP = [
      " ",
      "·",
      ".",
      ":",
      "-",
      "=",
      "+",
      "*",
      "~",
      "○",
      "◦",
      "c",
      "v",
      "o",
      "x",
    ];
    const TICK = 0.62;
    const el = document.createElement("canvas");
    el.className = "mo-glyphs";
    el.width = W;
    el.height = H;
    canvas.append(el);
    const g = el.getContext("2d");
    const pitch = Math.round(24 * (Math.min(W, H) / 1080));
    let drawn = -1;
    return (t) => {
      const tick = Math.floor(t / TICK);
      if (tick === drawn) return;
      drawn = tick;
      M.touch();
      g.clearRect(0, 0, W, H);
      g.fillStyle = c.ink;
      g.font = `${Math.round(pitch * 0.62)}px "Geist Mono", monospace`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const cols = Math.ceil(W / pitch);
      const rows = Math.ceil(H / pitch);
      for (let r = 0; r < rows; r++)
        for (let q = 0; q < cols; q++) {
          const x = (q + 0.5) * pitch;
          const y = (r + 0.5) * pitch;
          const dx = (x - W / 2) / (W / 2);
          const dy = (y - H / 2) / (H / 2);
          const edge = M.clamp(Math.hypot(dx * 0.9, dy) - 0.35);
          const drift =
            0.5 +
            0.5 *
              Math.sin(x * 0.006 + tick * 0.21) *
              Math.cos(y * 0.007 - tick * 0.17);
          const level = edge * drift;
          if (level < 0.08) continue;
          const seed = r * 977 + q;
          // A cell keeps its glyph for a few ticks, and takes another on a tick of its own
          const turn = Math.floor((tick + M.hash(seed, 3) * 5) / 5);
          const i =
            1 + Math.floor(M.hash(seed, turn) * (RAMP.length - 1) * level);
          g.globalAlpha = 0.1 + 0.34 * level;
          g.fillText(RAMP[Math.min(RAMP.length - 1, i)], x, y);
        }
      g.globalAlpha = 1;
    };
  }

  // Captions in the app's own way on its own themes: the words alone, each letter arriving
  // out of a blur. Over their video, or on another theme, a card holds them.
  const letters =
    !overVideo && ["thursday", "night"].includes(spec.theme ?? "thursday");
  $("captions").classList.toggle("mo-letters", letters);

  // --- Drawing a moment ----------------------------------------------------------------------
  const sceneAt = (t) =>
    scenes.find((x) => t >= x.start && t < x.end) ??
    (t >= duration - 1e-6 && !overVideo ? scenes.at(-1) : null);

  function seek(t) {
    const before = M.writes();
    if (field) field(t);
    const now = sceneAt(t);
    const shown = Boolean(now);
    M.set(card, "display", shown ? "" : "none");
    M.set(
      canvas,
      "visibility",
      !overVideo || (now && !now.s.area) ? "visible" : "hidden",
    );
    if (shown) {
      // A run opens with the card popping in
      const run = scenes.findLast((x) => x.first && x.start <= t);
      const lift = run.i === 0 && !track ? 0.08 : 0.02;
      const pop = M.S(t - run.start - lift, 13, 0.78);
      const move = passage(t);
      const scale = (0.55 + 0.45 * pop) * (1 - 0.035 * pressed(t)) * move.k;
      const w = cardW(t);
      const h = cardH(t);
      const r = Math.min(cardR(t), w / 2, h / 2);
      M.set(card, "left", M.px(-w / 2));
      M.set(card, "top", M.px(-h / 2));
      M.set(card, "width", M.px(w));
      M.set(card, "height", M.px(h));
      M.set(card, "borderRadius", M.px(r));
      M.set(
        card,
        "background",
        cardBg(t)
          .replace("rgb(", "rgba(")
          .replace(")", `,${M.n(M.clamp(cardFill(t)), 2)})`),
      );
      M.set(
        card,
        "transform",
        `translate(${M.px(move.dx)},${M.px(move.dy)}) scale(${M.n(scale, 4)})`,
      );
      M.set(
        card,
        "opacity",
        M.n(M.clamp((t - run.start - lift) / 0.12) * move.o),
      );
      const sh = M.clamp(cardShadow(t));
      M.set(
        card,
        "boxShadow",
        sh > 0.01
          ? `0 ${M.n(24 * sh, 1)}px ${M.n(64 * sh, 1)}px rgba(0,0,0,${M.n(0.1 * sh)}), 0 ${M.n(2 * sh, 1)}px ${M.n(6 * sh, 1)}px rgba(0,0,0,${M.n(0.06 * sh)}), 0 0 0 1px ${c.edge}`
          : "none",
      );
      const z = zoom(t);
      M.set(
        world,
        "transform",
        `translate(${M.px(camX(t))},${M.px(camY(t))}) scale(${M.n(z, 4)})`,
      );
      for (const x of scenes) {
        // A scene that arrives by moving is on the card from the moment it arrives, and one
        // that leaves by moving goes with the card, whole, until the next is swapped in
        const next = x.last ? null : scenes[x.i + 1];
        const v = M.vis(t, x.first ? null : x.swap, next ? next.swap : null, {
          din: x.enter === "morph" ? 0.08 : 0,
          lin: x.enter === "morph" ? 0.28 : x.enter === "cut" ? 0.001 : 0.12,
          lout: !next || next.enter === "morph" ? 0.13 : 0.001,
        });
        const on =
          t >= x.start - 0.001 &&
          t < (next ? next.swap : x.end) + 0.2 &&
          sceneOf(x, now);
        if (!on || !M.show(x.layer, v)) {
          M.set(x.layer, "display", "none");
          continue;
        }
        M.set(x.layer, "left", M.px((w - x.w) / 2));
        M.set(x.layer, "top", M.px((h - x.h) / 2));
        x.built.draw(t - x.start, x.at);
      }
      const c0 = cursorShown(t);
      M.set(cursor, "visibility", c0 > 0.02 ? "visible" : "hidden");
      if (c0 > 0.02) {
        const p = cursorAt(t);
        const sx = camX(t) + z * p.x;
        const sy = camY(t) + z * p.y;
        M.set(cursor, "opacity", M.n(M.clamp(c0)));
        M.set(
          cursor,
          "transform",
          `translate(${M.px(sx - cursorSize * 0.08)},${M.px(sy - cursorSize * 0.05)}) scale(${M.n(1 - 0.13 * cursorPress(t), 4)})`,
        );
      }
    } else M.set(cursor, "visibility", "hidden");

    const cap = shown ? captions.find((k) => t >= k.from && t < k.to) : null;
    M.set(caption, "visibility", cap ? "visible" : "hidden");
    if (cap && letters) {
      if (caption._said !== cap) {
        caption._said = cap;
        caption.textContent = "";
        for (const ch of cap.text) caption.append(M.el("span", "", ch));
        M.touch();
      }
      [...caption.children].forEach((el, i) => {
        const a = M.eo((t - cap.from - i * 0.012) / 0.32);
        M.set(el, "opacity", M.n(a));
        M.set(
          el,
          "filter",
          a < 0.99 ? `blur(${M.n((1 - a) * 6, 1)}px)` : "none",
        );
      });
    } else if (cap) {
      M.text(caption, cap.text);
      const v = M.vis(t, cap.from, cap.to, {
        din: 0,
        lin: 0.14,
        lout: 0.08,
        blur: 6,
      });
      M.set(caption, "opacity", M.n(Math.max(v.a, 0)));
      M.set(
        caption,
        "filter",
        v.a < 0.99 ? `blur(${M.n((1 - v.a) * 6, 1)}px)` : "none",
      );
    }
    return M.writes() - before;
  }

  /** A scene's layer is drawn while it or the scene after it is on: its way out overlaps. */
  function sceneOf(x, now) {
    return x === now || scenes[x.i + 1] === now;
  }

  // The small sounds of what happens on screen: a tick for each press, a rush of air for
  // a scene thrown out. Never over their own recording, which has its own sound.
  const cues = [];
  if (!track && spec.sfx !== false) {
    for (const at of clicks) cues.push({ sound: "click", at });
    for (const [at] of holds) cues.push({ sound: "click", at });
    for (const x of scenes)
      if (["push", "zoom", "rise"].includes(x.enter))
        cues.push({ sound: "whoosh", at: x.start - 0.06 });
    cues.sort((a, b) => a.at - b.at);
  }

  // What the camera and the script read. `audio` is what plays and from when.
  const audio = [];
  if (track) audio.push({ src: track.file, at: 0, video: overVideo });
  for (const x of scenes)
    if (x.s.voice) audio.push({ src: x.s.voice.file, at: x.start });
  window.seek = seek;
  window.MOTION = {
    w: W,
    h: H,
    fps: spec.fps ?? 30,
    duration,
    alpha: overVideo,
    audio,
    cues,
    scenes: scenes.map((x) => ({
      kind: x.s.kind,
      start: x.start,
      end: x.end,
      beats: x.at.map((a) => x.start + a),
    })),
    /**
     * Scenes whose content is wider or taller than it was given, by number from 1: each
     * measured once it has settled, since what is still moving in hangs outside on purpose.
     */
    cut: () =>
      scenes
        .filter((x) => {
          seek(Math.max(x.start, x.end - 0.05));
          const n = x.built.node;
          return n.scrollWidth > x.w + 1 || n.scrollHeight > x.h + 1;
        })
        .map((x) => x.i + 1),
  };

  // --- The player ----------------------------------------------------------------------------
  document.body.classList.add(RENDER ? "render" : "play");
  if (RENDER) {
    if (overVideo) root.classList.add("alpha");
    seek(0);
    return;
  }
  const frame = $("frame");
  const fit = () => {
    const room = $("player").getBoundingClientRect();
    const k = Math.min(room.width / W, (room.height - 64) / H);
    frame.style.width = `${W * k}px`;
    frame.style.height = `${H * k}px`;
    stage.style.transform = `scale(${k})`;
  };
  addEventListener("resize", fit);
  fit();

  const media = audio.map((a) => {
    const el = document.createElement(a.video ? "video" : "audio");
    el.src = a.src;
    el.preload = "auto";
    if (a.video) {
      el.playsInline = true;
      stage.prepend(el);
      el.className = "mo-source";
    }
    return { ...a, el };
  });
  // Their recording keeps the time when there is one; otherwise the clock does
  const master = media.find((m) => m.at === 0 && track);
  const bar = $("scrub");
  const fill = $("scrub-fill");
  const time = $("time");
  const play = $("play");
  for (const x of scenes) {
    const tick = M.el("i");
    tick.style.left = `${(x.start / duration) * 100}%`;
    bar.append(tick);
  }
  let t = Math.min(duration, scenes[0].start + 1.2);
  let running = false;
  let from = 0;
  let since = 0;
  const mmss = (v) =>
    `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, "0")}`;
  const show = () => {
    seek(t);
    fill.style.width = `${(t / duration) * 100}%`;
    time.textContent = `${mmss(t)} / ${mmss(duration)}`;
  };
  const syncMedia = () => {
    for (const m of media) {
      if (m === master) continue;
      const local = t - m.at;
      const inside = local >= 0 && local < (m.el.duration || 0);
      if (running && inside) {
        if (m.el.paused || Math.abs(m.el.currentTime - local) > 0.25) {
          m.el.currentTime = local;
          m.el.play().catch(() => {});
        }
      } else if (!m.el.paused) m.el.pause();
    }
  };
  // The cues played as the time passes them, drawn by the browser from nothing
  let sounds = null;
  const sound = (kind) => {
    sounds ??= new AudioContext();
    const a = sounds;
    const out = a.createGain();
    out.connect(a.destination);
    const now = a.currentTime;
    if (kind === "click") {
      const o = a.createOscillator();
      o.frequency.value = 1800;
      out.gain.setValueAtTime(0.25, now);
      out.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      o.connect(out);
      o.start(now);
      o.stop(now + 0.06);
      return;
    }
    const n = a.createBuffer(1, a.sampleRate * 0.4, a.sampleRate);
    const data = n.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = n;
    const band = a.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.8;
    band.frequency.setValueAtTime(500, now);
    band.frequency.exponentialRampToValueAtTime(2600, now + 0.3);
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(0.18, now + 0.2);
    out.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    src.connect(band).connect(out);
    src.start(now);
  };
  let heard = 0;
  const loop = () => {
    if (!running) return;
    heard = t;
    t = master
      ? master.el.currentTime
      : from + (performance.now() - since) / 1000;
    for (const c of cues) if (c.at > heard && c.at <= t) sound(c.sound);
    if (t >= duration) {
      t = duration;
      stop();
    }
    syncMedia();
    show();
    requestAnimationFrame(loop);
  };
  const start = () => {
    if (t >= duration - 0.05) t = 0;
    running = true;
    from = t;
    since = performance.now();
    if (master) {
      master.el.currentTime = t;
      master.el.play().catch(() => {});
    }
    play.classList.add("on");
    requestAnimationFrame(loop);
  };
  const stop = () => {
    running = false;
    for (const m of media) m.el.pause();
    play.classList.remove("on");
  };
  const jump = (v) => {
    t = M.clamp(v, 0, duration);
    from = t;
    since = performance.now();
    if (master) master.el.currentTime = t;
    syncMedia();
    show();
  };
  play.onclick = () => (running ? stop() : start());
  const scrubTo = (e) => {
    const r = bar.getBoundingClientRect();
    jump(((e.clientX - r.left) / r.width) * duration);
  };
  bar.onpointerdown = (e) => {
    bar.setPointerCapture(e.pointerId);
    scrubTo(e);
    bar.onpointermove = scrubTo;
  };
  bar.onpointerup = () => {
    bar.onpointermove = null;
  };
  addEventListener("keydown", (e) => {
    if (e.key === " ") {
      e.preventDefault();
      running ? stop() : start();
    }
    if (e.key === "ArrowRight") jump(t + 1);
    if (e.key === "ArrowLeft") jump(t - 1);
  });
  show();
})();
