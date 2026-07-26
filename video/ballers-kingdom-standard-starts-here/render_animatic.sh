#!/usr/bin/env bash
# Render the no-cost, local-only review animatic. This renderer never calls a
# provider, browser, credential store, uploader, or voice-generation service.

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
package_dir="$project_root/video/ballers-kingdom-standard-starts-here"
frames_dir="$package_dir/.review-graphics"
master="$package_dir/standard-starts-here-animatic.mp4"
thumbnail="$package_dir/standard-starts-here-animatic-thumb.png"

python3 "$package_dir/package_contract_test.py"
node "$package_dir/render_animatic_graphics.mjs" "$frames_dir"

# The audio is original deterministic synthesis: a non-vocal pulse and seeded
# pink-noise field air. It stays audible through the CTA, then fades 43.5–45s.
ffmpeg -hide_banner -y \
  -loop 1 -framerate 24 -t 8 -i "$frames_dir/scene-1.png" \
  -loop 1 -framerate 24 -t 9 -i "$frames_dir/scene-2.png" \
  -loop 1 -framerate 24 -t 9 -i "$frames_dir/scene-3.png" \
  -loop 1 -framerate 24 -t 10 -i "$frames_dir/scene-4.png" \
  -loop 1 -framerate 24 -t 9 -i "$frames_dir/scene-5.png" \
  -f lavfi -i 'aevalsrc=0.040*sin(2*PI*53*t)+0.020*sin(2*PI*106*t)+0.009*sin(2*PI*318*t)*pow(sin(2*PI*1.5*t)\,8):s=48000:d=45' \
  -f lavfi -i 'anoisesrc=color=pink:amplitude=0.10:seed=60126:r=48000:d=45' \
  -filter_complex "
    [0:v]fps=24,trim=duration=8,setpts=PTS-STARTPTS[s1];
    [1:v]fps=24,trim=duration=9,setpts=PTS-STARTPTS[s2];
    [2:v]fps=24,trim=duration=9,setpts=PTS-STARTPTS[s3];
    [3:v]fps=24,trim=duration=10,setpts=PTS-STARTPTS[s4];
    [4:v]fps=24,trim=duration=9,setpts=PTS-STARTPTS[s5];
    [s1][s2][s3][s4][s5]concat=n=5:v=1:a=0,format=yuv420p[v];
    [5:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.72[pulse];
    [6:a]highpass=f=180,lowpass=f=3200,aformat=sample_rates=48000:channel_layouts=stereo,volume=0.13[air];
    [pulse][air]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.88,afade=t=out:st=43.5:d=1.5[a]
  " \
  -map '[v]' -map '[a]' \
  -c:v libx264 -pix_fmt yuv420p -r 24 -movflags +faststart \
  -c:a aac -b:a 192k \
  "$master"

ffmpeg -hide_banner -y -ss 00:00:40 -i "$master" -frames:v 1 -update 1 "$thumbnail"
printf 'Rendered local-only animatic (not a public or final master):\n%s\n%s\n' "$master" "$thumbnail"
