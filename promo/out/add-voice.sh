#!/usr/bin/env bash
# Lays Thursday's voice clips over the film at their slots, and levels the result for Instagram.
#
#   ./add-voice.sh thursday-en.mp4 voices/ thursday-en-final.mp4
#
# voices/ holds one clip per line, named by the line's id (any of .wav .mp3 .m4a .aac):
#   ask sure meet jarvis analyst curator writer designer me done
# A missing clip is skipped. `ask` is the user's own line: leave it out to keep that line silent.
# Each clip starts at its slot; a clip longer than its slot runs into the next shot, so trim or
# speed it up first (voice-cues-*.srt holds the same slots, ../timeline.json the source of them).
# Uses ffmpeg from PATH, else the one `npm install` put in ../node_modules.
set -euo pipefail
video=$1
dir=$2
out=$3
here=$(cd "$(dirname "$0")" && pwd)
ffmpeg=ffmpeg
command -v ffmpeg >/dev/null || ffmpeg="$here/../node_modules/ffmpeg-static/ffmpeg"

slot() {
  case $1 in
    ask) echo 0.45 ;; sure) echo 2.5 ;; meet) echo 6.5 ;; jarvis) echo 8.2 ;; analyst) echo 10.2 ;;
    curator) echo 12.2 ;; writer) echo 14.2 ;; designer) echo 16.2 ;; me) echo 18.4 ;; done) echo 22.4 ;;
  esac
}

inputs=(-i "$video")
filters=""
labels="[0:a]"
n=1
for id in ask sure meet jarvis analyst curator writer designer me done; do
  clip=""
  for ext in wav mp3 m4a aac; do
    if [[ -f "$dir/$id.$ext" ]]; then
      clip="$dir/$id.$ext"
      break
    fi
  done
  [[ -z $clip ]] && continue
  ms=$(awk "BEGIN { printf \"%d\", $(slot "$id") * 1000 }")
  inputs+=(-i "$clip")
  filters+="[$n:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[v$n];"
  labels+="[v$n]"
  n=$((n + 1))
done
filters+="${labels}amix=inputs=$n:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11[a]"
"$ffmpeg" -y "${inputs[@]}" -filter_complex "$filters" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 256k -ar 48000 -movflags +faststart "$out"
