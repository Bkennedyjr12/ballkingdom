/* Explicit click-to-load, exact approved introduction allowlist, no autoplay. */
(() => {
 'use strict';
 const captionSources = new Map([
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/brian-course-welcome-natural-v4.mp4",
    "/assets/captions/brian-course-welcome.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/ai-implementation-intro.mp4",
    "/assets/captions/ai-implementation-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/cradle-to-legacy-intro.mp4",
    "/assets/captions/cradle-to-legacy-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/evidence-portfolio-intro.mp4",
    "/assets/captions/evidence-portfolio-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/first-customer-experiment-intro.mp4",
    "/assets/captions/first-customer-experiment-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/guiding-people-through-change-intro.mp4",
    "/assets/captions/guiding-people-through-change-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/institutional-facilitation-intro.mp4",
    "/assets/captions/institutional-facilitation-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/relationships-and-opportunity-intro.mp4",
    "/assets/captions/relationships-and-opportunity-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/education-by-design-introduction-v1.mp4",
    "/assets/captions/education-by-design-intro.vtt"
  ]
]);
 document.querySelectorAll('[data-load-video]').forEach(button => {
  button.addEventListener('click', () => {
   const host=button.closest('[data-media-url]');
   if(!host || !captionSources.has(host.dataset.mediaUrl)) return;
   const video=document.createElement('video');
   video.controls=true; video.autoplay = false; video.playsInline=true; video.preload='metadata';
   video.setAttribute('aria-label','Brian Kennedy Jr. — authorized AI avatar introduction and approved natural voice');
   video.src=host.dataset.mediaUrl;
   const captions=document.createElement('track'); captions.kind='captions';captions.srclang='en';captions.label='English';captions.src=captionSources.get(host.dataset.mediaUrl);captions.default=true;
   video.append(captions);host.replaceChildren(video);video.focus();
  }, {once:true});
 });
})();
