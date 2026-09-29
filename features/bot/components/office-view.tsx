"use client";

import { ArrowRight, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { ShinyText } from "@/components/ui/shiny-text";
import { isAppStop } from "@/features/bot/bot.schema";
import { BotMark, iconProps } from "@/features/bot/components/bot-mark";
import { OfficeStage, StateChip } from "@/features/bot/components/office-stage";
import { Conversation } from "@/features/bot/components/room-conversation";
import { ThreadReply } from "@/features/bot/components/thread-reply";
import {
  beatAt,
  cardOf,
  clockOf,
  kindWord,
  type OfficeScene,
  type OfficeThread,
  officeOf,
  questionAt,
  reportAt,
  sceneOf,
  seatAt,
  watch,
  YOU,
} from "@/features/bot/office";
import type { BotRef, ThreadView } from "@/features/bot/thread.store";
import { PICKED_ROW } from "@/features/settings/components/setting-ui";
import { toDate } from "@/lib/date-like";
import { cn, plainText } from "@/lib/utils";

type Pane = "chat" | "glance";

/**
 * A thread at work as an office, nearly the whole window: its bots at their desks walking the
 * work across the floor as it happens, the conversation and the thread's box beside it.
 */
export function OfficeView({
  thread,
  faces,
  tab,
  onTab,
  onClose,
}: {
  thread: ThreadView;
  faces: BotRef[];
  /** The bot whose tab the conversation is on; null is the thread's own. */
  tab: string | null;
  onTab: (bot: string | null) => void;
  onClose: () => void;
}) {
  const [pane, setPane] = useState<Pane>("chat");
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        // what is dropped on the office is the thread's, as on the room (given-files roomDrop)
        data-room
        className="flex h-[95vh] w-[95vw] max-w-none flex-col gap-0 overflow-hidden rounded-3xl bg-background p-0 sm:max-w-none"
      >
        <Head thread={thread} scene={scene} t={t} onClose={onClose} />
        <div className="flex min-h-0 flex-1">
          <div className="relative flex min-w-0 flex-1 flex-col">
            <Caption scene={scene} t={t} faces={faces} />
            <OfficeStage
              scene={scene}
              t={t}
              building={!built}
              label={thread.label}
              faces={faces}
              selected={selected}
              onSelect={pick}
              // The wall clock stops where the thread was seen to end
              seconds={scene.ended ?? t}
              running={scene.ended === null}
              onBuilt={setBuilt}
              className="min-h-0 flex-1"
            />
          </div>
          <aside className="hidden w-100 shrink-0 flex-col gap-2.5 py-3 pr-4 lg:flex">
            <Segmented
              view
              aria-label="How to read the thread"
              options={[
                { value: "chat", label: "Chat" },
                { value: "glance", label: "At a glance" },
              ]}
              value={pane}
              onChange={setPane}
            />
            {pane === "chat" ? (
              <ChatBody thread={thread} tab={tab} onTab={onTab} />
            ) : (
              <Glance
                thread={thread}
                scene={scene}
                t={t}
                faces={faces}
                selected={selected}
                onSelect={pick}
              />
            )}
            {/* The thread's one box, under either pane: while the office is open the room's own
                is not drawn, and this one reads its drafts (thread-reply) */}
            <Reply thread={thread} faces={faces} tab={tab} />
          </aside>
        </div>
      </DialogContent>
    </Dialog>
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

function Head({
  thread,
  scene,
  t,
  onClose,
}: {
  thread: ThreadView;
  scene: OfficeScene;
  t: number;
  onClose: () => void;
}) {
  const { open } = questionAt(scene, t);
  // The app stopped it (a restart, a failure, a limit): it waits for Continue, as every list says
  const paused = !open && thread.status === "waiting" && isAppStop(thread.ask);
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-5">
      <BotMark
        size={22}
        seed={thread.bot.name}
        {...iconProps(thread.bot.icon)}
        notify={false}
      />
      <DialogTitle className="min-w-0 truncate font-semibold text-[15px]">
        {thread.label}
      </DialogTitle>
      {open ? (
        <span className="flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-waiting/10 px-2.5 font-medium text-[12.5px] text-waiting">
          <span className="size-1.75 rounded-full bg-waiting" />
          Needs your answer
        </span>
      ) : paused ? (
        <span className="flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-waiting/10 px-2.5 font-medium text-[12.5px] text-waiting">
          <span className="size-1.75 rounded-full bg-waiting" />
          Paused · Continue picks it up
        </span>
      ) : (
        <span className="shrink-0 font-mono text-[12px] text-muted-foreground">
          {reportAt(scene, t)
            ? "Done"
            : thread.status === "cancelled"
              ? "Stopped"
              : "Working"}
        </span>
      )}
      <span className="flex-1" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close the office"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-foreground outline-none transition-colors hover:bg-muted-foreground/20 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <X className="size-3.5" />
      </button>
    </header>
  );
}

/** The last message that crossed the floor, in one line over the office. */
function Caption({
  scene,
  t,
  faces,
}: {
  scene: OfficeScene;
  t: number;
  faces: BotRef[];
}) {
  const beat = beatAt(scene, t);
  return (
    // The building can be panned under it: a wash of the page keeps the words readable
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-14 bg-linear-to-b from-background from-50% to-transparent px-5 pt-3">
      {beat && (
        <div className="flex h-7 items-center gap-2 text-[13px]">
          <span className="font-mono text-[12.5px] text-muted-foreground tabular-nums">
            {clockOf(beat.at)}
          </span>
          <Who name={beat.from} faces={faces} />
          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
          <Who name={beat.to} faces={faces} />
          <span
            className={cn(
              "ml-1 shrink-0",
              beat.kind === "question" || beat.kind === "answer"
                ? "text-waiting"
                : "text-muted-foreground",
            )}
          >
            {kindWord(beat)}
          </span>
          <span className="min-w-0 truncate">{plainText(beat.text)}</span>
        </div>
      )}
    </div>
  );
}

function Who({ name, faces }: { name: string; faces: BotRef[] }) {
  if (name === YOU || !name)
    return <span className="shrink-0 font-medium">{name ? "You" : ""}</span>;
  return (
    <span className="flex shrink-0 items-center gap-1.5 font-medium">
      <BotMark
        size={16}
        seed={name}
        {...iconProps(faces.find((one) => one.name === name)?.icon)}
        notify={false}
      />
      {name}
    </span>
  );
}

/** The conversation as the room draws it; drawn again only when the thread changes, not on every frame. */
const ChatBody = memo(function ChatBody({
  thread,
  tab,
  onTab,
}: {
  thread: ThreadView;
  tab: string | null;
  onTab: (bot: string | null) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background ring-1 ring-border">
      <Conversation
        thread={thread}
        tab={tab}
        onTab={onTab}
        className="max-h-none min-h-0 flex-1"
      />
    </div>
  );
});

/** The thread's box: its questions, Continue and Stop, and words for the bot whose tab is open. */
const Reply = memo(function Reply({
  thread,
  faces,
  tab,
}: {
  thread: ThreadView;
  faces: BotRef[];
  tab: string | null;
}) {
  return (
    // Esc a box takes back (a step-in) stops there: the dialog would close on it as well
    <div
      className="contents"
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.defaultPrevented)
          event.stopPropagation();
      }}
    >
      <ThreadReply
        thread={{
          id: thread.id,
          label: thread.label,
          bot: thread.bot.name,
          ask: thread.ask,
          room: thread.room,
        }}
        status={thread.status === "working" ? "running" : thread.status}
        faces={faces}
        to={tab ?? thread.bot.name}
        className="shrink-0"
      />
    </div>
  );
});

/** The thread in plain words: the request, what is asked of you, each bot's seat, what came back. */
function Glance({
  thread,
  scene,
  t,
  faces,
  selected,
  onSelect,
}: {
  thread: ThreadView;
  scene: OfficeScene;
  t: number;
  faces: BotRef[];
  selected: string | null;
  onSelect: (bot: string) => void;
}) {
  const { open, answered } = questionAt(scene, t);
  const joined = scene.office.bots.filter(
    (bot) => bot === scene.office.coord || seatAt(scene, bot).key !== "none",
  );
  const results = scene.events.filter(
    (event) =>
      (event.kind === "return" || event.kind === "report") && event.at <= t,
  );
  const faceOf = (bot: string) => faces.find((one) => one.name === bot);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto">
      <section className="rounded-2xl bg-background px-3.5 py-3 ring-1 ring-border">
        <p className="mb-1 font-semibold text-[12.5px]">
          Request{" "}
          <span className="font-normal font-mono text-[11px] text-muted-foreground">
            you → {scene.office.coord}
          </span>
        </p>
        <p className="line-clamp-3 text-[12.5px] leading-normal">
          {thread.request}
        </p>
      </section>
      {open && (
        <section className="rounded-2xl bg-background px-3.5 py-3 ring-[1.5px] ring-waiting">
          <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-[12.5px] text-waiting">
            <span className="size-1.75 rounded-full bg-waiting" />
            Your turn · {open.from} is asking
          </p>
          <p className="line-clamp-4 text-[12.5px] leading-normal">
            {plainText(open.text)}
          </p>
        </section>
      )}
      {!open && answered && (
        <section className="rounded-2xl bg-background px-3.5 py-2.5 ring-1 ring-border">
          <p className="mb-1 font-semibold text-[12px]">You answered</p>
          <p className="line-clamp-2 text-[12px] text-foreground/80 leading-snug">
            {plainText(answered.answer.text)}
          </p>
        </section>
      )}
      <section className="flex flex-col rounded-2xl bg-background ring-1 ring-border">
        <p className="px-3.5 pt-2.5 pb-1.5 font-semibold text-[12.5px]">
          Seats{" "}
          <span className="font-normal text-[11.5px] text-muted-foreground">
            press one to find it in the office
          </span>
        </p>
        {joined.map((bot) => {
          const card = cardOf(scene, bot, t);
          return (
            <button
              key={bot}
              type="button"
              onClick={() => onSelect(bot)}
              aria-pressed={selected === bot}
              className={cn(
                "flex gap-2.5 border-t px-3.5 py-2 text-left outline-none transition-colors focus-visible:bg-muted",
                selected === bot ? PICKED_ROW : "hover:bg-muted/50",
              )}
            >
              <BotMark
                size={24}
                seed={bot}
                {...iconProps(faceOf(bot)?.icon)}
                notify={false}
                className="mt-0.5 shrink-0"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-[13px]">{bot}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                    {card.role}
                  </span>
                  <StateChip state={card.state} />
                </span>
                {card.now ? (
                  <ShinyText text={card.now} className="truncate text-[12px]" />
                ) : (
                  <span className="truncate text-[12px] text-foreground/70">
                    {card.state.why}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </section>
      {results.length > 0 && (
        <section className="flex flex-col gap-1.5 rounded-2xl bg-background px-3.5 py-2.5 ring-1 ring-border">
          <p className="font-semibold text-[12.5px]">What came back</p>
          {results.map((event) => (
            <p key={event.id} className="flex items-center gap-2 text-[11.5px]">
              <BotMark
                size={14}
                seed={event.from}
                {...iconProps(faceOf(event.from)?.icon)}
                notify={false}
                className="shrink-0"
              />
              <span className="inverse min-w-0 flex-1 truncate rounded-md bg-background px-2 py-0.5 text-foreground">
                {event.kind === "report"
                  ? "Final report · "
                  : `${event.from} · `}
                {plainText(event.text)}
              </span>
              <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                {clockOf(event.at)}
              </span>
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
