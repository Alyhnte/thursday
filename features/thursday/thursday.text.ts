import { readFile, stat } from "node:fs/promises";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  generateText,
  type ModelMessage,
  type StepResult,
  stepCountIs,
  streamText,
  type TextStreamPart,
  type ToolSet,
  toUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
  type UserContent,
  validateUIMessages,
} from "ai";
import { z } from "zod";
import { queryKey } from "@/app/api/query-key";
import { LOOK, TEXT_CALL } from "@/config";
import { LIVE_PROVIDER, type LiveSettings } from "@/features/ai/live.schema";
import { loadTools } from "@/features/ai/load-tools";
import {
  getTextModel,
  isPlanSpent,
  modelErrorToString,
  seesToolImages,
} from "@/features/ai/model";
import {
  TEXT_MODEL_PROVIDERS,
  type TextModelRef,
  textModelRefSchema,
} from "@/features/ai/model.schema";
import { loadCallStanding } from "@/features/ai/prompts/call-standing";
import { loadThursdayPrompt } from "@/features/ai/prompts/thursday.prompt";
import { TOOL_NAMES } from "@/features/ai/tools/tool-name";
import { EXA_API_KEY } from "@/features/config/config.const";
import { readConfig } from "@/features/config/config.query";
import {
  isPicture,
  mimeOf,
  workspaceRelative,
} from "@/features/workspace/file-kind";
import { insideWorkspace } from "@/features/workspace/workspace";
import { acceptedReasoning, wantedReasoning } from "@/lib/live/live.server";
import { logger } from "@/lib/logger";
import { startError } from "@/lib/protocol/to-result";
import { PublicError, publicError } from "@/lib/public-error";
import {
  insertCall,
  nextTurnSeq,
  readLiveSettings,
  saveThought,
  saveTurns,
} from "./thursday.query";
import {
  noteOf,
  notesIn,
  TEXT_CALL_MOVED,
  TEXT_CALL_NOTE,
  TEXT_CALL_PROVIDERS,
  type TextCallHandshake,
  type TextCallMoved,
  type TextCallNote,
  TextCallNoteSchema,
  type TextCallProvider,
  textCallRunsOn,
  type Where,
  WhereSchema,
} from "./thursday.schema";
import { toolLine } from "./tool-line";

/**
 * A call in writing: the call's backend alone, with no Live session around it. Same
 * prompt but for its last chapter, same memory, same tools, and the same rows — it is kept
 * as a call, so the next call reads it back under Earlier calls like any other. Whoever
 * writes holds the conversation and hands it over whole with every turn (what a tool
 * answered is not kept in the rows, so they cannot rebuild it): the page, which is
 * answered as a stream, or the server itself for someone writing from a phone (reach),
 * which is answered whole. Either way each turn is saved as it happens, and what arrives
 * while she works — their words, a fact for a bot's update — joins the turn before her
 * next step, as it does for a bot (bot.run).
 */

/** Which sign-in a call in writing runs on, from what is set. Null when neither is. */
export async function readTextCallProvider(): Promise<TextCallProvider | null> {
  const set = await Promise.all(
    TEXT_CALL_PROVIDERS.map(async (provider) =>
      (await readConfig(provider.apiKeyName)) ? provider.apiKeyName : null,
    ),
  );
  return textCallRunsOn((key) => set.includes(key));
}

/**
 * What a call in writing runs on: the model picked for it where it is written (the write
 * line; any provider with a key), else the rule — the GPT subscription when one is signed
 * in, else the OpenAI key, on the call's own backend model.
 */
async function runsOnOf(
  settings: LiveSettings,
  picked: TextModelRef | null | undefined,
): Promise<TextModelRef> {
  if (picked) return picked;
  const provider = await readTextCallProvider();
  if (!provider) publicError(NOTHING_TO_RUN_ON);
  return { provider, model: settings.backendModel };
}

/**
 * Where a turn goes when the GPT subscription refuses it for a spent plan before anything
 * of it ran: the OpenAI key, on the call's backend model, and the line that tells the user
 * so. Null for any other failure, or with no key set. Every turn asks the plan first, so
 * the plan takes the call back once its window resets.
 */
async function spareOf(
  ref: TextModelRef,
  cause: unknown,
): Promise<{ ref: TextModelRef; why: string; line: string } | null> {
  if (ref.provider !== "chatgpt" || !isPlanSpent(cause)) return null;
  if (!(await readConfig(LIVE_PROVIDER.apiKeyName))) return null;
  const model = (await readLiveSettings()).backendModel;
  const label =
    TEXT_MODEL_PROVIDERS.openai.suggestModels.find((one) => one.id === model)
      ?.label ?? model;
  // The plan's own words: which plan, and when it resets (ai/chatgpt usageLimitOf)
  const why = cause instanceof Error ? cause.message : String(cause);
  return {
    ref: { provider: "openai", model },
    why,
    line: `${why} Answering on your OpenAI key (${label}) until it resets.`,
  };
}

/** A spent plan with no key to go on to: what the user can do, after the plan's own words. */
async function planSpentError(cause: unknown): Promise<unknown> {
  if (!isPlanSpent(cause)) return cause;
  const why = cause instanceof Error ? cause.message : String(cause);
  // Set, it was refused partway through a turn: the next turn starts on the key
  return new PublicError(
    (await readConfig(LIVE_PROVIDER.apiKeyName))
      ? `${why} Write again and she answers on your OpenAI key.`
      : `${why} With an OpenAI key in Settings › API keys, she answers on it until then.`,
  );
}

/** The row a call in writing is kept under, and what stood open as it began. */
export async function openTextCall(
  picked?: TextModelRef | null,
): Promise<TextCallHandshake> {
  const ref = await runsOnOf(await readLiveSettings(), picked);
  const [callId, standing] = await Promise.all([
    insertCall({
      provider: ref.provider,
      model: TEXT_CALL.model,
      backendModel: ref.model,
    }),
    loadCallStanding(),
  ]);
  return { callId, standing };
}

const BodySchema = z.object({
  callId: z.string().min(1),
  /** What stood open as the call opened (ai/prompts/call-standing), as the page was handed it. */
  standing: z.string().nullish(),
  /** The model picked on the write line; absent, the rule decides (runsOnOf). */
  runsOn: textModelRefSchema.nullish(),
  /** This answer's own name, new with every request: what the page tells it goes here. */
  turn: z.string().min(1),
  messages: z.array(z.unknown()).min(1),
  /** Where the page found the user and the weather there (where.ts), read by readWhere. */
  where: z.unknown().optional(),
});

/**
 * What a page sent of where the user is, or null. It is extra to the call: what does not fit
 * the schema — a service that sent a null — is dropped with a warning, never a failed call.
 */
export function readWhere(value: unknown): Where | null {
  if (value == null) return null;
  const read = WhereSchema.safeParse(value);
  if (read.success) return read.data;
  logger.warn(
    `The call goes on without where the user is: ${read.error.issues[0]?.message}`,
  );
  return null;
}

type Pinned = {
  __textCallTurns?: Map<string, { callId: string; notes: TextCallNote[] }>;
};
/**
 * The answers pages are streaming now, by their turn: what a page tells one waits here for
 * her next step. Pinned to globalThis: the route that streams and the action that tells are
 * loaded apart.
 */
const answering = ((globalThis as Pinned).__textCallTurns ??= new Map());

/**
 * Puts words or a fact into the answer a page is streaming, read before her next step. What
 * a step read comes back to the page ahead of that step; anything that does not — too late for
 * her last step, or refused here (false) once that answer is over or it is not this call's —
 * the page carries into the next turn.
 */
export function tellTextCall(
  callId: string,
  turn: string,
  note: TextCallNote,
): boolean {
  const open = answering.get(turn);
  if (!open || open.callId !== callId) return false;
  open.notes.push(note);
  return true;
}

export async function streamTextCall(
  body: unknown,
  signal: AbortSignal,
): Promise<Response> {
  let run: Awaited<ReturnType<typeof prepare>>;
  let turn: string | null = null;
  const inbox: TextCallNote[] = [];
  const close = () => {
    if (turn) answering.delete(turn);
  };
  try {
    const request = BodySchema.parse(body);
    turn = request.turn;
    // Open before anything awaits: what is told while it gets ready joins its first step.
    // Closed however it ends, getting ready included: a page gone then never reads the body
    answering.set(turn, { callId: request.callId, notes: inbox });
    signal.addEventListener("abort", close, { once: true });
    if (signal.aborted) close();
    run = await prepare(request);
  } catch (cause) {
    close();
    // Nothing has streamed yet, so this text is what the page shows as the error
    const { status, message } = startError(cause, "Could not reach her");
    return new Response(message, { status });
  }

  const rows = turnRows(run.callId, run.seq);
  /** What each step read before it ran, by step: told back to the page ahead of that step. */
  const took = new Map<number, TextCallNote[]>();
  const ask = (on: Run) =>
    streamText({
      model: on.model,
      instructions: on.system,
      messages: run.messages,
      allowSystemInMessages: true,
      tools: on.tools,
      providerOptions: on.providerOptions,
      stopWhen: stepCountIs(TEXT_CALL.maxSteps),
      abortSignal: signal,
      prepareStep: async ({ stepNumber, messages: soFar }) => {
        const notes = inbox.splice(0);
        if (!notes.length) return undefined;
        for (const note of notes)
          if (note.said) await rows.said(note.text, note.id);
        took.set(stepNumber, notes);
        // Carried forward by the sdk: from here the steps stack on these
        return {
          messages: [
            ...soFar,
            ...(await Promise.all(
              notes.map(async (note) => ({
                role: "user" as const,
                content: await withPictures(note.text, note.pictures, on.ref),
              })),
            )),
          ],
        };
      },
      onStepEnd: rows.step,
    });

  /** Where the turn went instead of the plan, once it has: said to the page as it starts. */
  let moved: TextCallMoved | null = null;
  const parts = streamParts(async function* () {
    // What opens the stream is held until her first step has something to show: a spent
    // plan refuses before that, and the turn then starts again on the key as if it were new
    const held: TextStreamPart<ToolSet>[] = [];
    let shown = false;
    let spare: Awaited<ReturnType<typeof spareOf>> = null;
    for await (const part of ask(run).stream) {
      if (!shown && part.type === "error") {
        spare = await spareOf(run.ref, part.error);
        if (spare) break;
      }
      if (!shown && (part.type === "start" || part.type === "start-step")) {
        held.push(part);
        continue;
      }
      shown = true;
      yield* held.splice(0);
      yield part;
    }
    // Moved, what the refused attempt opened is dropped: the answer on the key opens its own
    if (!spare) return yield* held;
    logger.info(`text call ${run.callId}: ${spare.line}`);
    moved = { why: spare.why, line: spare.line };
    // What the refused step had read goes to the step that runs in its place
    inbox.unshift(...(took.get(0) ?? []));
    took.delete(0);
    try {
      yield* ask(await loadRun(run.callId, spare.ref)).stream;
    } catch (cause) {
      yield { type: "error", error: cause };
    }
  });

  // A note goes back ahead of the step that read it, never inside one, so it can never
  // come between a tool call and what the tool answered when the page sends it all again
  let step = -1;
  const told = new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      if (chunk.type === "start-step") {
        step += 1;
        for (const note of took.get(step) ?? [])
          controller.enqueue({
            type: `data-${TEXT_CALL_NOTE}`,
            id: note.id,
            data: note,
          });
      }
      controller.enqueue(chunk);
      // Once, as the answer on the key begins: said, not kept in the conversation
      if (chunk.type === "start" && moved)
        controller.enqueue({
          type: `data-${TEXT_CALL_MOVED}`,
          data: moved,
          transient: true,
        });
    },
    // Over before the page hears the end: what comes after her last step goes with the next turn
    flush: close,
  });
  // A provider's refusal is the user's to act on, so it is never masked
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: parts,
      tools: run.tools,
      onError: modelErrorToString,
    }).pipeThrough(told),
  });
}

/** A generator of stream parts as the stream the sdk reads; cancelled, the generator ends. */
function streamParts(
  make: () => AsyncGenerator<TextStreamPart<ToolSet>>,
): ReadableStream<TextStreamPart<ToolSet>> {
  const parts = make();
  return new ReadableStream({
    async pull(controller) {
      const next = await parts.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() {
      await parts.return(undefined);
    },
  });
}

/** A picture sent with the user's words, read for the model, or why it is not there. */
type Seen =
  | { path: string; mediaType: string; data: string }
  | { path: string; missed: string };

/**
 * The pictures sent with the user's words, each read from the workspace for the model this
 * turn runs on — or the line that says why it is not there, where the model cannot see
 * pictures (ai/model seesToolImages) or the file cannot be sent, so she never answers about a
 * picture she was not given. A path from a page or a chat is read only inside the workspace.
 */
async function readPictures(
  paths: string[],
  ref: TextModelRef,
): Promise<Seen[]> {
  const sees = seesToolImages(ref);
  return Promise.all(
    paths.map(async (path): Promise<Seen> => {
      if (!isPicture(path))
        return { path, missed: `${path} is not a picture you can be sent.` };
      if (!sees)
        return {
          path,
          missed: `${path} is a picture, and ${ref.model} cannot see pictures, so it was not sent to you.`,
        };
      const full = await insideWorkspace(path);
      const info = full ? await stat(full).catch(() => null) : null;
      if (!full || !info?.isFile())
        return {
          path,
          missed: `There is no file at ${path} in the workspace, so no picture was sent to you.`,
        };
      if (info.size > LOOK.maxBytes)
        return {
          path,
          missed: `${path} is ${Math.ceil(info.size / 1024 / 1024)} MB, over the ${LOOK.maxBytes / 1024 / 1024} MB a picture sent to you takes, so it was not sent. Make a smaller copy in the shell (on a Mac: sips -Z 1600 in.png --out out.png) and look at that.`,
        };
      const data = await readFile(full).catch(() => null);
      if (!data)
        return {
          path,
          missed: `${path} could not be read, so no picture was sent to you.`,
        };
      return { path, mediaType: mimeOf(path), data: data.toString("base64") };
    }),
  );
}

/** Words and the pictures sent with them, as the content of the user's message to the model. */
async function withPictures(
  text: string,
  pictures: string[] | undefined,
  ref: TextModelRef,
): Promise<UserContent> {
  if (!pictures?.length) return text;
  return [
    { type: "text", text },
    ...(await readPictures(pictures, ref)).map((seen) =>
      "data" in seen
        ? { type: "file" as const, mediaType: seen.mediaType, data: seen.data }
        : { type: "text" as const, text: seen.missed },
    ),
  ];
}

/** The file route every picture part a page sends names its file under (use-text-call). */
const FILE_ROUTE = queryKey.file("");

/** A picture the user sent, as a page's message part: named in the workspace, not carried. */
const picturePart = (path: string): UIMessage["parts"][number] => ({
  type: "file",
  mediaType: mimeOf(path),
  url: queryKey.file(path),
});

/**
 * The pictures a page's conversation names (use-text-call picturePart), read into it for the
 * model: each such part the picture itself, as a data URL, or the line that says why not. A
 * file part that names no workspace file sends nothing of it.
 */
async function readPictureParts(
  ui: UIMessage[],
  ref: TextModelRef,
): Promise<UIMessage[]> {
  return Promise.all(
    ui.map(async (message) => {
      if (!message.parts.some((part) => part.type === "file")) return message;
      const parts = await Promise.all(
        message.parts.map(async (part) => {
          if (part.type !== "file") return part;
          const path = part.url.startsWith(FILE_ROUTE)
            ? workspaceRelative(part.url)
            : null;
          if (!path)
            return {
              type: "text" as const,
              text: `${part.filename ?? "A file"} is not in the workspace, so nothing of it was sent to you.`,
            };
          const [seen] = await readPictures([path], ref);
          return "data" in seen
            ? {
                ...part,
                mediaType: seen.mediaType,
                url: `data:${seen.mediaType};base64,${seen.data}`,
              }
            : { type: "text" as const, text: seen.missed };
        }),
      );
      return { ...message, parts };
    }),
  );
}

/**
 * What reaches a turn already running: the user's own words, or a fact put in for them; the
 * workspace paths of pictures sent with the words, which reach her as pictures (readPictures).
 */
export type TurnNote = { text: string; said: boolean; pictures?: string[] };

/**
 * A turn whose conversation the server holds (reach): the same run as a page's, answered
 * whole. `messages` is the conversation so far, ending on what was just written; `said` is
 * those words when they are the user's, saved as their turn, and null for an update put in
 * for a bot, which is no turn of its own. `pictures` are the workspace paths of pictures
 * sent with those words, which go into their message as pictures (readPictures). `notes` is
 * asked before every step after the first: what arrived while she worked joins this turn
 * instead of waiting for the next, as it does for a bot (bot.run). What comes back is her
 * words, what she did, and the messages to carry into the next turn, in the order they were
 * said — and, when a spent plan moved the turn onto the OpenAI key (spareOf), the line that
 * tells them so.
 */
export async function answerInWriting(input: {
  callId: string;
  standing: string | null;
  messages: ModelMessage[];
  said: string | null;
  pictures?: string[];
  notes?: () => TurnNote[];
  signal?: AbortSignal;
}): Promise<{
  text: string;
  did: string[];
  messages: ModelMessage[];
  moved: string | null;
}> {
  const { callId, standing, messages, said, signal } = input;
  const [run, seq] = await Promise.all([
    loadRun(callId, null, true),
    nextTurnSeq(callId),
  ]);
  if (said !== null)
    await saveTurns(callId, [
      { id: crypto.randomUUID(), role: "user", text: said, seq },
    ]);
  const rows = turnRows(callId, said === null ? seq : seq + 1);
  const head = standingHead(standing);
  // The pictures sent with the last words go in their message, where every later turn
  // carries them in the same place
  const last = messages.at(-1);
  const asked =
    input.pictures?.length &&
    last?.role === "user" &&
    typeof last.content === "string"
      ? [
          ...messages.slice(0, -1),
          {
            role: "user" as const,
            content: await withPictures(last.content, input.pictures, run.ref),
          },
        ]
      : messages;
  // What the latest step was sent. The sdk returns only what she made, so this is where
  // a note that joined keeps its place between her steps
  let sent: ModelMessage[] = [...head, ...asked];
  /** Steps finished: a turn is moved to the key only while none has. */
  let finished = 0;
  const ask = (on: Run) =>
    generateText({
      model: on.model,
      instructions: on.system,
      messages: sent,
      allowSystemInMessages: true,
      tools: on.tools,
      providerOptions: on.providerOptions,
      stopWhen: stepCountIs(TEXT_CALL.maxSteps),
      abortSignal: signal,
      prepareStep: async ({ stepNumber, messages: soFar }) => {
        const notes = stepNumber > 0 ? (input.notes?.() ?? []) : [];
        sent = [
          ...soFar,
          ...(await Promise.all(
            notes.map(async (note) => ({
              role: "user" as const,
              content: await withPictures(note.text, note.pictures, on.ref),
            })),
          )),
        ];
        for (const note of notes) if (note.said) await rows.said(note.text);
        // Carried forward by the sdk: from here the steps stack on these
        return notes.length ? { messages: sent } : undefined;
      },
      onStepEnd: async (step) => {
        finished += 1;
        await rows.step(step);
      },
    });
  let result: Awaited<ReturnType<typeof ask>>;
  let moved: string | null = null;
  try {
    result = await ask(run);
  } catch (cause) {
    const spare = finished ? null : await spareOf(run.ref, cause);
    if (!spare) throw await planSpentError(cause);
    logger.info(`text call ${callId}: ${spare.line}`);
    moved = spare.line;
    try {
      result = await ask(await loadRun(callId, spare.ref, true));
    } catch (again) {
      throw await planSpentError(again);
    }
  }
  return {
    text: result.text.trim(),
    // What she did, as the call screen words it: all there is to show for a turn she
    // ended without a word
    did: result.steps.flatMap((step) =>
      step.toolCalls.map(
        (call) =>
          toolLine(call.toolName, JSON.stringify(call.input ?? {})) ??
          call.toolName,
      ),
    ),
    messages: [
      ...sent.slice(head.length),
      ...(result.steps.at(-1)?.response.messages ?? []),
    ],
    moved,
  };
}

/**
 * The rows of one turn, numbered from one counter. `step` saves a step as it ends, in the
 * order she made its parts: a tool turn keeps its name and arguments as a spoken call's
 * does, her words are a turn, a summary is a thought. `said` keeps words of the user's that
 * joined the turn between two of her steps.
 */
function turnRows(callId: string, from: number) {
  let seq = from;
  // Under the id the page drew it with, so the same words carried again are the same row
  const said = (text: string, id: string = crypto.randomUUID()) =>
    saveTurns(callId, [{ id, role: "user", text, seq: seq++ }]);
  const step = async (step: StepResult<ToolSet>) => {
    for (const part of step.content) {
      if (part.type === "tool-call") {
        const answered = step.content.find(
          (other) =>
            other.type === "tool-result" &&
            other.toolCallId === part.toolCallId,
        );
        await saveTurns(callId, [
          {
            id: part.toolCallId,
            role: "tool",
            tool: part.toolName,
            text:
              part.toolName === TOOL_NAMES.web_search
                ? searchTurn(
                    part.input,
                    answered?.type === "tool-result" ? answered.output : null,
                  )
                : JSON.stringify(part.input ?? {}),
            seq: seq++,
          },
        ]);
      } else if (part.type === "text" && part.text.trim()) {
        await saveTurns(callId, [
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: part.text.trim(),
            seq: seq++,
          },
        ]);
      } else if (part.type === "reasoning" && part.text.trim()) {
        await saveThought(callId, {
          id: crypto.randomUUID(),
          text: part.text.trim(),
          seq,
        });
      }
    }
  };
  return { step, said };
}

/** What stood open as the call began, ahead of the conversation. */
const standingHead = (standing: string | null | undefined): ModelMessage[] =>
  standing ? [{ role: "system", content: standing }] : [];

type Run = Awaited<ReturnType<typeof loadRun>>;

/** What a turn runs on, whoever holds the conversation: the model, her prompt, her tools. */
async function loadRun(
  callId: string,
  picked?: TextModelRef | null,
  /** Held by the server for someone on a phone: no screen of theirs to put anything on. */
  phone = false,
  /** Where the page found the user (where.ts); a phone has no page to say. */
  where?: Where | null,
) {
  const settings = await readLiveSettings();
  const ref = await runsOnOf(settings, picked);
  // Reasoning effort is OpenAI's word: asked of its models only, sent to them only
  const openai = ref.provider === "openai" || ref.provider === "chatgpt";

  const [model, system, held, exaKey, openaiKey] = await Promise.all([
    getTextModel(ref),
    loadThursdayPrompt({
      backendPrompt: settings.backendPrompt,
      written: true,
      callId,
      phone,
      persona: settings.persona,
      stylePrompt: settings.stylePrompt,
      readSkills: settings.readSkills,
      where,
    }),
    loadTools({
      target: "thursday",
      callId,
      webSearch: settings.webSearch,
      readSkills: settings.readSkills,
      written: true,
      model: ref,
      phone,
    }),
    readConfig(EXA_API_KEY),
    readConfig(LIVE_PROVIDER.apiKeyName),
  ]);

  // One search, never two, as on a spoken call (thursday.action): Exa's is among the
  // tools while its key is set, else the model's own where its provider has one
  const hosted = model.searchTools && Object.values(model.searchTools)[0];
  const tools: ToolSet = {
    ...held,
    // under the search's one name, so the line, the row and the log read it as the search
    ...(settings.webSearch && !exaKey && hosted
      ? { [TOOL_NAMES.web_search]: hosted }
      : {}),
  };

  // The reasoning the call asks for. Whether the model takes it can only be asked with an
  // API key (acceptedReasoning); without one it goes as chosen, and a refusal is shown
  const reasoning = !openai
    ? null
    : openaiKey
      ? await acceptedReasoning({
          apiKey: openaiKey,
          model: ref.model,
          effort: settings.reasoningEffort,
        })
      : wantedReasoning(settings.reasoningEffort);

  return {
    ref,
    model: model.model,
    system,
    tools,
    providerOptions: {
      openai: {
        ...(reasoning?.effort ? { reasoningEffort: reasoning.effort } : {}),
        ...(reasoning && "summary" in reasoning && reasoning.summary
          ? { reasoningSummary: reasoning.summary }
          : {}),
      },
    },
  };
}

async function prepare({
  callId,
  standing,
  runsOn,
  messages,
  where,
}: z.infer<typeof BodySchema>) {
  const [run, ui, seq] = await Promise.all([
    loadRun(callId, runsOn, false, readWhere(where)),
    validateUIMessages({
      messages,
      dataSchemas: { [TEXT_CALL_NOTE]: TextCallNoteSchema },
    }),
    nextTurnSeq(callId),
  ]);

  // What was just sent is a turn the moment it arrives, answered or not: each message of
  // theirs since her last answer — a turn that broke leaves one nobody answered — with the
  // words they wrote while she was answering before it. Kept under the ids the page drew them
  // with, so what is sent again is the same row. A fact for a bot's update is no turn of its
  // own, as on a spoken call: her answer to it is what is kept. An answer that broke comes
  // back last when it is sent again, and she carries on from what it finished
  const last = ui.at(-1)?.role;
  if (last !== "user" && last !== "assistant")
    publicError("The conversation must end with your words or hers.");
  let at = seq;
  const answered = ui.findLastIndex((message) => message.role === "assistant");
  for (const sent of ui.slice(answered + 1)) {
    for (const note of notesIn([sent]))
      if (note.said)
        await saveTurns(callId, [
          { id: note.id, role: "user", text: note.text, seq: at++ },
        ]);
    const words = wordsOf(sent);
    if (words)
      await saveTurns(callId, [
        { id: sent.id, role: "user", text: words, seq: at++ },
      ]);
  }

  return {
    ...run,
    callId,
    seq: at,
    messages: [
      ...standingHead(standing),
      // A tool an earlier answer broke off in has no result to send: the model would
      // be refused the whole conversation for it
      ...(await convertToModelMessages(
        await readPictureParts(spreadNotes(ui), run.ref),
        { ignoreIncompleteToolCalls: true },
      )),
    ],
  };
}

/**
 * Every note as a user message of its own, where it sits: ahead of the words it went out
 * with, or between the steps of her answer that read it, with the pictures sent with it. A
 * data part left in place is dropped from what the model is sent.
 */
function spreadNotes(ui: UIMessage[]): UIMessage[] {
  return ui.flatMap((message) => {
    const out: UIMessage[] = [];
    let parts: UIMessage["parts"] = [];
    const cut = () => {
      if (parts.length)
        out.push({ ...message, id: `${message.id}:${out.length}`, parts });
      parts = [];
    };
    for (const part of message.parts) {
      const note = noteOf(part);
      if (!note) {
        parts.push(part);
        continue;
      }
      cut();
      out.push({
        id: note.id,
        role: "user",
        parts: [
          { type: "text", text: note.text },
          ...(note.pictures ?? []).map(picturePart),
        ],
      });
    }
    cut();
    return out;
  });
}

export const NOTHING_TO_RUN_ON =
  "Writing to Thursday needs a GPT subscription sign-in or an OpenAI key — Settings › API keys.";

/**
 * A search as a spoken call keeps it (tool-line searchOf): what was looked for and the pages
 * read. Exa is asked with `query` and answers `sources`; a provider's own search names the
 * query in what it answers.
 */
function searchTurn(input: unknown, output: unknown): string {
  const asked = (input ?? {}) as { query?: unknown };
  const found = (output ?? {}) as {
    action?: { query?: unknown };
    sources?: unknown;
  };
  const query = [asked.query, found.action?.query].find(
    (one): one is string => typeof one === "string" && Boolean(one.trim()),
  );
  const sources = Array.isArray(found.sources)
    ? found.sources.flatMap((source) =>
        source && typeof source === "object" && "url" in source
          ? typeof source.url === "string"
            ? [
                {
                  url: source.url,
                  ...("title" in source && typeof source.title === "string"
                    ? { title: source.title }
                    : {}),
                },
              ]
            : []
          : [],
      )
    : [];
  return JSON.stringify({ query: query ?? null, sources });
}

const wordsOf = (message: UIMessage) =>
  message.parts
    .flatMap((part) => (part.type === "text" ? part.text : []))
    .join("\n")
    .trim();
