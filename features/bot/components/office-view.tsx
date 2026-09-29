"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

/**
 * The thread open in the room, drawn as an office beside it where her face stands (bot-room):
 * its bots at their desks, the work walked across the floor as it happens, and once it is done,
 * the report and its files at your counter. The room beside it is the thread's words and box.
 */
export function OfficeBackdrop({
  thread,
  className,
}: {
  thread: ThreadView;
  className?: string;
}) {
  // Another thread builds its own office from the start
  return <Office key={thread.id} thread={thread} className={className} />;
}

function Office({
  thread,
  className,
}: {
  thread: ThreadView;
  className?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const start = toDate(thread.createdAt).getTime();
  const office = useMemo(() => officeOf(thread), [thread]);
  const memory = useWatched(office, start);
  const scene = useMemo(() => sceneOf(office, memory), [office, memory]);
  const { t, built, setBuilt } = useOfficeClock(start);
  const pick = useCallback(
    (bot: string) => setSelected((was) => (was === bot ? null : bot)),
    [],
  );
  return (
    // what the counter holds opens as the room's files do; what is dropped here is the thread's,
    // as on the room (given-files roomDrop)
    <FileViewer>
      <OfficeStage
        scene={scene}
        t={t}
        building={!built}
        label={thread.label}
        faces={thread.roster}
        from={thread.id}
        selected={selected}
        onSelect={pick}
        // The wall clock stops where the thread was seen to end
        seconds={scene.ended ?? t}
        running={scene.ended === null}
        onBuilt={setBuilt}
        className={className}
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

/** The office's clock: the seconds since the handover, moving once the office has built itself. */
function useOfficeClock(start: number) {
  const [t, setT] = useState(() => (Date.now() - start) / 1000);
  const [built, setBuilt] = useState(false);
  useEffect(() => {
    if (!built) return;
    let frame = 0;
    const tick = () => {
      setT((Date.now() - start) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [start, built]);
  return { t, built, setBuilt: useCallback(() => setBuilt(true), []) };
}
