"use client";

import * as React from "react";
import { ImagePreview } from "@/components/ui/image-preview";

/**
 * Staff profile photo.
 *
 * Renders the staff's migrated FOTO document through the application's
 * authenticated document endpoint (`/api/documents/:id/download`). The browser
 * never talks to Google Drive directly and no private Drive URL is exposed.
 *
 * When a photo exists, the avatar is clickable and opens a full-size preview
 * (lightbox) showing the same authenticated image URL with its natural aspect
 * ratio. Falls back to a non-clickable initials avatar when there is no photo
 * or when loading fails — never a broken image icon.
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
    const src = `/api/documents/${photoDocId}/download`;
    return (
      <ImagePreview src={src} alt={`Foto ${name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`Foto ${name}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={`${box} shrink-0 rounded-full border border-slate-200 object-cover`}
        />
      </ImagePreview>
    );
  }

  return (
    <span
      className={`${box} flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 font-bold text-slate-500`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
