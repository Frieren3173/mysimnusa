/* =====================================================================
 * login-slideshow.js — MYSIMNUSA login page slideshow (vanilla JS)
 * ---------------------------------------------------------------------
 * Cinematic photo background for the LEFT login panel:
 *   • crossfade between slides (1.4s, cubic-bezier(.4,0,.2,1))
 *   • Ken Burns slow zoom 1.00 → 1.06 per slide, with a small drift (≤ ±2%)
 *     direction per slide (via --kb-x/--kb-y CSS vars) and a per-photo focus
 *     point (--focus-x/--focus-y) so faces never clip
 *   • holds each slide ~6s
 *   • first photo (best) stays first; the rest are shuffled once
 *   • first photo is preloaded (HTML <link rel=preload>); the rest load on
 *     idle and are decoded (img.decode()) before they cross-fade in
 *   • pauses while the tab is hidden (visibilitychange)
 *   • respects prefers-reduced-motion (simple fade, no zoom)
 *
 * Only transform / opacity are animated. The photos are decorative.
 * ===================================================================== */
(function () {
  "use strict";

  /* ── Photo list (edit here to add/remove slides) ─────────────────────
   * Each entry: src + optional focus point `focus: "x% y%"` (default 50% 30%).
   * Tune focus for photos whose faces aren't centred (portrait → higher/top). */
  var PHOTOS = [
    { src: "/assets/login/01.webp" }, // large uniformed group
    { src: "/assets/login/02.webp" },
    { src: "/assets/login/03.webp" },
    { src: "/assets/login/04.webp" },
    { src: "/assets/login/05.webp", focus: "50% 35%" },
    { src: "/assets/login/06.webp", focus: "50% 40%" },
    { src: "/assets/login/07.webp" },
    { src: "/assets/login/08.webp" },
    { src: "/assets/login/09.webp" },
    { src: "/assets/login/10.webp" },
    { src: "/assets/login/11.webp", focus: "50% 20%" }, // portrait → focus up
    { src: "/assets/login/12.webp" },
    { src: "/assets/login/13.webp" },
    { src: "/assets/login/14.webp" },
  ];

  var HOLD_MS = 6000; // time each slide is shown
  var FADE_MS = 1400; // crossfade duration

  // Ken Burns drift directions, cycled per slide — kept ≤ ±2% so heads never clip.
  var DRIFTS = [
    { x: "-2%", y: "-1.2%" },
    { x: "2%", y: "1.2%" },
    { x: "-1.5%", y: "1.2%" },
    { x: "1.5%", y: "-1.2%" },
  ];

  var hero = document.querySelector("[data-login-hero]");
  if (!hero || PHOTOS.length === 0) return;

  var stack = hero.querySelector(".hero-slides");
  var dotsWrap = hero.querySelector("[data-hero-dots]");
  if (!stack) return;

  /* ── Order: keep the first (best) photo, shuffle the rest once ─────── */
  var rest = PHOTOS.slice(1);
  for (var i = rest.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = rest[i];
    rest[i] = rest[j];
    rest[j] = tmp;
  }
  var order = [PHOTOS[0]].concat(rest);

  /* ── Build slide elements + dots ───────────────────────────────────── */
  // Remove any static placeholder slide so we fully own the stack.
  Array.prototype.slice.call(stack.querySelectorAll(".slide")).forEach(function (s) {
    s.remove();
  });

  var slides = order.map(function (photo, idx) {
    var el = document.createElement("div");
    el.className = "slide";
    el.setAttribute("data-src", photo.src);
    var drift = DRIFTS[idx % DRIFTS.length];
    el.style.setProperty("--kb-x", drift.x);
    el.style.setProperty("--kb-y", drift.y);
    el.style.setProperty("--slide-hold", HOLD_MS + "ms");
    el.style.setProperty("--slide-fade", FADE_MS + "ms");
    // Per-photo focus point (default 50% 30%).
    if (photo.focus) {
      var parts = photo.focus.split(/\s+/);
      el.style.setProperty("--focus-x", parts[0] || "50%");
      el.style.setProperty("--focus-y", parts[1] || "30%");
    }
    stack.appendChild(el);
    return el;
  });

  var dots = [];
  if (dotsWrap) {
    dots = slides.map(function () {
      var d = document.createElement("span");
      d.className = "dot";
      dotsWrap.appendChild(d);
      return d;
    });
  }

  /* ── Loading + decode ──────────────────────────────────────────────── */
  var loaded = new Array(slides.length).fill(false);
  var failed = new Array(slides.length).fill(false);

  function loadSlide(idx) {
    if (loaded[idx]) return Promise.resolve(loaded[idx] === "ok" ? "ok" : "fail");
    var el = slides[idx];
    var src = el.getAttribute("data-src");
    return new Promise(function (resolve) {
      var img = new Image();
      img.decoding = "async";
      var done = function (ok) {
        loaded[idx] = ok ? "ok" : "fail";
        if (!ok) failed[idx] = true;
        if (ok) {
          if (typeof img.decode === "function") {
            img.decode().catch(function () {}).finally(function () {
              el.style.backgroundImage = "url(" + src + ")";
              resolve("ok");
            });
          } else {
            el.style.backgroundImage = "url(" + src + ")";
            resolve("ok");
          }
        } else {
          resolve("fail");
        }
      };
      img.onload = function () { done(true); };
      img.onerror = function () { done(false); };
      img.src = src;
    });
  }

  // Preload the remaining photos when the browser is idle (never blocks form).
  var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 300); };
  order.forEach(function (_src, idx) {
    idle(function () { loadSlide(idx); });
  });

  /* ── Slideshow loop ────────────────────────────────────────────────── */
  var current = -1;
  var timer = null;

  function show(idx) {
    if (idx === current) return;
    slides.forEach(function (el, i) {
      var active = i === idx;
      el.classList.toggle("is-active", active);
      if (active) {
        // Replay the Ken Burns animation from the start for this slide.
        el.style.animation = "none";
        void el.offsetWidth; // force reflow
        el.style.animation = "";
      }
    });
    dots.forEach(function (d, i) { d.classList.toggle("is-active", i === idx); });
    current = idx;
  }

  function nextSlide() {
    if (slides.length === 1) return 0;
    return (current + 1) % slides.length;
  }

  function advance() {
    var n = nextSlide();
    var attempts = 0;
    (function tryShow() {
      loadSlide(n).then(function (status) {
        if (status === "fail" && attempts < slides.length) {
          attempts++;
          n = (n + 1) % slides.length;
          tryShow();
          return;
        }
        show(n);
      });
    })();
  }

  function start() {
    if (timer) return;
    if (current < 0) show(0);
    timer = setInterval(advance, HOLD_MS);
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  // Pause while the tab is not visible.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else start();
  });

  document.documentElement.classList.add("login-slides-ready");
  start();
})();
