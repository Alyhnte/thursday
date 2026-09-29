"use client";

import { queryKey } from "@/app/api/query-key";
import { CALL_PICTURE } from "@/config";

/**
 * A picture put down on a spoken call — a file, or a drawing — made to fit the connection and
 * handed to the backend as it lands (use-thursday putDown).
 */

/**
 * `source` as a JPEG data URL of at most `bytes`: a data channel carries one message up to its
 * limit and no more, so the picture is made plainer, then smaller, until it fits (config
 * CALL_PICTURE). `draw` when the browser gives no canvas to draw on, `fit` when even the smallest
 * is too big.
 */
function fitPicture(
  source: CanvasImageSource,
  width: number,
  height: number,
  bytes: number,
): { url: string } | { failed: "draw" | "fit" } {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return { failed: "draw" };
  for (const scale of CALL_PICTURE.scales) {
    const ratio = Math.min(
      1,
      (CALL_PICTURE.longestSide * scale) / Math.max(width, height),
    );
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    // A JPEG keeps no transparency, and what is transparent comes out black: a picture with
    // a clear ground is laid on white, as a page shows it
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    for (const quality of CALL_PICTURE.qualities) {
      const url = canvas.toDataURL("image/jpeg", quality);
      if (url.length <= bytes) return { url };
    }
  }
  return { failed: "fit" };
}

/**
 * A picture kept in the workspace, read through the file route and made to fit `bytes`
 * (fitPicture). What went wrong otherwise, said as the backend will read it: the path it gave,
 * the file that is not a picture, the route's own refusal.
 */
export async function pictureOfFile(
  path: string,
  bytes: number,
): Promise<{ url: string } | { failed: string }> {
  let response: Response;
  try {
    response = await fetch(queryKey.file(path));
  } catch (cause) {
    return { failed: `${path} could not be read: ${String(cause)}` };
  }
  if (response.status === 404)
    return {
      failed: `There is no file at ${path}. Give the path from the workspace root, as \`ls\` shows it.`,
    };
  if (response.status === 403)
    return { failed: `${path} is outside the workspace.` };
  if (!response.ok)
    return {
      failed: `${path} could not be read: the file route answered ${response.status}.`,
    };
  const blob = await response.blob();
  if (!blob.type.startsWith("image/"))
    return { failed: `${path} is not an image. Read it in the shell instead.` };
  const image = await createImageBitmap(blob).catch(() => null);
  if (!image)
    return {
      failed: `${path} could not be drawn as a picture: a png, jpg, webp or gif can.`,
    };
  try {
    const taken = fitPicture(image, image.width, image.height, bytes);
    if ("url" in taken) return taken;
    return {
      failed:
        taken.failed === "draw"
          ? "This browser could not draw the picture."
          : `${path} would not fit the ${Math.round(bytes / 1024)} KB this connection carries, even made smaller.`,
    };
  } finally {
    image.close();
  }
}
