"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

const INTERVAL_MS = 4000;

export function PhotoCarousel({ slides }: { slides: string[] }) {
  const [visible, setVisible] = useState(1);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setVisible(mq.matches ? 3 : 1);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const v = Math.min(visible, slides.length);
  const pages = Math.max(slides.length - v + 1, 1);
  const active = index >= pages ? 0 : index;

  useEffect(() => {
    if (pages <= 1) return;
    const timer = setInterval(
      () => setIndex((i) => ((i >= pages ? 0 : i) + 1) % pages),
      INTERVAL_MS
    );
    return () => clearInterval(timer);
  }, [pages]);

  if (slides.length === 0) return null;

  const widthPct = 100 / v;
  const translatePct = slides.length > 0 ? (active * 100) / slides.length : 0;

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm">
      <div
        className="flex transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(-${translatePct}%)` }}
      >
        {slides.map((name) => (
          <div
            key={name}
            className="relative h-48 md:h-64 shrink-0"
            style={{ width: `${widthPct}%` }}
          >
            <Image
              src={`/uploads/slides/${encodeURIComponent(name)}`}
              alt={name}
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
          </div>
        ))}
      </div>

      {pages > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
          {Array.from({ length: pages }).map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Slide ${i + 1}`}
              onClick={() => setIndex(i)}
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                i === active ? "bg-white" : "bg-white/50 hover:bg-white/80"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
