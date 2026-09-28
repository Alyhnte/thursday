# claude/wonderful-brown-9b9pgz

Motion videos as a new kind in the `artifact` skill: a bot writes scenes as JSON, the engine
draws them as one card that morphs from scene to scene, the app plays it, and it renders to mp4.

- `skills/artifact/runtime/motion/` — the engine (`engine.js`), 20 scene kinds (`parts.js`), the
  timeline, camera, cursor, captions and player (`stage.js`), styles, the page template, the JSON
  checks (`schema.mjs`), Geist fonts.
- `skills/artifact/scripts/motion.mjs` — `put`, `get`, `voices`, `track`, `shots`, `render`.
- Timed three ways: each scene's `dur` (captions only), one voice per scene (`voices`), or a
  recording of the user's own (`track`; scenes cut in over their video or sit in an `area`).
- 16:9, 9:16 and 1:1; themes `paper`, `ink`, `mist`; `lang` (Korean breaks lines between words).
- Render: frames through the browser skill's `apart` session (added to `session.mjs`), four
  subframes blended for motion blur (`--draft` takes one), still frames reused, pieces encoded
  while the next is drawn. ffmpeg helpers moved from `book-video.mjs` to `scripts/media.mjs`.
- `references/motion.md`, `templates/motion/`, SKILL.md row and description, guide, README credit
  (after Barty-Bart/motion-graphics, MIT), skills map, pack REQUIRED, `scripts/motion.test.mts`.

Open: motion video sits under "To keep and look at" in SKILL.md, but has no app head or in-app
edit; not yet run end to end by a bot in the real app.
