import {EXERCISES} from './workouts-exercises.js';
export const VIDEO_CATALOG=Object.freeze([
  {
    "videoId": "rvpC9QkTc3Y",
    "title": "Chair Squat Exercise",
    "provider": "Margaret Martin, Physical Therapist",
    "verification": "YouTube oEmbed metadata verified; playback not verified",
    "verifiedOn": "2026-10-05",
    "exerciseId": "chairSquat",
    "url": "https://www.youtube.com/watch?v=rvpC9QkTc3Y",
    "status": "metadataVerified",
    "playbackVerified": false
  },
  {
    "videoId": "0JUrOH--Kdk",
    "title": "How to do an Incline Push-Up | Proper Form & Technique | NASM",
    "provider": "National Academy of Sports Medicine (NASM)",
    "verification": "YouTube oEmbed metadata verified; playback not verified",
    "verifiedOn": "2026-10-05",
    "exerciseId": "inclinePushup",
    "url": "https://www.youtube.com/watch?v=0JUrOH--Kdk",
    "status": "metadataVerified",
    "playbackVerified": false
  },
  {
    "videoId": "lIRpibTFB9I",
    "title": "Wall Push Up Exercise for Beginners",
    "provider": "Margaret Martin, Physical Therapist",
    "verification": "YouTube oEmbed metadata verified; playback not verified",
    "verifiedOn": "2026-10-05",
    "exerciseId": "wallPushup",
    "url": "https://www.youtube.com/watch?v=lIRpibTFB9I",
    "status": "metadataVerified",
    "playbackVerified": false
  },
  {
    "videoId": "IOy2k0Cb6Vo",
    "title": "Single-Arm Dumbbell Row | Olympic Weightlifting Exercise Library",
    "provider": "Catalyst Athletics",
    "verification": "YouTube oEmbed metadata verified; playback not verified",
    "verifiedOn": "2026-10-05",
    "exerciseId": "supportedDbRow",
    "url": "https://www.youtube.com/watch?v=IOy2k0Cb6Vo",
    "status": "variantUnconfirmed",
    "playbackVerified": false
  },
  {
    "videoId": "ytvP0oUDKYw",
    "title": "Bridging - Ask Doctor Jo",
    "provider": "AskDoctorJo",
    "verification": "YouTube oEmbed metadata verified; playback not verified",
    "verifiedOn": "2026-10-05",
    "exerciseId": "gluteBridge",
    "url": "https://www.youtube.com/watch?v=ytvP0oUDKYw",
    "status": "variantUnconfirmed",
    "playbackVerified": false
  },
  {
    "videoId": "WFleuQ6dE7A",
    "title": "Lumbar - Spinal Stabilization Dead Bug Beginner",
    "provider": "Physical Therapy First",
    "verification": "YouTube oEmbed metadata verified; playback not verified",
    "verifiedOn": "2026-10-05",
    "exerciseId": "deadBug",
    "url": "https://www.youtube.com/watch?v=WFleuQ6dE7A",
    "status": "variantUnconfirmed",
    "playbackVerified": false
  },
  {
    "videoId": "hQgFixeXdZo",
    "title": "Dumbbell Romanian (RDL) Deadlift |TECHNIQUE for Beginners",
    "provider": "Mike | J2FIT Strength & Conditioning",
    "verification": "YouTube oEmbed metadata verified; playback not verified",
    "verifiedOn": "2026-10-05",
    "exerciseId": "dbHinge",
    "url": "https://www.youtube.com/watch?v=hQgFixeXdZo",
    "status": "metadataVerified",
    "playbackVerified": false
  },
  {
    "videoId": "tNr12uuQ1Fw",
    "title": "Supported Split Squat",
    "provider": "Zac Cupples",
    "verification": "YouTube oEmbed metadata verified; playback not verified",
    "verifiedOn": "2026-10-05",
    "exerciseId": "supportedSplitSquat",
    "url": "https://www.youtube.com/watch?v=tNr12uuQ1Fw",
    "status": "metadataVerified",
    "playbackVerified": false
  },
  {
    "videoId": "T0Y3OBF1bNI",
    "title": "How To Do A Dumbbell Floor Press",
    "provider": "PureGym",
    "verification": "YouTube oEmbed metadata verified; playback not verified",
    "verifiedOn": "2026-10-05",
    "exerciseId": "dbFloorPress",
    "url": "https://www.youtube.com/watch?v=T0Y3OBF1bNI",
    "status": "metadataVerified",
    "playbackVerified": false
  },
  {
    "videoId": "ZdAHe9_HeEw",
    "title": "How to do a Bird Dog | Proper Form & Technique | NASM",
    "provider": "National Academy of Sports Medicine (NASM)",
    "verification": "YouTube oEmbed metadata verified; playback not verified",
    "verifiedOn": "2026-10-05",
    "exerciseId": "birdDog",
    "url": "https://www.youtube.com/watch?v=ZdAHe9_HeEw",
    "status": "metadataVerified",
    "playbackVerified": false
  }
]);
export function videoFor(id,variant,difficulty,catalog=VIDEO_CATALOG){const exercise=EXERCISES[id];if(!exercise||exercise.variant!==variant||exercise.difficulty!==difficulty)return null;const video=catalog.find(v=>v.exerciseId===id&&v.status==='metadataVerified');if(!video||!/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(video.url))return null;return video;}
