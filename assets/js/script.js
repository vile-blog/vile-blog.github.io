(function () {
  "use strict";

  /* ------------------------------------------------------------------
     Theme toggle (dark-first, persisted, respects prefers-color-scheme)
     Note: the *initial* theme is already applied by the inline script
     in <head> to avoid a flash of the wrong theme. This block only
     wires up the toggle button + keeps localStorage in sync.
  ------------------------------------------------------------------ */
  var root = document.documentElement;
  var STORAGE_KEY = "vile-theme";

  /* Updates the toggle button(s) aria-pressed to match a theme, without
     touching localStorage. Kept separate from setTheme() below so the
     initial-load sync (eval Issue 6.1) doesn't also *write* a preference
     the user never chose — that would permanently override the
     prefers-color-scheme fallback on the very first visit. */
  function syncToggleUI(theme) {
    var toggles = document.querySelectorAll("[data-theme-toggle]");
    toggles.forEach(function (btn) {
      btn.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
    });
  }

  function setTheme(theme) {
    root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* localStorage unavailable (e.g. private mode) — theme just won't persist */
    }
    syncToggleUI(theme);
  }

  document.addEventListener("DOMContentLoaded", function () {
    /* Fix for eval Issue 6.1: aria-pressed="false" was hardcoded in the
       markup and only ever updated inside the click handler below. The
       inline <head> script sets data-theme before paint but never touched
       aria-pressed, so a visitor with an OS light preference loaded the
       page in light mode while the toggle announced itself as "not
       pressed" to screen readers. Sync it to whatever theme is actually
       active as soon as the DOM is ready. */
    syncToggleUI(root.getAttribute("data-theme") === "light" ? "light" : "dark");

    var toggleButtons = document.querySelectorAll("[data-theme-toggle]");
    toggleButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var current = root.getAttribute("data-theme") === "light" ? "light" : "dark";
        setTheme(current === "light" ? "dark" : "light");
      });
    });

    /* ------------------------------------------------------------------
       Mobile nav toggle
    ------------------------------------------------------------------ */
    var navToggle = document.querySelector("[data-nav-toggle]");
    var navLinks = document.querySelector("[data-nav-links]");

    if (navToggle && navLinks) {
      navToggle.addEventListener("click", function () {
        var isOpen = navLinks.classList.toggle("is-open");
        navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      });

      navLinks.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", function () {
          navLinks.classList.remove("is-open");
          navToggle.setAttribute("aria-expanded", "false");
        });
      });
    }

    /* ------------------------------------------------------------------
       Scroll-reveal for sections (respects prefers-reduced-motion)
    ------------------------------------------------------------------ */
    var prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    var revealEls = document.querySelectorAll(".reveal");

    if (!prefersReducedMotion && "IntersectionObserver" in window) {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
      );

      revealEls.forEach(function (el) {
        observer.observe(el);
      });
    } else {
      revealEls.forEach(function (el) {
        el.classList.add("is-visible");
      });
    }

    /* ------------------------------------------------------------------
       Footer year
    ------------------------------------------------------------------ */
    var yearEl = document.querySelector("[data-year]");
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  });
})();
