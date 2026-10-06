"use client";

import * as React from "react";
import { ImagePreview } from "@/components/ui/image-preview";

/**
 * Staff profile photo.
 *
 * Two sources are used on purpose, for speed:
 *   - the table avatar loads the lightweight thumbnail endpoint
 *     (`/api/documents/:id/thumbnail`, a small cached JPEG), so the Staff list
 *     never downloads multi-megabyte originals;
 *   - the full photo (`/api/documents/:id/download`) is only fetched when the
 *     user opens the preview (lightbox).
 *
 * Both go through authenticated application routes — the browser never talks to
 * Google Drive directly and no private Drive URL is exposed.
 *
 * Falls back to a non-clickable initials avatar when there is no photo or when
 * the thumbnail fails to load — never a broken image icon.
 */

export function StaffPhoto({
  name,
  photoDocId,
  size = "md",
}: {
  name: string;
  photoDocId: string | null;
  size?: "md" | "lg";
}) {
  const [failed, setFailed] = React.useState(false);
  const initials = name
    .replace(/^(Ns\.|Bdn\.|Dr\.|dr\.)\s*/i, "")
    .trim()
    .charAt(0)
    .toUpperCase();

  const box = size === "lg" ? "h-14 w-14 text-lg" : "h-8 w-8 text-[11px]";

  if (photoDocId && !failed) {
    // Request the thumbnail at ~2× the rendered size for crispness on HiDPI.
    const thumbSize = size === "lg" ? 256 : 64;
    const thumbSrc = `/api/documents/${photoDocId}/thumbnail?size=${thumbSize}`;
    const fullSrc = `/api/documents/${photoDocId}/download`;
    return (
      <ImagePreview src={fullSrc} alt={`Foto ${name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbSrc}
          alt={`Foto ${name}`}
          width={size === "lg" ? 56 : 32}
          height={size === "lg" ? 56 : 32}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          onError={() => setFailed(true)}
          className={`${box} shrink-0 rounded-full border border-[var(--color-border)] object-cover`}
        />
      </ImagePreview>
    );
  }

  return (
    <span
      className={`${box} flex shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] font-bold text-[var(--color-muted-foreground)]`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
