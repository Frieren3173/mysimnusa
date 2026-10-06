/* =====================================================================
 * scroll-story.js — MYSIMNUSA landing cinematic sections (vanilla JS)
 * ---------------------------------------------------------------------
 * One rAF loop drives all three sticky video sections:
 *   #hero            → sequential hero reveal (badge → title → … → card)
 *   #sumber-data     → 3 text scenes over video-2
 *   #mutu-pelayanaan → 3 text scenes over video-3
 *
 * Per scene section:
 *   • progress (0→1) from getBoundingClientRect
 *   • each scene emerges from below (opacity 0→1, translateY 60→0, blur 10→0)
 *     and departs upward (opacity 1→0, translateY 0→-60, blur 0→10), with a
 *     small overlap so they flow.
 *   • the big line reveals word-by-word (stagger) via a mask slide-up.
 *   • video parallax is the slowest (scale 1.1, translateY ±8%); label/line
 *     move faster (data-speed).
 *   • overlay tone shifts per scene (navy → blue → teal) with ±1s easing.
 *   • a "01 / 03" counter + vertical ticks show the active scene.
 *   • sections crossfade: the outgoing video dims + thickens its overlay while
 *     the incoming video fades in from dark.
 *
 * Only transform / opacity / filter are written. honours prefers-reduced-motion.
 * Videos pause when off-screen (IntersectionObserver).
 * ===================================================================== */
(function () {
  "use strict";

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isMobile = window.matchMedia && window.matchMedia("(max-width: 640px)").matches;

  var sections = Array.prototype.slice.call(document.querySelectorAll("[data-story]"));
  if (sections.length === 0) return;

  document.documentElement.classList.add("story-js");

  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var range = function (v, a, b) { return b === a ? (v >= b ? 1 : 0) : clamp01((v - a) / (b - a)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var pad2 = function (n) { return (n < 10 ? "0" : "") + n; };

  // Split a line into word spans ONCE so we can stagger them (mask slide-up).
  function splitWords(el) {
    if (el.dataset.split === "1") return Array.prototype.slice.call(el.querySelectorAll("[data-word]"));
    var words = (el.textContent || "").trim().split(/\s+/);
    el.textContent = "";
    var spans = [];
    for (var i = 0; i < words.length; i++) {
      var outer = document.createElement("span");
      outer.className = "story-word-mask";
      var inner = document.createElement("span");
      inner.className = "story-word";
      inner.setAttribute("data-word", "");
      inner.textContent = words[i];
      outer.appendChild(inner);
      el.appendChild(outer);
      if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
      spans.push(inner);
    }
    el.dataset.split = "1";
    return spans;
  }

  // Precompute state.
  var state = sections.map(function (sec, index) {
    var video = sec.querySelector(".story__video");
    var overlay = sec.querySelector(".story__overlay");
    var heroSteps = Array.prototype.slice.call(sec.querySelectorAll("[data-hero-step]"));
    var heroItems = Array.prototype.slice.call(sec.querySelectorAll("[data-hero-item]"));
    var sceneEls = Array.prototype.slice.call(sec.querySelectorAll("[data-scene]"));
    var sceneLines = Array.prototype.slice.call(sec.querySelectorAll("[data-scene-line]"));
    var wordsByIdx = sceneLines.map(function (l) { return splitWords(l); });
    var progress = sec.querySelector(".story__progress");
    var counterEl = sec.querySelector("[data-scene-current]");
    var ticks = Array.prototype.slice.call(sec.querySelectorAll("[data-scene-tick]"));
    var parallax = Array.prototype.slice.call(sec.querySelectorAll("[data-parallax]"));
    return {
      index: index,
      el: sec,
      isScene: sec.hasAttribute("data-scene-section"),
      video: video,
      overlay: overlay,
      overlayTone: overlay ? overlay.getAttribute("data-overlay-tone") : null,
      heroSteps: heroSteps,
      heroItems: heroItems,
      scenes: sceneEls,
      words: wordsByIdx,
      progress: progress,
      counterEl: counterEl,
      ticks: ticks,
      parallax: parallax.map(function (p) {
        return { el: p, speed: parseFloat(p.getAttribute("data-speed")) || 1 };
      }),
      activeScene: -1,
      visible: false
    };
  });

  // Overlay colour per scene (RGB triplets; JS morphs between them).
  var TONES = {
    navy: [[2, 14, 40], [2, 6, 23], [3, 20, 48]],
    blue: [[3, 22, 52], [8, 40, 86], [3, 16, 40]],
    teal: [[2, 26, 34], [7, 46, 52], [2, 14, 18]]
  };
  var MOBILE_PARALLAX = isMobile ? 0.45 : 1; // reduce parallax on small screens

  /* ── Reduced motion: reveal everything, no parallax, keep the videos ── */
  if (reduceMotion) {
    state.forEach(function (s) {
      if (s.video) s.video.style.opacity = "1";
      s.heroSteps.concat(s.heroItems).forEach(function (el) {
        el.style.opacity = "1"; el.style.transform = "none"; el.style.filter = "none";
      });
      s.scenes.forEach(function (el) {
        el.style.opacity = "1"; el.style.transform = "none"; el.style.filter = "none";
      });
      s.words.forEach(function (ws) {
        ws.forEach(function (w) { w.style.transform = "none"; w.style.opacity = "1"; });
      });
    });
    observeVideos();
    return;
  }

  /* ── Hero reveal (sequential, stays visible) ─────────────────────── */
  function renderHero(s, progress) {
    var ordered = s.heroSteps.concat(s.heroItems);
    var n = ordered.length || 1;
    ordered.forEach(function (el, i) {
      var start = (i / n) * 0.7;
      var end = Math.min(start + 0.3, 0.88);
      var t = range(progress, start, end);
      el.style.opacity = t.toFixed(3);
      el.style.transform = "translateY(" + lerp(40, 0, t).toFixed(2) + "px)";
      el.style.filter = t < 0.99 ? "blur(" + lerp(8, 0, t).toFixed(2) + "px)" : "none";
    });
    s.parallax.forEach(function (p) {
      var shift = (progress - 0.5) * 70 * (p.speed - 1) * MOBILE_PARALLAX;
      p.el.style.transform = "translateY(" + shift.toFixed(2) + "px)";
    });
    renderVideo(s, progress);
  }

  /* ── Scene sections (in/out + word stagger + counter) ────────────── */
  function renderScenes(s, progress) {
    var n = s.scenes.length || 1;
    // Each scene occupies an equal slice of the track.
    var slice = 1 / n;
    // In-window: enter over the first 60% of its slice; out over the last 25%.
    s.scenes.forEach(function (el, i) {
      var sStart = i * slice;
      var enter = range(progress, sStart, sStart + slice * 0.6);
      var leave = i < n - 1 ? range(progress, sStart + slice * 0.78, sStart + slice) : 0;
      var opacity = enter * (1 - leave);
      var y = lerp(60, 0, enter) + lerp(0, -60, leave);
      var blur = lerp(10, 0, enter) + lerp(0, 10, leave);
      el.style.opacity = opacity.toFixed(3);
      el.style.transform = "translateY(" + y.toFixed(2) + "px)";
      el.style.filter = blur > 0.02 ? "blur(" + blur.toFixed(2) + "px)" : "none";

      // Word-by-word mask slide-up (stagger 70ms equivalent across 0.5 window).
      var words = s.words[i] || [];
      var wcount = words.length || 1;
      words.forEach(function (w, wi) {
        var wt = range(enter, (wi / wcount) * 0.55, (wi / wcount) * 0.55 + 0.45);
        w.style.transform = "translateY(" + (100 * (1 - wt)).toFixed(1) + "%)";
        w.style.opacity = wt.toFixed(3);
      });

      // Active-scene tracking for counter/ticks.
      if (opacity > 0.5 && s.activeScene !== i) s.activeScene = i;
    });

    // Global parallax on tagged elements (label/line move slightly).
    s.parallax.forEach(function (p) {
      var shift = (progress - 0.5) * 90 * (p.speed - 1) * MOBILE_PARALLAX;
      p.el.style.transform = "translateY(" + shift.toFixed(2) + "px)";
    });

    // Counter + ticks.
    if (s.counterEl) s.counterEl.textContent = pad2((s.activeScene < 0 ? 0 : s.activeScene) + 1);
    s.ticks.forEach(function (tk, i) {
      tk.classList.toggle("is-active", i === s.activeScene);
    });

    renderVideo(s, progress);
  }

  /* ── Video parallax + overlay tone + section crossfade ───────────── */
  function renderVideo(s, progress) {
    if (!s.video) return;
    var vShift = (progress - 0.5) * 8 * MOBILE_PARALLAX; // ±4% (8% total)
    var vScale = 1.1;
    var vOpacity = 1;
    var isLast = s.index === state.length - 1;

    // Fade OUT over the last 15% of a (non-last) section.
    if (progress > 0.85 && !isLast) vOpacity = lerp(1, 0.3, range(progress, 0.85, 1));
    // Fade IN from dark over the first 15% of a (non-first) section.
    if (s.index > 0 && progress < 0.15) {
      var g = range(progress, 0, 0.15);
      vOpacity = lerp(0.3, 1, g);
      vScale = lerp(1.15, 1.1, g);
    }
    s.video.style.opacity = vOpacity.toFixed(3);
    s.video.style.transform =
      "translateY(" + vShift.toFixed(2) + "%) scale(" + vScale.toFixed(3) + ")";

    // Overlay: base opacity + per-scene tone morph.
    if (s.overlay) {
      var extra = 0;
      if (progress > 0.85 && !isLast) extra = lerp(0, 0.35, range(progress, 0.85, 1));
      if (s.index > 0 && progress < 0.15) extra = lerp(0.35, 0, range(progress, 0, 0.15));
      s.overlay.style.opacity = (1 + extra).toFixed(3);

      // Scene-driven tone (scene sections only).
      if (s.isScene) {
        var palette = TONES[s.overlayTone] || TONES.navy;
        var n = s.scenes.length || 1;
        var pos = clamp01(progress) * n; // 0..n
        var i0 = Math.min(n - 1, Math.floor(pos));
        var frac = clamp01(pos - i0);
        var base = palette[0];
        var a = palette[Math.min(i0, palette.length - 1)];
        var b = palette[Math.min(i0 + 1, palette.length - 1)];
        // Blend between consecutive scene tints for a smooth ±1s feel.
        var col = [lerp(a[0], b[0], frac), lerp(a[1], b[1], frac), lerp(a[2], b[2], frac)];
        s.overlay.style.background =
          "linear-gradient(180deg, rgba(" + Math.round(col[0]) + "," + Math.round(col[1]) + "," + Math.round(col[2]) + ",0.66) 0%, " +
          "rgba(" + Math.round(lerp(a[0], b[0], frac)) + "," + Math.round(lerp(a[1], b[1], frac)) + "," + Math.round(lerp(a[2], b[2], frac)) + ",0.5) 45%, " +
          "rgba(" + Math.round(base[0]) + "," + Math.round(base[1]) + "," + Math.round(base[2]) + ",0.7) 100%)";
      }
    }

    // Progress marker visibility.
    if (s.progress) s.progress.classList.toggle("is-visible", s.visible);
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
      if (s.isScene) renderScenes(s, progress);
      else renderHero(s, progress);
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

  /* ── Video play/pause via IntersectionObserver ───────────────────── */
  function observeVideos() {
    if (!("IntersectionObserver" in window)) {
      state.forEach(function (s) { if (s.video) s.video.play().catch(function () {}); });
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var s = state.find(function (x) { return x.el === entry.target; });
          if (!s) return;
          s.visible = entry.isIntersecting;
          if (s.video) {
            if (entry.isIntersecting) s.video.play().catch(function () {});
            else { try { s.video.pause(); } catch (err) { void err; } }
          }
          if (s.progress) s.progress.classList.toggle("is-visible", entry.isIntersecting);
        });
      },
      { rootMargin: "10% 0px 10% 0px", threshold: 0.01 }
    );
    state.forEach(function (s) { io.observe(s.el); });
  }
  observeVideos();

  compute();
})();
