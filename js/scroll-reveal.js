/* ============================================
   Hills of Glory — Global Scroll Reveal
   IntersectionObserver engine for [data-reveal] elements.

   Usage (any element, static or dynamically injected):
     data-reveal="up | down | left | right | scale | fade"   entry direction
     data-reveal-delay="120"                                 custom ms delay
     <div data-reveal-group data-reveal-interval="60">       parent: staggers
                                                             children in order

   New DOM (cards injected by main.js) is picked up automatically via
   MutationObserver — templates only need the data-reveal attribute.
   ============================================ */
(function () {
  'use strict';

  // No IntersectionObserver: ship static content, never hide anything.
  if (!('IntersectionObserver' in window)) return;

  // Gate hidden styles behind html.reveal-ready so users on reduced motion,
  // old browsers, or with JS disabled always see the full content (CLS-safe).
  var prefersReduced = function () {
    return window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  var STAGGER_CAP_MS = 360;
  var DEFAULT_INTERVAL_MS = 60;

  function boot() {
    document.documentElement.classList.add('reveal-ready');

    var registered = typeof WeakSet === 'function' ? new WeakSet() : null;
    var seen = []; // WeakSet fallback for very old engines

    function reveal(el) {
      io.unobserve(el);
      el.classList.add('is-revealed');
      // Release the GPU compositing hint once the entrance has finished.
      var delay = parseInt(el.style.getPropertyValue('--reveal-delay'), 10) || 0;
      setTimeout(function () {
        el.style.willChange = 'auto';
      }, 650 + delay);
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        reveal(entry.target);           // fire once; never re-animate
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });

    function isKnown(el) {
      if (registered) return registered.has(el);
      return seen.indexOf(el) !== -1;
    }

    function markKnown(el) {
      if (registered) registered.add(el);
      else seen.push(el);
    }

    // Cascade delay for a child of a [data-reveal-group] container.
    // Previously-revealed siblings and past cap-delayed siblings are skipped,
    // so each "Show More" batch cascades fresh instead of all firing at cap.
    function groupDelay(el) {
      var group = el.parentElement &&
        el.parentElement.closest('[data-reveal-group]');
      if (!group) return null;
      var interval = parseInt(group.getAttribute('data-reveal-interval'), 10);
      if (isNaN(interval) || interval < 30) interval = DEFAULT_INTERVAL_MS;
      var kids = [];
      for (var i = 0; i < group.children.length; i++) {
        var kid = group.children[i];
        if (kid === el || kid.hasAttribute('data-reveal')) kids.push(kid);
      }
      // Cascade position = count of not-yet-revealed siblings before this one.
      var slot = 0;
      for (var j = 0; j < kids.length; j++) {
        if (kids[j] === el) break;
        if (!kids[j].classList.contains('is-revealed')) slot++;
      }
      return Math.min(slot * interval, STAGGER_CAP_MS);
    }

    function register(el) {
      if (el.hasAttribute('data-reveal-done') || isKnown(el)) return;
      markKnown(el);
      el.setAttribute('data-reveal-done', '');

      // Reduced motion: reveal-ready is still set, but the CSS hidden state
      // is wrapped in prefers-reduced-motion: no-preference — mark revealed
      // for data consistency and let content stay statically visible.
      if (prefersReduced()) {
        el.classList.add('is-revealed');
        return;
      }

      var own = parseInt(el.getAttribute('data-reveal-delay'), 10);
      if (!isNaN(own)) {
        el.style.setProperty('--reveal-delay', own + 'ms');
      } else {
        var stagger = groupDelay(el);
        if (stagger) el.style.setProperty('--reveal-delay', stagger + 'ms');
      }
      io.observe(el);
    }

    function scan(root) {
      root = root || document;
      if (root.hasAttribute && root.hasAttribute('data-reveal')) register(root);
      if (root.querySelectorAll) {
        var list = root.querySelectorAll('[data-reveal]');
        for (var i = 0; i < list.length; i++) register(list[i]);
      }
    }

    // Auto-enlight dynamically injected content (Supabase-rendered cards).
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) scan(added[j]);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Public API: ScrollReveal.scan(container) after custom rendering,
    // or ScrollReveal.release(el) to reveal immediately (e.g. modals).
    window.ScrollReveal = {
      scan: scan,
      release: function (el) {
        if (el) reveal(el);
      }
    };

    scan(document);
  }

  if (document.body) {
    boot();
  } else {
    // Script loaded with defer/async or at document end.
    document.addEventListener('DOMContentLoaded', boot);
  }
})();
