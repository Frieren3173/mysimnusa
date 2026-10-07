#!/usr/bin/env bash
#
# prepare-photos.sh — build the login slideshow images.
#
# Sources : source-photos/*.{HEIC,JPG,JPEG}  (photos of Komite Keperawatan activity)
# Outputs : public/assets/login/NN.webp   (longest side ≤ 1920px, WebP q75)
#
# What it does
#   • Decodes HEIC (4 files) + JPEG via sharp (no external tools needed — the
#     project already ships `sharp`, built with libheif + EXIF support).
#   • Auto-orients using the EXIF orientation before resizing.
#   • Resizes to a 1920px max side, WebP quality 75 → target 150–300 KB.
#   • EXCLUDES the two poster/kolase images (text would be cropped):
#       IMG_3648, IMG_4959
#
# If sharp were unavailable you could install the tools instead:
#   • ImageMagick:  `magick input.HEIC -auto-orient -resize 1920x1920\> -quality 75 out.webp`
#   • heif-convert: `heif-convert input.HEIC out.jpg` then convert to WebP.
# This repo uses sharp, so no extra install is required.
#
# Requires: node + sharp (already a dependency).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$ROOT/scripts/prepare-login-photos.mjs"
