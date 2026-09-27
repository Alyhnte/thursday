// The video: its scenes laid on one timeline, one card that morphs from scene to scene and
// never cuts, the camera that fills the frame with it, the cursor, the captions, and
// `seek(t)`, which draws any moment. Opened in a browser it is a player; with `?render` it
// is the camera's subject, and `window.MOTION` says what the camera needs.
(() => {
  const $ = (id) => document.getElementById(id);
  const spec = JSON.parse($("motion-spec").textContent);
  const [W, H] = spec.size.split("x").map(Number);
  const portrait = H > W;
  const RENDER = new URLSearchParams(location.search).has("render");

  // Colours by role. `dark` is the one filled surface (a pill, a chapter), `term` a terminal
  const THEMES = {
    paper: {
      canvas: "#E9E7E2",
      card: "#FFFFFF",
      ink: "#0B0B0B",
      muted: "#7C7A75",
      line: "#E4E2DD",
      soft: "#F2F0EC",
      accent: "#FF5A1F",
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
      accent: "#FF6A33",
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
      accent: "#3F5BFF",
      onAccent: "#FFFFFF",
      dark: "#0F172A",
      onDark: "#FFFFFF",
      term: "#0B1020",
      termInk: "#E6EAF2",
    },
  };
  const c = {
    ...THEMES[spec.theme ?? "paper"],
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

  // --- The timeline ------------------------------------------------------------------------
  // Silence after a scene's voice before the next scene
  const PAUSE = 0.45;
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
      x.end = clock + (x.s.voice ? x.s.voice.length + PAUSE : x.s.dur);
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
    x.at = x.s.times ?? spread(n, x.s.voice ? x.s.voice.length : x.len);
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
    zoom: [],
    cx: [],
    cy: [],
    bg: [],
  };
  const push = (t, state, x, jump) => {
    const sp = jump ? M.INSTANT : undefined;
    for (const k of ["w", "h", "r", "shadow"]) keys[k].push([t, state[k], sp]);
    keys.bg.push([t, state.bg, jump ? M.INSTANT : undefined]);
    keys.zoom.push([t, x.zoom, jump ? M.INSTANT : M.CAM]);
    keys.cx.push([t, x.cx, jump ? M.INSTANT : M.CAM]);
    keys.cy.push([t, x.cy, jump ? M.INSTANT : M.CAM]);
  };
  for (const x of scenes) {
    const { built } = x;
    push(
      x.start,
      built.first ? { ...x.state, ...built.first } : x.state,
      x,
      x.first,
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

  // --- Drawing a moment ----------------------------------------------------------------------
  const world = $("world");
  const canvas = $("canvas");
  const sceneAt = (t) =>
    scenes.find((x) => t >= x.start && t < x.end) ??
    (t >= duration - 1e-6 && !overVideo ? scenes.at(-1) : null);

  function seek(t) {
    const before = M.writes();
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
      const scale = (0.55 + 0.45 * pop) * (1 - 0.035 * pressed(t));
      const w = cardW(t);
      const h = cardH(t);
      const r = Math.min(cardR(t), w / 2, h / 2);
      M.set(card, "left", M.px(-w / 2));
      M.set(card, "top", M.px(-h / 2));
      M.set(card, "width", M.px(w));
      M.set(card, "height", M.px(h));
      M.set(card, "borderRadius", M.px(r));
      M.set(card, "background", cardBg(t));
      M.set(card, "transform", `scale(${M.n(scale, 4)})`);
      M.set(card, "opacity", M.n(M.clamp((t - run.start - lift) / 0.12)));
      const sh = M.clamp(cardShadow(t));
      M.set(
        card,
        "boxShadow",
        sh > 0.01
          ? `0 ${M.n(24 * sh, 1)}px ${M.n(64 * sh, 1)}px rgba(0,0,0,${M.n(0.1 * sh)}), 0 ${M.n(2 * sh, 1)}px ${M.n(6 * sh, 1)}px rgba(0,0,0,${M.n(0.06 * sh)})`
          : "none",
      );
      const z = zoom(t);
      M.set(
        world,
        "transform",
        `translate(${M.px(camX(t))},${M.px(camY(t))}) scale(${M.n(z, 4)})`,
      );
      for (const x of scenes) {
        const v = M.vis(t, x.first ? null : x.start, x.last ? null : x.end);
        const on = t >= x.start - 0.001 && t < x.end + 0.2 && sceneOf(x, now);
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
    if (cap) {
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
    scenes: scenes.map((x) => ({
      kind: x.s.kind,
      start: x.start,
      end: x.end,
      beats: x.at.map((a) => x.start + a),
    })),
    /** Scenes whose content is wider or taller than it was given, by number from 1. */
    cut: () =>
      scenes
        .filter(
          (x) =>
            x.built.node.scrollWidth > x.w + 1 ||
            x.built.node.scrollHeight > x.h + 1,
        )
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
  const loop = () => {
    if (!running) return;
    t = master
      ? master.el.currentTime
      : from + (performance.now() - since) / 1000;
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
