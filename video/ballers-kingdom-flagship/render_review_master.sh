#!/usr/bin/env bash
# Local-only review-master renderer for the locked Ballers Kingdom package.
# It deliberately uses original abstract soccer-tactics graphics and a synthesized
# instrumental bed because this worktree has no approved soccer footage or voice
# talent. All human-readable language is verified post-composited SVG text.

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
output_dir="$project_root/video/ballers-kingdom-flagship"
frames_dir="$output_dir/.review-graphics"
master="$output_dir/ballers-kingdom-flagship-review.mp4"
thumbnail="$output_dir/ballers-kingdom-flagship-thumb.png"

mkdir -p "$output_dir"
node "$output_dir/render_review_graphics.mjs" "$frames_dir"

ffmpeg -hide_banner -y \
  -loop 1 -framerate 24 -t 8 -i "$frames_dir/scene-1.png" \
  -loop 1 -framerate 24 -t 8 -i "$frames_dir/scene-2.png" \
  -loop 1 -framerate 24 -t 11 -i "$frames_dir/scene-3.png" \
  -loop 1 -framerate 24 -t 8 -i "$frames_dir/scene-4.png" \
  -loop 1 -framerate 24 -t 7 -i "$frames_dir/scene-5.png" \
  -f lavfi -i "aevalsrc=0.035*sin(2*PI*55*t)+0.018*sin(2*PI*110*t)+0.012*sin(2*PI*440*t)*pow(sin(2*PI*1.5*t)\,8):s=48000:d=42" \
  -filter_complex "
    [0:v]zoompan=z='min(zoom+0.00022,1.04)':d=1:s=1280x720:fps=24,trim=duration=8,setpts=PTS-STARTPTS[s1];
    [1:v]zoompan=z='min(zoom+0.00022,1.04)':d=1:s=1280x720:fps=24,trim=duration=8,setpts=PTS-STARTPTS[s2];
    [2:v]zoompan=z='min(zoom+0.00022,1.04)':d=1:s=1280x720:fps=24,trim=duration=11,setpts=PTS-STARTPTS[s3];
    [3:v]zoompan=z='min(zoom+0.00022,1.04)':d=1:s=1280x720:fps=24,trim=duration=8,setpts=PTS-STARTPTS[s4];
    [4:v]zoompan=z='min(zoom+0.00022,1.04)':d=1:s=1280x720:fps=24,trim=duration=7,setpts=PTS-STARTPTS[s5];
    [s1][s2][s3][s4][s5]concat=n=5:v=1:a=0,format=yuv420p[v];
    [5:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.80,afade=t=out:st=41.2:d=0.8[a]
  " \
  -map '[v]' -map '[a]' \
  -c:v libx264 -pix_fmt yuv420p -r 24 -movflags +faststart \
  -c:a aac -b:a 192k \
  "$master"

ffmpeg -hide_banner -y -ss 00:00:38 -i "$master" -frames:v 1 -update 1 "$thumbnail"

printf 'Rendered local review artifacts:\n%s\n%s\n' "$master" "$thumbnail"
