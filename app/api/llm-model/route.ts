import { readChatGptPlan } from "@/features/ai/chatgpt";
import {
  type AiProvider,
  TEXT_MODEL_PROVIDER_LIST,
} from "@/features/ai/model.schema";
import { hasConfig } from "@/features/config/config.query";
import { serverRoute } from "@/lib/protocol/server-route";

/**
 * Callable providers, whether each one's key is set, and the plan a sign-in is on. A key the
 * data folder's key cannot open is not set (config.query hasConfig), and its plan is not read.
 */
export const GET = serverRoute(async () =>
  Promise.all(
    TEXT_MODEL_PROVIDER_LIST.map(async (item): Promise<AiProvider> => {
      const hasKey = await hasConfig(item.apiKeyName);
      return {
        id: item.id,
        label: item.label,
        apiKeyName: item.apiKeyName,
        suggestModels: item.suggestModels,
        hasKey,
        ...(item.signIn && {
          signIn: true as const,
          plan: hasKey ? await readChatGptPlan() : null,
        }),
      };
    }),
  ),
);
