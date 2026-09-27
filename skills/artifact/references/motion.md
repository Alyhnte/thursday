# Motion video

A short video that shows an idea moving: a launch clip, how something works, a walk through a
product, a vertical clip for a phone, or pictures cut in over their own recording. One card
holds every scene and morphs from one to the next without a cut; a cursor presses what is
pressed; the words said are captions. You write the scenes as JSON; the engine draws them.

`S=<skill dir>/scripts`

```bash
node $S/motion.mjs put <name> <video.json>      # checked, then made: <name>/<name>.html plays when opened
node $S/motion.mjs shots <name>                 # every scene as a picture, all on one: look_at it
node $S/motion.mjs render <name> --draft        # <name>.mp4 quickly, to check the timing
node $S/motion.mjs render <name>                # the finished mp4, with motion blur
node $S/motion.mjs get <name> <file.json>       # its JSON as it is now, to change and put again
node $S/motion.mjs voices <name> <audio>...     # a voice for each scene that has "say", in order
node $S/motion.mjs track <name> <recording>     # time the scenes to their video or audio
```

## Timed three ways

- **Words on screen, no sound.** Each scene's `dur` is how long it holds; its `say` shows as a
  caption. The default when they asked for a video and gave no voice.
- **Read aloud.** Write every scene's `say`, then check the voice before anything else:
  `tool_search` with `server: "studio"` and `tools: ["generate_speech"]`. Not there means nobody
  picked a speech model: ask for one in Settings › Models and end your turn. One
  `generate_speech` call per scene with `say`, in order, the same `voice` each time, then
  `voices` with the paths it returned: each scene runs as long as its voice.
- **Their own recording.** A voice memo, a talk, a video of them speaking. `transcribe` it
  (studio) for the words and their times, then `track` it: their audio is the sound, and a
  video of theirs shows between the scenes, which cut in over it. Every scene gets `at`, the
  second it comes in, read off the transcript's times, never estimated; `until`
  leaves a gap where their video shows again. A scene only on part of their picture — beside
  them in an empty half, say — has `area`, `[x, y, width, height]` in the frame's pixels.
  `track` sets the frame's size and rate to the recording's. A transcript's times are to
  the second: play the draft and move an `at` that lands early or late.

## The JSON

Start from a copy of `templates/motion/explainer.json` (a screen) or `phone.json` (a phone).

```json
{
  "size": "1920x1080",
  "theme": "paper",
  "accent": "#FF5A1F",
  "scenes": [
    { "kind": "title", "title": "Scenes in, an mp4 out", "dur": 3, "say": "…" },
    { "kind": "list", "items": ["One", "Two", "Three"], "dur": 3.5 }
  ]
}
```

- `size`: `1920x1080` for a screen, `1080x1920` for a phone (Reels, Shorts, TikTok),
  `1080x1080` for a feed. Every part lays itself out for the shape.
- `theme`: `paper` (warm grey, white cards), `ink` (dark), `mist` (cool grey). `accent` is the
  one colour that marks what matters; their brand's, when you know it. `colors` sets any role
  by name (`canvas`, `card`, `ink`, `muted`, `accent`, `dark`, …) and `font` names a font file
  put beside the video, or one the machine has.
- `captions`: `false` hides the captions `say` would show.
- `fps`: 30 unless you have a reason.

Every scene has `kind`, `say` (the line said over it, up to 400 characters), and `dur`
(seconds, when it has no voice and no recording). A scene makes its changes — its **beats** —
spread across it; `times` puts each one on a moment instead, in seconds from the scene's
start, one per beat: on the word that names it, when the voice or the transcript says when.

| kind | fields | beats |
|---|---|---|
| `title` | `title`, `kicker`, `sub` | — |
| `chapter` | `title`, `number` ("02") | — |
| `end` | `title`, `sub`, `icon` | — |
| `pill` | `label`, `icon`, `badge` — a button pressed | 1 |
| `options` | `options` (2–5), `pick` (indexes, in order), `label` | one per pick |
| `list` | `items` (text or `{ "text", "icon" }`, up to 7), `title`, `check` | one per item |
| `toggles` | `items` (`{ "label", "on" }`), `flip` (indexes), `title` | one per flip |
| `progress` | `items`, `title` — each fills, then ticks | one per item |
| `steps` | `items` (2–6) — a numbered path, followed | one per item |
| `bars` | `bars` (`{ "label", "value", "text" }`), `unit`, `prefix`, `highlight`, `title` | one per bar |
| `number` | `value`, `from`, `prefix`, `suffix`, `label`, `decimals` — it counts | 1 |
| `slider` | `from`, `to`, `min`, `max`, `unit`, `label` — dragged | 1 |
| `compare` | `left`, `right` (`{ "title", "points" }`), `pick` ("left"/"right") | 2, 3 with pick |
| `chat` | `messages` (`{ "from": "me"/"them", "text" }`) | one per message |
| `search` | `query`, `items`, `placeholder` — typed, then the list narrows | 1 |
| `terminal` | `lines` (a command starts with `$`), `title` — typed | one per command |
| `code` | `code` (up to 14 lines), `highlight` (line numbers), `title` | one per highlight |
| `toast` | `title`, `text`, `icon` — a small island that opens | 1 |
| `quote` | `text`, `by` | — |
| `image` | `src` (a picture in the video's folder), `caption`, `fit`, `ratio` | — |

Icons by name: arrow, check, x, plus, search, file, folder, terminal, code, chat, mail, clock,
calendar, coin, chart, bolt, sparkle, star, heart, user, users, lock, globe, link, bell, gear,
image, play, mic, phone, home, cart, rocket, flag, target, trend, shield, download, upload,
cloud, bot — or any one emoji.

## What makes it good

- **One idea a scene, shown as the thing itself.** The file, the command, the setting, the
  result — taken from what they said. Map each line onto the kind that does it: a choice is
  `options`, a sequence is `steps`, a before and after is `compare`, a figure is `number`.
- **Pace to the words.** Two to four seconds a scene; a change every half second to a second.
  Ten short scenes beat four long ones. A video under a minute unless they asked for more.
- **Few words on a card.** A caption says the sentence; the card shows its point in two to
  six words a line.
- **Nothing invented.** A figure, a price, a name or a result you were not given is not on a
  card: `bars` compare by `value` alone when there are no real numbers, with no `text` shown.
- **Their recording keeps its best moments.** Cut in on what is shown — a product, a
  process, a number, a new chapter — and leave their face on what is personal, and in the
  first second. At least two seconds of them between cutaways.

## Check it, then make it

`put` refuses a mistake by the scene it is in; fix the JSON and put it again. Then `shots`
and `look_at` the sheet once: fix what is cramped, clipped or off, and a scene it says holds
more than fits; two rounds at most. `render --draft` when the timing is in question — it is
four times faster — and `render` for the finished mp4: h264, which every phone and browser
plays, with the voices or their recording as its sound. Hand back the mp4's path and how
long it runs, with the video's `.html` beside it: it plays in the app, and scrubs.

To change it later, `get` it, change the JSON, `put` it back, and `render` again. A scene
whose `say` changed loses its voice; make that one again and run `voices` with every
scene's voice — the ones in `voices/` for the rest.
