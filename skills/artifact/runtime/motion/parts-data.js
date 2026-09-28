// Numbers and how things connect: figures that count, a line that draws itself, a ring that
// fills, a table that fills in, a timeline walked, and a hub its spokes reach.

/** A number as it reads: its prefix and suffix, grouped, with its decimals. */
function figure(v, s, locale) {
  const decimals = s.decimals ?? (Number.isInteger(s.value) ? 0 : 1);
  return `${s.prefix ?? ""}${v.toLocaleString(locale ?? "en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${s.suffix ?? ""}`;
}

PARTS.stats = {
  beats: (s) => s.stats.length,
  build(s, ctx) {
    const node = M.el("div", `mo-stats${ctx.portrait ? " mo-stack" : ""}`);
    if (s.title) node.append(M.el("div", "mo-card-title mo-span", s.title));
    const items = s.stats.map((x) => {
      const cell = M.el("div", "mo-stat");
      const big = M.el("div", "mo-stat-value", figure(x.value, x, s.locale));
      const label = M.el("div", "mo-stat-label", x.label);
      cell.append(big, label);
      node.append(cell);
      return { cell, big, x };
    });
    return {
      node,
      w: ctx.portrait ? 760 : Math.min(1560, 200 + s.stats.length * 380),
      draw(t, at) {
        items.forEach(({ cell, big, x }, i) => {
          rise(cell, t, at[i] - 0.15, 24, 0.4);
          const u = M.eio((t - at[i]) / 1.1);
          M.text(big, figure(M.lerp(x.from ?? 0, x.value, u), x, s.locale));
        });
      },
    };
  },
};

PARTS.line = {
  beats: () => 1,
  build(s, ctx) {
    const node = M.el("div", "mo-linechart");
    if (s.title) node.append(M.el("div", "mo-card-title", s.title));
    const W = ctx.portrait ? 600 : 1000;
    const H = ctx.portrait ? 420 : 400;
    const pad = 20;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    const lo = Math.min(0, ...s.values);
    const hi = Math.max(...s.values);
    const pts = s.values.map((v, i) => [
      pad + (i / (s.values.length - 1)) * (W - pad * 2),
      H - pad - ((v - lo) / (hi - lo || 1)) * (H - pad * 2 - 40),
    ]);
    // A smooth line through the points: each bend a cubic between its neighbours
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const mx = (x0 + x1) / 2;
      d += ` C ${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
    }
    for (let i = 1; i < 4; i++) {
      const rule = document.createElementNS(ns, "line");
      const y = pad + ((H - pad * 2) * i) / 4;
      rule.setAttribute("x1", 0);
      rule.setAttribute("x2", W);
      rule.setAttribute("y1", y);
      rule.setAttribute("y2", y);
      rule.setAttribute("class", "mo-rule");
      svg.append(rule);
    }
    const area = document.createElementNS(ns, "path");
    area.setAttribute(
      "d",
      `${d} L ${pts.at(-1)[0]} ${H} L ${pts[0][0]} ${H} Z`,
    );
    area.setAttribute("class", "mo-area");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "mo-line");
    path.setAttribute("pathLength", "1");
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("r", "11");
    dot.setAttribute("class", "mo-line-dot");
    svg.append(area, path, dot);
    // The tip rides the line, so it sits in the plot, measured in the plot's own pixels
    const plot = M.el("div", "mo-plot");
    plot.append(svg);
    node.append(plot);
    const tip = M.el(
      "div",
      "mo-line-tip",
      s.label ?? figure(s.values.at(-1), s),
    );
    plot.append(tip);
    const clip = `mo-clip-${seedOf(d)}`;
    const mask = document.createElementNS(ns, "clipPath");
    mask.id = clip;
    const box = document.createElementNS(ns, "rect");
    box.setAttribute("height", H);
    mask.append(box);
    svg.prepend(mask);
    area.setAttribute("clip-path", `url(#${clip})`);
    const labels = s.labels
      ? (() => {
          const row = M.el("div", "mo-line-labels");
          for (const l of s.labels) row.append(M.el("span", "", l));
          node.append(row);
          return row;
        })()
      : null;
    return {
      node,
      w: W + 112,
      draw(t, at) {
        const p = M.eio((t - at[0]) / 1.4);
        M.set(path, "strokeDashoffset", M.n(1 - p, 4));
        const len = path.getTotalLength();
        const at1 = path.getPointAtLength(len * p);
        box.setAttribute("width", String(at1.x));
        M.set(dot, "transform", `translate(${M.px(at1.x)},${M.px(at1.y)})`);
        M.set(dot, "opacity", p > 0.01 ? "1" : "0");
        const done = M.eo((t - at[0] - 1.35) / 0.3);
        M.set(tip, "opacity", M.n(done));
        M.set(tip, "left", M.px(at1.x));
        M.set(tip, "top", M.px(at1.y - 26));
        if (labels) rise(labels, t, 0.1, 10);
      },
    };
  },
};

PARTS.ring = {
  beats: () => 1,
  build(s, ctx) {
    const node = M.el("div", "mo-ring");
    const size = 420;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    const track = document.createElementNS(ns, "circle");
    const arc = document.createElementNS(ns, "circle");
    for (const c of [track, arc]) {
      c.setAttribute("cx", "50");
      c.setAttribute("cy", "50");
      c.setAttribute("r", "42");
      c.setAttribute("pathLength", "100");
    }
    track.setAttribute("class", "mo-ring-track");
    arc.setAttribute("class", "mo-ring-arc");
    svg.append(track, arc);
    const middle = M.el("div", "mo-ring-middle");
    const big = M.el(
      "div",
      "mo-ring-value",
      figure(s.value, { ...s, suffix: s.suffix ?? "%" }),
    );
    middle.append(big);
    if (s.label) middle.append(M.el("div", "mo-ring-label", s.label));
    const dial = M.el("div", "mo-ring-dial");
    dial.append(svg, middle);
    node.append(dial);
    if (s.title) node.append(M.el("div", "mo-ring-title", s.title));
    const of = s.of ?? 100;
    return {
      node,
      w: ctx.portrait ? 640 : 680,
      draw(t, at) {
        const u = M.eio((t - at[0]) / 1.3);
        const v = M.lerp(0, s.value, u);
        M.set(arc, "strokeDasharray", `${M.n((v / of) * 100, 3)} 100`);
        M.text(big, figure(v, { ...s, suffix: s.suffix ?? "%" }));
      },
    };
  },
};

PARTS.table = {
  beats: (s) => s.rows.length,
  build(s, ctx) {
    const node = M.el("div", "mo-table");
    if (s.title) node.append(M.el("div", "mo-card-title", s.title));
    const grid = M.el("div", "mo-table-grid");
    grid.style.gridTemplateColumns = `1.6fr ${"1fr ".repeat(s.columns.length - 1)}`;
    for (const h of s.columns) grid.append(M.el("div", "mo-th", h));
    const rows = s.rows.map((r, i) => {
      const cells = r.map((v, k) => {
        const cell = M.el("div", `mo-td${k ? " mo-num" : ""}`, v);
        if (s.highlight === i) cell.classList.add("mo-hot");
        grid.append(cell);
        return cell;
      });
      return cells;
    });
    node.append(grid);
    return {
      node,
      w: ctx.portrait ? 860 : Math.min(1400, 400 + s.columns.length * 200),
      draw(t, at) {
        rows.forEach((cells, i) => {
          cells.forEach((cell, k) => rise(cell, t, at[i] + k * 0.05, 12, 0.3));
          if (s.highlight === i) {
            const on = t >= at.at(-1) + 0.4;
            for (const cell of cells)
              M.set(cell, "background", on ? ctx.c.soft : "transparent");
          }
        });
      },
    };
  },
};

PARTS.timeline = {
  beats: (s) => s.events.length,
  build(s, ctx) {
    const node = M.el("div", `mo-timeline${ctx.portrait ? " mo-steps-v" : ""}`);
    const rail = M.el("div", "mo-rail");
    const fill = M.el("div", "mo-rail-fill");
    rail.append(fill);
    node.append(rail);
    const events = s.events.map((e) => {
      const cell = M.el("div", "mo-event");
      const pin = M.el("div", "mo-pin");
      cell.append(
        M.el("div", "mo-event-when", e.when),
        pin,
        M.el("div", "mo-event-what", e.what),
      );
      node.append(cell);
      return { cell, pin };
    });
    return {
      node,
      w: ctx.portrait ? 700 : Math.min(1600, 200 + s.events.length * 300),
      draw(t, at) {
        const pins = events.map((e) => centreIn(e.pin, node));
        const vertical = ctx.portrait;
        const a = pins[0];
        const b = pins.at(-1);
        const length = vertical ? b.y - a.y : b.x - a.x;
        M.set(
          rail,
          "left",
          M.px(
            vertical
              ? a.x + node.offsetWidth / 2 - 2
              : a.x + node.offsetWidth / 2,
          ),
        );
        M.set(
          rail,
          "top",
          M.px(
            vertical
              ? a.y + node.offsetHeight / 2
              : a.y + node.offsetHeight / 2 - 2,
          ),
        );
        M.set(rail, vertical ? "height" : "width", M.px(length));
        let reach = 0;
        events.forEach(({ cell, pin }, i) => {
          rise(cell, t, at[i] - 0.1, 18, 0.4);
          if (i > 0) reach += M.S(t - at[i], ...M.SLOW);
          const on = t >= at[i];
          M.set(pin, "background", on ? ctx.c.accent : ctx.c.card);
          M.set(pin, "borderColor", on ? ctx.c.accent : ctx.c.line);
        });
        M.set(
          fill,
          vertical ? "height" : "width",
          M.px((reach / Math.max(1, events.length - 1)) * length),
        );
      },
    };
  },
};

PARTS.hub = {
  beats: (s) => s.around.length,
  build(s, ctx) {
    const size = ctx.portrait ? 820 : 900;
    const node = M.el("div", "mo-hub");
    node.style.height = `${size}px`;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    node.append(svg);
    const middle = M.el("div", "mo-hub-core");
    if (s.icon) middle.append(M.icon(s.icon, 56, ctx.c.onDark, 2.4));
    middle.append(M.el("div", "", s.center));
    node.append(middle);
    const R = size * 0.36;
    const spokes = s.around.map((label, i) => {
      const a = -Math.PI / 2 + (i / s.around.length) * Math.PI * 2;
      const x = size / 2 + Math.cos(a) * R;
      const y = size / 2 + Math.sin(a) * R;
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", size / 2);
      line.setAttribute("y1", size / 2);
      line.setAttribute("x2", x);
      line.setAttribute("y2", y);
      line.setAttribute("pathLength", "1");
      line.setAttribute("class", "mo-spoke");
      svg.append(line);
      const chip = M.el("div", "mo-hub-node", label);
      chip.style.left = `${x}px`;
      chip.style.top = `${y}px`;
      node.append(chip);
      return { line, chip };
    });
    return {
      node,
      w: size,
      plain: true,
      draw(t, at) {
        const c = M.S(t - 0.05, 14, 0.7);
        M.set(
          middle,
          "transform",
          `translate(-50%,-50%) scale(${M.n(0.6 + 0.4 * c, 4)})`,
        );
        M.set(middle, "opacity", M.n(M.clamp(c * 1.5)));
        spokes.forEach(({ line, chip }, i) => {
          const p = M.eio((t - at[i]) / 0.45);
          M.set(line, "strokeDashoffset", M.n(1 - p, 4));
          const q = M.S(t - at[i] - 0.3, 14, 0.66);
          M.set(
            chip,
            "transform",
            `translate(-50%,-50%) scale(${M.n(Math.max(0, 0.7 + 0.3 * q), 4)})`,
          );
          M.set(chip, "opacity", M.n(M.clamp(q * 1.6)));
        });
      },
    };
  },
};
