import { tool } from "ai";
import * as z from "zod";
import { lookAtSpec } from "@/features/ai/tools/look.tool";
import { TOOL_NAMES } from "@/features/ai/tools/tool-name";
import {
  FACE_WORD_MARKS,
  FACE_WORD_MAX,
} from "@/features/thursday/ascii.const";

/**
 * The call lives in the page, so these tools have no server-side execute; the
 * page supplies the behaviour (use-thursday). loadTools declares them too so
 * `/api/thursday/tool-call` refuses them by name rather than as unknown tools.
 */
const endCallSpec = {
  description: `End the call.

The line stays open until this runs, and drops once the goodbye being said is over.`,
  parameters: z.object({}),
};

/** Deliberately has no `execute`. */
const endCallTool = tool({
  description: endCallSpec.description,
  inputSchema: endCallSpec.parameters,
});

const emoteSpec = {
  description: "Show a short word on your face for a few seconds.",
  parameters: z.object({
    text: z
      .string()
      .describe(
        `Up to ${FACE_WORD_MAX} characters: A-Z, 0-9, space and ${FACE_WORD_MARKS.join(" ")}.`,
      ),
  }),
};

/** Deliberately has no `execute`. */
const emoteTool = tool({
  description: emoteSpec.description,
  inputSchema: emoteSpec.parameters,
});

const lookAtScreenSpec = {
  description: `See the screen the user is sharing with you, as it is at this moment.

The picture comes right after this result. When they are not sharing, the result says so.`,
  parameters: z.object({}),
};

/** Deliberately has no `execute`: the page holds the shared screen and takes the picture. */
const lookAtScreenTool = tool({
  description: lookAtScreenSpec.description,
  inputSchema: lookAtScreenSpec.parameters,
});

/**
 * Deliberately has no `execute`: a spoken call's backend answers through the page, which fetches
 * the picture and puts it in after this turn's results, as it does the shared screen's.
 */
const lookAtTool = tool({
  description: lookAtSpec.description,
  inputSchema: lookAtSpec.parameters,
});

/** The tools that act on the call itself, and the picture the page hands it. */
export function callTools() {
  return {
    [TOOL_NAMES.end_call]: endCallTool,
    [TOOL_NAMES.emote]: emoteTool,
    [TOOL_NAMES.look_at_screen]: lookAtScreenTool,
    [TOOL_NAMES.look_at]: lookAtTool,
  };
}
