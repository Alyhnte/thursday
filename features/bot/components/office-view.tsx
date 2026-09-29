"use client";

import { useMemo, useState } from "react";
import { OfficeStage } from "@/features/bot/components/office-stage";
import {
  type OfficeThread,
  officeOf,
  sceneOf,
  watch,
} from "@/features/bot/office";
import type { ThreadView } from "@/features/bot/thread.store";
import { FileViewer } from "@/features/workspace/components/file-view";
import { toDate } from "@/lib/date-like";
import { cn } from "@/lib/utils";

/**
 * The thread open in the room, drawn as an office beside it where her face stands (bot-room):
 * its bots at their desks, the work walked across the floor as it happens, and once it is done,
 * the report at your counter and its files under the job's name. The room beside it is the
 * thread's words and box; pressing a bot here opens its tab there.
 * It fades in as it builds itself, and out while `leaving`, as her face comes back through it.
 */
export function OfficeBackdrop({
  thread,
  leaving = false,
  onBot,
  className,
}: {
  thread: ThreadView;
  /** On its way out: drawn a moment longer, fading, and out of reach (bot-room useLeaving). */
  leaving?: boolean;
  /** A bot pressed in the office: the room opens its tab (bot-room). */
  onBot?: (bot: string) => void;
  className?: string;
}) {
  return (
    <div
      inert={leaving}
      className={cn(
        "flex animate-in fade-in duration-300",
        className,
        leaving &&
          "pointer-events-none opacity-0 transition-opacity duration-250 ease-in",
      )}
    >
      {/* Another thread builds its own office from the start */}
      <Office key={thread.id} thread={thread} onBot={onBot} />
    </div>
  );
}

function Office({
  thread,
  onBot,
}: {
  thread: ThreadView;
  onBot?: (bot: string) => void;
}) {
  const start = toDate(thread.createdAt).getTime();
  const office = useMemo(() => officeOf(thread), [thread]);
  const memory = useWatched(office, start);
  const scene = useMemo(() => sceneOf(office, memory), [office, memory]);
  return (
    // what the counter holds opens as the room's files do; what is dropped here is the thread's,
    // as on the room (given-files roomDrop)
    <FileViewer>
      <OfficeStage
        scene={scene}
        start={start}
        label={thread.label}
        faces={thread.roster}
        from={thread.id}
        onBot={onBot}
        className="min-h-0 min-w-0 flex-1"
      />
    </FileViewer>
  );
}

/**
 * The office's memory of the thread (office `watch`), read again whenever the thread changes:
 * kept from one render to the next as React keeps a value read off a prop that changed.
 */
function useWatched(office: OfficeThread, start: number) {
  const [seen, setSeen] = useState(() => ({
    office,
    memory: watch(null, office, (Date.now() - start) / 1000),
  }));
  if (seen.office === office) return seen.memory;
  const next = {
    office,
    memory: watch(seen.memory, office, (Date.now() - start) / 1000),
  };
  setSeen(next);
  return next.memory;
}
