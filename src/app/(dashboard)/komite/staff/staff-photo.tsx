"use client";

import * as React from "react";

/**
 * Staff profile photo.
 *
 * Renders the staff's migrated FOTO document through the application's
 * authenticated document endpoint (`/api/documents/:id/download`). The browser
 * never talks to Google Drive directly and no private Drive URL is exposed.
 *
 * Falls back to an initials avatar when there is no photo or when loading
 * fails — never a broken image icon.
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
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/documents/${photoDocId}/download`}
        alt={`Foto ${name}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`${box} shrink-0 rounded-full border border-slate-200 object-cover`}
      />
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
