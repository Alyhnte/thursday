# The Instagram film

A 30-second Reel (1080×1920, 30 fps): the user asks, Thursday's blue dot falls into the office,
the office builds itself where it lands, she introduces the team, DONE, then the card. The
office is rebuilt in 3D from `features/bot/office.scene.ts` (the same plan units, greys, hatching
and overshooting lines) and flown through by a scripted drone camera. The music and sounds are
made from oscillators and noise in `music.py`; nothing is sampled.

Her voice is not in it: the film leaves a slot for each of her lines and the music is ducked
under each one. `out/script.md` is the script with those slots, `out/add-voice.sh` lays the
clips in.

## What is here

| | |
|---|---|
| `out/thursday-en.mp4`, `out/thursday-ko.mp4` | The film with music and sounds, English and Korean words |
| `out/stems/` | The music and the sounds apart, and the film's own track |
| `out/script.md` | The script: every line, its slot and its tone |
| `out/voice-cues-*.srt` | The same slots as subtitles |
| `out/add-voice.sh` | Lays voice clips named by line id onto a film at their slots |
| `timeline.json` | The lines, their slots, the shots and the card: what the film and the music are timed by |
| `web/` | The film as a page: `renderAt(t)` draws any moment |
| `shoot.mjs` | Stills or the film, through headless Chrome into ffmpeg |
| `music.py` | The music and the sounds |
| `marks.mts` | The bots' faces from the app's `mark.geometry.ts`, into `marks.json` |

## Making it again

```sh
cd promo
npm install                      # three, ffmpeg, fonts, playwright-core (uses your installed Chrome)
pip install numpy scipy          # for the music
npm run music                    # out/stems/
LANG_FILM=ko npm run film        # renders/ko.mp4 (Q=0 for a quick look without motion blur)
./mux.sh ko                      # out/thursday-ko.mp4
LANG_FILM=en npm run stills -- 8.5 17.2 25.3    # stills/ for a look at single moments
```

A line or a slot is changed in `timeline.json`. The music ducks under the slots it reads from
there, so run `npm run music` again after moving one; its beats, hits and sounds are placed by
time in `music.py` itself, and a shot moved needs them moved by hand. The office after the call
runs two seconds behind the film's clock (`CUT` and `SHIFT` in `web/main.js`, `M` in `music.py`).

With a GPU a render takes a few minutes. Without one (`CHROME_PATH` unset in a container) WebGL
falls back to SwiftShader and a language takes about 25 minutes.
