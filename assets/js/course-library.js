/* No provider connection until the visitor explicitly loads the welcome player. */
(() => {
  'use strict';
  document.querySelectorAll('[data-load-video]').forEach(button => {
    button.addEventListener('click', () => {
      const host = button.closest('[data-video-id]');
      if (!host || host.dataset.videoId !== 'r1qIDsBBbqw') return;
      const frame = document.createElement('iframe');
      frame.src = 'https://www.youtube-nocookie.com/embed/r1qIDsBBbqw?autoplay=0&rel=0&cc_load_policy=1';
      frame.title = 'Brian Kennedy Jr. — The Ballers Kingdom authorized AI avatar welcome';
      frame.allow = 'encrypted-media; picture-in-picture';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      host.replaceChildren(frame);
      frame.focus();
    }, {once: true});
  });
})();
