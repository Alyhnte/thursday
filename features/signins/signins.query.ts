import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
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
 * The vault: one file per account of a site under the data folder, outside the workspace the
 * bots work in, so no bot comes across another's session among its files. It is a place, not
 * a lock — a bot's shell is not confined — and what it buys is that a session reaches a
 * browser only through the app, which asks the list below first. A file holds the record and
 * the browser's storage state together, so signing out of one account is removing one file.
 */
// Dot-prefixed like the workspace, so in a checkout it never reads as part of the app
const VAULT = join(DATA_DIR, PATHS.signIns);

type Kept = SignIn & { state: unknown };

/**
 * A sign-in's file: the site as it reads, and the account hashed, so any name the site shows
 * makes a file name, and two that differ only in case stay two files on a disk that ignores
 * case (macOS's, by default) as they do everywhere else.
 */
const fileOf = (site: string, account: string) =>
  join(
    VAULT,
    `${encodeURIComponent(siteOf(site))}@${createHash("sha256").update(account).digest("hex").slice(0, 16)}.json`,
  );

const changed = () => appEvents.emit({ type: "signins" });

async function readKept(path: string): Promise<Kept | null> {
  try {
    const kept = JSON.parse(await readFile(path, "utf8")) as Kept;
    return typeof kept.site === "string" && typeof kept.account === "string"
      ? kept
      : null;
  } catch {
    return null;
  }
}

const read = (site: string, account: string) => readKept(fileOf(site, account));

/**
 * Every sign-in kept, by site, then account. Only files where their own site and account put
 * them: one left under an older name (settleVault) is not a second copy of anything.
 */
async function listKept(): Promise<Kept[]> {
  await settled();
  const names = await readdir(VAULT).catch(() => [] as string[]);
  const all = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        const kept = await readKept(join(VAULT, name));
        return kept && basename(fileOf(kept.site, kept.account)) === name
          ? kept
          : null;
      }),
  );
  return all
    .flatMap((kept) => (kept ? [kept] : []))
    .sort(
      (a, b) =>
        a.site.localeCompare(b.site) || a.account.localeCompare(b.account),
    );
}

/**
 * The sign-ins a name stands for: its own site's, else those kept for a domain it sits under,
 * the longest first. A site's cookies are its domain's, so `myaccount.google.com` is signed in
 * by what was kept as `google.com` — asked by another name, the same session read as missing.
 */
async function keptFor(site: string): Promise<Kept[]> {
  const asked = siteOf(site);
  const all = await listKept();
  const own = all.filter((one) => one.site === asked);
  if (own.length) return own;
  const over = all
    .map((one) => one.site)
    .filter((kept) => asked.endsWith(`.${kept}`))
    .sort((a, b) => b.length - a.length)[0];
  return over ? all.filter((one) => one.site === over) : [];
}

async function write(kept: Kept) {
  await mkdir(VAULT, { recursive: true });
  // Owner-only: the session signs in as them
  await writeFile(fileOf(kept.site, kept.account), JSON.stringify(kept), {
    mode: 0o600,
  });
  changed();
}

const record = ({ state: _state, ...signIn }: Kept): SignIn => signIn;

export async function listSignIns(): Promise<SignIn[]> {
  return (await listKept()).map(record);
}

/**
 * Keeps what `bot`'s browser holds for `site`, as `account`. A site keeps one sign-in per
 * account; the bot that kept one may borrow it, and whoever could before still can. An
 * account already kept is replaced only by a bot the user let use it: any other would swap
 * every allowed bot onto the session it signed in with, and put itself on the list without
 * the user — it goes on the asking list instead, as `borrowSignIn` does. The account is the
 * name the bot read off the page, which the app cannot check, so a name that matches none the
 * site keeps is kept beside them only when the bot says it is `another` account: the same
 * account written two ways is caught before it is two rows.
 */
export async function keepSignIn(input: {
  site: string;
  account: string;
  bot: string;
  state: unknown;
  another?: boolean | null;
}): Promise<
  | { kind: "kept" | "taken"; signIn: SignIn }
  | { kind: "unlisted"; site: string; accounts: string[] }
> {
  const kept = await keptFor(input.site);
  const site = kept[0]?.site ?? siteOf(input.site);
  const account = input.account.trim() || site;
  const before = kept.find((one) => one.account === account);
  if (before && !before.bots.includes(input.bot)) {
    const asked = before.asking.includes(input.bot)
      ? before
      : { ...before, asking: [...before.asking, input.bot] };
    if (asked !== before) await write(asked);
    return { kind: "taken", signIn: record(asked) };
  }
  if (!before && kept.length && !input.another)
    return {
      kind: "unlisted",
      site,
      accounts: kept.map((one) => one.account),
    };
  const next: Kept = {
    site,
    account,
    bots: [...new Set([...(before?.bots ?? []), input.bot])],
    asking: (before?.asking ?? []).filter((bot) => bot !== input.bot),
    keptAt: new Date().toISOString(),
    usedAt: before?.usedAt ?? null,
    state: input.state,
  };
  await write(next);
  return { kind: "kept", signIn: record(next) };
}

/**
 * What `bot` gets when it asks for `site`: the state when it may borrow it, else why not —
 * nothing is kept; the site keeps several accounts and none, or one it does not keep, was
 * named; or the user has not let this bot in, which is noted so the screen can offer the one
 * tap. Which account the work is for is the bot's to say, or the user's: with more than one
 * kept, none is picked for it.
 */
export async function borrowSignIn(
  site: string,
  bot: string,
  account?: string | null,
): Promise<
  | { kind: "state"; signIn: SignIn; state: unknown }
  | { kind: "none"; kept: string[] }
  | { kind: "pick"; site: string; accounts: string[] }
  | { kind: "ask"; signIn: SignIn }
> {
  const kept = await keptFor(site);
  if (!kept.length)
    return {
      kind: "none",
      kept: [...new Set((await listKept()).map((one) => one.site))],
    };
  const named = account?.trim();
  const one = named
    ? kept.find((each) => each.account === named)
    : kept.length === 1
      ? kept[0]
      : undefined;
  if (!one)
    return {
      kind: "pick",
      site: kept[0].site,
      accounts: kept.map((each) => each.account),
    };
  if (!one.bots.includes(bot)) {
    if (!one.asking.includes(bot))
      await write({ ...one, asking: [...one.asking, bot] });
    return { kind: "ask", signIn: record(one) };
  }
  const used = { ...one, usedAt: new Date().toISOString() };
  await write(used);
  return { kind: "state", signIn: record(used), state: one.state };
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
 * them from it (`sign_in_keep`), by its CLI session, with the bot it is for: per site, the
 * account, since a site's cookies carry one session at a time. Renewal reads back these
 * alone: a browser that only visited a site holds a visitor's cookies under the same names (a
 * shop's PHPSESSID, a CSRF token), and copied back they would sign every bot out. `mark` is
 * what the app set on that browser when it did (`setMark`): an `open` in the same session
 * starts another browser under the same name, and what that one holds was never lent. Kept in
 * memory, pinned to globalThis so the tool that notes and the run that renews share one map
 * across a dev reload; after a restart nothing is renewed until a sign-in is loaded again.
 */
type Hold = { bot: string; mark: string; sites: Map<string, string> };
type Held = Map<string, Hold>;
const holding: Held = ((
  globalThis as typeof globalThis & { __signInsLentByAccount?: Held }
).__signInsLentByAccount ??= new Map());

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
 * Notes that this participant's browser holds a kept sign-in, for `bot`, and marks the
 * browser. `loaded`: `state-load` replaced its whole storage (Playwright clears every cookie
 * before it adds the state's), so it holds that sign-in alone. `kept`: taken from what it
 * holds, which stays, so what the app lent it before is still held — while it is still the
 * browser the app marked — but for this site, which it holds as this account now.
 */
export async function holdSignIn(
  sandbox: Sandbox,
  env: Record<string, string>,
  bot: string,
  signIn: Pick<SignIn, "site" | "account">,
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
    held.sites.set(signIn.site, signIn.account);
    return;
  }
  const mark = randomUUID().replaceAll("-", "");
  if (await setMark(sandbox, env, mark)) {
    holding.set(key, {
      bot,
      mark,
      sites: new Map([[signIn.site, signIn.account]]),
    });
    return;
  }
  holding.delete(key);
  logger.warn(
    `sign-ins: ${key}'s browser could not be marked, so ${signIn.site} is not renewed from it`,
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
  for (const one of [...held.sites.keys()])
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

  for (const [site, account] of held.sites) {
    const kept = await read(site, account);
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
export async function setSignInBot(
  site: string,
  account: string,
  bot: string,
  on: boolean,
) {
  const kept = await read(site, account);
  if (!kept) return;
  await write({
    ...kept,
    bots: on
      ? [...new Set([...kept.bots, bot])]
      : kept.bots.filter((one) => one !== bot),
    asking: kept.asking.filter((one) => one !== bot),
  });
}

/**
 * Signs out of one account as far as the app can: what is kept for it goes, and the site's
 * other accounts stay. The site may still list the session.
 */
export async function removeSignIn(site: string, account: string) {
  await rm(fileOf(site, account), { force: true });
  changed();
}

/**
 * Sign-ins kept before a site kept one per account sat in one file a site (`<site>.json`):
 * each moves to its account's file, as it is. A file whose place is taken stays where it is,
 * and the log names it.
 */
export async function settleVault(): Promise<void> {
  for (const name of await readdir(VAULT).catch(() => [] as string[])) {
    if (!name.endsWith(".json")) continue;
    const from = join(VAULT, name);
    const kept = await readKept(from);
    if (!kept) continue;
    const to = fileOf(kept.site, kept.account);
    if (to === from) continue;
    if (existsSync(to)) {
      logger.warn(
        `sign-ins: ${name} stays where it is: ${kept.site} (${kept.account}) is kept in ${basename(to)} already`,
      );
      continue;
    }
    await rename(from, to);
    logger.info(
      `sign-ins: ${kept.site} (${kept.account}) has its own file now`,
    );
  }
}

/**
 * The move runs before this process first reads the vault, not at boot: `next dev` loads new
 * code into a server that never boots again, and would read none of the older files until a
 * restart. Pinned to globalThis so a reload does not run it twice.
 */
function settled(): Promise<void> {
  const pinned = globalThis as typeof globalThis & {
    __signInsSettled?: Promise<void>;
  };
  pinned.__signInsSettled ??= settleVault().catch((cause) =>
    logger.error("sign-ins: the vault could not be settled", cause),
  );
  return pinned.__signInsSettled;
}

/**
 * Sessions bots kept in their own folders before the vault (`bots/<name>/.auth/*.json`, as
 * the browser skill used to say) are taken in under the file's name and removed from the
 * workspace, where every bot's shell could read them. Once, at boot; nothing to do after.
 * One for an account the site does not keep yet is kept beside the others, since nobody is
 * there to say whether it is another name for one of them.
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
        const kept = await keepSignIn({
          site,
          account,
          bot,
          state,
          another: true,
        });
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
