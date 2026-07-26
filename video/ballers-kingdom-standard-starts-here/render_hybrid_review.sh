#!/usr/bin/env bash
# Local-only hybrid review master: clean coach anchor plus licensed soccer cutaways.
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
package_dir="$project_root/video/ballers-kingdom-standard-starts-here"
stock_dir="$package_dir/stock"
output_dir="$package_dir/final-review"
overlay_dir="$output_dir/overlays"
master="$output_dir/ballers-kingdom-the-standard-starts-here-review.mp4"
thumb="$output_dir/ballers-kingdom-the-standard-starts-here-thumb.jpg"
anchor="$project_root/assets/img/brian_coach_clean_anchor_v2.png"

[[ -f "$anchor" && -f "$stock_dir/pexels-6084027.mp4" && -f "$stock_dir/pexels-7187047.mp4" && -f "$stock_dir/pexels-18450900.mp4" ]] || {
  echo 'Missing approved anchor or licensed source footage.' >&2; exit 2;
}
mkdir -p "$output_dir"
node "$package_dir/render_hybrid_graphics.mjs" "$overlay_dir"

ffmpeg -hide_banner -y \
  -loop 1 -framerate 24 -t 4 -i "$anchor" \
  -ss 2.0 -t 4 -i "$stock_dir/pexels-6077711.mp4" \
  -ss 1.3 -t 8 -i "$stock_dir/pexels-6084027.mp4" \
  -t 7 -i "$stock_dir/pexels-7187047.mp4" \
  -loop 1 -framerate 24 -t 8 -i "$anchor" \
  -ss 5.2 -t 8 -i "$stock_dir/pexels-6077711.mp4" \
  -f lavfi -t 5 -i 'color=c=0x071013:s=1280x720:r=24' \
  -loop 1 -framerate 24 -t 4 -i "$overlay_dir/overlay-1.png" \
  -loop 1 -framerate 24 -t 4 -i "$overlay_dir/overlay-2.png" \
  -loop 1 -framerate 24 -t 8 -i "$overlay_dir/overlay-3.png" \
  -loop 1 -framerate 24 -t 8 -i "$overlay_dir/overlay-4.png" \
  -loop 1 -framerate 24 -t 8 -i "$overlay_dir/overlay-5.png" \
  -loop 1 -framerate 24 -t 8 -i "$overlay_dir/overlay-6.png" \
  -loop 1 -framerate 24 -t 5 -i "$overlay_dir/overlay-7.png" \
  -f lavfi -i 'aevalsrc=0.040*sin(2*PI*53*t)+0.020*sin(2*PI*106*t)+0.009*sin(2*PI*318*t)*pow(sin(2*PI*1.5*t)\,8):s=48000:d=45' \
  -f lavfi -i 'anoisesrc=color=pink:amplitude=0.08:seed=60126:r=48000:d=45' \
  -filter_complex '
    [0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,eq=contrast=1.04:saturation=0.90:brightness=-0.02[base0];[base0][7:v]overlay=shortest=1,trim=duration=4,setpts=PTS-STARTPTS[v0];
    [1:v]crop=iw:ih*0.72:0:ih*0.28,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,eq=contrast=1.08:saturation=0.76:brightness=-0.04[base1];[base1][8:v]overlay=shortest=1,trim=duration=4,setpts=PTS-STARTPTS[v1];
    [2:v]crop=iw:ih*0.65:0:ih*0.35,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,eq=contrast=1.10:saturation=0.70:brightness=-0.03[base2];[base2][9:v]overlay=shortest=1,trim=duration=8,setpts=PTS-STARTPTS[v2];
    [3:v]crop=iw:ih*0.58:0:ih*0.42,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,eq=contrast=1.10:saturation=0.72:brightness=-0.02,tpad=stop_mode=clone:stop_duration=1[base3];[base3][10:v]overlay=shortest=1,trim=duration=8,setpts=PTS-STARTPTS[v3];
    [4:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,eq=contrast=1.05:saturation=0.88:brightness=-0.03,zoompan=z=min(1+0.00015*on\,1.035):x=(iw-iw/zoom)*0.65:y=(ih-ih/zoom)*0.45:d=1:s=1280x720:fps=24[base4];[base4][11:v]overlay=shortest=1,trim=duration=8,setpts=PTS-STARTPTS[v4];
    [5:v]crop=iw:ih*0.72:0:ih*0.28,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,eq=contrast=1.08:saturation=0.74:brightness=-0.05[base5];[base5][12:v]overlay=shortest=1,trim=duration=8,setpts=PTS-STARTPTS[v5];
    [6:v][13:v]overlay=shortest=1,trim=duration=5,setpts=PTS-STARTPTS[v6];
    [v0][v1][v2][v3][v4][v5][v6]concat=n=7:v=1:a=0,format=yuv420p[v];
    [14:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.68[pulse];
    [15:a]highpass=f=180,lowpass=f=3200,aformat=sample_rates=48000:channel_layouts=stereo,volume=0.12[air];
    [pulse][air]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.88,afade=t=out:st=43.5:d=1.5[a]
  ' \
  -map '[v]' -map '[a]' -c:v libx264 -pix_fmt yuv420p -r 24 -movflags +faststart \
  -c:a aac -b:a 192k "$master"

ffmpeg -hide_banner -y -ss 00:00:40 -i "$master" -frames:v 1 -update 1 "$thumb"
printf 'Rendered local-only hybrid review master (not uploaded):\n%s\n%s\n' "$master" "$thumb"
