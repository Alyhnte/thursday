"use client";

import { Maximize, Minus, Plus } from "lucide-react";
import {
  Fragment,
  memo,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ShinyText } from "@/components/ui/shiny-text";
import { BotMark, iconProps } from "@/features/bot/components/bot-mark";
import {
  cardOf,
  clockOf,
  namesOf,
  type OfficeScene,
} from "@/features/bot/office";
import {
  type Mug,
  momentOf,
  type Paper,
  type Piece,
  type Stage,
  type Stroke,
  stageOf,
  tripsOf,
  type Walker,
} from "@/features/bot/office.scene";
import type { BotRef } from "@/features/bot/thread.store";
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

const ink = (percent: number) =>
  `color-mix(in oklab, var(--ink) ${percent}%, transparent)`;

/**
 * The office: a sketch of the thread's rooms, its bots at their desks and on the move, pan and
 * zoom like a canvas. It builds itself as it opens (`building`), and each bot's tag opens a card
 * saying what it is doing and why.
 */
export function OfficeStage({
  scene,
  t,
  building,
  label,
  faces,
  selected,
  onSelect,
  seconds,
  running,
  onBuilt,
  className,
}: {
  scene: OfficeScene;
  /** The moment shown, in scene seconds. */
  t: number;
  /** The opening build is under way: pieces fall in, and the caller's clock waits for `onBuilt`. */
  building: boolean;
  label: string;
  /** Each bot's face, by name. */
  faces: BotRef[];
  selected: string | null;
  onSelect: (bot: string) => void;
  /** Real seconds since the handover, for the wall clock. */
  seconds: number;
  running: boolean;
  onBuilt: () => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const size = useSize(box);
  const stage = useMemo(
    () =>
      size && size.w > 0 && size.h > 0 ? stageOf(scene, size, label) : null,
    [scene, size, label],
  );
  const trips = useMemo(
    () => (stage ? tripsOf(scene, stage.plan) : []),
    [scene, stage],
  );
  const moment = stage ? momentOf(scene, stage, trips, t, selected) : null;
  // The build runs once, from the first drawing: then the clock may move
  const builds = stage?.built ?? null;
  useEffect(() => {
    if (builds === null || !building) return;
    const done = window.setTimeout(onBuilt, builds);
    return () => window.clearTimeout(done);
  }, [builds === null, building, onBuilt]);
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
    if (event.button !== 0 || (event.target as HTMLElement).closest("button"))
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

  return (
    <div
      ref={box}
      data-building={building ? "" : undefined}
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
            <WallClock stage={stage} seconds={seconds} running={running} />
            <Mission stage={stage} label={label} />
          </div>
          <div
            className="office-fade pointer-events-none absolute inset-0"
            style={{ animationDelay: `${stage.popAt}ms` }}
          >
            {moment.glasses.map((glass) => {
              const spot = at(glass.x, glass.y);
              return (
                <div
                  key={`${glass.x},${glass.y}`}
                  className="absolute flex -translate-x-[calc(100%-11px)] -translate-y-full flex-row-reverse items-center gap-1.5"
                  style={{ left: spot.x, top: spot.y, opacity: glass.opacity }}
                >
                  <Hourglass />
                  <span className="rounded-md border border-foreground/35 border-dashed bg-background/95 px-1.5 py-0.5 text-[11px] text-foreground/80 whitespace-nowrap">
                    Held · after {namesOf(glass.waits)}
                  </span>
                </div>
              );
            })}
            {moment.stamp && (
              <Refused
                spot={at(moment.stamp.x, moment.stamp.y)}
                scale={moment.stamp.scale}
                text={moment.stamp.text}
              />
            )}
            {moment.counter && (
              <CounterCard
                counter={moment.counter}
                spot={at(moment.counter.x, moment.counter.y)}
              />
            )}
            {moment.tags.map((tag) => (
              <Tag
                key={tag.bot}
                scene={scene}
                t={t}
                bot={tag.bot}
                face={faceOf(tag.bot)}
                head={at(tag.x, tag.head)}
                foot={at(tag.x, tag.foot).y}
                lift={tag.carrying ? 32 * view.z : 0}
                size={stage.botSize * view.z}
                width={size.w}
                picked={selected === tag.bot}
                onPick={() => onSelect(tag.bot)}
              />
            ))}
          </div>
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
  children: React.ReactNode;
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

/** The clock on the coordinator's wall: how long the job has been going, the colon ticking while it runs. */
function WallClock({
  stage,
  seconds,
  running,
}: {
  stage: Stage;
  seconds: number;
  running: boolean;
}) {
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
                  running && "animate-office-blink",
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

/** The job's name, painted large and faint on the ground beside the building. */
function Mission({ stage, label }: { stage: Stage; label: string }) {
  return (
    <div
      className="office-fade pointer-events-none absolute top-0 left-0 origin-top-left"
      style={{
        width: stage.mission.w,
        height: stage.mission.h,
        transform: stage.mission.matrix,
        animationDelay: `${stage.popAt}ms`,
      }}
    >
      <div className="inline-flex flex-col gap-1">
        <span className="font-semibold text-[21px] text-foreground/30 tracking-[0.14em]">
          THE JOB
        </span>
        <span className="whitespace-nowrap font-bold text-[84px] text-foreground/8 leading-none tracking-tight">
          {label}
        </span>
        <span className="-mr-22 -ml-4.5 mt-1 h-0.5 bg-foreground/13" />
      </div>
    </div>
  );
}

function Hourglass() {
  return (
    <svg
      width={22}
      height={29}
      viewBox="0 0 18 24"
      aria-hidden
      className="shrink-0"
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

/** What floats over your counter: the question being asked, the answer you gave, or the final report. */
function CounterCard({
  counter,
  spot,
}: {
  counter: NonNullable<ReturnType<typeof momentOf>["counter"]>;
  spot: { x: number; y: number };
}) {
  const { kind, event } = counter;
  return (
    <div className="absolute size-0" style={{ left: spot.x, top: spot.y }}>
      <div
        className={cn(
          "absolute bottom-11 -left-32.5 flex w-72.5 flex-col gap-1.25 rounded-2xl px-3 pt-2.5 pb-2.75 shadow-lg",
          kind === "report"
            ? "inverse bg-background text-foreground"
            : kind === "question"
              ? "bg-background ring-[1.5px] ring-waiting"
              : "bg-background ring-1 ring-border",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-1.5 font-semibold text-[12px]",
            kind === "question" ? "text-waiting" : "text-foreground/80",
          )}
        >
          {kind === "question" && (
            <span className="size-1.75 rounded-full bg-waiting" />
          )}
          <span className="min-w-0 truncate">
            {kind === "question"
              ? `${event.from} is asking`
              : kind === "answered"
                ? "You answered"
                : `Final report · ${event.from}`}
          </span>
        </div>
        <p
          className={cn(
            "text-[12.5px] leading-normal",
            kind === "answered" ? "line-clamp-2" : "line-clamp-4",
          )}
        >
          {plainText(event.text)}
        </p>
        {kind === "question" && (
          <p className="text-[11.5px] text-muted-foreground">
            {event.from} picks up when you answer
          </p>
        )}
      </div>
    </div>
  );
}

/** A bot's tag over its head; its card opens on hover or focus, and stays while the bot is picked. */
function Tag({
  scene,
  t,
  bot,
  face,
  head,
  foot,
  lift,
  size,
  width,
  picked,
  onPick,
}: {
  scene: OfficeScene;
  t: number;
  bot: string;
  face?: BotRef;
  head: { x: number; y: number };
  foot: number;
  lift: number;
  size: number;
  width: number;
  picked: boolean;
  onPick: () => void;
}) {
  const card = cardOf(scene, bot, t);
  const { state } = card;
  const described = useId();
  const top = head.y - 6 - lift;
  // The card goes above the tag unless the window's top is too near, then under the bot's feet
  const tall =
    110 +
    (state.why ? 22 : 0) +
    (card.now ? 22 : 0) +
    (card.given ? 38 : 0) +
    (card.gave ? 38 : 0);
  const above = top - 30 - tall > 8;
  const left = Math.min(Math.max(-126, 8 - head.x), width - 8 - 252 - head.x);
  return (
    <div
      className={cn(
        "group absolute size-0",
        picked ? "z-30" : "hover:z-30 focus-within:z-30",
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
      <button
        type="button"
        onClick={onPick}
        aria-label={`${bot} · ${state.label}`}
        aria-describedby={described}
        aria-pressed={picked}
        className={cn(
          "pointer-events-auto absolute bottom-0 left-0 flex h-6 -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full pr-2.25 pl-1.75 font-semibold text-[12px] shadow-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          picked
            ? "bg-background ring-[1.5px] ring-brand/55"
            : "bg-background/95 ring-1 ring-border",
          state.key === "none" && "opacity-55",
        )}
      >
        <StateGlyph state={state.key} />
        <span>{bot}</span>
        <span
          className={cn(
            "font-normal",
            state.key === "asking" || state.key === "paused"
              ? "text-waiting"
              : "text-muted-foreground",
          )}
        >
          {state.short}
        </span>
      </button>
      <div
        id={described}
        role="tooltip"
        className={cn(
          "absolute flex w-63 flex-col gap-2.25 rounded-2xl bg-popover px-3 pt-2.75 pb-3 text-left text-popover-foreground shadow-xl ring-1 ring-border transition-[opacity,translate] duration-150",
          above ? "bottom-8" : "",
          picked
            ? "pointer-events-auto visible opacity-100"
            : "invisible translate-y-1 opacity-0 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100",
        )}
        style={{ left, top: above ? undefined : foot - top + 10 }}
      >
        <div className="flex items-center gap-2">
          <BotMark
            size={20}
            seed={bot}
            {...iconProps(face?.icon)}
            notify={false}
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold text-[13px] leading-tight">
              {bot}
            </span>
            <span className="truncate text-[11px] text-muted-foreground leading-snug">
              {card.role}
            </span>
          </span>
          {card.since && (
            <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
              {card.since}
            </span>
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
        </div>
      </div>
    </div>
  );
}

function CardRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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

/** The mark a state wears on a tag and a chip: a live dot, an ember one, an open ring, an hourglass, a tick. */
export function StateGlyph({
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
            "size-1.75 shrink-0 rounded-full",
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
    default:
      return null;
  }
}

/** A state as a chip: ink while it works, ember while it waits on you, dashed while held. */
export function StateChip({
  state,
}: {
  state: ReturnType<typeof cardOf>["state"];
}) {
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
