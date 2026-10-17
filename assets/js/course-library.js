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
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/ai-weekend-study-guide-resource-intro.mp4",
    "/assets/captions/ai-weekend-study-guide-resource-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/ball-mastery-lab-resource-intro.mp4",
    "/assets/captions/ball-mastery-lab-resource-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/car-ride-resource-intro.mp4",
    "/assets/captions/car-ride-resource-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/career-direction-action-toolkit-resource-intro.mp4",
    "/assets/captions/career-direction-action-toolkit-resource-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/college-by-design-resource-intro.mp4",
    "/assets/captions/college-by-design-resource-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/digital-operating-plan-resource-intro.mp4",
    "/assets/captions/digital-operating-plan-resource-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/earn-your-voice-resource-intro.mp4",
    "/assets/captions/earn-your-voice-resource-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/matchday-body-resource-intro.mp4",
    "/assets/captions/matchday-body-resource-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/next-play-resource-intro.mp4",
    "/assets/captions/next-play-resource-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/own-your-semester-resource-intro.mp4",
    "/assets/captions/own-your-semester-resource-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/recruiting-resource-intro.mp4",
    "/assets/captions/recruiting-resource-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/scorecard-resource-intro.mp4",
    "/assets/captions/scorecard-resource-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/train-develop-serve-lead-resource-intro.mp4",
    "/assets/captions/train-develop-serve-lead-resource-intro.vtt"
  ],
  [
    "https://storage.googleapis.com/the-ballers-kingdom.firebasestorage.app/course-media/batch-20261017/your-next-season-resource-intro.mp4",
    "/assets/captions/your-next-season-resource-intro.vtt"
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
