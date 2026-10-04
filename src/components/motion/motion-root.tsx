"use client";

import { useEffect } from "react";
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

const CURSOR_HOVER_SCALE = 4;
const CURSOR_LERP = 0.15;
const CURSOR_FADE_DURATION = 0.2;
const CURSOR_HOVER_DURATION = 0.3;
const CURSOR_HOVER_TARGETS =
  "a,button,[role='button'],input,textarea,select,label,summary";

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
const MAGNETIC_QUERY = "[data-motion-magnetic]";
const LABELLED_QUERY = [
  HEADLINE_QUERY,
  SCENE_QUERY,
  LINES_QUERY,
  INTRO_CHILD_QUERY,
  REVEAL_QUERY,
  FOOTER_QUERY,
  PARALLAX_QUERY,
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

    docEl.classList.add("motion-primed");

    let disposed = false;
    let teardown: () => void = () => {};
    const splits: Array<{ split: SplitLike; el: HTMLElement }> = [];

    const failVisible = () => {
      docEl.classList.remove("motion-primed", "motion-cursor-on");
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

          queryAll<HTMLElement>(PARALLAX_QUERY).forEach((el) => {
            if (el.dataset.motionDone === "1") return;
            el.dataset.motionDone = "1";
            trackTrigger(
              gsap.fromTo(
                el,
                { y: 0 },
                {
                  y: PARALLAX_Y,
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
          const cursorEl = document.createElement("div");
          cursorEl.className = "motion-cursor";
          cursorEl.setAttribute("aria-hidden", "true");
          document.body.appendChild(cursorEl);
          docEl.classList.add("motion-cursor-on");

          let targetX = window.innerWidth / 2;
          let targetY = window.innerHeight / 2;
          let posX = targetX;
          let posY = targetY;
          let visible = false;

          const onMove = (event: MouseEvent) => {
            targetX = event.clientX;
            targetY = event.clientY;
            if (!visible) {
              visible = true;
              posX = targetX;
              posY = targetY;
              gsap.to(cursorEl, {
                opacity: 1,
                duration: CURSOR_FADE_DURATION,
                overwrite: "auto",
              });
            }
          };
          const onLeave = () => {
            visible = false;
            gsap.to(cursorEl, {
              opacity: 0,
              duration: CURSOR_FADE_DURATION,
              overwrite: "auto",
            });
          };
          const onOver = (event: MouseEvent) => {
            const target = event.target as Element | null;
            const hit = target?.closest?.(CURSOR_HOVER_TARGETS);
            gsap.to(cursorEl, {
              scale: hit ? CURSOR_HOVER_SCALE : 1,
              duration: CURSOR_HOVER_DURATION,
              ease: "power3.out",
              overwrite: "auto",
            });
          };
          const cursorTick = () => {
            posX += (targetX - posX) * CURSOR_LERP;
            posY += (targetY - posY) * CURSOR_LERP;
            gsap.set(cursorEl, { x: posX, y: posY, xPercent: -50, yPercent: -50 });
          };

          document.addEventListener("mousemove", onMove, { passive: true });
          document.addEventListener("mouseleave", onLeave);
          document.addEventListener("mouseover", onOver, { passive: true });
          gsap.ticker.add(cursorTick);

          disposers.push(() => {
            gsap.ticker.remove(cursorTick);
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseleave", onLeave);
            document.removeEventListener("mouseover", onOver);
            gsap.killTweensOf(cursorEl);
            cursorEl.remove();
            docEl.classList.remove("motion-cursor-on");
          });
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
  }, []);

  return null;
}
