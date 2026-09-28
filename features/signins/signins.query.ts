import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { appEvents } from "@/app/api/events/app-event.server";
import { BROWSER_CLI, DATA_DIR, PATHS } from "@/config";
import {
  browserStateFile,
  jobShellEnv,
  type ListedBrowser,
  listBrowsers,
  openWorkspace,
  saveBrowserState,
  WORKSPACE,
} from "@/features/workspace/workspace";
import { logger } from "@/lib/logger";
import type { Sandbox } from "@/lib/sandbox";
import { type SignIn, siteOf } from "./signins.schema";

/**
 * The vault: one file per site under the data folder, outside the workspace the bots work
 * in, so no bot comes across another's session among its files. It is a place, not a lock —
 * a bot's shell is not confined — and what it buys is that a session reaches a browser only
 * through the app, which asks the list below first. A file holds the record and the
 * browser's storage state together, so signing out is removing one file.
 */
// Dot-prefixed like the workspace, so in a checkout it never reads as part of the app
const VAULT = join(DATA_DIR, PATHS.signIns);

type Kept = SignIn & { state: unknown };

const fileOf = (site: string) =>
  join(VAULT, `${encodeURIComponent(siteOf(site))}.json`);

const changed = () => appEvents.emit({ type: "signins" });

async function read(site: string): Promise<Kept | null> {
  try {
    return JSON.parse(await readFile(fileOf(site), "utf8")) as Kept;
  } catch {
    return null;
  }
}

/**
 * The sign-in a name stands for: its own, else the one kept for a domain it sits under, the
 * longest first. A site's cookies are its domain's, so `myaccount.google.com` is signed in
 * by what was kept as `google.com` — asked by another name, the same session read as missing.
 */
async function readFor(site: string): Promise<Kept | null> {
  const asked = siteOf(site);
  const exact = await read(asked);
  if (exact) return exact;
  const over = (await listSignIns())
    .map((one) => one.site)
    .filter((kept) => asked.endsWith(`.${kept}`))
    .sort((a, b) => b.length - a.length)[0];
  return over ? read(over) : null;
}

async function write(kept: Kept) {
  await mkdir(VAULT, { recursive: true });
  // Owner-only: the session signs in as them
  await writeFile(fileOf(kept.site), JSON.stringify(kept), { mode: 0o600 });
  changed();
}

const record = ({ state: _state, ...signIn }: Kept): SignIn => signIn;

export async function listSignIns(): Promise<SignIn[]> {
  const names = await readdir(VAULT).catch(() => [] as string[]);
  const all = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map((name) => read(decodeURIComponent(name.slice(0, -5)))),
  );
  return all
    .flatMap((kept) => (kept ? [record(kept)] : []))
    .sort((a, b) => a.site.localeCompare(b.site));
}

/**
 * Keeps what `bot`'s browser holds for `site`. The bot that kept it may borrow it; whoever
 * could before still can. A site already kept is replaced only by a bot the user let use it:
 * any other would swap every allowed bot onto the account it signed in with, and put itself
 * on the list without the user — it goes on the asking list instead, as `borrowSignIn` does.
 */
export async function keepSignIn(input: {
  site: string;
  account: string;
  bot: string;
  state: unknown;
}): Promise<{ kind: "kept" | "taken"; signIn: SignIn }> {
  const before = await readFor(input.site);
  if (before && !before.bots.includes(input.bot)) {
    const asked = before.asking.includes(input.bot)
      ? before
      : { ...before, asking: [...before.asking, input.bot] };
    if (asked !== before) await write(asked);
    return { kind: "taken", signIn: record(asked) };
  }
  const site = before?.site ?? siteOf(input.site);
  const kept: Kept = {
    site,
    account: input.account.trim() || site,
    bots: [...new Set([...(before?.bots ?? []), input.bot])],
    asking: (before?.asking ?? []).filter((bot) => bot !== input.bot),
    keptAt: new Date().toISOString(),
    usedAt: before?.usedAt ?? null,
    state: input.state,
  };
  await write(kept);
  return { kind: "kept", signIn: record(kept) };
}

/**
 * What `bot` gets when it asks for `site`: the state when it may borrow it, else why not —
 * nothing is kept, or the user has not let this bot in, which is noted so the screen can
 * offer the one tap.
 */
export async function borrowSignIn(
  site: string,
  bot: string,
): Promise<
  | { kind: "state"; signIn: SignIn; state: unknown }
  | { kind: "none"; kept: string[] }
  | { kind: "ask"; signIn: SignIn }
> {
  const kept = await readFor(site);
  if (!kept)
    return { kind: "none", kept: (await listSignIns()).map((one) => one.site) };
  if (!kept.bots.includes(bot)) {
    if (!kept.asking.includes(bot))
      await write({ ...kept, asking: [...kept.asking, bot] });
    return { kind: "ask", signIn: record(kept) };
  }
  const used = { ...kept, usedAt: new Date().toISOString() };
  await write(used);
  return { kind: "state", signIn: record(used), state: kept.state };
}

/** A participant's session as the browser CLI lists it, or null when it has none open. */
async function listedBrowser(
  sandbox: Sandbox,
  env: Record<string, string>,
): Promise<ListedBrowser | null> {
  const browsers = await listBrowsers(sandbox, env);
  return browsers.find((b) => b.name === env.PLAYWRIGHT_CLI_SESSION) ?? null;
}

/**
 * Whose browser a participant's session drives: its own, or the user's Chrome it attached
 * to. Theirs holds every site they are signed in to, so its state is never read out.
 */
export async function sessionBrowser(
  sandbox: Sandbox,
  env: Record<string, string>,
): Promise<"own" | "theirs" | null> {
  const open = await listedBrowser(sandbox, env);
  if (!open) return null;
  return open.attached ? "theirs" : "own";
}

/** Whether a participant's own browser is a window on the user's screen. */
export async function sessionWindow(
  sandbox: Sandbox,
  env: Record<string, string>,
): Promise<boolean> {
  const open = await listedBrowser(sandbox, env);
  return !!open && !open.attached && open.headed === true;
}

/**
 * The kept sign-ins each browser holds because the app put them there (`sign_in_use`) or took
 * them from it (`sign_in_keep`), by its CLI session, with the bot it is for. Renewal reads
 * back these alone: a browser that only visited a site holds a visitor's cookies under the
 * same names (a shop's PHPSESSID, a CSRF token), and copied back they would sign every bot
 * out. `mark` is what the app set on that browser when it did (`setMark`): an `open` in the
 * same session starts another browser under the same name, and what that one holds was never
 * lent. Kept in memory, pinned to globalThis so the tool that notes and the run that renews
 * share one map across a dev reload; after a restart nothing is renewed until a sign-in is
 * loaded again.
 */
type Hold = { bot: string; mark: string; sites: Set<string> };
type Held = Map<string, Hold>;
const holding: Held = ((
  globalThis as typeof globalThis & { __signInsLent?: Held }
).__signInsLent ??= new Map());

/**
 * Set on the browser's own context through the CLI's `run-code`, which runs in the process
 * that holds the browser: it lasts as long as that browser, and the one the next `open`
 * starts under the same session does not have it. It lives in that process alone, never in
 * the browser's storage, so no site sees it and no saved state carries it.
 */
const MARK = "__thursdaySignIns";

/** The mark on a participant's browser; null when it has none, undefined when it cannot be read. */
async function readMark(
  sandbox: Sandbox,
  env: Record<string, string>,
): Promise<string | null | undefined> {
  const read = await sandbox.exec(
    `playwright-cli --raw run-code "async page => page.context().${MARK} ?? null"`,
    { env, timeoutMs: BROWSER_CLI.readMs },
  );
  if (read.exitCode !== 0) return undefined;
  try {
    const mark = JSON.parse(read.stdout) as unknown;
    return typeof mark === "string" ? mark : null;
  } catch {
    return undefined;
  }
}

async function setMark(
  sandbox: Sandbox,
  env: Record<string, string>,
  mark: string,
): Promise<boolean> {
  const set = await sandbox.exec(
    `playwright-cli --raw run-code "async page => { page.context().${MARK} = '${mark}'; return true; }"`,
    { env, timeoutMs: BROWSER_CLI.readMs },
  );
  // Read back: a CLI that stopped keeping one context between commands would lose it, and
  // every renewal after would be skipped without a word
  return set.exitCode === 0 && (await readMark(sandbox, env)) === mark;
}

/**
 * Notes that this participant's browser holds `site`'s kept sign-in, for `bot`, and marks the
 * browser. `loaded`: `state-load` replaced its whole storage (Playwright clears every cookie
 * before it adds the state's), so it holds that sign-in alone. `kept`: taken from what it
 * holds, which stays, so what the app lent it before is still held — while it is still the
 * browser the app marked.
 */
export async function holdSignIn(
  sandbox: Sandbox,
  env: Record<string, string>,
  bot: string,
  site: string,
  how: "loaded" | "kept",
): Promise<void> {
  const key = env.PLAYWRIGHT_CLI_SESSION;
  if (!key) return;
  const held = holding.get(key);
  if (
    how === "kept" &&
    held?.bot === bot &&
    (await readMark(sandbox, env)) === held.mark
  ) {
    held.sites.add(site);
    return;
  }
  const mark = randomUUID().replaceAll("-", "");
  if (await setMark(sandbox, env, mark)) {
    holding.set(key, { bot, mark, sites: new Set([site]) });
    return;
  }
  holding.delete(key);
  logger.warn(
    `sign-ins: ${key}'s browser could not be marked, so ${site} is not renewed from it`,
  );
}

/**
 * Someone just signed in to `site` in this participant's browser: what it holds for that site
 * is that sign-in, whoever it is, and no longer the kept one the app lent it.
 */
export function releaseSignIn(env: Record<string, string>, site: string) {
  const held = holding.get(env.PLAYWRIGHT_CLI_SESSION ?? "");
  if (!held) return;
  const asked = siteOf(site);
  for (const one of held.sites)
    if (one === asked || asked.endsWith(`.${one}`) || one.endsWith(`.${asked}`))
      held.sites.delete(one);
}

/** This participant's browser holds nothing the app can vouch for: a load into it failed part way. */
export function forgetBrowser(env: Record<string, string>) {
  holding.delete(env.PLAYWRIGHT_CLI_SESSION ?? "");
}

/**
 * The browser was closed and opened again with the same storage loaded back (the sign-in
 * window going, ai/tools/signin.tool): it holds what the last one held, so it takes its mark.
 */
export async function carryHold(
  sandbox: Sandbox,
  env: Record<string, string>,
): Promise<void> {
  const key = env.PLAYWRIGHT_CLI_SESSION ?? "";
  const held = holding.get(key);
  if (held && !(await setMark(sandbox, env, held.mark))) holding.delete(key);
}

type Cookie = { name: string; domain: string; path: string; value: string };
type State = { cookies?: Cookie[] };

const cookieKey = (cookie: Cookie) =>
  `${cookie.name}\n${cookie.domain}\n${cookie.path}`;

/**
 * A site renews its session cookies while the session is used, and the copy kept here goes
 * stale: lent again, it can be refused, or end the session it was copied from. So this
 * participant's browser's cookies go back into the kept sign-ins it holds (`holdSignIn`) and
 * its bot may still use — only the cookies a sign-in already holds (same name, domain and
 * path), so a browser that signed out changes nothing, and only from the browser the app
 * marked. Run after every turn (renewSignIns) and before a load clears what the browser holds
 * (ai/tools/signin.tool). One attached to the user's own Chrome is theirs and is not read.
 */
export async function renewHeld(
  sandbox: Sandbox,
  env: Record<string, string>,
): Promise<void> {
  const key = env.PLAYWRIGHT_CLI_SESSION ?? "";
  const held = holding.get(key);
  if (!held?.sites.size) return;
  if ((await sessionBrowser(sandbox, env)) !== "own") {
    // Closed, or theirs now: what it held went with it
    holding.delete(key);
    return;
  }
  const mark = await readMark(sandbox, env);
  // Unreadable: nothing is copied from a browser the app cannot tell, and it is asked again next time
  if (mark === undefined) return;
  if (mark !== held.mark) {
    // Another browser under the same session, started by `open`: it was never lent anything
    holding.delete(key);
    return;
  }

  const path = browserStateFile();
  let now: Map<string, Cookie>;
  try {
    const saved = await sandbox.exec(saveBrowserState(path), {
      env,
      timeoutMs: BROWSER_CLI.loadMs,
    });
    if (saved.exitCode !== 0) return;
    const state = JSON.parse(await sandbox.readFile(path, "utf-8")) as State;
    now = new Map((state.cookies ?? []).map((c) => [cookieKey(c), c]));
  } finally {
    await sandbox.exec(`rm -f ${path}`);
  }

  for (const site of held.sites) {
    const kept = await read(site);
    const state = kept?.state as State | undefined;
    if (!kept || !state?.cookies || !kept.bots.includes(held.bot)) continue;
    let renewed = false;
    const cookies = state.cookies.map((cookie) => {
      const fresh = now.get(cookieKey(cookie));
      if (!fresh || JSON.stringify(fresh) === JSON.stringify(cookie))
        return cookie;
      renewed = true;
      return fresh;
    });
    if (renewed) await write({ ...kept, state: { ...state, cookies } });
  }
}

/** After a bot's turn: `session` is the participant's (workspace botBrowserSession). */
export async function renewSignIns(session: string): Promise<void> {
  const env = jobShellEnv(session);
  if (!holding.get(env.PLAYWRIGHT_CLI_SESSION ?? "")?.sites.size) return;
  await renewHeld(await openWorkspace(), env);
}

/** The user's say on one bot: let in, or not any more. Only the screen calls this. */
export async function setSignInBot(site: string, bot: string, on: boolean) {
  const kept = await read(site);
  if (!kept) return;
  await write({
    ...kept,
    bots: on
      ? [...new Set([...kept.bots, bot])]
      : kept.bots.filter((one) => one !== bot),
    asking: kept.asking.filter((one) => one !== bot),
  });
}

/** Signs out as far as the app can: what is kept goes. The site may still list the session. */
export async function removeSignIn(site: string) {
  await rm(fileOf(site), { force: true });
  changed();
}

/**
 * Sessions bots kept in their own folders before the vault (`bots/<name>/.auth/*.json`, as
 * the browser skill used to say) are taken in under the file's name and removed from the
 * workspace, where every bot's shell could read them. Once, at boot; nothing to do after.
 */
export async function adoptKeptSessions(): Promise<void> {
  const root = join(WORKSPACE, PATHS.bots);
  for (const bot of await readdir(root).catch(() => [] as string[])) {
    const folder = join(root, bot, ".auth");
    for (const name of await readdir(folder).catch(() => [] as string[])) {
      if (!name.endsWith(".json")) continue;
      const path = join(folder, name);
      try {
        const state = JSON.parse(await readFile(path, "utf8")) as unknown;
        const site = name.slice(0, -5);
        const account = (
          await readFile(join(folder, "account.txt"), "utf8").catch(() => "")
        ).trim();
        const kept = await keepSignIn({ site, account, bot, state });
        await rm(path);
        logger.info(
          kept.kind === "kept"
            ? `sign-ins: took in ${bot}'s ${site}`
            : `sign-ins: ${site} is kept for another bot already; ${bot}'s old copy was removed and ${bot} is asking for it`,
        );
      } catch (cause) {
        logger.warn(`sign-ins: could not take in ${path}`, cause);
      }
    }
  }
}
