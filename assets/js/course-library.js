/* No video-host connection until the learner explicitly loads the welcome player. */
(() => {
  'use strict';
  const approvedMedia = 'https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/brian-course-welcome-natural-v4.mp4';
  document.querySelectorAll('[data-load-video]').forEach(button => {
    button.addEventListener('click', () => {
      const host = button.closest('[data-media-url]');
      if (!host || host.dataset.mediaUrl !== approvedMedia) return;
      const video = document.createElement('video');
      video.controls = true; video.autoplay = false; video.playsInline = true; video.preload = 'metadata';
      video.setAttribute('aria-label', 'Brian Kennedy Jr. — authorized AI avatar welcome with approved natural voice');
      video.src = approvedMedia;
      const captions = document.createElement('track'); captions.kind = 'captions'; captions.srclang = 'en'; captions.label = 'English'; captions.src = '/assets/captions/brian-course-welcome.vtt'; captions.default = true;
      video.append(captions); host.replaceChildren(video); video.focus();
    }, {once:true});
  });
})();
