"use client";

import { queryKey } from "@/app/api/query-key";
import { LIVE_PICTURE } from "@/config";
import { viewKindOf } from "@/features/workspace/file-kind";
import { errorToString } from "@/lib/utils";

/**
 * A picture for a spoken call's backend, which the page puts in after the turn's results
 * (live.session): the screen they share (screen-share) or a picture they gave her (`look_at`,
 * use-thursday). A data channel carries one message up to its limit and no more, so the
 * picture is made plainer, then smaller, until it fits (config LIVE_PICTURE). What went wrong
 * otherwise is said as the backend will read it.
 */

export type Taken = { url: string } | { failed: string };

/**
 * `source` as a JPEG data URL of at most `bytes`, or null when even the smallest step is
 * larger. A JPEG has no clear parts: what is clear in a picture is white in it, as a picture
 * with nothing behind it is shown on a page.
 */
export function fitPicture(
  source: CanvasImageSource,
  width: number,
  height: number,
  bytes: number,
): string | null {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not take the picture.");
  for (const scale of LIVE_PICTURE.scales) {
    const ratio = Math.min(
      1,
      (LIVE_PICTURE.longestSide * scale) / Math.max(width, height),
    );
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    for (const quality of LIVE_PICTURE.qualities) {
      const url = canvas.toDataURL("image/jpeg", quality);
      if (url.length <= bytes) return url;
    }
  }
  return null;
}

/** A picture in the workspace, by the path the backend gives, made to fit `bytes`. */
export async function pictureOf(path: string, bytes: number): Promise<Taken> {
  if (viewKindOf(path) !== "image")
    return { failed: `${path} is not an image. Read it in the shell instead.` };
  let response: Response;
  try {
    response = await fetch(queryKey.file(path));
  } catch (cause) {
    return { failed: `${path} could not be read: ${errorToString(cause)}` };
  }
  if (response.status === 404 || response.status === 403)
    return {
      failed: `There is no file at ${path}. Give the path from the workspace root, as \`ls\` shows it.`,
    };
  if (!response.ok)
    return {
      failed: `${path} could not be read: the app answered ${response.status}.`,
    };
  const url = URL.createObjectURL(await response.blob());
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight)
      return { failed: `${path} has no size of its own to draw it at.` };
    const fitted = fitPicture(
      image,
      image.naturalWidth,
      image.naturalHeight,
      bytes,
    );
    return fitted
      ? { url: fitted }
      : {
          failed: `${path} would not fit the ${Math.round(bytes / 1024)} KB this connection carries.`,
        };
  } catch (cause) {
    return {
      failed: `${path} could not be opened as a picture here: ${errorToString(cause)}`,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
