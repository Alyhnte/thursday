import { Resolver } from "node:dns/promises";
import { ImapFlow } from "imapflow";
import { authenticate } from "mailauth";
import { type AddressObject, type ParsedMail, simpleParser } from "mailparser";
import { createTransport } from "nodemailer";
import { APP_NAME, REACH } from "@/config";
import { readConfig, writeConfig } from "@/features/config/config.query";
import { logger } from "@/lib/logger";
import {
  type Button,
  type Channel,
  ChannelRefusal,
  type Incoming,
  type OutgoingFile,
} from "./channel";
import { type ChatText, chatPieces } from "./chat-text";
import {
  IMAP_TLS_PORT,
  type MailServer,
  parseServer,
  SMTP_TLS_PORT,
  serverWords,
} from "./mail-servers";

/**
 * A mailbox of Thursday's own as a reach channel: its inbox read over IMAP — told of new mail
 * while the connection idles, so nothing calls in — and her answers sent over SMTP, each in
 * the thread of what was written. Signed in with an app password its mail service made for
 * her, over TLS only.
 *
 * Anyone can write to an address, and anyone can put another's address in From. So who may
 * write is named on the screen (`named`), and a mail reaches her only once the sender's own
 * mail service vouches for it: DMARC passes on a signature of that domain (mailauth), checked
 * here rather than taken from a header the receiving service wrote. It must also be written to
 * her address and be recent (REACH.mailFreshMs) — an old mail of theirs, still signed, could
 * otherwise be sent to her again by anyone it once went to. The inbox is only read: nothing in
 * it is marked, moved or deleted.
 */

const MB = 1024 * 1024;
/**
 * The largest mail read, all it carries included; past it the mail is named to them as not
 * read. Gmail takes mail up to 50 MB, and few services send larger.
 */
const MAIL_TAKE = 50 * MB;
/**
 * The most an answer attaches. The big services take a 20–25 MB mail (Outlook and iCloud 20,
 * Gmail and Yahoo 25), and a file travels a third larger inside one (base64).
 */
const MAIL_SEND = 14 * MB;
/**
 * How long the connection idles before it is renewed. A server may drop an idle one after 30
 * minutes (RFC 3501 §5.4) and some do sooner, silently.
 */
const IDLE_MS = 4 * 60_000;
/** How long a sender's DNS records may take to look up before the check is tried again later. */
const DNS_MS = 5_000;
/** How many handed-over Message-IDs are kept, so one sent to her again is not answered again. */
const IDS_KEPT = 200;

/** Where the inbox was read up to, kept across restarts (a domain row, config.query). */
export const EMAIL_SEEN_KEY = "REACH_EMAIL_SEEN";

type Seen = {
  /** The mailbox it was read in: another address starts over. */
  address: string;
  /** The server's UIDVALIDITY: when it changes, the old numbers mean nothing (RFC 3501 §2.3.1.1). */
  validity: string;
  uid: number;
  ids: string[];
};

/** DNS as mailauth asks it (`resolver`), bounded so one slow domain cannot hold up the inbox. */
export type Resolve = (
  domain: string,
  type: string,
) => Promise<string[][] | string[]>;

const dns = new Resolver({ timeout: DNS_MS, tries: 1 });
const lookUp: Resolve = (domain, type) =>
  type === "TXT"
    ? dns.resolveTxt(domain)
    : (dns.resolve(domain, type) as Promise<string[]>);

/** The sender's records could not be looked up: the mail waits and is checked again. */
export class CheckLater extends Error {}

/** One message as reach takes it. */
type Written = Extract<Incoming, { kind: "message" }>;

/** A mail, read: who wrote, and what, as reach takes it, with what threads an answer under it. */
export type Mail = Written & {
  subject: string;
  id: string | null;
  refs: string[];
  /** Why it is not taken as from `chat`, in words for anyone (`unproven` is the same, for them). */
  why?: string;
};

/**
 * One mail as reach hears it, or null when it is nobody's to answer: no single From, or sent
 * by a machine (Auto-Submitted, RFC 3834 — an out-of-office answering her would be answered
 * back). A mail that cannot be vouched for comes with `unproven`, which reach says only to
 * the one who may write. Throws `CheckLater` when the sender's records could not be looked up.
 */
export async function readMail(
  source: Buffer,
  at: { mailbox: string; arrived: Date; now?: number; resolve?: Resolve },
): Promise<Mail | null> {
  const mail = await simpleParser(source, {
    skipImageLinks: true,
    skipTextToHtml: true,
  });
  const froms = mail.headerLines.filter((line) => line.key === "from");
  const [from, ...more] = mail.from?.value ?? [];
  if (froms.length !== 1 || more.length || !from?.address) return null;
  const auto = mail.headers.get("auto-submitted");
  const sentBy =
    typeof auto === "string"
      ? auto
      : ((auto as { value?: string })?.value ?? "no");
  if (sentBy.trim().toLowerCase() !== "no") return null;

  const address = from.address.toLowerCase();
  const subject = (mail.subject ?? "").trim();
  const body = withoutQuote(mail.text ?? "");
  const files = mail.attachments.map((file, at) => {
    const name = file.filename || `attachment-${at + 1}`;
    return {
      name,
      size: file.size,
      fetch: async () =>
        new File([new Uint8Array(file.content)], name, {
          type: file.contentType,
        }),
    };
  });
  const refused = await unproven(mail, source, address, at);
  return {
    kind: "message",
    chat: address,
    name: from.name?.trim() || address,
    handle: address,
    words: body,
    files,
    unreadable: false,
    ...(refused
      ? {
          why: refused.why,
          unproven: notRead(subject, refused.why, refused.advice),
        }
      : {}),
    subject,
    id: mail.messageId ?? null,
    refs: [...referencesOf(mail), ...(mail.messageId ? [mail.messageId] : [])],
  };
}

/** What the one who may write is told of a mail of theirs that was not read (reach take). */
const notRead = (subject: string, why: string, advice = "") =>
  `Your mail${subject ? ` “${subject}”` : ""} was not read: ${why}.${advice ? ` ${advice}` : ""}`;

/**
 * Why this mail is not taken as from `address`, and what its sender can do about it;
 * undefined when it is.
 */
async function unproven(
  mail: ParsedMail,
  source: Buffer,
  address: string,
  at: { mailbox: string; arrived: Date; now?: number; resolve?: Resolve },
): Promise<{ why: string; advice?: string } | undefined> {
  const mailbox = at.mailbox.toLowerCase();
  if (!addressesOf(mail.to, mail.cc).includes(mailbox))
    return {
      why: `it was not written to ${mailbox}`,
      advice: "Thursday reads only mail with her address in To or Cc.",
    };
  const now = at.now ?? Date.now();
  const written = Math.min(
    mail.date?.getTime() ?? at.arrived.getTime(),
    at.arrived.getTime(),
  );
  if (now - written > REACH.mailFreshMs)
    return {
      why: `it was written more than ${Math.round(REACH.mailFreshMs / 3_600_000)} hours ago`,
      advice: "Write it again if it still stands.",
    };

  const checked = await authenticate(source, {
    resolver: at.resolve ?? lookUp,
    disableArc: true,
    disableBimi: true,
  }).catch((cause: unknown) => {
    throw new CheckLater(`Could not check who sent a mail: ${reasonOf(cause)}`);
  });
  const dmarc = checked.dmarc;
  const domain = address.slice(address.lastIndexOf("@") + 1);
  const result = dmarc ? dmarc.status.result : "none";
  if (result === "temperror" || result === "temperr")
    throw new CheckLater(
      `Could not check who sent a mail: ${domain}'s records did not answer`,
    );
  if (!dmarc || result !== "pass")
    return {
      why: `${domain}'s mail service does not vouch that it came from ${address}, so it could be anyone's (its DMARC check said: ${result})`,
      advice:
        "Thursday reads only mail its sender's service signs and stands behind. Gmail, iCloud, Fastmail and most others do; a domain of your own needs DKIM and DMARC set up.",
    };
  // A signature over only the start of the body (l=) leaves the rest free for anyone to write
  if (dmarc.alignment?.dkim.underSized)
    return {
      why: "its signature covers only part of it, so the rest could be anyone's",
    };
  return undefined;
}

/** Every address in To and Cc, lowercased. */
function addressesOf(
  ...fields: (AddressObject | AddressObject[] | undefined)[]
): string[] {
  return fields
    .flatMap((field) => (Array.isArray(field) ? field : field ? [field] : []))
    .flatMap((group) => group.value)
    .flatMap((one) => [
      ...(one.address ? [one.address.toLowerCase()] : []),
      // An address inside a named group ("team: a@x, b@y;")
      ...(one.group ?? []).flatMap((inner) =>
        inner.address ? [inner.address.toLowerCase()] : [],
      ),
    ]);
}

function referencesOf(mail: ParsedMail): string[] {
  const refs = mail.references;
  return Array.isArray(refs) ? refs : refs ? [refs] : [];
}

/**
 * Their words, without the earlier mail quoted under them. A quote is lines that open with
 * ">" (RFC 3676 §4.5); only a run of them that ends the mail goes, so a reply written between
 * quoted lines keeps its quotes. The line introducing the quote is in the sender's own words
 * and language, so it stays.
 */
export function withoutQuote(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").trimEnd().split("\n");
  let end = lines.length;
  let quoted = false;
  while (end > 0) {
    const line = lines[end - 1];
    if (line.startsWith(">")) quoted = true;
    else if (line.trim()) break;
    end--;
  }
  return (quoted ? lines.slice(0, end) : lines).join("\n").trim();
}

/** A subject without the "Re:" replies put in front of it (RFC 5322 §3.6.5). */
const bareSubject = (subject: string) =>
  subject.replace(/^(\s*re\s*:\s*)+/i, "").trim();

/** The conversation with one address: the thread an answer goes into. */
type Thread = { subject: string; last: string | null; refs: string[] };

/**
 * `resolve` is how senders' records are looked up: DNS, unless a test stands in for the
 * domains its mail is signed by.
 */
export function createEmail(
  address: string,
  password: string,
  imapServer: string,
  smtpServer: string,
  resolve: Resolve = lookUp,
): Channel {
  const mailbox = address.trim().toLowerCase();
  /** The mail each conversation is in, so an answer is threaded under what was written. */
  const threads = new Map<string, Thread>();
  /** How often a mail's sender could not be checked (CheckLater), by UID. Kept across connections. */
  const checks = new Map<number, number>();

  /** A server as it was saved, or the step that holds it refused (REACH_KEYS order). */
  const server = (value: string, key: number, what: string): MailServer => {
    const parsed = parseServer(value);
    if (!parsed)
      throw new ChannelRefusal(
        `“${value}” is not a ${what} server as host:port. Save her mailbox again.`,
        key,
      );
    return parsed;
  };

  const smtpOf = (smtp: MailServer) =>
    createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === SMTP_TLS_PORT,
      // Never a password over a line that is not encrypted
      requireTLS: smtp.port !== SMTP_TLS_PORT,
      auth: { user: address, pass: password },
    });

  /** A sign-in the server turned away is the user's to fix; asking again would not change it. */
  const refusedBy = (where: MailServer) => (cause: unknown) => {
    const failed = cause as {
      authenticationFailed?: boolean;
      code?: string;
      responseText?: string;
      response?: unknown;
      message?: string;
    };
    if (failed.authenticationFailed || failed.code === "EAUTH") {
      const said =
        failed.responseText ||
        (typeof failed.response === "string" ? failed.response : "") ||
        failed.message ||
        "no";
      throw new ChannelRefusal(
        `${where.host} said “${said}”: it did not take ${address} with this app password. An app password stops working when the account's own password changes — create a new one for her mailbox and save it here.`,
        1,
      );
    }
    throw new Error(
      `Could not reach ${serverWords(where)}: ${reasonOf(cause)}`,
      {
        cause,
      },
    );
  };

  async function readSeen(validity: string, next: number): Promise<Seen> {
    try {
      const kept = JSON.parse((await readConfig(EMAIL_SEEN_KEY)) ?? "") as Seen;
      if (kept.address === mailbox && kept.validity === validity) return kept;
    } catch {}
    // A mailbox new to her, or renumbered: what is in it already is not written to her now
    const fresh = { address: mailbox, validity, uid: next - 1, ids: [] };
    await writeConfig(EMAIL_SEEN_KEY, JSON.stringify(fresh));
    return fresh;
  }

  async function send(
    chat: string,
    text: ChatText,
    buttons: Button[] = [],
    files: OutgoingFile[] = [],
  ) {
    const smtp = server(smtpServer, 3, "sending");
    const thread = threads.get(chat);
    const plain = chatPieces(text, "plain", Number.POSITIVE_INFINITY).join(
      "\n\n",
    );
    // Telegram's marks are a small, escaped subset of HTML, which a mail draws as it is
    const html = chatPieces(text, "telegram", Number.POSITIVE_INFINITY).join(
      "\n\n",
    );
    const choices = buttons.length
      ? {
          plain: `\n\nAnswer by replying with one of:\n${buttons.map((button) => `• ${button.text}`).join("\n")}`,
          html: `<p>Answer by replying with one of:</p><ul>${buttons.map((button) => `<li>${chatPieces({ plain: button.text }, "telegram", Number.POSITIVE_INFINITY).join("")}</li>`).join("")}</ul>`,
        }
      : { plain: "", html: "" };
    const subject = thread
      ? `Re: ${thread.subject || APP_NAME}`
      : firstLine(plain) || APP_NAME;
    const sent = await smtpOf(smtp)
      .sendMail({
        from: { name: APP_NAME, address },
        to: chat,
        subject,
        text: plain + choices.plain,
        html: `<div style="white-space:pre-wrap">${html}</div>${choices.html}`,
        ...(thread?.last
          ? { inReplyTo: thread.last, references: thread.refs }
          : {}),
        // Written by a machine, so an out-of-office does not answer it (RFC 3834 §5)
        headers: {
          "Auto-Submitted": thread ? "auto-replied" : "auto-generated",
        },
        attachments: files.map((file) => ({
          filename: file.name,
          content: Buffer.from(file.bytes),
        })),
      })
      .catch(refusedBy(smtp));
    const id = sent.messageId;
    threads.set(chat, {
      subject: thread?.subject ?? bareSubject(subject),
      last: id ?? thread?.last ?? null,
      refs: [...(thread?.refs ?? []), ...(id ? [id] : [])],
    });
  }

  return {
    named: true,
    attaches: true,
    limits: { take: MAIL_TAKE, file: MAIL_SEND, picture: MAIL_SEND },

    async listen(on, signal) {
      const imap = server(imapServer, 2, "reading");
      const smtp = server(smtpServer, 3, "sending");
      const client = imapClient(address, password, imap);
      const shut = () => client.close();
      signal.addEventListener("abort", shut, { once: true });
      try {
        await client.connect().catch(refusedBy(imap));
        // Sending is checked too, so a password one server takes and the other refuses is found now
        await smtpOf(smtp).verify().catch(refusedBy(smtp));
        on.ready(address, `mailto:${address}`, mailbox);
        const box = await client.mailboxOpen("INBOX", { readOnly: true });
        let seen = await readSeen(String(box.uidValidity), box.uidNext);

        /** Mail arrived since the last look began: the next look starts at once. */
        let rung = false;
        client.on("exists", () => {
          rung = true;
        });
        while (!signal.aborted) {
          rung = false;
          seen = await look(client, seen, on.incoming);
          if (!rung && !signal.aborted)
            await ring(client, imap.host, REACH.mailLookMs, signal);
        }
      } finally {
        signal.removeEventListener("abort", shut);
        client.close();
      }
    },

    say: send,

    async typing() {},

    // No mail has buttons to take off: a choice comes back as the words of a reply
    async settle() {},

    async sendFiles(chat, files) {
      await send(
        chat,
        { plain: files.map((file) => file.name).join("\n") },
        [],
        files,
      );
    },
  };

  /**
   * Hands over what arrived past `seen`, oldest first, and keeps how far it got after each
   * one, so a mail is neither answered twice nor skipped across a restart.
   */
  async function look(
    client: ImapFlow,
    seen: Seen,
    incoming: (incoming: Incoming) => void,
  ): Promise<Seen> {
    // Listed first: the connection runs one command at a time, and a fetch holds it
    const arrived = (
      await client.fetchAll(
        `${seen.uid + 1}:*`,
        { uid: true, size: true, internalDate: true },
        { uid: true },
      )
    )
      // `n:*` always names the newest mail, even one below n (RFC 3501 §6.4.8)
      .filter((one) => one.uid > seen.uid)
      .sort((a, b) => a.uid - b.uid);
    let now = seen;
    for (const one of arrived) {
      const mail = await take(client, one.uid, one.size ?? 0, one.internalDate);
      const repeat = Boolean(mail?.id && now.ids.includes(mail.id));
      now = {
        ...now,
        uid: one.uid,
        ids: mail?.id
          ? [...now.ids.filter((id) => id !== mail.id), mail.id].slice(
              -IDS_KEPT,
            )
          : now.ids,
      };
      await writeConfig(EMAIL_SEEN_KEY, JSON.stringify(now));
      if (!mail || repeat) continue;
      const thread = threads.get(mail.chat);
      // A new subject says what the mail is about; the same one again says nothing new
      const words =
        mail.subject && bareSubject(mail.subject) !== (thread?.subject ?? null)
          ? [mail.subject, mail.words].filter(Boolean).join("\n\n")
          : mail.words;
      // Answered in its thread, so they see which mail it answers — an unproven one too, since
      // what is said about it goes only to the one who may write (reach take)
      threads.set(mail.chat, {
        subject: bareSubject(mail.subject),
        last: mail.id,
        refs: mail.refs,
      });
      incoming({
        kind: "message",
        chat: mail.chat,
        name: mail.name,
        handle: mail.handle,
        words,
        files: mail.files,
        unreadable: false,
        unproven: mail.unproven,
      });
    }
    return now;
  }

  /** One mail read whole, or null for one that is nobody's to answer (readMail). */
  async function take(
    client: ImapFlow,
    uid: number,
    size: number,
    internalDate: Date | string | undefined,
  ): Promise<Mail | null> {
    const arrived = new Date(internalDate ?? Date.now());
    if (size > MAIL_TAKE) {
      // Not read, so not vouched for: said only to the one who may write, in whose name it came
      const head = await client.fetchOne(
        String(uid),
        { envelope: true },
        { uid: true },
      );
      const from = head && head.envelope?.from?.[0]?.address?.toLowerCase();
      if (!from) return null;
      return {
        kind: "message",
        chat: from,
        name: from,
        handle: from,
        words: "",
        files: [],
        unreadable: false,
        unproven: notRead(
          head.envelope?.subject ?? "",
          `it is ${Math.ceil(size / MB)} MB, and the most she reads is ${MAIL_TAKE / MB} MB`,
        ),
        subject: head.envelope?.subject ?? "",
        id: null,
        refs: [],
      };
    }
    const whole = await client.fetchOne(
      String(uid),
      { source: true },
      { uid: true },
    );
    if (!whole || !whole.source) return null;
    try {
      const mail = await readMail(whole.source, { mailbox, arrived, resolve });
      checks.delete(uid);
      return mail;
    } catch (cause) {
      if (!(cause instanceof CheckLater)) throw cause;
      const tries = (checks.get(uid) ?? 0) + 1;
      checks.set(uid, tries);
      // Waits, and holds up what came after it, until it is checked or given up on
      if (tries < REACH.mailChecks) throw cause;
      checks.delete(uid);
      logger.warn(`reach email: passed over mail ${uid}: ${cause.message}`);
      return null;
    }
  }
}

/** Her inbox's connection, over TLS only, told of new mail while it idles. */
function imapClient(
  address: string,
  password: string,
  imap: MailServer,
): ImapFlow {
  const client = new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: imap.port === IMAP_TLS_PORT,
    // Never a password over a line that is not encrypted
    ...(imap.port === IMAP_TLS_PORT ? {} : { doSTARTTLS: true }),
    auth: { user: address, pass: password },
    logger: false,
    maxIdleTime: IDLE_MS,
    autoIdleDelay: REACH.mailPushAfterMs,
    maxLiteralSize: MAIL_TAKE,
    maxResponseSize: MAIL_TAKE + MB,
  });
  // A connection that fails says so in `close`; an error event with no listener would end the app
  client.on("error", (cause: Error) =>
    logger.warn(`reach email: ${imap.host}: ${cause.message}`),
  );
  return client;
}

/** A mail a bot asked for (checkMail): who sent it, when it arrived, and what it says. */
export type Checked =
  | {
      kind: "found";
      from: string;
      subject: string;
      arrived: Date;
      text: string;
    }
  /** None came in time; `unproven` names each that came from the sender and was not read, and why. */
  | { kind: "none"; unproven: string[] };

/**
 * Whether `from` — one address, or a domain and its subdomains — sent `address`.
 * A domain is matched whole, never as the end of another name (evilgithub.com is not github.com).
 */
export function sentBy(address: string, from: string): boolean {
  const wanted = from.trim().toLowerCase().replace(/^@/, "");
  const sender = address.toLowerCase();
  if (wanted.includes("@")) return sender === wanted;
  const domain = sender.slice(sender.lastIndexOf("@") + 1);
  return domain === wanted || domain.endsWith(`.${wanted}`);
}

/**
 * For a bot waiting on a site's mail — a code, a link to confirm an address: the newest mail
 * from `from` that reached her inbox in the last `backMs` (or, `onlyNew`, from now on), waiting
 * up to `waitMs` for one when none has. The inbox is only read. A mail is read only when its sender's domain vouches for it
 * (readMail): a mail in a site's name that is not is named with why, never read, since what it
 * says could be anyone's. Throws on a sign-in refused or a server out of reach, in words.
 */
export async function checkMail(
  mailbox: { address: string; password: string; imap: string },
  from: string,
  times: {
    backMs: number;
    waitMs: number;
    /** Only mail that arrives from now on: one sent again, whatever came before it. */
    onlyNew?: boolean;
  },
  signal?: AbortSignal,
  resolve: Resolve = lookUp,
): Promise<Checked> {
  const imap = parseServer(mailbox.imap);
  if (!imap)
    throw new Error(
      `Her mailbox's reading server “${mailbox.imap}” is not host:port.`,
    );
  const address = mailbox.address.toLowerCase();
  const since = Date.now() - times.backMs;
  const until = Date.now() + times.waitMs;
  const client = imapClient(mailbox.address, mailbox.password, imap);
  const shut = () => client.close();
  signal?.addEventListener("abort", shut, { once: true });
  /** Mail from the sender that is not read, and why, by UID: passed over from then on. */
  const unproven = new Map<number, string>();
  /** Mail whose sender's records did not answer: looked at again on the next pass. */
  const unchecked = new Map<number, string>();
  try {
    await client
      .connect()
      .catch(
        (cause: {
          authenticationFailed?: boolean;
          responseText?: string;
          message?: string;
        }) => {
          throw new Error(
            cause.authenticationFailed
              ? `${imap.host} turned her mailbox's sign-in away (${cause.responseText || cause.message}). The user replaces its app password in Settings › Phone › Email.`
              : `Could not reach ${serverWords(imap)}: ${reasonOf(cause)}`,
          );
        },
      );
    const box = await client.mailboxOpen("INBOX", { readOnly: true });
    // Told apart by the server's own numbering, not by a clock: its time and this computer's
    // may differ by more than a mail takes to arrive
    const firstNew = times.onlyNew ? box.uidNext : 0;
    let rung = false;
    client.on("exists", () => {
      rung = true;
    });
    while (!signal?.aborted) {
      rung = false;
      // SINCE is by day (RFC 3501 §6.4.4); the hour is checked below, from when each
      // arrived. The sender is matched here, on the envelope, not by the server's FROM search:
      // servers differ on whether that matches part of an address
      const found = await client.search(
        { since: new Date(since) },
        { uid: true },
      );
      const arrived = found
        ? await client.fetchAll(
            found,
            { uid: true, internalDate: true, size: true, envelope: true },
            { uid: true },
          )
        : [];
      const newest = arrived
        .map((one) => ({ ...one, at: new Date(one.internalDate ?? 0) }))
        .filter(
          (one) =>
            one.uid >= firstNew &&
            one.at.getTime() >= since &&
            (one.size ?? 0) <= MAIL_TAKE &&
            (one.envelope?.from ?? []).some(
              (sender) => sender.address && sentBy(sender.address, from),
            ),
        )
        .sort((a, b) => b.at.getTime() - a.at.getTime());
      for (const one of newest) {
        if (unproven.has(one.uid)) continue;
        const whole = await client.fetchOne(
          String(one.uid),
          { source: true },
          { uid: true },
        );
        if (!whole || !whole.source) continue;
        let mail: Mail | null;
        try {
          mail = await readMail(whole.source, {
            mailbox: address,
            arrived: one.at,
            resolve,
          });
          unchecked.delete(one.uid);
        } catch (cause) {
          if (!(cause instanceof CheckLater)) throw cause;
          unchecked.set(one.uid, cause.message);
          continue;
        }
        // The envelope said so; the one From the mail is vouched for decides
        if (!mail || !sentBy(mail.chat, from)) continue;
        if (mail.why) {
          unproven.set(
            one.uid,
            `“${mail.subject}” from ${mail.chat}: ${mail.why}`,
          );
          continue;
        }
        return {
          kind: "found",
          from: mail.chat,
          subject: mail.subject,
          arrived: one.at,
          text: mail.words,
        };
      }
      const left = until - Date.now();
      if (left <= 0) break;
      if (!rung) await ring(client, imap.host, left, signal);
    }
    return {
      kind: "none",
      unproven: [...unproven.values(), ...unchecked.values()],
    };
  } finally {
    signal?.removeEventListener("abort", shut);
    client.close();
  }
}

/**
 * Until the server says mail arrived, `ms` passes (its word can be lost with a connection
 * that drops quietly), or listening stops. A connection that closes meanwhile is
 * trouble to connect again after.
 */
function ring(
  client: ImapFlow,
  host: string,
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const off = () => {
      clearTimeout(timer);
      client.off("exists", arrived);
      client.off("close", gone);
      signal?.removeEventListener("abort", arrived);
    };
    function arrived() {
      off();
      resolve();
    }
    function gone() {
      off();
      // Closed because the wait was called off: nothing went wrong
      if (signal?.aborted) resolve();
      else reject(new Error(`${host} closed the connection`));
    }
    const timer = setTimeout(arrived, ms);
    client.on("exists", arrived);
    client.once("close", gone);
    signal?.addEventListener("abort", arrived, { once: true });
    if (!client.usable) gone();
  });
}

/** The first line of a text, as a subject: at most the 78 characters a header line holds (RFC 5322 §2.1.1). */
function firstLine(text: string): string {
  const line = text.trim().split("\n")[0]?.trim() ?? "";
  return line.length > 78 ? `${line.slice(0, 77)}…` : line;
}

const reasonOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);
