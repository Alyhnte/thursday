# claude/wizardly-hopper-qe5rf4

Design exploration for new moments on Thursday's face (the ascii orb). No app code has changed
yet: the work so far is a design canvas, https://claude.ai/artifact/CMHZ6oW7wYJ21Sgyq3Ydi2

## Here: where you are and the sky over it

- Runs once a day, for users who have given their location.
- She turns into a globe (land as trees, sea as water, the same by day and by night), spins to the
  user's location, then dives until their country fits and widens past her circle into a 2:1
  field. On the way in everything else falls away: only their country is left, low in the frame.
- At night their country's land turns to dark emoji, cell by cell, and then its ten largest
  cities light up in bright emoji, the biggest first, each glow as wide as the city is big. No
  backdrop: the page stays as it is. Cities from GeoNames (cities over 15,000; CC BY 4.0, which
  needs attribution in the app), tested against the country outlines.
- Country outlines from Natural Earth 50m (world-atlas `countries-50m`, simplified to ~240 KB).
- A pin at the location. In the sky above, the sun as a small living cluster of emoji, where it
  really is now (suncalc's formulas): up left in the morning, high at noon, down right toward
  evening. At night the moon, lit as it is tonight, and stars.
- Weather kept light: rain or snow falling thinly across, a few small clouds in the sky, never a
  sheet over the map. Clear, partly cloudy, overcast, fog, drizzle, rain, heavy rain, snow,
  thunderstorm, typhoon (called typhoon, hurricane or cyclone by region). Place, time and weather
  are a line of text under the scene, not a box on the map.

## Seeing: a picture in emoji pixels

- Code, not the model: each cell takes the emoji whose measured average colour is nearest.
- The picture keeps its own shape, larger than her; transparent areas stay empty.
- Emoji go down one at a time in random order, hold, and leave in another random order.
- One picture at a time: when several come, she draws the first.

## Drawing

- Hers: `emote` gains a drawing, an SVG path in a 100 × 100 box and a colour from an enum mapped
  to `EMOJI_POOL`'s colour groups. Her body shrinks into the pen that draws it.
- Yours: a large drawing pad, captured as a PNG and shown through Seeing; the same PNG goes to the
  model to read.

## What the app would need

- `where.ts` keeps the coordinates on the page (it drops them today); the map is drawn in the
  browser, so the server still never sees the position.
- Open-Meteo: add `wind_gusts_10m`, `cloud_cover` and `is_day`. A typhoon is not a WMO code; it
  comes from wind.
- The country data ships with the app.
- The `emote` schema takes the drawing.

## Open

- Large countries: fit the whole country (as now) or zoom closer to the city.
