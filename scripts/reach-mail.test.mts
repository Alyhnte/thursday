import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, mock, test } from "node:test";
import { dkimSign } from "mailauth";
import MailComposer from "nodemailer/lib/mail-composer";

// Email as reach reads it, with DNS stood in for: whose mail is vouched for, what of it
// reaches her, and where a mailbox's servers are found. No network, no mail server.
const home = await mkdtemp(join(tmpdir(), "thursday-mail-"));
process.env.THURSDAY_HOME = home;

type Srv = { name: string; port: number; priority: number; weight: number };
/** SRV records by name, or the error code DNS answers with. */
const srv = new Map<string, Srv[] | string>();
const dnsError = (name: string, code: string) =>
  Object.assign(new Error(`${code} ${name}`), { code });
mock.module("node:dns/promises", {
  namedExports: {
    resolveSrv: async (name: string) => {
      const found = srv.get(name);
      if (typeof found === "string") throw dnsError(name, found);
      if (!found) throw dnsError(name, "ENOTFOUND");
      return found;
    },
    // What email.ts looks senders up with when no resolver is given; every test gives one
    Resolver: class {
      resolveTxt = async (name: string) => {
        throw dnsError(name, "ENOTFOUND");
      };
      resolve = async (name: string) => {
        throw dnsError(name, "ENOTFOUND");
      };
    },
  },
});

const { readMail, withoutQuote, CheckLater } = await import(
  "../features/reach/email.ts"
);
const { findMailServers, parseServer } = await import(
  "../features/reach/mail-servers.ts"
);
const { isPublicError } = await import("../lib/public-error.ts");

after(async () => {
  await rm(home, { recursive: true, force: true });
});

// example.org signs its mail and publishes DMARC; nodmarc.example publishes nothing
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const records = new Map<string, string[][] | string>([
  [
    "s1._domainkey.example.org",
    [
      [
        `v=DKIM1; k=rsa; p=${publicKey.export({ type: "spki", format: "der" }).toString("base64")}`,
      ],
    ],
  ],
  ["_dmarc.example.org", [["v=DMARC1; p=reject"]]],
]);
const resolve = async (name: string, type: string) => {
  const found = type === "TXT" ? records.get(name.toLowerCase()) : undefined;
  if (typeof found === "string") throw dnsError(name, found);
  if (!found) throw dnsError(name, "ENOTFOUND");
  return found;
};

const mailbox = "thursday@example.com";
const now = new Date();

/** A mail as its sender's service sends it: composed, and signed by example.org unless not. */
async function mail(
  fields: Record<string, unknown> = {},
  sign: { maxBodyLength?: number } | false = {},
): Promise<Buffer> {
  const raw = await new MailComposer({
    from: "Alex Kim <Alex@Example.org>",
    to: `Thursday <${mailbox}>`,
    subject: "Flights to Lisbon",
    date: now,
    messageId: "<m1@example.org>",
    text: "Can you find three flights?\n\nOn Monday, Alex wrote:\n> the earlier mail\n> quoted whole",
    ...fields,
  })
    .compile()
    .build();
  if (sign === false) return raw;
  // Each signature is described in signatureData; top-level options alone sign nothing
  const { signatures, errors } = await dkimSign(raw, {
    signatureData: [
      {
        signingDomain: "example.org",
        selector: "s1",
        privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
        ...sign,
      },
    ],
  } as Parameters<typeof dkimSign>[1]);
  assert.ok(signatures, `signed: ${JSON.stringify(errors)}`);
  return Buffer.concat([Buffer.from(signatures), raw]);
}

const read = (source: Buffer, arrived = now) =>
  readMail(source, { mailbox, arrived, resolve });

test("a mail its sender's domain signs reaches her as theirs, without the earlier mail quoted under it", async () => {
  const read1 = await read(await mail());
  assert.ok(read1);
  assert.equal(read1.unproven, undefined);
  assert.equal(
    read1.chat,
    "alex@example.org",
    "an address is one conversation, whatever its case",
  );
  assert.equal(read1.name, "Alex Kim");
  assert.equal(
    read1.words,
    "Can you find three flights?\n\nOn Monday, Alex wrote:",
  );
  assert.equal(read1.subject, "Flights to Lisbon");
  assert.deepEqual(read1.refs, ["<m1@example.org>"]);
});

test("what a mail carries reaches her as files", async () => {
  const read1 = await read(
    await mail({
      attachments: [{ filename: "fares.csv", content: "from,to\nLHR,LIS\n" }],
    }),
  );
  assert.equal(read1?.unproven, undefined);
  assert.equal(read1?.files.length, 1);
  const file = await read1?.files[0].fetch();
  assert.equal(file?.name, "fares.csv");
  assert.equal(await file?.text(), "from,to\nLHR,LIS\n");
});

test("a mail changed after it was signed is not taken as theirs, and they are told why", async () => {
  const signed = await mail();
  const changed = Buffer.from(
    signed.toString("latin1").replace("three flights", "four flights"),
    "latin1",
  );
  const read1 = await read(changed);
  assert.match(
    read1?.unproven ?? "",
    /^Your mail was not read: example\.org's mail service does not vouch that it came from you, so it could be anyone's\..*\(its DMARC check said: fail\)\.$/,
  );
});

test("a domain that publishes no DMARC is not vouched for, however its mail looks", async () => {
  const read1 = await read(
    await mail({ from: "Bob <bob@nodmarc.example>" }, false),
  );
  assert.equal(read1?.chat, "bob@nodmarc.example");
  assert.match(read1?.unproven ?? "", /its DMARC check said: none/);
});

test("only mail written to her address, and recent, is read", async () => {
  const elsewhere = await read(await mail({ to: "someone@example.net" }));
  assert.equal(
    elsewhere?.unproven,
    "Your mail was not read: it was not written to thursday@example.com. Thursday reads only mail with her address in To or Cc.",
  );
  const copied = await read(
    await mail({ to: "someone@example.net", cc: mailbox }),
  );
  assert.equal(copied?.unproven, undefined, "Cc is written to her too");

  // Still signed, so anyone it once went to could send it to her again
  const old = new Date(Date.now() - 3 * 24 * 3_600_000);
  const stale = await read(await mail({ date: old }));
  assert.match(stale?.unproven ?? "", /written more than 48 hours ago/);
  // Written now but held back on the way: when it arrived counts too
  const late = await read(await mail(), old);
  assert.match(late?.unproven ?? "", /written more than 48 hours ago/);
});

test("a machine's mail, and a mail in two names, are nobody's to answer", async () => {
  assert.equal(
    await read(await mail({ headers: { "Auto-Submitted": "auto-replied" } })),
    null,
    "an out-of-office answering her is never answered back",
  );
  assert.ok(
    await read(await mail({ headers: { "Auto-Submitted": "no" } })),
    "one that says it was not sent by a machine is read",
  );
  assert.equal(
    await read(await mail({ from: ["a@example.org", "b@example.org"] })),
    null,
  );
});

test("a signature over only the start of a mail leaves the rest anyone's", async () => {
  const read1 = await read(await mail({}, { maxBodyLength: 10 }));
  assert.equal(
    read1?.unproven,
    "Your mail was not read: its signature covers only part of it, so the rest could be anyone's.",
  );
});

test("records that do not answer hold the mail to be checked again", async () => {
  records.set("_dmarc.example.org", "ETIMEOUT");
  try {
    await assert.rejects(read(await mail()), CheckLater);
  } finally {
    records.set("_dmarc.example.org", [["v=DMARC1; p=reject"]]);
  }
});

test("only a quote that ends the mail goes; one answered between its lines stays", () => {
  assert.equal(
    withoutQuote("Yes, book it.\r\n\r\n> Shall I book it?\r\n>\r\n"),
    "Yes, book it.",
  );
  assert.equal(
    withoutQuote("> Which day?\nFriday.\n> Which time?\nAfter five."),
    "> Which day?\nFriday.\n> Which time?\nAfter five.",
  );
  assert.equal(withoutQuote("No quote at all.\n\n"), "No quote at all.");
  assert.equal(withoutQuote("> only a quote"), "");
});

test("a server is kept as host and port", () => {
  assert.deepEqual(parseServer("IMAP.Example.com:993"), {
    host: "imap.example.com",
    port: 993,
  });
  assert.deepEqual(parseServer("127.0.0.1:465"), {
    host: "127.0.0.1",
    port: 465,
  });
  for (const bad of [
    "imap.example.com",
    "localhost:993",
    "a b.com:1",
    "x.com:0",
    "x.com:70000",
    ":993",
  ])
    assert.equal(parseServer(bad), null, bad);
});

test("a mailbox's servers are what its domain publishes, preferring TLS from the start", async () => {
  srv.set("_imaps._tcp.example.com", [
    { name: "backup.example.com", port: 993, priority: 10, weight: 0 },
    { name: "imap.example.com.", port: 993, priority: 0, weight: 1 },
  ]);
  srv.set("_submissions._tcp.example.com", [
    { name: "smtp.example.com", port: 465, priority: 0, weight: 1 },
  ]);
  srv.set("_submission._tcp.example.com", [
    { name: "smtp.example.com", port: 587, priority: 0, weight: 1 },
  ]);
  assert.deepEqual(await findMailServers("example.com"), {
    imap: { host: "imap.example.com", port: 993 },
    smtp: { host: "smtp.example.com", port: 465 },
  });

  // "." is a domain saying it offers no such service; the next kind is asked
  srv.set("_imaps._tcp.example.net", [
    { name: ".", port: 0, priority: 0, weight: 0 },
  ]);
  srv.set("_imap._tcp.example.net", [
    { name: "mail.example.net", port: 143, priority: 0, weight: 0 },
  ]);
  srv.set("_submission._tcp.example.net", [
    { name: "mail.example.net", port: 587, priority: 0, weight: 0 },
  ]);
  assert.deepEqual(await findMailServers("example.net"), {
    imap: { host: "mail.example.net", port: 143 },
    smtp: { host: "mail.example.net", port: 587 },
  });

  assert.equal(await findMailServers("acme.example"), null, "none published");

  // DNS that could not be asked is not a domain that publishes nothing
  srv.set("_imaps._tcp.offline.example", "ETIMEOUT");
  await assert.rejects(findMailServers("offline.example"), (cause: unknown) => {
    assert.ok(isPublicError(cause));
    assert.match(
      (cause as Error).message,
      /Could not look up where offline\.example's mail servers are \(ETIMEOUT\)/,
    );
    return true;
  });
});
