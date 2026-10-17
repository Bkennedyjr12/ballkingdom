/* No video-host connection until the learner explicitly loads the welcome player. */
(() => {
  'use strict';
  const approvedMedia = 'https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/brian-course-welcome-natural-v4.mp4';
  const courseIntro = 'https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/education-by-design-introduction-v1.mp4';
  const captionSources = new Map([[approvedMedia, '/assets/captions/brian-course-welcome.vtt'], [courseIntro, '/assets/captions/education-by-design-intro.vtt']]);
  document.querySelectorAll('[data-load-video]').forEach(button => {
    button.addEventListener('click', () => {
      const host = button.closest('[data-media-url]');
      if (!host || !captionSources.has(host.dataset.mediaUrl)) return;
      const video = document.createElement('video');
      video.controls = true; video.autoplay = false; video.playsInline = true; video.preload = 'metadata';
      video.setAttribute('aria-label', 'Brian Kennedy Jr. — authorized AI avatar introduction with approved natural voice');
      video.src = host.dataset.mediaUrl;
      const captions = document.createElement('track'); captions.kind = 'captions'; captions.srclang = 'en'; captions.label = 'English'; captions.src = captionSources.get(host.dataset.mediaUrl); captions.default = true;
      video.append(captions); host.replaceChildren(video); video.focus();
    }, {once:true});
  });
})();
