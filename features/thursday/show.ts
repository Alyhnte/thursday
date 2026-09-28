"use client";

import { useSyncExternalStore } from "react";
import { SHOWING } from "@/config";

/**
 * What the user shows a spoken call — a screen, a window or a tab, or their camera — held in
 * the page until they stop or the call ends. One at a time. Nothing streams while it is shown:
 * a picture of it is taken only when the backend asks for one (`look_at_shared`, use-thursday),
 * and goes to the backend alone. The browser asks which screen, or for the camera, and only from a press: `show` is
 * called from a click.
 */

export type ShownKind = "screen" | "camera";

type Shown = {
  kind: ShownKind;
  stream: MediaStream;
  video: HTMLVideoElement;
};

let shown: Shown | null = null;
/**
 * What the browser is still asking about. Stopped before it answers — the call ended, or
 * Stop was pressed — what it answers is not kept: a capture that outlived its call went on with
 * no Stop but the browser's own bar.
 */
let asking: { wanted: boolean } | null = null;
type View = { kind: ShownKind; stream: MediaStream };
let view: View | null = null;
const listeners = new Set<() => void>();
const changed = () => {
  view = shown ? { kind: shown.kind, stream: shown.stream } : null;
  for (const listener of listeners) listener();
};

/** What is shown, for the preview; null while nothing is. */
export function useShown(): View | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => view,
    () => null,
  );
}

export const shownKind = (): ShownKind | null => shown?.kind ?? null;

/** Hears what is shown change, and what was shown before; the call tells her (use-thursday). */
export function onShownChange(
  listener: (now: ShownKind | null, before: ShownKind | null) => void,
) {
  let before = shownKind();
  const heard = () => {
    const now = shownKind();
    if (now === before) return;
    const was = before;
    before = now;
    listener(now, was);
  };
  listeners.add(heard);
  return () => {
    listeners.delete(heard);
  };
}

/** Whether this browser can show her a screen, or its camera, at all. */
export const canShow = (kind: ShownKind) =>
  typeof navigator !== "undefined" &&
  typeof (kind === "screen"
    ? navigator.mediaDevices?.getDisplayMedia
    : navigator.mediaDevices?.getUserMedia) === "function";

/**
 * Asks the browser for a screen, window or tab, or for the camera. What the browser refuses —
 * the person closing its picker, or the system's permission to record the screen or use the
 * camera — rejects with its reason, for the caller to say. A press while it still asks, or
 * while something is shown, does nothing: one is shown at a time. Stopping from the browser's
 * own bar ends it here too.
 */
export async function show(kind: ShownKind): Promise<void> {
  if (shown || asking) return;
  const ask = { wanted: true };
  asking = ask;
  let stream: MediaStream;
  try {
    // A still is all that is ever taken; a low rate keeps the capture light
    stream =
      kind === "screen"
        ? await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: SHOWING.frameRate },
            audio: false,
          })
        : await navigator.mediaDevices.getUserMedia({
            video: { frameRate: SHOWING.frameRate },
            audio: false,
          });
  } finally {
    asking = null;
  }
  if (!ask.wanted) {
    for (const track of stream.getTracks()) track.stop();
    return;
  }
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  // Kept before anything is awaited, so Stop, the call's end and the browser's bar all reach
  // it: one kept only once it played went on uncaught when it never did
  for (const track of stream.getVideoTracks())
    track.addEventListener("ended", () => {
      if (shown?.stream === stream) stopShowing();
    });
  shown = { kind, stream, video };
  changed();
  try {
    await video.play();
  } catch (error) {
    stopShowing();
    throw error;
  }
}

export function stopShowing(): void {
  if (asking) asking.wanted = false;
  if (!shown) return;
  for (const track of shown.stream.getTracks()) track.stop();
  shown.video.srcObject = null;
  shown = null;
  changed();
}

/**
 * Whether what is shown has shown a frame, waiting up to SHOWING.firstFrameMs for the first:
 * it is kept, and a look can come, before the capture has sent anything.
 */
function framed(video: HTMLVideoElement): Promise<boolean> {
  const has = () => Boolean(video.videoWidth && video.videoHeight);
  if (has()) return Promise.resolve(true);
  return new Promise((done) => {
    const finish = () => {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", finish);
      video.removeEventListener("resize", finish);
      done(has());
    };
    const timer = setTimeout(finish, SHOWING.firstFrameMs);
    video.addEventListener("loadeddata", finish);
    video.addEventListener("resize", finish);
  });
}

/**
 * What is shown as it is now, as a JPEG data URL of at most `bytes`: a data channel carries
 * one message up to its limit and no more, so the picture is made plainer, then smaller, until
 * it fits (config SHOWING). What went wrong otherwise, said as the backend will read it.
 */
export async function takePicture(
  bytes: number,
): Promise<{ url: string; kind: ShownKind } | { failed: string }> {
  const taking = shown;
  if (!taking) return { failed: "Nothing is being shown." };
  const { video, kind } = taking;
  const ready = await framed(video);
  // Stopped while it waited
  if (shown !== taking) return { failed: "Nothing is being shown." };
  if (!ready) return { failed: `Their ${kind} has not shown anything yet.` };
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return { failed: "This browser could not take the picture." };
  for (const scale of SHOWING.scales) {
    const ratio = Math.min(
      1,
      (SHOWING.longestSide * scale) /
        Math.max(video.videoWidth, video.videoHeight),
    );
    canvas.width = Math.round(video.videoWidth * ratio);
    canvas.height = Math.round(video.videoHeight * ratio);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    for (const quality of SHOWING.qualities) {
      const url = canvas.toDataURL("image/jpeg", quality);
      if (url.length <= bytes) return { url, kind };
    }
  }
  return {
    failed: `The picture of their ${kind} would not fit the ${Math.round(bytes / 1024)} KB this connection carries.`,
  };
}
