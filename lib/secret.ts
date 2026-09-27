import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { parseEnv } from "node:util";
import { ENV_PATH } from "@/config";

/**
 * The secrets the app keeps in its database — API keys, the phone's bot tokens, the ChatGPT
 * sign-in, a connector's headers and OAuth tokens — are sealed with one key before they are
 * written, so a copy of `local.db` on its own (a backup, a synced folder, a file attached to an
 * issue, a table a command dumped) carries none of them.
 *
 * What it does not do is keep them from anything that runs as the user: the key is in the data
 * folder's `.env`, and a bot's shell runs as the user (SECURITY.md). It never reaches a bot's
 * environment — `lib/sandbox` strips every THURSDAY_ variable and every name with KEY in it.
 */

/** Set in the environment, it wins over the data folder's `.env`, as it does in Next's own loading. */
export const ENCRYPTION_KEY_NAME = "THURSDAY_ENCRYPTION_KEY";

/** What a sealed value starts with. The version lets a later scheme tell its values from these. */
const SEALED = "enc:v1:";

// AES-256-GCM: a 32-byte key, a fresh 12-byte nonce for every seal, and a 16-byte tag that
// fails the open on a wrong key or any changed byte
const CIPHER = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** 32 bytes in base64, as `openssl rand -base64 32` prints them, or in base64url. */
const KEY_SHAPE = /^[A-Za-z0-9+/_-]{43}=?$/;

/** Written above a key this app made, for whoever opens the file. */
const KEY_NOTE =
  "# Thursday seals the API keys and sign-ins it saves in local.db with this key. Keep it with\n" +
  "# local.db: without it they cannot be read, and each has to be entered again.\n";

/** A sealed value this key cannot open: it was sealed under another key, or it is damaged. */
export class UnreadableSecret extends Error {}

type EncryptionKey = {
  key: Buffer;
  /** `made` is a key this load created and wrote down. */
  from: "environment" | "file" | "made";
  /** Taken from the environment while `envFile` holds another: what that one sealed does not open. */
  shadows?: true;
};

/**
 * The key: from the environment, else from `envFile`, else made and appended there — so a first
 * start asks nothing of the user, and a data folder that lost its `.env` gets a new one. An empty
 * or blank value is not set, in either place: `NAME=` is how a file leaves a value to fill in.
 *
 * A malformed value is thrown, never replaced: a new key would leave every secret sealed under
 * the old one unreadable, and only the person who wrote the value can say what it should be. A
 * file that exists but cannot be read, or a key that cannot be written, is thrown for the same
 * reason. Each says what to do.
 */
export function loadEncryptionKey(
  envFile: string,
  env: Record<string, string | undefined> = process.env,
): EncryptionKey {
  const set = env[ENCRYPTION_KEY_NAME]?.trim();
  if (set) {
    const key = parseKey(
      set,
      "the environment",
      `Correct it, or unset it to have the app keep its own in ${envFile}.`,
    );
    return shadowed(envFile, key)
      ? { key, from: "environment", shadows: true }
      : { key, from: "environment" };
  }

  const kept = keptKey(envFile);
  if (kept) {
    const key = parseKey(
      kept,
      envFile,
      "Put back the line it had, from a backup of that file; or delete the line, and a new key is made — the keys saved in Settings are then entered again.",
    );
    return { key, from: "file" };
  }

  return { key: makeKey(envFile), from: "made" };
}

let loaded: EncryptionKey | undefined;

/**
 * This data folder's key (config ENV_PATH), loaded once. Not pinned on globalThis: a module a
 * dev reload evaluates again reads the same file, and one server holds a data folder
 * (bin/lock.mjs), so no second process makes a key beside this one.
 */
export function encryptionKey(): EncryptionKey {
  loaded ??= loadEncryptionKey(ENV_PATH);
  return loaded;
}

export const isSealed = (value: string) => value.startsWith(SEALED);

/** `plain`, sealed. A fresh nonce each time, so two equal secrets never look alike. */
export function sealSecret(plain: string, key?: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key ?? encryptionKey().key, iv, {
    authTagLength: TAG_BYTES,
  });
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return (
    SEALED +
    Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url")
  );
}

/**
 * What `sealSecret` sealed. A value that is not sealed was written before sealing began and comes
 * back as it is, until boot seals it (config.query, mcp.query) — without loading the key, so
 * reading a plain row never makes one. Throws `UnreadableSecret` when the key cannot open it.
 */
export function openSecret(value: string, key?: Buffer): string {
  if (!isSealed(value)) return value;

  // Outside the try: a key that cannot be loaded is its own failure, not this value's
  const opener = key ?? encryptionKey().key;
  const raw = Buffer.from(value.slice(SEALED.length), "base64url");
  if (raw.length < IV_BYTES + TAG_BYTES) {
    throw new UnreadableSecret("The sealed value is cut short.");
  }
  try {
    const decipher = createDecipheriv(
      CIPHER,
      opener,
      raw.subarray(0, IV_BYTES),
      { authTagLength: TAG_BYTES },
    );
    decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
    return Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
  } catch (cause) {
    throw new UnreadableSecret(
      "It was sealed under another encryption key, or it is damaged.",
      { cause },
    );
  }
}

/** The 32 bytes a value holds; null for anything else — hex, a passphrase, a key cut short. */
function keyBytes(value: string): Buffer | null {
  const key = KEY_SHAPE.test(value) ? Buffer.from(value, "base64") : null;
  return key?.length === KEY_BYTES ? key : null;
}

function parseKey(value: string, where: string, fix: string): Buffer {
  const key = keyBytes(value);
  if (!key) {
    throw new Error(
      `${ENCRYPTION_KEY_NAME} in ${where} is not a key: it takes ${KEY_BYTES} random bytes in base64, as \`openssl rand -base64 ${KEY_BYTES}\` prints them. ${fix}`,
    );
  }
  return key;
}

/**
 * Whether `envFile` holds a key other than the environment's. Only said, never thrown: the
 * environment's is the one used, so a file that cannot be read, or holds no key, changes nothing.
 */
function shadowed(envFile: string, key: Buffer): boolean {
  let kept: string | undefined;
  try {
    kept = keptKey(envFile);
  } catch {
    return false;
  }
  const other = kept ? keyBytes(kept) : null;
  return Boolean(other && !other.equals(key));
}

/**
 * The key `envFile` holds, read as Next reads it — quotes, `export`, a trailing comment, and a name
 * set twice taking its last value (Node's `parseEnv` and `@next/env` agree on each).
 */
function keptKey(envFile: string): string | undefined {
  let text: string;
  try {
    text = readFileSync(envFile, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return undefined;
    throw new Error(
      `Cannot read ${envFile}, where ${ENCRYPTION_KEY_NAME} is kept (${code ?? error}): let this account read it.`,
      { cause: error },
    );
  }
  return parseEnv(text)[ENCRYPTION_KEY_NAME]?.trim() || undefined;
}

/**
 * A new key, appended to `envFile` below what is already there — the file may be a checkout's
 * own `.env`, with the person's other variables in it. Appended last, it is the value that
 * counts however many times the name was set above it.
 */
function makeKey(envFile: string): Buffer {
  const key = randomBytes(KEY_BYTES).toString("base64");

  // Read by keptKey just before, which threw on anything but a file not there yet
  const before = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  const gap = !before ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  try {
    mkdirSync(dirname(envFile), { recursive: true });
    // `mode` applies only when this creates the file
    appendFileSync(
      envFile,
      `${gap}${KEY_NOTE}${ENCRYPTION_KEY_NAME}=${key}\n`,
      { mode: 0o600 },
    );
  } catch (error) {
    throw new Error(
      `Cannot write a new ${ENCRYPTION_KEY_NAME} to ${envFile} (${(error as NodeJS.ErrnoException).code ?? error}): let this account write there, or set ${ENCRYPTION_KEY_NAME} in the environment.`,
      { cause: error },
    );
  }
  ownerOnly(envFile);

  // Read back as the next start will: a key is kept only once the file says it
  if (keptKey(envFile) !== key) {
    throw new Error(
      `A new ${ENCRYPTION_KEY_NAME} was added to ${envFile}, but the file does not read back as it: something changed that file while the app started. Start it again.`,
    );
  }
  return Buffer.from(key, "base64");
}

/**
 * The file now holds a key: only this account may read it, as with the database beside it
 * (database/db.ts ownerOnly). A `.env` someone made themselves has the umask's 644.
 */
function ownerOnly(file: string): void {
  try {
    chmodSync(file, 0o600);
  } catch {
    // A file this account does not own
  }
}
