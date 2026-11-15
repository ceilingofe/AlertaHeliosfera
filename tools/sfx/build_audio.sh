#!/usr/bin/env bash
# Regenera los efectos originales y los convierte a MP3 en public/assets/audio/sfx.
# Uso: bash tools/sfx/build_audio.sh   (requiere python3 + numpy y ffmpeg)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
python3 "$ROOT/tools/sfx/generate_sfx.py" "$TMP"
mkdir -p "$ROOT/public/assets/audio/sfx"
for f in "$TMP"/*.wav; do
  name="$(basename "$f" .wav)"
  ffmpeg -loglevel error -y -i "$f" -ac 1 -codec:a libmp3lame -b:a 96k "$ROOT/public/assets/audio/sfx/$name.mp3"
done
rm -rf "$TMP"
echo "Listo: $(ls "$ROOT/public/assets/audio/sfx" | wc -l) archivos"
