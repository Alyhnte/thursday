"use client";

import { useSyncExternalStore } from "react";
import { SCREEN_SHARE } from "@/config";
import { errorToString } from "@/lib/utils";
import { fitPicture, type Taken } from "./live-picture";

/**
 * The screen the user shares with a spoken call, held in the page until they stop or the call
 * ends. Nothing is sent while it is shared: a picture of it is taken only when the backend asks
 * for one (`look_at_screen`, use-thursday), and goes to the backend alone. The browser asks
 * which screen, window or tab, and only from a press: `share` is called from a click.
 */

type Shared = { stream: MediaStream; video: HTMLVideoElement };

let shared: Shared | null = null;
/**
 * A share the browser is still asking about. Stopped before it answers — the call ended, or
 * Stop was pressed — what it answers is not kept: a capture that outlived its call went on with
 * no Stop but the browser's own bar.
 */
let asking: { wanted: boolean } | null = null;
const listeners = new Set<() => void>();
const changed = () => {
  for (const listener of listeners) listener();
};

/** The shared screen's stream, for the preview; null while nothing is shared. */
export function useSharedScreen(): MediaStream | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => shared?.stream ?? null,
    () => null,
  );
}

export const isSharing = () => shared !== null;

/** Hears sharing start or stop; the call tells her (use-thursday). */
export function onShareChange(listener: (sharing: boolean) => void) {
  const heard = () => listener(shared !== null);
  listeners.add(heard);
  return () => {
    listeners.delete(heard);
  };
}

/** Whether this browser can share a screen at all. */
export const canShare = () =>
  typeof navigator !== "undefined" &&
  typeof navigator.mediaDevices?.getDisplayMedia === "function";

/**
 * Asks the browser to share a screen, window or tab. What the browser refuses — the person
 * closing its picker, or the system's permission to record the screen — rejects with its
 * reason, for the caller to say. A press while it still asks is the same share. Stopping
 * from the browser's own bar ends it here too.
 */
export async function share(): Promise<void> {
  if (shared || asking) return;
  const ask = { wanted: true };
  asking = ask;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      // A still is all that is ever taken; a low rate keeps the capture light
      video: { frameRate: SCREEN_SHARE.frameRate },
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
    track.addEventListener("ended", stopSharing);
  shared = { stream, video };
  changed();
  try {
    await video.play();
  } catch (error) {
    stopSharing();
    throw error;
  }
}

export function stopSharing(): void {
  if (asking) asking.wanted = false;
  if (!shared) return;
  for (const track of shared.stream.getTracks()) track.stop();
  shared.video.srcObject = null;
  shared = null;
  changed();
}

/**
 * Whether the share has shown a frame, waiting up to SCREEN_SHARE.firstFrameMs for the first:
 * the share is kept, and a look can come, before the capture has sent anything.
 */
function shown(video: HTMLVideoElement): Promise<boolean> {
  const has = () => Boolean(video.videoWidth && video.videoHeight);
  if (has()) return Promise.resolve(true);
  return new Promise((done) => {
    const finish = () => {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", finish);
      video.removeEventListener("resize", finish);
      done(has());
    };
    const timer = setTimeout(finish, SCREEN_SHARE.firstFrameMs);
    video.addEventListener("loadeddata", finish);
    video.addEventListener("resize", finish);
  });
}

/**
 * The screen as it is now, as a picture of at most `bytes` (live-picture). What went wrong
 * otherwise, said as the backend will read it.
 */
export async function takePicture(bytes: number): Promise<Taken> {
  const video = shared?.video;
  if (!video) return { failed: "Nothing is being shared." };
  const ready = await shown(video);
  // Stopped while it waited
  if (shared?.video !== video) return { failed: "Nothing is being shared." };
  if (!ready)
    return { failed: "The shared screen has not shown anything yet." };
  try {
    const url = fitPicture(video, video.videoWidth, video.videoHeight, bytes);
    if (url) return { url };
  } catch (cause) {
    return { failed: errorToString(cause) };
  }
  return {
    failed: `The picture of the shared screen would not fit the ${Math.round(bytes / 1024)} KB this connection carries.`,
  };
}
