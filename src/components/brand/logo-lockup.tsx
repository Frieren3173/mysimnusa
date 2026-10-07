import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * MYSIMNUSA combined logo lockup.
 *
 * Renders the official 4-logo strip (Lambang Kejaksaan · RS Adhyaksa Jawa Timur
 * · BerAKHLAK · Bangga Melayani Bangsa) with an optional white "capsule" behind
 * it. The strip contains dark text, so on dark / navy / photo / video
 * backgrounds it MUST sit inside a white capsule to stay legible; on light
 * backgrounds it is shown bare.
 *
 * - Transparent WebP served at 1× (1000w) and 2× (2000w) via srcSet.
 * - Fixed intrinsic width/height (1000×144) so there is never a layout shift.
 */

const ALT = "Logo Kejaksaan RI, RS Adhyaksa Jawa Timur, BerAKHLAK, Bangga Melayani Bangsa";

export function LogoLockup({
  /** Rendered logo height in px (width follows the 1000:144 ratio). */
  height = 32,
  /** Wrap in a white capsule (use on dark / photo / video backgrounds). */
  capsule = false,
  /** Above-the-fold logo (e.g. sticky header) — preload + eager. */
  priority = false,
  /**
   * Clip the strip to a left crop of this pixel width. Use on very narrow
   * layouts (mobile header) to show only the first one or two emblems.
   */
  cropWidth,
  className,
  capsuleClassName,
}: {
  height?: number;
  capsule?: boolean;
  priority?: boolean;
  cropWidth?: number;
  className?: string;
  capsuleClassName?: string;
}) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/assets/logo/logo-1000.webp"
      srcSet="/assets/logo/logo-1000.webp 1000w, /assets/logo/logo-2000.webp 2000w"
      sizes="220px"
      alt={ALT}
      width={1000}
      height={144}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(priority ? ({ fetchPriority: "high" } as any) : {})}
      style={{ height, width: "auto" }}
      className={cn("w-auto max-w-none object-contain object-left", className)}
    />
  );

  const clipped =
    cropWidth != null ? (
      <span className="block shrink-0 overflow-hidden" style={{ width: cropWidth, height }}>
        {img}
      </span>
    ) : (
      img
    );

  if (!capsule) return clipped;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-xl bg-white shadow-sm ring-1 ring-black/5",
        capsuleClassName,
      )}
      // Padding scaled to keep the capsule tight around the strip.
      style={{ padding: "6px 12px" }}
    >
      {clipped}
    </span>
  );
}
