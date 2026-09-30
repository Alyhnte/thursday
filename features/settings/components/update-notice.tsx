"use client";

import { useEffect, useRef } from "react";
import { queryKey } from "@/app/api/query-key";
import { toast } from "@/components/ui/toast";
import { useServerRoute } from "@/lib/protocol/use-server-route";
import { openSettings } from "../settings.store";
import type { Update } from "../update";
import { closeUpdateNoticeAction } from "../update.action";
import { followUpdate, moveTo, useUpdateStore } from "../update.store";

/**
 * Says a newer version as the app opens: a notice at the top with the button, which stays
 * until it is pressed or closed, and closed stays away for a day (config UPDATE.quietMs) in
 * every tab. Reading it is also what asks npm, at most once a day, so nothing is asked while
 * no browser is open. Loaded with the app and draws nothing of its own; `quiet` holds it back
 * over the intro.
 */
export function UpdateNotice({ quiet }: { quiet: boolean }) {
  // The server is down for a moment during a move: a read that fails then is not news
  const { data } = useServerRoute<Update>(queryKey.update, {
    onError: () => {},
  });
  const { to, failed } = useUpdateStore();

  // A move another tab started, or one under way as this page loaded
  const going = data?.moving && !data.moving.failed ? data.moving.to : null;
  useEffect(() => {
    if (going) void followUpdate(going);
  }, [going]);

  const said = useRef<string | null>(null);
  const notice = useRef<string | null>(null);
  const newer = data?.notice ? data.newer : null;
  const current = data?.current ?? null;
  const byButton = data?.byButton ?? false;
  useEffect(() => {
    if (quiet || !newer || going || said.current === newer) return;
    said.current = newer;
    notice.current = toast.add({
      title: `Thursday ${newer} is out`,
      description: `You run ${current}. Closing this hides it for a day.`,
      timeout: 0,
      actionProps: byButton
        ? { children: "Update", onClick: () => void moveTo(newer) }
        : {
            children: "How to update",
            onClick: () => openSettings("thursday"),
          },
      onClose: () => void closeUpdateNoticeAction(),
    });
  }, [quiet, newer, current, byButton, going]);

  const moving = useRef<string | null>(null);
  useEffect(() => {
    // Pressed in Settings with the notice still up: its button would ask for the same move
    if (to && notice.current) {
      toast.close(notice.current);
      notice.current = null;
    }
    if (to && !moving.current)
      moving.current = toast.add({
        type: "loading",
        title: `Updating to ${to}…`,
        description: "Thursday restarts in a moment.",
        timeout: 0,
      });
    if (!to && moving.current) {
      toast.close(moving.current);
      moving.current = null;
    }
  }, [to]);

  useEffect(() => {
    if (!failed) return;
    toast.add({
      type: "error",
      title: `Could not update to ${failed.to}`,
      description: failed.why.split("\n").at(-1),
      timeout: 0,
      actionProps: {
        children: "How to update",
        onClick: () => openSettings("thursday"),
      },
    });
  }, [failed]);

  return null;
}
