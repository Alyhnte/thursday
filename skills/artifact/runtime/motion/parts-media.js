// Things shown as they are used: a phone and a browser with something on their screens, a
// name that assembles into a mark, a grid of what something does, a name under a speaker,
// and a picture before and after.

/** What a screen holds: messages, a list, or a picture from the video's folder. */
function screenOf(s, ctx) {
  const screen = M.el("div", "mo-screen");
  const beats = [];
  if (s.image) {
    const img = M.el("img", "mo-screen-img");
    img.src = s.image;
    img.alt = "";
    screen.append(img);
  }
  for (const m of s.messages ?? []) {
    const wrap = M.el(
      "div",
      `mo-msg ${m.from === "them" ? "mo-them" : "mo-me"}`,
    );
    const bubble = M.el("div", "mo-bubble", m.text);
    wrap.append(bubble);
    screen.append(wrap);
    beats.push(bubble);
  }
  for (const it of (s.items ?? []).map(item)) {
    const row = M.el("div", "mo-screen-row");
    if (it.icon) row.append(M.icon(it.icon, 30, ctx.c.ink));
    row.append(M.el("span", "", it.text));
    screen.append(row);
    beats.push(row);
  }
  return { screen, beats };
}

PARTS.phone = {
  beats: (s) => (s.messages ?? s.items ?? []).length,
  build(s, ctx) {
    const node = M.el("div", "mo-device-stage");
    const phone = M.el("div", "mo-phone");
    const bar = M.el("div", "mo-phone-bar");
    bar.append(M.el("span", "", s.time ?? "9:41"), M.el("i"));
    if (s.app) bar.append(M.el("span", "mo-phone-app", s.app));
    const { screen, beats } = screenOf(s, ctx);
    phone.append(bar, screen);
    node.append(phone);
    if (s.caption) node.append(rich(s.caption, "mo-device-cap").line);
    const cap = s.caption ? node.lastChild : null;
    return {
      node,
      w: ctx.portrait ? 700 : 1100,
      plain: true,
      draw(t, at) {
        // It turns to face you as it rises: a little perspective, settling flat
        const p = M.S(t - 0.05, 9, 0.85);
        const tilt = s.tilt === false ? 0 : 1;
        M.set(
          phone,
          "transform",
          `perspective(1400px) translateY(${M.px((1 - p) * 120)}) rotateY(${M.n(tilt * (1 - p) * -18 - tilt * 6, 2)}deg) rotateX(${M.n(tilt * 4, 2)}deg)`,
        );
        M.set(phone, "opacity", M.n(M.clamp(p * 1.4)));
        beats.forEach((b, i) => rise(b, t, at[i], 16, 0.32));
        if (cap) rise(cap, t, 0.4, 16);
      },
    };
  },
};

PARTS.browser = {
  beats: (s) => 1 + (s.items ?? []).length,
  build(s, ctx) {
    const node = M.el("div", "mo-browser");
    const top = M.el("div", "mo-browser-top");
    top.append(M.el("i"), M.el("i"), M.el("i"));
    const url = M.el("div", "mo-browser-url");
    url.append(M.icon("lock", 20, ctx.c.muted, 2.4));
    const typed = M.el("span");
    url.append(typed);
    top.append(url);
    const page = M.el("div", "mo-browser-page");
    if (s.title) page.append(M.el("div", "mo-browser-h", s.title));
    const { screen, beats } = screenOf({ ...s, messages: undefined }, ctx);
    page.append(screen);
    const load = M.el("div", "mo-browser-load");
    node.append(top, load, page);
    return {
      node,
      w: ctx.portrait ? 860 : 1320,
      draw(t, at) {
        // The address is typed, the page loads under a thin bar, then what is on it comes in
        M.text(typed, M.typed(s.url, t, 0.2, 30));
        const loaded = at[0];
        const bar = M.clamp((t - loaded + 0.5) / 0.5);
        M.set(load, "transform", `scaleX(${M.n(bar)})`);
        M.set(
          load,
          "opacity",
          t < loaded + 0.25 ? "1" : M.n(1 - M.clamp((t - loaded - 0.25) / 0.2)),
        );
        rise(page, t, loaded, 18, 0.4);
        beats.forEach((b, i) => rise(b, t, at[i + 1], 14, 0.3));
      },
    };
  },
};

PARTS.logo = {
  beats: () => 0,
  build(s, ctx) {
    const node = M.el("div", "mo-logo");
    const mark = M.el("div", "mo-logo-mark");
    if (s.image) {
      const img = M.el("img");
      img.src = s.image;
      img.alt = "";
      mark.append(img);
      mark.classList.add("mo-logo-img");
    } else if (s.bot) mark.append(face(s.bot, 150, s.color).svg);
    else mark.append(M.icon(s.icon ?? "sparkle", 96, ctx.c.onAccent, 2.6));
    const name = M.el("div", "mo-logo-name");
    const letters = [...s.name].map((ch) => {
      const span = M.el("span", "", ch);
      name.append(span);
      return span;
    });
    const lock = M.el("div", "mo-logo-lock");
    lock.append(mark, name);
    node.append(lock);
    const tag = s.tagline ? M.el("div", "mo-sub", s.tagline) : null;
    if (tag) node.append(tag);
    return {
      node,
      w: ctx.portrait ? 880 : 1300,
      plain: true,
      draw(t) {
        // The mark lands first in the middle, then slides aside for the name to come in
        const pop = M.S(t - 0.05, 13, 0.6);
        const aside = M.S(t - 0.55, ...M.MORPH);
        const shift = (name.offsetWidth / 2 + 18) * (1 - aside);
        M.set(
          mark,
          "transform",
          `translateX(${M.px(shift)}) scale(${M.n(Math.max(0, pop), 4)})`,
        );
        letters.forEach((l, i) => {
          const a = M.eo((t - 0.7 - i * 0.03) / 0.45);
          M.set(l, "opacity", M.n(a));
          M.set(l, "transform", `translateX(${M.px((1 - a) * -24)})`);
          M.set(
            l,
            "filter",
            a < 0.99 ? `blur(${M.n((1 - a) * 8, 1)}px)` : "none",
          );
        });
        if (tag) rise(tag, t, 0.95 + letters.length * 0.03, 12);
      },
    };
  },
};

PARTS.grid = {
  beats: (s) => s.items.length,
  build(s, ctx) {
    const node = M.el("div", "mo-grid");
    if (s.title) node.append(M.el("div", "mo-grid-title", s.title));
    const wrap = M.el("div", "mo-grid-cells");
    const cols = ctx.portrait
      ? 2
      : Math.min(4, s.items.length <= 4 ? s.items.length : 3);
    wrap.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    const cells = s.items.map((it) => {
      const cell = M.el("div", "mo-tile");
      const ic = M.el("div", "mo-tile-icon");
      ic.append(M.icon(it.icon ?? "sparkle", 38, ctx.c.accent, 2.4));
      cell.append(ic, M.el("div", "mo-tile-title", it.title));
      if (it.text) cell.append(M.el("div", "mo-tile-text", it.text));
      wrap.append(cell);
      return cell;
    });
    node.append(wrap);
    return {
      node,
      w: ctx.portrait ? 900 : Math.min(1600, 220 + cols * 360),
      plain: true,
      draw(t, at) {
        cells.forEach((cell, i) => {
          const p = M.S(t - at[i], 15, 0.75);
          M.set(
            cell,
            "transform",
            `translateY(${M.px((1 - p) * 50)}) scale(${M.n(0.94 + 0.06 * p, 4)})`,
          );
          M.set(cell, "opacity", M.n(M.clamp(p * 1.6)));
        });
      },
    };
  },
};

PARTS.lower = {
  beats: () => 0,
  build(s, ctx) {
    const node = M.el("div", "mo-lower");
    const bar = M.el("div", "mo-lower-bar");
    const text = M.el("div", "mo-lower-text");
    text.append(M.el("div", "mo-lower-name", s.name));
    if (s.role) text.append(M.el("div", "mo-lower-role", s.role));
    node.append(bar, text);
    return {
      node,
      w: ctx.portrait ? 760 : 900,
      draw(t) {
        // An accent bar grows, and the name slides out from behind it
        const g = M.eio((t - 0.05) / 0.35);
        M.set(bar, "transform", `scaleY(${M.n(g)})`);
        const a = M.eo((t - 0.3) / 0.5);
        M.set(text, "clipPath", `inset(0 ${M.n((1 - a) * 100, 1)}% 0 0)`);
        M.set(text, "transform", `translateX(${M.px((1 - a) * -40)})`);
      },
    };
  },
};

PARTS.beforeafter = {
  beats: () => 1,
  build(s, ctx) {
    const node = M.el("div", "mo-ba");
    const w = ctx.portrait ? 900 : 1360;
    const [rw, rh] = String(s.ratio ?? (ctx.portrait ? "4:5" : "16:9"))
      .split(":")
      .map(Number);
    const h = Math.round((w * rh) / rw);
    const frame = M.el("div", "mo-ba-frame");
    frame.style.height = `${h}px`;
    // After underneath, whole; before over it, cut to the left of the line
    const after = M.el("img", "mo-ba-img");
    after.src = s.after;
    const beforeBox = M.el("div", "mo-ba-before");
    const before = M.el("img", "mo-ba-img");
    before.src = s.before;
    before.style.width = `${w}px`;
    beforeBox.append(before);
    const handle = M.el("div", "mo-ba-handle");
    handle.append(M.el("i"));
    const tags = [
      M.el("div", "mo-ba-tag", s.beforeLabel ?? "Before"),
      M.el("div", "mo-ba-tag mo-ba-tag-r", s.afterLabel ?? "After"),
    ];
    frame.append(after, beforeBox, handle, ...tags);
    node.append(frame);
    for (const img of [before, after]) img.alt = "";
    return {
      node,
      w,
      r: 32,
      draw(t, at) {
        // The line sweeps from the right across, showing more and more of after
        const p = M.eio((t - at[0]) / 1.2);
        const x = M.lerp(0.94, 0.38, p);
        M.set(beforeBox, "width", `${M.n(x * 100, 2)}%`);
        M.set(handle, "left", `${M.n(x * 100, 2)}%`);
      },
    };
  },
};
