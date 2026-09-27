import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

// Secrets at rest: the key a data folder keeps in its `.env`, what is sealed with it and what
// is not, what an older build wrote in the clear, and a key that cannot open what was sealed.
// No network.
const home = await mkdtemp(join(tmpdir(), "thursday-secrets-"));
process.env.THURSDAY_HOME = home;
const ROOT = join(import.meta.dirname, "..");

// What this machine exports stays out of it: the environment wins over a row (readConfig)
const OPENAI = "OPENAI_API_KEY";
const CHATGPT = "CHATGPT_SIGN_IN";
const ANTHROPIC = "ANTHROPIC_API_KEY";
const { EXA_API_KEY, DEFAULT_MODEL_KEY, DEFAULT_EFFORT_KEY } = await import(
  "../features/config/config.const.ts"
);
const { TELEGRAM_TOKEN_KEY } = await import(
  "../features/reach/reach.schema.ts"
);
for (const name of [
  "THURSDAY_ENCRYPTION_KEY",
  OPENAI,
  CHATGPT,
  ANTHROPIC,
  EXA_API_KEY,
  TELEGRAM_TOKEN_KEY,
  DEFAULT_MODEL_KEY,
  DEFAULT_EFFORT_KEY,
])
  delete process.env[name];

const secret = await import("../lib/secret.ts");
const { ENV_PATH } = await import("../config.ts");
const { migrateDatabase } = await import("../database/migrate.ts");
await migrateDatabase();
const { database } = await import("../database/db.ts");
const { configTable, mcpServerTable } = await import("../database/tables.ts");
const config = await import("../features/config/config.query.ts");
const mcp = await import("../features/connectors/mcp.query.ts");
const { isPublicError } = await import("../lib/public-error.ts");
const { sql } = await import("drizzle-orm");

after(() => rm(home, { recursive: true, force: true }));

const SEALED = /^enc:v1:[A-Za-z0-9_-]+$/;

/** A config row as it lies in the file, unopened. */
async function rawConfig(key: string): Promise<string | undefined> {
  const rows = await database.all<{ value: string }>(
    sql`select value from config where key = ${key}`,
  );
  return rows[0]?.value;
}

/** Written as an older build wrote it, or under a key this folder does not have. */
async function putConfig(key: string, value: string) {
  await database
    .insert(configTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: configTable.key, set: { value } });
}

/** A connector's row as it lies in the file: its config and oauth as JSON text. */
async function rawServer(name: string) {
  const rows = await database.all<{ config: string; oauth: string | null }>(
    sql`select config, oauth from mcp_server where name = ${name}`,
  );
  assert.ok(rows[0], `no row for ${name}`);
  return rows[0];
}

/** A connector's config as the manager connects with it: its credentials opened. */
async function openedConfig(name: string) {
  const server = await mcp.findServer(name);
  assert.ok(server, `no server ${name}`);
  return server.config;
}

/** Settings' own reads, as the screen asks for them. */
async function get<T>(route: {
  GET: (request: Request, context: never) => Promise<Response>;
}): Promise<T> {
  const response = await route.GET(new Request("http://127.0.0.1/api"), {
    params: Promise.resolve({}),
  } as never);
  const body = (await response.json()) as {
    $ok: boolean;
    data?: T;
    message?: string;
  };
  assert.equal(body.$ok, true, body.message ?? "the route failed");
  return body.data as T;
}

const refusedAs = (words: RegExp) => (error: unknown) =>
  isPublicError(error) && words.test(error.message);

/**
 * What `next dev` loads from each folder's .env into process.env, which this app reads first.
 * Its loader is resolved through `next`, the copy Next itself runs, not a dependency of this
 * repo's own (knip.json ignores it for that).
 */
function nextReads(dirs: string[]): (string | undefined)[] {
  const require = createRequire(import.meta.url);
  const loader = require.resolve("@next/env", {
    paths: [require.resolve("next")],
  });
  const run = spawnSync(
    process.execPath,
    [
      "-e",
      `const { loadEnvConfig } = require(${JSON.stringify(loader)});
       const read = ${JSON.stringify(dirs)}.map((dir) => {
         delete process.env.THURSDAY_ENCRYPTION_KEY;
         loadEnvConfig(dir, true, { info() {}, error() {} }, true);
         return process.env.THURSDAY_ENCRYPTION_KEY ?? null;
       });
       process.stdout.write(JSON.stringify(read));`,
    ],
    // As `next dev` runs: nothing of this process's own environment to win over a file
    {
      env: { PATH: process.env.PATH, NODE_ENV: "development" },
      encoding: "utf8",
    },
  );
  assert.equal(run.stderr, "");
  return (JSON.parse(run.stdout) as (string | null)[]).map(
    (value) => value ?? undefined,
  );
}

test("a pick or a domain's own row is written as it is, and reading it makes no key", async () => {
  await config.writeConfig(DEFAULT_MODEL_KEY, "xai/grok-4");
  await config.writeConfig("INTRO_PASSED", "on");
  assert.equal(await rawConfig(DEFAULT_MODEL_KEY), "xai/grok-4");
  assert.equal(await rawConfig("INTRO_PASSED"), "on");
  assert.equal(await config.readConfig(DEFAULT_MODEL_KEY), "xai/grok-4");
  assert.equal(existsSync(ENV_PATH), false);
});

test("a key is sealed before it is written, and the first one makes the folder's key in its .env", async () => {
  await config.writeConfig(OPENAI, "sk-test-0123456789");
  const stored = await rawConfig(OPENAI);
  assert.match(stored ?? "", SEALED);
  assert.ok(!stored?.includes("sk-test"));
  assert.equal(await config.readConfig(OPENAI), "sk-test-0123456789");
  assert.equal(await config.hasConfig(OPENAI), true);
  assert.equal(await config.isCallable(), true);

  const kept = await readFile(ENV_PATH, "utf8");
  assert.match(kept, /^THURSDAY_ENCRYPTION_KEY=[A-Za-z0-9+/]{43}=$/m);
  if (process.platform !== "win32")
    assert.equal((await stat(ENV_PATH)).mode & 0o777, 0o600);
});

test("the ChatGPT sign-in and a phone's token are secrets too; a pick is not", async () => {
  await config.writeConfig(CHATGPT, JSON.stringify({ access: "at-secret" }));
  await config.writeConfig(TELEGRAM_TOKEN_KEY, "123:token-secret");
  await config.writeConfig(DEFAULT_EFFORT_KEY, "low");
  assert.match((await rawConfig(CHATGPT)) ?? "", SEALED);
  assert.match((await rawConfig(TELEGRAM_TOKEN_KEY)) ?? "", SEALED);
  assert.equal(await rawConfig(DEFAULT_EFFORT_KEY), "low");
  assert.equal(await config.readConfig(TELEGRAM_TOKEN_KEY), "123:token-secret");
  // An emptied token reads as none, as it did in the clear
  await config.writeConfig(TELEGRAM_TOKEN_KEY, "");
  assert.equal(await config.readConfig(TELEGRAM_TOKEN_KEY), undefined);
  assert.equal(await config.hasConfig(TELEGRAM_TOKEN_KEY), false);
});

test("the environment still wins over a sealed row", async () => {
  await config.writeConfig(EXA_API_KEY, "exa-from-settings");
  process.env[EXA_API_KEY] = "exa-from-env";
  try {
    assert.equal(await config.readConfig(EXA_API_KEY), "exa-from-env");
    assert.equal(await config.hasConfig(EXA_API_KEY), true);
  } finally {
    delete process.env[EXA_API_KEY];
  }
  assert.equal(await config.readConfig(EXA_API_KEY), "exa-from-settings");
});

test("keys an older build wrote in the clear read as before, and are sealed at boot once", async () => {
  await putConfig(TELEGRAM_TOKEN_KEY, "456:legacy-token");
  await putConfig(EXA_API_KEY, "exa-legacy");
  await putConfig(DEFAULT_EFFORT_KEY, "high");
  assert.equal(await config.readConfig(TELEGRAM_TOKEN_KEY), "456:legacy-token");

  const first = await config.sealConfigSecrets();
  assert.deepEqual(first, { sealed: 2, unreadable: [] });
  assert.match((await rawConfig(TELEGRAM_TOKEN_KEY)) ?? "", SEALED);
  assert.match((await rawConfig(EXA_API_KEY)) ?? "", SEALED);
  assert.equal(await rawConfig(DEFAULT_EFFORT_KEY), "high");
  assert.equal(await config.readConfig(TELEGRAM_TOKEN_KEY), "456:legacy-token");
  assert.equal(await config.readConfig(EXA_API_KEY), "exa-legacy");

  // Every start runs it: the rows sealed already stay exactly as they are
  const before = await rawConfig(EXA_API_KEY);
  assert.deepEqual(await config.sealConfigSecrets(), {
    sealed: 0,
    unreadable: [],
  });
  assert.equal(await rawConfig(EXA_API_KEY), before);
});

test("a key sealed under a key this folder no longer has is asked for again — never used, never in the way, and Settings still opens", async () => {
  const lost = randomBytes(32);
  await putConfig(OPENAI, secret.sealSecret("sk-sealed-elsewhere", lost));
  await putConfig(CHATGPT, secret.sealSecret('{"access":"x"}', lost));
  await putConfig(EXA_API_KEY, secret.sealSecret("exa-sealed-elsewhere", lost));

  // Read as none, as anywhere a key may be absent: what can go without it goes on
  assert.equal(await config.readConfig(OPENAI), undefined);
  assert.equal(await config.readConfig(EXA_API_KEY), undefined);
  assert.equal(await config.hasConfig(OPENAI), false);
  assert.equal(await config.configState(OPENAI), "unreadable");

  // A use that needs that one key says why, where to put the file back, and what to do otherwise
  assert.match(
    await config.missingKeyWords(OPENAI, "No OpenAI key"),
    /^The saved OpenAI key can't be unlocked any more: the \.env in the data folder that unlocks it was lost or replaced \(THURSDAY_ENCRYPTION_KEY in .*\.env\)\. Enter it again in Settings\.$/,
  );
  assert.match(
    await config.missingKeyWords(CHATGPT, "Not signed in"),
    / sign-in can't be unlocked any more: .* Sign in again in Settings\.$/,
  );
  assert.equal(
    await config.missingKeyWords(ANTHROPIC, "No Anthropic key"),
    "No Anthropic key",
  );
  const { getTextModel } = await import("../features/ai/model.ts");
  await assert.rejects(
    getTextModel({ provider: "openai", model: "gpt-5-mini" }),
    refusedAs(/^The saved OpenAI key can't be unlocked any more: /),
  );
  // The first screen asks for the voice key again rather than failing to draw
  assert.equal(await config.isCallable(), false);
  const { unreadable } = await config.sealConfigSecrets();
  assert.deepEqual(unreadable.sort(), [CHATGPT, EXA_API_KEY, OPENAI].sort());

  // Settings draws both as unset and marked to be entered again, and the plan of a sign-in it
  // cannot open is not read
  const status = await get<{ key: string; set: boolean; unreadable?: true }[]>(
    await import("../app/api/config/route.ts"),
  );
  assert.deepEqual(
    status.find((one) => one.key === OPENAI),
    { key: OPENAI, set: false, unreadable: true },
  );
  assert.deepEqual(
    status.find((one) => one.key === CHATGPT),
    { key: CHATGPT, set: false, unreadable: true },
  );
  assert.deepEqual(
    status.find((one) => one.key === DEFAULT_EFFORT_KEY),
    { key: DEFAULT_EFFORT_KEY, set: true, value: "high" },
  );
  const providers = await get<
    { id: string; hasKey: boolean; plan?: string | null }[]
  >(await import("../app/api/llm-model/route.ts"));
  assert.equal(providers.find((one) => one.id === "openai")?.hasKey, false);
  assert.equal(providers.find((one) => one.id === "chatgpt")?.plan, null);

  // Entering it again replaces it, and the mark goes with it
  await config.writeConfig(OPENAI, "sk-entered-again");
  assert.equal(await config.readConfig(OPENAI), "sk-entered-again");
  assert.equal(await config.isCallable(), true);
  assert.equal(await config.configState(OPENAI), "set");
  // Removed, it is gone rather than lost
  await config.removeConfig(CHATGPT);
  assert.equal(await config.configState(CHATGPT), "unset");
  await config.writeConfig(EXA_API_KEY, "exa-entered-again");
});

test("a connector's headers and env are sealed; its url, command and args are not", async () => {
  await mcp.upsertServer({
    name: "remote",
    config: {
      url: "https://mcp.example.com/mcp",
      headers: { Authorization: "Bearer ghp_secret" },
    },
  });
  await mcp.upsertServer({
    name: "local",
    config: {
      command: "npx",
      args: ["-y", "some-server"],
      env: { SOME_TOKEN: "tok_secret" },
    },
  });

  const remote = await rawServer("remote");
  assert.ok(!remote.config.includes("ghp_secret"));
  assert.match(JSON.parse(remote.config).headers.Authorization, SEALED);
  assert.equal(JSON.parse(remote.config).url, "https://mcp.example.com/mcp");
  const local = await rawServer("local");
  assert.ok(!local.config.includes("tok_secret"));
  assert.deepEqual(JSON.parse(local.config).args, ["-y", "some-server"]);

  // The manager connects with them opened
  assert.deepEqual(await openedConfig("remote"), {
    url: "https://mcp.example.com/mcp",
    headers: { Authorization: "Bearer ghp_secret" },
  });
  assert.deepEqual(await openedConfig("local"), {
    command: "npx",
    args: ["-y", "some-server"],
    env: { SOME_TOKEN: "tok_secret" },
  });
  // Registering again replaces what it had
  await mcp.upsertServer({
    name: "remote",
    config: {
      url: "https://mcp.example.com/mcp",
      headers: { Authorization: "Bearer ghp_rotated" },
    },
  });
  assert.deepEqual(await openedConfig("remote"), {
    url: "https://mcp.example.com/mcp",
    headers: { Authorization: "Bearer ghp_rotated" },
  });
});

test("OAuth tokens are sealed, and the state the callback looks a server up by is not", async () => {
  await mcp.saveOAuthData("remote", {
    state: "st-123",
    codeVerifier: "verifier-secret",
    tokens: {
      access_token: "at-secret",
      refresh_token: "rt-secret",
      token_type: "Bearer",
    },
    clientInformation: { client_id: "cid", client_secret: "cs-secret" },
    authorizationServer: { issuer: "https://auth.example.com" },
  });
  const { oauth } = await rawServer("remote");
  for (const word of ["at-secret", "rt-secret", "cs-secret", "verifier-secret"])
    assert.ok(!oauth?.includes(word), `${word} is in the clear`);
  assert.equal(JSON.parse(oauth ?? "{}").state, "st-123");
  assert.match(JSON.parse(oauth ?? "{}").sealed, SEALED);

  const byState = await mcp.findServerByOAuthState("st-123");
  assert.equal(byState?.name, "remote");
  assert.equal(byState?.oauth?.codeVerifier, "verifier-secret");
  assert.deepEqual(byState?.oauth?.tokens, {
    access_token: "at-secret",
    refresh_token: "rt-secret",
    token_type: "Bearer",
  });
  assert.equal(
    byState?.oauth?.authorizationServer?.issuer,
    "https://auth.example.com",
  );

  // With the handshake's one-shot values and every credential gone, nothing is left to seal
  await mcp.saveOAuthData("remote", {
    state: "st-123",
    authorizationServer: { issuer: "https://auth.example.com" },
  });
  assert.deepEqual(JSON.parse((await rawServer("remote")).oauth ?? "{}"), {
    state: "st-123",
    authorizationServer: { issuer: "https://auth.example.com" },
  });
  await mcp.saveOAuthData("remote", null);
  assert.equal((await rawServer("remote")).oauth, null);
});

test("a connector an older build wrote in the clear reads as before, and is sealed at boot once", async () => {
  // Through the table, as an older build wrote it: nothing sealed
  await database.insert(mcpServerTable).values({
    name: "legacy",
    config: {
      url: "https://legacy.example/mcp",
      headers: { "X-Api-Key": "legacy-key" },
    },
    oauth: {
      state: "st-legacy",
      tokens: { access_token: "legacy-at", token_type: "Bearer" },
    },
  });
  assert.equal(
    (await mcp.findServerByOAuthState("st-legacy"))?.oauth?.tokens
      ?.access_token,
    "legacy-at",
  );

  // "remote" and "local" were sealed as they were written: "legacy" alone is left to seal
  assert.deepEqual(await mcp.sealMcpSecrets(), { sealed: 1, unreadable: [] });
  const row = await rawServer("legacy");
  assert.ok(!row.config.includes("legacy-key"));
  assert.ok(!row.oauth?.includes("legacy-at"));
  assert.equal(
    (await mcp.findServerByOAuthState("st-legacy"))?.oauth?.tokens
      ?.access_token,
    "legacy-at",
  );
  assert.deepEqual(await mcp.sealMcpSecrets(), { sealed: 0, unreadable: [] });
});

test("a connector whose key was sealed under a key this folder no longer has says to add it again, on its row too", async () => {
  await database.insert(mcpServerTable).values({
    name: "stranger",
    config: {
      url: "https://stranger.example/mcp",
      headers: {
        Authorization: secret.sealSecret("Bearer x", randomBytes(32)),
      },
    },
  });
  const addAgain =
    /^The key saved for "stranger" can't be unlocked any more: .* Add it again under the same name, with its key: bots keep the tools they pinned\.$/;
  await assert.rejects(mcp.findServer("stranger"), refusedAs(addAgain));
  assert.deepEqual((await mcp.sealMcpSecrets()).unreadable, ["stranger"]);
  // The Connectors screen says it on the row, and still lists it
  const listed = (await mcp.findAllServers()).find(
    (server) => server.name === "stranger",
  );
  assert.deepEqual(listed?.config, { url: "https://stranger.example/mcp" });
  assert.match(listed?.lastError ?? "", addAgain);

  // Added again under its name with the key: it opens, and the row is clear
  await mcp.upsertServer({
    name: "stranger",
    config: {
      url: "https://stranger.example/mcp",
      headers: { Authorization: "Bearer y" },
    },
  });
  assert.deepEqual(await openedConfig("stranger"), {
    url: "https://stranger.example/mcp",
    headers: { Authorization: "Bearer y" },
  });
  assert.equal(
    (await mcp.findAllServers()).find((server) => server.name === "stranger")
      ?.lastError,
    null,
  );
  await mcp.deleteServer("stranger");
});

test("a connector whose sign-in was sealed under a lost key asks for the sign-in again, and keeps its state", async () => {
  await database.insert(mcpServerTable).values({
    name: "signed",
    config: { url: "https://signed.example/mcp" },
    oauth: {
      state: "st-signed",
      authorizationServer: { issuer: "https://auth.signed.example" },
      sealed: secret.sealSecret(
        JSON.stringify({ tokens: { access_token: "gone" } }),
        randomBytes(32),
      ),
    },
  });
  // Nothing to open is nothing held: the next connect starts a sign-in, which replaces it
  assert.deepEqual((await mcp.findServer("signed"))?.oauth, {
    state: "st-signed",
    authorizationServer: { issuer: "https://auth.signed.example" },
  });
  assert.equal((await mcp.findServerByOAuthState("st-signed"))?.name, "signed");
  assert.deepEqual((await mcp.sealMcpSecrets()).unreadable, ["signed"]);
  assert.match(
    (await mcp.findAllServers()).find((server) => server.name === "signed")
      ?.lastError ?? "",
    /^The sign-in saved for "signed" can't be unlocked any more: .* Reconnect to sign in again\.$/,
  );
  // The sealed blob is kept until a sign-in writes over it: the old .env put back opens it
  assert.ok(JSON.parse((await rawServer("signed")).oauth ?? "{}").sealed);
  await mcp.deleteServer("signed");
});

test("an older build refuses a database this one opened, instead of sending a sealed value as a key", async () => {
  const migrations = join(ROOT, "database/migrations");
  const seal = (await readdir(migrations)).find((name) =>
    name.endsWith("_seal_secrets"),
  );
  assert.ok(seal, "no seal_secrets migration");
  // An older build is this one without the migration: its folder is all a build reads them from
  const older = await mkdtemp(join(tmpdir(), "thursday-older-"));
  try {
    await cp(migrations, join(older, "database/migrations"), {
      recursive: true,
    });
    await rm(join(older, "database/migrations", seal), { recursive: true });
    // Its boot, as far as the migrations: in a process of its own, as a second start is
    const start = join(older, "start.mts");
    await writeFile(
      start,
      `const { migrateDatabase, NewerDatabase } = await import(${JSON.stringify(join(ROOT, "database/migrate.ts"))});
       await migrateDatabase().then(
         () => console.log("opened"),
         (error) => console.log(error instanceof NewerDatabase ? "refused" : String(error)),
       );`,
    );
    const run = spawnSync(process.execPath, ["--import", "tsx", start], {
      cwd: ROOT,
      env: { ...process.env, THURSDAY_HOME: home, THURSDAY_APP_DIR: older },
      encoding: "utf8",
    });
    assert.equal(run.stdout.trim(), "refused", run.stderr);

    // And the build that ships the migration opens it as it was
    await cp(join(migrations, seal), join(older, "database/migrations", seal), {
      recursive: true,
    });
    const now = spawnSync(process.execPath, ["--import", "tsx", start], {
      cwd: ROOT,
      env: { ...process.env, THURSDAY_HOME: home, THURSDAY_APP_DIR: older },
      encoding: "utf8",
    });
    assert.equal(now.stdout.trim(), "opened", now.stderr);
  } finally {
    await rm(older, { recursive: true, force: true });
  }
});

test("the folder's key is made once and read back as the next start reads it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "thursday-key-"));
  try {
    const file = join(dir, "nested", ".env");
    const made = secret.loadEncryptionKey(file, {});
    assert.equal(made.from, "made");
    const again = secret.loadEncryptionKey(file, {});
    assert.equal(again.from, "file");
    assert.ok(made.key.equals(again.key));
    const sealed = secret.sealSecret("sk-kept", made.key);
    assert.equal(secret.openSecret(sealed, again.key), "sk-kept");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a checkout's own .env keeps what it had, and Next reads the key this app reads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "thursday-key-"));
  try {
    const file = join(dir, ".env");
    // No newline at its end, and the name set empty above
    const mine =
      "OPENAI_API_KEY=sk-mine\n# mine\nTHURSDAY_ENCRYPTION_KEY=\nOTHER=1";
    await writeFile(file, mine, { mode: 0o644 });
    const made = secret.loadEncryptionKey(file, {});
    assert.equal(made.from, "made");
    const text = await readFile(file, "utf8");
    assert.ok(text.startsWith(`${mine}\n`), "what was there changed");
    if (process.platform !== "win32")
      assert.equal((await stat(file)).mode & 0o777, 0o600);

    const [next] = nextReads([dir]);
    assert.ok(Buffer.from(next ?? "", "base64").equals(made.key));
    assert.equal(secret.loadEncryptionKey(file, {}).from, "file");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a key set in the environment wins and is written nowhere", async () => {
  const dir = await mkdtemp(join(tmpdir(), "thursday-key-"));
  try {
    const file = join(dir, ".env");
    const set = randomBytes(32);
    const got = secret.loadEncryptionKey(file, {
      THURSDAY_ENCRYPTION_KEY: set.toString("base64url"),
    });
    assert.equal(got.from, "environment");
    assert.ok(got.key.equals(set));
    assert.equal(existsSync(file), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an empty or blank key is not set, in the environment and in the file alike", async () => {
  const dir = await mkdtemp(join(tmpdir(), "thursday-key-"));
  try {
    const file = join(dir, ".env");
    const kept = secret.loadEncryptionKey(file, {});
    for (const blank of ["", "   ", "\t \t"]) {
      const got = secret.loadEncryptionKey(file, {
        THURSDAY_ENCRYPTION_KEY: blank,
      });
      assert.equal(got.from, "file", JSON.stringify(blank));
      assert.ok(got.key.equals(kept.key));
    }

    // Left blank in the file, as a template leaves it: a key is made below it, and read back as
    // the one — by this app and by Next alike
    const other = join(dir, "blank");
    await mkdir(other);
    await writeFile(join(other, ".env"), 'THURSDAY_ENCRYPTION_KEY="   "\n');
    const made = secret.loadEncryptionKey(join(other, ".env"), {
      THURSDAY_ENCRYPTION_KEY: " ",
    });
    assert.equal(made.from, "made");
    assert.ok(
      secret.loadEncryptionKey(join(other, ".env"), {}).key.equals(made.key),
    );
    const [next] = nextReads([other]);
    assert.ok(Buffer.from(next ?? "", "base64").equals(made.key));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a key written any way a .env allows is read as Next reads it", async () => {
  const key = randomBytes(32).toString("base64");
  const shapes = [
    `THURSDAY_ENCRYPTION_KEY=${key}`,
    `THURSDAY_ENCRYPTION_KEY="${key}"`,
    `THURSDAY_ENCRYPTION_KEY='${key}'`,
    `THURSDAY_ENCRYPTION_KEY=${key} # kept by Thursday`,
    `export THURSDAY_ENCRYPTION_KEY=${key}`,
    `A=1\r\nTHURSDAY_ENCRYPTION_KEY=${key}\r\n`,
    `THURSDAY_ENCRYPTION_KEY = ${key}`,
    `THURSDAY_ENCRYPTION_KEY=   ${key}   `,
    `THURSDAY_ENCRYPTION_KEY=\nTHURSDAY_ENCRYPTION_KEY=${key}`,
  ];
  const root = await mkdtemp(join(tmpdir(), "thursday-key-"));
  try {
    const dirs = await Promise.all(
      shapes.map(async (text, at) => {
        const dir = join(root, String(at));
        await mkdir(dir);
        await writeFile(join(dir, ".env"), text);
        return dir;
      }),
    );
    const next = nextReads(dirs);
    dirs.forEach((dir, at) => {
      const got = secret.loadEncryptionKey(join(dir, ".env"), {});
      assert.equal(got.from, "file", shapes[at]);
      assert.equal(got.key.toString("base64"), key, shapes[at]);
      assert.equal(next[at]?.trim(), key, `Next reads ${shapes[at]} otherwise`);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a key in the environment beside another in the file says so; the same one does not", async () => {
  const dir = await mkdtemp(join(tmpdir(), "thursday-key-"));
  try {
    const file = join(dir, ".env");
    const kept = secret.loadEncryptionKey(file, {});
    const other = randomBytes(32).toString("base64");
    assert.equal(
      secret.loadEncryptionKey(file, { THURSDAY_ENCRYPTION_KEY: other })
        .shadows,
      true,
    );
    assert.equal(
      secret.loadEncryptionKey(file, {
        THURSDAY_ENCRYPTION_KEY: kept.key.toString("base64"),
      }).shadows,
      undefined,
    );
    // The environment's is the one used: what the file holds, even nonsense, stops nothing
    await writeFile(file, "THURSDAY_ENCRYPTION_KEY=nonsense\n");
    const got = secret.loadEncryptionKey(file, {
      THURSDAY_ENCRYPTION_KEY: other,
    });
    assert.equal(got.from, "environment");
    assert.equal(got.shadows, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a hex key, a passphrase or one cut short stops the load, saying what to do, and nothing is written over it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "thursday-key-"));
  try {
    const file = join(dir, ".env");
    for (const wrong of [
      randomBytes(32).toString("hex"),
      "hunter2",
      randomBytes(16).toString("base64"),
      `${randomBytes(32).toString("base64")}x`,
    ])
      assert.throws(
        () =>
          secret.loadEncryptionKey(file, { THURSDAY_ENCRYPTION_KEY: wrong }),
        /THURSDAY_ENCRYPTION_KEY in the environment is not a key: .*openssl rand -base64 32.* unset it/,
      );
    assert.equal(existsSync(file), false);

    await writeFile(file, "THURSDAY_ENCRYPTION_KEY=too-short\n");
    assert.throws(
      () => secret.loadEncryptionKey(file, {}),
      /THURSDAY_ENCRYPTION_KEY in .* is not a key: .*Put back the line it had.* delete the line, and a new key is made/,
    );
    assert.equal(
      await readFile(file, "utf8"),
      "THURSDAY_ENCRYPTION_KEY=too-short\n",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a .env this account cannot read is not replaced by a new key", {
  skip:
    process.platform === "win32" || process.getuid?.() === 0
      ? "file modes do not stop this account"
      : false,
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "thursday-key-"));
  const file = join(dir, ".env");
  try {
    await writeFile(file, "SOMETHING=1\n");
    await chmod(file, 0o000);
    assert.throws(
      () => secret.loadEncryptionKey(file, {}),
      /Cannot read .*\.env, where THURSDAY_ENCRYPTION_KEY is kept \(EACCES\): let this account read it/,
    );
    await chmod(file, 0o600);
    assert.equal(await readFile(file, "utf8"), "SOMETHING=1\n");
  } finally {
    await chmod(file, 0o600).catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});

test("a folder the key cannot be written to stops the load, saying why", {
  skip:
    process.platform === "win32" || process.getuid?.() === 0
      ? "file modes do not stop this account"
      : false,
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "thursday-key-"));
  try {
    await chmod(dir, 0o500);
    assert.throws(
      () => secret.loadEncryptionKey(join(dir, ".env"), {}),
      /Cannot write a new THURSDAY_ENCRYPTION_KEY to .* \(EACCES\): let this account write there, or set THURSDAY_ENCRYPTION_KEY in the environment/,
    );
  } finally {
    await chmod(dir, 0o700);
    await rm(dir, { recursive: true, force: true });
  }
});

test("a sealed value opens under its own key alone, and a changed byte is refused", () => {
  const key = randomBytes(32);
  const words = "sk-ünïcode ✓ with spaces";
  const one = secret.sealSecret(words, key);
  const two = secret.sealSecret(words, key);
  assert.notEqual(one, two, "a nonce was reused");
  assert.equal(secret.openSecret(one, key), words);
  assert.equal(secret.openSecret(secret.sealSecret("", key), key), "");

  assert.throws(
    () => secret.openSecret(one, randomBytes(32)),
    secret.UnreadableSecret,
  );
  const at = one.length - 10;
  const changed = `${one.slice(0, at)}${one[at] === "A" ? "B" : "A"}${one.slice(at + 1)}`;
  assert.throws(() => secret.openSecret(changed, key), secret.UnreadableSecret);
  assert.throws(
    () => secret.openSecret("enc:v1:c2hvcnQ", key),
    secret.UnreadableSecret,
  );
  // Written before sealing began: as it is
  assert.equal(secret.openSecret("sk-plain", key), "sk-plain");
});

test("the key never reaches a bot's shell", async () => {
  const { createSandBox } = await import("../lib/sandbox.ts");
  process.env.THURSDAY_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  try {
    const shell = createSandBox({
      workingDirectory: home,
      spill: { dir: "spill", max: 8000, head: 5500, tail: 1500 },
    });
    const { stdout } = await shell.exec("env");
    assert.ok(
      !stdout
        .split("\n")
        .some((line) => line.startsWith("THURSDAY_ENCRYPTION_KEY=")),
    );
  } finally {
    delete process.env.THURSDAY_ENCRYPTION_KEY;
  }
});
