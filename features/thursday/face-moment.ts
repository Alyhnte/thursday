"use client";

import { useSyncExternalStore } from "react";
import type { DrawColor } from "./ascii.const";
import type { HereScene } from "./components/here-globe";

/**
 * What stands over her face for a few seconds on a call, drawn in her own glyphs: the globe the
 * day's first call opens with (here-globe), a picture handed to her (seeing), or one she draws
 * (her-drawing). One at a time: one that comes while another is up is not drawn, as only the
 * first of several pictures is. While one is up no word goes on her face (use-thursday): `emote`
 * and `draw` are told so and the page's own words are let go, so none is drawn under it or cut
 * short by it. It plays only while the page is looked at: one left behind would come back
 * minutes later, over the conversation.
 */

export type Moment =
  | { kind: "here"; scene: HereScene }
  /** `src` is where the page reads the picture (the file route). */
  | { kind: "see"; src: string }
  /** `path` is an SVG path in a 100 × 100 box (svg-path), drawn in her emoji of `color`. */
  | { kind: "draw"; path: string; color: DrawColor };

/**
 * Where one has got to, for the page around it: `covering` from its first frame, as it spreads
 * through her, `world` once she is wholly covered (her face stops drawing), `back` as she comes
 * back (her face returns under it), `done` when it is gone or cannot be drawn.
 */
export type MomentPhase = "covering" | "world" | "back" | "done";

export type MomentUp = {
  moment: Moment;
  /** As it last said; null before it has drawn anything. */
  phase: MomentPhase | null;
  /** Which one this is, so a late word from one gone never moves the next. */
  id: number;
};

let up: MomentUp | null = null;
let count = 0;
const listeners = new Set<() => void>();
const changed = () => {
  for (const listener of listeners) listener();
};
const hidden = () => {
  if (document.visibilityState === "hidden") faceMoment.clear();
};

export const faceMoment = {
  /**
   * Puts one over her face; false, and nothing drawn, while another is up, while nobody looks,
   * or where the system asks for less motion.
   */
  show(moment: Moment): boolean {
    if (
      up ||
      document.visibilityState !== "visible" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return false;
    up = { moment, phase: null, id: ++count };
    document.addEventListener("visibilitychange", hidden);
    changed();
    return true;
  },
  /** What the one up says of itself as it goes; `done` takes it down. */
  tell(id: number, phase: MomentPhase) {
    if (!up || up.id !== id || up.phase === phase) return;
    if (phase === "done") return faceMoment.clear();
    up = { ...up, phase };
    changed();
  },
  /** Takes down whatever is up: the call it came with is over, or the page was left. */
  clear() {
    if (!up) return;
    up = null;
    document.removeEventListener("visibilitychange", hidden);
    changed();
  },
  /** What is up now, for a gate that cannot wait for a render (`emote`). */
  current(): MomentUp | null {
    return up;
  },
};

/** What is over her face now; null while nothing is. */
export function useFaceMoment(): MomentUp | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => up,
    () => null,
  );
}
