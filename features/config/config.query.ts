import { eq } from "drizzle-orm";
import { appEvents } from "@/app/api/events/app-event.server";
import { ENV_PATH } from "@/config";
import { database } from "@/database/db";
import { configTable } from "@/database/tables";
import { publicError } from "@/lib/public-error";
import {
  ENCRYPTION_KEY_NAME,
  isSealed,
  openSecret,
  sealSecret,
  UnreadableSecret,
} from "@/lib/secret";
import {
  CONFIG_ENTRIES,
  CONFIG_GROUPS,
  CONFIG_KEYS,
  groupSatisfied,
  isSecretKey,
  VOICE_GROUP_ID,
} from "./config.const";

/**
 * Env var wins over the row the settings screen wrote. A secret the data folder's key cannot
 * open throws, saying so: moving on as if it were unset would run on another provider nobody
 * chose (ai/model resolveDefaultModel), and the screen shows it unset already (`hasConfig`).
 */
export async function readConfig(key: string) {
  const fromEnv = process.env[key]?.trim();
  if (fromEnv) return fromEnv;

  const stored = await readRow(key);
  if (stored === undefined) return undefined;
  const value = opened(stored);
  if (value === null) publicError(unreadableWords(key));
  return value.trim() || undefined;
}

/**
 * Whether a key is set and can be read: what Settings shows as set and what `isCallable`
 * counts. A secret sealed under a key this data folder no longer has is not set — nothing can
 * use it, and entering it again replaces it.
 */
export async function hasConfig(key: string): Promise<boolean> {
  if (process.env[key]?.trim()) return true;
  const stored = await readRow(key);
  return stored !== undefined && Boolean(opened(stored)?.trim());
}

async function readRow(key: string): Promise<string | undefined> {
  const [row] = await database
    .select({ value: configTable.value })
    .from(configTable)
    .where(eq(configTable.key, key));
  return row?.value;
}

/** A stored value, opened when it is sealed (lib/secret); null when this data folder's key cannot open it. */
function opened(stored: string): string | null {
  try {
    return openSecret(stored);
  } catch (cause) {
    if (cause instanceof UnreadableSecret) return null;
    throw cause;
  }
}

/** How a use of a secret the key cannot open says so. */
function unreadableWords(key: string): string {
  const entry = CONFIG_ENTRIES[key];
  const again = entry?.signIn ? "sign in again" : "enter it again";
  return `The saved ${entry?.label ?? key} ${entry?.signIn ? "sign-in" : "key"} was sealed with an encryption key this data folder no longer has (${ENCRYPTION_KEY_NAME} in ${ENV_PATH}) — ${again} in Settings.`;
}

/**
 * A key, sign-in or pick that Settings lists changed, whoever changed it: every open tab reads
 * them again (`config`). The table's other rows belong to a domain that reads its own.
 */
const changed = (key: string) => {
  if (CONFIG_KEYS.includes(key)) appEvents.emit({ type: "config" });
};

/** A secret (config.const isSecretKey) is sealed before it is written; a pick or a domain's own row is not. */
export async function writeConfig(key: string, value: string) {
  const stored = isSecretKey(key) ? sealSecret(value) : value;
  await database
    .insert(configTable)
    .values({ key, value: stored })
    .onConflictDoUpdate({ target: configTable.key, set: { value: stored } });
  changed(key);
}

export async function removeConfig(key: string) {
  await database.delete(configTable).where(eq(configTable.key, key));
  changed(key);
}

/**
 * Seals the secrets written before sealing began, and names the sealed ones this data folder's
 * key cannot open. Run at boot, after the migrations; a second run seals nothing. One
 * transaction, so a start that dies halfway leaves the rows as they were for the next.
 */
export async function sealConfigSecrets(): Promise<{
  sealed: number;
  unreadable: string[];
}> {
  return database.transaction(async (tx) => {
    const rows = await tx.select().from(configTable);
    const unreadable: string[] = [];
    let sealed = 0;
    for (const row of rows) {
      if (isSealed(row.value)) {
        if (opened(row.value) === null) unreadable.push(row.key);
      } else if (isSecretKey(row.key)) {
        await tx
          .update(configTable)
          .set({ value: sealSecret(row.value) })
          .where(eq(configTable.key, row.key));
        sealed++;
      }
    }
    return { sealed, unreadable };
  });
}

/** Whether a voice key exists (the keys group's `requireKeys`); decides call screen vs intro. */
export async function isCallable(): Promise<boolean> {
  const voice = CONFIG_GROUPS.find((group) => group.id === VOICE_GROUP_ID);
  if (!voice) return true;

  const set = await Promise.all(
    voice.entries.map(
      async (entry) => [entry.key, await hasConfig(entry.key)] as const,
    ),
  );
  const has = new Map(set);
  return groupSatisfied(voice, (key) => has.get(key) ?? false);
}
