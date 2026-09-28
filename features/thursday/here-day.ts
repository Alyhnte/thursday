import { format } from "date-fns";

// The globe (components/here-globe) plays once a day, as the first call it can open with
// does: this browser keeps which day that was. The page's own convenience, like a muted
// intro: nothing about it reaches the server.

/** Where the day it last played is kept. */
const SHOWN_KEY = "thursday.here.shown";

/** The day as the globe counts them: this device's own date, turning at its midnight. */
export const hereDay = (now: Date) => format(now, "yyyy-MM-dd");

/** The same, in memory: a browser that keeps nothing still plays it once a visit, not every call. */
let shownOn: string | null = null;

/** Whether the globe has yet to play today on this browser. */
export function hereDue(now = new Date()): boolean {
  const today = hereDay(now);
  if (shownOn === today) return false;
  try {
    return window.localStorage.getItem(SHOWN_KEY) !== today;
  } catch {
    return true;
  }
}

/** It played today: written as it starts, so a call that failed to open leaves the day unspent. */
export function hereShown(now = new Date()) {
  shownOn = hereDay(now);
  try {
    window.localStorage.setItem(SHOWN_KEY, shownOn);
  } catch {
    // blocked storage: the day is kept in memory until the page goes
  }
}
