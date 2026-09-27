// What a scene can show. Each part builds its content once, at the size it will be seen,
// and draws it at any time `t` in the scene from the scene's beats — the moments its
// changes land on, given by the video (`times`) or spread across the scene.
//
//   PARTS[kind] = {
//     beats(scene)        how many changes it makes inside the scene
//     build(scene, ctx)   → { node, w, h?, r?, bg?, shadow?, plain?, shapes?, targets?(), draw(t, at) }
//   }
//
// `node` is laid out at width `w`; without `h` its height is measured. `plain` shows it on
// the canvas with no card around it. `shapes` are further card states inside the scene,
// `[{ beat, w, h, r?, bg? }]`. `targets()` names where the cursor presses, from the node's
// centre: `[{ beat, x, y }]`, or `{ hold: [from, to], path: [[t, x, y], …] }` for a drag.
// `draw(t, at)` gets the time from the scene's start and the beat times, `at[i]`.
const PARTS = {};

/** An element's centre from the centre of `root`, through offsets: transforms do not move it. */
function centreIn(el, root) {
  let x = el.offsetWidth / 2;
  let y = el.offsetHeight / 2;
  for (let n = el; n && n !== root; n = n.offsetParent) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x: x - root.offsetWidth / 2, y: y - root.offsetHeight / 2 };
}

/** Text in, blurred and lifted, from `t0`. */
function rise(el, t, t0, lift = 18, length = 0.36) {
  const a = M.eo((t - t0) / length);
  M.set(el, "opacity", M.n(a));
  M.set(el, "filter", a < 0.99 ? `blur(${M.n((1 - a) * 8, 1)}px)` : "none");
  M.set(el, "transform", `translateY(${M.px((1 - a) * lift)})`);
}

/** Words of `text` as spans, to be shown one after another. */
function words(text, cls) {
  const line = M.el("div", cls);
  const spans = String(text)
    .split(/(\s+)/)
    .filter((w) => w.length)
    .map((w) => {
      if (/^\s+$/.test(w)) {
        line.append(document.createTextNode(w));
        return null;
      }
      const span = M.el("span", "mo-word", w);
      line.append(span);
      return span;
    })
    .filter(Boolean);
  return { line, spans };
}

const item = (it) => (typeof it === "string" ? { text: it } : it);

PARTS.title = {
  beats: () => 0,
  build(s, ctx) {
    const node = M.el("div", "mo-title");
    const kicker = s.kicker ? M.el("div", "mo-kicker", s.kicker) : null;
    const title = words(s.title, "mo-h1");
    const sub = s.sub ? M.el("div", "mo-sub", s.sub) : null;
    if (kicker) node.append(kicker);
    node.append(title.line);
    if (sub) node.append(sub);
    return {
      node,
      w: ctx.portrait ? 860 : 1280,
      plain: true,
      draw(t) {
        if (kicker) rise(kicker, t, 0.1);
        title.spans.forEach((w, i) => rise(w, t, 0.22 + i * 0.07, 26));
        if (sub) rise(sub, t, 0.4 + title.spans.length * 0.07);
      },
    };
  },
};

PARTS.end = {
  beats: () => 0,
  build(s, ctx) {
    const node = M.el("div", "mo-title mo-end");
    const mark = s.icon ? M.icon(s.icon, 88, ctx.c.onAccent, 2.4) : null;
    const badge = mark ? M.el("div", "mo-end-mark") : null;
    if (badge) {
      badge.append(mark);
      node.append(badge);
    }
    const title = words(s.title, "mo-h1");
    node.append(title.line);
    const sub = s.sub ? M.el("div", "mo-sub mo-mono", s.sub) : null;
    if (sub) node.append(sub);
    const pop = M.track(0, [[0.1, 1, M.POP]]);
    return {
      node,
      w: ctx.portrait ? 860 : 1100,
      plain: true,
      draw(t) {
        if (badge) {
          const p = pop(t);
          M.set(badge, "transform", `scale(${M.n(Math.max(0, p), 4)})`);
          M.set(badge, "opacity", M.n(M.clamp(p * 2)));
        }
        title.spans.forEach((w, i) => rise(w, t, 0.3 + i * 0.07, 26));
        if (sub) rise(sub, t, 0.5 + title.spans.length * 0.07);
      },
    };
  },
};

PARTS.chapter = {
  beats: () => 0,
  build(s, ctx) {
    const node = M.el("div", "mo-chapter");
    const num = s.number ? M.el("div", "mo-chapter-num", s.number) : null;
    if (num) node.append(num);
    const title = words(s.title, "mo-chapter-title");
    node.append(title.line);
    return {
      node,
      w: ctx.portrait ? 600 : 980,
      r: 44,
      bg: ctx.c.dark,
      draw(t) {
        if (num) rise(num, t, 0.12);
        title.spans.forEach((w, i) => rise(w, t, 0.24 + i * 0.07, 22));
      },
    };
  },
};

PARTS.pill = {
  beats: () => 1,
  build(s, ctx) {
    const node = M.el("div", "mo-pill");
    if (s.icon) node.append(M.icon(s.icon, 44, ctx.c.accent, 2.4));
    node.append(M.el("span", "mo-pill-label", s.label));
    const badge = s.badge ? M.el("span", "mo-badge", s.badge) : null;
    if (badge) node.append(badge);
    return {
      node,
      h: 128,
      r: 64,
      bg: ctx.c.dark,
      press: true,
      targets: () => [{ beat: 0, ...centreIn(node, node) }],
      draw(t, at) {
        if (!badge) return;
        const p = M.S(t - at[0] - 0.05, ...M.POP);
        M.set(badge, "transform", `scale(${M.n(Math.max(0, p), 4)})`);
        M.set(badge, "opacity", M.n(M.clamp(p * 1.6)));
      },
    };
  },
};

PARTS.options = {
  beats: (s) => s.pick.length,
  build(s, ctx) {
    const node = M.el("div", "mo-options");
    const label = s.label ? M.el("div", "mo-options-label", s.label) : null;
    if (label) node.append(label);
    const bar = M.el("div", "mo-seg");
    const row = M.el("div", "mo-seg-row");
    const cells = s.options.map((o) => {
      const cell = M.el("div", "mo-seg-cell", o);
      row.append(cell);
      return cell;
    });
    const ind = M.el("div", "mo-seg-ind");
    const inner = M.el("div", "mo-seg-row mo-seg-on");
    for (const o of s.options) inner.append(M.el("div", "mo-seg-cell", o));
    ind.append(inner);
    bar.append(row, ind);
    node.append(bar);
    const w = ctx.portrait ? 600 : Math.min(1180, 180 + s.options.length * 210);
    let left;
    let right;
    return {
      node,
      w,
      targets() {
        return s.pick.map((i, beat) => ({ beat, ...centreIn(cells[i], node) }));
      },
      draw(t, at) {
        if (!left) {
          // The labels inside the indicator are the row again, as wide, moved under it
          inner.style.width = `${row.offsetWidth}px`;
          const edges = cells.map((c) => [
            c.offsetLeft,
            c.offsetLeft + c.offsetWidth,
          ]);
          const start = s.start ?? 0;
          // The edge that leads the move runs on a faster spring than the one that trails
          const lk = [];
          const rk = [];
          let from = start;
          s.pick.forEach((to, i) => {
            const forward = to > from;
            lk.push([at[i], edges[to][0], forward ? M.SLOW : M.FAST]);
            rk.push([at[i], edges[to][1], forward ? M.FAST : M.SLOW]);
            from = to;
          });
          left = M.track(edges[start][0], lk);
          right = M.track(edges[start][1], rk);
        }
        const l = left(t);
        const r = right(t);
        M.set(ind, "left", M.px(l));
        M.set(ind, "width", M.px(Math.max(0, r - l)));
        M.set(inner, "left", M.px(-l));
      },
    };
  },
};

PARTS.list = {
  beats: (s) => s.items.length,
  build(s, ctx) {
    const node = M.el("div", "mo-list");
    if (s.title) node.append(M.el("div", "mo-card-title", s.title));
    const rows = s.items.map(item).map((it) => {
      const row = M.el("div", "mo-row");
      const mark = M.el("div", s.check ? "mo-tick" : "mo-dot");
      if (s.check) mark.append(M.icon("check", 26, ctx.c.onAccent, 3));
      else if (it.icon) {
        mark.className = "mo-row-icon";
        mark.append(M.icon(it.icon, 32, ctx.c.ink));
      }
      row.append(mark, M.el("div", "mo-row-text", it.text));
      node.append(row);
      return { row, mark };
    });
    return {
      node,
      w: ctx.portrait ? 600 : 960,
      draw(t, at) {
        rows.forEach(({ row, mark }, i) => {
          if (!s.check) return rise(row, t, at[i], 22);
          rise(row, t, 0.05 + i * 0.06, 14);
          const done = M.S(t - at[i], ...M.POP);
          M.set(mark, "background", done > 0.5 ? ctx.c.accent : "transparent");
          M.set(mark, "borderColor", done > 0.5 ? ctx.c.accent : ctx.c.line);
          M.set(
            mark.firstChild,
            "transform",
            `scale(${M.n(M.clamp(done, 0, 1.2), 3)})`,
          );
          M.set(row.lastChild, "opacity", done > 0.5 ? "0.55" : "1");
        });
      },
    };
  },
};

PARTS.bars = {
  beats: (s) => s.bars.length,
  build(s, ctx) {
    const node = M.el("div", "mo-bars");
    if (s.title) node.append(M.el("div", "mo-card-title", s.title));
    const plot = M.el("div", "mo-bars-plot");
    const top = Math.max(...s.bars.map((b) => b.value));
    const H = ctx.portrait ? 440 : 380;
    plot.style.height = `${H}px`;
    const cols = s.bars.map((b, i) => {
      const col = M.el("div", "mo-col");
      const val = M.el(
        "div",
        "mo-col-value",
        b.text ?? `${s.prefix ?? ""}${b.value}${s.unit ?? ""}`,
      );
      const bar = M.el("div", "mo-col-bar");
      if (i === s.highlight) bar.style.background = ctx.c.accent;
      const name = M.el("div", "mo-col-name", b.label);
      col.append(val, bar, name);
      plot.append(col);
      return { val, bar, h: (b.value / top) * (H - 110) };
    });
    node.append(plot);
    return {
      node,
      w: ctx.portrait ? 600 : Math.min(1200, 260 + s.bars.length * 170),
      draw(t, at) {
        cols.forEach(({ val, bar, h }, i) => {
          const g = M.S(t - at[i], ...M.MORPH);
          M.set(bar, "height", M.px(Math.max(0, g * h)));
          rise(val, t, at[i] + 0.25, 10);
        });
      },
    };
  },
};

PARTS.number = {
  beats: () => 1,
  build(s, ctx) {
    const node = M.el("div", "mo-number");
    const big = M.el("div", "mo-number-value");
    node.append(big);
    const label = s.label ? M.el("div", "mo-sub", s.label) : null;
    if (label) node.append(label);
    const from = s.from ?? 0;
    const decimals = s.decimals ?? (Number.isInteger(s.value) ? 0 : 1);
    const fmt = (v) =>
      `${s.prefix ?? ""}${v.toLocaleString(s.locale ?? "en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${s.suffix ?? ""}`;
    // The widest the number gets, so the card is sized for it before it counts
    big.textContent = fmt(Math.max(Math.abs(from), Math.abs(s.value)));
    return {
      node,
      w: ctx.portrait ? 600 : 1000,
      draw(t, at) {
        const u = M.eio((t - at[0]) / 1.3);
        M.text(big, fmt(M.lerp(from, s.value, u)));
        if (label) rise(label, t, at[0] + 0.5);
      },
    };
  },
};

PARTS.terminal = {
  beats: (s) => s.lines.filter((l) => l.startsWith("$")).length,
  build(s, ctx) {
    const node = M.el("div", "mo-term");
    const head = M.el("div", "mo-term-head");
    head.append(M.el("i"), M.el("i"), M.el("i"));
    if (s.title) head.append(M.el("span", "mo-term-title", s.title));
    const body = M.el("div", "mo-term-body");
    node.append(head, body);
    let beat = -1;
    const lines = s.lines.map((raw) => {
      const cmd = raw.startsWith("$");
      if (cmd) beat++;
      const line = M.el("div", cmd ? "mo-term-cmd" : "mo-term-out");
      const text = cmd ? raw.replace(/^\$\s?/, "") : raw;
      if (cmd) line.append(M.el("span", "mo-term-prompt", "›"));
      // Laid out whole, so the card is sized for all of it before it types
      const span = M.el("span", "", text);
      line.append(span);
      body.append(line);
      return { line, span, cmd, text, beat };
    });
    const caret = M.el("span", "mo-caret");
    return {
      node,
      w: ctx.portrait ? 860 : 1180,
      bg: ctx.c.term,
      r: 28,
      draw(t, at) {
        // Output comes in just after the command above it has been typed
        let ready = 0;
        let typing = lines[0].line;
        for (const l of lines) {
          if (l.cmd) {
            const t0 = at[l.beat];
            M.text(l.span, M.typed(l.text, t, t0, 30));
            const on = t >= t0 - 0.35;
            M.set(l.line, "visibility", on ? "visible" : "hidden");
            if (on) typing = l.line;
            ready = t0 + [...l.text].length / 30 + 0.2;
          } else {
            const on = l.beat < 0 || t >= ready;
            M.set(l.line, "visibility", on ? "visible" : "hidden");
            M.set(
              l.line,
              "opacity",
              on && l.beat >= 0 ? M.n(M.eo((t - ready) / 0.2)) : "1",
            );
            if (l.beat >= 0) ready += 0.08;
          }
        }
        M.move(caret, typing);
        M.set(caret, "opacity", Math.floor(t * 2.2) % 2 ? "0" : "1");
      },
    };
  },
};

PARTS.chat = {
  beats: (s) => s.messages.length,
  build(s, ctx) {
    const node = M.el("div", "mo-chat");
    const bubbles = s.messages.map((m) => {
      const mine = m.from !== "them";
      const wrap = M.el("div", `mo-msg ${mine ? "mo-me" : "mo-them"}`);
      const bubble = M.el("div", "mo-bubble", m.text);
      const dots = mine ? null : M.el("div", "mo-bubble mo-dots");
      if (dots) dots.append(M.el("i"), M.el("i"), M.el("i"));
      if (dots) wrap.append(dots);
      wrap.append(bubble);
      node.append(wrap);
      return { wrap, bubble, dots };
    });
    return {
      node,
      w: ctx.portrait ? 600 : 900,
      draw(t, at) {
        bubbles.forEach(({ bubble, dots }, i) => {
          const shown = dots ? at[i] + 0.55 : at[i];
          if (dots) {
            const on = t >= at[i] && t < shown;
            M.set(dots, "visibility", on ? "visible" : "hidden");
            [...dots.children].forEach((d, k) =>
              M.set(
                d,
                "opacity",
                M.n(0.35 + 0.65 * Math.max(0, Math.sin((t - k * 0.15) * 9))),
              ),
            );
            if (on) rise(dots, t, at[i], 12, 0.25);
          }
          rise(bubble, t, shown, 16, 0.3);
        });
      },
    };
  },
};

PARTS.search = {
  beats: () => 1,
  build(s, ctx) {
    const node = M.el("div", "mo-search");
    const field = M.el("div", "mo-field");
    field.append(M.icon("search", 34, ctx.c.muted, 2.4));
    const input = M.el("span", "mo-field-text");
    const hint = M.el("span", "mo-field-hint", s.placeholder ?? "");
    const caret = M.el("span", "mo-caret");
    field.append(input, caret, hint);
    const list = M.el("div", "mo-results");
    const q = s.query.toLowerCase();
    const rows = s.items.map(item).map((it) => {
      const row = M.el("div", "mo-result");
      if (it.icon) row.append(M.icon(it.icon, 30, ctx.c.ink));
      const text = M.el("span");
      const at = it.text.toLowerCase().indexOf(q);
      if (at >= 0) {
        text.append(
          document.createTextNode(it.text.slice(0, at)),
          M.el("mark", "", it.text.slice(at, at + q.length)),
          document.createTextNode(it.text.slice(at + q.length)),
        );
      } else text.textContent = it.text;
      row.append(text);
      list.append(row);
      return { row, hit: at >= 0 };
    });
    node.append(field, list);
    return {
      node,
      w: ctx.portrait ? 600 : 960,
      draw(t, at) {
        const typed = M.typed(s.query, t, at[0], 16);
        M.text(input, typed);
        M.set(hint, "display", typed ? "none" : "inline");
        M.set(caret, "opacity", Math.floor(t * 2.2) % 2 ? "0" : "1");
        const done = at[0] + [...s.query].length / 16;
        rows.forEach(({ row, hit }, i) => {
          if (hit) return rise(row, t, 0.1 + i * 0.05, 10);
          const out = M.eo((t - done - 0.1) / 0.3);
          M.set(
            row,
            "opacity",
            M.n((1 - out) * M.eo((t - 0.1 - i * 0.05) / 0.36)),
          );
          M.set(row, "maxHeight", M.px(80 * (1 - out)));
          M.set(row, "marginTop", M.px(-12 * out));
        });
      },
    };
  },
};

PARTS.toggles = {
  beats: (s) => s.flip.length,
  build(s, ctx) {
    const node = M.el("div", "mo-list");
    if (s.title) node.append(M.el("div", "mo-card-title", s.title));
    const rows = s.items.map((it) => {
      const row = M.el("div", "mo-row mo-toggle-row");
      row.append(M.el("div", "mo-row-text", it.label));
      const sw = M.el("div", "mo-switch");
      const knob = M.el("i");
      sw.append(knob);
      row.append(sw);
      node.append(row);
      return { sw, knob, on: Boolean(it.on) };
    });
    return {
      node,
      w: ctx.portrait ? 600 : 900,
      targets: () =>
        s.flip.map((i, beat) => ({ beat, ...centreIn(rows[i].sw, node) })),
      draw(t, at) {
        rows.forEach((r, i) => {
          let on = r.on;
          let since = -1;
          s.flip.forEach((f, beat) => {
            if (f === i && t >= at[beat]) {
              on = !on;
              since = at[beat];
            }
          });
          const u = since < 0 ? 1 : M.S(t - since, ...M.FAST);
          const x = on ? M.lerp(0, 40, u) : M.lerp(40, 0, u);
          M.set(r.knob, "transform", `translateX(${M.px(x)})`);
          M.set(r.sw, "background", on ? ctx.c.accent : ctx.c.line);
        });
      },
    };
  },
};

PARTS.progress = {
  beats: (s) => s.items.length,
  build(s, ctx) {
    const node = M.el("div", "mo-list");
    if (s.title) node.append(M.el("div", "mo-card-title", s.title));
    const rows = s.items.map(item).map((it) => {
      const row = M.el("div", "mo-prog");
      const top = M.el("div", "mo-prog-top");
      const done = M.el("div", "mo-prog-done");
      done.append(M.icon("check", 24, ctx.c.accent, 3));
      top.append(M.el("div", "mo-row-text", it.text), done);
      const track = M.el("div", "mo-prog-track");
      const fill = M.el("div", "mo-prog-fill");
      track.append(fill);
      row.append(top, track);
      node.append(row);
      return { fill, done };
    });
    return {
      node,
      w: ctx.portrait ? 600 : 900,
      draw(t, at) {
        rows.forEach(({ fill, done }, i) => {
          const u = M.eio((t - at[i]) / 0.9);
          M.set(fill, "width", `${M.n(u * 100, 2)}%`);
          const p = M.S(t - at[i] - 0.9, ...M.POP);
          M.set(done, "transform", `scale(${M.n(Math.max(0, p), 3)})`);
        });
      },
    };
  },
};

PARTS.compare = {
  beats: (s) => (s.pick ? 3 : 2),
  build(s, ctx) {
    const node = M.el("div", `mo-compare${ctx.portrait ? " mo-stack" : ""}`);
    const side = (x) => {
      const box = M.el("div", "mo-side");
      box.append(M.el("div", "mo-side-title", x.title));
      for (const p of x.points ?? [])
        box.append(M.el("div", "mo-side-point", p));
      const mark = M.el("div", "mo-side-pick");
      mark.append(M.icon("check", 26, ctx.c.onAccent, 3));
      box.append(mark);
      return { box, mark };
    };
    const a = side(s.left);
    const b = side(s.right);
    const vs = M.el("div", "mo-vs", s.vs ?? "vs");
    node.append(a.box, vs, b.box);
    const picked = s.pick === "left" ? a : s.pick === "right" ? b : null;
    return {
      node,
      w: ctx.portrait ? 600 : 1320,
      plain: true,
      draw(t, at) {
        rise(a.box, t, at[0], 24);
        rise(vs, t, at[1] - 0.1, 0);
        rise(b.box, t, at[1], 24);
        for (const x of [a, b]) {
          const on = x === picked && t >= at[2];
          const p = on ? M.S(t - at[2], ...M.POP) : 0;
          M.set(x.mark, "transform", `scale(${M.n(Math.max(0, p), 3)})`);
          M.set(x.box, "boxShadow", on ? `0 0 0 4px ${ctx.c.accent}` : "none");
        }
      },
    };
  },
};

PARTS.steps = {
  beats: (s) => s.items.length,
  build(s, ctx) {
    const vertical = ctx.portrait;
    const node = M.el("div", `mo-steps${vertical ? " mo-steps-v" : ""}`);
    const line = M.el("div", "mo-steps-line");
    const fill = M.el("div", "mo-steps-fill");
    line.append(fill);
    node.append(line);
    const nodes = s.items.map((text, i) => {
      const st = M.el("div", "mo-step");
      const dot = M.el("div", "mo-step-dot", String(i + 1));
      st.append(dot, M.el("div", "mo-step-text", text));
      node.append(st);
      return { st, dot };
    });
    return {
      node,
      w: vertical ? 600 : Math.min(1500, 160 + s.items.length * 260),
      draw(t, at) {
        // The line runs from the first dot's centre to the last's, and fills to the step reached
        const dots = nodes.map(({ dot }) => centreIn(dot, node));
        const first = dots[0];
        const last = dots[dots.length - 1];
        const x0 = first.x + node.offsetWidth / 2;
        const y0 = first.y + node.offsetHeight / 2;
        const length = vertical ? last.y - first.y : last.x - first.x;
        M.set(line, "left", M.px(vertical ? x0 - 2 : x0));
        M.set(line, "top", M.px(vertical ? y0 : y0 - 2));
        M.set(line, vertical ? "height" : "width", M.px(length));
        let reach = 0;
        nodes.forEach((n, i) => {
          rise(n.st, t, 0.08 + i * 0.07, 14);
          if (i > 0) reach += M.S(t - at[i], ...M.SLOW);
          const on = t >= at[i];
          M.set(n.dot, "background", on ? ctx.c.dark : ctx.c.card);
          M.set(n.dot, "color", on ? ctx.c.onDark : ctx.c.muted);
          const pulse = Math.sin(Math.PI * M.clamp((t - at[i]) / 0.3));
          M.set(n.dot, "transform", `scale(${M.n(1 + 0.12 * pulse, 3)})`);
        });
        const size = (reach / Math.max(1, nodes.length - 1)) * length;
        M.set(fill, vertical ? "height" : "width", M.px(Math.max(0, size)));
      },
    };
  },
};

PARTS.quote = {
  beats: () => 0,
  build(s, ctx) {
    const node = M.el("div", "mo-quote");
    node.append(M.el("div", "mo-quote-mark", "“"));
    const text = words(s.text, "mo-quote-text");
    node.append(text.line);
    const by = s.by ? M.el("div", "mo-quote-by", s.by) : null;
    if (by) node.append(by);
    return {
      node,
      w: ctx.portrait ? 640 : 1180,
      draw(t) {
        text.spans.forEach((w, i) => rise(w, t, 0.15 + i * 0.045, 12, 0.3));
        if (by) rise(by, t, 0.35 + text.spans.length * 0.045);
      },
    };
  },
};

PARTS.image = {
  beats: () => 0,
  build(s, ctx) {
    const node = M.el("div", "mo-image");
    const frame = M.el("div", "mo-image-frame");
    const img = M.el("img");
    img.src = s.src;
    img.alt = "";
    img.style.objectFit = s.fit ?? "cover";
    const [rw, rh] = String(s.ratio ?? (ctx.portrait ? "4:5" : "16:9"))
      .split(":")
      .map(Number);
    const w = ctx.portrait ? 900 : 1360;
    frame.style.height = `${Math.round((w * rh) / rw)}px`;
    frame.append(img);
    node.append(frame);
    const cap = s.caption ? M.el("div", "mo-image-cap", s.caption) : null;
    if (cap) node.append(cap);
    return {
      node,
      w,
      r: 32,
      draw(t) {
        // A slow push in over the whole scene: a still picture never sits dead
        M.set(
          img,
          "transform",
          `scale(${M.n(1 + Math.min(t, 12) * 0.006, 4)})`,
        );
        if (cap) rise(cap, t, 0.3);
      },
    };
  },
};

PARTS.code = {
  beats: (s) => (s.highlight ?? []).length,
  build(s, ctx) {
    const node = M.el("div", "mo-code");
    if (s.title) node.append(M.el("div", "mo-code-title", s.title));
    const body = M.el("div", "mo-code-body");
    const band = M.el("div", "mo-code-band");
    body.append(band);
    const lines = s.code.split("\n").map((l, i) => {
      const line = M.el("div", "mo-code-line");
      line.append(
        M.el("span", "mo-code-no", String(i + 1)),
        M.el("span", "", l || " "),
      );
      body.append(line);
      return line;
    });
    node.append(body);
    let top;
    return {
      node,
      w: ctx.portrait ? 880 : 1200,
      bg: ctx.c.term,
      r: 28,
      draw(t, at) {
        lines.forEach((l, i) => rise(l, t, 0.1 + i * 0.035, 8, 0.25));
        const marks = s.highlight ?? [];
        if (!top && marks.length) {
          const tops = marks.map((n) => lines[n - 1].offsetTop);
          top = M.track(
            tops[0],
            tops.map((y, i) => [at[i], y]),
          );
        }
        if (!marks.length) return M.set(band, "opacity", "0");
        M.set(band, "opacity", M.n(M.eo((t - at[0]) / 0.25)));
        M.set(band, "transform", `translateY(${M.px(top(t))})`);
        M.set(band, "height", M.px(lines[0].offsetHeight));
      },
    };
  },
};

PARTS.toast = {
  beats: () => 1,
  build(s, ctx) {
    const node = M.el("div", "mo-toast");
    const icon = M.el("div", "mo-toast-icon");
    icon.append(M.icon(s.icon ?? "bell", 40, ctx.c.onAccent, 2.4));
    const text = M.el("div", "mo-toast-text");
    text.append(M.el("div", "mo-toast-title", s.title));
    if (s.text) text.append(M.el("div", "mo-toast-sub", s.text));
    node.append(icon, text);
    return {
      node,
      w: ctx.portrait ? 600 : 900,
      bg: ctx.c.dark,
      // It starts as a small island around its icon, and opens on its beat
      first: { w: 150, h: 110, r: 55 },
      shapes: [{ beat: 0 }],
      draw(t, at) {
        rise(text, t, at[0] + 0.12, 0);
        // The icon sits in the middle of the island, and moves to its place as it opens
        const from = -centreIn(icon, node).x;
        const open = M.S(t - at[0], ...M.MORPH);
        M.set(icon, "transform", `translateX(${M.px(from * (1 - open))})`);
      },
    };
  },
};

PARTS.slider = {
  beats: () => 1,
  build(s, ctx) {
    const node = M.el("div", "mo-slider");
    const head = M.el("div", "mo-slider-head");
    const label = M.el("div", "mo-row-text", s.label ?? "");
    const value = M.el("div", "mo-slider-value");
    head.append(label, value);
    const track = M.el("div", "mo-slider-track");
    const fill = M.el("div", "mo-slider-fill");
    const knob = M.el("div", "mo-slider-knob");
    track.append(fill, knob);
    const ends = M.el("div", "mo-slider-ends");
    ends.append(
      M.el("span", "", s.minLabel ?? String(s.min ?? 0)),
      M.el("span", "", s.maxLabel ?? String(s.max ?? 100)),
    );
    node.append(head, track, ends);
    const min = s.min ?? 0;
    const max = s.max ?? 100;
    const fmt = (v) => `${Math.round(v)}${s.unit ?? ""}`;
    value.textContent = fmt(max);
    // The knob follows the cursor while it is held, and the value follows the knob
    const drag = 1.1;
    const u = (v) => (v - min) / (max - min);
    const x = (t, at) => M.lerp(u(s.from), u(s.to), M.eio((t - at[0]) / drag));
    return {
      node,
      w: ctx.portrait ? 600 : 960,
      targets(at) {
        const c = centreIn(track, node);
        const width = track.offsetWidth;
        const along = (v) => c.x - width / 2 + u(v) * width;
        return [
          {
            hold: [at[0], at[0] + drag],
            path: [
              [at[0], along(s.from), c.y],
              [at[0] + drag, along(s.to), c.y],
            ],
          },
        ];
      },
      draw(t, at) {
        const p = M.clamp(x(t, at));
        M.set(fill, "width", `${M.n(p * 100, 2)}%`);
        M.set(knob, "left", `${M.n(p * 100, 2)}%`);
        M.text(value, fmt(min + (max - min) * M.clamp(p)));
      },
    };
  },
};
