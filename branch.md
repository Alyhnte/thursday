# claude/wizardly-hopper-qe5rf4

New moments on Thursday's face (the ascii orb). The design canvas:
https://claude.ai/artifact/CMHZ6oW7wYJ21Sgyq3Ydi2

Everything is drawn on her own grid (ascii-orb: 8px glyphs on 5.4 × 7.1px cells, so neighbours
touch), with her glyph ramp, emoji pool, eyes and washes.

## Here: where you are and the sky over it (in the app)

- When: the first spoken call of the day the user places from this browser, with location
  allowed and the weather found, in a page they are looking at, unless the system asks for less
  motion. Not on a call she places (call-back) and not on the very first call, which introduces
  her. The day is kept in the browser and spent only once the globe draws.
- She greets them with the weather while it plays: on that call the server swaps her opening
  for one that says so (still "never work"). No extra message goes in, so it cannot mix with
  open work or screen news, which already wait for the opening. Gusts join the weather in her
  prompt.
- While it is up, no word goes on her face (`emote` is told so, the page's own "OK" is let go);
  a tap brings her back without hanging up; the captions beside her are kept, unseen, and her
  words stand under her face. It holds 3.4 s once everything is in, about 11 s in all; a page
  left while it is up goes straight back to her face.
- The globe: she turns into it (the world spreads through her from the middle), spins to them,
  dives until their country fits a field twice her width, everything else falling away. A pin,
  the sun on the pass it is on now (walked from now, so no clock or zone moves it), or tonight's
  moon and stars, the weather lightly over it, wind and a storm from the gusts. At night the
  country is dark land.
- Their country is the one the place service names (ISO code), so a border or strait town is not
  put in its neighbour; the outlines decide only where it names none the map has.
- The position and country stay in the page (`where.ts` returns them beside what goes to the
  server).
- Map: Natural Earth 50m countries via world-atlas, with ISO codes from i18n-iso-countries,
  rebuilt by `scripts/here-map.mts` into `public/here/world.json` (239 KB), credited in
  `public/here/NOTICE`. Rings simplification would collapse (Monaco, Macau) are kept whole;
  Antarctica's coast is closed along the pole.
- Files: `features/thursday/components/here-globe.tsx` (loaded only when it plays),
  `here-map.ts`, `here-sky.ts`, `here-day.ts`; tests in `scripts/here.test.mts` (in `test:live`).
- Waiting: city lights at night need a city list. Natural Earth's own (public domain, the
  maintainer's pick) is on naciscdn.org, which this environment's network blocks; GeoNames needs
  a credit. Until then the lights are not in the code.

## Seeing: a picture in emoji pixels (in the app)

- When: a picture handed to her on a call — put down during a spoken call, or sent to her in
  writing. The first picture of several; nothing while another moment is over her face, with less
  motion asked for, or in a page not in front.
- One moment at a time over her face (`face-moment.ts`): the globe and a picture share it, and
  while one is up no word goes on her face (`emote` is told which, the page's "OK" is let go).
  The globe's state moved there from `use-thursday`.
- Code, not the model: each cell takes the emoji whose colour, measured as this system draws it
  over this page, is nearest the picture's there (the design's palette and measure; an emoji the
  system draws in the fill colour — a box, a letter — is left out). Letters by ink elsewhere.
- Its own shape, up to 90 % × 88 % of the globe's field (`face-grid.ts`, her grid carried wider);
  what is clear stays empty. Down one at a time in a random, slightly clumped order (3.7 s),
  holds 3.6 s (config `SEE.holdMs`), leaves in another order; about 10.5 s in all. Tap sends it
  back.
- Her face fades out under it and back in as it goes (wiping her cell by cell cut her glyphs).
- A spoken call can now see the picture: `look_at` runs in the page there (`live-picture.ts`
  fetches the file and fits it to the connection's one message, as the shared screen is), and
  the voice's delegation list names pictures they give her.
- Files: `features/thursday/components/seeing.tsx` (loaded only when it plays),
  `face-moment.ts`, `face-grid.ts`, `live-picture.ts`.

## Drawing (in the app)

- Hers: a page tool `draw` beside `emote` on a spoken call (a tool the call holds does one thing
  with its arguments required, so not a second use of `emote`): an SVG path in a 100 × 100 box
  and a colour word. The colours are her emoji pool's bands, now named in `ascii.const`
  (`EMOJI_POOL` is built from them in the same order, so her face is unchanged), the grey band
  split into white and black, the many-coloured one as rainbow. `svg-path.ts` reads every path
  command. Her face gives way to her body drawn on the grid, which shrinks into a pen, draws the
  line (3.8 s), rests (config `DRAW.holdMs`), goes home as the line fades; about 10 s. The
  voice's delegation list names her face with `emote`, as hers to express with: "Your face: a
  short word or a small drawing on it, when you want to show or express something."
- Yours: the brush on the write line opens a pad (a dialog); pens are her ink and the bot marks'
  colours. "Show Thursday" on a spoken call, "Add to the message" otherwise, keeps the drawing
  as a PNG cropped to it on the pad's colour (config `DRAW_PAD.longestSide`) and puts it on the
  line as a pasted picture: from there it is a picture like any other (Seeing, `look_at`).
- Files: `features/thursday/components/her-drawing.tsx`, `draw-pad.tsx`,
  `features/thursday/svg-path.ts`; tests in `scripts/draw.test.mts` (in `test:live`).
