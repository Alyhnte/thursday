#!/bin/sh
# mux.sh en|ko: the rendered picture (renders/<lang>.mp4) with the film's track, ready for Instagram
cd "$(dirname "$0")"
node_modules/ffmpeg-static/ffmpeg -loglevel error -y -i renders/$1.mp4 -i out/stems/music-sfx-ducked.wav \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart out/thursday-$1.mp4
