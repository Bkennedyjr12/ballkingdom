// The Ballers Kingdom — main.js
// Minimal progressive enhancement: nav toggle + active link + smooth scroll polish

(function () {
  'use strict';

  // Mobile nav toggle
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', links.classList.contains('open') ? 'true' : 'false');
    });
    // Close when a link is tapped (mobile)
    links.addEventListener('click', function (e) {
      if (e.target.tagName === 'A' && window.innerWidth < 860) {
        links.classList.remove('open');
      }
    });
  }

  // Mark current page as active
  var path = window.location.pathname.replace(/\/$/, '').split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(function (a) {
    var href = a.getAttribute('href');
    if (!href) return;
    var file = href.replace(/\/$/, '').split('/').pop() || 'index.html';
    if (file === path) a.classList.add('active');
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
})();
