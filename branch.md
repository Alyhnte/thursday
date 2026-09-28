# claude/wizardly-hopper-qe5rf4

New moments on Thursday's face (the ascii orb). The design canvas:
https://claude.ai/artifact/CMHZ6oW7wYJ21Sgyq3Ydi2

Everything is drawn on her own grid (ascii-orb: 8px glyphs on 5.4 × 7.1px cells, so neighbours
touch), with her glyph ramp, emoji pool, eyes and washes.

## Here: where you are and the sky over it (in the app, work in progress)

- When: the first spoken call of the day the user places from this browser, with location
  allowed and the weather found. Not on a call she places (call-back) and not on the very first
  call, which introduces her; the day is kept in the browser and spent only when it plays.
- She greets them with the weather while it plays: on that call the server swaps her opening
  for one that says so. No extra message goes in, so it cannot mix with open work or screen
  news, which already wait for the opening. The weather was already in her prompt; gusts are
  added to it.
- While it is up, `emote` shows nothing and tells her so; a tap brings her back without hanging
  up; her words stand under her face instead of beside it. About 11 s, then she comes back.
- The globe: she turns into it (the world spreads through her from the middle), spins to them,
  dives until their country fits a field twice her width, everything else falling away. A pin,
  the sun where it really is (or tonight's moon and stars), the weather lightly over it, wind
  and a storm from the gusts. At night the country is dark land.
- The position stays in the page (`where.ts` returns it beside what goes to the server).
- Map: Natural Earth 50m countries via world-atlas, rebuilt by `scripts/here-map.mts` into
  `public/here/world.json` (236 KB), credited in `public/here/NOTICE`.
- Files: `features/thursday/components/here-globe.tsx`, `here-map.ts`, `here-sky.ts`,
  `here-day.ts`; tests in `scripts/here.test.mts` (in `test:live`).
- Waiting: city lights at night need a city list. Natural Earth's own (public domain, the
  maintainer's pick) is on naciscdn.org, which this environment's network blocks; GeoNames
  needs a credit. Findings of a code review are being fixed.

## Seeing: a picture in emoji pixels (design only)

- Code, not the model: each cell takes the emoji whose measured average colour is nearest.
- The picture keeps its own shape, larger than her; transparent areas stay empty.
- Emoji go down one at a time in random order, hold, and leave in another random order.
- One picture at a time: when several come, she draws the first.

## Drawing (design only)

- Hers: `emote` gains a drawing, an SVG path in a 100 × 100 box and a colour from an enum mapped
  to `EMOJI_POOL`'s colour groups. Her body shrinks into the pen that draws it.
- Yours: a large drawing pad, captured as a PNG and shown through Seeing; the same PNG goes to the
  model to read.
