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
  cardOf,
  clockOf,
  filesOf,
  heldFor,
  type OfficeScene,
  type Plate,
  type PlateLine,
  type ProgressSeat,
  plateOf,
  progressOf,
} from "@/features/bot/office";
import {
  type Moment,
  type Mug,
  momentOf,
  motionOf,
  type Paper,
  type Piece,
  restAt,
  type Stage,
  type Stroke,
  stageOf,
  tripsOf,
  type Walker,
} from "@/features/bot/office.scene";
import { type BotRef, useOfficeCaption } from "@/features/bot/thread.store";
import { fileIcon } from "@/features/workspace/components/file-thumb";
import { FileLink } from "@/features/workspace/components/file-view";
import type { FileOnDisk } from "@/features/workspace/workspace.schema";
import { useServerRoute } from "@/lib/protocol/use-server-route";
import { cn, plainText } from "@/lib/utils";

/** How far the office zooms out and in: far enough to see the whole ground, near enough to read a desk. */
const ZOOM = { min: 0.6, max: 3 };

type View = { z: number; x: number; y: number };

const zoomAt = (view: View, fx: number, fy: number, next: number): View => {
  const z = Math.min(ZOOM.max, Math.max(ZOOM.min, next));
  return {
    z,
    x: fx - (z / view.z) * (fx - view.x),
    y: fy - (z / view.z) * (fy - view.y),
  };
};

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
 * zoom like a canvas. It builds itself as it opens. Over each bot a plate says in one line what
 * it is on, what it asks or what it handed back; a bot that is not at work folds to its name
 * until pointed at, and pressing a plate opens a card with the rest. The job's name, how far it
 * has come and how long it has run stand at its top left.
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
  onSelect: (bot: string) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const size = useSize(box);
  const stage = useMemo(
    () => (size && size.w > 0 && size.h > 0 ? stageOf(scene, size) : null),
    [scene, size],
  );
  const trips = useMemo(
    () => (stage ? tripsOf(scene, stage.plan) : []),
    [scene, stage],
  );
  const spans = useMemo(
    () => (stage ? motionOf(scene, stage, trips) : null),
    [scene, stage, trips],
  );
  // The build runs once, from the first drawing: then the clock may move
  const [built, setBuilt] = useState(false);
  const builds = stage?.built ?? null;
  useEffect(() => {
    if (builds === null || built) return;
    const done = window.setTimeout(() => setBuilt(true), builds);
    return () => window.clearTimeout(done);
  }, [builds === null, built]);
  const t = useSceneClock(start, built ? spans : null);
  const moment = stage ? momentOf(scene, stage, trips, t, selected) : null;
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
  const [view, setView] = useState<View>({ z: 1, x: 0, y: 0 });
  const drag = useRef<{
    x: number;
    y: number;
    from: View;
    moved: boolean;
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
      setView((was) =>
        zoomAt(
          was,
          fx,
          fy,
          was.z * Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0022)),
        ),
      );
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
    drag.current = null;
    setDragging(false);
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
            </svg>
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
            {moment.report && (
              <ReportCard
                report={moment.report}
                spot={at(moment.report.x, moment.report.y)}
                ground={at(moment.report.gx, moment.report.gy)}
                box={size}
                face={faceOf(moment.report.event.from)}
                files={files.filter((file) => onDisk(file.path))}
                from={from}
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
                face={faceOf(tag.bot)}
                head={at(tag.x, tag.head)}
                foot={at(tag.x, tag.foot).y}
                lift={tag.carrying ? 32 * view.z : 0}
                size={stage.botSize * view.z}
                width={size.w}
                picked={selected === tag.bot}
                onPick={() => onSelect(tag.bot)}
                from={from}
              />
            ))}
          </div>
          <OfficeHead scene={scene} label={label} start={start} />
          <div className="absolute bottom-3.5 left-4 flex items-center gap-0.5 rounded-full bg-background p-0.75 shadow-sm ring-1 ring-border">
            <ZoomButton
              label="Zoom out"
              onClick={() =>
                setView((was) =>
                  zoomAt(was, size.w / 2, size.h / 2, was.z / 1.25),
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
                setView((was) =>
                  zoomAt(was, size.w / 2, size.h / 2, was.z * 1.25),
                )
              }
            >
              <Plus className="size-3.5" />
            </ZoomButton>
            <span className="mx-0.5 h-4 w-px bg-border" />
            <ZoomButton
              label="Fit the office"
              onClick={() => setView({ z: 1, x: 0, y: 0 })}
            >
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
 * from `from` (ms) to `until`, or to now while `until` is null.
 */
function Elapsed({
  from,
  until = null,
  as = "clock",
  className,
}: {
  from: number;
  until?: number | null;
  /** "4:40" on a clock, or "3m 5s" for how long something has stood so (office heldFor). */
  as?: "clock" | "held";
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
      {as === "clock" ? clockOf(seconds) : heldFor(0, seconds)}
    </span>
  );
}

/**
 * The office's head, at its top left: the job's name, a mark for each bot brought in as it
 * stands, the word for the job as a whole, and how long it has run — stopped where it ended.
 * During a call her words stand above it (thursday), and it steps down under them.
 */
function OfficeHead({
  scene,
  label,
  start,
}: {
  scene: OfficeScene;
  label: string;
  start: number;
}) {
  const captioned = useOfficeCaption();
  const { seats, word, you } = progressOf(scene);
  return (
    <div
      className={cn(
        "pointer-events-none absolute left-6 flex max-w-[min(28rem,calc(100%-3rem))] animate-in flex-col gap-2 fade-in transition-[top] duration-300",
        captioned ? "top-24" : "top-5",
      )}
    >
      <h2 className="line-clamp-2 text-balance font-semibold text-[22px] leading-tight tracking-tight">
        {label}
      </h2>
      <div className="flex items-center gap-2.5 text-[12.5px]">
        <span className="flex gap-0.75" aria-hidden>
          {seats.map((seat) => (
            <Segment key={seat.bot} seat={seat} />
          ))}
        </span>
        <span className={you ? "text-waiting" : "text-muted-foreground"}>
          {word}
        </span>
        <span aria-hidden className="text-muted-foreground/50">
          ·
        </span>
        <Elapsed
          from={start}
          until={scene.ended === null ? null : start + scene.ended * 1000}
          className="text-[12px] text-muted-foreground"
        />
      </div>
    </div>
  );
}

/** One bot's mark in the job's progress: filled once it answered, moving while it works, ember while it waits on you. */
function Segment({ seat }: { seat: ProgressSeat }) {
  return (
    <span
      className={cn(
        "h-1.25 w-5.5 rounded-full",
        seat.key === "done" && "bg-foreground",
        seat.key === "run" &&
          "animate-pulse bg-[repeating-linear-gradient(-45deg,var(--ink)_0_2px,transparent_2px_4px)] motion-reduce:animate-none",
        (seat.key === "asking" || seat.key === "paused") && "bg-waiting",
        (seat.key === "held" || seat.key === "ended") &&
          "ring-1 ring-foreground/30 ring-inset",
        seat.key === "stopped" && "bg-foreground/15",
      )}
    />
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

/** A bot where it stands or walks, with the paper it carries; it pops in once the office stands. */
function BotSprite({
  walker,
  face,
  popAt,
}: {
  walker: Walker;
  face?: BotRef;
  popAt: number;
}) {
  const { x, y, hop, tilt, scale, size, opacity } = walker;
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
        rx={Math.max(1, size * 0.27 - hop * 0.5)}
        ry={Math.max(1, size * 0.1 - hop * 0.2)}
        fill="url(#office-hatch-shade)"
        opacity={opacity}
      />
      <g
        transform={`translate(${x} ${y - hop}) rotate(${tilt}) scale(${scale}) translate(${-size / 2} ${-size})`}
        opacity={opacity}
      >
        <g className="office-pop" style={{ animationDelay: `${popAt}ms` }}>
          <BotMark
            size={size}
            seed={walker.bot}
            {...iconProps(face?.icon)}
            state={walker.working ? "thinking" : "idle"}
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

/** How wide the report card is, and how much of the office's foot the zoom buttons keep. */
const REPORT = { width: 300, foot: 64 };

/**
 * The final report where it lies, at your counter: its words and the files the job handed
 * over, each under the bot whose words named it; pressing one opens it. Its card is laid on the
 * ground in front of the building, a line running up to the counter, so it covers neither the
 * desks nor the floor they stand on.
 */
function ReportCard({
  report,
  spot,
  ground,
  box,
  face,
  files,
  from,
}: {
  report: NonNullable<Moment["report"]>;
  spot: { x: number; y: number };
  ground: { x: number; y: number };
  box: { w: number; h: number };
  face?: BotRef;
  files: { path: string; bot: string }[];
  from: string;
}) {
  const left = Math.min(
    Math.max(16, ground.x - REPORT.width / 2),
    box.w - REPORT.width - 16,
  );
  // Kept clear of the zoom buttons: a short office lifts it toward the counter
  const top = Math.max(
    spot.y + 24,
    Math.min(ground.y, box.h - REPORT.foot - 180),
  );
  return (
    <>
      <span
        aria-hidden
        className="absolute w-px bg-foreground/25"
        style={{
          left: spot.x,
          top: spot.y + 6,
          height: Math.max(0, top - spot.y - 6),
        }}
      />
      <section
        aria-label={`Final report from ${report.event.from}`}
        className="pointer-events-auto absolute flex animate-in flex-col gap-2 overflow-y-auto rounded-2xl bg-background px-3.5 pt-3 pb-3.5 shadow-lg ring-1 ring-border fade-in slide-in-from-top-1 duration-300 scrollbar-none"
        style={{
          left,
          top,
          width: REPORT.width,
          maxHeight: Math.max(96, box.h - top - REPORT.foot),
        }}
      >
        <div className="flex items-center gap-1.5 text-[12px]">
          <BotMark
            size={16}
            seed={report.event.from}
            {...iconProps(face?.icon)}
            notify={false}
          />
          <span className="font-semibold">Final report</span>
          <span className="text-muted-foreground">· {report.event.from}</span>
        </div>
        <p className="line-clamp-4 text-[13px] leading-normal">
          {plainText(report.event.text)}
        </p>
        {files.length > 0 && (
          <div className="flex flex-col gap-1">
            {files.map((file) => {
              const Icon = fileIcon(file.path);
              return (
                <FileLink
                  key={file.path}
                  path={file.path}
                  from={from}
                  className="flex h-7 items-center gap-2 rounded-lg bg-foreground/6 px-2.5 text-left text-[12px] outline-none transition-colors hover:bg-foreground/12 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {file.path.split("/").pop()}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {file.bot}
                  </span>
                </FileLink>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

/** How wide the card a pressed plate opens is. */
const PLATE_CARD = 252;

/**
 * A plate's measure: its mark and name with the pill's own padding (`pl-2`, `pr-2.25`), how
 * tall it stands (`h-6.5`), and the room kept between two plates.
 */
const PLATE_PAD = 17;
const PLATE_TALL = 26;
const PLATE_GAP = 4;
/** How near the office's side an open plate may come before it unfolds inward instead. */
const PLATE_EDGE = 12;

/** How much room a plate takes as drawn: folded to its name, and what its line adds open. */
type Room = { name: number; rest: number };

/**
 * Which open plates would lie over another plate, as the bots stand at their desks: those fold
 * to their names too, until pointed at. The pressed plate stays open, then any that wants the
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
      return room ? [box(one.bot, one.home.x, one.home.y, room.name)] : [];
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
      const wide = box(one.bot, one.home.x, one.home.y, room.name + room.rest);
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
 * A bot's plate over its head: its mark and name, then one line for where it stands — the step
 * it is on shining while it works, what it asks in ember, what it handed back as files to open.
 * A bot that is not at work and wants nothing of you folds to its name, and unfolds while pointed
 * at or focused; pressing the plate opens its card, and keeps it open.
 */
function PlateAt({
  scene,
  plate,
  crowded,
  onRoom,
  t,
  start,
  bot,
  face,
  head,
  foot,
  lift,
  size,
  width,
  picked,
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
  face?: BotRef;
  head: { x: number; y: number };
  foot: number;
  lift: number;
  size: number;
  width: number;
  picked: boolean;
  onPick: () => void;
  from: string;
}) {
  const { state, line } = plate;
  const described = useId();
  const top = head.y - 6 - lift;
  const folded = (plate.folded || crowded) && !picked;
  const you = state.key === "asking" || state.key === "paused";
  // How much room it takes, folded and open, as drawn: for the crowding pass, and so a plate
  // near the office's edge unfolds away from it rather than past it
  const pill = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLSpanElement>(null);
  const [room, setRoom] = useState<Room | null>(null);
  useLayoutEffect(() => {
    if (!pill.current || !name.current) return;
    let rest = 0;
    for (const inner of pill.current.querySelectorAll<HTMLElement>(
      "[data-unfold]",
    ))
      rest += inner.scrollWidth;
    const next = { name: name.current.offsetWidth + PLATE_PAD, rest };
    onRoom(bot, next);
    setRoom((was) =>
      was && was.name === next.name && was.rest === next.rest ? was : next,
    );
  });
  const open = room ? room.name + room.rest : 0;
  const anchor = !room
    ? null
    : head.x + open / 2 > width - PLATE_EDGE
      ? { right: -room.name / 2 }
      : head.x - open / 2 < PLATE_EDGE
        ? { left: -room.name / 2 }
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
      className={cn(
        "group/plate absolute size-0",
        picked
          ? "z-30"
          : folded
            ? "z-10 hover:z-30 focus-within:z-30"
            : "z-20 hover:z-30 focus-within:z-30",
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
        // Centred over its bot; by an edge, held there by its folded end and unfolding inward
        style={anchor ?? undefined}
        className={cn(
          "pointer-events-auto absolute bottom-0 flex h-6.5 items-center whitespace-nowrap rounded-full pr-2.25 text-[12px] shadow-md transition-shadow",
          !anchor && "left-0 -translate-x-1/2",
          you
            ? "bg-background ring-[1.5px] ring-waiting"
            : picked
              ? "bg-background ring-[1.5px] ring-brand/55"
              : state.key === "held"
                ? "border border-foreground/35 border-dashed bg-background/95"
                : "bg-background/95 ring-1 ring-border",
          state.key === "none" && "opacity-55",
        )}
      >
        <button
          type="button"
          onClick={onPick}
          aria-label={`${bot} · ${state.label}`}
          aria-describedby={picked ? described : undefined}
          aria-expanded={picked}
          className="flex h-full min-w-0 items-center rounded-full pl-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span ref={name} className="flex items-center">
            <StateGlyph state={state.key} />
            <span className="ml-1.5 font-semibold">{bot}</span>
          </span>
          {line.kind !== "files" && (
            <Unfold open={!folded}>
              <LineWords line={line} />
            </Unfold>
          )}
        </button>
        {line.kind === "files" && (
          <Unfold open={!folded}>
            <FileChips paths={line.paths} from={from} />
          </Unfold>
        )}
        {time && <Unfold open={!folded}>{time}</Unfold>}
      </div>
      {picked && (
        <PlateCard
          id={described}
          scene={scene}
          t={t}
          start={start}
          bot={bot}
          face={face}
          top={top}
          foot={foot}
          head={head}
          width={width}
          files={line.kind === "files" ? line.paths : []}
          from={from}
        />
      )}
    </div>
  );
}

/**
 * What a folded plate keeps back: no room at all while folded, unfolding in place while the plate
 * is pointed at or focused, and always open on a plate that is not folded.
 */
function Unfold({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "flex overflow-hidden transition-[max-width,opacity] duration-200 ease-out motion-reduce:transition-none",
        open
          ? "max-w-80 opacity-100"
          : "max-w-0 opacity-0 group-focus-within/plate:max-w-80 group-focus-within/plate:opacity-100 group-hover/plate:max-w-80 group-hover/plate:opacity-100",
      )}
    >
      {/* Its own width even while folded, so the plate knows how wide it opens (PlateAt) */}
      <span data-unfold className="flex shrink-0 items-center pl-1.5">
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
 * A pressed plate's card: who the bot is here, the state it wears and why, the step it is on,
 * what it was given and what it gave, and what it made. Above the plate unless the window's top
 * is too near, then under the bot's feet.
 */
function PlateCard({
  id,
  scene,
  t,
  start,
  bot,
  face,
  top,
  foot,
  head,
  width,
  files,
  from,
}: {
  id: string;
  scene: OfficeScene;
  t: number;
  start: number;
  bot: string;
  face?: BotRef;
  top: number;
  foot: number;
  head: { x: number; y: number };
  width: number;
  files: string[];
  from: string;
}) {
  const card = cardOf(scene, bot, t);
  const { state } = card;
  const tall =
    110 +
    (state.why ? 22 : 0) +
    (card.now ? 22 : 0) +
    (card.given ? 38 : 0) +
    (card.gave ? 38 : 0) +
    (files.length ? 26 * files.length : 0);
  const above = top - 34 - tall > 8;
  const left = Math.min(
    Math.max(-PLATE_CARD / 2, 8 - head.x),
    width - 8 - PLATE_CARD - head.x,
  );
  return (
    <div
      id={id}
      role="dialog"
      aria-label={bot}
      className={cn(
        "pointer-events-auto absolute flex animate-in flex-col gap-2.25 rounded-2xl bg-popover px-3 pt-2.75 pb-3 text-left text-popover-foreground shadow-xl ring-1 ring-border fade-in duration-150",
        above ? "bottom-9 slide-in-from-bottom-1" : "slide-in-from-top-1",
      )}
      style={{
        left,
        width: PLATE_CARD,
        top: above ? undefined : foot - top + 10,
      }}
    >
      <div className="flex items-center gap-2">
        <BotMark
          size={20}
          seed={bot}
          {...iconProps(face?.icon)}
          notify={false}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold text-[13px] leading-tight">{bot}</span>
          <span className="truncate text-[11px] text-muted-foreground leading-snug">
            {card.role}
          </span>
        </span>
        {state.since !== null && (
          <Elapsed
            from={start + state.since * 1000}
            as="held"
            className="shrink-0 text-[10.5px] text-muted-foreground"
          />
        )}
      </div>
      <StateChip state={state} />
      <div className="flex flex-col gap-1.5 text-[12px] leading-snug">
        {state.why && <CardRow label="Why">{state.why}</CardRow>}
        {card.now && (
          <CardRow label="Now">
            <ShinyText text={card.now} className="min-w-0 truncate" />
          </CardRow>
        )}
        {card.given && (
          <CardRow label={bot === scene.office.coord ? "The job" : "Given"}>
            <span className="line-clamp-2">
              {plainText(card.given)}
              {card.more ? ` · ${card.more} more` : ""}
            </span>
          </CardRow>
        )}
        {card.gave && (
          <CardRow label={bot === scene.office.coord ? "Report" : "Answer"}>
            <span className="inverse line-clamp-2 rounded-md bg-background px-2 py-0.5 text-[11.5px] text-foreground">
              {plainText(card.gave)}
            </span>
          </CardRow>
        )}
        {files.length > 0 && (
          <CardRow label="Made">
            <span className="flex flex-col gap-1">
              {files.map((path) => {
                const Icon = fileIcon(path);
                return (
                  <FileLink
                    key={path}
                    path={path}
                    from={from}
                    className="flex h-6 min-w-0 items-center gap-1.5 rounded-md bg-foreground/6 px-2 text-left text-[11.5px] outline-none transition-colors hover:bg-foreground/12 focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <Icon className="size-3 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate">
                      {path.split("/").pop()}
                    </span>
                  </FileLink>
                );
              })}
            </span>
          </CardRow>
        )}
      </div>
    </div>
  );
}

function CardRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-12.5 shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-foreground/85">{children}</span>
    </div>
  );
}

type SeatKey = ReturnType<typeof cardOf>["state"]["key"];

/** The mark a state wears on a plate and a chip: a live dot, an ember one, an open ring, an hourglass, a tick. */
function StateGlyph({
  state,
  light = false,
}: {
  state: SeatKey;
  light?: boolean;
}) {
  switch (state) {
    case "run":
      return (
        <span
          className={cn(
            "size-1.75 shrink-0 animate-pulse rounded-full motion-reduce:animate-none",
            light ? "bg-background" : "bg-foreground",
          )}
        />
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
    default:
      return null;
  }
}

/** A state as a chip: ink while it works, ember while it waits on you, dashed while held. */
function StateChip({ state }: { state: ReturnType<typeof cardOf>["state"] }) {
  return (
    <span
      className={cn(
        "inline-flex h-5.5 max-w-full items-center gap-1.5 self-start rounded-full px-2.25 font-medium text-[11.5px] whitespace-nowrap",
        state.key === "run" && "bg-foreground text-background",
        (state.key === "asking" || state.key === "paused") &&
          "bg-waiting/10 text-waiting ring-1 ring-waiting/45",
        state.key === "held" &&
          "border border-foreground/40 border-dashed text-foreground/80",
        state.key === "ended" && "bg-muted text-foreground/80",
        state.key === "done" && "text-foreground ring-1 ring-border",
        (state.key === "none" || state.key === "stopped") &&
          "text-muted-foreground ring-1 ring-border",
      )}
    >
      <StateGlyph state={state.key} light={state.key === "run"} />
      <span className="truncate">{state.label}</span>
    </span>
  );
}
