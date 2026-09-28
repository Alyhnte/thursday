// Words that move: a line that builds itself, word by word or letter by letter, and the one
// word that matters marked the way a hand would — a marker, an underline, a ring, a strike.
// `*word*` in any text marks it. Timing follows the studies of kinetic type the skill's
// README credits: words ~70 ms apart, letters ~25 ms, a typed letter ~35 ms.

/** Text with its `*marked*` parts as spans of their own. */
function rich(text, cls = "") {
  const line = M.el("div", cls);
  const marks = [];
  const wordEls = [];
  String(text)
    .split(/(\*[^*]+\*)/)
    .filter(Boolean)
    .forEach((part) => {
      const marked = /^\*[^*]+\*$/.test(part);
      const body = marked ? part.slice(1, -1) : part;
      const host = marked ? M.el("span", "mo-em") : line;
      if (marked) {
        const ink = M.el("span", "mo-em-mark");
        host.append(ink);
        marks.push({ host, ink });
        line.append(host);
      }
      for (const w of body.split(/(\s+)/).filter((x) => x.length)) {
        if (/^\s+$/.test(w)) host.append(document.createTextNode(w));
        else {
          const span = M.el("span", "mo-word", w);
          host.append(span);
          wordEls.push(span);
        }
      }
    });
  return { line, words: wordEls, marks };
}

/** A mark drawn over `p` (0 → 1): how it is drawn is the scene's `mark`. */
function drawMark(m, style, p, ctx) {
  const { host, ink } = m;
  if (style === "color") {
    M.set(host, "color", p > 0.5 ? ctx.c.accent : "");
    return;
  }
  if (style === "circle") {
    if (!ink.firstChild) {
      // A ring drawn once around the word, a little wider than it and not quite closed
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 100 40");
      svg.setAttribute("preserveAspectRatio", "none");
      const path = document.createElementNS(ns, "path");
      path.setAttribute(
        "d",
        "M 88 9 C 72 1 20 2 7 14 C -2 24 12 36 46 37 C 80 38 99 30 96 18 C 94 10 80 6 60 5",
      );
      path.setAttribute("pathLength", "1");
      svg.append(path);
      ink.append(svg);
      ink.classList.add("mo-em-ring");
    }
    M.set(ink.firstChild.firstChild, "strokeDashoffset", M.n(1 - p));
    return;
  }
  ink.className = `mo-em-mark mo-em-${style}`;
  M.set(ink, "transform", `scaleX(${M.n(p)})`);
}

/** How big a line is set: the fewer its letters, the larger. */
function sizeFor(text, ctx) {
  const n = String(text).replace(/\*/g, "").length;
  const big = n <= 18 ? 150 : n <= 40 ? 112 : n <= 80 ? 86 : 66;
  return ctx.portrait ? Math.round(big * 0.96) : big;
}

// Letters a decoding word passes through before it lands
const SCRAMBLE = "!<>-_\\/[]{}=+*^?#0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

PARTS.text = {
  beats: (s) => (s.style === "slam" ? s.text.split(/\s+/).length : 1),
  build(s, ctx) {
    const style = s.style ?? "rise";
    const node = M.el("div", "mo-text");
    node.style.fontSize = `${sizeFor(s.text, ctx)}px`;
    if (s.kicker) node.append(M.el("div", "mo-kicker", s.kicker));
    const body = rich(s.text, "mo-text-line");
    node.append(body.line);
    if (s.sub) node.append(M.el("div", "mo-sub", s.sub));
    const kicker = s.kicker ? node.firstChild : null;
    const sub = s.sub ? node.lastChild : null;
    const letters = [];
    if (style === "blur" || style === "decode" || style === "type")
      for (const w of body.words) {
        const text = w.textContent;
        w.textContent = "";
        for (const ch of text) {
          const span = M.el("span", "mo-char", ch);
          w.append(span);
          letters.push({ span, ch });
        }
      }
    const caret = style === "type" ? M.el("span", "mo-caret") : null;
    return {
      node,
      w: ctx.portrait ? 880 : 1480,
      plain: !s.card,
      draw(t, at) {
        if (kicker) rise(kicker, t, 0.05, 14);
        let done = 0.3;
        if (style === "rise") {
          body.words.forEach((w, i) => rise(w, t, 0.15 + i * 0.075, 28, 0.5));
          done = 0.15 + body.words.length * 0.075 + 0.35;
        } else if (style === "slam") {
          body.words.forEach((w, i) => {
            const a = M.clamp((t - at[i]) / 0.05);
            const punch = M.S(t - at[i], 22, 0.55);
            M.set(w, "opacity", M.n(a));
            M.set(w, "transform", `scale(${M.n(1.35 - 0.35 * punch, 4)})`);
          });
          done = at.at(-1) + 0.3;
        } else if (style === "mask") {
          body.words.forEach((w, i) => {
            const a = M.eo((t - 0.1 - i * 0.05) / 0.55);
            M.set(
              w,
              "clipPath",
              a < 1 ? `inset(0 0 ${M.n((1 - a) * 100, 1)}% 0)` : "none",
            );
            M.set(w, "transform", `translateY(${M.n((1 - a) * 60, 1)}%)`);
          });
          done = 0.1 + body.words.length * 0.05 + 0.5;
        } else if (style === "blur") {
          letters.forEach(({ span }, i) => {
            const a = M.eo((t - 0.1 - i * 0.025) / 0.7);
            M.set(span, "opacity", M.n(a));
            M.set(
              span,
              "filter",
              a < 0.99 ? `blur(${M.n((1 - a) * 12, 1)}px)` : "none",
            );
            M.set(span, "transform", `translateY(${M.px((1 - a) * 16)})`);
          });
          done = 0.1 + letters.length * 0.025 + 0.5;
        } else if (style === "type") {
          const n = Math.max(0, Math.floor((t - 0.15) / 0.035));
          letters.forEach(({ span }, i) =>
            M.set(span, "visibility", i < n ? "visible" : "hidden"),
          );
          const last =
            letters[Math.min(n, letters.length) - 1]?.span ?? letters[0].span;
          M.move(caret, last.parentNode);
          M.set(caret, "opacity", Math.floor(t * 2.2) % 2 ? "0" : "1");
          done = 0.15 + letters.length * 0.035 + 0.2;
        } else if (style === "decode") {
          letters.forEach(({ span, ch }, i) => {
            const land = 0.2 + i * 0.03 + 0.35;
            const shown = t >= 0.1 + i * 0.012;
            M.set(span, "opacity", shown ? "1" : "0");
            const k = Math.floor(t * 24);
            M.text(
              span,
              t >= land || /\s/.test(ch)
                ? ch
                : SCRAMBLE[Math.floor(M.hash(i, k) * SCRAMBLE.length)],
            );
            M.set(span, "color", t >= land ? "" : ctx.c.muted);
          });
          done = 0.2 + letters.length * 0.03 + 0.4;
        }
        const markAt = Math.max(at[0] ?? 0, done);
        body.marks.forEach((m, i) =>
          drawMark(
            m,
            s.mark ?? "marker",
            M.eio((t - markAt - i * 0.15) / 0.45),
            ctx,
          ),
        );
        if (sub) rise(sub, t, done, 14);
      },
    };
  },
};

PARTS.swap = {
  beats: (s) => s.words.length - 1,
  build(s, ctx) {
    const node = M.el("div", "mo-text mo-swap");
    node.style.fontSize = `${sizeFor(`${s.before ?? ""} ${s.words[0]} ${s.after ?? ""}`, ctx)}px`;
    const line = M.el("div", "mo-text-line");
    const before = s.before
      ? M.el("span", "mo-swap-fixed", `${s.before} `)
      : null;
    const slot = M.el("span", "mo-swap-slot");
    const reel = M.el("span", "mo-swap-reel");
    const cells = s.words.map((w) => {
      const cell = M.el("span", "mo-swap-word", w);
      reel.append(cell);
      return cell;
    });
    slot.append(reel);
    const after = s.after ? M.el("span", "mo-swap-fixed", ` ${s.after}`) : null;
    if (before) line.append(before);
    line.append(slot);
    if (after) line.append(after);
    node.append(line);
    let widths;
    let height;
    return {
      node,
      w: ctx.portrait ? 900 : 1480,
      plain: true,
      draw(t, at) {
        if (!widths) {
          widths = cells.map((c) => c.offsetWidth);
          height = cells[0].offsetHeight;
        }
        const pos = M.track(
          0,
          at.map((a, i) => [a, i + 1]),
        )(t);
        const wide = M.track(
          widths[0],
          at.map((a, i) => [a, widths[i + 1]]),
        )(t);
        M.set(slot, "width", M.px(wide));
        M.set(slot, "height", M.px(height));
        M.set(reel, "transform", `translateY(${M.px(-pos * height)})`);
        cells.forEach((c, i) =>
          M.set(c, "opacity", M.n(M.clamp(1 - Math.abs(pos - i) * 1.4))),
        );
        if (before) rise(before, t, 0.1, 20);
        rise(slot, t, 0.18, 20);
        if (after) rise(after, t, 0.26, 20);
      },
    };
  },
};
