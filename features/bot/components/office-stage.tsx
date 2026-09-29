"use client";

import { Maximize, Minus, Plus } from "lucide-react";
import {
  Fragment,
  memo,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { queryKey } from "@/app/api/query-key";
import { ShinyText } from "@/components/ui/shiny-text";
import { BotMark, iconProps } from "@/features/bot/components/bot-mark";
import {
  briefOf,
  clockOf,
  filesOf,
  type OfficeEvent,
  type OfficeScene,
  type Plate,
  type PlateLine,
  plateOf,
  type SeatKey,
  type Sign,
  signOf,
} from "@/features/bot/office";
import {
  type Moment,
  type Mug,
  momentOf,
  motionOf,
  type Paper,
  type Piece,
  restAt,
  type Sheet,
  SIGN_BOX,
  type Stage,
  type Stroke,
  stageOf,
  tricksOf,
  tripsOf,
  type Walker,
} from "@/features/bot/office.scene";
import { type BotRef, useOfficeCaption } from "@/features/bot/thread.store";
import { fileIcon } from "@/features/workspace/components/file-thumb";
import { FileLink } from "@/features/workspace/components/file-view";
import type { FileOnDisk } from "@/features/workspace/workspace.schema";
import { useServerRoute } from "@/lib/protocol/use-server-route";
import { cn, plainText } from "@/lib/utils";

/**
 * The zooms the buttons step through, as a browser's do: from far enough out to see the ground
 * well around the building to near enough to read a desk. The wheel goes between them.
 */
const ZOOMS = [
  0.3, 0.4, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4,
];
/** The zoom the office opens at, and comes back to: a little under the fit, so the building has room around it. */
const ZOOM_START = 0.9;

type View = { z: number; x: number; y: number };

const zoomAt = (view: View, fx: number, fy: number, next: number): View => {
  const z = Math.min(ZOOMS[ZOOMS.length - 1], Math.max(ZOOMS[0], next));
  return {
    z,
    x: fx - (z / view.z) * (fx - view.x),
    y: fy - (z / view.z) * (fy - view.y),
  };
};

/** The next of the buttons' zooms from `z`, in or out. */
const stepFrom = (z: number, zoomIn: boolean) =>
  zoomIn
    ? (ZOOMS.find((step) => step > z + 0.001) ?? z)
    : (ZOOMS.findLast((step) => step < z - 0.001) ?? z);

/** The view the office opens at: `ZOOM_START` about the middle of its box. */
const startOf = (size: { w: number; h: number }): View =>
  zoomAt({ z: 1, x: 0, y: 0 }, size.w / 2, size.h / 2, ZOOM_START);

/** The box the office is fitted into, measured, so it redraws when the window changes. */
function useSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const read = () => {
      const w = Math.round(node.clientWidth);
      const h = Math.round(node.clientHeight);
      setSize((was) => (was && was.w === w && was.h === h ? was : { w, h }));
    };
    read();
    const watch = new ResizeObserver(read);
    watch.observe(node);
    return () => watch.disconnect();
  }, [ref]);
  return size;
}

/**
 * The scene's clock, in seconds since the handover. It runs frame by frame only while the
 * drawing moves (`spans`, office.scene motionOf) and otherwise rests until the next movement is
 * due, so an office nobody walks in costs nothing between; a changed scene reads it again at
 * once. It holds its first reading while the office builds itself (`spans` null).
 */
function useSceneClock(start: number, spans: [number, number][] | null) {
  const [t, setT] = useState(() => (Date.now() - start) / 1000);
  useEffect(() => {
    if (!spans) return;
    let frame = 0;
    let timer: number | undefined;
    const tick = () => {
      const now = (Date.now() - start) / 1000;
      setT(now);
      const rest = restAt(spans, now);
      if (rest === 0) frame = requestAnimationFrame(tick);
      else if (Number.isFinite(rest))
        timer = window.setTimeout(tick, rest * 1000);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [start, spans]);
  return t;
}

const ink = (percent: number) =>
  `color-mix(in oklab, var(--ink) ${percent}%, transparent)`;

/**
 * The office: a sketch of the thread's rooms, its bots at their desks and on the move, pan and
 * zoom like a canvas. It builds itself as it opens, and its bots leap now and then (office.scene
 * tricksOf). Over each bot a plate says in one line what it is on, what it asks or what it handed
 * back; a bot that is not at work folds to the mark of how it stands until pointed at, and
 * pressing a plate opens it where it is to what the bot was asked and how far it has come. The
 * job's name heads it at the top left, how the job stands is stamped on the ground beside the
 * building, and the wall clock says how long it has run.
 */
export function OfficeStage({
  scene,
  start,
  label,
  faces,
  from,
  selected,
  onSelect,
  className,
}: {
  scene: OfficeScene;
  /** When the job was handed over (ms): the scene's clock counts from here. */
  start: number;
  label: string;
  /** Each bot's face, by name. */
  faces: BotRef[];
  /** The thread it draws, where a note about one of its files goes (file-note). */
  from: string;
  selected: string | null;
  /** A plate pressed; null when a tap on the floor puts the opened one back. */
  onSelect: (bot: string | null) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const size = useSize(box);
  // A machine asked to hold still gets the work walked and no leaps of the bots' own
  const [calm] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const stage = useMemo(
    () => (size && size.w > 0 && size.h > 0 ? stageOf(scene, size) : null),
    [scene, size],
  );
  const trips = useMemo(
    () => (stage ? tripsOf(scene, stage.plan) : []),
    [scene, stage],
  );
  // The build runs once, from the first drawing; when it is over the office stands (scene
  // seconds) and the clock may move
  const [stood, setStood] = useState<number | null>(null);
  const built = stood !== null;
  const builds = stage?.built ?? null;
  useEffect(() => {
    if (builds === null || built) return;
    const done = window.setTimeout(
      () => setStood((Date.now() - start) / 1000),
      builds,
    );
    return () => window.clearTimeout(done);
  }, [builds === null, built, start]);
  const tricks = useMemo(
    () => (calm ? [] : tricksOf(scene, trips, stood)),
    [calm, scene, trips, stood],
  );
  const spans = useMemo(
    () => (stage ? motionOf(scene, stage, trips, tricks) : null),
    [scene, stage, trips, tricks],
  );
  const t = useSceneClock(start, built ? spans : null);
  const moment = stage
    ? momentOf(scene, stage, trips, tricks, t, selected)
    : null;
  const sign = signOf(scene);
  // What the job handed over, only what is on disk: the plates and the report name it
  const files = useMemo(() => filesOf(scene), [scene]);
  const { data: found } = useServerRoute<FileOnDisk[]>(
    files.length
      ? queryKey.workspaceFiles(files.map((file) => file.path))
      : null,
  );
  const onDisk = useCallback(
    (path: string) => found?.some((one) => one.path === path) ?? false,
    [found],
  );
  // Null until panned or zoomed: the view it opens at, kept about the middle as the box changes
  const [panned, setView] = useState<View | null>(null);
  const view = panned ?? (size ? startOf(size) : { z: ZOOM_START, x: 0, y: 0 });
  const drag = useRef<{
    x: number;
    y: number;
    from: View;
    moved: boolean;
    /** Down on a plate or its bot, where a tap is theirs. */
    onPlate: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  // The wheel zooms where the pointer is, as a canvas does; not passive, so the page stays put
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const fx = event.clientX - rect.left;
      const fy = event.clientY - rect.top;
      setView((was) => {
        const from =
          was ?? startOf({ w: node.clientWidth, h: node.clientHeight });
        return zoomAt(
          from,
          fx,
          fy,
          from.z * Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0022)),
        );
      });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest("button, a")
    )
      return;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      from: view,
      moved: false,
      onPlate: !!(event.target as HTMLElement).closest("[data-plate]"),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const was = drag.current;
    if (!was) return;
    const dx = event.clientX - was.x;
    const dy = event.clientY - was.y;
    if (!was.moved && Math.hypot(dx, dy) < 3) return;
    was.moved = true;
    setDragging(true);
    setView({ ...was.from, x: was.from.x + dx, y: was.from.y + dy });
  };
  const up = () => {
    const was = drag.current;
    drag.current = null;
    setDragging(false);
    // A tap on the floor, not a drag, puts an opened plate back
    if (was && !was.moved && !was.onPlate && selected) onSelect(null);
  };

  const world = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
  const at = (x: number, y: number) => ({
    x: view.x + view.z * x,
    y: view.y + view.z * y,
  });
  const faceOf = (bot: string) => faces.find((one) => one.name === bot);
  // Each bot's plate, read once: the crowding pass and the plates themselves read the same
  const plates = (moment?.tags ?? []).map((tag) => ({
    tag,
    plate: plateOf(scene, tag.bot, t, onDisk),
  }));
  // Where each plate sits while its bot is at its desk: plates are judged for room there, so
  // one walking past another does not fold and unfold it as it goes
  const homeOf = (bot: string) => {
    const seat =
      bot === scene.office.coord
        ? stage?.plan.own.seat
        : stage?.plan.byBot.get(bot)?.seat;
    if (!stage || !seat) return null;
    const [x, y] = stage.fit.at(seat[0], seat[1], 0);
    return at(x, y - stage.botSize - 6);
  };
  const { crowded, onRoom } = useCrowding(
    plates.flatMap(({ tag, plate }) => {
      const home = homeOf(tag.bot);
      return home
        ? [
            {
              bot: tag.bot,
              home,
              open: !plate.folded,
              first:
                plate.state.key === "asking" || plate.state.key === "paused",
              words:
                plate.line.kind === "files"
                  ? plate.line.paths.join()
                  : plate.line.text,
            },
          ]
        : [];
    }),
    selected,
  );

  return (
    <div
      ref={box}
      // what is dropped on the office is the thread's, as on the room (given-files roomDrop)
      data-room
      data-building={built ? undefined : ""}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className={cn(
        "relative touch-none select-none overflow-hidden",
        dragging ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
    >
      {stage && moment && size && (
        <>
          {/* The ground's long lines, faded at the window's edges so none ends on a cut */}
          <div className="office-fade pointer-events-none absolute inset-0 [mask-composite:intersect] [mask-image:linear-gradient(to_right,transparent,#000_80px,#000_calc(100%-80px),transparent),linear-gradient(to_bottom,transparent,#000_60px,#000_calc(100%-60px),transparent)]">
            <div
              className="absolute top-0 left-0 origin-top-left"
              style={{ width: size.w, height: size.h, transform: world }}
            >
              <svg
                width={size.w}
                height={size.h}
                className="overflow-visible"
                aria-hidden
              >
                <Fades />
                <Alarm stage={stage} on={built && sign === "paused"} />
                {stage.guides.map((line) => (
                  <line
                    key={line.id}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    style={{
                      stroke: line.color,
                      strokeWidth: 1,
                      strokeLinecap: "round",
                    }}
                  />
                ))}
              </svg>
            </div>
          </div>
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{ width: size.w, height: size.h, transform: world }}
          >
            <svg
              width={size.w}
              height={size.h}
              className="overflow-visible"
              role="img"
              aria-label={`The office for ${label}`}
            >
              <Patterns />
              <Built stage={stage} />
              {moment.shades.map((shade) => (
                <polygon
                  key={shade.points}
                  className="office-drop"
                  points={shade.points}
                  fill="url(#office-hatch-shade)"
                  style={{ animationDelay: `${shade.delay}ms` }}
                />
              ))}
              <Links links={moment.links} />
              {moment.pins.map((paper) => (
                <PaperShape key={paper.id} paper={paper} />
              ))}
              {moment.tossed.map(
                (sheet) =>
                  sheet.landed && <SheetShape key={sheet.id} sheet={sheet} />,
              )}
              {moment.trail.map((step) => (
                <ellipse
                  key={step.id}
                  cx={step.x}
                  cy={step.y}
                  rx={3}
                  ry={1.5}
                  style={{ fill: "var(--ink)", opacity: step.opacity }}
                />
              ))}
              {moment.sprites.map((sprite) =>
                sprite.kind === "piece" ? (
                  <PieceShape
                    key={sprite.piece.id}
                    piece={sprite.piece}
                    draw={sprite.draw}
                  />
                ) : sprite.kind === "bot" ? (
                  <BotSprite
                    key={`bot-${sprite.walker.bot}`}
                    walker={sprite.walker}
                    face={faceOf(sprite.walker.bot)}
                    popAt={stage.popAt}
                  />
                ) : (
                  <PaperShape key={sprite.paper.id} paper={sprite.paper} />
                ),
              )}
              {moment.tossed.map(
                (sheet) =>
                  !sheet.landed && <SheetShape key={sheet.id} sheet={sheet} />,
              )}
            </svg>
            <WallClock stage={stage} start={start} ended={scene.ended} />
            <GroundSign
              stage={stage}
              sign={sign}
              ended={scene.ended}
              land={built ? 0 : stage.popAt + 250}
            />
          </div>
          <div
            className="office-fade pointer-events-none absolute inset-0"
            style={{ animationDelay: `${stage.popAt}ms` }}
          >
            {moment.glasses.map((glass) => {
              const spot = at(glass.x, glass.y);
              return (
                <span
                  key={`${glass.x},${glass.y}`}
                  className="absolute -translate-x-1/2 -translate-y-full"
                  style={{ left: spot.x, top: spot.y, opacity: glass.opacity }}
                >
                  <Hourglass />
                </span>
              );
            })}
            {moment.stamp && (
              <Refused
                spot={at(moment.stamp.x, moment.stamp.y)}
                scale={moment.stamp.scale}
                text={moment.stamp.text}
              />
            )}
            {plates.map(({ tag, plate }) => (
              <PlateAt
                key={tag.bot}
                scene={scene}
                plate={plate}
                crowded={crowded.includes(tag.bot)}
                onRoom={onRoom}
                t={t}
                start={start}
                bot={tag.bot}
                head={at(tag.x, tag.head)}
                foot={at(tag.x, tag.foot).y}
                lift={tag.carrying ? 32 * view.z : 0}
                size={stage.botSize * view.z}
                width={size.w}
                picked={selected === tag.bot}
                hush={moment.hush}
                onPick={() => onSelect(tag.bot)}
                from={from}
              />
            ))}
          </div>
          <OfficeHead
            label={label}
            bots={scene.office.bots.length}
            files={
              scene.office.status === "done"
                ? files.filter((file) => onDisk(file.path))
                : []
            }
            from={from}
          />
          {moment.report && (
            <ReportCard
              report={moment.report}
              face={faceOf(moment.report.from)}
            />
          )}
          <div className="absolute bottom-3.5 left-4 flex items-center gap-0.5 rounded-full bg-background p-0.75 shadow-sm ring-1 ring-border">
            <ZoomButton
              label="Zoom out"
              onClick={() =>
                setView(
                  zoomAt(view, size.w / 2, size.h / 2, stepFrom(view.z, false)),
                )
              }
            >
              <Minus className="size-3.5" />
            </ZoomButton>
            <span className="min-w-11 text-center font-mono text-[11.5px] text-foreground/80 tabular-nums">
              {Math.round(view.z * 100)}%
            </span>
            <ZoomButton
              label="Zoom in"
              onClick={() =>
                setView(
                  zoomAt(view, size.w / 2, size.h / 2, stepFrom(view.z, true)),
                )
              }
            >
              <Plus className="size-3.5" />
            </ZoomButton>
            <span className="mx-0.5 h-4 w-px bg-border" />
            <ZoomButton label="Fit the office" onClick={() => setView(null)}>
              <Maximize className="size-3.5" />
            </ZoomButton>
          </div>
        </>
      )}
    </div>
  );
}

function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-7.5 place-items-center rounded-full outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
    </button>
  );
}

/**
 * A time that runs by itself, a second at a time, so what shows it is all that draws again:
 * from `from` (ms) to `until`, or to now while `until` is null, as "4:40".
 */
function Elapsed({
  from,
  until = null,
  className,
}: {
  from: number;
  until?: number | null;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until !== null) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [until]);
  const seconds = ((until ?? now) - from) / 1000;
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {clockOf(seconds)}
    </span>
  );
}

/** How many of the job's files the head shows before the rest fold under "+N more". */
const HEAD_FILES = 3;

/**
 * The office's head, at its top left: the job's name, and once the job is done how many bots
 * worked on it and the files it handed over, each with the bot whose words named it; pressing one
 * opens it. Past the first few the rest fold under "+N more", opened in place. How the job stands
 * and how long it took are stamped on the ground (GroundSign) and kept by the wall clock. During
 * a call her words stand above it (thursday), and it steps down under them.
 */
function OfficeHead({
  label,
  bots,
  files,
  from,
}: {
  label: string;
  bots: number;
  files: { path: string; bot: string }[];
  from: string;
}) {
  const captioned = useOfficeCaption();
  const [all, setAll] = useState(false);
  // Folding away a single file saves nothing
  const folds = files.length > HEAD_FILES + 1;
  const shown = folds && !all ? files.slice(0, HEAD_FILES) : files;
  return (
    <div
      className={cn(
        "pointer-events-none absolute left-6 flex max-w-[min(34rem,calc(100%-3rem))] animate-in flex-col gap-3 fade-in transition-[top] duration-300",
        captioned ? "top-24" : "top-5",
      )}
    >
      <h2 className="line-clamp-2 max-w-[28rem] text-balance font-semibold text-[22px] leading-tight tracking-tight">
        {label}
      </h2>
      {files.length > 0 && (
        <div className="flex animate-in flex-col gap-2 fade-in slide-in-from-top-1 duration-300">
          <span className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
            {bots} {bots === 1 ? "bot" : "bots"} · {files.length}{" "}
            {files.length === 1 ? "file" : "files"}
          </span>
          <div
            className={cn(
              "pointer-events-auto flex flex-wrap gap-1.5",
              all &&
                "max-h-60 overflow-y-auto rounded-2xl bg-background/80 p-1.5 ring-1 ring-border scrollbar-none",
            )}
          >
            {shown.map((file) => {
              const Icon = fileIcon(file.path);
              return (
                <FileLink
                  key={file.path}
                  path={file.path}
                  from={from}
                  className="flex h-7 max-w-64 items-center gap-1.5 rounded-full bg-background pr-3 pl-2.5 text-[12.5px] shadow-sm outline-none ring-1 ring-border transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">
                    {file.path.split("/").pop()}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {file.bot}
                  </span>
                </FileLink>
              );
            })}
            {folds && (
              <button
                type="button"
                onClick={() => setAll((was) => !was)}
                aria-expanded={all}
                className="flex h-7 items-center rounded-full bg-foreground/7 px-3 text-[12.5px] outline-none transition-colors hover:bg-foreground/12 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {all ? "Fewer" : `+${files.length - HEAD_FILES} more`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Seven segments, lit or not. */
const SEGMENTS = {
  a: "2.3,1.7 4,0 16,0 17.7,1.7 16,3.4 4,3.4",
  g: "2.3,18 4,16.3 16,16.3 17.7,18 16,19.7 4,19.7",
  d: "2.3,34.3 4,32.6 16,32.6 17.7,34.3 16,36 4,36",
  f: "1.7,2.3 3.4,4 3.4,15.7 1.7,17.4 0,15.7 0,4",
  e: "1.7,18.6 3.4,20.3 3.4,32 1.7,33.7 0,32 0,20.3",
  b: "18.3,2.3 20,4 20,15.7 18.3,17.4 16.6,15.7 16.6,4",
  c: "18.3,18.6 20,20.3 20,32 18.3,33.7 16.6,32 16.6,20.3",
} as const;
const DIGITS = [
  "abcdef",
  "bc",
  "abdeg",
  "abcdg",
  "bcfg",
  "acdfg",
  "acdefg",
  "abc",
  "abcdefg",
  "abcdfg",
];

function Digit({ value }: { value: number }) {
  return (
    <svg
      width={23}
      height={41}
      viewBox="-0.5 -0.5 21 37"
      className="-skew-x-[7deg] overflow-visible"
      aria-hidden
    >
      {(Object.keys(SEGMENTS) as (keyof typeof SEGMENTS)[]).map((segment) => (
        <polygon
          key={segment}
          points={SEGMENTS[segment]}
          style={{
            fill: DIGITS[value].includes(segment) ? "var(--ink)" : ink(5.5),
          }}
        />
      ))}
    </svg>
  );
}

/** The most the wall clock shows, 99:59:59, and a key for each of its groups. */
const CLOCK_MAX = 99 * 3600 + 59 * 60 + 59;
const CLOCK_GROUPS = ["first", "second", "third"];

/**
 * The clock on the coordinator's wall: how long the job has been going, the colon ticking while
 * it runs and still where it was seen to end. It moves on by itself a second at a time, so it is
 * all that draws again for it.
 */
function WallClock({
  stage,
  start,
  ended,
}: {
  stage: Stage;
  start: number;
  /** When the job was seen to end, in scene seconds; null while it runs. */
  ended: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (ended !== null) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [ended]);
  const seconds = ended ?? (now - start) / 1000;
  // Minutes and seconds, then hours and minutes and seconds, up to the clock's last digit
  const whole = Math.min(CLOCK_MAX, Math.max(0, Math.floor(seconds)));
  const hours = Math.floor(whole / 3600);
  const groups = [
    ...(hours ? [hours] : []),
    Math.floor(whole / 60) % (hours ? 60 : 100),
    whole % 60,
  ];
  return (
    <div
      className="office-fade absolute top-0 left-0 flex origin-top-left items-center justify-center"
      style={{
        width: stage.clock.w,
        height: stage.clock.h,
        transform: stage.clock.matrix,
        animationDelay: `${stage.popAt}ms`,
      }}
    >
      <div
        role="img"
        aria-label={`Running for ${clockOf(seconds)}`}
        className={cn("flex items-center gap-1.25", hours && "scale-72")}
      >
        {groups.map((group, index) => (
          <Fragment key={CLOCK_GROUPS[index]}>
            {index > 0 && (
              <span
                className={cn(
                  "flex flex-col gap-2.75 px-px",
                  ended === null && "animate-office-blink",
                )}
              >
                <span className="size-1 rounded-[1px] bg-foreground" />
                <span className="size-1 rounded-[1px] bg-foreground" />
              </span>
            )}
            <Digit value={Math.floor(group / 10)} />
            <Digit value={group % 10} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** The words stamped for each state of the job. */
const SIGN_WORDS: Record<Sign, string> = {
  work: "AT WORK",
  you: "YOUR TURN",
  paused: "PAUSED",
  stopped: "STOPPED",
  done: "DONE",
};

/**
 * How the job stands, stamped on a plot of ground beside the building (office.scene SIGN_BOX,
 * fitted in view with it): a band of tape while it is at work, then a stamp that lands as the
 * state changes — ember when it is the user's turn or paused on Continue, the ink when it is
 * done, faint when stopped — with how long it took under a finished or stopped one. One that
 * stands as the office opens lands once the office stands (`land`), so it is seen landing.
 */
function GroundSign({
  stage,
  sign,
  ended,
  land,
}: {
  stage: Stage;
  sign: Sign;
  /** When the job was seen to end, in scene seconds; null while it runs. */
  ended: number | null;
  /** How long the stamp waits to land (ms): until the office stands, as it opens; at once after. */
  land: number;
}) {
  return (
    <div
      className="office-fade pointer-events-none absolute top-0 left-0 origin-top-left"
      style={{
        width: SIGN_BOX.w,
        height: SIGN_BOX.h,
        transform: stage.sign.matrix,
        animationDelay: `${stage.popAt}ms`,
      }}
    >
      <Stamp key={sign} sign={sign} ended={ended} land={land} />
    </div>
  );
}

function Stamp({
  sign,
  ended,
  land,
}: {
  sign: Sign;
  ended: number | null;
  land: number;
}) {
  // Read as it mounts: a stamp that changes later lands at once
  const [wait] = useState(land);
  if (sign === "work")
    return (
      <div className="absolute inset-x-0 top-5 flex h-13.5 items-center overflow-hidden pl-7 font-bold text-[26px] text-foreground/45 tracking-[0.2em]">
        {/* One repeat wider than the tape, slid along by a repeat and round again (office-tape) */}
        <span
          aria-hidden
          className="absolute inset-y-0 right-0 -left-[51px] animate-office-tape bg-[repeating-linear-gradient(-45deg,color-mix(in_oklab,var(--ink)_14%,transparent)_0_18px,transparent_18px_36px)] motion-reduce:animate-none"
        />
        <span className="relative">{SIGN_WORDS.work}</span>
      </div>
    );
  const took =
    ended !== null && (sign === "done" || sign === "stopped")
      ? `${sign === "done" ? "IN" : "AFTER"} ${clockOf(ended)}`
      : null;
  return (
    <div className="absolute top-6 left-6 -rotate-8">
      <div
        className={cn(
          "flex animate-office-stamp flex-col items-center whitespace-nowrap rounded-[18px] border-[7px] border-double px-6.5 pt-1.5 pb-2.5 font-extrabold text-[92px] leading-none tracking-[0.06em] opacity-80 motion-reduce:animate-none",
          sign === "done" && "text-foreground",
          (sign === "you" || sign === "paused") && "text-waiting",
          sign === "stopped" && "text-foreground/40",
        )}
        style={{ animationDelay: `${wait}ms` }}
      >
        {SIGN_WORDS[sign]}
        {took && (
          <span className="mt-2 border-current border-t-[3px] pt-2 font-bold font-mono text-[0.36em] tracking-[0.12em]">
            {took}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * A faint red on the ground the building stands on, not its floors, while the app has stopped the
 * job and waits on Continue (office signOf "paused": a failed model call, a restart, the step
 * limit). It comes and goes slowly, under the ground's lines.
 */
function Alarm({ stage, on }: { stage: Stage; on: boolean }) {
  const { matrix, w, d } = stage.ground;
  return (
    <g
      transform={matrix}
      style={{ opacity: on ? 1 : 0, transition: "opacity 1.2s ease" }}
    >
      <defs>
        <radialGradient id="office-alarm">
          <stop
            offset="0"
            style={{ stopColor: "var(--destructive)", stopOpacity: 0.12 }}
          />
          <stop
            offset="0.55"
            style={{ stopColor: "var(--destructive)", stopOpacity: 0.07 }}
          />
          <stop
            offset="1"
            style={{ stopColor: "var(--destructive)", stopOpacity: 0 }}
          />
        </radialGradient>
      </defs>
      <ellipse
        cx={w / 2}
        cy={d / 2}
        rx={w / 2 + 100}
        ry={d / 2 + 100}
        fill="url(#office-alarm)"
      />
    </g>
  );
}

/** The ground's lines fade toward their ends. */
function Fades() {
  const stops = (
    <>
      <stop offset="0" style={{ stopColor: "var(--ink)", stopOpacity: 0 }} />
      <stop
        offset="0.3"
        style={{ stopColor: "var(--ink)", stopOpacity: 0.2 }}
      />
      <stop
        offset="0.7"
        style={{ stopColor: "var(--ink)", stopOpacity: 0.2 }}
      />
      <stop offset="1" style={{ stopColor: "var(--ink)", stopOpacity: 0 }} />
    </>
  );
  return (
    <defs>
      <linearGradient id="office-fade-x" x1="0" y1="0" x2="1" y2="1">
        {stops}
      </linearGradient>
      <linearGradient id="office-fade-y" x1="1" y1="0" x2="0" y2="1">
        {stops}
      </linearGradient>
    </defs>
  );
}

/** The sketch's hatching and the floors' light, in the theme's own greys. */
function Patterns() {
  const hatch = (id: string, gap: number, turn: number, percent: number) => (
    <pattern
      id={id}
      width={gap}
      height={gap}
      patternUnits="userSpaceOnUse"
      patternTransform={`rotate(${turn})`}
    >
      <line
        x1="0"
        y1="0"
        x2="0"
        y2={gap}
        style={{ stroke: ink(percent), strokeWidth: 0.8 }}
      />
    </pattern>
  );
  const floor = (id: string, from: string, to: string) => (
    <linearGradient id={id} x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" style={{ stopColor: from }} />
      <stop offset="1" style={{ stopColor: to }} />
    </linearGradient>
  );
  return (
    <defs>
      {hatch("office-hatch-side", 3.4, -38, 20)}
      {hatch("office-hatch-shade", 3, 28, 30)}
      {hatch("office-hatch-soft", 3.2, 28, 14)}
      {floor("office-floor-own", "var(--gray-25)", "var(--gray-100)")}
      {floor("office-floor-lobby", "var(--gray-50)", "var(--gray-150)")}
      {floor("office-floor-work", "var(--gray-0)", "var(--gray-75)")}
    </defs>
  );
}

/** The building itself: slab, floors, walls and the board, each landing at its own moment. */
const Built = memo(function Built({ stage }: { stage: Stage }) {
  return (
    <>
      {stage.faces.map((face) => (
        <Fragment key={face.id}>
          <polygon
            className="office-drop"
            points={face.points}
            style={{ fill: face.fill, animationDelay: `${face.delay}ms` }}
          />
          {face.hatch && (
            <polygon
              className="office-drop"
              points={face.points}
              fill="url(#office-hatch-side)"
              style={{ animationDelay: `${face.delay}ms` }}
            />
          )}
        </Fragment>
      ))}
      {stage.lines.map((line) => (
        <Edge
          key={line.id}
          line={line}
          className="office-drop"
          style={{ animationDelay: `${line.delay}ms` }}
        />
      ))}
    </>
  );
});

function Edge({
  line,
  className,
  style,
}: {
  line: Stroke;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <line
      className={className}
      x1={line.x1}
      y1={line.y1}
      x2={line.x2}
      y2={line.y2}
      style={{
        stroke: line.color,
        strokeWidth: 1,
        strokeLinecap: "round",
        ...style,
      }}
    />
  );
}

/**
 * Who a held hand-off waits on, over the floor: a dashed line from each of them to the bot it is
 * for, ending in a dot at its feet. Drawn under the furniture, as a mark on the ground.
 */
function Links({ links }: { links: Moment["links"] }) {
  return (
    <>
      {links.map((link) => {
        // A little sag toward the viewer, so two lines between near desks do not lie on one another
        const mx = (link.x1 + link.x2) / 2;
        const my =
          (link.y1 + link.y2) / 2 + Math.abs(link.x2 - link.x1) * 0.12 + 6;
        return (
          <g key={link.id} opacity={link.opacity}>
            <path
              d={`M${link.x1} ${link.y1} Q${mx} ${my} ${link.x2} ${link.y2}`}
              style={{
                fill: "none",
                stroke: ink(42),
                strokeWidth: 1.3,
                strokeDasharray: "3 3.5",
                strokeLinecap: "round",
              }}
            />
            <circle
              cx={link.x2}
              cy={link.y2}
              r={2.6}
              style={{ fill: ink(55) }}
            />
          </g>
        );
      })}
    </>
  );
}

const easeOut = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - (1 - x) ** 3);

/** A piece of furniture or wall; a helper's desk is drawn in line by line as its bot joins. */
const PieceShape = memo(function PieceShape({
  piece,
  draw,
}: {
  piece: Piece;
  draw: number;
}) {
  const drawing = draw < 1;
  return (
    <g className="office-drop" style={{ animationDelay: `${piece.delay}ms` }}>
      <g opacity={drawing ? easeOut((draw - 0.35) / 0.65) : 1}>
        {piece.faces.map((face) => (
          <Fragment key={face.id}>
            <polygon points={face.points} style={{ fill: face.fill }} />
            {face.hatch && (
              <polygon points={face.points} fill="url(#office-hatch-side)" />
            )}
          </Fragment>
        ))}
      </g>
      {piece.edges.map((edge) => (
        <Edge
          key={edge.id}
          line={edge}
          style={
            drawing
              ? {
                  strokeDasharray: `${edge.length} ${edge.length}`,
                  strokeDashoffset: edge.length * (1 - easeOut(draw)),
                }
              : undefined
          }
        />
      ))}
      {(!drawing || draw > 0.7) &&
        piece.mugs.map((mug) => (
          <MugShape key={`${mug.cx},${mug.cy}`} mug={mug} />
        ))}
    </g>
  );
});

function MugShape({ mug }: { mug: Mug }) {
  const line = { stroke: ink(60), strokeWidth: 1 };
  return (
    <g>
      <ellipse
        cx={mug.bx}
        cy={mug.by}
        rx={mug.rx}
        ry={mug.ry}
        style={{ fill: "var(--gray-50)", ...line }}
      />
      <rect
        x={mug.cx - mug.rx}
        y={mug.cy}
        width={mug.rx * 2}
        height={Math.max(0, mug.by - mug.cy)}
        style={{ fill: "var(--gray-50)" }}
      />
      <line
        x1={mug.cx - mug.rx}
        y1={mug.cy}
        x2={mug.bx - mug.rx}
        y2={mug.by}
        style={line}
      />
      <line
        x1={mug.cx + mug.rx}
        y1={mug.cy}
        x2={mug.bx + mug.rx}
        y2={mug.by}
        style={line}
      />
      <ellipse
        cx={mug.cx}
        cy={mug.cy}
        rx={mug.rx}
        ry={mug.ry}
        style={{ fill: "var(--gray-0)", ...line }}
      />
    </g>
  );
}

/** A paper lying on a surface or pinned on the board: an order, or an answer in ink. */
function PaperShape({ paper }: { paper: Paper }) {
  return (
    <g opacity={paper.opacity}>
      <polygon
        points={paper.points}
        style={{
          fill: paper.dark ? "var(--ink)" : "var(--gray-0)",
          stroke: paper.ember
            ? "var(--waiting)"
            : paper.dark
              ? "var(--ink)"
              : ink(50),
          strokeWidth: paper.ember ? 1.6 : 1,
          strokeLinejoin: "round",
        }}
      />
      {paper.lines.map((points) => (
        <polyline
          key={points}
          points={points}
          style={{
            fill: "none",
            stroke: paper.dark
              ? "color-mix(in oklab, var(--gray-0) 55%, transparent)"
              : ink(32),
            strokeWidth: 1.2,
            strokeLinecap: "round",
          }}
        />
      ))}
    </g>
  );
}

/** A sheet thrown up at the report, lying in the ground's plane: its lines on its face, its back blank. */
function SheetShape({ sheet }: { sheet: Sheet }) {
  return (
    <g
      transform={`${sheet.plane} rotate(${sheet.turn}) scale(${sheet.face} 1)`}
      opacity={sheet.opacity}
    >
      <rect
        x={-7}
        y={-9}
        width={14}
        height={18}
        rx={1.6}
        style={{
          fill: sheet.dark ? "var(--ink)" : "var(--gray-0)",
          stroke: sheet.dark ? "var(--ink)" : ink(45),
          strokeWidth: 0.8,
        }}
      />
      {sheet.face > 0 &&
        [-5, -2, 1].map((top, index) => (
          <rect
            key={top}
            x={-4.5}
            y={top}
            width={index === 2 ? 5 : 9}
            height={1.4}
            style={{
              fill: sheet.dark
                ? "color-mix(in oklab, var(--gray-0) 55%, transparent)"
                : ink(32),
            }}
          />
        ))}
    </g>
  );
}

/**
 * A bot where it stands or walks, with the paper it carries; it pops in once the office stands.
 * A leap lifts it, squashes it about its feet and, in a flip, turns it over about its middle.
 */
function BotSprite({
  walker,
  face,
  popAt,
}: {
  walker: Walker;
  face?: BotRef;
  popAt: number;
}) {
  const { x, y, hop, tilt, spin, squash, scale, size, opacity } = walker;
  return (
    <g className="office-fade" style={{ animationDelay: `${popAt}ms` }}>
      {walker.selected && (
        <ellipse
          cx={x}
          cy={y}
          rx={size * 0.42}
          ry={size * 0.17}
          style={{
            fill: "color-mix(in oklab, var(--brand) 10%, transparent)",
            stroke: "color-mix(in oklab, var(--brand) 55%, transparent)",
            strokeWidth: 1.5,
          }}
        />
      )}
      <ellipse
        cx={x}
        cy={y}
        rx={Math.max(1, size * 0.27 - Math.min(hop * 0.5, size * 0.15))}
        ry={Math.max(1, size * 0.1 - Math.min(hop * 0.2, size * 0.05))}
        fill="url(#office-hatch-shade)"
        opacity={opacity}
      />
      <g
        transform={`translate(${x} ${y - hop}) rotate(${tilt}) scale(${scale * (1 + squash * 0.6)} ${scale * (1 - squash)}) translate(0 ${-size / 2}) rotate(${spin}) translate(${-size / 2} ${-size / 2})`}
        opacity={opacity}
      >
        <g className="office-pop" style={{ animationDelay: `${popAt}ms` }}>
          <BotMark
            size={size}
            seed={walker.bot}
            {...iconProps(face?.icon)}
            state={walker.working ? "thinking" : "idle"}
            crossed={walker.crossed}
            notify={false}
          />
        </g>
      </g>
      {walker.carry && (
        <g
          transform={`translate(${x + size * 0.1} ${y - hop - size - 16}) rotate(${-tilt * 1.4 - 4})`}
        >
          <rect
            x={-11}
            y={-14}
            width={22}
            height={28}
            rx={2.5}
            style={{
              fill: walker.carry.dark ? "var(--ink)" : "var(--gray-0)",
              stroke: walker.carry.ember
                ? "var(--waiting)"
                : walker.carry.dark
                  ? "var(--ink)"
                  : ink(45),
              strokeWidth: 1.3,
            }}
          />
          {[-8, -3.5, 1].map((top, index) => (
            <rect
              key={top}
              x={-6.5}
              y={top}
              width={index === 2 ? 7.5 : 13}
              height={2}
              style={{
                fill: walker.carry?.dark
                  ? "color-mix(in oklab, var(--gray-0) 55%, transparent)"
                  : ink(32),
              }}
            />
          ))}
          {walker.carry.stamp && (
            <rect
              x={-8.5}
              y={3.5}
              width={15}
              height={7}
              rx={1.5}
              transform="rotate(-14)"
              style={{
                fill: "none",
                stroke: "var(--destructive)",
                strokeWidth: 1.5,
              }}
            />
          )}
        </g>
      )}
    </g>
  );
}

function Hourglass() {
  return (
    <svg
      width={22}
      height={29}
      viewBox="0 0 18 24"
      aria-hidden
      className="block shrink-0"
    >
      <path
        d="M2 1.5h14M2 22.5h14"
        style={{
          stroke: "var(--ink)",
          strokeWidth: 1.8,
          strokeLinecap: "round",
        }}
      />
      <path
        d="M3.5 1.5c0 5.5 5.5 7 5.5 10.5S3.5 17 3.5 22.5M14.5 1.5c0 5.5-5.5 7-5.5 10.5s5.5 5 5.5 10.5"
        style={{
          fill: "var(--gray-0)",
          stroke: "var(--ink)",
          strokeWidth: 1.4,
        }}
      />
      <path
        className="origin-bottom animate-office-sand-top [transform-box:fill-box]"
        d="M5 4.5h8c-.6 2.6-2.6 4-4 5.4-1.4-1.4-3.4-2.8-4-5.4z"
        style={{ fill: "var(--ink)" }}
      />
      <rect
        x="8.4"
        y="11"
        width="1.2"
        height="7"
        style={{ fill: "var(--ink)" }}
      />
      <path
        className="origin-bottom animate-office-sand-bottom [transform-box:fill-box]"
        d="M4.6 21c.8-2.4 2.6-3.5 4.4-4.2 1.8.7 3.6 1.8 4.4 4.2z"
        style={{ fill: "var(--ink)" }}
      />
    </svg>
  );
}

/** A send the room turned down, stamped where it stopped, with the room's words for why. */
function Refused({
  spot,
  scale,
  text,
}: {
  spot: { x: number; y: number };
  scale: number;
  text: string;
}) {
  return (
    <div
      className="absolute flex items-center gap-2"
      style={{ left: spot.x + 30, top: spot.y - 8 }}
    >
      <div className="relative h-9.5 w-7.5 shrink-0 -rotate-5 rounded-[3px] border border-foreground/30 bg-background">
        <span
          className="absolute top-3.5 -left-0.5 rounded-[3px] border-2 border-destructive bg-background/90 px-0.75 font-semibold text-[10.5px] text-destructive"
          style={{ transform: `rotate(-14deg) scale(${scale})` }}
        >
          Refused
        </span>
      </div>
      <span className="line-clamp-3 w-48 rounded-lg border border-border bg-background/95 px-2 py-1 text-[11.5px] text-foreground/80 leading-snug">
        {text}
      </span>
    </div>
  );
}

/**
 * The final report's words, once it lies at your counter; the files it handed over stand under
 * the job's name (OfficeHead). It stays in one place, at the office's foot above the zoom
 * buttons, whatever the office is panned or zoomed to, and goes when the thread goes on after it.
 */
function ReportCard({ report, face }: { report: OfficeEvent; face?: BotRef }) {
  return (
    <section
      aria-label={`Final report from ${report.from}`}
      className="absolute bottom-15 left-4 flex max-h-[calc(100%-13rem)] w-75 animate-in flex-col gap-2 overflow-y-auto rounded-2xl bg-background px-3.5 pt-3 pb-3.5 shadow-lg ring-1 ring-border fade-in slide-in-from-bottom-1 duration-300 scrollbar-none"
    >
      <div className="flex items-center gap-1.5 text-[12px]">
        <BotMark
          size={16}
          seed={report.from}
          {...iconProps(face?.icon)}
          notify={false}
        />
        <span className="font-semibold">Final report</span>
        <span className="text-muted-foreground">· {report.from}</span>
      </div>
      <p className="line-clamp-6 text-[13px] leading-normal">
        {plainText(report.text)}
      </p>
    </section>
  );
}

/** How wide a pressed plate opens. */
const PLATE_OPEN = 288;

/**
 * A plate's measure: the pill's own padding about its mark (`pl-2`, `pr-2.25`), how tall it
 * stands (`h-6.5`), and the room kept between two plates.
 */
const PLATE_PAD = 17;
const PLATE_TALL = 26;
const PLATE_GAP = 4;
/** How near the office's side an open plate may come before it unfolds inward instead. */
const PLATE_EDGE = 12;

/** How much room a plate takes as drawn: folded to its mark, and what its name and line add open. */
type Room = { mark: number; rest: number };

/**
 * Which open plates would lie over another plate, as the bots stand at their desks: those fold
 * to their marks too, until pointed at. The pressed plate stays open, then any that wants the
 * user, then the rest in the office's order, so a crowded office still reads plate by plate
 * rather than as lines written over one another. Judged by the room each plate takes as drawn
 * (PlateAt), not by a guess at its letters.
 */
function useCrowding(
  entries: {
    bot: string;
    home: { x: number; y: number };
    open: boolean;
    first: boolean;
    words: string;
  }[],
  picked: string | null,
) {
  const rooms = useRef(new Map<string, Room>());
  const onRoom = useCallback((bot: string, room: Room) => {
    rooms.current.set(bot, room);
  }, []);
  const [crowded, setCrowded] = useState<string[]>([]);
  // Judged again when a plate's words, where it sits or which one is pressed changes; the
  // plates measure themselves first, in their own layout effects
  const key = JSON.stringify([
    picked,
    entries.map((one) => [
      one.bot,
      Math.round(one.home.x),
      Math.round(one.home.y),
      one.open,
      one.words,
    ]),
  ]);
  useLayoutEffect(() => {
    const box = (bot: string, x: number, y: number, wide: number) => ({
      bot,
      l: x - wide / 2,
      r: x + wide / 2,
      t: y - PLATE_TALL,
      b: y,
    });
    type Box = ReturnType<typeof box>;
    const over = (a: Box, b: Box) =>
      a.l < b.r + PLATE_GAP &&
      b.l < a.r + PLATE_GAP &&
      a.t < b.b + PLATE_GAP &&
      b.t < a.b + PLATE_GAP;
    const folded = entries.flatMap((one) => {
      const room = rooms.current.get(one.bot);
      return room ? [box(one.bot, one.home.x, one.home.y, room.mark)] : [];
    });
    const rank = (one: (typeof entries)[number]) =>
      one.bot === picked ? 2 : one.first ? 1 : 0;
    const open: Box[] = [];
    const shut: string[] = [];
    for (const one of entries
      .filter((entry) => entry.open || entry.bot === picked)
      .sort((a, b) => rank(b) - rank(a))) {
      const room = rooms.current.get(one.bot);
      if (!room) continue;
      const wide = box(one.bot, one.home.x, one.home.y, room.mark + room.rest);
      const clash =
        one.bot !== picked &&
        [...folded, ...open].some(
          (other) => other.bot !== one.bot && over(wide, other),
        );
      if (clash) shut.push(one.bot);
      else open.push(wide);
    }
    setCrowded((was) =>
      was.length === shut.length && was.every((bot) => shut.includes(bot))
        ? was
        : shut,
    );
  }, [key]);
  return { crowded, onRoom };
}

/**
 * A bot's plate over its head: the mark of how it stands and its name, then one line for where it
 * stands — the step it is on shining while it works, what it asks in ember, what it handed back
 * as files to open. A bot that is not at work and wants nothing of you folds to that mark alone,
 * and unfolds while it or its bot is pointed at or focused. Pressing it opens the plate itself,
 * where it stands, to what the bot was asked and how far it has come (office briefOf), until it
 * is pressed again; above the bot, or over it when the window's top is too near. While sheets
 * fly at the report the plates step back (`hush`).
 */
function PlateAt({
  scene,
  plate,
  crowded,
  onRoom,
  t,
  start,
  bot,
  head,
  foot,
  lift,
  size,
  width,
  picked,
  hush,
  onPick,
  from,
}: {
  scene: OfficeScene;
  plate: Plate;
  /** Its line would lie over another plate: folded too, until pointed at (useCrowding). */
  crowded: boolean;
  onRoom: (bot: string, room: Room) => void;
  t: number;
  start: number;
  bot: string;
  head: { x: number; y: number };
  foot: number;
  lift: number;
  size: number;
  width: number;
  picked: boolean;
  hush: boolean;
  onPick: () => void;
  from: string;
}) {
  const { state, line } = plate;
  const described = useId();
  const top = head.y - 6 - lift;
  const folded = (plate.folded || crowded) && !picked;
  const you = state.key === "asking" || state.key === "paused";
  // How much room it takes, folded and open, as drawn: for the crowding pass, and so a plate
  // near the office's edge unfolds away from it rather than past it; opened, how tall it stands
  const pill = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLSpanElement>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [tall, setTall] = useState(0);
  useLayoutEffect(() => {
    if (!pill.current || !mark.current) return;
    let rest = 0;
    for (const inner of pill.current.querySelectorAll<HTMLElement>(
      "[data-unfold]",
    ))
      rest += inner.scrollWidth;
    const next = { mark: mark.current.offsetWidth + PLATE_PAD, rest };
    onRoom(bot, next);
    setRoom((was) =>
      was && was.mark === next.mark && was.rest === next.rest ? was : next,
    );
    const height = picked ? pill.current.offsetHeight : 0;
    setTall((was) => (was === height ? was : height));
  });
  const brief = picked ? briefOf(scene, bot, t) : null;
  const down = picked && tall > 0 && top - tall < 8;
  const open = room ? room.mark + room.rest : 0;
  const anchor = !room
    ? null
    : head.x + open / 2 > width - PLATE_EDGE
      ? { right: -room.mark / 2 }
      : head.x - open / 2 < PLATE_EDGE
        ? { left: -room.mark / 2 }
        : null;
  const time =
    plate.since !== null ? (
      <Elapsed
        from={start + plate.since * 1000}
        className="shrink-0 text-[10.5px] text-muted-foreground"
      />
    ) : plate.took !== null ? (
      <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground tabular-nums">
        {clockOf(plate.took)}
      </span>
    ) : null;
  return (
    <div
      data-plate
      className={cn(
        "group/plate absolute size-0 transition-opacity duration-500",
        picked
          ? "z-30"
          : folded
            ? "z-10 hover:z-30 focus-within:z-30"
            : "z-20 hover:z-30 focus-within:z-30",
        hush && !picked && "opacity-15",
      )}
      style={{ left: head.x, top }}
    >
      {/* The bot's body answers to the pointer too */}
      <span
        className="pointer-events-auto absolute top-1"
        style={{
          left: -size * 0.4,
          width: size * 0.8,
          height: Math.max(12, foot - top - 4),
        }}
      />
      <div
        ref={pill}
        // Centred over its bot; by an edge, held there by its folded end and unfolding inward.
        // Opened, as wide as its words need at most and kept inside the office
        style={
          picked
            ? {
                left: Math.min(
                  Math.max(-PLATE_OPEN / 2, PLATE_EDGE - head.x),
                  width - PLATE_EDGE - PLATE_OPEN - head.x,
                ),
                width: PLATE_OPEN,
                ...(down ? { top: -PLATE_TALL } : { bottom: 0 }),
              }
            : (anchor ?? undefined)
        }
        className={cn(
          "pointer-events-auto absolute flex text-[12px] transition-shadow",
          picked
            ? cn(
                "animate-in flex-col rounded-2xl pb-2.5 shadow-lg fade-in zoom-in-95 duration-150",
                down ? "origin-top" : "origin-bottom",
              )
            : "bottom-0 h-6.5 items-center whitespace-nowrap rounded-full pr-2.25 shadow-md",
          !picked && !anchor && "left-0 -translate-x-1/2",
          you
            ? "bg-background ring-[1.5px] ring-waiting"
            : picked
              ? "bg-background ring-[1.5px] ring-brand/55"
              : state.key === "held"
                ? "border border-foreground/35 border-dashed bg-background/95"
                : "bg-background/95 ring-1 ring-border",
          state.key === "none" && !picked && "opacity-55",
        )}
      >
        {/* The plate's own line: its row as it stands, and the first row of it opened */}
        <div
          className={
            picked
              ? "flex h-8 min-w-0 items-center whitespace-nowrap pr-3"
              : "contents"
          }
        >
          <button
            type="button"
            onClick={onPick}
            aria-label={`${bot} · ${state.label}`}
            aria-describedby={picked ? described : undefined}
            aria-expanded={picked}
            className={cn(
              "flex h-full min-w-0 items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              picked ? "pl-3" : "pl-2",
            )}
          >
            <span ref={mark} className="flex shrink-0 items-center">
              <StateGlyph state={state.key} />
            </span>
            <Unfold open={!folded}>
              <span className="font-semibold">{bot}</span>
            </Unfold>
            {line.kind !== "files" && (
              <Unfold open={!folded} fit={picked}>
                <LineWords line={line} />
              </Unfold>
            )}
          </button>
          {line.kind === "files" && (
            <Unfold open={!folded} fit={picked}>
              <FileChips paths={line.paths} from={from} />
            </Unfold>
          )}
          {time && (
            <Unfold open={!folded} fit={picked}>
              {time}
            </Unfold>
          )}
        </div>
        {brief && (
          <Brief
            id={described}
            brief={brief}
            own={bot === scene.office.coord}
            files={line.kind === "files" ? line.paths : []}
            from={from}
          />
        )}
      </div>
    </div>
  );
}

/**
 * What a folded plate keeps back: no room at all while folded, unfolding in place while the plate
 * is pointed at or focused, and always open on a plate that is not folded. On a plate opened to
 * its brief (`fit`) it gives way to the row's width, its words cut short.
 */
function Unfold({
  open,
  fit = false,
  children,
}: {
  open: boolean;
  fit?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex overflow-hidden transition-[max-width,opacity] duration-200 ease-out motion-reduce:transition-none",
        fit && "min-w-0",
        open
          ? "max-w-80 opacity-100"
          : "max-w-0 opacity-0 group-focus-within/plate:max-w-80 group-focus-within/plate:opacity-100 group-hover/plate:max-w-80 group-hover/plate:opacity-100",
      )}
    >
      {/* Its own width even while folded, so the plate knows how wide it opens (PlateAt) */}
      <span
        data-unfold
        className={cn("flex items-center pl-1.5", fit ? "min-w-0" : "shrink-0")}
      >
        {children}
      </span>
    </span>
  );
}

/** A plate's words: a step shines while it runs, what wants you is in ember, the rest is quiet. */
function LineWords({ line }: { line: Exclude<PlateLine, { kind: "files" }> }) {
  // Cut on the words themselves: the shine lays its own layer over them (shiny-text)
  if (line.kind === "step")
    return <ShinyText text={line.text} className="min-w-0 max-w-56 truncate" />;
  return (
    <span
      className={cn(
        "min-w-0 max-w-56 truncate",
        line.kind === "you" ? "text-waiting" : "text-muted-foreground",
      )}
    >
      {line.text}
    </span>
  );
}

/** The files a bot handed back, on its plate: the first to open, and how many more its card lists. */
function FileChips({ paths, from }: { paths: string[]; from: string }) {
  const [first] = paths;
  const Icon = fileIcon(first);
  return (
    <span className="flex min-w-0 items-center gap-1">
      <FileLink
        path={first}
        from={from}
        className="flex h-4.5 min-w-0 items-center gap-1 rounded-md bg-foreground/7 pr-1.5 pl-1 text-[11.5px] outline-none transition-colors hover:bg-foreground/13 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Icon className="size-3 shrink-0 text-muted-foreground" />
        <span className="max-w-40 truncate">{first.split("/").pop()}</span>
      </FileLink>
      {paths.length > 1 && (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          +{paths.length - 1}
        </span>
      )}
    </span>
  );
}

/**
 * What a pressed plate opens to under its line: what the bot was asked, the question it waits on
 * you with or the answer it gave, how far it has come, and every file it made when there is more
 * than the line's first. Its tab in the room, opened as it is pressed, holds the rest.
 */
function Brief({
  id,
  brief,
  own,
  files,
  from,
}: {
  id: string;
  brief: ReturnType<typeof briefOf>;
  /** The coordinator's: what it was asked is the job. */
  own: boolean;
  files: string[];
  from: string;
}) {
  return (
    <div
      id={id}
      className="flex min-w-0 flex-col gap-1.5 px-3 pt-0.5 text-[12px] leading-snug"
    >
      {brief.asked && (
        <BriefRow label={own ? "The job" : "Asked"}>
          <span className="line-clamp-3">
            {brief.asked}
            {brief.more ? ` · ${brief.more} more` : ""}
          </span>
        </BriefRow>
      )}
      {brief.question && (
        <BriefRow label="Question">
          <span className="line-clamp-4">{brief.question}</span>
        </BriefRow>
      )}
      {brief.answer && (
        <BriefRow label="Answer">
          <span className="line-clamp-3">{brief.answer}</span>
        </BriefRow>
      )}
      {brief.sofar && <BriefRow label="So far">{brief.sofar}</BriefRow>}
      {files.length > 1 && (
        <div className="flex min-w-0 flex-wrap gap-1 pl-14.5">
          {files.map((path) => {
            const Icon = fileIcon(path);
            return (
              <FileLink
                key={path}
                path={path}
                from={from}
                className="flex h-5.5 min-w-0 max-w-full items-center gap-1 rounded-md bg-foreground/7 pr-1.5 pl-1 text-[11.5px] outline-none transition-colors hover:bg-foreground/13 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Icon className="size-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate">
                  {path.split("/").pop()}
                </span>
              </FileLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BriefRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-12.5 shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-foreground/85">{children}</span>
    </div>
  );
}

/**
 * The mark a state wears on a plate, all a folded one shows: a live dot, an ember one, an open
 * ring, an hourglass, a tick, a square when stopped, a faint dot for a bot not called yet.
 */
function StateGlyph({ state }: { state: SeatKey }) {
  switch (state) {
    case "run":
      return (
        <span className="size-1.75 shrink-0 animate-pulse rounded-full bg-foreground motion-reduce:animate-none" />
      );
    case "asking":
      return <span className="size-1.75 shrink-0 rounded-full bg-waiting" />;
    case "paused":
      return (
        <span className="flex h-2 shrink-0 gap-0.5" aria-hidden>
          <span className="w-0.5 rounded-full bg-waiting" />
          <span className="w-0.5 rounded-full bg-waiting" />
        </span>
      );
    case "ended":
      return (
        <span className="size-1.5 shrink-0 rounded-full border-[1.5px] border-muted-foreground" />
      );
    case "held":
      return (
        <svg
          width={8}
          height={11}
          viewBox="0 0 12 14"
          aria-hidden
          className="shrink-0"
        >
          <path
            d="M1.5 1h9M1.5 13h9M2.5 1c0 3.5 3.5 4.5 3.5 6S2.5 9.5 2.5 13M9.5 1c0 3.5-3.5 4.5-3.5 6s3.5 2.5 3.5 6"
            style={{
              fill: "none",
              stroke: "currentColor",
              strokeWidth: 1.5,
              strokeLinecap: "round",
            }}
          />
        </svg>
      );
    case "done":
      return (
        <svg
          width={10}
          height={8}
          viewBox="0 0 11 9"
          aria-hidden
          className="shrink-0"
        >
          <path
            d="M1 4.5l3 3L10 1.5"
            style={{
              fill: "none",
              stroke: "currentColor",
              strokeWidth: 1.7,
              strokeLinecap: "round",
              strokeLinejoin: "round",
            }}
          />
        </svg>
      );
    case "stopped":
      return (
        <span className="size-1.75 shrink-0 rounded-xs bg-muted-foreground" />
      );
    case "none":
      return (
        <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
      );
  }
}
