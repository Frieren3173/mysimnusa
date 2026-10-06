#!/usr/bin/env bash
#
# compress.sh — MYSIMNUSA landing "scroll-story" video compression.
#
# Sources : source-videos/1.mp4, source-videos/2.mp4
# Outputs : public/assets/video-1.{mp4,webm}, public/assets/poster-1.webp
#           public/assets/video-2.{mp4,webm}, public/assets/poster-2.webp
#
# Targets : 1280px wide, 24 fps, NO audio, MP4 ≤ ~2–4 MB, WebM ≈ smaller.
# Requires: ffmpeg + ffprobe on PATH.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$ROOT/source-videos"
OUT_DIR="$ROOT/public/assets"

mkdir -p "$OUT_DIR"

command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not found on PATH"; exit 1; }

compress() {
  local idx="$1"
  local in_file="$SRC_DIR/${idx}.mp4"

  if [[ ! -f "$in_file" ]]; then
    echo "skip: $in_file not found"
    return 0
  fi

  echo "── video-${idx} ─────────────────────────────────────────"

  # MP4 (H.264, faststart for streaming)
  ffmpeg -y -i "$in_file" \
    -vf "scale=1280:-2,fps=24" -an \
    -c:v libx264 -crf 28 -preset slow -movflags +faststart \
    "$OUT_DIR/video-${idx}.mp4"

  # WebM (VP9) — crf 40 + row-mt keeps WebM competitive with the H.264 MP4.
  ffmpeg -y -i "$in_file" \
    -vf "scale=1280:-2,fps=24" -an \
    -c:v libvpx-vp9 -crf 40 -b:v 0 -row-mt 1 \
    "$OUT_DIR/video-${idx}.webm"

  # Poster (WebP, first frame)
  ffmpeg -y -i "$in_file" -frames:v 1 \
    -vf "scale=1280:-2" -quality 80 \
    "$OUT_DIR/poster-${idx}.webp"

  du -h "$OUT_DIR/video-${idx}.mp4" "$OUT_DIR/video-${idx}.webm" "$OUT_DIR/poster-${idx}.webp"
}

compress 1
compress 2

echo
echo "── final sizes ─────────────────────────────────────────"
ls -lh "$OUT_DIR"/video-*.mp4 "$OUT_DIR"/video-*.webm "$OUT_DIR"/poster-*.webp 2>/dev/null || true
