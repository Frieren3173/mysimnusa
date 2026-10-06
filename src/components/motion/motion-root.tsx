"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import "lenis/dist/lenis.css";
import "./motion.css";

const LENIS_LERP = 0.1;

const INTRO_DURATION = 0.9;
const INTRO_STAGGER = 0.12;
const INTRO_EASE = "expo.out";
const INTRO_LAST_LINE_OPACITY = 0.25;
const INTRO_LINE_FADE_DURATION = 0.35;
const INTRO_CHILD_DELAY = 0.4;
const INTRO_CHILD_DURATION = 0.7;
const INTRO_CHILD_STAGGER = 0.06;
const INTRO_CHILD_Y = 12;
const INTRO_CHILD_EASE = "power3.out";

const LINES_DURATION = 0.9;
const LINES_STAGGER = 0.1;
const LINES_EASE = "expo.out";

const REVEAL_DURATION = 0.8;
const REVEAL_Y = 20;
const REVEAL_EASE = "power3.out";
const REVEAL_START = "top 85%";

const SCENE_EASE = "power3.inOut";
const SCENE_SMOOTH = 1;
const SCENE_START = "top 15%";
const SCENE_END = "top -25%";
const SCENE_Y = -50;

const PARALLAX_Y = -40;
const PARALLAX_START = "top bottom";
const PARALLAX_END = "bottom top";

// Pointer parallax: bounded, transform-only, driven by one rAF loop.
const PARALLAX_POINTER_MAX = 18; // px — max displacement at depth 1
const PARALLAX_POINTER_LERP = 0.09; // follow smoothing (lower = smoother/slower)

const MAGNETIC_MAX = 8;
const MAGNETIC_TRACKING = 0.25;
const MAGNETIC_DURATION = 0.35;
const MAGNETIC_EASE = "power3.out";

const FOOTER_DURATION = 0.5;
const FOOTER_STAGGER = 0.05;
const FOOTER_Y = 10;
const FOOTER_START = "top 95%";

const HEADLINE_QUERY = '[data-motion-intro="headline"]';
const SCENE_QUERY = "[data-motion-scene-exit]";
const LINES_QUERY = "[data-motion-lines]";
const INTRO_CHILD_QUERY = "[data-motion-intro-child]";
const REVEAL_QUERY = "[data-motion-reveal]";
const FOOTER_QUERY = "[data-motion-footer]";
const PARALLAX_QUERY = "[data-motion-parallax]";
const PARALLAX_POINTER_QUERY = "[data-motion-pointer]";
const MAGNETIC_QUERY = "[data-motion-magnetic]";
const LABELLED_QUERY = [
  HEADLINE_QUERY,
  SCENE_QUERY,
  LINES_QUERY,
  INTRO_CHILD_QUERY,
  REVEAL_QUERY,
  FOOTER_QUERY,
  PARALLAX_QUERY,
  PARALLAX_POINTER_QUERY,
  MAGNETIC_QUERY,
].join(",");

const MUTATION_DEBOUNCE = 120;

type Killable = { kill: () => void };
type SplitLike = { revert: () => void };
type TweenWithTrigger = { scrollTrigger?: Killable };
type SceneState = { el: HTMLElement | null; trigger: Killable | null };

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const queryAll = <T extends Element>(selector: string) =>
  Array.from(document.querySelectorAll<T>(selector));

export default function MotionRoot() {
  // Re-evaluate per route: the landing page uses window scroll (Lenis), while
  // the app shell scrolls inside `#main-content` and must keep native scroll.
  const pathname = usePathname();

  useEffect(() => {
    const docEl = document.documentElement;
    docEl.classList.add("motion-primed");

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const noHover = window.matchMedia(
      "(hover: none), (pointer: coarse)"
    ).matches;

    if (reduced) {
      return;
    }

    // Only the landing/intro page uses the window-scroll motion system. The
    // application shell (sidebar pages) scrolls inside its own `#main-content`
    // container and must keep native scrolling, so we skip it entirely — this
    // also guarantees no Lenis instance lingers after client-side navigation.
    // The app sidebar is a reliable, unique marker of the application shell.
    if (document.querySelector('aside[aria-label="Navigasi utama"]')) {
      return;
    }

    docEl.classList.add("motion-primed");

    let disposed = false;
    let teardown: () => void = () => {};
    const splits: Array<{ split: SplitLike; el: HTMLElement }> = [];

    const failVisible = () => {
      docEl.classList.remove("motion-primed");
    };

    void (async () => {
      try {
        const [gsapMod, stMod, spMod, lenisMod] = await Promise.all([
          import("gsap"),
          import("gsap/ScrollTrigger"),
          import("gsap/SplitText"),
          import("lenis"),
        ]);
        if (disposed) return;

        const gsap = gsapMod.gsap;
        const ScrollTrigger = stMod.ScrollTrigger;
        const SplitText = spMod.SplitText;
        const Lenis = lenisMod.default;
        gsap.registerPlugin(ScrollTrigger, SplitText);

        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }
        if (disposed) return;

        const triggers: Killable[] = [];
        const disposers: Array<() => void> = [];
        let scene: SceneState = { el: null, trigger: null };

        const trackTrigger = (tween: object) => {
          const trigger = (tween as TweenWithTrigger).scrollTrigger;
          if (trigger) triggers.push(trigger);
        };

        const prune = () => {
          for (let i = triggers.length - 1; i >= 0; i -= 1) {
            const trigger = triggers[i] as unknown as ScrollTrigger & Killable;
            const el = trigger.trigger;
            if (el && !document.body.contains(el)) {
              trigger.kill();
              triggers.splice(i, 1);
            }
          }
          if (scene.el && !document.body.contains(scene.el)) {
            scene.trigger?.kill();
            scene = { el: null, trigger: null };
          }
        };

        const setupScene = (el: HTMLElement) => {
          if (scene.trigger) scene.trigger.kill();
          const tween = gsap.fromTo(
            el,
            { y: 0, opacity: 1 },
            {
              y: SCENE_Y,
              opacity: 0,
              ease: SCENE_EASE,
              immediateRender: false,
              scrollTrigger: {
                trigger: el,
                start: SCENE_START,
                end: SCENE_END,
                scrub: SCENE_SMOOTH,
              },
            }
          );
          scene = {
            el,
            trigger: (tween as TweenWithTrigger).scrollTrigger ?? null,
          };
        };

        const scan = () => {
          if (disposed) return;

          queryAll<HTMLElement>(HEADLINE_QUERY).forEach((el) => {
            if (el.dataset.motionDone === "1") return;
            el.dataset.motionDone = "1";
            const split = new SplitText(el, {
              type: "lines",
              mask: "lines",
              linesClass: "motion-line",
            });
            splits.push({ split, el });
            gsap.set(el, { opacity: 1 });
            const lines = split.lines;
            if (lines.length === 0) return;
            const last = lines[lines.length - 1];
            gsap.set(last, { opacity: INTRO_LAST_LINE_OPACITY });
            const timeline = gsap.timeline();
            timeline.from(
              lines,
              {
                yPercent: 100,
                duration: INTRO_DURATION,
                stagger: INTRO_STAGGER,
                ease: INTRO_EASE,
              },
              0
            );
            timeline.to(
              last,
              { opacity: 1, duration: INTRO_LINE_FADE_DURATION },
              ">"
            );
            timeline.eventCallback("onComplete", () => {
              if (disposed) return;
              const sceneEl = document.querySelector<HTMLElement>(SCENE_QUERY);
              if (sceneEl) setupScene(sceneEl);
            });
            disposers.push(() => timeline.kill());
          });

          const introChildren = queryAll<HTMLElement>(INTRO_CHILD_QUERY).filter(
            (el) => {
              if (el.dataset.motionDone === "1") return false;
              el.dataset.motionDone = "1";
              return true;
            }
          );
          if (introChildren.length > 0) {
            gsap.fromTo(
              introChildren,
              { opacity: 0, y: INTRO_CHILD_Y },
              {
                opacity: 1,
                y: 0,
                duration: INTRO_CHILD_DURATION,
                stagger: INTRO_CHILD_STAGGER,
                delay: INTRO_CHILD_DELAY,
                ease: INTRO_CHILD_EASE,
              }
            );
          }

          queryAll<HTMLElement>(LINES_QUERY).forEach((el) => {
            if (el.dataset.motionDone === "1") return;
            el.dataset.motionDone = "1";
            const split = new SplitText(el, {
              type: "lines",
              mask: "lines",
              linesClass: "motion-h2-line",
            });
            splits.push({ split, el });
            gsap.set(el, { opacity: 1 });
            trackTrigger(
              gsap.from(split.lines, {
                yPercent: 100,
                duration: LINES_DURATION,
                stagger: LINES_STAGGER,
                ease: LINES_EASE,
                scrollTrigger: {
                  trigger: el,
                  start: REVEAL_START,
                  once: true,
                },
              })
            );
          });

          queryAll<HTMLElement>(REVEAL_QUERY).forEach((el) => {
            if (el.dataset.motionDone === "1") return;
            el.dataset.motionDone = "1";
            trackTrigger(
              gsap.fromTo(
                el,
                { opacity: 0, y: REVEAL_Y },
                {
                  opacity: 1,
                  y: 0,
                  duration: REVEAL_DURATION,
                  ease: REVEAL_EASE,
                  scrollTrigger: {
                    trigger: el,
                    start: REVEAL_START,
                    once: true,
                  },
                }
              )
            );
          });

          queryAll<HTMLElement>(FOOTER_QUERY).forEach((el) => {
            if (el.dataset.motionDone === "1") return;
            el.dataset.motionDone = "1";
            const kids = Array.from(el.children);
            if (kids.length === 0) return;
            trackTrigger(
              gsap.fromTo(
                kids,
                { opacity: 0, y: FOOTER_Y },
                {
                  opacity: 1,
                  y: 0,
                  duration: FOOTER_DURATION,
                  stagger: FOOTER_STAGGER,
                  ease: REVEAL_EASE,
                  scrollTrigger: {
                    trigger: el,
                    start: FOOTER_START,
                    once: true,
                  },
                }
              )
            );
          });

          // ── Parallax ─────────────────────────────────────────────────────
          // Depth comes from two cheap, compositor-friendly sources:
          //   1. scroll  — each layer moves at its own speed (scrub)
          //   2. pointer — a single listener feeds ONE rAF loop that writes
          //                translate3d() to a few layers (no React state, no
          //                layout properties, transform only).
          queryAll<HTMLElement>(PARALLAX_QUERY).forEach((el) => {
            if (el.dataset.motionDone === "1") return;
            el.dataset.motionDone = "1";
            const depth = Number(el.dataset.motionDepth ?? "1") || 1;
            const scrollRange = PARALLAX_Y * depth;
            trackTrigger(
              gsap.fromTo(
                el,
                { y: 0 },
                {
                  y: scrollRange,
                  ease: "none",
                  immediateRender: false,
                  scrollTrigger: {
                    trigger: el,
                    start: PARALLAX_START,
                    end: PARALLAX_END,
                    scrub: SCENE_SMOOTH,
                  },
                }
              )
            );
          });

          // Pointer parallax: one passive listener, one rAF loop, transform-only.
          const pointerLayers = queryAll<HTMLElement>(PARALLAX_POINTER_QUERY).filter(
            (el) => !el.dataset.motionPointerReady
          );
          if (pointerLayers.length > 0 && !noHover) {
            pointerLayers.forEach((el) => (el.dataset.motionPointerReady = "1"));

            const state = {
              targetX: 0,
              targetY: 0,
              currentX: 0,
              currentY: 0,
              running: false,
              frame: 0,
            };

            const onPointerMove = (event: MouseEvent) => {
              // Normalised offset from viewport centre, clamped to [-1, 1].
              const w = window.innerWidth || 1;
              const h = window.innerHeight || 1;
              state.targetX = clamp(((event.clientX - w / 2) / (w / 2)), -1, 1);
              state.targetY = clamp(((event.clientY - h / 2) / (h / 2)), -1, 1);
              if (!state.running) {
                state.running = true;
                state.frame = requestAnimationFrame(tick);
              }
            };

            const tick = () => {
              // Critically damped-ish follow; stops when settled to save CPU.
              state.currentX += (state.targetX - state.currentX) * PARALLAX_POINTER_LERP;
              state.currentY += (state.targetY - state.currentY) * PARALLAX_POINTER_LERP;

              for (const el of pointerLayers) {
                const strength = Number(el.dataset.motionDepth ?? "1") || 1;
                const tx = state.currentX * PARALLAX_POINTER_MAX * strength;
                const ty = state.currentY * PARALLAX_POINTER_MAX * strength;
                el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`;
              }

              const settled =
                Math.abs(state.targetX - state.currentX) < 0.001 &&
                Math.abs(state.targetY - state.currentY) < 0.001;

              if (settled) {
                state.running = false;
                return;
              }
              state.frame = requestAnimationFrame(tick);
            };

            document.addEventListener("mousemove", onPointerMove, { passive: true });
            disposers.push(() => {
              document.removeEventListener("mousemove", onPointerMove);
              if (state.frame) cancelAnimationFrame(state.frame);
              for (const el of pointerLayers) {
                el.style.transform = "";
                delete el.dataset.motionPointerReady;
              }
            });
          }

          if (noHover) return;

          queryAll<HTMLElement>(MAGNETIC_QUERY).forEach((el) => {
            if (el.dataset.motionMagnetic === "1") return;
            el.dataset.motionMagnetic = "1";
            const xTo = gsap.quickTo(el, "x", {
              duration: MAGNETIC_DURATION,
              ease: MAGNETIC_EASE,
            });
            const yTo = gsap.quickTo(el, "y", {
              duration: MAGNETIC_DURATION,
              ease: MAGNETIC_EASE,
            });
            const onMove = (event: MouseEvent) => {
              const rect = el.getBoundingClientRect();
              const dx = event.clientX - (rect.left + rect.width / 2);
              const dy = event.clientY - (rect.top + rect.height / 2);
              xTo(clamp(dx * MAGNETIC_TRACKING, -MAGNETIC_MAX, MAGNETIC_MAX));
              yTo(clamp(dy * MAGNETIC_TRACKING, -MAGNETIC_MAX, MAGNETIC_MAX));
            };
            const onLeave = () => {
              xTo(0);
              yTo(0);
            };
            el.addEventListener("mousemove", onMove);
            el.addEventListener("mouseleave", onLeave);
            disposers.push(() => {
              el.removeEventListener("mousemove", onMove);
              el.removeEventListener("mouseleave", onLeave);
              gsap.killTweensOf(el);
            });
          });
        };

        // ── Smooth scrolling (Lenis) ──────────────────────────────────────
        // Lenis drives the **window** scroll and calls preventDefault() on wheel
        // events. The application shell (all sidebar pages) scrolls inside its
        // own `#main-content` container, so it never reaches this code (see the
        // early return above) and keeps native scrolling. Lenis therefore only
        // runs on pages that actually scroll the document (the landing/intro).
        const lenis = new Lenis({ lerp: LENIS_LERP });
        const onLenisScroll = () => {
          ScrollTrigger.update();
        };
        const lenisRaf = (time: number) => {
          lenis.raf(time * 1000);
        };
        lenis.on("scroll", onLenisScroll);
        gsap.ticker.add(lenisRaf);
        gsap.ticker.lagSmoothing(0);
        disposers.push(() => {
          gsap.ticker.remove(lenisRaf);
          lenis.off("scroll", onLenisScroll);
          lenis.destroy();
        });

        if (!noHover) {
          // NOTE: A custom cursor ("motion-cursor") used to be created here. It hid
          // the native cursor (`cursor: none`) and rendered a blend-mode dot that
          // appeared as a sluggish black dot on some machines/browsers. The native
          // browser cursor is now always used — no custom cursor is created.
        }

        scan();

        let mutationTimer: ReturnType<typeof setTimeout> | null = null;
        const observer = new MutationObserver(() => {
          if (mutationTimer) clearTimeout(mutationTimer);
          mutationTimer = setTimeout(() => {
            if (disposed) return;
            prune();
            scan();
            ScrollTrigger.refresh();
          }, MUTATION_DEBOUNCE);
        });
        observer.observe(document.body, { childList: true, subtree: true });

        teardown = () => {
          if (mutationTimer) clearTimeout(mutationTimer);
          observer.disconnect();
          disposers.forEach((dispose) => dispose());
          disposers.length = 0;
          splits.forEach(({ split }) => split.revert());
          splits.length = 0;
          triggers.forEach((trigger) => trigger.kill());
          triggers.length = 0;
          if (scene.trigger) {
            scene.trigger.kill();
            scene = { el: null, trigger: null };
          }
          queryAll<HTMLElement>(LABELLED_QUERY).forEach((el) => {
            gsap.killTweensOf(el);
            Array.from(el.children).forEach((child) => {
              gsap.killTweensOf(child);
            });
            delete el.dataset.motionDone;
            delete el.dataset.motionMagnetic;
          });
        };
      } catch {
        teardown();
        failVisible();
      }
    })();

    return () => {
      disposed = true;
      teardown();
    };
  }, [pathname]);

  return null;
}
