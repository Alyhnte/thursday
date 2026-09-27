import {
  CONFIG_CHOICES,
  CONFIG_KEYS,
  type ConfigStatus,
} from "@/features/config/config.const";
import { hasConfig, readConfig } from "@/features/config/config.query";
import { serverRoute } from "@/lib/protocol/server-route";

/**
 * ConfigStatus[]: which declared keys are set. `value` is included only for
 * choice entries (config.const `choices`); secrets never leave the server. A
 * secret the data folder's key cannot open reads as unset (config.query hasConfig),
 * so its row asks for it again rather than taking the whole screen down.
 */
export const GET = serverRoute(() =>
  Promise.all(
    CONFIG_KEYS.map(
      async (key): Promise<ConfigStatus> => ({
        key,
        set: await hasConfig(key),
        ...(CONFIG_CHOICES[key] ? { value: await readConfig(key) } : {}),
      }),
    ),
  ),
);
