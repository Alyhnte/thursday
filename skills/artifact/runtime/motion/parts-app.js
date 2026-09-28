// What this app looks like, as scenes: her letter orb and a call's two sides, the bots' faces,
// a bot's card when its work is back, a job in progress, and a prompt that makes something.
// Drawn after the app's own screens (features/thursday, features/bot), not taken from them:
// the page carries no app code.

// Her letters by brightness, as the orb draws them (features/thursday/ascii.const.ts RAMP)
const ORB_RAMP = [
  [" "],
  [".", "`", "·"],
  [",", "·", "'", ":"],
  [";", "-", "^", ":"],
  ["=", "+", "~", '"'],
  ["*", "?", "◦", "j"],
  ["c", "v", "○", "7"],
  ["o", "x", "◇", "s"],
  ["s", "y", "t", "e"],
  ["e", "a", "u", "k"],
  ["k", "w", "z", "q"],
  ["q", "h", "n", "m"],
];
// How often a cell of hers takes another glyph, in seconds (the app's FLIP_MS)
const ORB_FLIP = 0.62;

/**
 * Her orb on a canvas `size` px wide: glyphs on a grid inside a crumbly circle, brighter
 * toward the middle, each taking another glyph now and then. `talk(t)` is how much she is
 * speaking, 0 to 1: the middle brightens and the rim breathes with it.
 */
function orb(size, ctx, talk = () => 0) {
  const el = document.createElement("canvas");
  el.className = "mo-orb";
  const scale = 2;
  el.width = size * scale;
  el.height = size * scale;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  const g = el.getContext("2d");
  const pitch = 15;
  const side = Math.floor(size / pitch);
  const cells = [];
  for (let r = 0; r < side; r++)
    for (let q = 0; q < side; q++) {
      const x = (q + 0.5) * pitch;
      const y = (r + 0.5) * pitch;
      const d = Math.hypot(x - size / 2, y - size / 2) / (size / 2);
      const seed = r * 977 + q;
      const crumble = (M.hash(seed, 1) - 0.5) * 0.24;
      if (d + crumble > 0.98) continue;
      if (M.hash(seed, 2) < 0.02 + 0.24 * d ** 3) continue;
      cells.push({ x, y, d, seed });
    }
  let drawn = "";
  return {
    el,
    draw(t) {
      const flip = Math.floor(t / (ORB_FLIP / 4));
      const k = talk(t);
      const key = `${flip}:${Math.round(k * 20)}`;
      if (key === drawn) return;
      drawn = key;
      M.touch();
      g.setTransform(scale, 0, 0, scale, 0, 0);
      g.clearRect(0, 0, size, size);
      g.fillStyle = ctx.c.ink;
      g.font = `${pitch * 0.95}px "Geist Mono", monospace`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      for (const c of cells) {
        // A cell keeps its glyph for a few flips, each cell on a phase of its own
        const turn = Math.floor((flip + M.hash(c.seed, 3) * 4) / 4);
        const wave = 0.5 + 0.5 * Math.sin(c.x * 0.05 + c.y * 0.04 + turn * 0.8);
        const lift = k * (1 - c.d) * 0.55;
        const level = M.clamp(
          (1 - c.d ** 1.6) * (0.45 + 0.45 * wave) + lift,
          0,
          0.999,
        );
        const band =
          ORB_RAMP[1 + Math.floor(level * (ORB_RAMP.length - 1))] ??
          ORB_RAMP[1];
        const glyph = band[Math.floor(M.hash(c.seed, turn) * band.length)];
        g.globalAlpha = 0.2 + 0.62 * level;
        g.fillText(glyph, c.x, c.y);
      }
      g.globalAlpha = 1;
    },
  };
}

PARTS.orb = {
  beats: () => 0,
  build(s, ctx) {
    const node = M.el("div", "mo-orb-wrap");
    const o = orb(ctx.portrait ? 560 : 520, ctx, (t) =>
      s.talk === false ? 0 : 0.5 + 0.5 * Math.sin(t * 7.5) * Math.sin(t * 2.3),
    );
    node.append(o.el);
    const label = s.label ? rich(s.label, "mo-orb-label") : null;
    if (label) node.append(label.line);
    return {
      node,
      w: ctx.portrait ? 760 : 900,
      plain: true,
      draw(t) {
        const a = M.S(t - 0.05, 9, 0.9);
        M.set(o.el, "transform", `scale(${M.n(0.86 + 0.14 * a, 4)})`);
        M.set(o.el, "opacity", M.n(M.clamp(a * 1.4)));
        o.draw(t);
        if (label)
          label.words.forEach((w, i) => rise(w, t, 0.35 + i * 0.07, 20));
      },
    };
  },
};

/** A line of the call, letters arriving out of a blur, after a dot in the speaker's colour. */
function said(text, who) {
  const line = M.el("div", `mo-said mo-said-${who}`);
  const dot = M.el("i");
  line.append(dot);
  const chars = [...text].map((ch) => {
    const span = M.el("span", "", ch);
    line.append(span);
    return span;
  });
  return {
    line,
    draw(t, t0) {
      M.set(dot, "opacity", M.n(M.eo((t - t0 + 0.1) / 0.2)));
      chars.forEach((span, i) => {
        const a = M.eo((t - t0 - i * 0.018) / 0.4);
        M.set(span, "opacity", M.n(a));
        M.set(
          span,
          "filter",
          a < 0.99 ? `blur(${M.n((1 - a) * 6, 1)}px)` : "none",
        );
      });
    },
  };
}

PARTS.call = {
  beats: (s) => (s.you ? 1 : 0) + (s.her ? 1 : 0),
  build(s, ctx) {
    const node = M.el("div", `mo-call${ctx.portrait ? " mo-call-tall" : ""}`);
    const you = s.you ? said(s.you, "you") : null;
    const her = s.her ? said(s.her, "her") : null;
    let talkFrom = 0;
    const o = orb(ctx.portrait ? 480 : 440, ctx, (t) =>
      t >= talkFrom
        ? 0.35 + 0.65 * Math.abs(Math.sin(t * 6.2) * Math.sin(t * 1.7))
        : 0.1,
    );
    const left = M.el("div", "mo-call-side");
    const right = M.el("div", "mo-call-side");
    if (her) left.append(her.line);
    if (you) right.append(you.line);
    node.append(left, o.el, right);
    return {
      node,
      w: ctx.portrait ? 900 : 1640,
      plain: true,
      draw(t, at) {
        // What they say comes first, then she answers
        const tYou = you ? at[0] : 0;
        const tHer = her ? at[you ? 1 : 0] : 0;
        talkFrom = her ? tHer : Number.POSITIVE_INFINITY;
        const a = M.S(t - 0.05, 9, 0.9);
        M.set(o.el, "opacity", M.n(M.clamp(a * 1.4)));
        M.set(o.el, "transform", `scale(${M.n(0.9 + 0.1 * a, 4)})`);
        o.draw(t);
        if (you) you.draw(t, tYou);
        if (her) her.draw(t, tHer);
      },
    };
  },
};

// The bots' faces: a soft blob, never a circle, with two eyes, in one of the app's paints
const FACE_INK = [
  "#6366F1",
  "#3B82F6",
  "#06B6D4",
  "#14B8A6",
  "#22C55E",
  "#84CC16",
  "#F97316",
  "#EC4899",
  "#8B5CF6",
  "#D946EF",
  "#F43F5E",
  "#64748B",
];

/** A string's seed: the same name draws the same face. */
const seedOf = (text) => {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
};

/** A bot's face as an SVG `size` px wide: a blob from its name's seed, two eyes that blink. */
function face(name, size, color) {
  const seed = seedOf(name);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 240 240");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.classList.add("mo-face");
  const harm = [2, 3, 4].map((k) => ({
    k,
    a: (M.hash(seed, k) - 0.5) * (0.16 / k),
    p: M.hash(seed, k + 9) * Math.PI * 2,
  }));
  const pts = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    // A squircle's softness, pushed about by a few harmonics of the seed
    const c = Math.cos(a);
    const s = Math.sin(a);
    const sq = (Math.abs(c) ** 4 + Math.abs(s) ** 4) ** -0.25;
    const r =
      104 *
      (0.92 + 0.12 * (sq - 1)) *
      (1 + harm.reduce((v, h) => v + h.a * Math.sin(h.k * a + h.p), 0));
    pts.push(`${(120 + c * r).toFixed(1)},${(124 + s * r * 0.96).toFixed(1)}`);
  }
  const body = document.createElementNS(ns, "polygon");
  body.setAttribute("points", pts.join(" "));
  body.setAttribute("fill", color ?? FACE_INK[seed % FACE_INK.length]);
  svg.append(body);
  const eyes = [];
  const gap = 34 + M.hash(seed, 21) * 16;
  const high = 100 + M.hash(seed, 22) * 20;
  for (const side of [-1, 1]) {
    const eye = document.createElementNS(ns, "rect");
    eye.setAttribute("x", String(120 + side * gap - 13));
    eye.setAttribute("y", String(high - 22));
    eye.setAttribute("width", "26");
    eye.setAttribute("height", "44");
    eye.setAttribute("rx", "13");
    eye.setAttribute("fill", "#fff");
    eye.style.transformOrigin = `${120 + side * gap}px ${high}px`;
    svg.append(eye);
    eyes.push(eye);
  }
  const blinkEvery = 2.6 + M.hash(seed, 30) * 2;
  return {
    svg,
    /** Eyes open, but for a blink every few seconds, each face on its own beat. */
    draw(t) {
      const u = (t + M.hash(seed, 31) * blinkEvery) % blinkEvery;
      const shut = u < 0.14 ? Math.sin((u / 0.14) * Math.PI) : 0;
      for (const eye of eyes)
        M.set(eye, "transform", `scaleY(${M.n(1 - 0.9 * shut)})`);
    },
  };
}

PARTS.bots = {
  beats: (s) => (s.active === undefined ? 0 : 1),
  build(s, ctx) {
    const node = M.el("div", "mo-bots");
    if (s.title) node.append(M.el("div", "mo-card-title", s.title));
    const row = M.el("div", "mo-bots-row");
    const items = s.bots.map((b) => {
      const cell = M.el("div", "mo-bot");
      const f = face(b.name, ctx.portrait ? 132 : 150, b.color);
      cell.append(f.svg, M.el("div", "mo-bot-name", b.name));
      const role = b.role ? M.el("div", "mo-bot-role", b.role) : null;
      if (role) cell.append(role);
      row.append(cell);
      return { cell, f, role };
    });
    node.append(row);
    return {
      node,
      w: ctx.portrait ? 900 : Math.min(1600, 260 + s.bots.length * 230),
      plain: true,
      draw(t, at) {
        items.forEach(({ cell, f, role }, i) => {
          // In from the middle outward, each with a small spring
          const order = Math.abs(i - (items.length - 1) / 2);
          const p = M.S(t - 0.1 - order * 0.08, 14, 0.62);
          M.set(
            cell,
            "transform",
            `translateY(${M.px((1 - p) * 40)}) scale(${M.n(0.9 + 0.1 * p, 4)})`,
          );
          M.set(cell, "opacity", M.n(M.clamp(p * 1.5)));
          f.draw(t);
          const on = s.active === i && t >= at[0];
          if (role) {
            M.set(role, "color", on ? ctx.c.accent : "");
            M.set(
              role,
              "backgroundPosition",
              on ? `${M.n(150 - ((t * 60) % 200), 1)}% 0` : "0 0",
            );
            role.classList.toggle("mo-shine", on);
          }
        });
      },
    };
  },
};

PARTS.notify = {
  beats: (s) => s.cards.length,
  build(s, ctx) {
    const node = M.el("div", "mo-notify");
    const cards = s.cards.map((c) => {
      const card = M.el("div", "mo-note");
      const f = face(c.bot, 64, c.color);
      const head = M.el("div", "mo-note-head");
      head.append(f.svg);
      const who = M.el("div", "mo-note-who");
      who.append(
        M.el("div", "mo-note-title", c.title),
        M.el("div", "mo-note-bot", c.bot),
      );
      head.append(who);
      card.append(head);
      if (c.text) card.append(M.el("div", "mo-note-text", c.text));
      node.append(card);
      return { card, f };
    });
    return {
      node,
      w: ctx.portrait ? 820 : 880,
      plain: true,
      draw(t, at) {
        cards.forEach(({ card, f }, i) => {
          // Each lands from below and the ones before it make room
          const p = M.S(t - at[i], 16, 0.8);
          M.set(
            card,
            "transform",
            `translateY(${M.px((1 - p) * 90)}) scale(${M.n(0.96 + 0.04 * p, 4)})`,
          );
          M.set(card, "opacity", M.n(M.clamp(p * 1.6)));
          f.draw(t);
        });
      },
    };
  },
};

PARTS.agent = {
  beats: (s) => s.steps.length,
  build(s, ctx) {
    const node = M.el("div", "mo-agent");
    const head = M.el("div", "mo-agent-head");
    const f = face(s.bot, 72, s.color);
    const who = M.el("div");
    who.append(M.el("div", "mo-agent-bot", s.bot));
    const status = M.el(
      "div",
      "mo-agent-status mo-shine",
      s.working ?? "Working",
    );
    who.append(status);
    head.append(f.svg, who);
    node.append(head);
    const steps = s.steps.map((text) => {
      const row = M.el("div", "mo-agent-step");
      const mark = M.el("div", "mo-agent-mark");
      mark.append(M.icon("check", 22, ctx.c.onAccent, 3));
      const label = M.el("div", "mo-agent-text", text);
      row.append(mark, label);
      node.append(row);
      return { row, mark, label };
    });
    const doneText = s.done ?? "Done";
    return {
      node,
      w: ctx.portrait ? 820 : 900,
      draw(t, at) {
        f.draw(t);
        const finished = t >= at.at(-1) + 0.6;
        M.text(status, finished ? doneText : (s.working ?? "Working"));
        status.classList.toggle("mo-shine", !finished);
        M.set(status, "color", finished ? ctx.c.accent : "");
        if (!finished)
          M.set(
            status,
            "backgroundPosition",
            `${M.n(150 - ((t * 70) % 200), 1)}% 0`,
          );
        steps.forEach(({ row, mark, label }, i) => {
          rise(row, t, at[i] - 0.25, 14, 0.35);
          // A step runs from when it shows until the next one starts; then it is ticked
          const end = i + 1 < at.length ? at[i + 1] : at[i] + 0.6;
          const running = t >= at[i] && t < end;
          const ticked = t >= end;
          const p = ticked ? M.S(t - end, ...M.POP) : 0;
          M.set(mark, "background", ticked ? ctx.c.accent : "transparent");
          M.set(mark, "borderColor", ticked ? ctx.c.accent : ctx.c.line);
          M.set(
            mark.firstChild,
            "transform",
            `scale(${M.n(M.clamp(p, 0, 1.2), 3)})`,
          );
          label.classList.toggle("mo-shine", running);
          if (running)
            M.set(
              label,
              "backgroundPosition",
              `${M.n(150 - (((t - at[i]) * 90) % 200), 1)}% 0`,
            );
          M.set(label, "opacity", ticked ? "0.6" : "1");
        });
      },
    };
  },
};

PARTS.prompt = {
  beats: () => 2,
  build(s, ctx) {
    const node = M.el("div", "mo-prompt");
    const box = M.el("div", "mo-prompt-box");
    const typed = M.el("span", "mo-prompt-text");
    const caret = M.el("span", "mo-caret");
    const hint = M.el("span", "mo-field-hint", s.placeholder ?? "");
    const send = M.el("div", "mo-prompt-send");
    send.append(M.icon("arrow", 30, ctx.c.onAccent, 2.8));
    const words = M.el("div", "mo-prompt-words");
    words.append(typed, caret, hint);
    box.append(words, send);
    node.append(box);
    const result = M.el("div", "mo-prompt-result");
    const skeleton = M.el("div", "mo-skeleton");
    for (let i = 0; i < 3; i++) skeleton.append(M.el("i"));
    const out = M.el("div", "mo-prompt-out");
    if (s.icon) out.append(M.icon(s.icon, 44, ctx.c.accent, 2.4));
    const outText = M.el("div");
    outText.append(M.el("div", "mo-prompt-title", s.result));
    if (s.detail) outText.append(M.el("div", "mo-prompt-detail", s.detail));
    out.append(outText);
    result.append(skeleton, out);
    node.append(result);
    const cps = 26;
    // Sent on the second beat, or once the last letter is typed if that is later
    const sendAt = (at) =>
      Math.max(at[1], at[0] + [...s.text].length / cps + 0.25);
    return {
      node,
      w: ctx.portrait ? 820 : 1080,
      // Typed as soon as it is in, sent as soon as it is typed: the rest is the result
      beatsAt: () => [0.35, 0.35 + [...s.text].length / cps + 0.3],
      targets: (at) => {
        const c = centreIn(send, node);
        return [{ path: [[sendAt(at), c.x, c.y]] }];
      },
      draw(t, at) {
        const text = M.typed(s.text, t, at[0], cps);
        M.text(typed, text);
        M.set(hint, "display", text ? "none" : "inline");
        const sentAt = sendAt(at);
        const sent = t >= sentAt;
        M.set(caret, "opacity", sent || Math.floor(t * 2.2) % 2 ? "0" : "1");
        M.set(send, "background", text ? ctx.c.accent : ctx.c.line);
        const made = sentAt + 0.9;
        const r = M.S(t - sentAt - 0.1, ...M.MORPH);
        M.set(result, "opacity", M.n(M.clamp(r * 1.5)));
        M.set(result, "transform", `translateY(${M.px((1 - r) * 30)})`);
        M.set(skeleton, "display", t < made ? "" : "none");
        if (t < made)
          M.set(
            skeleton,
            "backgroundPosition",
            `${M.n(150 - ((t * 90) % 200), 1)}% 0`,
          );
        M.set(out, "display", t >= made ? "" : "none");
        if (t >= made) rise(out, t, made, 12, 0.35);
      },
    };
  },
};
