# claude/wizardly-hopper-qe5rf4

Design exploration for new moments on Thursday's face (the ascii orb). No app code has changed
yet: the work so far is a design canvas, https://claude.ai/artifact/CMHZ6oW7wYJ21Sgyq3Ydi2

## Here: where you are and the sky over it

- She turns into a globe, spins to the user's location, then dives until their country fits and
  widens past her circle into a 2:1 field.
- Country outlines from Natural Earth 50m (world-atlas `countries-50m`, simplified to ~240 KB).
  Their country is drawn in her emoji, neighbours as plain ground, land borders dotted.
- A pin at the location, the local time, and the sun or the moon on today's real arc (suncalc's
  formulas). On the globe, the night side is dark with city lights.
- Weather over the map: clear, partly cloudy, overcast, fog, drizzle, rain, heavy rain, snow,
  thunderstorm, typhoon (called typhoon, hurricane or cyclone by region).

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
