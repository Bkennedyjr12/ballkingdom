// The Ballers Kingdom — main.js
// Minimal progressive enhancement: nav toggle + active link + smooth scroll polish

(function () {
  'use strict';

  document.documentElement.classList.add('js');

  // Keep static navigation usable without JavaScript; enhance its mobile state.
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  function closeMenu() {
    if (!links || !toggle) return;
    links.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
  }
  if (toggle && links) {
    links.id = links.id || 'primary-navigation';
    toggle.setAttribute('aria-controls', links.id);
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && links.classList.contains('open')) {
        closeMenu();
        toggle.focus();
      }
    });
    window.matchMedia('(min-width: 1101px)').addEventListener('change', closeMenu);
  }

  function pagePath(value) {
    return new URL(value, window.location.href).pathname.replace(/index\.html$/, '').replace(/\.html$/, '').replace(/\/$/, '') || '/';
  }
  var path = pagePath(window.location.href);
  var tools = ['/your-game', '/growth', '/readiness', '/credit-health', '/ai-readiness', '/ai-assessment', '/audit', '/agent-city', '/ecosystem-city', '/blog', '/news'];
  document.querySelectorAll('.nav-links a').forEach(function (a) {
    var current = pagePath(a.href);
    var active = current === path || (current === '/tools' && tools.some(function (tool) { return path === tool || path.indexOf(tool + '/') === 0; })) || (current === '/ee-venture' && path === '/technology');
    a.classList.toggle('active', active);
    if (current === path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  // Reveal on scroll
  if ('IntersectionObserver' in window) {
    var reveal = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          reveal.unobserve(e.target);
        }
      });
    }, { threshold: 0.14 });
    document.querySelectorAll('[data-reveal]').forEach(function (el) { reveal.observe(el); });
  } else {
    document.querySelectorAll('[data-reveal]').forEach(function (el) { el.classList.add('is-visible'); });
  }
  window.setTimeout(function () {
    document.querySelectorAll('[data-reveal]').forEach(function (el) { el.classList.add('is-visible'); });
  }, 1200);
})();
