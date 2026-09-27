import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { runInNewContext } from "node:vm";

// A workspace of its own: the kit script finds it from where it runs
const home = await mkdtemp(join(tmpdir(), "thursday-motion-"));
after(() => rm(home, { recursive: true, force: true }));
await mkdir(join(home, "projects"));
await writeFile(join(home, "pnpm-workspace.yaml"), "");

const { check, KINDS } = await import(
  "../skills/artifact/runtime/motion/schema.mjs"
);
const SKILL = join(import.meta.dirname, "..", "skills", "artifact");
const SCRIPT = join(SKILL, "scripts", "motion.mjs");

/** motion.mjs run as a bot's shell runs it, in the test's workspace. */
const run = (...args: string[]) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: home,
    encoding: "utf8",
    env: { ...process.env, THURSDAY_ARTIFACTS: "artifacts" },
  });
const specIn = async (name: string) =>
  JSON.parse(
    /<script type="application\/json" id="motion-spec">([\s\S]*?)<\/script>/.exec(
      await readFile(join(home, "artifacts", name, `${name}.html`), "utf8"),
    )?.[1] ?? "null",
  );

/** One scene of every kind, each as small as it may be. */
const every = {
  title: { title: "A title" },
  end: { title: "The end" },
  chapter: { title: "Part two", number: "02" },
  pill: { label: "Press" },
  options: { options: ["A", "B", "C"], pick: [1, 2] },
  list: { items: ["One", { text: "Two", icon: "star" }] },
  bars: {
    bars: [
      { label: "A", value: 2 },
      { label: "B", value: 3 },
    ],
  },
  number: { value: 42 },
  terminal: { lines: ["$ ls", "a.txt", "$ cat a.txt"] },
  chat: {
    messages: [
      { from: "me", text: "Hi" },
      { from: "them", text: "Hello" },
    ],
  },
  search: { query: "ch", items: ["Chart", "Title"] },
  toggles: { items: [{ label: "One" }, { label: "Two", on: true }], flip: [0] },
  progress: { items: ["Read", "Write"] },
  compare: { left: { title: "Old" }, right: { title: "New" }, pick: "right" },
  steps: { items: ["Write", "Look", "Render"] },
  quote: { text: "A line worth quoting." },
  image: { src: "pictures/a.png" },
  code: { code: "a\nb\nc", highlight: [2, 3] },
  toast: { title: "Done" },
  slider: { from: 10, to: 80 },
};
const scenes = Object.entries(every).map(([kind, fields]) => ({
  kind,
  ...fields,
  dur: 3,
}));

test("every kind the schema knows has a scene here, and they all pass", () => {
  assert.deepEqual(Object.keys(every).sort(), Object.keys(KINDS).sort());
  assert.deepEqual(check({ scenes }), []);
});

test("the page's parts make as many changes as the schema says a scene's times must name", async () => {
  const code = ["engine.js", "parts.js"]
    .map((f) => join(SKILL, "runtime", "motion", f))
    .map((f) => readFile(f, "utf8"));
  const PARTS = runInNewContext(
    `${(await Promise.all(code)).join("\n")}\nPARTS`,
    {},
  );
  assert.deepEqual(Object.keys(PARTS).sort(), Object.keys(KINDS).sort());
  for (const scene of scenes)
    assert.equal(
      PARTS[scene.kind].beats(scene),
      KINDS[scene.kind as keyof typeof KINDS].beats(scene as never),
      scene.kind,
    );
});

test("each mistake is named with the scene it is in", () => {
  const problems = (spec: object, opts = {}) => check(spec, opts).join("\n");
  assert.match(
    problems({ scenes: [{ kind: "poster", dur: 2 }] }),
    /scene 1 \(poster\): no such kind "poster"/,
  );
  assert.match(
    problems({ scenes: [{ kind: "title", title: "No length" }] }),
    /scene 1 \(title\): needs "dur"/,
  );
  assert.match(
    problems({
      scenes: [{ kind: "title", title: "T", dur: 2, colour: "red" }],
    }),
    /"colour" is not a field of title/,
  );
  assert.match(
    problems({
      scenes: [{ kind: "steps", items: ["a", "b"], dur: 3, times: [1] }],
    }),
    /"times" is 2 second\(s\)/,
  );
  assert.match(
    problems({
      scenes: [{ kind: "options", options: ["a", "b"], pick: [2], dur: 3 }],
    }),
    /"pick" is a list of 1 to 6 indexes into its options/,
  );
  assert.match(
    problems({ scenes: [{ kind: "image", src: "../../secret.png", dur: 3 }] }),
    /a picture's path inside the video's folder/,
  );
  assert.match(
    problems(
      { scenes: [{ kind: "image", src: "gone.png", dur: 3 }] },
      { exists: () => false },
    ),
    /gone.png, which is not in the video's folder/,
  );
  assert.match(
    problems({
      size: "1920x1081",
      scenes: [{ kind: "title", title: "T", dur: 2 }],
    }),
    /^size:/,
  );
});

test("scenes on a recording are timed to it, in order, and only a video leaves gaps", () => {
  const track = { file: "track/a.m4a", kind: "audio", length: 20 };
  const title = { kind: "title", title: "T" };
  assert.deepEqual(
    check({
      track,
      scenes: [
        { ...title, at: 1 },
        { ...title, at: 5 },
      ],
    }),
    [],
  );
  assert.match(
    check({ track, scenes: [{ ...title, dur: 2 }] }).join("\n"),
    /needs "at"/,
  );
  assert.match(
    check({
      track,
      scenes: [
        { ...title, at: 5 },
        { ...title, at: 2 },
      ],
    }).join("\n"),
    /scenes go in the order they play/,
  );
  assert.match(
    check({ track, scenes: [{ ...title, at: 1, until: 3 }] }).join("\n"),
    /only a video recording fills/,
  );
  const video = { ...track, file: "track/a.mp4", kind: "video" };
  assert.deepEqual(
    check({
      size: "1920x1080",
      track: video,
      scenes: [
        { ...title, at: 1, until: 3 },
        { ...title, at: 6, area: [1000, 100, 800, 800] },
      ],
    }),
    [],
  );
  assert.match(
    check({
      track: video,
      scenes: [{ ...title, at: 1, area: [1500, 0, 800, 800] }],
    }).join("\n"),
    /"area" is \[x, y, width, height\]/,
  );
});

test("put writes a page that holds its JSON, and refuses a mistake without writing", async () => {
  await mkdir(join(home, "artifacts", "demo", "pictures"), { recursive: true });
  await writeFile(join(home, "artifacts", "demo", "pictures", "a.png"), "");
  const json = join(home, "demo.json");
  await writeFile(json, JSON.stringify({ size: "1080x1920", scenes }));
  const made = run("put", "demo", json);
  assert.equal(made.status, 0, made.stderr);
  assert.match(made.stdout, /20 scene\(s\), 60\.0s/);
  const spec = await specIn("demo");
  assert.equal(spec.size, "1080x1920");
  assert.equal(spec.scenes.length, 20);
  // Nothing in a scene's words can close the script that holds them
  const html = await readFile(
    join(home, "artifacts", "demo", "demo.html"),
    "utf8",
  );
  assert.ok(html.includes('"kind": "title"'));

  const bad = join(home, "bad.json");
  await writeFile(
    bad,
    JSON.stringify({ scenes: [{ kind: "title", title: "T" }] }),
  );
  const refused = run("put", "fresh", bad);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Nothing was written/);
  assert.equal(existsSync(join(home, "artifacts", "fresh")), false);
});

test("a scene's words close no tag, and get gives back what put was given", async () => {
  const json = join(home, "words.json");
  const say = "</script><script>alert(1)</script>";
  await writeFile(
    json,
    JSON.stringify({ scenes: [{ kind: "title", title: "T", say, dur: 2 }] }),
  );
  assert.equal(run("put", "words", json).status, 0);
  const html = await readFile(
    join(home, "artifacts", "words", "words.html"),
    "utf8",
  );
  assert.equal(html.includes("<script>alert(1)"), false);
  const back = join(home, "back.json");
  assert.equal(run("get", "words", back).status, 0);
  assert.equal(JSON.parse(await readFile(back, "utf8")).scenes[0].say, say);
});

test("a voice stays with its scene while the words it reads stay the same", async () => {
  const dir = join(home, "artifacts", "voiced");
  await mkdir(join(dir, "voices"), { recursive: true });
  await writeFile(join(dir, "voices", "scene-01.mp3"), "");
  const voice = {
    file: "voices/scene-01.mp3",
    length: 2.5,
    text: "Hello there.",
  };
  const json = join(home, "voiced.json");
  const write = (say: string) =>
    writeFile(
      json,
      JSON.stringify({
        scenes: [
          {
            kind: "title",
            title: "T",
            say,
            dur: 2,
            voice: { ...voice, text: say },
          },
        ],
      }),
    );
  await write("Hello there.");
  assert.equal(run("put", "voiced", json).status, 0);
  // Put again without the voice, as a bot's own JSON is: it is kept for the same words
  await writeFile(
    json,
    JSON.stringify({
      scenes: [{ kind: "title", title: "T", say: "Hello there.", dur: 2 }],
    }),
  );
  assert.equal(run("put", "voiced", json).status, 0);
  assert.equal((await specIn("voiced")).scenes[0].voice.length, 2.5);
  // New words: the voice made for the old ones goes, and the scene says so
  await writeFile(
    json,
    JSON.stringify({
      scenes: [{ kind: "title", title: "T", say: "Goodbye.", dur: 2 }],
    }),
  );
  const put = run("put", "voiced", json);
  assert.match(put.stdout, /Scene 1's words changed/);
  assert.equal((await specIn("voiced")).scenes[0].voice, undefined);
});
