# Motion video

A short video that shows an idea moving: a launch clip, how something works, a walk through a
product, a tall clip for a phone, or scenes cut in over their own recording. One card carries
every scene, morphing or thrown from one to the next; words build themselves; a cursor presses
what is pressed; a tick and a rush of air mark it. You write the scenes as JSON; the engine
draws them in the app's own look.

`S=<skill dir>/scripts`

```bash
node $S/motion.mjs kinds                        # every kind of scene in a line; `kinds <kind>` gives its fields and an example
node $S/motion.mjs put <name> <video.json>      # checked, then made: <name>/<name>.html plays when opened
node $S/motion.mjs shots <name>                 # every scene as a picture, all on one: look_at it
node $S/motion.mjs render <name> --draft        # <name>.mp4 quickly, to check the timing
node $S/motion.mjs render <name>                # the finished mp4, with motion blur and its sounds
node $S/motion.mjs get <name> <file.json>       # its JSON as it is now, to change and put again
node $S/motion.mjs voices <name> <audio>...     # a voice for each scene that has "say", in order
node $S/motion.mjs track <name> <recording>     # time the scenes to their video or audio
```

## Write it

Start from `templates/motion/explainer.json` (a screen) or `phone.json` (a phone), or from the
examples `kinds` prints. The whole file:

```json
{
  "size": "1920x1080",
  "theme": "thursday",
  "backdrop": "glyphs",
  "scenes": [
    { "kind": "text", "text": "Invoices that *pay themselves*", "style": "rise", "mark": "marker" },
    { "kind": "prompt", "text": "Pay the March invoices", "result": "3 paid", "dur": 4.5, "enter": "push" },
    { "kind": "stats", "stats": [{ "value": 3, "label": "paid" }, { "value": 0, "label": "late" }] }
  ]
}
```

- `size`: `1920x1080` for a screen, `1080x1920` for a phone (Reels, Shorts, TikTok),
  `1080x1080` for a feed. Every kind lays itself out for the shape.
- `theme`: `thursday` (the app's white, greys and blue — the default) or `night` (its dark);
  `paper`, `ink` and `mist` for a warmer or cooler look. `accent` is the one colour that marks
  what matters: their brand's, when you know it. `colors` sets any role by name (`canvas`,
  `card`, `ink`, `muted`, `accent`, `ember`, `dark`, …); `font` names a font file put beside the
  video, or one the machine has.
- `backdrop`: `plain`, `dots`, `grid`, or `glyphs` — the app's field of drifting letters.
- `enter`: how scenes come in, for the whole video or one scene: `morph` (the card reshapes
  itself — the default and the calm one), `push` (thrown sideways), `zoom`, `rise`, `cut`. Keep
  one for most cuts and one or two others for a change of topic.
- `lang`: the words' language (`"ko"`, `"ja"`, …): how lines break follows it.
- `captions`: `false` hides the captions `say` would show. `sfx`: `false` leaves out the ticks and
  rushes of air.

Every scene has `kind`; `say`, the line said over it (a caption, or what its voice reads); `dur`,
its seconds (3 when left out); and `enter`. A scene makes its changes — its **beats** — spread
across it; `times` puts each on a moment instead, seconds from the scene's start, one per beat:
on the word that names it, when the voice or the transcript says when.

`*word*` in a line marks it. On a `text` scene `mark` says how: `marker`, `underline`, `circle`,
`strike` or `color`; elsewhere it is the accent.

## The kinds

`kinds` prints each with an example to copy. By what the moment is:

- **A line to land** — `text` (styles `rise`, `blur`, `type`, `slam` word by word, `mask`,
  `decode`), `swap` (one word rolling to the next), `title`, `quote`, `chapter`.
- **This app** — `orb` (her letter orb), `call` (what you said, her answer), `bots` (the faces
  of a team), `notify` (a bot's card when its work is back), `agent` (a job's steps shimmering
  then ticked), `prompt` (asked, sent, made).
- **Something used** — `pill`, `options`, `toggles`, `slider`, `search`, `toast`, `chat`,
  `terminal`, `code`, `phone`, `browser`.
- **A list or a path** — `list` (or a checklist), `progress`, `steps`, `timeline`, `grid`
  (tiles of what it does), `hub` (one thing and what it reaches), `compare`.
- **A number** — `number`, `stats`, `bars`, `line`, `ring`, `table`.
- **A picture or a name** — `image`, `beforeafter`, `logo`, `lower` (a name under someone
  speaking), `end`.

Pictures go in the video's folder first (`pictures/…`); `src`, `image`, `before` and `after` name
them from there.

## Timed three ways

- **Words on screen, no voice.** Each scene's `dur`; `say` shows as a caption. The default when
  they asked for a video and gave no voice.
- **Read aloud.** Write every scene's `say`, then check the voice before anything else:
  `tool_search` with `server: "studio"` and `tools: ["generate_speech"]`. Not there means nobody
  picked a speech model: ask for one in Settings › Models and end your turn. One
  `generate_speech` call per scene with `say`, in order, the same `voice` each time, then
  `voices` with the paths it returned: each scene runs as long as its voice.
- **Their own recording.** A voice memo, a talk, a video of them speaking. `transcribe` it
  (studio) for the words and their times, then `track` it: their audio is the sound, and a
  video of theirs shows between the scenes, which cut in over it. Every scene gets `at`, the
  second it comes in, read off the transcript's times, never estimated; `until` leaves a gap
  where their video shows again. A scene on part of their picture — beside them in an empty
  half, say, or a `lower` name under them — has `area`, `[x, y, width, height]` in the frame's
  pixels. `track` sets the frame's size and rate to the recording's. A transcript's times are to
  the second: play the draft and move an `at` that lands early or late.

## What makes it good

- **Open strong, one idea a scene.** The first scene is the most distinctive: a `text` that
  slams, her `orb`, a `logo`. Then one idea each, shown as the thing itself — the prompt, the
  setting, the result — in the kind that does it: a choice is `options`, a sequence `steps`, a
  before and after `compare`, a figure `number` or `stats`.
- **Pace to reading.** Two to four seconds a scene; a line on a card of two to six words. No one
  reads more than three words a second: `put` names a scene with more than its time allows and
  the `dur` it needs. A video under a minute unless they asked for more.
- **Vary the rhythm.** Fast, fast, slow, fast: a slam, two quick scenes, a held figure. One way
  in for most scenes and another for a change of topic; never every scene thrown.
- **Nothing invented.** A figure, a price, a name or a result you were not given is not on a
  card: `bars` compare by `value` alone, a `table` or `end` keeps `[PRICE]`-style blanks.
- **Their recording keeps its best moments.** Cut in on what is shown — a product, a process, a
  number, a new chapter — and leave their face on what is personal, and in the first second. At
  least two seconds of them between cutaways.

## Check it, then make it

`put` refuses a mistake by the scene it is in; fix the JSON and put it again. Then `shots` and
`look_at` the sheet once: fix what is cramped, clipped or off, and a scene it says holds more
than fits; two rounds at most. `render --draft` when the timing is in question — four times
faster — and `render` for the finished mp4: h264, which every phone and browser plays, with the
voices or their recording as its sound. Hand back the mp4's path and how long it runs, with the
video's `.html` beside it: it plays in the app, and scrubs.

To change it later, `get` it, change the JSON, `put` it back, and `render` again. A scene whose
`say` changed loses its voice; make that one again and run `voices` with every scene's voice —
the ones in `voices/` for the rest.
