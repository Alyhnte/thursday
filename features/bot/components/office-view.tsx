"use client";

import { ArrowRight, FastForward, Pause, Play, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  liveClock,
  type OfficeScene,
  officeOf,
  questionAt,
  replayClock,
  reportAt,
  sceneOf,
  seatAt,
  YOU,
} from "@/features/bot/office";
import type { BotRef, ThreadView } from "@/features/bot/thread.store";
import { PICKED_ROW } from "@/features/settings/components/setting-ui";
import { toDate } from "@/lib/date-like";
import { cn, plainText } from "@/lib/utils";

type Mode = "live" | "replay";
type Pane = "chat" | "glance";

/** Speeds a replay runs at. */
const SPEEDS = [1, 2, 4] as const;

/**
 * A thread as an office, nearly the whole window: its bots at their desks walking the work
 * across the floor, the conversation beside it, who ran when along the bottom. A running thread
 * is followed live; any thread replays from its handover, long waits squeezed.
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
  const ongoing = thread.status === "working" || thread.status === "waiting";
  const [mode, setMode] = useState<Mode>(ongoing ? "live" : "replay");
  const [pane, setPane] = useState<Pane>("chat");
  const [selected, setSelected] = useState<string | null>(null);
  const office = useMemo(() => officeOf(thread), [thread]);
  const clock = useMemo(
    () => (mode === "live" ? liveClock(office.span) : replayClock(office)),
    [mode, office],
  );
  const scene = useMemo(() => sceneOf(office, clock), [office, clock]);
  const start = toDate(thread.createdAt).getTime();
  const { t, playing, speed, built, setT, setPlaying, setSpeed, setBuilt } =
    useOfficeClock(mode, scene, start, ongoing);
  // Live, the scene runs to now; a replay runs to its last line
  const end = mode === "live" ? Math.max(scene.end, t) : scene.end;
  const seconds = mode === "live" ? t : clock.real(Math.min(t, scene.end));
  const running = !reportAt(scene, t) && thread.status !== "cancelled";
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
        <Head
          thread={thread}
          scene={scene}
          t={t}
          mode={mode}
          ongoing={ongoing}
          onMode={(next) => {
            setMode(next);
            setPlaying(true);
          }}
          onClose={onClose}
        />
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
              seconds={seconds}
              running={running}
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
              <Chat
                thread={thread}
                scene={scene}
                t={t}
                live={mode === "live"}
                faces={faces}
                tab={tab}
                onTab={onTab}
              />
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
          </aside>
        </div>
        <Lanes
          scene={scene}
          t={t}
          end={end}
          mode={mode}
          faces={faces}
          playing={playing}
          speed={speed}
          onPlay={() => {
            if (t >= scene.end) setT(0);
            setPlaying(!playing);
          }}
          onSpeed={setSpeed}
          onSeek={setT}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The office's clock. Live, it is the real time since the handover, until the thread stops
 * moving, where it stays; a replay runs from the handover at the picked speed and stops at the
 * end. Either waits while the office builds.
 */
function useOfficeClock(
  mode: Mode,
  scene: OfficeScene,
  start: number,
  ongoing: boolean,
) {
  const [t, setT] = useState(() =>
    mode === "live" ? (Date.now() - start) / 1000 : 0,
  );
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [built, setBuilt] = useState(false);
  const was = useRef(mode);
  if (was.current !== mode) {
    was.current = mode;
    setT(mode === "live" ? (Date.now() - start) / 1000 : 0);
  }
  const state = useRef({
    mode,
    playing,
    speed,
    built,
    ongoing,
    end: scene.end,
  });
  state.current = { mode, playing, speed, built, ongoing, end: scene.end };

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const {
        mode: current,
        playing: on,
        speed: rate,
        built: ready,
        ongoing: moving,
        end,
      } = state.current;
      if (ready) {
        if (current === "live")
          setT(moving ? (Date.now() - start) / 1000 : end);
        else if (on)
          setT((before) => {
            const next = before + dt * rate;
            if (next >= end) {
              setPlaying(false);
              return end;
            }
            return next;
          });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [start]);

  return {
    t,
    playing,
    speed,
    built,
    setT,
    setPlaying,
    setSpeed,
    setBuilt: useCallback(() => setBuilt(true), []),
  };
}

function Head({
  thread,
  scene,
  t,
  mode,
  ongoing,
  onMode,
  onClose,
}: {
  thread: ThreadView;
  scene: OfficeScene;
  t: number;
  mode: Mode;
  ongoing: boolean;
  onMode: (mode: Mode) => void;
  onClose: () => void;
}) {
  const { open } = questionAt(scene, t);
  const report = reportAt(scene, t);
  // The app stopped it (a restart, a failure, a limit): it waits for Continue, as every list says
  const paused =
    !open &&
    thread.status === "waiting" &&
    isAppStop(thread.ask) &&
    t >= scene.end;
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
          {report
            ? "Done"
            : thread.status === "cancelled" && t >= scene.end
              ? "Stopped"
              : "Working"}
        </span>
      )}
      <span className="flex-1" />
      <Segmented
        view
        aria-label="Replay or follow live"
        options={[
          { value: "replay", label: "Replay" },
          // Kept while followed, so a thread that ends on screen keeps its picked side
          ...(ongoing || mode === "live"
            ? [{ value: "live" as const, label: "Live" }]
            : []),
        ]}
        value={mode}
        onChange={onMode}
      />
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
  const fast = scene.clock.fast.find((one) => t >= one.from && t < one.to);
  return (
    // The building can be panned under it: a wash of the page keeps the words readable
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-14 bg-linear-to-b from-background from-50% to-transparent px-5 pt-3">
      <div className="flex h-7 items-center gap-2 text-[13px]">
        {beat && (
          <>
            <span className="font-mono text-[12.5px] text-muted-foreground tabular-nums">
              {clockOf(scene.clock.real(beat.at))}
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
          </>
        )}
        <span className="flex-1" />
        {fast && (
          <span className="flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-background px-2.5 text-[12px] text-foreground/80 ring-1 ring-border">
            <FastForward className="size-3" />
            about {Math.round(fast.ratio)}× faster
          </span>
        )}
      </div>
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

/**
 * The conversation as the room draws it. Live, it is the thread itself, with its box; a replay
 * shows the lines written by the moment on screen, and who was at work then.
 */
function Chat({
  thread,
  scene,
  t,
  live,
  faces,
  tab,
  onTab,
}: {
  thread: ThreadView;
  scene: OfficeScene;
  t: number;
  live: boolean;
  faces: BotRef[];
  tab: string | null;
  onTab: (bot: string | null) => void;
}) {
  const start = toDate(thread.createdAt).getTime();
  const times = useMemo(
    () =>
      thread.lines.map((line) =>
        line.at ? toDate(line.at).getTime() : Number.NEGATIVE_INFINITY,
      ),
    [thread.lines],
  );
  const until = live
    ? Number.POSITIVE_INFINITY
    : start + scene.clock.real(t) * 1000;
  let shown = 0;
  for (const time of times) if (time <= until) shown += 1;
  const bots = scene.office.bots;
  const asking = questionAt(scene, t).open;
  const working = bots
    .filter((bot) => seatAt(scene, bot, t).key === "run")
    .join("|");
  const view = useMemo((): ThreadView => {
    if (live) return thread;
    const running = working ? working.split("|") : [];
    return {
      ...thread,
      lines: thread.lines.slice(0, shown),
      // The room stays at work while any bot is, a question open or not (room.query settleRoom)
      status: running.length
        ? "working"
        : asking
          ? "waiting"
          : shown === thread.lines.length && thread.status === "done"
            ? "done"
            : "working",
      room: {
        ...thread.room,
        participants: bots.map((bot) => ({
          bot,
          state: running.includes(bot) ? "running" : "waiting",
        })),
        questions: asking
          ? [{ id: `replay-${asking.at}`, bot: asking.from, text: asking.text }]
          : [],
        deliveries: [],
        relays: [],
      },
    };
  }, [live, thread, shown, working, asking, bots]);
  return (
    <ChatBody
      view={view}
      thread={thread}
      live={live}
      faces={faces}
      tab={tab}
      onTab={onTab}
    />
  );
}

/** Drawn again only when what it shows changes, not on every frame of the office. */
const ChatBody = memo(function ChatBody({
  view,
  thread,
  live,
  faces,
  tab,
  onTab,
}: {
  view: ThreadView;
  thread: ThreadView;
  live: boolean;
  faces: BotRef[];
  tab: string | null;
  onTab: (bot: string | null) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background ring-1 ring-border">
      <Conversation
        thread={view}
        tab={tab}
        onTab={onTab}
        className="max-h-none min-h-0 flex-1"
      />
      {live ? (
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
            className="mx-3 mb-2 shrink-0"
          />
        </div>
      ) : (
        <p className="shrink-0 px-4 pb-3 text-[12px] text-muted-foreground">
          A replay. Switch to Live to write to the thread.
        </p>
      )}
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
    (bot) => bot === scene.office.coord || seatAt(scene, bot, t).key !== "none",
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
                {clockOf(scene.clock.real(event.at))}
              </span>
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

/** How tall the lane area is, and the least a lane gets before the list scrolls. */
const LANE_AREA = 112;
const LANE_MIN = 12;

/** Tick spacings in real seconds, the first that leaves eight ticks or fewer; and the room a label needs. */
const TICKS = [
  10, 20, 60, 120, 300, 600, 1800, 3600, 7200, 21600, 43200, 86400,
];
const TICK_GAP = 48;

/** Who ran when, one lane a seat and yours on top: bars while at work, lines while waiting, arrows for what crossed. */
function Lanes({
  scene,
  t,
  end,
  mode,
  faces,
  playing,
  speed,
  onPlay,
  onSpeed,
  onSeek,
}: {
  scene: OfficeScene;
  t: number;
  end: number;
  mode: Mode;
  faces: BotRef[];
  playing: boolean;
  speed: number;
  onPlay: () => void;
  onSpeed: (speed: (typeof SPEEDS)[number]) => void;
  onSeek: (t: number) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const node = track.current;
    if (!node) return;
    const read = () => setWidth(node.clientWidth);
    read();
    const watch = new ResizeObserver(read);
    watch.observe(node);
    return () => watch.disconnect();
  }, []);
  const ids = [YOU, ...scene.office.bots];
  const row = Math.max(
    LANE_MIN,
    Math.min(26, Math.floor(LANE_AREA / ids.length)),
  );
  const tight = row < 16;
  const height = row * ids.length;
  const span = Math.max(end, 0.01);
  const x = (s: number) => (width * Math.min(Math.max(s, 0), span)) / span;
  const y = (id: string) => row / 2 + ids.indexOf(id) * row;
  const { open } = questionAt(scene, t);
  const faceOf = (bot: string) => faces.find((one) => one.name === bot);
  const realEnd = scene.clock.real(end);
  const step =
    TICKS.find((one) => realEnd / one <= 8) ??
    Math.ceil(realEnd / 8 / 86400) * 86400;
  // Spaced in real time, placed on the scene: a squeezed stretch keeps its labels apart
  const ticks: number[] = [];
  let placed = Number.NEGATIVE_INFINITY;
  for (let s = 0; s <= realEnd + 0.01; s += step) {
    const at = x(scene.clock.scene(s));
    if (at - placed < TICK_GAP) continue;
    ticks.push(s);
    placed = at;
  }
  const questions = scene.events.filter((event) => event.kind === "question");

  return (
    <section
      aria-label="Who ran when"
      className="shrink-0 border-t px-5 pt-2.5 pb-3"
    >
      <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
        <span className="font-semibold text-foreground">Who ran when</span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-5 rounded-full bg-foreground" />
          Working
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-[1.8px] w-5 bg-muted-foreground" />
          Waiting
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 border-muted-foreground border-t-[1.8px] border-dashed" />
          Held
        </span>
        {scene.office.bots.some((bot) =>
          scene.turns[bot]?.some((turn) => turn.key === "paused"),
        ) && (
          <span className="flex items-center gap-1.5 text-waiting">
            <span className="w-5 border-waiting border-t-[1.8px] border-dotted" />
            Paused
          </span>
        )}
        <span className="flex items-center gap-1.5 text-waiting">
          <span className="h-0.5 w-5 bg-waiting" />
          Your turn
        </span>
        <span className="flex-1" />
        {scene.clock.fast.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-5 rounded-sm bg-[repeating-linear-gradient(45deg,var(--alpha-08)_0_2px,transparent_2px_6px)]" />
            Hatched: fast-forwarded · the clock shows real time
          </span>
        )}
      </div>
      <div className="mt-2 flex gap-3">
        <div className="flex w-48 shrink-0 flex-col" style={{ height }}>
          {ids.map((id) => {
            const state = id === YOU ? null : seatAt(scene, id, t);
            return (
              <div
                key={id}
                className="flex items-center gap-2"
                style={{ height: row }}
              >
                {id === YOU ? (
                  <span
                    className={cn(
                      "shrink-0 rounded-full border-[1.5px] border-foreground",
                      tight ? "size-3" : "size-4",
                    )}
                  />
                ) : (
                  <BotMark
                    size={tight ? 12 : 16}
                    seed={id}
                    {...iconProps(faceOf(id)?.icon)}
                    notify={false}
                    className="shrink-0"
                  />
                )}
                <span
                  className={cn(
                    "w-16 truncate font-medium",
                    tight ? "text-[11px]" : "text-[12.5px]",
                  )}
                >
                  {id === YOU ? "You" : id}
                </span>
                <span
                  className={cn(
                    "min-w-0 truncate",
                    tight ? "text-[10px]" : "text-[11px]",
                    id === YOU && open
                      ? "text-waiting"
                      : "text-muted-foreground",
                  )}
                >
                  {id === YOU
                    ? open
                      ? "Your turn"
                      : reportAt(scene, t)
                        ? "Got the report"
                        : ""
                    : state?.label}
                </span>
              </div>
            );
          })}
        </div>
        <div ref={track} className="relative min-w-0 flex-1" style={{ height }}>
          <svg
            width={width}
            height={height}
            className="absolute inset-0 overflow-visible"
            aria-hidden
          >
            <defs>
              <pattern
                id="office-lane-hatch"
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect
                  width="2"
                  height="6"
                  style={{ fill: "var(--alpha-08)" }}
                />
              </pattern>
            </defs>
            {scene.clock.fast.map((one) => (
              <rect
                key={one.from}
                x={x(one.from)}
                y={0}
                width={x(one.to) - x(one.from)}
                height={height}
                fill="url(#office-lane-hatch)"
              />
            ))}
            {ids.map((id) => (
              <line
                key={id}
                x1={0}
                x2={width}
                y1={y(id)}
                y2={y(id)}
                style={{ stroke: "var(--alpha-05)" }}
              />
            ))}
            {scene.office.bots.flatMap((bot) =>
              scene.turns[bot]
                .filter((turn) => turn.key !== "done")
                .map((turn) => {
                  const waiting =
                    turn.key === "asking" || turn.key === "paused";
                  const from = x(turn.from);
                  const to = x(Math.min(turn.to, end));
                  const now = x(Math.min(t, turn.to, end));
                  const reached = t >= turn.from;
                  const color = waiting
                    ? "var(--waiting)"
                    : turn.key === "run"
                      ? "var(--ink)"
                      : "var(--gray-400)";
                  const dash =
                    turn.key === "held"
                      ? "3 4"
                      : turn.key === "paused"
                        ? "1 3"
                        : undefined;
                  return turn.key === "run" ? (
                    <g key={turn.id}>
                      <rect
                        x={from}
                        y={y(bot) - 3}
                        width={Math.max(0, to - from)}
                        height={6}
                        rx={3}
                        style={{
                          fill: color,
                          opacity: mode === "replay" ? 0.16 : 0,
                        }}
                      />
                      {reached && (
                        <rect
                          x={from}
                          y={y(bot) - 3}
                          width={Math.max(0, now - from)}
                          height={6}
                          rx={3}
                          style={{ fill: color }}
                        />
                      )}
                    </g>
                  ) : (
                    <g key={turn.id}>
                      <line
                        x1={from}
                        x2={to}
                        y1={y(bot)}
                        y2={y(bot)}
                        style={{
                          stroke: color,
                          strokeWidth: turn.key === "asking" ? 2.5 : 1.8,
                          strokeDasharray: dash,
                          opacity: mode === "replay" ? 0.16 : 0,
                        }}
                      />
                      {reached && (
                        <line
                          x1={from}
                          x2={now}
                          y1={y(bot)}
                          y2={y(bot)}
                          style={{
                            stroke: color,
                            strokeWidth: turn.key === "asking" ? 2.5 : 1.8,
                            strokeDasharray: dash,
                          }}
                        />
                      )}
                    </g>
                  );
                }),
            )}
            {questions.map((question) => {
              const answer = scene.events.find(
                (event) =>
                  event.kind === "answer" &&
                  event.to === question.from &&
                  event.at >= question.at,
              );
              const from = x(question.at);
              const to = x(Math.min(answer ? answer.at : end, end));
              const now = x(Math.min(t, answer ? answer.at : end));
              return (
                <g key={question.id}>
                  <rect
                    x={from}
                    y={y(YOU) - 2}
                    width={Math.max(0, to - from)}
                    height={4}
                    rx={2}
                    style={{
                      fill: "var(--waiting)",
                      opacity: mode === "replay" ? 0.16 : 0,
                    }}
                  />
                  {t >= question.at && (
                    <rect
                      x={from}
                      y={y(YOU) - 2}
                      width={Math.max(0, now - from)}
                      height={4}
                      rx={2}
                      style={{ fill: "var(--waiting)" }}
                    />
                  )}
                </g>
              );
            })}
            {scene.events
              .filter(
                (event) =>
                  event.kind !== "end" &&
                  event.to &&
                  ids.includes(event.from) &&
                  ids.includes(event.to),
              )
              .map((event) => {
                const at = x(event.at);
                const from = y(event.from);
                const to = y(event.to);
                const down = to > from;
                const color =
                  event.kind === "question" || event.kind === "answer"
                    ? "var(--waiting)"
                    : event.kind === "refused"
                      ? "var(--gray-350)"
                      : "var(--ink)";
                const tip = to + (down ? -2.5 : 2.5);
                return (
                  <g
                    key={event.id}
                    style={{
                      opacity:
                        t >= event.at ? 0.9 : mode === "replay" ? 0.18 : 0,
                    }}
                  >
                    <title>{`${clockOf(scene.clock.real(event.at))} ${event.from === YOU ? "You" : event.from} → ${event.to === YOU ? "you" : event.to} · ${kindWord(event)}`}</title>
                    <line
                      x1={at}
                      x2={at}
                      y1={from}
                      y2={tip}
                      style={{
                        stroke: color,
                        strokeWidth: 1.2,
                        strokeDasharray:
                          event.kind === "refused"
                            ? "2 2"
                            : event.after.length
                              ? "3 3"
                              : undefined,
                      }}
                    />
                    <path
                      d={
                        down
                          ? `M${at - 3} ${to - 7} L${at} ${to - 2.5} L${at + 3} ${to - 7}`
                          : `M${at - 3} ${to + 7} L${at} ${to + 2.5} L${at + 3} ${to + 7}`
                      }
                      style={{
                        fill: "none",
                        stroke: color,
                        strokeWidth: 1.2,
                        strokeLinecap: "round",
                        strokeLinejoin: "round",
                      }}
                    />
                    <circle cx={at} cy={from} r={2.4} style={{ fill: color }} />
                  </g>
                );
              })}
            <line
              x1={x(t)}
              x2={x(t)}
              y1={-4}
              y2={height}
              style={{ stroke: "var(--ink)", strokeWidth: 1.5 }}
            />
          </svg>
          {mode === "replay" && (
            <label className="absolute inset-0 block">
              <span className="sr-only">Where the replay is</span>
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(
                  (Math.min(t, end) / Math.max(end, 0.01)) * 1000,
                )}
                onChange={(event) =>
                  onSeek((Number(event.target.value) / 1000) * end)
                }
                className="size-full cursor-pointer opacity-0"
              />
            </label>
          )}
          <div className="pointer-events-none absolute inset-x-0 top-full mt-1.5 h-4">
            {ticks.map((s) => (
              <span
                key={s}
                className="absolute -translate-x-1/2 font-mono text-[10.5px] text-muted-foreground"
                style={{ left: x(scene.clock.scene(s)) }}
              >
                {clockOf(s)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6 flex items-center gap-3">
        {mode === "replay" ? (
          <>
            <button
              type="button"
              onClick={onPlay}
              aria-label={playing ? "Pause" : "Play"}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {playing ? (
                <Pause className="size-4 fill-current" />
              ) : (
                <Play className="size-4 fill-current" />
              )}
            </button>
            <Segmented
              aria-label="Replay speed"
              options={SPEEDS.map((value) => ({
                value: String(value),
                label: `${value}×`,
              }))}
              value={String(speed)}
              onChange={(value) =>
                onSpeed(Number(value) as (typeof SPEEDS)[number])
              }
            />
          </>
        ) : (
          <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <span className="size-2 rounded-full bg-foreground" />
            Following the thread as it runs
          </span>
        )}
        <span className="flex-1" />
        <span className="font-mono text-[15px] tabular-nums">
          {clockOf(mode === "live" ? t : scene.clock.real(Math.min(t, end)))}
          <span className="text-muted-foreground">
            {" "}
            / {clockOf(scene.clock.real(end))}
          </span>
        </span>
      </div>
    </section>
  );
}
