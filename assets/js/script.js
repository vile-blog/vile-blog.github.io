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
    updateGiscusConfig({ theme: theme });
  }

  /* ------------------------------------------------------------------
     Language toggle (EN/VI, persisted, defaults from navigator.language)
     Same pattern as the theme toggle: the inline <head> script already
     applied the initial data-lang before paint; this just wires up the
     button and keeps localStorage in sync.
  ------------------------------------------------------------------ */
  var LANG_STORAGE_KEY = "vile-lang";

  function syncLangToggleUI(lang) {
    var toggles = document.querySelectorAll("[data-lang-toggle]");
    toggles.forEach(function (btn) {
      btn.setAttribute("aria-pressed", lang === "vi" ? "true" : "false");
    });
  }

  function setLang(lang) {
    root.setAttribute("data-lang", lang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch (e) {
      /* localStorage unavailable — language choice just won't persist */
    }
    syncLangToggleUI(lang);
    updateGiscusConfig({ lang: lang });
  }

  /* ------------------------------------------------------------------
     Giscus (comments) — lives in its own iframe, so theme/lang changes
     after it has loaded require posting a message into it rather than
     just re-rendering our own markup. Safe to call even when no giscus
     iframe exists on the current page (e.g. non-post pages).
  ------------------------------------------------------------------ */
  function updateGiscusConfig(config) {
    var frame = document.querySelector("iframe.giscus-frame");
    if (!frame || !frame.contentWindow) {
      return;
    }
    frame.contentWindow.postMessage({ giscus: { setConfig: config } }, "https://giscus.app");
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

    syncLangToggleUI(root.getAttribute("data-lang") === "vi" ? "vi" : "en");

    var langToggleButtons = document.querySelectorAll("[data-lang-toggle]");
    langToggleButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var current = root.getAttribute("data-lang") === "vi" ? "vi" : "en";
        setLang(current === "vi" ? "en" : "vi");
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

    /* ------------------------------------------------------------------
       Hero mouse-follow spotlight (skipped for reduced motion / touch —
       mousemove never fires there anyway, so this is a no-op cost).
    ------------------------------------------------------------------ */
    var hero = document.querySelector(".hero");
    if (hero && !prefersReducedMotion) {
      hero.addEventListener("mousemove", function (e) {
        var rect = hero.getBoundingClientRect();
        var x = ((e.clientX - rect.left) / rect.width) * 100;
        var y = ((e.clientY - rect.top) / rect.height) * 100;
        hero.style.setProperty("--spot-x", x + "%");
        hero.style.setProperty("--spot-y", y + "%");
      });
    }

    /* ------------------------------------------------------------------
       Project card tilt-on-hover (mouse-capable pointers only; touch
       devices keep the plain CSS :hover lift instead)
    ------------------------------------------------------------------ */
    var canHoverPrecisely =
      window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    if (canHoverPrecisely && !prefersReducedMotion) {
      document.querySelectorAll(".project-card").forEach(function (card) {
        card.addEventListener("mousemove", function (e) {
          var rect = card.getBoundingClientRect();
          var px = (e.clientX - rect.left) / rect.width - 0.5;
          var py = (e.clientY - rect.top) / rect.height - 0.5;
          var rotateX = (py * -6).toFixed(2);
          var rotateY = (px * 6).toFixed(2);
          card.style.transform =
            "perspective(600px) translateY(-6px) rotateX(" + rotateX + "deg) rotateY(" + rotateY + "deg)";
        });
        card.addEventListener("mouseleave", function () {
          card.style.transform = "";
        });
      });
    }

    /* ------------------------------------------------------------------
       Back to top
    ------------------------------------------------------------------ */
    var backToTop = document.querySelector("[data-back-to-top]");
    if (backToTop) {
      window.addEventListener(
        "scroll",
        function () {
          backToTop.classList.toggle("is-visible", window.scrollY > 600);
        },
        { passive: true }
      );
      backToTop.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
      });
    }

    /* ------------------------------------------------------------------
       Chat widget (scripted quick-contact bubble, not a real AI)
    ------------------------------------------------------------------ */
    var chatWidget = document.querySelector("[data-chat-widget]");
    var chatToggle = document.querySelector("[data-chat-toggle]");
    var chatPanel = document.querySelector("[data-chat-panel]");
    var chatClose = document.querySelector("[data-chat-close]");

    if (chatWidget && chatToggle && chatPanel) {
      var openChat = function () {
        chatPanel.hidden = false;
        chatWidget.classList.add("is-open");
        chatToggle.setAttribute("aria-expanded", "true");
      };
      var closeChat = function () {
        chatPanel.hidden = true;
        chatWidget.classList.remove("is-open");
        chatToggle.setAttribute("aria-expanded", "false");
      };

      chatToggle.addEventListener("click", function () {
        if (chatPanel.hidden) {
          openChat();
        } else {
          closeChat();
        }
      });

      if (chatClose) {
        chatClose.addEventListener("click", closeChat);
      }

      chatPanel.querySelectorAll("[data-chat-option]").forEach(function (opt) {
        opt.addEventListener("click", closeChat);
      });

      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !chatPanel.hidden) {
          closeChat();
          chatToggle.focus();
        }
      });

      document.addEventListener("click", function (e) {
        if (!chatPanel.hidden && !chatWidget.contains(e.target)) {
          closeChat();
        }
      });
    }

    /* ------------------------------------------------------------------
       Giscus comments — injected via JS (rather than a static <script>
       tag) so the initial data-theme/data-lang match whatever the
       visitor already has set, with no flash of the wrong theme/lang.
    ------------------------------------------------------------------ */
    var giscusTarget = document.querySelector("[data-giscus-target]");
    if (giscusTarget) {
      var giscusScript = document.createElement("script");
      giscusScript.src = "https://giscus.app/client.js";
      giscusScript.setAttribute("data-repo", "vile-blog/vile-blog.github.io");
      giscusScript.setAttribute("data-repo-id", "R_kgDOUZ4cEg");
      giscusScript.setAttribute("data-category", "Announcements");
      giscusScript.setAttribute("data-category-id", "DIC_kwDOUZ4cEs4DFkFR");
      giscusScript.setAttribute("data-mapping", "pathname");
      giscusScript.setAttribute("data-strict", "0");
      giscusScript.setAttribute("data-reactions-enabled", "1");
      giscusScript.setAttribute("data-emit-metadata", "0");
      giscusScript.setAttribute("data-input-position", "top");
      giscusScript.setAttribute("data-theme", root.getAttribute("data-theme") === "light" ? "light" : "dark");
      giscusScript.setAttribute("data-lang", root.getAttribute("data-lang") === "vi" ? "vi" : "en");
      giscusScript.setAttribute("data-loading", "lazy");
      giscusScript.crossOrigin = "anonymous";
      giscusScript.async = true;
      giscusTarget.appendChild(giscusScript);
    }
  });
})();
