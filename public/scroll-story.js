/* =====================================================================
 * scroll-story.js — MYSIMNUSA landing cinematic sections (vanilla JS)
 * ---------------------------------------------------------------------
 * Drives the TWO EXISTING landing sections (no new sections):
 *   #hero  (.story-hero)  → video-1 background + sequential hero reveal
 *   #modul (.story-modul) → video-2 background + staggered module reveal
 *
 * Per section:
 *   • progress (0→1) from getBoundingClientRect + requestAnimationFrame
 *   • each [data-hero-step] reveals in ORDER (opacity 0→1, translateY 40→0,
 *     blur 8→0) and STAYS visible (so buttons stay clickable — no fade-out)
 *   • parallax: video slower (translateY ±10%, scale 1.1); [data-parallax]
 *     elements slightly faster with their own data-speed
 *   • crossfade: hero video fades + overlay thickens at its end; module video
 *     fades in from dark at its start
 *   • IntersectionObserver pauses off-screen videos (perf)
 *
 * Only transform / opacity / filter are written. Honours prefers-reduced-motion.
 * ===================================================================== */
(function () {
  "use strict";

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var sections = Array.prototype.slice.call(document.querySelectorAll("[data-story]"));
  if (sections.length === 0) return;

  // Enable the JS-driven hidden state only once JS is confirmed running.
  document.documentElement.classList.add("story-js");

  var clamp01 = function (v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  };
  var range = function (v, a, b) {
    if (b === a) return v >= b ? 1 : 0;
    return clamp01((v - a) / (b - a));
  };
  var lerp = function (a, b, t) {
    return a + (b - a) * t;
  };
  // Reveal windows: element i is fully in by `in[i]`; its neighbors trail it.
  // The LAST element has no "out" — everything stays visible to the end.
  function revealAt(i, n) {
    // Distribute the "enter" anchors across the first ~70% of the track.
    var span = 0.7;
    var start = (i / n) * span;
    var end = start + Math.min(0.28, span / Math.max(n, 1) + 0.16);
    return { a: start, b: Math.min(end, 0.86) };
  }

  // Precompute state per section.
  var state = sections.map(function (sec, index) {
    var steps = Array.prototype.slice.call(sec.querySelectorAll("[data-hero-step]"));
    var items = Array.prototype.slice.call(sec.querySelectorAll("[data-hero-item]"));
    var parallax = Array.prototype.slice.call(sec.querySelectorAll("[data-parallax]"));
    var video = sec.querySelector(".story__video");
    var overlay = sec.querySelector(".story__overlay");
    return {
      index: index,
      el: sec,
      steps: steps,
      items: items,
      parallax: parallax.map(function (p) {
        return { el: p, speed: parseFloat(p.getAttribute("data-speed")) || 1 };
      }),
      video: video,
      overlay: overlay,
      visible: false
    };
  });

  /* ── Reduced motion: show everything, no parallax, keep the video ─── */
  if (reduceMotion) {
    state.forEach(function (s) {
      if (s.video) s.video.style.opacity = "1";
      s.steps.concat(s.items).forEach(function (el) {
        el.style.opacity = "1";
        el.style.transform = "none";
        el.style.filter = "none";
      });
    });
    observeVideos();
    return;
  }

  /* ── Render one section at a given progress ───────────────────────── */
  function render(s, progress) {
    // Sequential reveal — steps and capability items share one ordered list.
    var ordered = s.steps.concat(s.items);
    var n = ordered.length || 1;
    ordered.forEach(function (el, i) {
      var w = revealAt(i, n);
      var t = range(progress, w.a, w.b); // 0→1, never reverses back to 0
      // translateY: 40px → 0, blur 8px → 0, opacity 0 → 1
      el.style.opacity = t.toFixed(3);
      el.style.transform = "translateY(" + lerp(40, 0, t).toFixed(2) + "px)";
      el.style.filter = t < 0.99 ? "blur(" + lerp(8, 0, t).toFixed(2) + "px)" : "none";
    });

    // Parallax for tagged elements (text slightly faster than the video).
    s.parallax.forEach(function (p) {
      var shift = (progress - 0.5) * 70 * (p.speed - 1);
      p.el.style.transform = "translateY(" + shift.toFixed(2) + "px)";
    });

    // Video parallax + crossfade.
    if (s.video) {
      var vShift = (progress - 0.5) * 10; // ±5% (10% total)
      var vScale = 1.1;
      var vOpacity = 1;
      var isLast = s.index === state.length - 1;

      // Fade OUT in the last 15% of a (non-last) section.
      if (progress > 0.85 && !isLast) {
        vOpacity = lerp(1, 0.3, range(progress, 0.85, 1));
      }
      // Fade IN from dark in the first 15% of a (non-first) section.
      if (s.index > 0 && progress < 0.15) {
        var g = range(progress, 0, 0.15);
        vOpacity = lerp(0.3, 1, g);
        vScale = lerp(1.15, 1.1, g);
      }

      s.video.style.opacity = vOpacity.toFixed(3);
      s.video.style.transform =
        "translateY(" + vShift.toFixed(2) + "%) scale(" + vScale.toFixed(3) + ")";

      if (s.overlay) {
        var extra = 0;
        if (progress > 0.85 && !isLast) extra = lerp(0, 0.35, range(progress, 0.85, 1));
        if (s.index > 0 && progress < 0.15) extra = lerp(0.35, 0, range(progress, 0, 0.15));
        s.overlay.style.opacity = (1 + extra).toFixed(3);
      }
    }
  }

  /* ── rAF loop ─────────────────────────────────────────────────────── */
  var ticking = false;
  function compute() {
    ticking = false;
    var vh = window.innerHeight;
    state.forEach(function (s) {
      var rect = s.el.getBoundingClientRect();
      var total = rect.height - vh;
      var progress = total > 0 ? clamp01(-rect.top / total) : rect.top <= 0 ? 1 : 0;
      render(s, progress);
    });
  }
  function onScroll() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(compute);
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  /* ── Visibility + video play/pause via IntersectionObserver ───────── */
  function observeVideos() {
    if (!("IntersectionObserver" in window)) {
      state.forEach(function (s) {
        if (s.video) s.video.play().catch(function () {});
      });
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var s = state.find(function (x) {
            return x.el === entry.target;
          });
          if (!s) return;
          s.visible = entry.isIntersecting;
          if (s.video) {
            if (entry.isIntersecting) s.video.play().catch(function () {});
            else {
              try {
                s.video.pause();
              } catch (err) {
                void err;
              }
            }
          }
        });
      },
      { rootMargin: "10% 0px 10% 0px", threshold: 0.01 }
    );
    state.forEach(function (s) {
      io.observe(s.el);
    });
  }
  observeVideos();

  compute();
})();
