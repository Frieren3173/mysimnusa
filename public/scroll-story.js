/* =====================================================================
 * scroll-story.js — MYSIMNUSA landing cinematic scroll sections
 * ---------------------------------------------------------------------
 * Vanilla JS (no framework). Drives the two `.story` sections:
 *   • progress (0→1) per section via getBoundingClientRect + rAF
 *   • text reveal: 3 stacked items per section, cross-faded with blur
 *   • parallax: video slower than scroll, text slightly faster (data-speed)
 *   • crossfade between section 1 and 2 (last 15% / first 15%)
 *   • progress dots (right edge) fade in/out and mark the active item
 *   • IntersectionObserver pauses off-screen videos (perf)
 *
 * Only transform / opacity / filter are written. Honours
 * prefers-reduced-motion by showing everything immediately with no parallax.
 * ===================================================================== */
(function () {
  "use strict";

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var sections = Array.prototype.slice.call(document.querySelectorAll(".story"));
  if (sections.length === 0) return;

  // Per-item progress thresholds (relative to the section's 0→1 progress).
  // Item i is fully visible around its band; items cross-fade into each other.
  var REVEAL_RANGES = [
    { in: [0.04, 0.2], out: [0.36, 0.5] },
    { in: [0.38, 0.54], out: [0.68, 0.8] },
    { in: [0.7, 0.84], out: [1.0, 1.0] }, // last item stays until the end
  ];

  var clamp01 = function (v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  };
  // Map v from [a,b] to [0,1].
  var range = function (v, a, b) {
    if (b === a) return v >= b ? 1 : 0;
    return clamp01((v - a) / (b - a));
  };
  var lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  // Precompute per-section state.
  var state = sections.map(function (sec, index) {
    var items = Array.prototype.slice.call(sec.querySelectorAll(".story__item"));
    var video = sec.querySelector(".story__video");
    var overlay = sec.querySelector(".story__overlay");
    var dotsWrap = sec.querySelector(".story__dots");
    var dots = dotsWrap
      ? Array.prototype.slice.call(dotsWrap.querySelectorAll(".story__dot"))
      : [];
    return {
      index: index,
      el: sec,
      items: items,
      tight: items.map(function (it) {
        return {
          el: it,
          speed: parseFloat(it.getAttribute("data-speed")) || 1
        };
      }),
      video: video,
      overlay: overlay,
      dotsWrap: dotsWrap,
      dots: dots,
      visible: false,
      progress: 0
    };
  });

  /* ── Reduced motion: show everything, disable parallax, keep video ── */
  if (reduceMotion) {
    state.forEach(function (s) {
      if (s.video) s.video.style.opacity = "1";
      s.items.forEach(function (it) {
        it.style.opacity = "1";
        it.style.transform = "none";
        it.style.filter = "none";
      });
      if (s.dotsWrap) s.dotsWrap.style.display = "none";
    });
    // Still lazy-play/pause via IntersectionObserver for performance.
    observeVideos();
    return;
  }

  /* ── Render one section at a given progress ───────────────────────── */
  function renderSection(s, progress) {
    s.progress = progress;

    // Progress dots
    if (s.dotsWrap) {
      s.dotsWrap.classList.toggle("is-visible", s.visible);
    }

    // Text items: cross-fade with blur + translateY.
    var activeIdx = -1;
    s.tight.forEach(function (t, i) {
      var r = REVEAL_RANGES[i] || REVEAL_RANGES[REVEAL_RANGES.length - 1];
      var enter = range(progress, r.in[0], r.in[1]); // 0→1 as it arrives
      var leave = range(progress, r.out[0], r.out[1]); // 0→1 as it departs

      // opacity: ramp in, then out.
      var opacity = enter * (1 - leave);
      // translateY: +40px → 0 on enter; 0 → -40px on leave.
      var y = lerp(40, 0, enter) + lerp(0, -40, leave);
      // blur: 8px → 0 on enter; 0 → 6px on leave.
      var blur = lerp(8, 0, enter) + lerp(0, 6, leave);

      // Subtle per-item parallax (faster than the video).
      if (t.speed !== 1) {
        y += (progress - 0.5) * 60 * (t.speed - 1);
      }

      t.el.style.opacity = opacity.toFixed(3);
      t.el.style.transform = "translateY(" + y.toFixed(2) + "px)";
      t.el.style.filter = blur > 0.02 ? "blur(" + blur.toFixed(2) + "px)" : "none";

      if (opacity > 0.55 && activeIdx === -1) activeIdx = i;
    });

    // Mark active dot
    s.dots.forEach(function (d, i) {
      d.classList.toggle("is-active", i === activeIdx);
    });

    // Video parallax + opacity (base). Video moves slower than scroll.
    if (s.video) {
      var vShift = (progress - 0.5) * 10; // ±5% translate (10% total range)
      var vScale = 1.1;
      var vOpacity = 1;

      // Crossfade OUT: in the last 15% of a (non-last) section, the video
      // fades and the overlay thickens.
      var isLast = s.index === state.length - 1;
      if (progress > 0.85 && !isLast) {
        var f = range(progress, 0.85, 1);
        vOpacity = lerp(1, 0.3, f);
      }
      // Crossfade IN: first 15% of section 2 fades from dark + scale down.
      if (s.index > 0 && progress < 0.15) {
        var g = range(progress, 0, 0.15);
        vOpacity = lerp(0.3, 1, g);
        vScale = lerp(1.15, 1.1, g);
      }

      s.video.style.opacity = vOpacity.toFixed(3);
      s.video.style.transform =
        "translateY(" + vShift.toFixed(2) + "%) scale(" + vScale.toFixed(3) + ")";

      // Overlay thickening during the crossfade out.
      if (s.overlay) {
        var base = 0.0;
        if (progress > 0.85 && !isLast) base = lerp(0, 0.35, range(progress, 0.85, 1));
        if (s.index > 0 && progress < 0.15) base = lerp(0.4, 0, range(progress, 0, 0.15));
        s.overlay.style.opacity = (1 + base).toFixed(3);
      }
    }
  }

  /* ── rAF loop: compute progress for each section ───────────────────── */
  var ticking = false;
  function compute() {
    ticking = false;
    var vh = window.innerHeight;

    state.forEach(function (s) {
      var rect = s.el.getBoundingClientRect();
      // Progress across the section's scroll track (tall = 300vh).
      var total = rect.height - vh;
      var progress = total > 0 ? clamp01(-rect.top / total) : rect.top <= 0 ? 1 : 0;
      renderSection(s, progress);
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

  /* ── Visibility (dots) + video play/pause via IntersectionObserver ── */
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
            if (entry.isIntersecting) {
              s.video.play().catch(function () {});
            } else {
              try {
                s.video.pause();
              } catch (_err) {
                void _err;
              }
            }
          }
          if (s.dotsWrap) s.dotsWrap.classList.toggle("is-visible", entry.isIntersecting);
        });
      },
      { rootMargin: "10% 0px 10% 0px", threshold: 0.01 }
    );
    state.forEach(function (s) {
      io.observe(s.el);
    });
  }
  observeVideos();

  // Kick off first paint.
  compute();
})();
