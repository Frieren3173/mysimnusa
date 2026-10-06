#!/usr/bin/env bash
#
# compress.sh — MYSIMNUSA landing "boomerang" (ping-pong) videos.
#
# Sources : source-videos/1.mp4, 2.mp4, 3.mp4  (natural sort → section order)
#           Section 1 ← 1.mp4 · Section 2 ← 2.mp4 · Section 3 ← 3.mp4
# Outputs : public/assets/video-N.{mp4,webm} + public/assets/poster-N.webp
#
# Each output plays forward then reversed and loops seamlessly (a "boomerang"),
# baked into the file with ffmpeg — NOT via negative playbackRate (unsupported
# and stuttery in browsers).
#
# - 1280-wide, 24 fps, NO audio, max ~8s source (`-t 8`).
# - The reverse pass drops the first frame (trim=start_frame=1) so the turning
#   point has no duplicated frame; the forward pass keeps its full range so the
#   loop seam also has no duplicate.
# - MP4: H.264 crf 28 + faststart.  WebM: VP9 crf 40 + row-mt.
# - Target ≤ 3–4 MB per file (raise CRF / drop resolution if larger).
#
# Requires: ffmpeg on PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$ROOT/source-videos"
OUT_DIR="$ROOT/public/assets"

mkdir -p "$OUT_DIR"
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not found on PATH"; exit 1; }

# forward (1→N) then reverse (N→1), no duplicated frame at the turn.
# The forward pass is trimmed to the first 8s *inside the filter* (so a longer
# source is cut correctly), and the same trimmed stream feeds the reverse pass.
BOOMERANG="[0:v]trim=end=8,setpts=PTS-STARTPTS,scale=1280:-2,fps=24,split[a][b];[b]reverse,trim=start_frame=1,setpts=PTS-STARTPTS[r];[a][r]concat=n=2:v=1:a=0[v]"

compress() {
  local idx="$1"
  local in_file="$SRC_DIR/${idx}.mp4"
  [[ -f "$in_file" ]] || { echo "skip: $in_file not found"; return 0; }

  echo "── video-${idx} (from $(basename "$in_file")) ──"

  # MP4 — H.264, faststart for instant playback. (crf 33 keeps doubled frames small)
  ffmpeg -y -i "$in_file" \
    -filter_complex "$BOOMERANG" -map "[v]" -an \
    -c:v libx264 -crf 33 -preset slow -movflags +faststart \
    "$OUT_DIR/video-${idx}.mp4"

  # WebM — VP9. (crf 48 for the doubled frame count)
  ffmpeg -y -i "$in_file" \
    -filter_complex "$BOOMERANG" -map "[v]" -an \
    -c:v libvpx-vp9 -crf 48 -b:v 0 -row-mt 1 \
    "$OUT_DIR/video-${idx}.webm"

  # Poster — first frame, WebP.
  ffmpeg -y -i "$in_file" -frames:v 1 \
    -vf "scale=1280:-2" -quality 80 \
    "$OUT_DIR/poster-${idx}.webp"

  du -h "$OUT_DIR/video-${idx}.mp4" "$OUT_DIR/video-${idx}.webm" "$OUT_DIR/poster-${idx}.webp"
}

compress 1
compress 2
compress 3

# Remove stale assets (old video/poster numbers not produced above).
echo
echo "── final sizes ──"
ls -lh "$OUT_DIR"/video-*.mp4 "$OUT_DIR"/video-*.webm "$OUT_DIR"/poster-*.webp 2>/dev/null || true
