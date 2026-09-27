import { eq } from "drizzle-orm";
import { appEvents } from "@/app/api/events/app-event.server";
import { ENV_PATH } from "@/config";
import { database } from "@/database/db";
import { configTable } from "@/database/tables";
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
  LOST_KEY_WHY,
  VOICE_GROUP_ID,
} from "./config.const";

/**
 * Env var wins over the row the settings screen wrote. A secret this data folder's key cannot
 * open reads as unset, as a key may be anywhere: a use that can go without it — search, a studio
 * model, one phone service among several — goes on without it rather than stopping. Settings
 * marks it to be entered again (`configState`), boot names it, and a use that needs that one key
 * says why it has none (`missingKeyWords`).
 */
export async function readConfig(key: string) {
  const fromEnv = process.env[key]?.trim();
  if (fromEnv) return fromEnv;

  const stored = await readRow(key);
  if (stored === undefined) return undefined;
  return opened(stored)?.trim() || undefined;
}

/**
 * What a use that needs this one key says when `readConfig` found none: why, when it was saved
 * and can no longer be read, else `unset` — the caller's words for a key never given.
 */
export async function missingKeyWords(
  key: string,
  unset: string,
): Promise<string> {
  return (await configState(key)) === "unreadable"
    ? unreadableWords(key)
    : unset;
}

/**
 * What Settings shows of a key: set, unset, or saved but unreadable — sealed under a key this
 * data folder no longer has. The last is not set, since nothing can use it; it is kept rather
 * than deleted, so the data folder's old `.env`, put back, opens it again, and entering the key
 * again replaces it.
 */
export async function configState(
  key: string,
): Promise<"set" | "unset" | "unreadable"> {
  if (process.env[key]?.trim()) return "set";
  const stored = await readRow(key);
  if (stored === undefined) return "unset";
  const value = opened(stored);
  if (value === null) return "unreadable";
  return value.trim() ? "set" : "unset";
}

/** Whether a key is set and can be read: what `isCallable` and the providers list count. */
export async function hasConfig(key: string): Promise<boolean> {
  return (await configState(key)) === "set";
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

/** How a use of a secret the key cannot open says so, with the file to put back if there is one. */
function unreadableWords(key: string): string {
  const entry = CONFIG_ENTRIES[key];
  const what = entry?.signIn ? "sign-in" : "key";
  const again = entry?.signIn ? "Sign in again" : "Enter it again";
  return `The saved ${entry?.label ?? key} ${what} can't be unlocked any more: ${LOST_KEY_WHY} (${ENCRYPTION_KEY_NAME} in ${ENV_PATH}). ${again} in Settings.`;
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
