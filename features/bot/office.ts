/**
 * A thread as the office draws it: what crossed the room and when, each seat's turns, and the
 * state a seat wears at any moment. No React, so the bot suite reads a real room through it
 * (scripts/bot-context.test.mts) and the office view replays one (components/office-view).
 *
 * Read off the thread's lines and the room's exchanges (thread.query): a line's time and the
 * exchange it was written under say when and for whom it was written, and an exchange's row says
 * how it stands — whose last words were an answer, which hand-off still waits. The room's own
 * rules place the rest: a bot works one exchange at a time (room.query claimRoomWork), a held
 * hand-off goes out as its sender ends a turn (releaseWaiting), a bot asking you reads nothing
 * else until you answer (deliver). Nothing is guessed from the words.
 */

import { TOOL_NAMES } from "@/features/ai/tools/tool-name";
import { toDate } from "@/lib/date-like";
import { ROOM_THURSDAY } from "./room.schema";
import { type Chatter, messageOf, type ThreadView } from "./thread.store";

/** The user, in the office: questions and the final report come to their counter. */
export const YOU = "you";

export type OfficeKind =
  /** The job handed to the thread's bot. */
  | "job"
  /** Work sent to another bot. */
  | "give"
  /** A held hand-off going out, the answers it waited for attached. */
  | "release"
  /** A bot's answer to whoever handed it the work. */
  | "return"
  | "question"
  /** The user's words to a bot that asked them something. */
  | "answer"
  /** The user's words to a bot that asked nothing: a step in, or more for the job. */
  | "tell"
  /** The thread's bot's final answer to the user. */
  | "report"
  /** A send the room turned down, drawn as the step it was. */
  | "refused"
  /** The thread's bot ending a turn with words while work is still out. */
  | "end"
  /** The app stopping a bot's turn (a restart, a failure, a limit): it waits for Continue. */
  | "stop";

export type OfficeEvent = {
  /** Unique within the office, for keys. */
  id: string;
  kind: OfficeKind;
  /** The line it was read from, for events written in the same moment; -1 for the job. */
  order: number;
  from: string;
  to: string;
  /** What crossed; for `refused`, why the room turned it down. */
  text: string;
  /** Seconds since the job was handed over. */
  at: number;
  /** Only for `give`: the bots whose answers it waits for. */
  after: string[];
  /** Only for `give`: words that joined an exchange already open to that bot, rather than a new one. */
  extra: boolean;
  /** The exchange a give opened or a release let out (room exchanges), which pairs the two; "" for none. */
  exchange: string;
  /** Only for `end`: another turn followed at once, for words that came in while it ran (room.query finishRoomWork). */
  again: boolean;
};

export type OfficeStep = {
  bot: string;
  at: number;
  text: string;
  /** The line it was read from. */
  order: number;
};

export type OfficeThread = {
  coord: string;
  /** The thread's bot first, then each bot in the order it was first handed work. */
  bots: string[];
  events: OfficeEvent[];
  steps: OfficeStep[];
  /** Seconds from the handover to the last line. */
  span: number;
  status: ThreadView["status"];
};

/** What a step says, as the conversation's own rows say it (room-conversation stepOf). */
const stepText = (line: Chatter) =>
  line.tool
    ? (line.tool.note ?? `${line.tool.name} · ${line.tool.input}`)
    : line.text;

/** What the room said when it turned a send down (thread.query keeps it as the tool's result). */
const refusalOf = (line: Chatter) =>
  (line.tool?.results ?? [])
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join(" ")
    .trim();

/** What the room hands a caller when a bot's turn ends without words (room.query finishRoomWork). */
const SILENT = "This turn ended without a message.";

export function officeOf(thread: ThreadView): OfficeThread {
  const start = toDate(thread.createdAt).getTime();
  const sec = (line: Chatter) =>
    line.at ? Math.max(0, (toDate(line.at).getTime() - start) / 1000) : 0;
  const coord = thread.bot.name;
  const lines = thread.lines;
  const rows = new Map(thread.room.exchanges.map((row) => [row.id, row]));
  // A model may write a bot's name in any case; the room goes by its own spelling (room.query awaited)
  const known = [
    coord,
    ...thread.room.participants.map((one) => one.bot),
    ...thread.room.exchanges.map((row) => row.bot),
  ];
  const canon = (name: string) =>
    known.find((one) => one.toLowerCase() === name.toLowerCase()) ?? name;
  // Words in a model message that also acted are the words beside a call, the bot's work; words
  // alone end a turn (thread.store messagesIn)
  const acting = new Set(
    lines
      .filter((line) => line.kind === "tool" || line.kind === "ask")
      .map(messageOf),
  );
  const alone = (line: Chatter) =>
    (line.kind === "say" || line.kind === "result") &&
    !acting.has(messageOf(line));
  /** Per exchange: the message of its last words, its last line, and the last line its bot wrote. */
  const lastWords = new Map<string, string>();
  const lastLine = new Map<string, number>();
  const lastOwn = new Map<string, number>();
  for (const [index, line] of lines.entries()) {
    if (!line.parent) continue;
    lastLine.set(line.parent, index);
    if (line.kind !== "user" && line.kind !== "note" && line.kind !== "stop")
      lastOwn.set(line.parent, index);
    if (alone(line)) lastWords.set(line.parent, messageOf(line));
  }

  const events: Omit<OfficeEvent, "id">[] = [
    {
      kind: "job",
      order: -1,
      from: YOU,
      to: coord,
      text: thread.request,
      at: 0,
      after: [],
      extra: false,
      exchange: "",
      again: false,
    },
  ];
  const steps: OfficeStep[] = [];
  const bots = [coord];
  const seat = (bot: string) => {
    if (bot && bot !== ROOM_THURSDAY && !bots.includes(bot)) bots.push(bot);
  };
  /** Exchanges handed out and not answered yet, by the bot they went to. */
  const open = new Map<string, Set<string>>();
  const out = (bot: string) => (open.get(bot)?.size ?? 0) > 0;
  /** Bots with a question to the user still open. */
  const asking = new Set<string>();
  /** Held hand-offs by the exchange each opened, until they are seen to go out. */
  const held = new Map<string, Omit<OfficeEvent, "id">>();
  let said: { message: string; event: Omit<OfficeEvent, "id"> } | null = null;
  /** The line being read, which every event from it carries. */
  let order = 0;
  const push = (
    event: Omit<OfficeEvent, "id" | "order" | "exchange" | "again"> &
      Partial<Pick<OfficeEvent, "exchange" | "again">>,
  ) => {
    const full = { exchange: "", again: false, ...event, order };
    events.push(full);
    said = null;
    return full;
  };
  /**
   * A held hand-off goes out as its sender ends a turn with every answer it waited for read
   * (room.query releaseWaiting, from finishRoomWork): the last such end no later than `limit`,
   * whose words are the turn's last line. Without one, the recipient's first line under it,
   * `start`, is the nearest moment written down; with neither it stays held.
   */
  const release = (exchange: string, limit: number, start: number | null) => {
    const give = held.get(exchange);
    if (!give) return;
    held.delete(exchange);
    const back = new Set<string>();
    let end = -1;
    for (let index = events.indexOf(give) + 1; index < events.length; index++) {
      const event = events[index];
      if (event.at > limit) break;
      if (event.kind === "return") back.add(event.from);
      if (
        event.kind === "end" &&
        event.from === give.from &&
        give.after.every((bot) => back.has(bot))
      )
        end = index;
    }
    if (end < 0) {
      if (start !== null)
        push({
          ...give,
          kind: "release",
          at: Math.max(give.at, start),
        });
      return;
    }
    const { at, order } = events[end];
    // After the end, and after what that end let out before it
    let place = end + 1;
    while (events[place]?.kind === "release" && events[place].order === order)
      place += 1;
    events.splice(place, 0, { ...give, kind: "release", at, order });
  };

  const read = (line: Chatter, index: number, at: number, from: string) => {
    if (line.kind === "tool") {
      if (line.tool?.name === TOOL_NAMES.send_message) {
        const meant = line.meant ? canon(line.meant.name) : "";
        push({
          kind: "refused",
          from,
          to: meant === ROOM_THURSDAY ? YOU : meant,
          text: refusalOf(line),
          at,
          after: [],
          extra: false,
        });
      } else steps.push({ bot: from, at, text: stepText(line), order });
      return;
    }
    if (line.kind === "ask") {
      const to = canon(line.to?.name ?? "");
      if (to === ROOM_THURSDAY) {
        asking.add(from);
        push({
          kind: "question",
          from,
          to: YOU,
          text: line.text,
          at,
          after: [],
          extra: false,
        });
        return;
      }
      seat(to);
      const after = (line.after ?? []).map(canon);
      const row = line.exchange ? rows.get(line.exchange) : undefined;
      if (!row) {
        // No row of its own: the words joined an exchange already open to that bot, a held one
        // when they too wait on answers still out (room.query sendRoomMessage)
        const hold = [...held.values()].find(
          (give) => give.from === from && give.to === to,
        );
        const started = [...(open.get(to) ?? [])].some((id) => !held.has(id));
        if (hold && (after.some(out) || !started))
          hold.after = [...new Set([...hold.after, ...after])];
        push({
          kind: "give",
          from,
          to,
          text: line.text,
          at,
          after,
          extra: true,
        });
        return;
      }
      // Held when an answer it names was still out as it was sent, or when the room holds it now
      const holds = row.waitsFor.length > 0 || after.some(out);
      const give = push({
        kind: "give",
        from,
        to,
        text: line.text,
        at,
        after: holds ? (row.waitsFor.length ? row.waitsFor : after) : [],
        extra: false,
        exchange: row.id,
      });
      open.set(to, new Set([...(open.get(to) ?? []), row.id]));
      if (holds) held.set(row.id, give);
      return;
    }
    if (line.kind === "user") {
      push({
        kind: asking.delete(from) ? "answer" : "tell",
        from: YOU,
        to: from,
        text: line.text,
        at,
        after: [],
        extra: false,
      });
      return;
    }
    if (line.kind === "stop") {
      // Only the stop that left its exchange paused, with nothing written under it since
      const row = line.parent ? rows.get(line.parent) : undefined;
      if (row?.state === "paused" && lastLine.get(row.id) === index)
        push({
          kind: "stop",
          from,
          to: "",
          text: line.text,
          at,
          after: [],
          extra: false,
        });
      return;
    }
    const row = line.parent ? rows.get(line.parent) : undefined;
    if (!alone(line)) {
      if (line.kind === "say" || line.kind === "result")
        steps.push({ bot: from, at, text: line.text, order });
      return;
    }
    // Several text blocks of one message are one thing said
    const message = messageOf(line);
    const last = said as { message: string; event: OfficeEvent } | null;
    if (last?.message === message) {
      last.event.text = `${last.event.text}\n\n${line.text}`;
      return;
    }
    // The last words under an exchange that is done are its answer; any before were a turn that
    // ended with more words waiting for it, and went on (room.query finishRoomWork)
    const answer = row
      ? row.state === "done" && lastWords.get(row.id) === message
      : line.kind === "result";
    if (from === coord) {
      const event = push({
        kind: answer ? "report" : "end",
        from,
        to: answer ? YOU : "",
        text: line.text,
        at,
        after: [],
        extra: false,
      });
      said = { message, event };
      return;
    }
    if (!answer || !row) {
      steps.push({ bot: from, at, text: line.text, order });
      return;
    }
    const event = push({
      kind: "return",
      from,
      to: canon(row.caller),
      text: line.text,
      at,
      after: [],
      extra: false,
      exchange: row.id,
    });
    open.get(from)?.delete(row.id);
    said = { message, event };
  };

  for (const [index, line] of lines.entries()) {
    order = index;
    const at = sec(line);
    const from = canon(line.bot.name);
    seat(from);
    // The first line its recipient writes under a held hand-off: it has gone out by now
    if (line.parent) release(line.parent, at, at);
    read(line, index, at, from);
    // An exchange done with no words: the room hands the caller its own for them (finishRoomWork)
    const row = line.parent ? rows.get(line.parent) : undefined;
    if (
      row?.state === "done" &&
      from !== coord &&
      lastOwn.get(row.id) === index &&
      !lastWords.has(row.id)
    ) {
      push({
        kind: "return",
        from,
        to: canon(row.caller),
        text: SILENT,
        at,
        after: [],
        extra: false,
        exchange: row.id,
      });
      open.get(from)?.delete(row.id);
    }
  }
  // Out already, its recipient not yet at a line: the room no longer holds it
  for (const exchange of [...held.keys()])
    if (!rows.get(exchange)?.waitsFor.length)
      release(exchange, Number.POSITIVE_INFINITY, null);
  // A turn that ended with words waiting went on at once: the bot's next line came before
  // anything else woke it, or, with nothing after it yet, its exchange is running again now
  for (const [index, event] of events.entries()) {
    if (event.kind !== "end") continue;
    const next = lines.findIndex(
      (line, place) =>
        place > event.order &&
        canon(line.bot.name) === event.from &&
        line.kind !== "user" &&
        line.kind !== "note" &&
        line.kind !== "stop",
    );
    const woken = events.findIndex(
      (other, place) =>
        place > index &&
        other.to === event.from &&
        (other.kind === "return" ||
          other.kind === "answer" ||
          other.kind === "tell"),
    );
    const row = rows.get(lines[event.order]?.parent ?? "");
    event.again =
      next >= 0
        ? woken < 0 || next < events[woken].order
        : woken < 0 && (row?.state === "running" || row?.state === "queued");
  }

  const last = lines.length ? Math.max(...lines.map(sec)) : 0;
  return {
    coord,
    bots,
    events: events.map((event, index) => ({ ...event, id: `e${index}` })),
    steps,
    span: last,
    status: thread.status,
  };
}

// ---- the clock a replay runs on

/** A long wait, shortened for a replay: gaps up to two seconds as they were, longer ones on a log. */
const squeeze = (gap: number) =>
  gap <= 2 ? gap : 2 + 3.2 * Math.log(1 + (gap - 2) / 4);

/** Room a message gets to be walked across the floor, and a step to be read, in a replay. */
const WALK = 1.9;
const READ = 0.8;

export type OfficeClock = {
  /** Scene seconds from real seconds since the handover, and back. */
  scene: (real: number) => number;
  real: (scene: number) => number;
  end: number;
  /** Stretches that run well ahead of the real clock, for the timeline to hatch. */
  fast: { from: number; to: number; ratio: number }[];
  /**
   * When each event and step falls on the scene, by index: two sends written in the same
   * moment still get a walk each, which a mapping from real time alone would fold into one.
   */
  events?: number[];
  steps?: number[];
};

/** Live: the scene runs on the real clock. */
export const liveClock = (span: number): OfficeClock => ({
  scene: (real) => real,
  real: (scene) => scene,
  end: span,
  fast: [],
});

/** Replay: every message gets time to cross the floor, and long waits are squeezed. */
export function replayClock(office: OfficeThread): OfficeClock {
  const events = office.events.map(() => 0);
  const steps = office.steps.map(() => 0);
  // In the order they were written; the job at the start stays there
  const points = [
    ...office.events.flatMap((event, index) =>
      event.kind === "job"
        ? []
        : [
            {
              at: event.at,
              order: event.order,
              gap: WALK,
              set: (at: number) => (events[index] = at),
            },
          ],
    ),
    ...office.steps.map((step, index) => ({
      at: step.at,
      order: step.order,
      gap: READ,
      set: (at: number) => (steps[index] = at),
    })),
  ].sort((a, b) => a.at - b.at || a.order - b.order);
  const marks: [number, number][] = [[0, 0]];
  let scene = 0;
  let before = 0;
  for (const point of points) {
    scene += Math.max(squeeze(Math.max(0, point.at - before)), point.gap);
    before = Math.max(before, point.at);
    point.set(scene);
    marks.push([scene, before]);
  }
  marks.push([scene + 2.5, Math.max(office.span, before)]);
  const between = (x: number, from: 0 | 1, to: 0 | 1) => {
    for (let index = 1; index < marks.length; index++) {
      const a = marks[index - 1];
      const b = marks[index];
      if (x <= b[from])
        return b[from] === a[from]
          ? a[to]
          : a[to] + ((b[to] - a[to]) * (x - a[from])) / (b[from] - a[from]);
    }
    return marks[marks.length - 1][to];
  };
  const fast: OfficeClock["fast"] = [];
  for (let index = 1; index < marks.length; index++) {
    const [s0, r0] = marks[index - 1];
    const [s1, r1] = marks[index];
    const ratio = (r1 - r0) / Math.max(0.01, s1 - s0);
    if (ratio < 3.5) continue;
    const previous = fast.at(-1);
    if (previous && Math.abs(previous.to - s0) < 0.01) {
      previous.ratio =
        (previous.ratio * (previous.to - previous.from) + (r1 - r0)) /
        (s1 - previous.from);
      previous.to = s1;
    } else fast.push({ from: s0, to: s1, ratio });
  }
  return {
    scene: (real) => between(real, 1, 0),
    real: (s) => between(s, 0, 1),
    end: marks[marks.length - 1][0],
    fast: fast.filter((one) => one.to - one.from >= 3),
    events,
    steps,
  };
}

// ---- each seat's turns

export type TurnKey = "run" | "asking" | "ended" | "held" | "done" | "paused";

export type Turn = {
  /** Unique within the office, for keys. */
  id: string;
  key: TurnKey;
  from: number;
  to: number;
  /** Which turn of this bot's it is, for a running one. */
  n: number;
  /** Only for `held`: the bots it waits on. */
  after: string[];
};

/** The office's events and steps on a clock, and each seat's turns on it. */
export type OfficeScene = {
  office: OfficeThread;
  clock: OfficeClock;
  events: OfficeEvent[];
  steps: OfficeStep[];
  turns: Record<string, Turn[]>;
  end: number;
};

export function sceneOf(office: OfficeThread, clock: OfficeClock): OfficeScene {
  const events = office.events.map((event, index) => ({
    ...event,
    at: clock.events?.[index] ?? clock.scene(event.at),
  }));
  const steps = office.steps.map((step, index) => ({
    ...step,
    at: clock.steps?.[index] ?? clock.scene(step.at),
  }));
  const { coord } = office;
  const turns: Record<string, Turn[]> = {};
  const open: Record<string, Turn | null> = {};
  const runs: Record<string, number> = {};
  /** Exchanges waiting for their bot to finish the one it is on (room.query claimRoomWork). */
  const queued: Record<string, number> = {};
  /** Held hand-offs not out yet, by the bot they are for. */
  const holds: Record<string, OfficeEvent[]> = {};
  let made = 0;
  const seat = (bot: string) => {
    if (turns[bot]) return;
    turns[bot] = [];
    open[bot] = null;
    runs[bot] = 0;
    queued[bot] = 0;
    holds[bot] = [];
  };
  for (const bot of office.bots) seat(bot);
  const close = (bot: string, at: number) => {
    seat(bot);
    const turn = open[bot];
    if (turn) turns[bot].push({ ...turn, to: at });
    open[bot] = null;
  };
  const begin = (
    bot: string,
    key: TurnKey,
    at: number,
    after: string[] = [],
  ) => {
    close(bot, at);
    if (key === "run") runs[bot] += 1;
    made += 1;
    open[bot] = {
      id: `t${made}`,
      key,
      from: at,
      to: Number.POSITIVE_INFINITY,
      n: runs[bot],
      after,
    };
  };
  const busy = (bot: string) => open[bot]?.key === "run";
  /** Work that reaches a bot: it starts now, or after the exchange it is on. */
  const reach = (bot: string, at: number) => {
    seat(bot);
    if (busy(bot)) queued[bot] += 1;
    else begin(bot, "run", at);
  };
  for (const event of events) {
    const { at } = event;
    switch (event.kind) {
      case "job":
        begin(coord, "run", at);
        break;
      case "question":
        begin(event.from, "asking", at);
        break;
      case "answer":
      case "tell":
        // Your words start a bot, a held one too, or join the turn it is on (room.query tellRoom)
        if (!busy(event.to)) begin(event.to, "run", at);
        break;
      case "end":
        // A bot waiting on you reads nothing else until you answer (room.query deliver)
        if (open[coord]?.key === "asking") break;
        if (event.again) begin(coord, "run", at);
        else begin(coord, "ended", at);
        break;
      case "return": {
        begin(event.from, "done", at);
        if (queued[event.from] > 0) {
          queued[event.from] -= 1;
          begin(event.from, "run", at);
        } else if (holds[event.from]?.length)
          begin(event.from, "held", at, holds[event.from][0].after);
        // Its caller reads it at its next step when at work, or once you answer when asking you
        const caller = open[event.to]?.key;
        if (caller !== "run" && caller !== "asking" && caller !== "paused")
          reach(event.to, at);
        break;
      }
      case "report":
        begin(coord, "done", at);
        break;
      case "give": {
        // Words that joined an exchange already open change nothing
        if (event.extra) break;
        seat(event.to);
        if (event.after.length) {
          holds[event.to].push(event);
          const now = open[event.to]?.key;
          if (!now || now === "done" || now === "ended")
            begin(event.to, "held", at, event.after);
        } else reach(event.to, at);
        break;
      }
      case "release":
        seat(event.to);
        holds[event.to] = holds[event.to].filter(
          (give) => give.exchange !== event.exchange,
        );
        reach(event.to, at);
        break;
      case "stop":
        begin(event.from, "paused", at);
        break;
      case "refused":
        break;
    }
  }
  const end = Math.max(
    clock.end,
    events.at(-1)?.at ?? 0,
    steps.at(-1)?.at ?? 0,
  );
  for (const bot of Object.keys(turns)) close(bot, Number.POSITIVE_INFINITY);
  return { office, clock, events, steps, turns, end };
}

// ---- what a seat wears at a moment

export type SeatKey = TurnKey | "none" | "stopped";

export type SeatState = {
  key: SeatKey;
  /** The chip's words. */
  label: string;
  /** The same, short, for a tag. */
  short: string;
  /** Why it stands where it stands, for its card. */
  why: string;
  since: number | null;
  /** Who it waits on: bots, or you. */
  waits: string[];
};

export const turnAt = (scene: OfficeScene, bot: string, t: number) =>
  scene.turns[bot]?.find((turn) => t >= turn.from && t < turn.to) ?? null;

/** Bots it handed work that has not come back, or you. */
export function awaited(scene: OfficeScene, bot: string, t: number): string[] {
  const turn = turnAt(scene, bot, t);
  if (!turn) return [];
  if (turn.key === "asking" || turn.key === "paused") return [YOU];
  if (turn.key === "held") return turn.after;
  if (turn.key !== "ended") return [];
  return scene.office.bots.filter((other) => {
    if (other === bot) return false;
    const theirs = turnAt(scene, other, t);
    return theirs?.key === "run" || theirs?.key === "held";
  });
}

const nameOf = (who: string) => (who === YOU ? "you" : who);

/** "Analyst", "Analyst and Designer", "3 bots". */
export const namesOf = (list: string[]) =>
  list.length > 2 ? `${list.length} bots` : list.map(nameOf).join(" and ");

export function seatAt(scene: OfficeScene, bot: string, t: number): SeatState {
  const turn = turnAt(scene, bot, t);
  const own = bot === scene.office.coord;
  const stopped =
    scene.office.status === "cancelled" &&
    t >= scene.end &&
    turn?.key !== "done";
  if (stopped)
    return {
      key: "stopped",
      label: "Stopped",
      short: "Stopped",
      why: "The job was stopped",
      since: null,
      waits: [],
    };
  if (!turn)
    return {
      key: "none",
      label: "Not called yet",
      short: "Not called",
      why: "Not part of the job yet",
      since: null,
      waits: [],
    };
  const since = turn.from;
  switch (turn.key) {
    case "run":
      return {
        key: "run",
        label: `Working · turn ${turn.n}`,
        short: "Working",
        why: "",
        since,
        waits: [],
      };
    case "asking":
      return {
        key: "asking",
        label: "Waiting on you",
        short: "Your turn",
        why: "Picks up when you answer",
        since,
        waits: [YOU],
      };
    case "paused":
      return {
        key: "paused",
        label: "Paused",
        short: "Paused",
        why: "Picks up when you press Continue",
        since,
        waits: [YOU],
      };
    case "held":
      return {
        key: "held",
        label: `Held · after ${namesOf(turn.after)}`,
        short: "Held",
        why: `Starts once ${namesOf(turn.after)} ${turn.after.length === 1 ? "answers" : "answer"}`,
        since,
        waits: turn.after,
      };
    case "ended": {
      const waits = awaited(scene, bot, t);
      return {
        key: "ended",
        label: waits.length ? `Waiting on ${namesOf(waits)}` : "Waiting",
        short: "Waiting",
        why: waits.length
          ? `Turn over · waiting on ${namesOf(waits)}`
          : "Turn over",
        since,
        waits,
      };
    }
    case "done":
      return {
        key: "done",
        label: own ? "Reported" : "Answered",
        short: own ? "Reported" : "Answered",
        why: own ? "Reported to you" : `Gave ${scene.office.coord} its answer`,
        since,
        waits: [],
      };
  }
}

/** The step a seat is on while it runs, else why it stands. */
export function nowOf(scene: OfficeScene, bot: string, t: number): string {
  const state = seatAt(scene, bot, t);
  if (state.key !== "run") return state.why;
  const turn = turnAt(scene, bot, t);
  const from = (turn?.from ?? 0) - 0.01;
  let step: OfficeStep | null = null;
  for (const one of scene.steps)
    if (one.bot === bot && one.at >= from && one.at <= t) step = one;
  let sent: OfficeEvent | null = null;
  for (const event of scene.events)
    if (
      event.from === bot &&
      event.at >= from &&
      event.at <= t &&
      (event.kind === "give" || event.kind === "refused")
    )
      sent = event;
  if (sent && (!step || sent.at >= step.at))
    return sent.kind === "refused"
      ? "A send turned down"
      : `Handing ${sent.to} ${sent.extra ? "more" : "work"}`;
  if (step) return step.text;
  return bot === scene.office.coord ? "Reading the job" : "Reading the work";
}

/** What the line of time says of a message. */
export function kindWord(event: OfficeEvent): string {
  switch (event.kind) {
    case "job":
      return "the job";
    case "give":
      return event.extra
        ? "more work"
        : event.after.length
          ? `work, after ${namesOf(event.after)}`
          : "work";
    case "release":
      return "held work goes out";
    case "return":
      return "answer";
    case "question":
      return "question";
    case "answer":
      return "your answer";
    case "tell":
      return "your words";
    case "report":
      return "final report";
    case "refused":
      return "turned down";
    case "end":
      return "turn over";
    case "stop":
      return "stopped";
  }
}

/** The last message that crossed the room by `t`. */
export const beatAt = (scene: OfficeScene, t: number) =>
  scene.events.findLast(
    (event) => event.kind !== "end" && event.kind !== "stop" && event.at <= t,
  ) ?? null;

/** The question to you open at `t`, and the last one answered. A stop leaves none open. */
export function questionAt(scene: OfficeScene, t: number) {
  const stopped = scene.office.status === "cancelled" && t >= scene.end;
  let open: OfficeEvent | null = null;
  let answered: { question: OfficeEvent; answer: OfficeEvent } | null = null;
  for (const event of scene.events) {
    if (event.at > t) break;
    if (event.kind === "question") open = event;
    if (event.kind === "answer" && open && event.to === open.from) {
      answered = { question: open, answer: event };
      open = null;
    }
  }
  return { open: stopped ? null : open, answered };
}

export const reportAt = (scene: OfficeScene, t: number) =>
  scene.events.find((event) => event.kind === "report" && event.at <= t) ??
  null;

/** "now", "12s", "3m 5s", counted in real time. */
export function heldFor(scene: OfficeScene, since: number | null, t: number) {
  if (since === null) return "";
  const seconds = Math.max(0, scene.clock.real(t) - scene.clock.real(since));
  if (seconds < 1) return "now";
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const rest = Math.floor(seconds % 60);
  return `${Math.floor(seconds / 60)}m${rest ? ` ${rest}s` : ""}`;
}

/** "4:40", or "2:04:40" past the hour, from real seconds. */
export const clockOf = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  const two = (n: number) => String(n).padStart(2, "0");
  const hours = Math.floor(whole / 3600);
  return hours
    ? `${hours}:${two(Math.floor(whole / 60) % 60)}:${two(whole % 60)}`
    : `${Math.floor(whole / 60)}:${two(whole % 60)}`;
};

/** What a bot's card says: who it is here, the state it wears and why, what it is on, given and gave. */
export function cardOf(scene: OfficeScene, bot: string, t: number) {
  const state = seatAt(scene, bot, t);
  const own = bot === scene.office.coord;
  // The work it is on: the last exchange handed to it by now, and the words that joined it since
  const given = own
    ? (scene.events.find((event) => event.kind === "job") ?? null)
    : (scene.events.findLast(
        (event) =>
          event.kind === "give" &&
          event.to === bot &&
          !event.extra &&
          event.at <= t,
      ) ?? null);
  const more = own
    ? 0
    : scene.events.filter(
        (event) =>
          event.kind === "give" &&
          event.to === bot &&
          event.extra &&
          event.at >= (given?.at ?? 0) &&
          event.at <= t,
      ).length;
  const gave =
    state.key === "done"
      ? (scene.events.findLast(
          (event) =>
            event.kind === (own ? "report" : "return") &&
            event.from === bot &&
            event.at <= t,
        ) ?? null)
      : null;
  return {
    state,
    role: own ? "Has the job" : `Brought in by ${scene.office.coord}`,
    now: state.key === "run" ? nowOf(scene, bot, t) : "",
    given: given?.text ?? "",
    more,
    gave: gave?.text ?? "",
    since: heldFor(scene, state.since, t),
  };
}
